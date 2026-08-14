/**
 * Repair the authored defects in a derived quiz flow.
 *
 *   pnpm tsx scripts/repair-quiz-graph.mts --quiz 5             # report only
 *   pnpm tsx scripts/repair-quiz-graph.mts --quiz 5 --apply     # write
 *
 * WHY THIS EXISTS. "MVA Tiered Quiz 2 Tier" (quiz 5) is a two-tier reduction of
 * "MVA Tiered Quiz T4" (quiz 2). The reduction removed tiers t3/t4 and the
 * `hlr_lookup` step, and left every reference to them behind — which is exactly
 * the failure `deleteStep` was written to prevent, done by hand instead. The
 * publish preflight reported four blocking defects and was RIGHT about all four:
 *
 *   1. `date` sits at step index 1, but every `welcome` answer routes explicitly
 *      to `state` or `branch`, so nothing ever falls through into it. The
 *      accident-date question is never asked — while `n_tier_lookup` POSTs
 *      `incident_date` to the tier-lookup API, which therefore receives nothing.
 *   2. `qualified_form` routes to `hlr_lookup`, which does not exist here. The
 *      runtime falls through to the next step in order, which is `dq_form`, so
 *      QUALIFIED LEADS LAND ON THE DISQUALIFIED FORM.
 *   3. `qualified_thanks` is consequently entered by no path at all.
 *   4. `n_qual_thanks` carries `redirect.mode: 'immediate'` with no destination
 *      and no url, so the visitor lands on an empty card.
 *
 * WHAT AUTHORISES EACH REPAIR. Nothing here is invented. Repairs 1-4 reproduce
 * what the T4 graph — the authoritative parent this flow was derived from —
 * already says:
 *
 *   step order   T4 is welcome, branch, state, date, tier_lookup. Restoring that
 *                order makes `date` fall through from `state`, exactly as it does
 *                there.
 *   hlr_lookup   T4 routes qualified_form -> hlr_lookup -> qualified_thanks. This
 *                flow has no HLR node by design, so the faithful two-tier
 *                reduction is qualified_form -> qualified_thanks.
 *   redirect     BOTH T4 endpoints carry `redirect: null`. The `immediate` on
 *                this one is a stray edit, not authored intent.
 *
 * The FIFTH finding is REPORTED AND NEVER REPAIRED. The fault answer sets tier
 * `t3`, which this flow does not declare. An earlier run cleared it to make the
 * validator pass; that was wrong and has been reverted. `docs/external-blockers.md`
 * states that the hand-set `t3` is deliberate — it is the one tier the BigQuery
 * lookup does not assign. Changing qualification semantics to satisfy a graph
 * checker is never authorised. It stays a blocker for a human.
 *
 * IDEMPOTENT. Every repair checks the current value first, so a second run
 * reports "already correct" and writes nothing.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const apply = process.argv.includes('--apply')
const quizId = arg('quiz') ?? '5'

type Step = { key: string; label?: string }
type Answer = { id?: string; label?: string; nextStepKey?: string; setTier?: string }
type Node = { id?: string; stepKey?: string; answers?: Answer[]; redirect?: unknown }

const changes: string[] = []
const noted = (s: string): void => {
  changes.push(s)
  console.log(`  FIX  ${s}`)
}
const already = (s: string): void => console.log(`  ok   ${s}`)

const payload = await getPayload({ config })
const quiz = (await payload.findByID({
  collection: 'funnel-quizzes',
  id: quizId,
  depth: 0,
  overrideAccess: true,
})) as unknown as { id: string; name: string; steps: Step[]; nodes: Node[]; tiers: unknown[] }

console.log(`quiz ${quiz.id}: ${quiz.name}${apply ? '' : '   (report only — pass --apply to write)'}\n`)

const steps: Step[] = Array.isArray(quiz.steps) ? quiz.steps.map((s) => ({ ...s })) : []
const nodes: Node[] = Array.isArray(quiz.nodes) ? quiz.nodes.map((n) => ({ ...n })) : []

/* 1 ── step order: `date` belongs directly after `state`, as it does in T4. */
const idxOf = (key: string): number => steps.findIndex((s) => s.key === key)
const dateAt = idxOf('date')
const stateAt = idxOf('state')
if (dateAt < 0 || stateAt < 0) {
  console.log('  --   no `date` or `state` step; skipping the reorder')
} else if (dateAt === stateAt + 1) {
  already('`date` already follows `state`')
} else {
  const [dateStep] = steps.splice(dateAt, 1)
  steps.splice(idxOf('state') + 1, 0, dateStep)
  noted(
    `moved step "date" from index ${dateAt} to ${idxOf('date')} so it falls through from "state" ` +
      `(T4 order: ${steps.slice(0, 5).map((s) => s.key).join(', ')})`,
  )
}

/* 2 ── qualified_form's dangling `hlr_lookup` route. */
const stepKeys = new Set(steps.map((s) => s.key))
for (const n of nodes) {
  for (const a of n.answers ?? []) {
    if (!a.nextStepKey || stepKeys.has(a.nextStepKey)) continue
    if (a.nextStepKey === 'hlr_lookup' && n.stepKey === 'qualified_form') {
      a.nextStepKey = 'qualified_thanks'
      noted(`"${n.id}" answer "${a.label}" routed to missing step "hlr_lookup" -> "qualified_thanks"`)
    } else {
      // Reported, never guessed. A dangling route this script has no authority
      // over is a defect somebody has to decide about, not one to paper over.
      console.log(`  !!   "${n.id}" answer "${a.label}" routes to missing step "${a.nextStepKey}" — NOT repaired, no authority for a target`)
    }
  }
}

/* 3 ── the endpoint redirect that names nothing. T4 carries `redirect: null`. */
for (const n of nodes) {
  const r = n.redirect as { mode?: string; url?: string; destination?: string } | null | undefined
  if (!r || typeof r !== 'object') continue
  const namesNothing = !r.destination && !String(r.url ?? '').trim()
  if (r.mode && r.mode !== 'none' && namesNothing) {
    n.redirect = null
    noted(`"${n.id}" had redirect mode "${r.mode}" naming no destination and no url -> cleared (T4 carries null)`)
  }
}

/*
 * 4 ── the undeclared tier. REPORTED, NEVER REPAIRED. Do not add a fix here.
 *
 * An earlier run of this script cleared `setTier: 't3'` from the fault answer to
 * make the graph validator pass. That was WRONG and it has been reverted in
 * production. `docs/external-blockers.md` is the authoritative artifact and it
 * says the opposite:
 *
 *     "The only tier assigned anywhere in the flow by hand is `t3`, set by the
 *      answer 'We Were Both At Fault / Not Sure'. Every other tier comes from
 *      this response."
 *
 * So the hand-set t3 is DELIBERATE DESIGN — it is the single tier the BigQuery
 * lookup does not assign — and clearing it silently deleted the only qualification
 * rule the funnel expresses in its own graph. It also deleted it to satisfy a
 * validator, which is the one motive that must never be sufficient: a graph
 * checker has no standing to change who qualifies for a legal claim.
 *
 * The real defect is the mirror image of what was "fixed": the two-tier quiz
 * declares t1/t2 while its graph hand-assigns t3. Either the quiz should declare
 * t3 (T4 does) or this variant should not carry that answer's tier at all.
 * NOTHING in the T4 graph, the migrations, the seeds or the docs establishes
 * which — so it stays a blocker for a human, not a repair for a script.
 */
const declared = new Set((Array.isArray(quiz.tiers) ? quiz.tiers : []).map((t) => String((t as { id: unknown }).id ?? '')))
for (const n of nodes) {
  for (const a of n.answers ?? []) {
    if (!a.setTier || declared.has(a.setTier)) continue
    console.log(
      `  !!   "${n.id}" answer "${a.label}" sets undeclared tier "${a.setTier}" — ` +
        'NOT repaired. This is a QUALIFICATION RULE and needs a human decision; ' +
        'see docs/external-blockers.md.',
    )
  }
}

if (changes.length === 0) {
  console.log('\nnothing to repair.')
  process.exit(0)
}

if (!apply) {
  console.log(`\n${changes.length} repair(s) would be made. Re-run with --apply to write.`)
  process.exit(0)
}

await payload.update({
  collection: 'funnel-quizzes',
  id: quizId,
  data: { steps, nodes },
  overrideAccess: true,
})
console.log(`\napplied ${changes.length} repair(s) to quiz ${quizId}.`)
process.exit(0)
