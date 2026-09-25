/**
 * Copy a visitor may see in a quiz progress rail.
 *
 * Step.label is an authoring name (`Injury Type12121212`, `/submitted (Qualified)`).
 * The visitor-facing string is the question or headline on the node.
 */
import { resolveNodeForStep } from '@/lib/quiz-graph'

const INTERNAL_NODE_TYPES = new Set(['decision', 'webhook', 'verification', 'transition', 'endpoint'])

export const visitorFacingStepLabel = (
  node: { type?: string; question?: string; headline?: string } | null | undefined,
  step: { label?: string } | null | undefined,
): string => {
  if (node?.type && INTERNAL_NODE_TYPES.has(node.type)) return ''
  const question = typeof node?.question === 'string' ? node.question.trim() : ''
  if (question) return question
  const headline = typeof node?.headline === 'string' ? node.headline.trim() : ''
  if (headline) return headline
  const raw = String(step?.label ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return ''
  if (/\((qualified|dq)\)/i.test(raw)) return ''
  if (/lead form/i.test(raw)) return ''
  if (/webhook|lookup/i.test(raw)) return ''
  return raw
}

const asArray = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []

/**
 * Public quiz JSON is shipped in the page. Step.label is an authoring name.
 * Replace it with visitor-facing copy so view-source cannot leak the graph.
 */
const AUTHORING_COPY = /LeadByte|CAPI fire|DQ data still flows|Webhook\s*>|Twilio HLR|BQ for revenue|hidden in live/i

const sanitizeNode = (node: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...node }
  for (const key of ['subheadline', 'question', 'headline', 'tagline'] as const) {
    const value = next[key]
    if (typeof value !== 'string') continue
    if (AUTHORING_COPY.test(value)) {
      next[key] = ''
      continue
    }
    if ((key === 'question' || key === 'subheadline') && value.startsWith('/')) next[key] = ''
  }
  return next
}

export const sanitizePublicQuiz = <T extends { steps?: unknown; nodes?: unknown }>(quiz: T): T => {
  const steps = asArray(quiz.steps).map((step) => {
    const node = resolveNodeForStep(quiz as never, String(step.key ?? ''), null)
    return { ...step, label: visitorFacingStepLabel(node, step) }
  })
  const nodes = asArray(quiz.nodes).map(sanitizeNode)
  return { ...quiz, steps, nodes }
}
