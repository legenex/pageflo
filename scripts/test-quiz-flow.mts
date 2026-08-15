/**
 * Assertions for the quiz flow graph validator.
 *
 *   npx tsx scripts/test-quiz-flow.mts
 *
 * Three things this file is here to prove, in order of how much they matter:
 *
 * 1. THE VALIDATOR FAILS. A checker that only ever returns "fine" is worse than
 *    no checker, because it launders an unchecked flow into a checked one. Every
 *    one of the ten checks is driven with a quiz built to break exactly that
 *    check, and asserted to fail with the right named code - and a clean quiz is
 *    asserted to pass all ten, so the failures are not simply a validator that
 *    refuses everything.
 *
 * 2. THE TABLE IS PRESENTATION-INDEPENDENT. The same flow under a different
 *    template and a different brand must produce an identical path-to-outcome
 *    table. A quiz runs under many brands; if a template or a brand could move
 *    an outcome, one brand's visitors would qualify where another's did not, off
 *    the same answers.
 *
 * 3. THE MODEL STILL MATCHES THE RUNTIME. The validator reproduces
 *    `useQuizMachine`'s advance by hand in one respect it cannot import (the
 *    runtime declares its non-visitor node types as a module local). The source
 *    of the runtime is read here and compared, so the day somebody adds a node
 *    type to one list this file says so instead of the validator quietly
 *    modelling a flow the runtime no longer walks.
 *
 * No database, no network, no clock.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { buildSeedQuiz, SEED_STEPS, SEED_TIERS } from '../src/components/builder/quiz/seed-data.ts'
import { siteToBrand } from '../src/lib/brand-map.ts'
import {
  CHECK_IDS,
  CONDITION_OPERATORS,
  MAX_DEPTH,
  MAX_PATHS,
  NON_VISITOR_NODE_TYPES,
  buildPathTable,
  enumeratePaths,
  getCheck,
  hasIssue,
  issueCodes,
  replayAnswerIds,
  validateQuizFlow,
  type CheckId,
  type PathRow,
} from '../src/lib/quiz-flow/index.ts'
import type { Answer, Condition, CustomField, Quiz, QuizNode } from '../src/lib/quiz-graph.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const SRC = new URL('../src/', import.meta.url).pathname
const read = (rel: string): string => readFileSync(SRC + rel, 'utf8')
const json = (v: unknown): string => JSON.stringify(v)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The seed quiz generates answer ids from `Date.now()` and `Math.random()`.
 * Rewriting them to positional ids leaves the STRUCTURE untouched - same nodes,
 * same routes, same order - while making the path table diffable and removing a
 * real (if rare) id-collision flake from a suite that has to be trustworthy on
 * every run.
 */
const withStableIds = (quiz: Quiz): Quiz => ({
  ...quiz,
  nodes: quiz.nodes.map((node) => ({
    ...node,
    answers: node.answers ? node.answers.map((a, i) => ({ ...a, id: `${node.id}_a${i}` })) : node.answers,
    conditions: node.conditions ? node.conditions.map((c, i) => ({ ...c, id: `${node.id}_c${i}` })) : node.conditions,
  })),
})

/** Give the seed's endpoints real named destinations, so the URL column is live. */
const withDestinations = (quiz: Quiz): Quiz => ({
  ...quiz,
  nodes: quiz.nodes.map((node) =>
    node.type === 'endpoint'
      ? { ...node, redirect: { mode: 'button', destination: node.id === 'n_dq_thanks' ? 'dq' : 'thank_you', buttonText: 'Continue' } }
      : node,
  ),
})

const seed: Quiz = withStableIds(buildSeedQuiz())

// --- hand-built quizzes -----------------------------------------------------

const step = (key: string, label = key): { key: string; label: string } => ({ key, label })
const field = (key: string): CustomField => ({ id: `cf_${key}`, key, label: key, type: 'text', options: [] })
const answer = (id: string, extra: Partial<Answer> = {}): Answer => ({ id, label: id, ...extra })
const node = (id: string, stepKey: string, extra: Partial<QuizNode> = {}): QuizNode => ({
  id,
  stepKey,
  tiers: [],
  type: 'question',
  questionType: 'single_select',
  isVisible: true,
  answers: [],
  ...extra,
})

/**
 * A flow with nothing wrong with it. Every check has to pass here, or the
 * negative controls below only prove the validator dislikes everything.
 *
 * It is deliberately not trivial: it has a tier that gets set and a variant that
 * only that tier sees, a disqualifying answer that skips ahead, a lead form on
 * every route, and an endpoint with a named destination.
 */
const cleanQuiz = (): Quiz => ({
  id: 'clean',
  name: 'Clean',
  slug: 'clean',
  tiers: [{ id: 'ta', name: 'Tier A', color: '#10b981' }],
  steps: [step('q1', 'First question'), step('extra', 'Tier A only'), step('lead', 'Lead form'), step('done', 'Thank you')],
  customFields: [field('dq_lead'), field('tier'), field('answer')],
  nodes: [
    node('n_q1', 'q1', {
      answers: [
        answer('q1_yes', { setTier: 'ta', fieldMappings: [{ key: 'answer', value: 'yes' }] }),
        answer('q1_no', { isDQ: true, nextStepKey: 'lead', fieldMappings: [{ key: 'answer', value: 'no' }] }),
      ],
    }),
    node('n_extra', 'extra', { tiers: ['ta'], answers: [answer('extra_ok')] }),
    node('n_lead', 'lead', { type: 'form', questionType: 'lead_form', answers: [answer('lead_submit')] }),
    node('n_done', 'done', {
      type: 'endpoint',
      questionType: 'qualified_result',
      answers: [],
      redirect: { mode: 'button', destination: 'thank_you', buttonText: 'Continue' },
    }),
  ],
})

/** Deep-copy the clean quiz and break one thing about it. */
const broken = (mutate: (quiz: Quiz) => void): Quiz => {
  const quiz = structuredClone(cleanQuiz())
  mutate(quiz)
  return quiz
}

const nodeOf = (quiz: Quiz, id: string): QuizNode => {
  const found = quiz.nodes.find((n) => n.id === id)
  if (!found) throw new Error(`fixture has no node "${id}"`)
  return found
}
const answerOf = (quiz: Quiz, nodeId: string, answerId: string): Answer => {
  const found = (nodeOf(quiz, nodeId).answers ?? []).find((a) => a.id === answerId)
  if (!found) throw new Error(`fixture has no answer "${answerId}"`)
  return found
}

// ---------------------------------------------------------------------------
// The model still matches the runtime
// ---------------------------------------------------------------------------

{
  /*
   * The runtime is TWO files now, and both are read because the split is the
   * point: `machine.ts` decides the flow (one implementation, shared by the
   * public page and the builder preview, which used to be two hand-written
   * copies) and `QuizRuntime.tsx` supplies the live transport. Reading only
   * one of them would let half of what this suite guards move away unnoticed.
   */
  const runtime = read('components/public/quiz/machine.ts') + '\n' + read('components/public/quiz/QuizRuntime.tsx')

  const declared = runtime.match(/INVISIBLE_NODE_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
  const runtimeTypes = declared
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  t(runtimeTypes.length > 0, 'the runtime still declares INVISIBLE_NODE_TYPES where this suite can read it')
  t(
    json([...runtimeTypes].sort()) === json([...NON_VISITOR_NODE_TYPES].sort()),
    `the validator's non-visitor node types match the runtime's (runtime: ${runtimeTypes.join(',')} / validator: ${NON_VISITOR_NODE_TYPES.join(',')})`,
  )

  const operators = [...runtime.matchAll(/cond\.operator === '([a-z_]+)'/g)].map((m) => m[1])
  t(operators.length > 0, 'the runtime still evaluates conditions with an operator chain')
  t(
    json([...new Set(operators)].sort()) === json([...CONDITION_OPERATORS].sort()),
    `the validator understands exactly the operators the runtime does (runtime: ${operators.join(',')})`,
  )

  t(/\(answer\.fieldMappings \|\| \[\]\)/.test(runtime), 'the runtime still applies answer.fieldMappings')
  t(/if \(answer\.isDQ\) newValues\.dq_lead = 'yes'/.test(runtime), "the runtime still sets dq_lead from answer.isDQ")
  t(/if \(answer\.setTier\) newValues\.tier = answer\.setTier/.test(runtime), 'the runtime still writes the tier field from answer.setTier')
  // The routing tier now has a second source: a webhook node whose response
  // maps onto `tier`. `answer.setTier` still comes FIRST, so a decision the
  // flow author wrote by hand is never overridden by a lookup.
  t(
    /const nextTier = answer\.setTier \|\| webhookTier \|\| currentTier/.test(runtime),
    'the runtime derives the routing tier from answer.setTier first, then a webhook-assigned tier',
  )
  t(
    /WEBHOOK_NODE_TYPES = new Set\(\['webhook', 'verification'\]\)/.test(runtime),
    'the runtime executes both webhook and verification nodes, which carry the identical shape',
  )
  t(
    /\/api\/legalos\/quiz-webhook/.test(runtime),
    'and it executes them server-side, so the destination is never chosen by the visitor',
  )
  t(/nextSequentialStepIndex\(quiz, stepIdx, nextTier\)/.test(runtime), 'the runtime still falls through sequentially with the new tier')
  t(/explicitStepIndex\(quiz, answer\.nextStepKey\)/.test(runtime), 'the runtime still honours an explicit answer route')
  t(/explicitStepIndex\(quiz, node\.defaultNextStepKey\)/.test(runtime), 'the runtime still honours a decision default route')
  t(/setFinished\(true\)\s*\n\s*void submitOnce\(newValues\)/.test(runtime), 'running out of steps still ends the funnel and submits the lead')

  /*
   * Where consent actually lives.
   *
   * The publish preflight and `checkReachableConsent` both treat "the visitor
   * reached a form node" as equivalent to "the visitor saw the TCPA text", and
   * that equivalence is only true while exactly ONE component prints it on
   * exactly one node type. It used to be the one question card; it is now the
   * `P.Consent` primitive, and there are seven compositions that could have
   * grown their own. So the check is stronger than it was rather than merely
   * relocated: the line is read out of the view model in one place, printed in
   * one place, and no composition file may mention it at all.
   */
  const viewModel = read('components/public/quiz/view-model.ts')
  t(
    /node\?\.type === 'form' \? interp\(brand\?\.legal\?\.tcpaText/.test(viewModel),
    'the consent (TCPA) text is still read from the brand by, and only by, a form node',
  )
  t(
    (viewModel.match(/tcpaText/g) ?? []).length === 1,
    'there is still exactly one place consent is resolved, so "reached a form" is still the right flow-level test',
  )

  const primitives = read('components/public/quiz/primitives.tsx')
  t(
    /view\.phase !== 'form' \|\| !view\.legal\.tcpa/.test(primitives),
    'and exactly one primitive prints it, on a form node only',
  )
  t(
    (primitives.match(/\{view\.legal\.tcpa\}/g) ?? []).length === 1,
    'the consent line is printed in exactly one place',
  )

  // `types.ts` DECLARES `legal.tcpa` on the view model, which is not rendering
  // it; every other file in the module is a composition and must not name it.
  const compositionDir = new URL('../src/lib/quiz-compositions/', import.meta.url).pathname
  const offenders = readdirSync(compositionDir)
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && f !== 'types.ts')
    .filter((f) => /tcpa/i.test(readFileSync(compositionDir + f, 'utf8')))
  t(
    offenders.length === 0,
    `no composition renders consent itself (offenders: ${offenders.join(', ') || 'none'})`,
  )
}

// ---------------------------------------------------------------------------
// Shape of the result
// ---------------------------------------------------------------------------

{
  const v = validateQuizFlow(cleanQuiz())
  t(CHECK_IDS.length === 10, `there are ten checks (found ${CHECK_IDS.length})`)
  t(v.checks.length === CHECK_IDS.length, 'every declared check is reported')
  t(json(v.checks.map((c) => c.id)) === json([...CHECK_IDS]), 'the checks are reported in the declared order')
  t(new Set(v.checks.map((c) => c.id)).size === v.checks.length, 'no check is reported twice')
  t(v.checks.every((c) => c.label.length > 0), 'every check carries a human label')
  t(v.checks.every((c) => c.ok === (c.errors.length === 0)), 'a check is ok exactly when it has no errors')
  t(v.ok === v.checks.every((c) => c.ok), 'the overall verdict is the conjunction of the checks')

  let threw = false
  try {
    getCheck(v, 'not_a_check' as CheckId)
  } catch {
    threw = true
  }
  t(threw, 'asking for a check that does not exist throws rather than returning undefined')
}

// ---------------------------------------------------------------------------
// The clean quiz passes all ten
// ---------------------------------------------------------------------------

{
  const v = validateQuizFlow(cleanQuiz())
  for (const id of CHECK_IDS) {
    const check = getCheck(v, id)
    t(check.ok, `a well-formed quiz passes "${id}" (${issueCodes(check).join(', ') || 'no issues'})`)
  }
  t(v.ok, 'a well-formed quiz passes validation outright - the validator is passable')

  const walk = v.enumeration
  t(walk.rows.length === 2, `the clean quiz has exactly two paths (found ${walk.rows.length})`)
  t(walk.rows.every((r) => r.terminalNodeId === 'n_done'), 'both paths end at the endpoint')
  t(walk.rows.every((r) => r.formNodeIds.includes('n_lead')), 'both paths pass through the lead form')
  t(walk.rows.filter((r) => r.dqLead).length === 1, 'exactly one path disqualifies the lead')
  t(walk.rows.filter((r) => r.tier === 'ta').length === 1, 'exactly one path ends in Tier A')
  t(json(walk.activeTiers) === json(['ta']), 'the declared tier becomes active')
  t(walk.rows.every((r) => r.destination.kind === 'named'), 'both paths resolve to a named destination')
  t(walk.rows.every((r) => r.submitsLead), 'both paths submit a lead')
}

// ---------------------------------------------------------------------------
// The seeded 18-step MVA quiz
// ---------------------------------------------------------------------------

{
  const walk = enumeratePaths(seed)

  t(seed.steps.length === SEED_STEPS.length && seed.steps.length === 18, 'the seed fixture is the real 18-step MVA quiz')
  t(seed.tiers.length === SEED_TIERS.length && seed.tiers.length === 4, 'it declares four tiers')
  t(!walk.truncated, 'the seed quiz enumerates completely within the safe branch limit')
  t(walk.rows.length === 3564, `the seed quiz has exactly 3564 paths (found ${walk.rows.length})`)
  t(walk.rows.every((r) => r.terminalKind === 'endpoint'), 'every seed path ends at an endpoint')
  t(walk.rows.filter((r) => r.terminalNodeId === 'n_qual_thanks').length === 840, 'exactly 840 paths qualify')
  t(walk.rows.filter((r) => r.terminalNodeId === 'n_dq_thanks').length === 2724, 'exactly 2724 paths are disqualified')
  t(walk.rows.every((r) => r.dqLead === (r.terminalNodeId === 'n_dq_thanks')), 'the DQ flag and the DQ endpoint agree on every single path')
  t(walk.rows.every((r) => r.formNodeIds.length > 0), 'every seed path passes through a lead form, so consent is always shown')
  t(walk.rows.reduce((m, r) => Math.max(m, r.answerIds.length), 0) === 12, 'the longest seed path asks 12 questions')
  t(json(walk.visitedStepKeys.length) === json(18), 'all 18 steps are reachable')

  const v = validateQuizFlow(seed)
  const failing = v.checks.filter((c) => !c.ok).map((c) => c.id)

  // The seed is a REAL flow with one real defect, and the suite pins it: a
  // regression that silences it is a regression in the validator.
  //
  // It used to fail two checks, then one. It now fails NONE, and that is the
  // whole point of the webhook fix: the four tier-scoped variants that were
  // dead (n_attorney_t2, n_attorney_t4, n_fault_t3, n_treatment_t34) were dead
  // only because the runtime never called the tier lookup that assigns t1, t2
  // and t4. The lookup executes, the walk branches over what it can return, and
  // every variant the author drew is now on a path a visitor can actually walk.
  //
  // A regression that reintroduces a failure here is a regression in the fix.
  t(
    json(failing) === json([]),
    `the seed quiz fails no checks (failing: ${failing.join(', ') || 'none'})`,
  )

  const reach = getCheck(v, 'reachability')
  t(reach.ok && reach.errors.length === 0, 'no variant is unreachable any more')
  t(
    ['n_attorney_t2', 'n_attorney_t4', 'n_fault_t3', 'n_treatment_t34'].every((id) =>
      walk.visitedNodeIds.includes(id),
    ),
    'the four formerly-dead tier variants are each visited by a real enumerated path',
  )
  t(reach.notes.some((n) => n.includes('exact')), 'the reachability result says it is exact rather than leaving the caller to guess')

  const tiers = getCheck(v, 'tier_reachability')
  // The runtime CALLS webhook nodes now, so a tier the lookup assigns is no
  // longer statically dead - it is statically unverifiable, which is a
  // different claim and the only honest one from here.
  const fromLookup = tiers.warnings
    .filter((e) => e.code === 'tier_depends_on_webhook_response')
    .map((e) => e.tierId)
    .sort()
  t(json(fromLookup) === json(['t1', 't2', 't4']), `Tier 1, 2 and 4 are reported as lookup-assigned (found: ${fromLookup.join(', ')})`)
  t(
    !tiers.errors.some((e) => e.code === 'unreachable_tier'),
    'and none of them is called unreachable any more, because the tier lookup does execute',
  )
  t(
    tiers.warnings.some((w) => w.message.includes('returns exactly that id')),
    'the warning tells the operator what to check: that the endpoint returns the declared tier id',
  )
  t(
    json(enumeratePaths(seed, { lookupOutcomes: false }).activeTiers) === json(['t3']),
    'walked WITHOUT the lookup, only Tier 3 is reachable - which is exactly why the other three depend on it',
  )
  t(
    json(enumeratePaths(seed).activeTiers) === json(['t1', 't2', 't3', 't4']),
    'walked WITH the lookup, every declared tier becomes active',
  )

  t(getCheck(v, 'cycle_traps').ok, 'the seed flow has no cycle traps')
  t(getCheck(v, 'valid_terminals').ok, 'every seed path ends somewhere valid')
  t(getCheck(v, 'reachable_consent').ok, 'every seed path that submits a lead has shown the consent text')
  t(getCheck(v, 'qualification_determinism').ok, 'the seed quiz qualifies deterministically')
  t(getCheck(v, 'valid_references').ok, 'every seed reference resolves')
  t(getCheck(v, 'valid_entry').ok, 'the seed quiz has a valid entry for every tier')
  t(getCheck(v, 'destination_validity').ok, 'every seed terminal has a valid destination')
  t(getCheck(v, 'path_table').ok, 'the seed path table is exhaustive')

  // The raw seed - real generated ids - must reach the same verdict. The stable
  // ids above are a convenience, not a different quiz.
  const rawFailing = validateQuizFlow(buildSeedQuiz())
    .checks.filter((c) => !c.ok)
    .map((c) => c.id)
  t(json(rawFailing) === json(failing), 'the seed with its real generated ids reaches the same verdict as the id-stabilised copy')
}

// ---------------------------------------------------------------------------
// Determinism: the same answers always produce the same outcome
// ---------------------------------------------------------------------------

{
  const a = enumeratePaths(seed)
  const b = enumeratePaths(seed)
  t(json(a.rows) === json(b.rows), 'walking the same quiz twice produces an identical table')
  t(json(a.visitedNodeIds) === json(b.visitedNodeIds), 'and visits the same nodes')

  // The input to a qualification decision is what the VISITOR chose plus what
  // the tier LOOKUP returned. Keying on answers alone was correct only while
  // webhook nodes were skipped: now that they execute, two visitors can answer
  // identically and qualify differently because the lookup said something
  // different, and that is the flow working as authored rather than a defect.
  const sequences = a.rows.map((r) => `${r.answerIds.join('>')}|${r.lookupOutcomeIds.join('>')}`)
  t(new Set(sequences).size === sequences.length, 'no two paths share the same answers AND the same lookup result - together they identify the outcome')

  // Answers alone must NOT identify the outcome any more, and that is asserted
  // rather than assumed: if it still did, the lookup would not be steering
  // anything and the fix would be decorative.
  const answersOnly = a.rows.map((r) => r.answerIds.join('>'))
  t(new Set(answersOnly).size < answersOnly.length, 'and the answers alone do not, because the lookup genuinely changes where a visitor lands')

  const outcome = (row: PathRow): string => json([row.tier, row.dqLead, row.terminalNodeId, row.values])
  let mismatches = 0
  for (const row of a.rows) {
    const replay = replayAnswerIds(seed, row.answerIds, { lookupOutcomeIds: row.lookupOutcomeIds })
    if (!replay.ok || outcome(replay.row) !== outcome(row)) mismatches += 1
  }
  t(mismatches === 0, `every one of the ${a.rows.length} paths reproduces its own outcome when replayed from its answers and lookup results (${mismatches} mismatched)`)

  const bogus = replayAnswerIds(seed, ['not_an_answer'])
  t(!bogus.ok, 'replaying an answer id that is not on the current node fails rather than guessing')
  const short = replayAnswerIds(seed, [])
  t(!short.ok, 'replaying an empty answer list fails rather than inventing a path')

  // Replay has to be walking the flow, not echoing the row it was handed.
  const sample = a.rows[0]
  const prefix = replayAnswerIds(seed, sample.answerIds.slice(0, -1))
  t(!prefix.ok && String(prefix).length > 0, 'replaying only part of an answer sequence fails rather than completing the path on its own')
  const full = replayAnswerIds(seed, sample.answerIds)
  t(full.ok && json(full.row.nodeIds) === json(sample.nodeIds), 'a full replay visits exactly the nodes the walk did')
  const overrun = replayAnswerIds(seed, [...sample.answerIds, 'one_too_many'])
  t(!overrun.ok, 'replaying more answers than the flow has steps fails rather than ignoring the extras')

  // Two answers on one node sharing an id make the answer sequence stop
  // identifying the outcome, which is the determinism defect this check exists
  // to catch.
  const ambiguous = broken((q) => {
    nodeOf(q, 'n_q1').answers = [
      answer('same', { nextStepKey: 'lead' }),
      answer('same', { nextStepKey: 'lead', isDQ: true }),
    ]
  })
  const amb = getCheck(validateQuizFlow(ambiguous), 'qualification_determinism')
  t(
    !amb.ok && hasIssue(amb, 'ambiguous_answer_sequence'),
    'two paths that take the same answer ids and end differently fail qualification_determinism',
  )
  t(amb.errors.some((e) => e.message.includes('end differently')), 'and the message says the two outcomes disagree')
}

// ---------------------------------------------------------------------------
// The subtle runtime semantics, pinned
// ---------------------------------------------------------------------------

{
  const decisionQuiz = (conditions: Condition[] | undefined, defaultNextStepKey: string): Quiz => ({
    tiers: [],
    steps: [step('q1', 'First'), step('route', 'Decision'), step('a', 'Ending A'), step('b', 'Ending B')],
    customFields: [field('answer')],
    nodes: [
      node('n_q1', 'q1', { answers: [answer('a1', { fieldMappings: [{ key: 'answer', value: 'yes' }] })] }),
      node('n_route', 'route', {
        type: 'decision',
        questionType: 'decision',
        isVisible: false,
        answers: [],
        // `conditions: undefined` and an absent `conditions` are the same thing
        // to the runtime, which tests the property for truthiness.
        conditions,
        defaultNextStepKey,
      }),
      node('n_a', 'a', { type: 'endpoint', questionType: 'qualified_result', answers: [] }),
      node('n_b', 'b', { type: 'endpoint', questionType: 'dq_result', answers: [] }),
    ],
  })

  // A condition that MATCHES but names a step that no longer exists falls
  // through to the next condition rather than routing nowhere. That is what
  // useQuizMachine's advance does, and a validator that modelled it any other way
  // would clear a flow the runtime routes differently.
  const fallsThrough = decisionQuiz(
    [
      { id: 'c1', field: 'answer', operator: 'eq', value: 'yes', nextStepKey: 'ghost_step' },
      { id: 'c2', field: 'answer', operator: 'eq', value: 'yes', nextStepKey: 'b' },
    ],
    'a',
  )
  const fell = enumeratePaths(fallsThrough)
  t(fell.rows.length === 1 && fell.rows[0].terminalNodeId === 'n_b', 'a matching condition with a dangling target falls through to the NEXT condition, exactly as the runtime does')
  t(hasIssue(getCheck(validateQuizFlow(fallsThrough), 'valid_references'), 'dangling_condition_route'), 'and the dangling condition is still reported')

  const toDefault = decisionQuiz([{ id: 'c1', field: 'answer', operator: 'eq', value: 'no', nextStepKey: 'b' }], 'a')
  const defaulted = enumeratePaths(toDefault)
  t(defaulted.rows.length === 1 && defaulted.rows[0].terminalNodeId === 'n_a', 'a decision whose conditions all fail takes its default route')

  // A decision authored with NO conditions array skips its whole routing block,
  // default included, and falls through in step order. That is a runtime quirk
  // rather than a design, so it is reproduced and reported, not corrected.
  const noConditions = decisionQuiz(undefined, 'b')
  const skipped = enumeratePaths(noConditions)
  t(
    skipped.rows.length === 1 && skipped.rows[0].terminalNodeId === 'n_a',
    'a decision with no conditions array ignores even its own default and falls through in step order',
  )
  t(
    hasIssue(getCheck(validateQuizFlow(noConditions), 'valid_references'), 'decision_without_conditions'),
    'and that is reported, because the author almost certainly meant the default to fire',
  )

  const emptyConditions = decisionQuiz([], 'b')
  t(enumeratePaths(emptyConditions).rows[0].terminalNodeId === 'n_b', 'a decision with an EMPTY conditions array does take its default - the difference is the array, not its length')

  // A node the author hid is executed and skipped, carrying nothing with it.
  const hidden = broken((q) => {
    nodeOf(q, 'n_extra').isVisible = false
  })
  const hiddenWalk = enumeratePaths(hidden)
  t(hiddenWalk.rows.some((r) => r.nodeIds.includes('n_extra')), 'a node the author hid is still entered and executed')
  t(
    hiddenWalk.rows.every((r) => !r.answerIds.includes('extra_ok')),
    'but its answer is never a visitor choice, because the runtime advances it for them',
  )
  t(
    enumeratePaths(cleanQuiz()).rows.some((r) => r.answerIds.includes('extra_ok')),
    'and the same node, visible, IS a visitor choice - so the assertion above is about visibility, not about the node',
  )
}

// ---------------------------------------------------------------------------
// THE PROPERTY: template and brand are presentation, never outcome
// ---------------------------------------------------------------------------

{
  const site = (id: number, slug: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    slug,
    name: slug,
    status: 'active',
    brand: { primary: '#123456', cta: '#123456', bg: '#ffffff', ink: '#111111' },
    ...extra,
  })

  const brandA = siteToBrand(site(101, 'brand-a'), [])
  const brandB = siteToBrand(
    site(102, 'brand-b', { brand: { primary: '#8B0000', cta: '#00008B', bg: '#0b0b0b', ink: '#f5f5f5' } }),
    [],
  )
  const brandC = siteToBrand(
    site(103, 'brand-c', { brand_identity: { urls: { thank_you: 'https://brand-c.example/ty', dq: 'https://brand-c.example/no' } } }),
    [],
  )

  t(json(brandA.colors) !== json(brandB.colors), 'the two brands really are different brands, so the comparison below is not vacuous')
  t(Object.keys(brandC.urls).length > 0, 'the third brand really does override its destination URLs')
  t(Object.keys(brandA.urls).length === 0, 'and the first two do not, so their tables must resolve to the site defaults')

  const flow = withDestinations(seed)

  const tableA = buildPathTable(flow, { templateId: 'sq_quiz_first', brand: brandA, deployment: {} })
  const tableB = buildPathTable(flow, { templateId: 'sq_card_deck', brand: brandB, deployment: {} })

  t(tableA.rows.length === 3564, 'the path table covers every path')
  t(
    json(tableA) === json(tableB),
    'THE PROPERTY: the same flow under a different template and a different brand produces a byte-identical path-to-outcome table',
  )

  // A template on its own must not move anything either.
  t(
    json(buildPathTable(flow, { templateId: 'sq_editorial_inline', brand: brandA })) === json(tableA),
    'changing only the template changes nothing',
  )
  t(json(buildPathTable(flow, {})) === json(buildPathTable(flow, { templateId: null, brand: null, deployment: null })), 'an absent presentation and an empty one agree')

  // The destination URL is the ONE column a brand may move, and it must move
  // only that column - otherwise the equality above would be proving that the
  // column is inert rather than that the flow is independent.
  const strip = (rows: Array<Record<string, unknown>>): string =>
    json(rows.map(({ destinationUrl: _url, ...rest }) => rest))

  const tableC = buildPathTable(flow, { templateId: 'sq_quiz_first', brand: brandC, deployment: {} })
  t(strip(tableC.rows) === strip(tableA.rows), 'a brand that overrides its destination URLs changes no part of the flow')
  t(json(tableC.rows) !== json(tableA.rows), 'but it does change the resolved URLs, so the URL column is live and the test above is not vacuous')
  t(
    tableC.rows.every((r) => (r.terminalNodeId === 'n_dq_thanks' ? r.destinationUrl === 'https://brand-c.example/no' : r.destinationUrl === 'https://brand-c.example/ty')),
    "each terminal resolves to that brand's own URL for its own named destination",
  )
  t(
    tableA.rows.every((r) => (r.terminalNodeId === 'n_dq_thanks' ? r.destinationUrl === '/thanks' : r.destinationUrl === '/submitted')),
    'a brand that names no URL falls back to the site’s own page rather than to another brand’s',
  )

  // A deployment override beats the brand, and still only touches the URL.
  const tableD = buildPathTable(flow, { brand: brandC, deployment: { destinationOverrides: { thank_you: '/one-off' } } })
  t(strip(tableD.rows) === strip(tableA.rows), 'a per-deployment destination override changes no part of the flow either')
  t(
    tableD.rows.every((r) => (r.terminalNodeId === 'n_qual_thanks' ? r.destinationUrl === '/one-off' : true)),
    'and the deployment override beats the brand for the key it names',
  )

  // Structural proof rather than observational: the enumerator has no channel
  // through which a presentation could arrive, and the table only adds a column.
  t(
    strip(tableA.rows) === strip(enumeratePaths(flow).rows.map((r) => ({ ...r }))),
    'the table is the enumeration plus one column - the enumerator itself takes no presentation at all',
  )
}

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS - one per check
// ---------------------------------------------------------------------------

// 1. valid entry
{
  const empty: Quiz = { tiers: [], steps: [], nodes: [], customFields: [] }
  const v = validateQuizFlow(empty)
  const check = getCheck(v, 'valid_entry')
  t(!check.ok && hasIssue(check, 'no_steps'), 'a quiz with no steps fails valid_entry with no_steps')
  t(!v.ok, 'and fails validation overall')

  const optionalOnly = broken((q) => {
    for (const n of q.nodes) n.routedOnly = true
  })
  const opt = getCheck(validateQuizFlow(optionalOnly), 'valid_entry')
  t(!opt.ok && hasIssue(opt, 'no_entry'), 'a quiz whose every step is an optional question fails valid_entry with no_entry')

  const tierBlind = broken((q) => {
    // Nothing on the first row for Tier A, and the row after it is optional:
    // an existing Tier A visitor would open on nothing.
    nodeOf(q, 'n_q1').tiers = ['ta']
    q.tiers.push({ id: 'tb', name: 'Tier B', color: '#f43f5e' })
    for (const n of q.nodes) if (n.id !== 'n_q1') n.routedOnly = true
  })
  const blind = getCheck(validateQuizFlow(tierBlind), 'valid_entry')
  t(!blind.ok && hasIssue(blind, 'no_entry_for_tier'), 'a tier with no first step fails valid_entry with no_entry_for_tier')
}

// 2. valid references
{
  const dangling = broken((q) => {
    answerOf(q, 'n_q1', 'q1_no').nextStepKey = 'ghost_step'
  })
  const refs = getCheck(validateQuizFlow(dangling), 'valid_references')
  t(!refs.ok && hasIssue(refs, 'dangling_answer_route'), 'an answer routing to a step that does not exist fails valid_references')
  t(
    refs.errors.some((e) => e.message.includes('ghost_step') && e.message.includes('falls through')),
    'and the message names the missing step and says what the runtime does instead',
  )

  const badTier = broken((q) => {
    answerOf(q, 'n_q1', 'q1_yes').setTier = 'ghost_tier'
  })
  const tierRefs = getCheck(validateQuizFlow(badTier), 'valid_references')
  t(!tierRefs.ok && hasIssue(tierRefs, 'unknown_tier'), 'an answer setting a tier that is not declared fails valid_references')

  const badField = broken((q) => {
    answerOf(q, 'n_q1', 'q1_yes').fieldMappings = [{ key: 'ghost_field', value: 'x' }]
  })
  const fieldRefs = getCheck(validateQuizFlow(badField), 'valid_references')
  t(!fieldRefs.ok && hasIssue(fieldRefs, 'unknown_field_key'), 'a field mapping writing an undeclared custom field fails valid_references')

  const badCondition = broken((q) => {
    q.steps.splice(1, 0, step('route', 'Decision'))
    q.nodes.push(
      node('n_route', 'route', {
        type: 'decision',
        questionType: 'decision',
        isVisible: false,
        answers: [],
        conditions: [{ id: 'c1', field: 'answer', operator: 'eq', value: 'yes', nextStepKey: 'ghost_step' }],
        defaultNextStepKey: 'also_ghost',
      }),
    )
  })
  const condRefs = getCheck(validateQuizFlow(badCondition), 'valid_references')
  t(!condRefs.ok && hasIssue(condRefs, 'dangling_condition_route'), 'a condition routing to a step that does not exist fails valid_references')
  t(hasIssue(condRefs, 'dangling_default_route'), 'and so does a default route that names nothing')

  const badOperator = broken((q) => {
    q.steps.splice(1, 0, step('route', 'Decision'))
    q.nodes.push(
      node('n_route', 'route', {
        type: 'decision',
        questionType: 'decision',
        isVisible: false,
        answers: [],
        conditions: [{ id: 'c1', field: 'answer', operator: 'starts_with', value: 'y', nextStepKey: 'lead' }],
        defaultNextStepKey: 'lead',
      }),
    )
  })
  const opRefs = getCheck(validateQuizFlow(badOperator), 'valid_references')
  t(!opRefs.ok && hasIssue(opRefs, 'unknown_operator'), 'a condition operator the runtime does not implement fails valid_references')

  const duplicateStep = broken((q) => {
    q.steps.push(step('lead', 'Second lead form'))
  })
  const dupRefs = getCheck(validateQuizFlow(duplicateStep), 'valid_references')
  t(!dupRefs.ok && hasIssue(dupRefs, 'duplicate_step_key'), 'two steps sharing a key fails valid_references - every route would resolve to the first')

  const duplicateAnswer = broken((q) => {
    nodeOf(q, 'n_q1').answers = [answer('same'), answer('same')]
  })
  const dupAnswer = getCheck(validateQuizFlow(duplicateAnswer), 'valid_references')
  t(!dupAnswer.ok && hasIssue(dupAnswer, 'duplicate_answer_id'), 'two answers on one node sharing an id fails valid_references')

  const orphan = broken((q) => {
    q.nodes.push(node('n_orphan', 'no_such_step', { answers: [answer('x')] }))
  })
  const orphanRefs = getCheck(validateQuizFlow(orphan), 'valid_references')
  t(!orphanRefs.ok && hasIssue(orphanRefs, 'orphan_node'), 'a node sitting on a step that does not exist fails valid_references')

  const webhookRouted = broken((q) => {
    q.customFields = [...(q.customFields ?? []), field('risk_score')]
    q.steps.splice(1, 0, step('hook', 'Webhook'), step('route', 'Decision'))
    q.nodes.push(
      node('n_hook', 'hook', {
        type: 'webhook',
        questionType: 'webhook_post',
        isVisible: false,
        answers: [],
        responseMappings: [{ id: 'rm1', jsonPath: 'score', fieldKey: 'risk_score' }],
      }),
      node('n_route', 'route', {
        type: 'decision',
        questionType: 'decision',
        isVisible: false,
        answers: [],
        conditions: [{ id: 'c1', field: 'risk_score', operator: 'eq', value: 'high', nextStepKey: 'lead' }],
        defaultNextStepKey: 'lead',
      }),
    )
  })
  const hookRefs = getCheck(validateQuizFlow(webhookRouted), 'valid_references')
  t(
    hasIssue(hookRefs, 'route_depends_on_webhook_response'),
    'routing on a field only a webhook response writes is surfaced on valid_references',
  )
  t(
    hookRefs.ok,
    'but it no longer FAILS the check: the runtime calls the webhook, so this is a thing to verify against the endpoint rather than a defect in the flow',
  )
}

// 3. reachability
{
  const stranded = broken((q) => {
    // Nothing can get past the endpoint, so a step behind it is unreachable.
    q.steps.push(step('after_the_end', 'Stranded'))
    q.nodes.push(node('n_stranded', 'after_the_end', { answers: [answer('never')] }))
  })
  const check = getCheck(validateQuizFlow(stranded), 'reachability')
  t(!check.ok && hasIssue(check, 'unreachable_step'), 'a step no path can enter fails reachability')
  t(check.errors.some((e) => e.stepKey === 'after_the_end'), 'and the unreachable step is named by key')

  const deadVariant = broken((q) => {
    q.tiers.push({ id: 'tb', name: 'Tier B', color: '#f43f5e' })
    q.nodes.push(node('n_extra_tb', 'extra', { tiers: ['tb'], answers: [answer('never')] }))
  })
  const variants = getCheck(validateQuizFlow(deadVariant), 'reachability')
  t(!variants.ok && hasIssue(variants, 'unreachable_variant'), 'a tier variant no visitor resolves fails reachability')
  t(variants.errors.some((e) => e.nodeId === 'n_extra_tb'), 'and the dead variant is named by node id')

  const emptyStep = broken((q) => {
    q.steps.splice(1, 0, step('nothing_here', 'Empty row'))
  })
  const empty = getCheck(validateQuizFlow(emptyStep), 'reachability')
  t(empty.ok && hasIssue(empty, 'empty_step'), 'a step with no variants at all is a warning, not a failure - the runtime just skips it')
}

// 4. cycle traps
{
  const trap: Quiz = {
    tiers: [],
    steps: [step('a', 'A'), step('b', 'B'), step('out', 'Thank you')],
    customFields: [],
    nodes: [
      node('n_a', 'a', { answers: [answer('a1', { nextStepKey: 'b' })] }),
      node('n_b', 'b', { answers: [answer('b1', { nextStepKey: 'a' })] }),
      node('n_out', 'out', { type: 'endpoint', questionType: 'qualified_result', answers: [] }),
    ],
  }
  const v = validateQuizFlow(trap)
  const cycles = getCheck(v, 'cycle_traps')
  t(!cycles.ok && hasIssue(cycles, 'cycle_trap'), 'two steps routing to each other with no way out fails cycle_traps')
  t(cycles.errors.some((e) => e.message.includes('can never leave')), 'and the message says what the visitor experiences')
  t(!getCheck(v, 'valid_terminals').ok && hasIssue(getCheck(v, 'valid_terminals'), 'non_terminating_path'), 'a trapped loop also fails valid_terminals as a non-terminating path')
  t(!getCheck(v, 'reachability').ok, 'and the endpoint behind the trap is unreachable')

  // The same loop with one way out is a "change your answer" route, not a bug.
  const backEdge: Quiz = {
    ...trap,
    nodes: trap.nodes.map((n) =>
      n.id === 'n_b' ? { ...n, answers: [answer('b1', { nextStepKey: 'a' }), answer('b2', { nextStepKey: 'out' })] } : n,
    ),
  }
  const escapable = validateQuizFlow(backEdge)
  const loop = getCheck(escapable, 'cycle_traps')
  t(loop.ok, 'the same loop with one route out PASSES cycle_traps - a back-edge is a feature, not a defect')
  t(loop.notes.some((n) => n.includes('legitimate back-edge')), 'and the report says which loop it found and why it is not a trap')
  t(getCheck(escapable, 'valid_terminals').ok, 'and the branch that loops forever is not reported as a broken terminal, because the visitor can always leave')
  t(
    getCheck(escapable, 'valid_terminals').notes.some((n) => n.includes('loop back')),
    'though it is still counted, so a loop is never invisible',
  )
  t(getCheck(escapable, 'reachability').ok, 'and every step is now reachable')

  t(getCheck(validateQuizFlow(cleanQuiz()), 'cycle_traps').notes.some((n) => n.includes('no loops at all')), 'a flow with no loops says so explicitly')
}

// 5. valid terminals
{
  const deadEnd = broken((q) => {
    nodeOf(q, 'n_lead').answers = []
  })
  const terminals = getCheck(validateQuizFlow(deadEnd), 'valid_terminals')
  t(!terminals.ok && hasIssue(terminals, 'dead_end'), 'a visible node with no answers and no route out fails valid_terminals')
  t(terminals.errors.some((e) => e.nodeId === 'n_lead'), 'and the dead end is named by node id')

  const unreachedDeadEnd = broken((q) => {
    q.steps.push(step('after_the_end', 'Stranded'))
    q.nodes.push(node('n_stranded', 'after_the_end', { answers: [] }))
  })
  const unreached = getCheck(validateQuizFlow(unreachedDeadEnd), 'valid_terminals')
  t(unreached.ok && hasIssue(unreached, 'dead_end_unreached'), 'a dead end nobody can reach is a warning, not a failure - reachability owns that defect')

  // A route into a step that has no variant for the active tier. The runtime
  // renders a bare thank-you screen and never submits the lead, which is the
  // most expensive silent failure in the whole flow.
  const stranding: Quiz = {
    tiers: [
      { id: 'ta', name: 'Tier A', color: '#10b981' },
      { id: 'tb', name: 'Tier B', color: '#0ea5e9' },
    ],
    steps: [step('q1', 'First'), step('only_tb', 'Tier B only'), step('done', 'Thank you')],
    customFields: [field('tier')],
    nodes: [
      node('n_q1', 'q1', { answers: [answer('a1', { setTier: 'ta', nextStepKey: 'only_tb' })] }),
      node('n_tb', 'only_tb', { tiers: ['tb'], answers: [answer('b1')] }),
      node('n_done', 'done', { type: 'endpoint', questionType: 'qualified_result', answers: [] }),
    ],
  }
  const stranded = getCheck(validateQuizFlow(stranding), 'valid_terminals')
  t(!stranded.ok && hasIssue(stranded, 'route_to_missing_variant'), 'routing a tiered visitor into a step with no variant for them fails valid_terminals')
  t(
    stranded.errors.some((e) => e.message.includes('never submits the lead')),
    'and the message says the lead is lost, which is the part that costs money',
  )
  t(enumeratePaths(stranding).rows.every((r) => !r.submitsLead), 'and no path on that quiz is recorded as submitting a lead')

  // Running out of steps is a legitimate ending, not a defect.
  const runsOut: Quiz = {
    tiers: [],
    steps: [step('q1', 'First'), step('lead', 'Lead form')],
    customFields: [],
    nodes: [
      node('n_q1', 'q1', { answers: [answer('a1')] }),
      node('n_lead', 'lead', { type: 'form', questionType: 'lead_form', answers: [answer('s1')] }),
    ],
  }
  const out = validateQuizFlow(runsOut)
  t(getCheck(out, 'valid_terminals').ok, 'running out of steps is a valid ending, not a dead end')
  t(enumeratePaths(runsOut).rows.every((r) => r.terminalKind === 'out_of_steps' && r.submitsLead), 'and the lead is still recorded as submitted there')
}

// 6. tier reachability
{
  const orphanTier = broken((q) => {
    q.tiers.push({ id: 'tb', name: 'Tier B', color: '#f43f5e' })
  })
  const check = getCheck(validateQuizFlow(orphanTier), 'tier_reachability')
  t(!check.ok && hasIssue(check, 'unreachable_tier'), 'a tier nothing ever sets fails tier_reachability')
  t(check.errors.some((e) => e.tierId === 'tb' && e.message.includes('no answer sets it')), 'and the message says why it is unreachable')

  const shadowed = broken((q) => {
    // The tier is set, but a shared variant on the same row hides the tier's
    // own variant, so the variant can never be resolved.
    q.nodes.push(node('n_extra_shared', 'extra', { answers: [answer('shared_ok')] }))
  })
  const shadow = getCheck(validateQuizFlow(shadowed), 'tier_reachability')
  t(hasIssue(shadow, 'variant_shadowed_by_shared'), 'a tier variant hidden behind a shared variant on the same row is reported as shadowed')
  t(
    shadow.warnings.some((w) => w.nodeId === 'n_extra' && w.message.includes('shared wins')),
    'and the report says why - shared beats a tier variant - rather than only that it is unreachable',
  )
  // This used to be asserted against the seed, which exhibited it only because
  // the tier lookup never ran and the tier-scoped rows were therefore never
  // entered in their tier. The seed no longer has the defect, so the case gets
  // a fixture that actually has it: Tier A is active, but the answer that sets
  // it jumps straight past the row Tier A's own variant lives on.
  const stepSkippedInTier = broken((q) => {
    answerOf(q, 'n_q1', 'q1_yes').nextStepKey = 'lead'
  })
  const skipped = getCheck(validateQuizFlow(stepSkippedInTier), 'tier_reachability')
  t(
    skipped.warnings.some((w) => w.code === 'variant_step_not_reached_in_tier' && w.nodeId === 'n_extra'),
    'a tier variant on a row nobody reaches in that tier is reported differently from a shadowed one',
  )

  const taggedNotSwitched = broken((q) => {
    answerOf(q, 'n_q1', 'q1_no').fieldMappings = [{ key: 'tier', value: 'ta' }]
  })
  const tagged = getCheck(validateQuizFlow(taggedNotSwitched), 'tier_reachability')
  t(
    hasIssue(tagged, 'tier_value_without_set_tier'),
    'writing the tier FIELD without setting the routing tier is reported - the lead is tagged with a tier the flow never switched to',
  )

  const noTiers = getCheck(validateQuizFlow({ ...cleanQuiz(), tiers: [] }), 'tier_reachability')
  t(noTiers.ok && noTiers.notes.some((n) => n.includes('no tiers')), 'a quiz with no tiers passes tier_reachability and says so')
}

// 7. qualification determinism
{
  const orderDependent = broken((q) => {
    answerOf(q, 'n_q1', 'q1_yes').fieldMappings = [
      { key: 'answer', value: 'first' },
      { key: 'answer', value: 'second' },
    ]
  })
  const check = getCheck(validateQuizFlow(orderDependent), 'qualification_determinism')
  t(
    !check.ok && hasIssue(check, 'order_dependent_mapping'),
    'an answer writing the same field twice fails qualification_determinism - the stored value depends on list order',
  )

  const aiRouted = broken((q) => {
    q.customFields = [...(q.customFields ?? []), field('ai_verdict')]
    q.steps.splice(1, 0, step('route', 'Decision'))
    nodeOf(q, 'n_q1').ai = { enabled: true, outputField: 'ai_verdict' }
    q.nodes.push(
      node('n_route', 'route', {
        type: 'decision',
        questionType: 'decision',
        isVisible: false,
        answers: [],
        conditions: [{ id: 'c1', field: 'ai_verdict', operator: 'contains', value: 'strong', nextStepKey: 'lead' }],
        defaultNextStepKey: 'lead',
      }),
    )
  })
  const ai = getCheck(validateQuizFlow(aiRouted), 'qualification_determinism')
  t(
    !ai.ok && hasIssue(ai, 'route_depends_on_ai_output'),
    'routing on a field an AI node writes fails qualification_determinism - the same answers could qualify one lead and not the next',
  )

  t(getCheck(validateQuizFlow(cleanQuiz()), 'qualification_determinism').notes.some((n) => n.includes('replayed')), 'a passing determinism check states how many paths it replayed')
}

// 8. destination validity
{
  const noUrl = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'immediate', destination: 'custom', url: '' }
  })
  const missing = getCheck(validateQuizFlow(noUrl), 'destination_validity')
  t(!missing.ok && hasIssue(missing, 'redirect_without_url'), 'an endpoint set to redirect with no URL fails destination_validity')

  const unknownKey = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'button', destination: 'nowhere_at_all' }
  })
  const unknown = getCheck(validateQuizFlow(unknownKey), 'destination_validity')
  t(!unknown.ok && hasIssue(unknown, 'unknown_destination'), 'an endpoint naming a destination this platform does not resolve fails destination_validity')

  const hostile = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'button', destination: 'custom', url: 'javascript:alert(1)' }
  })
  const unsafe = getCheck(validateQuizFlow(hostile), 'destination_validity')
  t(!unsafe.ok && hasIssue(unsafe, 'unsafe_destination_url'), 'a javascript: destination fails destination_validity')

  const protocolRelative = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'button', destination: 'custom', url: '//evil.example/steal' }
  })
  t(hasIssue(getCheck(validateQuizFlow(protocolRelative), 'destination_validity'), 'unsafe_destination_url'), 'a protocol-relative destination fails too')

  const badMode = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'teleport', destination: 'thank_you' }
  })
  t(hasIssue(getCheck(validateQuizFlow(badMode), 'destination_validity'), 'unknown_redirect_mode'), 'a redirect mode the runtime does not understand fails destination_validity')

  // An interpolated URL can only be judged against a real answer set, so this
  // one has to come from the path walk rather than from the node.
  const interpolated = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'button', destination: 'custom', url: '{{answer}}' }
  })
  const perPath = getCheck(validateQuizFlow(interpolated), 'destination_validity')
  t(
    !perPath.ok && hasIssue(perPath, 'unresolvable_destination'),
    'a URL built entirely from a captured answer fails destination_validity, because the value it interpolates is not a safe URL',
  )

  const safeInterpolation = broken((q) => {
    nodeOf(q, 'n_done').redirect = { mode: 'button', destination: 'custom', url: 'https://partner.example/ok?a={{answer}}' }
  })
  t(getCheck(validateQuizFlow(safeInterpolation), 'destination_validity').ok, 'an interpolated URL that stays safe for every path passes')

  const noRedirect = broken((q) => {
    delete nodeOf(q, 'n_done').redirect
  })
  t(getCheck(validateQuizFlow(noRedirect), 'destination_validity').ok, 'an endpoint that simply shows its own thank-you card is valid')
}

// 9. reachable required consent
{
  const noForm: Quiz = {
    tiers: [],
    steps: [step('q1', 'First'), step('done', 'Thank you')],
    customFields: [],
    nodes: [
      node('n_q1', 'q1', { answers: [answer('a1')] }),
      node('n_done', 'done', { type: 'endpoint', questionType: 'qualified_result', answers: [] }),
    ],
  }
  const none = getCheck(validateQuizFlow(noForm), 'reachable_consent')
  t(!none.ok && hasIssue(none, 'no_consent_surface'), 'a quiz with no form node anywhere fails reachable_consent')
  t(hasIssue(none, 'path_without_consent'), 'and every submitting path is reported as consent-less')

  // One branch has the form, the other skips straight to the endpoint.
  const halfConsented = broken((q) => {
    answerOf(q, 'n_q1', 'q1_no').nextStepKey = 'done'
  })
  const half = getCheck(validateQuizFlow(halfConsented), 'reachable_consent')
  t(!half.ok && hasIssue(half, 'path_without_consent'), 'a single branch that reaches the endpoint without a form fails reachable_consent')
  t(!hasIssue(half, 'no_consent_surface'), 'and it is not reported as having no consent surface - the form exists, that path just misses it')
  t(half.notes.some((n) => n.includes('TCPA')), 'the check states what consent means here rather than assuming the reader knows')

  t(getCheck(validateQuizFlow(cleanQuiz()), 'reachable_consent').ok, 'a quiz whose every path reaches the lead form passes reachable_consent')
}

// 10. path table and the safe branch limit
{
  t(MAX_PATHS === 5000, `the safe branch limit is a declared constant of 5000 (found ${MAX_PATHS})`)
  t(MAX_DEPTH === 60, `the depth limit is a declared constant of 60 (found ${MAX_DEPTH})`)

  // A single wide node emits one row per answer without ever recursing - a
  // shape the seed never produces, and the one where a limit guarded only at
  // the branch points would be easiest to get wrong.
  const wide: Quiz = {
    tiers: [],
    steps: [step('only', 'One wide question')],
    customFields: [],
    nodes: [node('n_wide', 'only', { answers: Array.from({ length: 10 }, (_, i) => answer(`w${i}`)) })],
  }
  t(enumeratePaths(wide).rows.length === 10, 'the wide fixture really does produce ten paths from one node')
  const clipped = enumeratePaths(wide, { maxPaths: 3 })
  t(clipped.rows.length === 3, `the limit binds even when one node emits every row (produced ${clipped.rows.length} for a cap of 3)`)
  t(clipped.truncated, 'and that truncation is reported')

  // The boundary in both directions. A table that ends exactly ON the limit is
  // complete, and calling it truncated would fail a quiz that is fine.
  const exact = enumeratePaths(wide, { maxPaths: 10 })
  t(exact.rows.length === 10 && !exact.truncated, 'a flow with exactly as many paths as the limit is NOT reported as truncated')
  const oneShort = enumeratePaths(wide, { maxPaths: 9 })
  t(oneShort.rows.length === 9 && oneShort.truncated, 'and one path over the limit IS')

  const capped = enumeratePaths(seed, { maxPaths: 5 })
  t(capped.rows.length === 5, `the path limit is enforced (produced ${capped.rows.length} rows for a cap of 5)`)
  t(capped.truncated, 'and the enumeration reports that it was truncated')
  t(String(capped.truncationReason).includes('5'), `and says which limit stopped it ("${capped.truncationReason}")`)
  t(json(capped.limits) === json({ maxPaths: 5, maxDepth: MAX_DEPTH }), 'and reports the limits it ran under')

  const v = validateQuizFlow(seed, { maxPaths: 5 })
  const table = getCheck(v, 'path_table')
  t(!table.ok && hasIssue(table, 'branch_limit_reached'), 'a truncated table FAILS path_table - it must never read as exhaustive')
  t(table.errors.some((e) => e.message.includes('INCOMPLETE')), 'and says so in the message rather than in a footnote')
  t(!v.ok, 'so the whole validation fails rather than reporting a partial result as a pass')
  t(
    getCheck(v, 'reachability').notes.some((n) => n.includes('truncated')),
    'and the checks that depend on completeness say their result is partial',
  )
  t(
    getCheck(v, 'reachability').notes.some((n) => n.includes('never reports a reachable one as unreachable')),
    'and explain which direction the partial result can err in',
  )

  const deepest = enumeratePaths(seed).rows.reduce((m, r) => Math.max(m, r.nodeIds.length), 0)
  t(deepest === 16 && deepest < MAX_DEPTH, `the seed's deepest path is ${deepest} nodes, comfortably inside the depth limit of ${MAX_DEPTH}`)

  // The depth boundary, both directions. A path that ENDS at the limit is an
  // outcome; only a path with somewhere left to go is a truncation.
  const atDepth = enumeratePaths(cleanQuiz(), { maxDepth: 3 })
  t(!atDepth.truncated && atDepth.rows.every((r) => r.terminalKind === 'endpoint'), 'a path that ends exactly at the depth limit is an outcome, not a truncation')
  const overDepth = enumeratePaths(cleanQuiz(), { maxDepth: 2 })
  t(overDepth.truncated && overDepth.rows.some((r) => r.terminalKind === 'depth_limit'), 'and a path with somewhere left to go at the limit is cut and reported')

  const deep = enumeratePaths(seed, { maxDepth: 2 })
  t(deep.truncated && String(deep.truncationReason).includes('depth'), 'the depth limit is enforced and reported separately from the path limit')
  t(deep.rows.some((r) => r.terminalKind === 'depth_limit'), 'and a path cut by depth is marked as a truncation rather than as an outcome')
  t(
    getCheck(validateQuizFlow(seed, { maxDepth: 2 }), 'valid_terminals').warnings.some((w) => w.code === 'depth_limit'),
    'a depth-cut path is a warning on valid_terminals, not a silent pass',
  )

  const full = getCheck(validateQuizFlow(seed), 'path_table')
  t(full.ok, 'the seed table is exhaustive at the default limits')
  t(full.notes.some((n) => n.includes('exhaustive')), 'and says so explicitly')
  t(full.notes.some((n) => n.includes('3564')), 'and states how many paths it covers')

  // The table itself: every column a row is supposed to carry.
  const rows = buildPathTable(seed, {}).rows
  t(rows.length === 3564, 'the path-to-outcome table has one row per path')
  t(rows.every((r) => Array.isArray(r.answerIds)), 'every row carries the ordered answer ids it took')
  t(rows.every((r) => r.tier === null || seed.tiers.some((x) => x.id === r.tier)), 'every row carries a declared tier or none')
  t(rows.every((r) => typeof r.dqLead === 'boolean'), 'every row carries the dq_lead outcome')
  t(rows.every((r) => typeof r.terminalNodeId === 'string' && seed.nodes.some((n) => n.id === r.terminalNodeId)), 'every row names a terminal node that exists')
  t(rows.every((r) => 'destination' in r && 'destinationUrl' in r), 'every row carries a destination and its resolved URL')
  t(new Set(rows.map((r) => r.terminalNodeId)).size === 2, 'the seed table resolves to exactly two terminals')
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
