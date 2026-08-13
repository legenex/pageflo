/**
 * The shape of a template as the PRODUCT sees it.
 *
 * `src/lib/template-registry.ts` answers "does this renderer id resolve" over
 * two code libraries. That is a different question from "what may an operator
 * select, rename, disable or delete", and conflating them is what produced two
 * Landing Page template systems side by side: a code catalogue nothing could
 * choose, and a row collection nobody called a template.
 *
 * A record is the answer to the second question. It is a database row that
 * NAMES a code renderer and carries everything mutable about a template. These
 * types are deliberately free of Payload types so the pure test harnesses can
 * build one without a database.
 */

export type TemplateOrigin = 'stock' | 'clone' | 'blank' | 'ai' | 'legacy'

/** Fields every manageable template has, whichever library it belongs to. */
type ManagedTemplate = {
  /** The row id. This is what a deployment's selection ultimately means. */
  id: string
  name: string
  /** True when this template may be chosen by a NEW deployment. */
  isEnabled: boolean
  origin: TemplateOrigin
  /** The registry id a stock row was materialised from; null for the rest. */
  stockKey: string | null
  archivedAt: string | null
  /**
   * Non-null when the row names a renderer that does not exist.
   *
   * Carried rather than thrown, and never replaced by a stand-in, so every
   * surface can SAY the row is broken instead of drawing something else and
   * looking correct.
   */
  rendererError: string | null
}

export type LpTemplateRecord = ManagedTemplate & {
  kind: 'lp'
  slug: string
  /** The registry id of the code renderer that draws this template. */
  templateId: string
  angle: string
  /** The render gate. Distinct from `isEnabled` — see the collection. */
  isPublished: boolean
  /** Node-renderer copy. Only the four legacy identity templates use it. */
  sections: unknown[]
  /** Ported-renderer copy, keyed by slot id. */
  slotOverrides: Record<string, string>
  /* ---- resolved from the code registry, absent when rendererError is set --- */
  renderer: 'ported' | 'identity' | null
  code: string
  blurb: string
  family: string
  ground: string
  channels: string
  quizPlacement: string
  /** The quiz skin this landing page suggests for an embedded flow. */
  recommendedQuizTemplateId: string
  /** True when the renderer ignores `sections` (the twelve ported templates). */
  usesSlots: boolean
}

export type QuizTemplateRecord = ManagedTemplate & {
  kind: 'quiz'
  /** The stable id a deployment stores. Equal to `rendererKey` for stock rows. */
  templateId: string
  /** The registry id of the code renderer that draws it. */
  rendererKey: string
  code: string
  blurb: string
  configOverrides: Record<string, unknown>
}

export type TemplateRecord = LpTemplateRecord | QuizTemplateRecord

/**
 * Why a template may not be selected right now.
 *
 * Returned rather than filtered out, because a gallery that silently omits a
 * template is indistinguishable from one that never had it, and the operator
 * looking for the template they used last week deserves the reason.
 */
export const selectabilityProblem = (t: TemplateRecord): string | null => {
  if (t.rendererError) return t.rendererError
  if (t.archivedAt) return 'this template has been deleted'
  if (!t.isEnabled) return 'this template is disabled'
  return null
}

export const isSelectable = (t: TemplateRecord): boolean => selectabilityProblem(t) === null
