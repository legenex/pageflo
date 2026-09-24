/**
 * Copy a visitor may see in a quiz progress rail.
 *
 * Step.label is an authoring name (`Injury Type12121212`, `/submitted (Qualified)`).
 * The visitor-facing string is the question or headline on the node.
 */
export const visitorFacingStepLabel = (
  node: { type?: string; question?: string; headline?: string } | null | undefined,
  step: { label?: string } | null | undefined,
): string => {
  const question = typeof node?.question === 'string' ? node.question.trim() : ''
  if (question) return question
  const headline = typeof node?.headline === 'string' ? node.headline.trim() : ''
  if (headline) return headline
  const raw = String(step?.label ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return ''
  if (/\((qualified|dq)\)/i.test(raw)) return ''
  if (/lead form/i.test(raw)) return ''
  return raw
}
