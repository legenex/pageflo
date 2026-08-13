/**
 * What every landing-page deployment runs, and whether it still runs anything.
 *
 *   pnpm reconcile:lp-quiz              # report only. Reads. Writes nothing.
 *   pnpm reconcile:lp-quiz -- --json    # the same verdicts, machine-readable
 *   pnpm reconcile:lp-quiz -- --apply   # migrate ONLY the rows it can migrate losslessly
 *
 * WHY THIS EXISTS. A landing-page deployment used to embed a quiz by naming a
 * STANDALONE QUIZ DEPLOYMENT through a bare text id with no foreign key behind
 * it. Deleting that page left the pointer dangling. Production inspection found
 * **three of four live LP deployments pointing at quiz deployments that no
 * longer existed** — the rows looked bound, the pages rendered, and the funnels
 * were gone.
 *
 * The judgement lives in `src/lib/lp-quiz-binding.ts`, not here, so it is the
 * same judgement the admin list and the publish preflight make and it can be
 * tested against fixtures for states that only exist in production. This file
 * is the database work and the report.
 *
 * WHAT `--apply` WILL NOT DO. It never invents a binding: a row whose pointer is
 * dangling, cross-tenant, or absent is reported and left alone, because
 * choosing what such a page should run is a decision. It also refuses any row
 * whose standalone deployment carries destination overrides, header/footer
 * configuration, body-section overrides, UTM or pixel configuration — a landing
 * page cannot carry those, so migrating would silently change where the leads
 * go.
 *
 * Ordering is by deployment id throughout, so two runs against an unchanged
 * database produce identical output and a diff means something changed.
 *
 * EXIT CODE: non-zero when any row needs a person. A report that always exits 0
 * is a report a release script cannot gate on.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  classifyLpQuizBinding,
  relationIdOf,
  NEEDS_A_DECISION,
  type LpQuizBinding,
} from '../src/lib/lp-quiz-binding.ts'

type Row = LpQuizBinding & {
  id: string
  name: string
  siteId: string
  path: string
  status: string
  quizId: string
  legacyId: string
}

const apply = process.argv.includes('--apply')
const asJson = process.argv.includes('--json')

const payload = await getPayload({ config })

const deps = await payload.find({
  collection: 'funnel-lp-deployments',
  limit: 5000,
  depth: 0,
  overrideAccess: true,
  sort: 'id',
})

// One read of every standalone deployment the pointers name, rather than a
// findByID per row: a report that takes N queries against a thousand rows is a
// report nobody runs on production.
const legacyIds = Array.from(
  new Set(deps.docs.map((d) => String(d.quiz_deployment_id ?? '')).filter((s) => s !== '')),
)
const quizDeps = legacyIds.length
  ? await payload.find({
      collection: 'funnel-quiz-deployments',
      where: { id: { in: legacyIds } },
      limit: legacyIds.length,
      depth: 0,
      overrideAccess: true,
    })
  : { docs: [] as Array<Record<string, unknown>> }
const byId = new Map(quizDeps.docs.map((d) => [String(d.id), d as Record<string, unknown>]))

const rows: Row[] = deps.docs.map((d) => {
  const record = d as unknown as Record<string, unknown>
  const legacyId = String(record.quiz_deployment_id ?? '')
  const verdict = classifyLpQuizBinding(record, legacyId ? byId.get(legacyId) ?? null : null)
  return {
    ...verdict,
    id: String(record.id),
    name: String(record.name ?? ''),
    siteId: relationIdOf(record.site),
    path: String(record.path ?? ''),
    status: String(record.status ?? 'draft'),
    quizId: relationIdOf(record.quiz),
    legacyId,
  }
})

const counts = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.verdict] = (acc[r.verdict] ?? 0) + 1
  return acc
}, {})

const applied: string[] = []

if (apply) {
  for (const r of rows) {
    if (!r.migration) continue
    // A flow id that is not a number would be written as NaN, which postgres
    // takes as null - silently UNBINDING the page this migration exists to
    // keep working. Refused rather than written.
    const quizId = Number(r.migration.quiz)
    if (!Number.isInteger(quizId) || quizId <= 0) {
      console.log(`  ${r.id}  SKIPPED: "${r.migration.quiz}" is not a flow id`)
      continue
    }
    await payload.update({
      collection: 'funnel-lp-deployments',
      id: r.id,
      data: {
        quiz: quizId,
        embedded_quiz_template_id: r.migration.embedded_quiz_template_id,
        embedded_progress_form: r.migration.embedded_progress_form,
        // Cleared last and only here. While it is a row's only binding it is
        // the thing keeping that page working.
        quiz_deployment_id: '',
      } as never,
      overrideAccess: true,
    })
    applied.push(r.id)
  }
}

if (asJson) {
  console.log(JSON.stringify({ counts, rows, applied }, null, 2))
} else {
  console.log(`${rows.length} landing-page deployment${rows.length === 1 ? '' : 's'}\n`)
  for (const r of rows) {
    console.log(`  ${r.id.padStart(5)}  ${r.verdict.padEnd(22)} site ${r.siteId.padEnd(4)} ${r.status.padEnd(6)} ${r.path}`)
    console.log(`         ${r.detail}`)
  }
  console.log('')
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${String(v).padStart(4)}  ${k}`)
  if (apply) console.log(`\napplied ${applied.length} lossless migration${applied.length === 1 ? '' : 's'}: ${applied.join(', ') || 'none'}`)
}

const needsHuman = rows.filter((r) => NEEDS_A_DECISION.has(r.verdict))
if (needsHuman.length > 0) {
  if (!asJson) console.log(`\n${needsHuman.length} row(s) need a decision this tool cannot make.`)
  process.exit(1)
}
process.exit(0)
