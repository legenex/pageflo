'use client'

/**
 * The quiz state machine. ONE implementation, three drivers.
 *
 * Why this file exists: there were two machines. `QuizRuntime.advance()` drove
 * the public page and `QuizPreviewView.handleAnswer()` drove the builder's flow
 * preview, and they had already drifted — the builder copy never executed
 * webhook or verification nodes, so a flow whose tiers come from a lookup
 * behaved one way in the builder and another way in production. That is the
 * failure mode the whole quiz architecture is trying to make unreachable: a
 * second copy of "what happens when you tap an answer" is a second place for a
 * routing rule, a field mapping or a tier decision to be subtly wrong, and the
 * wrongness is invisible until a lead lands in the wrong bucket.
 *
 * So step ordering, graph routing, field mapping, DQ, tier decisioning, the
 * back stack, the invisible-node skip with its cycle bound, and the "submit
 * before the endpoint is allowed to render" rule all live here and nowhere else.
 *
 * WHAT A DRIVER SUPPLIES is transport, never policy. `effects.runAiNode`,
 * `effects.runWebhookNode` and `effects.submitLead` say HOW a call is made;
 * this module decides WHEN and WHAT IT MEANS. The public page injects the real
 * server routes; the builder preview injects a server action for AI, no webhook
 * transport (a builder click must not POST to a buyer's endpoint) and no lead
 * submission (a builder click must not create a lead, fire a pixel or deliver a
 * webhook). Those two suppressions are the ONLY behavioural difference between
 * the surfaces, they are declared in one place, and everything downstream of
 * them — routing, tiering, skipping, the back stack — is now identical.
 *
 * The ported quiz/node/answer shapes are deliberately loose (see quiz-graph),
 * so `any` appears where the artifact's own shape is open. Everything this
 * module decides is typed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  entryStepIndex, explicitStepIndex, nextSequentialStepIndex, resolveNodeForStep,
} from '@/lib/quiz-graph'
import { isNodeVisible } from '@/components/builder/quiz/seed-data'
import { decideTier, rejectedTierMessage } from '@/lib/quiz-webhook/tier'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyQuiz = any
type AnyNode = any
type AnyAnswer = any

export type QuizValues = Record<string, string>

/** Who is driving. Only the effects differ; the machine does not branch on it. */
export type QuizMode = 'live' | 'preview' | 'still'

/**
 * Node types that exist for the flow author, not for the visitor. They resolve
 * and advance without ever painting a question card.
 */
export const INVISIBLE_NODE_TYPES = new Set(['decision', 'webhook', 'verification', 'transition'])

/**
 * The subset of those that make a server call before advancing. Both node types
 * carry the identical shape (webhookUrl / webhookHeaders / webhookPayload /
 * responseMappings), so one executor covers them; only the builder's labelling
 * differs.
 */
export const WEBHOOK_NODE_TYPES = new Set(['webhook', 'verification'])

export type QuizEffects = {
  /** Server-side AI enrichment. Returns the fields to merge, or null. */
  runAiNode?: ((node: AnyNode, values: QuizValues) => Promise<QuizValues | null>) | null
  /**
   * Server-side webhook / verification call. Returns only the fields the author
   * mapped, or null. Absent means "this surface does not call out" — the flow
   * still advances, untiered, exactly as it does when a provider is down.
   */
  runWebhookNode?: ((node: AnyNode, values: QuizValues) => Promise<Record<string, unknown> | null>) | null
  /**
   * Persist the completed session. `false` means it did NOT land, which
   * releases the single-submit guard so a later endpoint can try again.
   * Absent means this surface never writes a lead.
   */
  submitLead?: ((values: QuizValues) => Promise<boolean> | boolean) | null
  /** Values to seed on mount (URL capture on the public page, UTM stand-ins in the builder). */
  initialValues?: (() => QuizValues) | null
}

/** What the visitor can actually see, counted in one index space. */
export type QuizProgressView = {
  /** Zero-based position among the VISIBLE steps. */
  index: number
  total: number
  /** The authored label of each visible step, in order. */
  labels: string[]
}

export type QuizMachine = {
  mode: QuizMode
  stepIdx: number
  currentTier: string | null
  fieldValues: QuizValues
  currentNode: AnyNode | null
  finished: boolean
  busy: boolean
  busyReason: 'ai' | 'webhook' | null
  submitState: 'idle' | 'sending' | 'done'
  showSpinner: boolean
  canGoBack: boolean
  progress: QuizProgressView
  /** The answer drawn as already chosen. Only a still ever sets it. */
  selectedAnswerId: string | null
  answer: (a: AnyAnswer) => void
  back: () => void
  restart: () => void
}

/**
 * The steps a visitor can actually see, for the tier they are on.
 *
 * The runtime used to report `stepIdx` out of `quiz.steps.length`, which counts
 * the decision, webhook, verification and transition rows nobody ever sees — so
 * a nine-question quiz with four routing rows told the visitor it was thirteen
 * long and every progress form was proportionally wrong. It is also what makes
 * the named-milestone forms safe to feed: `factor_rail`, `milestone_rail`,
 * `path_nodes` and `item_count` draw one label per step, and drawing
 * "Tier Lookup (webhook)" at a visitor is worse than drawing nothing.
 *
 * Tier-aware because step visibility is: a row with no variant for the current
 * tier is skipped at runtime, so it is not part of that visitor's journey.
 */
export const visibleStepView = (
  quiz: AnyQuiz,
  stepIdx: number,
  tier: string | null | undefined,
): QuizProgressView => {
  const steps: any[] = Array.isArray(quiz?.steps) ? quiz.steps : []
  const entries: Array<{ at: number; label: string }> = []
  for (let i = 0; i < steps.length; i += 1) {
    const node = resolveNodeForStep(quiz, steps[i]?.key, tier ?? null)
    if (!node) continue
    if (INVISIBLE_NODE_TYPES.has(node.type)) continue
    if (!isNodeVisible(node)) continue
    entries.push({ at: i, label: String(steps[i]?.label ?? '') })
  }
  // A quiz whose every row is a routing node has no journey to report. One step
  // of one is the honest answer; zero would make every percentage NaN.
  if (entries.length === 0) return { index: 0, total: 1, labels: [] }

  let index = entries.findIndex((e) => e.at === stepIdx)
  if (index < 0) {
    // Standing on a step this list excludes - a webhook mid-flow. Report the
    // last position the visitor actually SAW rather than snapping to zero,
    // which would make the bar jump backwards while a lookup runs.
    index = Math.max(0, entries.filter((e) => e.at < stepIdx).length - 1)
  }
  return { index, total: entries.length, labels: entries.map((e) => e.label) }
}

/* ------------------------------------------------------------------- live */

export const useQuizMachine = ({
  quiz,
  mode = 'live',
  effects = {},
}: {
  quiz: AnyQuiz
  mode?: QuizMode
  effects?: QuizEffects
}): QuizMachine => {
  const [stepIdx, setStepIdx] = useState(() => Math.max(entryStepIndex(quiz, null), 0))
  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<QuizValues>({})
  const [history, setHistory] = useState<Array<{ stepIdx: number; tier: string | null; values: QuizValues }>>([])
  const [finished, setFinished] = useState(false)
  const [busyReason, setBusyReason] = useState<'ai' | 'webhook' | null>(null)
  // 'idle' | 'sending' | 'done' - gates the endpoint card so a redirecting
  // endpoint cannot fire before the lead is persisted.
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'done'>('idle')
  const submittedRef = useRef(false)
  // Consecutive nodes resolved that the visitor never saw. Reset whenever a
  // real question renders; see the skip effect for why it is bounded.
  const autoAdvanceRef = useRef(0)

  // Effects are closures over a deployment and a site, so they are new on every
  // render. Held in a ref so `advance` does not have to be, which is what keeps
  // the skip effect from re-firing and double-advancing a transition node.
  const effectsRef = useRef(effects)
  effectsRef.current = effects

  const currentNode = useMemo(
    () => resolveNodeForStep(quiz, quiz?.steps?.[stepIdx]?.key, currentTier),
    [quiz, stepIdx, currentTier],
  )

  const progress = useMemo(
    () => visibleStepView(quiz, stepIdx, currentTier),
    [quiz, stepIdx, currentTier],
  )

  // Seed values on mount. Deliberately an effect rather than lazy state: the
  // public page reads window.location, and computing that during render would
  // make the server and client markup disagree.
  useEffect(() => {
    const seed = effectsRef.current.initialValues?.() ?? {}
    if (Object.keys(seed).length) setFieldValues((prev) => ({ ...seed, ...prev }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.id])

  // ---------------------------------------------------------------------------
  // Lead submission
  // ---------------------------------------------------------------------------
  const submitOnce = useCallback(async (values: QuizValues) => {
    // Exactly one submit per session, guarded by a ref rather than by state, so
    // a re-render (or React StrictMode's double effect invocation in dev)
    // cannot produce a duplicate lead.
    if (submittedRef.current) return
    submittedRef.current = true

    const submit = effectsRef.current.submitLead
    // Clicking through a builder preview must not create a lead. This is the
    // one guard between "designing a funnel" and "a fake person in the
    // dashboard, a fired pixel, and a webhook delivered to a buyer".
    if (!submit) { setSubmitState('done'); return }

    setSubmitState('sending')
    const landed = await submit(values)
    // Released on failure so a later endpoint in the flow can try again rather
    // than the session being permanently marked as submitted. The driver owns
    // the idempotency key, so a retry cannot double-write.
    if (landed === false) submittedRef.current = false
    setSubmitState('done')
  }, [])

  // ---------------------------------------------------------------------------
  // Flow advance
  // ---------------------------------------------------------------------------
  const advance = useCallback(async (answer: AnyAnswer, node: AnyNode, valuesIn: QuizValues) => {
    const newValues: QuizValues = { ...valuesIn }
    ;(answer.fieldMappings || []).forEach((m: any) => { if (m?.key) newValues[m.key] = m.value })
    if (answer.isDQ) newValues.dq_lead = 'yes'
    if (answer.setTier) newValues.tier = answer.setTier

    // AI nodes run server-side: the prompt lives in the database and is looked
    // up from the deployment, so a visitor can never post an arbitrary prompt
    // to our Anthropic key.
    if (node?.ai?.enabled && node.ai.outputField && effectsRef.current.runAiNode) {
      setBusyReason('ai')
      try {
        const out = await effectsRef.current.runAiNode(node, newValues)
        if (out) for (const [k, v] of Object.entries(out)) if (k) newValues[k] = v
      } catch {
        // An AI enrichment failure must not dead-end the visitor mid-funnel.
      } finally {
        setBusyReason(null)
      }
    }

    // Webhook and verification nodes run server-side, for the same reason AI
    // nodes do: the URL, headers and payload live in the database and are read
    // from the deployment, so a visitor can never aim this server at an address
    // of their choosing. Only the fields the author mapped come back.
    //
    // WHICH SURFACES CALL OUT is `effects.runWebhookNode`'s business, and there
    // are only two correct answers: the public page calls, the builder preview
    // does not - an operator clicking through a design must not deliver a
    // visitor's answers to a buyer. Without a transport the node behaves
    // exactly as it does when a provider is down: no mapped fields, no provider
    // tier, flow continues.
    //
    // What was WRONG was that the builder had its own `advance` with no webhook
    // branch at all, so that difference was an accident of a second
    // implementation rather than a decision anyone made - and in the shipped MVA
    // flow, where the tier lookup's response mapping is the ONLY thing that
    // assigns tiers 1, 2 and 4, it meant the builder walked the quiz untiered
    // and every tier-scoped variant read as dead while production routed on
    // them. It is now one line, in one file, with identical flow either side.
    let webhookTier = ''
    if (node && WEBHOOK_NODE_TYPES.has(node.type) && node.webhookUrl) {
      const mappings = (node.responseMappings || []).filter((m: any) => m?.jsonPath && m?.fieldKey)
      const run = effectsRef.current.runWebhookNode
      if (mappings.length > 0 && run) {
        setBusyReason('webhook')
        try {
          const fields = await run(node, newValues)
          if (fields && typeof fields === 'object') {
            for (const [key, value] of Object.entries(fields)) {
              if (key) newValues[key] = value as string
            }
          }
        } catch {
          // A buyer's endpoint being slow or down must not dead-end a visitor
          // mid-funnel. The flow continues untier'd and the lead still lands.
        } finally {
          setBusyReason(null)
        }

        // A returned tier only steers ROUTING when it names a tier this quiz
        // actually declares. The rule lives in `lib/quiz-webhook/tier` rather
        // than here, because written inline the only way to check any of it was
        // to drive a browser through a quiz and hope the right branch ran.
        const decision = decideTier({
          returned: newValues.tier,
          declared: quiz?.tiers,
          current: currentTier ?? '',
          answerTier: answer.setTier,
        })
        if (decision.fromProvider) webhookTier = decision.tier
        if (decision.rejected) {
          // eslint-disable-next-line no-console
          console.error(rejectedTierMessage(decision.rejected))
        }
      }
    }

    setFieldValues(newValues)

    // An answer's explicit setTier still wins: it is a decision the flow author
    // wrote down, and a lookup must not override it.
    const nextTier = answer.setTier || webhookTier || currentTier
    if (nextTier !== currentTier) setCurrentTier(nextTier)

    if (node?.type === 'decision' && node.conditions) {
      for (const cond of node.conditions) {
        const v = newValues[cond.field] || ''
        const ok = cond.operator === 'eq' ? v === cond.value
          : cond.operator === 'neq' ? v !== cond.value
          : cond.operator === 'contains' ? String(v).includes(cond.value)
          : cond.operator === 'is_empty' ? !v
          : cond.operator === 'is_not_empty' ? Boolean(v)
          : false
        if (ok) {
          const ti = explicitStepIndex(quiz, cond.nextStepKey)
          if (ti >= 0) { setStepIdx(ti); return }
        }
      }
      const di = explicitStepIndex(quiz, node.defaultNextStepKey)
      if (di >= 0) { setStepIdx(di); return }
    }

    const ei = explicitStepIndex(quiz, answer.nextStepKey)
    if (ei >= 0) { setStepIdx(ei); return }

    const seq = nextSequentialStepIndex(quiz, stepIdx, nextTier)
    if (seq >= 0) {
      setStepIdx(seq)
    } else {
      // Ran out of steps without hitting an endpoint. That is still the end of
      // the funnel, so the lead is delivered here too.
      setFinished(true)
      void submitOnce(newValues)
    }
  }, [quiz, stepIdx, currentTier, submitOnce])

  const answerFn = useCallback((answer: AnyAnswer) => {
    if (!currentNode) return
    setHistory((h) => [...h, { stepIdx, tier: currentTier, values: { ...fieldValues } }])
    void advance(answer, currentNode, fieldValues)
  }, [currentNode, stepIdx, currentTier, fieldValues, advance])

  const back = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setStepIdx(last.stepIdx)
      setCurrentTier(last.tier)
      setFieldValues(last.values)
      return h.slice(0, -1)
    })
  }, [])

  const restart = useCallback(() => {
    setStepIdx(Math.max(entryStepIndex(quiz, null), 0))
    setCurrentTier(null)
    setHistory([])
    setFinished(false)
    setSubmitState('idle')
    submittedRef.current = false
    autoAdvanceRef.current = 0
    setFieldValues(effectsRef.current.initialValues?.() ?? {})
  }, [quiz])

  // Nodes the visitor must never see: execute and move on. Also covers a node
  // the author has hidden (isVisible === false).
  useEffect(() => {
    if (!currentNode || finished) return
    const mustSkip = INVISIBLE_NODE_TYPES.has(currentNode.type) || !isNodeVisible(currentNode)
    if (!mustSkip) {
      autoAdvanceRef.current = 0
      return
    }

    // A routing mistake can send the flow between nodes the visitor never sees.
    // Because the skip effect is keyed on the node id, a cycle would not spin
    // the CPU - it would leave the visitor on a loading spinner forever, which
    // is worse. Past the point where every step could legitimately have been
    // skipped once, the funnel ends and whatever was collected is delivered.
    autoAdvanceRef.current += 1
    if (autoAdvanceRef.current > (quiz?.steps?.length ?? 0) + 5) {
      // eslint-disable-next-line no-console
      console.error('[pageflo] quiz flow made no visible progress; ending the session')
      setFinished(true)
      void submitOnce(fieldValues)
      return
    }

    // A short beat so a transition node reads as a transition rather than a flash.
    const delay = currentNode.type === 'transition' ? 700 : 0
    const t = setTimeout(() => { void advance({ nextStepKey: '' }, currentNode, fieldValues) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode?.id, finished])

  // Reaching an endpoint IS the conversion. Submit before the endpoint card is
  // allowed to render, because an endpoint can redirect on a timer.
  useEffect(() => {
    if (!currentNode || currentNode.type !== 'endpoint') return
    void submitOnce(fieldValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode?.id])

  const showSpinner =
    busyReason !== null ||
    Boolean(currentNode && INVISIBLE_NODE_TYPES.has(currentNode.type)) ||
    (currentNode?.type === 'endpoint' && submitState === 'sending')

  return {
    mode,
    stepIdx,
    currentTier,
    fieldValues,
    currentNode,
    finished,
    busy: busyReason !== null,
    busyReason,
    submitState,
    showSpinner,
    canGoBack: history.length > 0,
    progress,
    selectedAnswerId: null,
    answer: answerFn,
    back,
    restart,
  }
}

/* ------------------------------------------------------------------ still */

/**
 * The sample a frozen render draws.
 *
 * It exists so a template gallery can show a REAL render rather than an
 * approximation of one: the same surface, the same card, the same progress and
 * answer forms, driven by a scripted position instead of by a visitor. The
 * labels are samples and belong to no quiz — nothing here is ever written, and
 * a deployed quiz always draws its own questions.
 *
 * Step labels are present because eight of the twenty progress forms name their
 * milestones. A still with no labels would draw those eight as bare bars, which
 * is exactly the approximation this replaces.
 */
const STILL_STEPS = [
  { key: 'accident', label: 'Accident type' },
  { key: 'state', label: 'Accident state' },
  { key: 'injury', label: 'Injuries' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'contact', label: 'Your details' },
]

/**
 * The step drawn is index 1. Every OTHER step still carries a node, because a
 * step with no variant is skipped at runtime and would therefore be skipped by
 * `visibleStepView` too - which would collapse the five-milestone journey the
 * rails exist to draw down to one, in the exact eight templates a still has to
 * prove itself on.
 */
export const STILL_FIXTURE_QUIZ: AnyQuiz = {
  id: 'still_fixture',
  name: 'Sample',
  slug: 'sample',
  tiers: [],
  customFields: [],
  steps: STILL_STEPS,
  nodes: STILL_STEPS.map((s, i) => (
    i === 1
      ? {
        id: 'still_q',
        stepKey: s.key,
        tiers: [],
        type: 'question',
        questionType: 'button_grid',
        fieldName: 'accident_type',
        isVisible: true,
        answerColumns: 2,
        headline: 'How were you injured?',
        question: '',
        subheadline: 'Select the type of accident you were involved in.',
        answers: [
          { id: 'still_a1', label: 'Auto / Motorcycle Accident' },
          { id: 'still_a2', label: 'Commercial / Semi Accident' },
          { id: 'still_a3', label: 'Passenger / Rideshare / Pedestrian' },
          { id: 'still_a4', label: 'At Work / Other' },
        ],
      }
      : {
        id: `still_step_${i}`,
        stepKey: s.key,
        tiers: [],
        type: 'question',
        questionType: 'single_select',
        isVisible: true,
        headline: s.label,
        answers: [],
      }
  )),
}

/**
 * A machine frozen at a scripted position.
 *
 * Same type as the live one on purpose: a composition cannot tell a thumbnail
 * from a page, so it cannot behave differently in one. Every action is a no-op
 * and no effect ever runs, which is what makes a gallery of twenty stills cheap
 * without making any of them a lie.
 */
export const useStillQuizMachine = ({
  quiz = STILL_FIXTURE_QUIZ,
  node = null,
  stepIndex = 1,
  selectedAnswerIndex = 0,
}: {
  quiz?: AnyQuiz
  /** Draw this node instead of the fixture's. Used by the node preview modal. */
  node?: AnyNode | null
  stepIndex?: number
  /** Which answer is drawn as chosen. -1 draws none. */
  selectedAnswerIndex?: number
} = {}): QuizMachine => {
  const noop = useCallback(() => {}, [])

  return useMemo(() => {
    const steps: any[] = Array.isArray(quiz?.steps) ? quiz.steps : []
    const at = Math.max(0, Math.min(stepIndex, Math.max(0, steps.length - 1)))
    const resolved = node ?? resolveNodeForStep(quiz, steps[at]?.key, null) ?? quiz?.nodes?.[0] ?? null
    const answers: any[] = Array.isArray(resolved?.answers) ? resolved.answers : []
    const selected = selectedAnswerIndex >= 0 ? answers[selectedAnswerIndex] ?? null : null
    const view = visibleStepView(quiz, steps[at] ? at : 0, null)

    return {
      mode: 'still' as QuizMode,
      stepIdx: at,
      currentTier: null,
      fieldValues: {},
      currentNode: resolved,
      finished: false,
      busy: false,
      busyReason: null,
      submitState: 'idle' as const,
      showSpinner: false,
      canGoBack: at > 0,
      progress: view,
      selectedAnswerId: selected?.id ? String(selected.id) : null,
      answer: noop,
      back: noop,
      restart: noop,
    }
  }, [quiz, node, stepIndex, selectedAnswerIndex, noop])
}
