/**
 * A structural gate for quiz flows.
 *
 * A quiz is the one artifact in this platform where a routing mistake is
 * invisible until it has cost money: the builder draws a graph, the runtime
 * walks it, and a step nobody can reach or a branch that never reaches the lead
 * form looks exactly like a working funnel from the outside. This module walks
 * the flow with the runtime's own primitives (see `./paths`) and reports each
 * property separately, because "this quiz is invalid" is not an actionable
 * sentence and "Tier 4 is declared but nothing ever sets it" is.
 *
 * Every check is reported on its own. A caller that wants a single boolean can
 * read `ok`, but nothing collapses ten different failures into one, and a check
 * that could not be evaluated exhaustively says so rather than passing quietly.
 *
 * Two deliberate positions worth stating, because both are judgement calls:
 *
 *  - A CYCLE IS NOT A DEFECT. A back-edge is how "change your answer" is built.
 *    A cycle is only reported when the strongly-connected component it forms
 *    has no edge leaving it and no member that can end the funnel, which is the
 *    only shape a visitor can actually be trapped in.
 *  - A TRUNCATED ENUMERATION FAILS. When the branch limit is hit, the path
 *    table is partial, and every conclusion drawn from it ("no path misses
 *    consent") becomes unsound. Reporting that as a passing check with a note
 *    attached would be worse than reporting nothing, so `path_table` fails and
 *    the checks that depend on completeness say which of their results are
 *    partial.
 *
 * Pure and isomorphic. No database, no network, no clock.
 */

import {
  DESTINATION_KEYS,
  isSafeDestinationUrl,
  type DestinationKey,
} from '@/lib/quiz-destinations'
import {
  entryStepIndex,
  isShared,
  type Quiz,
  type QuizNode,
} from '@/lib/quiz-graph'
import {
  buildStateGraph,
  enumeratePaths,
  isAutoAdvanceNode,
  isKnownOperator,
  readRedirect,
  replayAnswerIds,
  stateKeyOf,
  type EnumerationOptions,
  type PathEnumeration,
  type PathRow,
  type StateGraph,
} from './paths'

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export const CHECK_IDS = [
  'valid_entry',
  'valid_references',
  'reachability',
  'cycle_traps',
  'valid_terminals',
  'tier_reachability',
  'qualification_determinism',
  'destination_validity',
  'reachable_consent',
  'path_table',
] as const

export type CheckId = (typeof CHECK_IDS)[number]

export type FlowIssue = {
  level: 'error' | 'warning'
  code: string
  message: string
  stepKey?: string
  nodeId?: string
  tierId?: string
  answerId?: string
}

export type CheckResult = {
  id: CheckId
  label: string
  /** No errors. Warnings never fail a check; they are things worth a look. */
  ok: boolean
  errors: FlowIssue[]
  warnings: FlowIssue[]
  /** Findings that are not defects: what was walked, what was found and why. */
  notes: string[]
}

export type FlowValidation = {
  ok: boolean
  checks: CheckResult[]
  enumeration: PathEnumeration
}

/** Enough issues to see the shape of a problem without burying the report. */
const MAX_ISSUES_PER_CHECK = 25

type Collector = {
  error: (issue: Omit<FlowIssue, 'level'>) => void
  warn: (issue: Omit<FlowIssue, 'level'>) => void
  note: (text: string) => void
  finish: () => CheckResult
}

const collect = (id: CheckId, label: string): Collector => {
  const errors: FlowIssue[] = []
  const warnings: FlowIssue[] = []
  const notes: string[] = []
  const seen = new Set<string>()
  let suppressed = 0

  const push = (issue: FlowIssue): void => {
    const key = `${issue.level}|${issue.code}|${issue.nodeId ?? ''}|${issue.stepKey ?? ''}|${issue.tierId ?? ''}|${issue.answerId ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    const bucket = issue.level === 'error' ? errors : warnings
    if (bucket.length >= MAX_ISSUES_PER_CHECK) {
      suppressed += 1
      return
    }
    bucket.push(issue)
  }

  return {
    error: (issue) => push({ ...issue, level: 'error' }),
    warn: (issue) => push({ ...issue, level: 'warning' }),
    note: (text) => {
      notes.push(text)
    },
    finish: () => {
      if (suppressed > 0) notes.push(`${suppressed} further issue(s) of the same kind are not listed.`)
      return { id, label, ok: errors.length === 0, errors, warnings, notes }
    },
  }
}

// ---------------------------------------------------------------------------
// Small readers for the loose parts of the node shape
// ---------------------------------------------------------------------------

const stepLabel = (quiz: Quiz, key: string | null | undefined): string => {
  if (!key) return '(no step)'
  return quiz.steps.find((s) => s.key === key)?.label ?? key
}

const tierLabel = (quiz: Quiz, id: string | null | undefined): string => {
  if (!id) return 'no tier'
  return quiz.tiers.find((t) => t.id === id)?.name ?? id
}

const nodeLabel = (quiz: Quiz, node: QuizNode): string =>
  `"${stepLabel(quiz, node.stepKey)}" (${node.id})`

/** The question types whose typed value is captured into a field key. */
const TYPED_CAPTURE_TYPES = new Set(['text_input', 'number_input', 'textarea', 'smart_date'])

const captureKeyOf = (node: QuizNode): string => {
  if (node.questionType === 'dropdown') {
    const dropdown = typeof node.dropdownField === 'string' ? node.dropdownField : ''
    return dropdown || node.fieldName || ''
  }
  if (TYPED_CAPTURE_TYPES.has(node.questionType)) return node.fieldName || ''
  return ''
}

const formFieldKeys = (node: QuizNode): string[] => {
  const raw = node.formFields
  if (!Array.isArray(raw)) return []
  const keys: string[] = []
  for (const field of raw) {
    if (!field || typeof field !== 'object') continue
    const key = (field as Record<string, unknown>).key
    if (typeof key === 'string' && key) keys.push(key)
  }
  return keys
}

const responseMappingKeys = (node: QuizNode): string[] => {
  const raw = node.responseMappings
  if (!Array.isArray(raw)) return []
  const keys: string[] = []
  for (const mapping of raw) {
    if (!mapping || typeof mapping !== 'object') continue
    const key = (mapping as Record<string, unknown>).fieldKey
    if (typeof key === 'string' && key) keys.push(key)
  }
  return keys
}

const aiOutputField = (node: QuizNode): string => {
  const raw = node.ai
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const ai = raw as Record<string, unknown>
  if (ai.enabled !== true) return ''
  return typeof ai.outputField === 'string' ? ai.outputField : ''
}

/** Field keys any ANSWER can write. This is what the runtime actually applies. */
const answerWrittenKeys = (quiz: Quiz): Set<string> => {
  const keys = new Set<string>()
  for (const node of quiz.nodes) {
    const capture = captureKeyOf(node)
    if (capture) keys.add(capture)
    for (const key of formFieldKeys(node)) keys.add(key)
    for (const answer of node.answers ?? []) {
      for (const mapping of answer.fieldMappings ?? []) if (mapping.key) keys.add(mapping.key)
      if (answer.isDQ) keys.add('dq_lead')
      if (answer.setTier) keys.add('tier')
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// 1. Valid entry
// ---------------------------------------------------------------------------

const checkValidEntry = (quiz: Quiz): CheckResult => {
  const c = collect('valid_entry', 'Valid entry')

  if (quiz.steps.length === 0) {
    c.error({ code: 'no_steps', message: 'This quiz has no steps, so there is nothing to enter.' })
    return c.finish()
  }

  const initial = entryStepIndex(quiz, null)
  if (initial < 0) {
    c.error({
      code: 'no_entry',
      message:
        'No step resolves for a visitor who has not been assigned a tier. Every step is either empty or an optional question, so the quiz opens on nothing.',
    })
  } else {
    c.note(`A new visitor opens on "${stepLabel(quiz, quiz.steps[initial].key)}".`)
  }

  for (const tier of quiz.tiers) {
    const index = entryStepIndex(quiz, tier.id)
    if (index < 0) {
      c.error({
        code: 'no_entry_for_tier',
        tierId: tier.id,
        message: `${tier.name} has no first step: every step is empty, optional, or has no variant for that tier.`,
      })
    }
  }

  return c.finish()
}

// ---------------------------------------------------------------------------
// 2. Valid references
// ---------------------------------------------------------------------------

const checkValidReferences = (quiz: Quiz): CheckResult => {
  const c = collect('valid_references', 'Valid references')

  const stepKeys = new Set(quiz.steps.map((s) => s.key))
  const tierIds = new Set(quiz.tiers.map((t) => t.id))
  const fieldKeys = new Set((quiz.customFields ?? []).map((f) => f.key))

  const countDuplicates = (values: string[]): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    return counts
  }

  for (const [key, count] of countDuplicates(quiz.steps.map((s) => s.key))) {
    if (count > 1) {
      c.error({
        code: 'duplicate_step_key',
        stepKey: key,
        message: `Step key "${key}" is used ${count} times. Every route to it resolves to the first one, so the others can never be reached.`,
      })
    }
  }
  for (const [id, count] of countDuplicates(quiz.tiers.map((t) => t.id))) {
    if (count > 1) c.error({ code: 'duplicate_tier_id', tierId: id, message: `Tier id "${id}" is declared ${count} times.` })
  }
  for (const [key, count] of countDuplicates((quiz.customFields ?? []).map((f) => f.key))) {
    if (count > 1) c.error({ code: 'duplicate_field_key', message: `Custom field key "${key}" is defined ${count} times.` })
  }
  for (const [id, count] of countDuplicates(quiz.nodes.map((n) => n.id))) {
    if (count > 1) c.error({ code: 'duplicate_node_id', nodeId: id, message: `Node id "${id}" is used ${count} times.` })
  }

  const conditionFields = new Set<string>()
  const writtenByAnswers = answerWrittenKeys(quiz)
  const responseOnly = new Set<string>()
  const aiWritten = new Set<string>()
  for (const node of quiz.nodes) {
    for (const key of responseMappingKeys(node)) if (!writtenByAnswers.has(key)) responseOnly.add(key)
    const ai = aiOutputField(node)
    if (ai) aiWritten.add(ai)
  }

  for (const node of quiz.nodes) {
    if (!stepKeys.has(node.stepKey)) {
      c.error({
        code: 'orphan_node',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `Node ${node.id} sits on step "${node.stepKey}", which does not exist. It can never render.`,
      })
    }

    for (const tierId of node.tiers ?? []) {
      if (!tierIds.has(tierId)) {
        c.error({
          code: 'unknown_variant_tier',
          nodeId: node.id,
          tierId,
          message: `${nodeLabel(quiz, node)} is scoped to tier "${tierId}", which is not declared.`,
        })
      }
    }

    for (const [id, count] of countDuplicates((node.answers ?? []).map((a) => a.id))) {
      if (count > 1) {
        c.error({
          code: 'duplicate_answer_id',
          nodeId: node.id,
          answerId: id,
          message: `${nodeLabel(quiz, node)} has ${count} answers sharing the id "${id}", so an answer cannot be identified.`,
        })
      }
    }

    for (const answer of node.answers ?? []) {
      if (answer.nextStepKey && !stepKeys.has(answer.nextStepKey)) {
        c.error({
          code: 'dangling_answer_route',
          nodeId: node.id,
          stepKey: node.stepKey,
          answerId: answer.id,
          message: `${nodeLabel(quiz, node)}: answer "${answer.label}" routes to step "${answer.nextStepKey}", which does not exist. At runtime it falls through to the next step in order instead.`,
        })
      }
      if (answer.setTier && !tierIds.has(answer.setTier)) {
        c.error({
          code: 'unknown_tier',
          nodeId: node.id,
          answerId: answer.id,
          tierId: answer.setTier,
          message: `${nodeLabel(quiz, node)}: answer "${answer.label}" sets tier "${answer.setTier}", which is not declared.`,
        })
      }
      for (const mapping of answer.fieldMappings ?? []) {
        if (!mapping.key) {
          c.warn({
            code: 'empty_field_mapping_key',
            nodeId: node.id,
            answerId: answer.id,
            message: `${nodeLabel(quiz, node)}: answer "${answer.label}" has a field mapping with no key. It is silently dropped.`,
          })
          continue
        }
        if (!fieldKeys.has(mapping.key)) {
          c.error({
            code: 'unknown_field_key',
            nodeId: node.id,
            answerId: answer.id,
            message: `${nodeLabel(quiz, node)}: answer "${answer.label}" writes to "${mapping.key}", which is not a declared custom field.`,
          })
        }
      }
    }

    if (node.type === 'decision') {
      if (!node.conditions) {
        c.warn({
          code: 'decision_without_conditions',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} is a decision with no conditions array at all. The runtime skips its whole routing block, so even its default route is ignored.`,
        })
      } else if (node.conditions.length === 0 && !node.defaultNextStepKey) {
        c.warn({
          code: 'decision_routes_nowhere',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} is a decision with no conditions and no default route, so it always falls through to the next step.`,
        })
      }
    }

    for (const condition of node.conditions ?? []) {
      if (condition.nextStepKey && !stepKeys.has(condition.nextStepKey)) {
        c.error({
          code: 'dangling_condition_route',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)}: a condition routes to step "${condition.nextStepKey}", which does not exist. A matching visitor falls through to the next condition instead.`,
        })
      }
      if (!isKnownOperator(condition.operator)) {
        c.error({
          code: 'unknown_operator',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)}: condition operator "${condition.operator}" is not one the runtime understands, so the condition can never match.`,
        })
      }
      if (condition.field) conditionFields.add(condition.field)
      if (condition.field && !fieldKeys.has(condition.field)) {
        c.warn({
          code: 'unknown_condition_field',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)}: a condition reads "${condition.field}", which is not a declared custom field.`,
        })
      }
    }

    if (node.defaultNextStepKey && !stepKeys.has(node.defaultNextStepKey)) {
      c.error({
        code: 'dangling_default_route',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)}: the default route points at step "${node.defaultNextStepKey}", which does not exist.`,
      })
    }

    const capture = captureKeyOf(node)
    if (capture && !fieldKeys.has(capture)) {
      c.warn({
        code: 'undeclared_capture_field',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} captures its answer into "${capture}", which is not a declared custom field.`,
      })
    }
    for (const key of formFieldKeys(node)) {
      if (!fieldKeys.has(key)) {
        c.warn({
          code: 'undeclared_form_field',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} collects "${key}", which is not a declared custom field.`,
        })
      }
    }
  }

  for (const field of conditionFields) {
    if (responseOnly.has(field)) {
      c.warn({
        code: 'route_depends_on_webhook_response',
        message: `Routing reads "${field}", which is only ever written by a webhook response mapping. The runtime does call those nodes, so this can work - but whether it does depends on the buyer's endpoint actually returning that key, which cannot be checked from here. Verify it against the live endpoint.`,
      })
    }
  }

  c.note(`${quiz.steps.length} steps, ${quiz.nodes.length} node variants, ${quiz.tiers.length} tiers, ${(quiz.customFields ?? []).length} custom fields.`)
  return c.finish()
}

// ---------------------------------------------------------------------------
// 3. Reachability
// ---------------------------------------------------------------------------

const checkReachability = (quiz: Quiz, walk: PathEnumeration, graph: StateGraph): CheckResult => {
  const c = collect('reachability', 'Reachability')

  // The exact answer comes from the enumeration, which follows real values. It
  // is only usable when the walk completed; a truncated walk under-reports what
  // was reached, and "unreachable" would then be a guess. The state graph is
  // the sound fallback: it over-approximates edges, so anything IT cannot reach
  // is genuinely unreachable.
  const exact = !walk.truncated
  const reachedSteps = new Set(walk.visitedStepKeys)
  const reachedNodes = new Set(walk.visitedNodeIds)
  if (!exact) {
    for (const state of graph.values()) {
      const step = quiz.steps[state.stepIndex]
      if (step) reachedSteps.add(step.key)
      if (state.nodeId) reachedNodes.add(state.nodeId)
    }
    c.note('The path walk was truncated, so reachability was taken from the state graph. It can miss an unreachable node, but never reports a reachable one as unreachable.')
  } else {
    c.note('Every path was walked, so this result is exact.')
  }

  const stepKeys = new Set(quiz.steps.map((s) => s.key))
  for (const step of quiz.steps) {
    if (reachedSteps.has(step.key)) continue
    const variants = quiz.nodes.filter((n) => n.stepKey === step.key)
    if (variants.length === 0) {
      c.warn({
        code: 'empty_step',
        stepKey: step.key,
        message: `"${step.label}" has no variants at all, so it is skipped at runtime.`,
      })
      continue
    }
    c.error({
      code: 'unreachable_step',
      stepKey: step.key,
      message: `"${step.label}" is never entered by any path.`,
    })
  }

  for (const node of quiz.nodes) {
    // An orphan node is already reported by valid_references; repeating it here
    // as "unreachable" would describe the same defect twice.
    if (!stepKeys.has(node.stepKey)) continue
    if (reachedNodes.has(node.id)) continue
    const scope = isShared(node)
      ? 'shared'
      : node.tiers.map((t) => tierLabel(quiz, t)).join(', ')
    c.error({
      code: 'unreachable_variant',
      nodeId: node.id,
      stepKey: node.stepKey,
      message: `${nodeLabel(quiz, node)} [${scope}] is never resolved on any path, so no visitor ever sees it.`,
    })
  }

  c.note(`${reachedSteps.size}/${quiz.steps.length} steps and ${reachedNodes.size}/${quiz.nodes.length} node variants are reachable.`)
  return c.finish()
}

// ---------------------------------------------------------------------------
// 4. Cycle traps
// ---------------------------------------------------------------------------

/** Mutual reachability. The state graph is small enough that this is honest. */
const stronglyConnectedGroups = (graph: StateGraph): { groups: string[][]; onCycle: Set<string> } => {
  const keys = [...graph.keys()]
  const reach = new Map<string, Set<string>>()
  for (const key of keys) {
    const seen = new Set<string>()
    const queue = (graph.get(key)?.out ?? []).map((o) => stateKeyOf(o.stepIndex, o.tier))
    while (queue.length > 0) {
      const next = queue.shift() as string
      if (seen.has(next)) continue
      seen.add(next)
      for (const edge of graph.get(next)?.out ?? []) queue.push(stateKeyOf(edge.stepIndex, edge.tier))
    }
    reach.set(key, seen)
  }

  const assigned = new Set<string>()
  const groups: string[][] = []
  const onCycle = new Set<string>()
  for (const key of keys) {
    if (reach.get(key)?.has(key)) onCycle.add(key)
    if (assigned.has(key)) continue
    const group = [key]
    assigned.add(key)
    for (const other of keys) {
      if (assigned.has(other)) continue
      if (reach.get(key)?.has(other) && reach.get(other)?.has(key)) {
        group.push(other)
        assigned.add(other)
      }
    }
    groups.push(group)
  }
  return { groups, onCycle }
}

/**
 * The cycle verdict, and the set of states a visitor cannot get out of.
 *
 * `trappedStateKeys` is shared with the terminals check: a path that loops back
 * to a state it has already been in is only a defect when that loop is a trap.
 * Reporting every back-edge as a non-terminating path would fail every quiz
 * with a "change your answer" route, which is the exact mistake this check is
 * written to avoid.
 */
const analyzeCycles = (
  quiz: Quiz,
  graph: StateGraph,
): { result: CheckResult; trappedStateKeys: Set<string> } => {
  const c = collect('cycle_traps', 'No unintended cycle traps')
  const trappedStateKeys = new Set<string>()

  const describe = (key: string): string => {
    const state = graph.get(key)
    if (!state) return key
    const step = quiz.steps[state.stepIndex]
    return `"${step ? step.label : state.stepIndex}" [${tierLabel(quiz, state.tier)}]`
  }

  const { groups, onCycle } = stronglyConnectedGroups(graph)
  let cycles = 0

  for (const group of groups) {
    const nonTrivial = group.length > 1 || onCycle.has(group[0])
    if (!nonTrivial) continue
    cycles += 1

    const members = new Set(group)
    const exits: string[] = []
    let ends = false
    for (const key of group) {
      const state = graph.get(key)
      if (!state) continue
      if (state.ends) ends = true
      for (const edge of state.out) {
        const target = stateKeyOf(edge.stepIndex, edge.tier)
        if (!members.has(target)) exits.push(target)
      }
    }

    const shape = group.map(describe).join(' -> ')
    if (exits.length === 0 && !ends) {
      for (const key of group) trappedStateKeys.add(key)
      c.error({
        code: 'cycle_trap',
        stepKey: quiz.steps[graph.get(group[0])?.stepIndex ?? -1]?.key,
        message: `A visitor who enters ${shape} can never leave: no route out of the loop, and no branch in it ends the funnel.`,
      })
    } else if (exits.length > 0) {
      c.note(`Loop ${shape} is a legitimate back-edge, not a trap: it can be left via ${[...new Set(exits)].map(describe).join(', ')}.`)
    } else {
      c.note(`Loop ${shape} is not a trap: a branch inside it runs out of steps, which ends the funnel and submits the lead.`)
    }
  }

  if (cycles === 0) c.note('The flow has no loops at all.')
  c.note(`${graph.size} reachable (step, tier) states were analysed.`)
  return { result: c.finish(), trappedStateKeys }
}

// ---------------------------------------------------------------------------
// 5. Valid terminals
// ---------------------------------------------------------------------------

const checkValidTerminals = (
  quiz: Quiz,
  walk: PathEnumeration,
  trappedStateKeys: Set<string>,
): CheckResult => {
  const c = collect('valid_terminals', 'Valid terminals')

  const reached = new Set(walk.visitedNodeIds)
  for (const node of quiz.nodes) {
    if (node.type === 'endpoint') continue
    if (isAutoAdvanceNode(node)) continue
    if ((node.answers ?? []).length > 0) continue
    const message = `${nodeLabel(quiz, node)} is shown to the visitor but has nothing to answer with and no route out, so the flow stops there without ending.`
    if (reached.has(node.id)) c.error({ code: 'dead_end', nodeId: node.id, stepKey: node.stepKey, message })
    else c.warn({ code: 'dead_end_unreached', nodeId: node.id, stepKey: node.stepKey, message: `${message} (No path reaches it today.)` })
  }

  const counts = new Map<string, number>()
  for (const row of walk.rows) counts.set(row.terminalKind, (counts.get(row.terminalKind) ?? 0) + 1)

  let escapableLoops = 0
  for (const row of walk.rows) {
    if (row.terminalKind === 'missing_variant') {
      c.error({
        code: 'route_to_missing_variant',
        stepKey: row.terminalStepKey ?? undefined,
        message: `A route lands on "${stepLabel(quiz, row.terminalStepKey)}" with tier ${tierLabel(quiz, row.tier)} active, and that step has no variant for it. The runtime shows a bare thank-you screen and never submits the lead.`,
      })
    } else if (row.terminalKind === 'cycle') {
      // Repeating a state is only a defect when the loop cannot be left. A back
      // edge the visitor can decline is how "change your answer" is built, and
      // the branch that keeps taking it forever is a choice, not a trap.
      const trapped =
        row.terminalStepIndex !== null && trappedStateKeys.has(stateKeyOf(row.terminalStepIndex, row.tier))
      if (trapped) {
        c.error({
          code: 'non_terminating_path',
          stepKey: row.terminalStepKey ?? undefined,
          message: `A path returns to "${stepLabel(quiz, row.terminalStepKey)}" in exactly the state it was already in, and that loop has no way out, so it never terminates.`,
        })
      } else {
        escapableLoops += 1
      }
    } else if (row.terminalKind === 'depth_limit') {
      c.warn({
        code: 'depth_limit',
        stepKey: row.terminalStepKey ?? undefined,
        message: `A path was still running at the depth limit of ${walk.limits.maxDepth} and was cut. Its real ending is unknown.`,
      })
    }
  }

  for (const [kind, count] of [...counts].sort()) c.note(`${count} path(s) end as "${kind}".`)
  if (escapableLoops > 0) {
    c.note(`${escapableLoops} branch(es) loop back to an earlier state, but the loop can be left, so the visitor is never stuck.`)
  }
  if (walk.rows.length === 0) {
    c.error({ code: 'no_paths', message: 'No path through this quiz could be walked at all.' })
  }
  if (walk.truncated) c.note('The walk was truncated, so paths past the limit were not checked.')

  return c.finish()
}

// ---------------------------------------------------------------------------
// 6. Tier reachability
// ---------------------------------------------------------------------------

const checkTierReachability = (
  quiz: Quiz,
  walk: PathEnumeration,
  options: EnumerationOptions,
): CheckResult => {
  const c = collect('tier_reachability', 'Tier reachability')

  if (quiz.tiers.length === 0) {
    c.note('This quiz declares no tiers, so every visitor sees the shared variants.')
    return c.finish()
  }

  const setByAnswer = new Set<string>()
  const setByResponse = new Set<string>()
  for (const node of quiz.nodes) {
    for (const answer of node.answers ?? []) if (answer.setTier) setByAnswer.add(answer.setTier)
    if (responseMappingKeys(node).includes('tier')) setByResponse.add(node.id)
    for (const answer of node.answers ?? []) {
      const writesTier = (answer.fieldMappings ?? []).some((m) => m.key === 'tier')
      if (writesTier && !answer.setTier) {
        c.warn({
          code: 'tier_value_without_set_tier',
          nodeId: node.id,
          answerId: answer.id,
          message: `${nodeLabel(quiz, node)}: answer "${answer.label}" writes the "tier" field but does not set the routing tier. The lead is tagged with a tier the flow never switched to.`,
        })
      }
    }
  }

  // Two questions, deliberately kept apart.
  //
  //   CAN the flow enter this tier at all? `walk` answers that, and it branches
  //   over what a lookup can return, so a tier the lookup assigns counts as
  //   reachable. If it is not reachable even then, nothing can ever select it
  //   and that is a real defect.
  //
  //   Can it enter WITHOUT an outside service? `unaided` answers that by
  //   walking as though every lookup returned nothing. A tier reachable only
  //   with the lookup is fine and intended - it is also a dependency on an
  //   endpoint this validator cannot see, and saying so is the useful thing.
  //
  // Collapsing the two is how this check was wrong in both directions before:
  // first erroring on tiers that were merely lookup-assigned, then going silent
  // about the endpoint dependency altogether.
  const active = new Set(walk.activeTiers)
  const unaided = new Set(
    enumeratePaths(quiz, { ...options, lookupOutcomes: false }).activeTiers,
  )
  const lookupNodes = [...setByResponse].join(', ')
  for (const tier of quiz.tiers) {
    if (!active.has(tier.id)) {
      const reason = setByAnswer.has(tier.id)
        ? 'nothing that sets it is reachable'
        : setByResponse.size > 0
          ? 'no answer sets it, and no lookup can put the flow into it either'
          : 'no answer sets it'
      c.error({
        code: 'unreachable_tier',
        tierId: tier.id,
        message: `${tier.name} is declared but never becomes active: ${reason}.`,
      })
      continue
    }
    if (unaided.has(tier.id)) continue
    c.warn({
      code: 'tier_depends_on_webhook_response',
      tierId: tier.id,
      message: `${tier.name} is reachable, but only when the tier lookup (${lookupNodes}) returns "${tier.id}" - no answer sets it. Confirm the live endpoint returns exactly that id; a value the quiz does not declare leaves the visitor on the shared fallback variant.`,
    })
  }

  const tierMatched = new Set(walk.tierMatchedNodeIds)
  const visited = new Set(walk.visitedNodeIds)
  for (const node of quiz.nodes) {
    if (isShared(node)) continue
    if (tierMatched.has(node.id)) continue
    const names = node.tiers.map((t) => tierLabel(quiz, t)).join(', ')
    if (visited.has(node.id)) {
      c.warn({
        code: 'variant_shown_outside_its_tier',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} is scoped to ${names}, but the only visitors who see it have no tier assigned. It is being shown as the step's fallback variant, not as a tier variant.`,
      })
    } else if (node.tiers.every((t) => !active.has(t))) {
      c.warn({
        code: 'variant_tier_never_active',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} only exists for ${names}, and none of those tiers ever becomes active.`,
      })
    } else if (quiz.nodes.some((other) => other.stepKey === node.stepKey && isShared(other))) {
      // A shared variant blanks the tier columns on its row, so the tier
      // variant loses even when its tier is active and the step is reached.
      c.warn({
        code: 'variant_shadowed_by_shared',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} is scoped to ${names}, but "${stepLabel(quiz, node.stepKey)}" also has a shared variant, and shared wins. Every visitor sees the shared one instead.`,
      })
    } else {
      c.warn({
        code: 'variant_step_not_reached_in_tier',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} is scoped to ${names}, and no visitor reaches "${stepLabel(quiz, node.stepKey)}" while one of those tiers is active.`,
      })
    }
  }

  c.note(`${active.size}/${quiz.tiers.length} declared tiers become active on some path.`)
  if (walk.truncated) c.note('The walk was truncated, so a tier reached only past the limit would be reported as unreachable.')
  return c.finish()
}

// ---------------------------------------------------------------------------
// 7. Qualification determinism
// ---------------------------------------------------------------------------

/** The columns that decide what happens to a lead. */
const outcomeOf = (row: PathRow): string =>
  JSON.stringify({
    tier: row.tier,
    dqLead: row.dqLead,
    terminalNodeId: row.terminalNodeId,
    terminalKind: row.terminalKind,
    destination: row.destination,
    values: row.values,
  })

const checkDeterminism = (
  quiz: Quiz,
  walk: PathEnumeration,
  options: EnumerationOptions,
): CheckResult => {
  const c = collect('qualification_determinism', 'Qualification determinism')

  const second = enumeratePaths(quiz, options)
  if (JSON.stringify(second.rows) !== JSON.stringify(walk.rows)) {
    c.error({
      code: 'unstable_enumeration',
      message: 'Walking the same quiz twice produced different paths. Something in the flow depends on state outside the visitor’s answers.',
    })
  } else {
    c.note(`Two independent walks produced identical results across ${walk.rows.length} path(s).`)
  }

  // Driving the flow from the answer ids alone is the real property: the
  // outcome has to be a function of what the visitor chose. Comparing two runs
  // of the enumerator alone would only prove the enumerator is stable.
  // The input to a qualification decision is what the visitor chose AND what
  // any lookup node returned. Keying on the answers alone was right only while
  // webhook nodes were skipped; now that they execute, it would report every
  // flow with a tier lookup as ambiguous, which is the wrong answer loudly.
  // Keying on both keeps the real defect - one input, two outcomes - detectable.
  const bySequence = new Map<string, PathRow>()
  let replayed = 0
  for (const row of walk.rows) {
    if (row.terminalKind === 'depth_limit') continue
    const answerKey = row.answerIds.join('>')
    const lookupKey = row.lookupOutcomeIds.join('>')
    const key = `${answerKey}|${lookupKey}`
    const previous = bySequence.get(key)
    if (previous) {
      const inputs = lookupKey
        ? `${answerKey || '(no answers)'} with lookups ${lookupKey}`
        : answerKey || '(no answers)'
      c.error({
        code: 'ambiguous_answer_sequence',
        message: `Two different paths take the same answers (${inputs}) and end differently: ${previous.terminalNodeId ?? previous.terminalKind} vs ${row.terminalNodeId ?? row.terminalKind}.`,
      })
      continue
    }
    bySequence.set(key, row)

    const replay = replayAnswerIds(quiz, row.answerIds, { ...options, lookupOutcomeIds: row.lookupOutcomeIds })
    if (!replay.ok) {
      c.error({
        code: 'replay_failed',
        message: `Replaying the answers ${key || '(none)'} did not reproduce a path: ${replay.error}`,
      })
      continue
    }
    replayed += 1
    if (outcomeOf(replay.row) !== outcomeOf(row)) {
      c.error({
        code: 'replay_mismatch',
        message: `Replaying the answers ${key || '(none)'} produced a different outcome than walking to them did.`,
      })
    }
  }
  c.note(`${replayed} path(s) reproduced their own outcome when replayed from their answer ids alone.`)

  // Order-dependent state. Two mappings on one answer writing the same key make
  // the result depend on array order, which nothing in the editor guarantees.
  for (const node of quiz.nodes) {
    for (const answer of node.answers ?? []) {
      const seen = new Set<string>()
      for (const mapping of answer.fieldMappings ?? []) {
        if (!mapping.key) continue
        if (seen.has(mapping.key)) {
          c.error({
            code: 'order_dependent_mapping',
            nodeId: node.id,
            answerId: answer.id,
            message: `${nodeLabel(quiz, node)}: answer "${answer.label}" writes "${mapping.key}" more than once, so the stored value depends on the order of the mapping list.`,
          })
        }
        seen.add(mapping.key)
      }
    }
  }

  // A route that reads a field an AI node writes is decided by a model call,
  // not by the visitor, so the same answers can qualify one lead and not the
  // next.
  const aiFields = new Set<string>()
  for (const node of quiz.nodes) {
    const field = aiOutputField(node)
    if (field) aiFields.add(field)
  }
  for (const node of quiz.nodes) {
    for (const condition of node.conditions ?? []) {
      if (condition.field && aiFields.has(condition.field)) {
        c.error({
          code: 'route_depends_on_ai_output',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} routes on "${condition.field}", which is written by an AI node. The same answers can then produce different qualification results.`,
        })
      }
    }
  }

  if (walk.truncated) c.note('The walk was truncated, so paths past the limit were not replayed.')
  return c.finish()
}

// ---------------------------------------------------------------------------
// 8. Destination validity
// ---------------------------------------------------------------------------

const checkDestinationValidity = (quiz: Quiz, walk: PathEnumeration): CheckResult => {
  const c = collect('destination_validity', 'Destination validity')

  const endpoints = quiz.nodes.filter((n) => n.type === 'endpoint')
  if (endpoints.length === 0) {
    c.note('This quiz has no endpoint nodes; every path ends by running out of steps.')
  }

  for (const node of endpoints) {
    const redirect = readRedirect(node)
    if (!redirect || !redirect.mode || redirect.mode === 'none') {
      c.note(`${nodeLabel(quiz, node)} shows its own end screen and does not redirect.`)
      continue
    }
    if (redirect.mode !== 'button' && redirect.mode !== 'immediate') {
      c.error({
        code: 'unknown_redirect_mode',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} has redirect mode "${redirect.mode}", which the runtime does not understand, so nothing is rendered.`,
      })
      continue
    }

    const kind = redirect.destination ?? 'custom'
    if (kind === 'custom') {
      const raw = (redirect.url ?? '').trim()
      if (!raw) {
        c.error({
          code: 'redirect_without_url',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} is set to redirect but names no destination and no URL, so the visitor lands on an empty card.`,
        })
      } else if (!raw.includes('{{') && !isSafeDestinationUrl(raw)) {
        c.error({
          code: 'unsafe_destination_url',
          nodeId: node.id,
          stepKey: node.stepKey,
          message: `${nodeLabel(quiz, node)} redirects to "${raw}", which is not an allowed destination. It is refused at render, so the redirect never happens.`,
        })
      } else {
        c.note(`${nodeLabel(quiz, node)} redirects to a one-off URL.`)
      }
      continue
    }

    if (!DESTINATION_KEYS.includes(kind as DestinationKey)) {
      c.error({
        code: 'unknown_destination',
        nodeId: node.id,
        stepKey: node.stepKey,
        message: `${nodeLabel(quiz, node)} names the destination "${kind}", which is not one this platform resolves.`,
      })
      continue
    }
    c.note(`${nodeLabel(quiz, node)} sends the visitor to the brand's "${kind}" destination.`)
  }

  // Interpolated URLs can only be judged against a real set of captured values,
  // so the per-path result is the one that counts.
  for (const row of walk.rows) {
    if (row.destination.kind !== 'unresolvable') continue
    c.error({
      code: 'unresolvable_destination',
      nodeId: row.terminalNodeId ?? undefined,
      stepKey: row.terminalStepKey ?? undefined,
      message: `A path ending at "${stepLabel(quiz, row.terminalStepKey)}" cannot resolve its destination: ${row.destination.reason}.`,
    })
  }

  if (walk.truncated) c.note('The walk was truncated, so destinations past the limit were not resolved.')
  return c.finish()
}

// ---------------------------------------------------------------------------
// 9. Reachable required consent
// ---------------------------------------------------------------------------

const checkReachableConsent = (quiz: Quiz, walk: PathEnumeration): CheckResult => {
  const c = collect('reachable_consent', 'Reachable required consent')

  // What consent IS here, verified against the code rather than assumed: there
  // is no per-node consent field on the quiz model. `P.Consent` (the one
  // primitive every composition prints consent through, on every surface)
  // prints `brand.legal.tcpaText` under exactly one condition -
  // `node.type === 'form'`. Consent therefore lives on the lead form and is
  // supplied by the brand, so the only thing a FLOW can get wrong is delivering
  // a lead without the visitor ever having seen a form.
  c.note('Consent is the brand’s TCPA text, rendered by the lead form. The flow-level requirement is that every path which submits a lead passes through a form node.')

  const forms = quiz.nodes.filter((n) => n.type === 'form')
  if (forms.length === 0) {
    c.error({
      code: 'no_consent_surface',
      message: 'This quiz has no form node anywhere, so no visitor is ever shown the consent text.',
    })
  }

  let submitting = 0
  for (const row of walk.rows) {
    if (!row.submitsLead) continue
    submitting += 1
    if (row.formNodeIds.length > 0) continue
    c.error({
      code: 'path_without_consent',
      nodeId: row.terminalNodeId ?? undefined,
      stepKey: row.terminalStepKey ?? undefined,
      message: `A path ending at "${stepLabel(quiz, row.terminalStepKey)}" submits a lead without passing through a form, so the visitor never saw the consent text.`,
    })
  }

  c.note(`${submitting} of ${walk.rows.length} path(s) submit a lead.`)
  if (walk.truncated) c.note('The walk was truncated, so paths past the limit were not checked for consent.')
  return c.finish()
}

// ---------------------------------------------------------------------------
// 10. Path-to-outcome table
// ---------------------------------------------------------------------------

const checkPathTable = (quiz: Quiz, walk: PathEnumeration): CheckResult => {
  const c = collect('path_table', 'Path-to-outcome table')

  if (walk.truncated) {
    c.error({
      code: 'branch_limit_reached',
      message: `The path table is INCOMPLETE: ${walk.truncationReason}. It lists ${walk.rows.length} path(s) out of an unknown total, so it must not be read as exhaustive and no check derived from it is conclusive.`,
    })
  } else {
    c.note(`The table is exhaustive: ${walk.rows.length} path(s), within the limit of ${walk.limits.maxPaths} paths and ${walk.limits.maxDepth} steps deep.`)
  }

  const outcomes = new Set<string>()
  const terminals = new Set<string>()
  for (const row of walk.rows) {
    outcomes.add(`${row.tier ?? 'none'}|${row.dqLead ? 'dq' : 'ok'}|${row.terminalNodeId ?? row.terminalKind}`)
    terminals.add(row.terminalNodeId ?? row.terminalKind)
  }
  c.note(`${outcomes.size} distinct outcome(s) across ${terminals.size} terminal(s).`)
  c.note(`${walk.rows.filter((r) => r.dqLead).length} path(s) disqualify the lead.`)

  const longest = walk.rows.reduce((max, row) => Math.max(max, row.answerIds.length), 0)
  c.note(`The longest path asks ${longest} question(s).`)

  if (quiz.steps.length > 0 && walk.rows.length === 0) {
    c.error({ code: 'empty_table', message: 'The table is empty even though the quiz has steps: nothing could be walked from the entry.' })
  }

  return c.finish()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type ValidateOptions = EnumerationOptions

/**
 * Run every check. The enumeration is walked once and shared, except by the
 * determinism check, which walks it again on purpose.
 */
export const validateQuizFlow = (quiz: Quiz, options: ValidateOptions = {}): FlowValidation => {
  const walk = enumeratePaths(quiz, options)
  const graph = buildStateGraph(quiz)
  const cycles = analyzeCycles(quiz, graph)

  const checks: CheckResult[] = [
    checkValidEntry(quiz),
    checkValidReferences(quiz),
    checkReachability(quiz, walk, graph),
    cycles.result,
    checkValidTerminals(quiz, walk, cycles.trappedStateKeys),
    checkTierReachability(quiz, walk, options),
    checkDeterminism(quiz, walk, options),
    checkDestinationValidity(quiz, walk),
    checkReachableConsent(quiz, walk),
    checkPathTable(quiz, walk),
  ]

  return { ok: checks.every((c) => c.ok), checks, enumeration: walk }
}

/** One check by id. Throws on an unknown id rather than returning undefined. */
export const getCheck = (validation: FlowValidation, id: CheckId): CheckResult => {
  const found = validation.checks.find((c) => c.id === id)
  if (!found) throw new Error(`quiz-flow: no check with id "${id}"`)
  return found
}

/** Every issue code a check reported, errors first. Useful in a failure message. */
export const issueCodes = (check: CheckResult): string[] => [
  ...check.errors.map((e) => e.code),
  ...check.warnings.map((w) => w.code),
]

/** True when a check reported this code at either level. */
export const hasIssue = (check: CheckResult, code: string): boolean =>
  check.errors.some((e) => e.code === code) || check.warnings.some((w) => w.code === code)
