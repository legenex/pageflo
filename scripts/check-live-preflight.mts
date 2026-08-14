/**
 * Would everything that is LIVE right now survive being published again?
 *
 *   pnpm check:live-preflight            # report. Reads. Writes nothing.
 *   pnpm check:live-preflight -- --all   # drafts and paused rows too
 *   pnpm check:live-preflight -- --json  # the same verdicts, machine-readable
 *
 * WHY THIS EXISTS. `decideTransition` gates the way UP and never the way down,
 * which is right — something live that fails a check is exactly what an operator
 * most urgently needs to take offline. The consequence is that a preflight which
 * is WRONG about a live deployment turns unpublishing into a one-way door: the
 * row goes down on demand and then refuses to come back.
 *
 * That happened. `checkBrand` read `brand_identity.defaultDisclaimer` while the
 * Brand Identity editor writes `brand_identity.legal.defaultDisclaimer`, and
 * `checkConsent` scanned only `quiz.nodes` while the consent line the visitor
 * reads comes from the brand's TCPA text. Every live deployment on the platform
 * failed both, and nothing surfaced it because nobody re-publishes something
 * that is already serving.
 *
 * So this is the standing answer to "is that still true". It runs the SAME
 * `quizDeploymentPreflight` / `lpDeploymentPreflight` the publish actions run,
 * loading each record exactly the way `publish-actions.ts` loads it — a report
 * that assembled its inputs differently would be answering a different question.
 * The single exception is the CALLER, which a script does not have; see the note
 * on the super-admin lookup below.
 *
 * WRITES NOTHING. There is no `--apply` and there must never be one: a preflight
 * verdict is a reason for a person to act, not an instruction to change a live
 * deployment's status.
 *
 * EXIT CODE: non-zero when any LIVE deployment would fail to re-publish, so a
 * release script can gate on it. Drafts included by `--all` are reported but
 * never affect the exit code — a draft that does not pass yet is normal.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import type { AuthedUser } from '../src/lib/auth.ts'
import { relationId } from '../src/lib/relation-id.ts'
import {
  lpDeploymentPreflight,
  quizDeploymentPreflight,
} from '../src/lib/publish-lifecycle.ts'
import type { PreflightResult } from '../src/lib/publish-preflight.ts'

const asJson = process.argv.includes('--json')
const includeAll = process.argv.includes('--all')

type Row = {
  kind: 'quiz' | 'lp'
  id: string
  name: string
  siteId: string
  siteName: string
  path: string
  status: string
  ok: boolean
  blocking: Array<{ id: string; label: string; detail: string }>
  warnings: Array<{ id: string; label: string; detail: string }>
  checks: number
}

const payload = await getPayload({ config })

/** The same read `publish-actions.ts` performs, so the inputs match the action's. */
const load = async (collection: string, id: unknown): Promise<Record<string, unknown> | null> => {
  const n = relationId(id)
  if (n === null) return null
  return (await payload
    .findByID({ collection: collection as never, id: n, depth: 0, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null
}

/*
 * The ONE input that is deliberately not the action's.
 *
 * `setQuizDeploymentStatus` runs as whoever is signed in; a script has nobody.
 * Authorization is also the first check the preflight runs and a failure there
 * hides every check after it, which would make this report say nothing useful.
 * So it runs as a REAL super admin read from the database — never a fabricated
 * one — and names them in the output, so a reader knows the `authz` line was
 * satisfied by the runner and not by the row. Every other check is unaffected by
 * who asks. With no super admin on the platform there is nobody who could
 * publish these rows at all, and that is worth refusing to paper over.
 */
const admins = await payload
  .find({ collection: 'users', where: { super_admin: { equals: true } }, limit: 1, depth: 0, overrideAccess: true })
  .catch(() => ({ docs: [] as unknown[] }))
const admin = (admins.docs[0] ?? null) as unknown as Record<string, unknown> | null
if (!admin) {
  console.error('no super-admin user exists, so no caller could publish any of these rows. Nothing to report.')
  process.exit(2)
}
const user = admin as unknown as AuthedUser

/** Which rows to report on. Live only by default — those are the one-way doors. */
const wanted = includeAll ? {} : { status: { equals: 'live' } }

/**
 * Read a deployment table, or say why there is nothing to report.
 *
 * No committed migration creates the six `funnel_*` tables (CLAUDE.md, F001), so
 * on a host that never ran a dev schema push this throws. An unhandled rejection
 * there reads as "the report is broken"; the truth is "there are no deployments
 * on this database", and a release script needs to be able to tell those apart.
 */
const findDeployments = async (collection: string): Promise<Array<Record<string, unknown>>> => {
  try {
    const res = await payload.find({
      collection: collection as never,
      where: wanted as never,
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      sort: 'id',
    })
    return res.docs as unknown as Array<Record<string, unknown>>
  } catch (err) {
    console.error(`could not read ${collection}: ${err instanceof Error ? err.message : String(err)}`)
    console.error('If the table does not exist, this database has never had funnel deployments on it.')
    process.exit(2)
  }
}

const summary = (
  kind: Row['kind'],
  row: Record<string, unknown>,
  r: PreflightResult,
  site: string,
): Row => ({
  kind,
  id: String(row.id ?? ''),
  name: String(row.name ?? ''),
  siteId: String(relationId(row.site) ?? ''),
  siteName: site,
  path: String(row.path ?? ''),
  status: String(row.status ?? 'draft'),
  ok: r.ok,
  blocking: r.blocking.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
  warnings: r.warnings.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
  checks: r.checks.length,
})

const rows: Row[] = []

/* ------------------------------------------------------------ quiz deployments */

for (const raw of await findDeployments('funnel-quiz-deployments')) {
  const siteId = relationId(raw.site)
  const [quiz, site, domain] = await Promise.all([
    load('funnel-quizzes', raw.quiz),
    load('sites', siteId),
    raw.domain ? load('domains', raw.domain) : Promise.resolve(null),
  ])
  const r = await quizDeploymentPreflight({ payload, user, siteId }, { deployment: raw, quiz, site, domain })
  rows.push(summary('quiz', raw, r, String(site?.name ?? '')))
}

/* -------------------------------------------------- landing-page deployments */

for (const raw of await findDeployments('funnel-lp-deployments')) {
  const siteId = relationId(raw.site)
  const legacyId = typeof raw.quiz_deployment_id === 'string' ? raw.quiz_deployment_id : ''
  const [landingPage, site, domain, quizDeployment] = await Promise.all([
    load('funnel-landing-pages', raw.landing_page),
    load('sites', siteId),
    raw.domain ? load('domains', raw.domain) : Promise.resolve(null),
    legacyId ? load('funnel-quiz-deployments', legacyId) : Promise.resolve(null),
  ])
  // Own flow first, legacy pointer second — the resolver's order, and the one
  // `setLpDeploymentStatus` uses.
  const ownQuizId = relationId(raw.quiz)
  const quiz = ownQuizId !== null
    ? await load('funnel-quizzes', ownQuizId)
    : quizDeployment
      ? await load('funnel-quizzes', quizDeployment.quiz)
      : null

  const r = await lpDeploymentPreflight(
    { payload, user, siteId },
    { deployment: raw, landingPage, site, domain, quizDeployment, quiz },
  )
  rows.push(summary('lp', raw, r, String(site?.name ?? '')))
}

/* ------------------------------------------------------------------- report */

const live = rows.filter((r) => r.status === 'live')
const failingLive = live.filter((r) => !r.ok)

if (asJson) {
  console.log(JSON.stringify({ runAs: String(admin.email ?? admin.id), rows, failingLive: failingLive.map((r) => `${r.kind}:${r.id}`) }, null, 2))
} else {
  console.log(`running the real preflight as ${String(admin.email ?? admin.id)} (super admin)\n`)
  console.log(`${rows.length} deployment${rows.length === 1 ? '' : 's'}${includeAll ? '' : ' (live only — pass --all for the rest)'}\n`)
  for (const r of rows) {
    const verdict = r.ok ? 'PUBLISHABLE' : 'BLOCKED'
    console.log(
      `  ${r.kind.padEnd(4)} ${r.id.padStart(4)}  ${verdict.padEnd(11)} ${r.status.padEnd(6)} site ${r.siteId.padEnd(3)} ${r.siteName.padEnd(22)} ${r.path}`,
    )
    for (const c of r.blocking) console.log(`         BLOCK  ${c.label}: ${c.detail}`)
    for (const c of r.warnings) console.log(`         warn   ${c.label}: ${c.detail}`)
    if (r.ok && r.warnings.length === 0) console.log(`         all ${r.checks} checks pass`)
  }
  console.log('')
  console.log(`  live: ${live.length}   would fail re-publish: ${failingLive.length}`)
  if (failingLive.length > 0) {
    console.log('\nEvery row above that is BLOCKED and live is a one-way door: it can be taken')
    console.log('down on demand and cannot be put back until the named check passes.')
  }
}

// Only LIVE rows gate. A draft that does not pass yet is somebody mid-edit.
process.exit(failingLive.length > 0 ? 1 : 0)
