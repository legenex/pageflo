/**
 * Walking a quiz flow the way a visitor really walks it.
 *
 * The whole point of this module is that it is not a second opinion. Every
 * routing decision here is taken by calling the SAME primitives the public
 * runtime calls (`resolveNodeForStep`, `explicitStepIndex`,
 * `nextSequentialStepIndex`, `entryStepIndex` from `quiz-graph`), in the same
 * order `QuizRuntime.advance()` takes them. A validator that modelled the flow
 * with its own traversal would eventually disagree with the runtime, and a
 * validator that disagrees with the runtime is worse than none: it certifies a
 * flow that behaves differently in production.
 *
 * The semantics reproduced here, in the runtime's own order:
 *
 *   1. `answer.fieldMappings` are written into the value bag (empty keys are
 *      dropped, exactly as `if (m.key)` does).
 *   2. `answer.isDQ` sets `dq_lead = 'yes'`.
 *   3. `answer.setTier` sets both the routing tier and the `tier` value.
 *   4. A `decision` node evaluates `conditions` in order; the FIRST condition
 *      that both matches AND resolves to a real step wins. A condition that
 *      matches but names a step that no longer exists falls through to the next
 *      condition - that is what the runtime does, and reproducing it is the
 *      only way this module can be used to reason about the runtime.
 *   5. Then `defaultNextStepKey`, then `answer.nextStepKey`, then sequential
 *      fall-through, and running out of steps is itself an end (the lead is
 *      submitted there too).
 *
 * Presentation is deliberately absent. `enumeratePaths` takes a quiz and
 * nothing else - there is no template id and no brand to pass it, so it is not
 * possible for either to influence an outcome. That is stronger than checking
 * afterwards that they did not. `buildPathTable` layers the one thing that IS
 * brand-dependent - the URL a named destination resolves to - on top of an
 * already-computed flow result, and can only add a column.
 *
 * Pure and isomorphic: no React, no server imports, no clock, no randomness.
 */

import { isNodeVisible } from '@/components/builder/quiz/seed-data'
import {
  DESTINATION_KEYS,
  resolveRedirectUrl,
  type DestinationKey,
  type NodeRedirect,
} from '@/lib/quiz-destinations'
import {
  entryStepIndex,
  explicitStepIndex,
  nextSequentialStepIndex,
  resolveNodeForStep,
  type Answer,
  type Condition,
  type Quiz,
  type QuizNode,
} from '@/lib/quiz-graph'

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * How many complete paths the enumerator will produce before it stops.
 *
 * 5000 is chosen against the real fixtures rather than pulled from the air: the
 * seeded 18-step MVA quiz produces 1404 paths, so the cap leaves roughly 3x
 * headroom for a quiz of that shape to grow before it stops being enumerable.
 * Past that the table stops being something a human reads and the checks that
 * depend on completeness (reachability, terminals, determinism) would start
 * reporting partial results.
 *
 * Truncation is therefore reported as a FAILING check, not a note. A table that
 * silently stopped at 5000 rows reads as exhaustive, and every conclusion drawn
 * from it - "no path misses consent", "no path dead-ends" - would be unsound.
 */
export const MAX_PATHS = 5000

/**
 * How many nodes deep one path may go. The seed's longest path is 12, so 60 is
 * far above any authored flow while still bounding a routing mistake that walks
 * forward forever without repeating a state (each hop must change the value bag
 * for the cycle guard not to catch it, which cannot go on for long).
 */
export const MAX_DEPTH = 60

// ---------------------------------------------------------------------------
// Node classification
// ---------------------------------------------------------------------------

/**
 * Node types that exist for the flow author and never for the visitor. They
 * execute and advance on their own behind a spinner.
 *
 * This MIRRORS `INVISIBLE_NODE_TYPES` in
 * `src/components/public/quiz/QuizRuntime.tsx`, which declares it as a module
 * local and does not export it. Two lists is exactly the drift this module
 * exists to prevent, so `scripts/test-quiz-flow.mts` reads the runtime's source
 * and fails when the two stop agreeing. The right end state is the runtime
 * importing this constant; that file is outside this module's remit.
 */
export const NON_VISITOR_NODE_TYPES: readonly string[] = [
  'decision',
  'webhook',
  'verification',
  'transition',
]

const NON_VISITOR = new Set<string>(NON_VISITOR_NODE_TYPES)

/**
 * The node types that call an outside service and map its answer back into the
 * value bag.
 *
 * Mirrors `WEBHOOK_NODE_TYPES` in `src/components/public/quiz/QuizRuntime.tsx`,
 * and `scripts/test-quiz-flow.mts` reads the runtime's source to fail when the
 * two stop agreeing - the same guard the non-visitor list already has, for the
 * same reason.
 */
export const WEBHOOK_NODE_TYPES_LIST: readonly string[] = ['webhook', 'verification']

const WEBHOOK_NODE_TYPES = new Set<string>(WEBHOOK_NODE_TYPES_LIST)

/** The operators `QuizRuntime.advance()` understands. Anything else is false. */
export const CONDITION_OPERATORS: readonly string[] = [
  'eq',
  'neq',
  'contains',
  'is_empty',
  'is_not_empty',
]

const OPERATORS = new Set<string>(CONDITION_OPERATORS)

/**
 * True when the visitor never gets to answer this node: the runtime advances it
 * for them. Covers both the non-visitor types and any node the author hid.
 */
export const isAutoAdvanceNode = (node: QuizNode): boolean =>
  NON_VISITOR.has(node.type) || !isNodeVisible(node)

/** Exactly the runtime's operator chain, including its `false` default. */
export const evaluateCondition = (cond: Condition, values: FlowValues): boolean => {
  const v = values[cond.field] || ''
  switch (cond.operator) {
    case 'eq':
      return v === cond.value
    case 'neq':
      return v !== cond.value
    case 'contains':
      return String(v).includes(cond.value)
    case 'is_empty':
      return !v
    case 'is_not_empty':
      return Boolean(v)
    default:
      return false
  }
}

export const isKnownOperator = (operator: string): boolean => OPERATORS.has(operator)

// ---------------------------------------------------------------------------
// Traversal state
// ---------------------------------------------------------------------------

export type FlowValues = Readonly<Record<string, string>>

export type FlowState = {
  readonly stepIndex: number
  readonly tier: string | null
  readonly values: FlowValues
}

/**
 * The id on the synthetic answer used for a hop the visitor did not choose.
 *
 * It is never written into a path's `answerIds`: an auto-advanced hop is not a
 * choice, so recording it would put something in the answer sequence that no
 * visitor could ever have supplied, and the sequence has to be replayable.
 */
export const AUTO_ANSWER_ID = '__auto__'

/** What the runtime hands `advance()` when it skips a node for the visitor. */
const AUTO_ANSWER: Answer = Object.freeze({ id: AUTO_ANSWER_ID, label: '', nextStepKey: '' })

export type NodeSituation =
  /** The step exists but resolves to no variant for the active tier. */
  | { kind: 'missing'; node: null }
  /** An endpoint: the visitor has no control to advance with. */
  | { kind: 'terminal'; node: QuizNode }
  /** Visible, not an endpoint, and nothing to answer with. */
  | { kind: 'dead_end'; node: QuizNode }
  /** Executes and advances itself. */
  | { kind: 'auto'; node: QuizNode; answer: Answer }
  /**
   * Executes, advances itself, and can land in more than one state because an
   * outside service decided something. The visitor still chose nothing, so this
   * never contributes to a path's answer sequence.
   */
  | { kind: 'auto_branch'; node: QuizNode; answers: readonly Answer[] }
  | { kind: 'choose'; node: QuizNode; answers: readonly Answer[] }

/**
 * What the visitor meets at a state.
 *
 * `auto` is tested before `terminal` because a hidden endpoint (`isVisible:
 * false`) is skipped by the runtime's skip effect and keeps going, even though
 * its submit effect also fires. Routing follows the skip, so that is what this
 * models.
 *
 * A node with no answers is reported as a dead end even for the input-style
 * question types where `submitSelected` would synthesise a nameless answer from
 * the typed value: a flow whose only exit is that implicit fall-through was not
 * authored deliberately, and treating it as a legitimate route would hide the
 * far more common case (a button question with its answers deleted) where there
 * is genuinely no way forward.
 */
/**
 * The id recorded for the branch where the lookup told the flow nothing.
 *
 * Shared with `AUTO_ANSWER` so the no-response branch of a webhook node and a
 * plain auto-advanced node read identically in a replay.
 */
export const LOOKUP_NO_RESPONSE_ID = AUTO_ANSWER_ID

/**
 * A stable, readable id for one outcome of one lookup node.
 *
 * It names the node as well as the value because two lookups can both write
 * `tier`, and a replay has to be able to tell which one it is replaying.
 */
export const lookupOutcomeId = (node: QuizNode, key: string, value: string): string =>
  `__lookup:${node.id}:${key}=${value}__`

/** The field keys a node's response mappings write, in author order. */
const responseMappingKeys = (node: QuizNode): string[] => {
  const raw = node.responseMappings
  if (!Array.isArray(raw)) return []
  const keys: string[] = []
  for (const mapping of raw) {
    if (!mapping || typeof mapping !== 'object') continue
    const key = (mapping as Record<string, unknown>).fieldKey
    if (typeof key === 'string' && key && !keys.includes(key)) keys.push(key)
  }
  return keys
}

/** Every value the flow's own conditions compare `field` against. */
const conditionValuesFor = (quiz: Quiz, field: string): string[] => {
  const out: string[] = []
  for (const node of quiz.nodes) {
    for (const cond of node.conditions ?? []) {
      if (cond.field !== field) continue
      const value = typeof cond.value === 'string' ? cond.value : ''
      if (value && !out.includes(value)) out.push(value)
    }
  }
  return out
}

/**
 * What a webhook or verification node can leave behind.
 *
 * The runtime CALLS these nodes and merges the mapped fields into the value bag
 * (`QuizRuntime.advance`), so their outcome steers everything downstream. What
 * the outcome IS lives on a buyer's endpoint, not in this quiz, and this module
 * refuses to invent it. So the branch enumerates the outcomes the flow itself
 * distinguishes:
 *
 *   - the endpoint failing, timing out, or omitting the key. This is FIRST and
 *     is always present, because a lookup that does not answer is the one case
 *     guaranteed to happen eventually, and the flow still has to work.
 *   - a mapping onto `tier`: one branch per tier the quiz DECLARES. The runtime
 *     ignores a returned tier it does not declare, so branching over anything
 *     else would model a state the runtime cannot enter.
 *   - a mapping onto any other field: one branch per value the author's own
 *     conditions test for. A value nothing routes on cannot change a path.
 *
 * KNOWN APPROXIMATION, stated rather than hidden: fields branch INDEPENDENTLY
 * rather than as a cross-product. A node mapping two fields that are each
 * routed on will not enumerate every combination of the two. That is sound for
 * the reachability questions this feeds (each branch is a state the runtime can
 * really be in) and unsound for "is this combination possible", which nothing
 * asks yet. The cross-product is exponential in mapped fields and would trade a
 * real limit for a path explosion.
 */
const webhookOutcomes = (quiz: Quiz, node: QuizNode): readonly Answer[] | null => {
  if (!WEBHOOK_NODE_TYPES.has(node.type)) return null
  if (typeof node.webhookUrl !== 'string' || !node.webhookUrl) return null
  const keys = responseMappingKeys(node)
  if (keys.length === 0) return null

  // The no-answer branch. Identical to AUTO_ANSWER on purpose: it is exactly
  // what the runtime advances with when the call fails.
  const outcomes: Answer[] = [AUTO_ANSWER]

  for (const key of keys) {
    if (key === 'tier') {
      for (const tier of quiz.tiers) {
        if (!tier?.id) continue
        outcomes.push(
          Object.freeze({
            id: lookupOutcomeId(node, 'tier', tier.id),
            label: '',
            nextStepKey: '',
            setTier: tier.id,
          }) as Answer,
        )
      }
      continue
    }
    for (const value of conditionValuesFor(quiz, key)) {
      outcomes.push(
        Object.freeze({
          id: lookupOutcomeId(node, key, value),
          label: '',
          nextStepKey: '',
          fieldMappings: [{ key, value }],
        }) as Answer,
      )
    }
  }

  // Only the no-answer branch survived: nothing downstream reads what this node
  // writes, so it advances like any other invisible node.
  return outcomes.length > 1 ? outcomes : null
}

export const situationAt = (quiz: Quiz, state: FlowState): NodeSituation => {
  const step = quiz.steps[state.stepIndex]
  const node = step ? resolveNodeForStep(quiz, step.key, state.tier) : null
  if (!node) return { kind: 'missing', node: null }
  if (isAutoAdvanceNode(node)) {
    const outcomes = webhookOutcomes(quiz, node)
    if (outcomes) return { kind: 'auto_branch', node, answers: outcomes }
    return { kind: 'auto', node, answer: AUTO_ANSWER }
  }
  if (node.type === 'endpoint') return { kind: 'terminal', node }
  const answers = node.answers ?? []
  if (answers.length === 0) return { kind: 'dead_end', node }
  return { kind: 'choose', node, answers }
}

export type AdvanceResult =
  | { kind: 'step'; state: FlowState; via: 'condition' | 'default' | 'explicit' | 'sequential' }
  /** Ran out of steps. The runtime treats this as the end of the funnel. */
  | { kind: 'end'; values: FlowValues; tier: string | null }

/**
 * One hop, in `QuizRuntime.advance()`'s order.
 *
 * The decision block is entered only when `node.conditions` is truthy, matching
 * the runtime: a decision authored with no `conditions` array at all skips its
 * own `defaultNextStepKey`. That is a runtime quirk rather than a design, and
 * the validator reports it - but it is reproduced here rather than corrected,
 * because this module's job is to say what the runtime will do.
 */
export const advanceFrom = (
  quiz: Quiz,
  state: FlowState,
  node: QuizNode,
  answer: Answer,
): AdvanceResult => {
  const values: Record<string, string> = { ...state.values }
  for (const m of answer.fieldMappings ?? []) if (m.key) values[m.key] = m.value
  if (answer.isDQ) values.dq_lead = 'yes'
  if (answer.setTier) values.tier = answer.setTier

  const tier: string | null = answer.setTier || state.tier
  const to = (stepIndex: number, via: 'condition' | 'default' | 'explicit' | 'sequential'): AdvanceResult => ({
    kind: 'step',
    state: { stepIndex, tier, values },
    via,
  })

  if (node.type === 'decision' && node.conditions) {
    for (const cond of node.conditions) {
      if (!evaluateCondition(cond, values)) continue
      const ti = explicitStepIndex(quiz, cond.nextStepKey)
      if (ti >= 0) return to(ti, 'condition')
    }
    const di = explicitStepIndex(quiz, node.defaultNextStepKey)
    if (di >= 0) return to(di, 'default')
  }

  const ei = explicitStepIndex(quiz, answer.nextStepKey)
  if (ei >= 0) return to(ei, 'explicit')

  const seq = nextSequentialStepIndex(quiz, state.stepIndex, tier)
  if (seq >= 0) return to(seq, 'sequential')

  return { kind: 'end', values, tier }
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

/**
 * Read a node's stored redirect without trusting its shape. `QuizNode` carries
 * an index signature, so `node.redirect` arrives as `unknown` and a stored blob
 * can be anything a migration or a hand-edit left behind.
 */
export const readRedirect = (node: QuizNode | null | undefined): NodeRedirect | null => {
  if (!node) return null
  const raw = node.redirect
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const mode = typeof r.mode === 'string' ? r.mode : undefined
  const destination = typeof r.destination === 'string' ? r.destination : undefined
  return {
    mode: mode as NodeRedirect['mode'],
    destination: destination as NodeRedirect['destination'],
    url: typeof r.url === 'string' ? r.url : undefined,
    buttonText: typeof r.buttonText === 'string' ? r.buttonText : undefined,
  }
}

const REDIRECT_MODES = new Set(['none', 'button', 'immediate'])

export type PathDestination =
  /** No redirect configured: the endpoint's own thank-you card is the end. */
  | { kind: 'none' }
  /** A named destination. The URL is brand-resolved, so it is not decided here. */
  | { kind: 'named'; key: DestinationKey }
  /** A one-off URL, already interpolated and validated. */
  | { kind: 'custom'; url: string }
  /** Configured to go somewhere and cannot: the visitor lands on a dead card. */
  | { kind: 'unresolvable'; reason: string }

/**
 * What a terminal node sends the visitor to, WITHOUT consulting a brand.
 *
 * A named destination always resolves for every brand (`resolveDestination`
 * floors at `DEFAULT_PATHS`), so its validity is brand-independent and the key
 * alone is the honest answer here. Only a custom URL can fail, and it fails on
 * the node's own value plus the path's own captured fields.
 */
export const destinationFor = (node: QuizNode | null, values: FlowValues): PathDestination => {
  const redirect = readRedirect(node)
  if (!redirect || !redirect.mode || redirect.mode === 'none') return { kind: 'none' }
  if (!REDIRECT_MODES.has(redirect.mode)) {
    return { kind: 'unresolvable', reason: `unknown redirect mode "${redirect.mode}"` }
  }
  const kind = redirect.destination ?? 'custom'
  if (kind === 'custom') {
    const url = resolveRedirectUrl(redirect, {}, { ...values })
    if (url) return { kind: 'custom', url }
    const raw = (redirect.url ?? '').trim()
    return {
      kind: 'unresolvable',
      reason: raw ? `custom URL "${raw}" is not a safe destination` : 'custom redirect with no URL',
    }
  }
  if (!DESTINATION_KEYS.includes(kind as DestinationKey)) {
    return { kind: 'unresolvable', reason: `unknown destination "${kind}"` }
  }
  return { kind: 'named', key: kind as DestinationKey }
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

export type TerminalKind =
  /** An endpoint node. The lead is submitted. */
  | 'endpoint'
  /** Ran out of steps. Also an end, and the lead is also submitted. */
  | 'out_of_steps'
  /** A visible non-endpoint node with nothing to answer. The visitor is stuck. */
  | 'dead_end'
  /** A route landed on a step that has no variant for the active tier. */
  | 'missing_variant'
  /** The exact same state repeated, so this branch never terminates. */
  | 'cycle'
  /** The depth bound was hit; this row is a truncation, not an outcome. */
  | 'depth_limit'

export type PathRow = {
  /** The answers the visitor chose, in order. Auto-advanced hops are not choices. */
  answerIds: string[]
  /**
   * What each lookup node returned along this path, in order.
   *
   * The visitor did not choose these, so they are kept out of `answerIds` - but
   * they DO decide the outcome, so an outcome is a function of the two lists
   * together rather than of the answers alone. That is what keeps the
   * determinism check meaningful now that webhook nodes really execute.
   */
  lookupOutcomeIds: string[]
  /** Every node entered, in order, including the ones the visitor never saw. */
  nodeIds: string[]
  /** Form nodes passed through. Consent is rendered on these. */
  formNodeIds: string[]
  tier: string | null
  dqLead: boolean
  values: Record<string, string>
  terminalNodeId: string | null
  terminalStepKey: string | null
  /** Index of the step the path stopped on, so the (step, tier) state is known. */
  terminalStepIndex: number | null
  terminalKind: TerminalKind
  destination: PathDestination
  /** True where the runtime persists the lead: an endpoint, or out of steps. */
  submitsLead: boolean
}

export type EnumerationOptions = {
  maxPaths?: number
  maxDepth?: number
}

export type PathEnumeration = {
  rows: PathRow[]
  /** True when a limit stopped the walk. Everything derived from it is partial. */
  truncated: boolean
  truncationReason: string | null
  limits: { maxPaths: number; maxDepth: number }
  /** `${stepIndex}:${tier}` for every state entered. */
  visitedStateKeys: string[]
  visitedStepKeys: string[]
  visitedNodeIds: string[]
  /** Nodes resolved while one of their OWN declared tiers was the active one. */
  tierMatchedNodeIds: string[]
  /** Tiers that actually became active on some path. */
  activeTiers: string[]
}

const valuesSignature = (values: FlowValues): string =>
  Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join('')

const stateSignature = (state: FlowState): string =>
  `${state.stepIndex}${state.tier ?? ''}${valuesSignature(state.values)}`

export const stateKeyOf = (stepIndex: number, tier: string | null): string =>
  `${stepIndex}:${tier ?? ''}`

/**
 * Every route a visitor can take, depth-first in authored answer order.
 *
 * Cycles are cut on an EXACT state repeat - same step, same tier, same value
 * bag. That distinction is what makes a "change your answer" back-edge legal:
 * going back and answering differently changes the bag, so the walk continues.
 * Going back and answering identically reproduces the state, which is a branch
 * that would loop forever, and it is recorded as one rather than explored.
 */
export const enumeratePaths = (quiz: Quiz, options: EnumerationOptions = {}): PathEnumeration => {
  const maxPaths = options.maxPaths ?? MAX_PATHS
  const maxDepth = options.maxDepth ?? MAX_DEPTH

  const rows: PathRow[] = []
  let depthCut = false
  const visitedStateKeys = new Set<string>()
  const visitedStepKeys = new Set<string>()
  const visitedNodeIds = new Set<string>()
  const tierMatchedNodeIds = new Set<string>()
  const activeTiers = new Set<string>()

  const answerIds: string[] = []
  const lookupOutcomeIds: string[] = []
  const nodeIds: string[] = []
  const formNodeIds: string[] = []
  const onPath = new Set<string>()

  /**
   * The walk is allowed to produce ONE row past the cap, and that row is
   * dropped at the end.
   *
   * That extra row is what makes "truncated" exact. Stopping at exactly
   * `maxPaths` cannot distinguish a flow with more paths from a flow with
   * precisely that many, and guessing either way is wrong in a way that
   * matters: reporting a complete table as partial fails a quiz that is fine,
   * and reporting a partial one as complete is the failure mode this limit
   * exists to prevent.
   */
  const overflowAt = maxPaths + 1

  const emit = (
    kind: TerminalKind,
    node: QuizNode | null,
    stepIndex: number,
    values: FlowValues,
    tier: string | null,
  ): void => {
    // Enforced in the ONE place a row is created, so the bound holds however
    // the walk is later reorganised. The checks at the branch points below only
    // stop a full walk from descending further; they are an early exit.
    if (rows.length >= overflowAt) return
    rows.push({
      answerIds: [...answerIds],
      lookupOutcomeIds: [...lookupOutcomeIds],
      nodeIds: [...nodeIds],
      formNodeIds: [...formNodeIds],
      tier,
      dqLead: values.dq_lead === 'yes',
      values: { ...values },
      terminalNodeId: node?.id ?? null,
      terminalStepKey: quiz.steps[stepIndex]?.key ?? null,
      terminalStepIndex: quiz.steps[stepIndex] ? stepIndex : null,
      terminalKind: kind,
      destination: kind === 'endpoint' ? destinationFor(node, values) : { kind: 'none' },
      submitsLead: kind === 'endpoint' || kind === 'out_of_steps',
    })
  }

  const walk = (state: FlowState, depth: number): void => {
    if (rows.length >= overflowAt) return

    const step = quiz.steps[state.stepIndex]
    const signature = stateSignature(state)
    if (onPath.has(signature)) {
      emit('cycle', null, state.stepIndex, state.values, state.tier)
      return
    }

    const situation = situationAt(quiz, state)
    if (situation.kind === 'missing') {
      emit('missing_variant', null, state.stepIndex, state.values, state.tier)
      return
    }

    const node = situation.node
    visitedStateKeys.add(stateKeyOf(state.stepIndex, state.tier))
    if (step) visitedStepKeys.add(step.key)
    visitedNodeIds.add(node.id)
    if (state.tier) {
      activeTiers.add(state.tier)
      if (node.tiers?.includes(state.tier)) tierMatchedNodeIds.add(node.id)
    }

    nodeIds.push(node.id)
    const isForm = node.type === 'form'
    if (isForm) formNodeIds.push(node.id)
    onPath.add(signature)

    if (situation.kind === 'terminal') {
      emit('endpoint', node, state.stepIndex, state.values, state.tier)
    } else if (situation.kind === 'dead_end') {
      emit('dead_end', node, state.stepIndex, state.values, state.tier)
    } else if (depth >= maxDepth) {
      // Tested here rather than on entry so that a path which ENDS at this
      // depth is recorded as the outcome it is, and only a path with somewhere
      // left to go is reported as cut.
      depthCut = true
      emit('depth_limit', node, state.stepIndex, state.values, state.tier)
    } else {
      const choices = situation.kind === 'auto' ? [situation.answer] : situation.answers
      for (const answer of choices) {
        const chosen = situation.kind === 'choose'
        const lookedUp = situation.kind === 'auto_branch'
        if (chosen) answerIds.push(answer.id)
        if (lookedUp) lookupOutcomeIds.push(answer.id)
        const result = advanceFrom(quiz, state, node, answer)
        if (result.kind === 'end') emit('out_of_steps', node, state.stepIndex, result.values, result.tier)
        else walk(result.state, depth + 1)
        if (lookedUp) lookupOutcomeIds.pop()
        if (chosen) answerIds.pop()
        if (rows.length >= overflowAt) break
      }
    }

    onPath.delete(signature)
    if (isForm) formNodeIds.pop()
    nodeIds.pop()
  }

  const start = entryStepIndex(quiz, null)
  if (start >= 0) walk({ stepIndex: start, tier: null, values: {} }, 0)

  const overflowed = rows.length > maxPaths
  if (overflowed) rows.length = maxPaths

  const reasons: string[] = []
  if (overflowed) reasons.push(`path limit of ${maxPaths} reached`)
  if (depthCut) reasons.push(`depth limit of ${maxDepth} reached`)

  const sorted = (s: Set<string>): string[] => [...s].sort()

  return {
    rows,
    truncated: reasons.length > 0,
    truncationReason: reasons.length > 0 ? reasons.join('; ') : null,
    limits: { maxPaths, maxDepth },
    visitedStateKeys: sorted(visitedStateKeys),
    visitedStepKeys: sorted(visitedStepKeys),
    visitedNodeIds: sorted(visitedNodeIds),
    tierMatchedNodeIds: sorted(tierMatchedNodeIds),
    activeTiers: sorted(activeTiers),
  }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type ReplayResult = { ok: true; row: PathRow } | { ok: false; error: string }

/**
 * Re-drive the flow from a bare list of answer ids.
 *
 * This is what makes the determinism check mean something. Comparing two runs
 * of the enumerator only proves the enumerator is deterministic; replaying the
 * answer sequence proves the OUTCOME is a function of the visitor's choices,
 * which is the property that has to hold for a qualification decision.
 */
export type ReplayOptions = EnumerationOptions & {
  /**
   * What each lookup node returned, in the order the path met them. Defaults to
   * "the lookup said nothing" at every hop, which is the outcome a replay from
   * answer ids alone can assume.
   */
  lookupOutcomeIds?: readonly string[]
}

export const replayAnswerIds = (
  quiz: Quiz,
  ids: readonly string[],
  options: ReplayOptions = {},
): ReplayResult => {
  const maxDepth = options.maxDepth ?? MAX_DEPTH
  const start = entryStepIndex(quiz, null)
  if (start < 0) return { ok: false, error: 'this quiz has no entry step' }

  let state: FlowState = { stepIndex: start, tier: null, values: {} }
  const nodeIds: string[] = []
  const formNodeIds: string[] = []
  const seen = new Set<string>()
  let cursor = 0
  const lookupIds = options.lookupOutcomeIds ?? []
  let lookupCursor = 0

  const row = (
    kind: TerminalKind,
    node: QuizNode | null,
    stepIndex: number,
    values: FlowValues,
    tier: string | null,
  ): PathRow => ({
    answerIds: ids.slice(0, cursor),
    nodeIds: [...nodeIds],
    formNodeIds: [...formNodeIds],
    tier,
    dqLead: values.dq_lead === 'yes',
    values: { ...values },
    terminalNodeId: node?.id ?? null,
    terminalStepKey: quiz.steps[stepIndex]?.key ?? null,
    terminalStepIndex: quiz.steps[stepIndex] ? stepIndex : null,
    terminalKind: kind,
    destination: kind === 'endpoint' ? destinationFor(node, values) : { kind: 'none' },
    submitsLead: kind === 'endpoint' || kind === 'out_of_steps',
  })

  // A sequence with ids left over does not describe a path through this flow.
  // Accepting it would let a caller "replay" an answer list that the quiz can
  // no longer produce and get a confident answer back.
  const done = (
    kind: TerminalKind,
    node: QuizNode | null,
    stepIndex: number,
    values: FlowValues,
    tier: string | null,
  ): ReplayResult => {
    if (cursor < ids.length) {
      return { ok: false, error: `${ids.length - cursor} answer id(s) left over at the end of the flow` }
    }
    return { ok: true, row: row(kind, node, stepIndex, values, tier) }
  }

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const signature = stateSignature(state)
    if (seen.has(signature)) return done('cycle', null, state.stepIndex, state.values, state.tier)
    seen.add(signature)

    const situation = situationAt(quiz, state)
    if (situation.kind === 'missing') {
      return done('missing_variant', null, state.stepIndex, state.values, state.tier)
    }

    const node = situation.node
    nodeIds.push(node.id)
    if (node.type === 'form') formNodeIds.push(node.id)

    if (situation.kind === 'terminal') {
      return done('endpoint', node, state.stepIndex, state.values, state.tier)
    }
    if (situation.kind === 'dead_end') {
      return done('dead_end', node, state.stepIndex, state.values, state.tier)
    }

    let answer: Answer
    if (situation.kind === 'auto') {
      answer = situation.answer
    } else if (situation.kind === 'auto_branch') {
      // The visitor did not choose what a lookup returned, so it is replayed
      // from the recorded outcome rather than from the answer ids. With no
      // outcome supplied the replay takes the no-response branch, which is what
      // a replay driven by answers alone can honestly assume.
      const wanted = lookupIds[lookupCursor]
      lookupCursor += 1
      if (wanted === undefined || wanted === LOOKUP_NO_RESPONSE_ID) {
        answer = situation.answers[0] ?? AUTO_ANSWER
      } else {
        const found = situation.answers.find((a) => a.id === wanted)
        if (!found) {
          return { ok: false, error: `lookup outcome "${wanted}" is not possible at node "${node.id}"` }
        }
        answer = found
      }
    } else {
      const wanted = ids[cursor]
      if (wanted === undefined) {
        return { ok: false, error: `ran out of answer ids at node "${node.id}"` }
      }
      const found = situation.answers.find((a) => a.id === wanted)
      if (!found) {
        return { ok: false, error: `answer "${wanted}" is not an option on node "${node.id}"` }
      }
      answer = found
      cursor += 1
    }

    const result = advanceFrom(quiz, state, node, answer)
    if (result.kind === 'end') return done('out_of_steps', node, state.stepIndex, result.values, result.tier)
    state = result.state
  }

  return { ok: false, error: `replay exceeded the depth limit of ${maxDepth}` }
}

// ---------------------------------------------------------------------------
// The state graph (step x tier), for cycle and reachability analysis
// ---------------------------------------------------------------------------

export type StateSuccessors = {
  nodeId: string | null
  /** Nothing leads onward: an endpoint, a dead end, or no variant at all. */
  terminal: boolean
  /** Some branch runs out of steps, which is itself an end of the funnel. */
  ends: boolean
  out: Array<{ stepIndex: number; tier: string | null }>
}

/**
 * Where a (step, tier) state can go, ignoring captured values.
 *
 * This is a deliberate OVER-approximation in exactly one place: every decision
 * condition whose target resolves is treated as live, because without a value
 * bag there is no way to know which one fires. Extra edges can only make a
 * cycle look escapable and a node look reachable - never the reverse - so it is
 * used for the cycle-trap verdict (where a false "this is a trap" would be the
 * damaging error) and only as the fallback for reachability when the exact
 * enumeration was truncated.
 */
export const successorStates = (
  quiz: Quiz,
  stepIndex: number,
  tier: string | null,
): StateSuccessors => {
  const situation = situationAt(quiz, { stepIndex, tier, values: {} })
  if (situation.kind === 'missing') return { nodeId: null, terminal: true, ends: false, out: [] }
  const node = situation.node
  if (situation.kind === 'terminal' || situation.kind === 'dead_end') {
    return { nodeId: node.id, terminal: true, ends: false, out: [] }
  }

  const out: Array<{ stepIndex: number; tier: string | null }> = []
  const seen = new Set<string>()
  const add = (index: number, t: string | null): void => {
    const key = stateKeyOf(index, t)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ stepIndex: index, tier: t })
  }

  let ends = false
  const choices = situation.kind === 'auto' ? [situation.answer] : situation.answers
  for (const answer of choices) {
    const nextTier: string | null = answer.setTier || tier

    if (node.type === 'decision' && node.conditions) {
      for (const cond of node.conditions) {
        const ti = explicitStepIndex(quiz, cond.nextStepKey)
        if (ti >= 0) add(ti, nextTier)
      }
      const di = explicitStepIndex(quiz, node.defaultNextStepKey)
      if (di >= 0) {
        add(di, nextTier)
        continue
      }
    }

    const ei = explicitStepIndex(quiz, answer.nextStepKey)
    if (ei >= 0) {
      add(ei, nextTier)
      continue
    }

    const seq = nextSequentialStepIndex(quiz, stepIndex, nextTier)
    if (seq >= 0) add(seq, nextTier)
    else ends = true
  }

  return { nodeId: node.id, terminal: false, ends, out }
}

export type StateGraphNode = StateSuccessors & {
  key: string
  stepIndex: number
  tier: string | null
}

export type StateGraph = Map<string, StateGraphNode>

/** Every (step, tier) state reachable from the entry, with its out-edges. */
export const buildStateGraph = (quiz: Quiz): StateGraph => {
  const graph: StateGraph = new Map()
  const start = entryStepIndex(quiz, null)
  if (start < 0) return graph

  const queue: Array<{ stepIndex: number; tier: string | null }> = [{ stepIndex: start, tier: null }]
  while (queue.length > 0) {
    const at = queue.shift() as { stepIndex: number; tier: string | null }
    const key = stateKeyOf(at.stepIndex, at.tier)
    if (graph.has(key)) continue
    const successors = successorStates(quiz, at.stepIndex, at.tier)
    graph.set(key, { key, stepIndex: at.stepIndex, tier: at.tier, ...successors })
    for (const next of successors.out) queue.push(next)
  }
  return graph
}

// ---------------------------------------------------------------------------
// The path-to-outcome table
// ---------------------------------------------------------------------------

/**
 * Everything about how a quiz LOOKS, in one bag that the enumerator cannot see.
 *
 * `templateId` is accepted and deliberately never read. Leaving it out would
 * make the property "a template cannot change an outcome" untestable, because
 * a caller could not distinguish "the template is ignored" from "there was
 * nowhere to put it".
 */
export type PathPresentation = {
  templateId?: string | null
  brand?: { urls?: unknown } | null
  deployment?: { destinationOverrides?: unknown } | null
}

export type PathTableRow = PathRow & {
  /** The address the terminal actually sends the visitor to, for this brand. */
  destinationUrl: string | null
}

export type PathTable = {
  rows: PathTableRow[]
  truncated: boolean
  truncationReason: string | null
  limits: { maxPaths: number; maxDepth: number }
}

/**
 * The path-to-outcome table: one row per route, with the resolved destination.
 *
 * The flow is computed FIRST, by a function that has no access to the
 * presentation, and the URL column is appended afterwards. A template or brand
 * therefore cannot reach any other column - not the answers, not the tier, not
 * `dq_lead`, not the terminal - by construction rather than by convention.
 */
export const buildPathTable = (
  quiz: Quiz,
  presentation: PathPresentation = {},
  options: EnumerationOptions = {},
): PathTable => {
  const enumeration = enumeratePaths(quiz, options)
  const context = {
    deployment: presentation.deployment?.destinationOverrides,
    brand: presentation.brand?.urls,
  }
  const byId = new Map(quiz.nodes.map((n) => [n.id, n]))

  return {
    rows: enumeration.rows.map((row) => ({
      ...row,
      destinationUrl: row.terminalNodeId
        ? resolveRedirectUrl(readRedirect(byId.get(row.terminalNodeId)), context, row.values)
        : null,
    })),
    truncated: enumeration.truncated,
    truncationReason: enumeration.truncationReason,
    limits: enumeration.limits,
  }
}
