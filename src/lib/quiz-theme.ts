/**
 * Template selection and host-surface inheritance for funnel quizzes.
 *
 * This module used to let a DEPLOYMENT author its own palette. That has been
 * removed (P0-C). Colour has one owner - the brand - and a per-deployment
 * palette was the third owner that made "Don't Settle colours are completely
 * wrong" possible: the brand said one thing, the deployment's generated theme
 * said another, and whichever ran last won.
 *
 * What a deployment may still decide is which TEMPLATE it uses. That is a
 * choice among brand-derived presentations, not a new colour.
 *
 * The one remaining colour operation here is host-surface inheritance, and it
 * is not authoring: when a quiz is dropped into a landing-page card, the HOST
 * tells it which opaque colour it will sit on so text can be derived against
 * the real backdrop. That is context being passed down, not a palette being
 * invented, and removing it would put unreadable text inside light landing
 * pages.
 */

import { onPrimaryText } from './builder/color-system'
import { QUIZ_TEMPLATES } from './quiz-templates/model'
import { resolveForRender, reportTemplateFallback } from './template-registry'

/** Template ids the quiz renderer knows. The registry decides what resolves. */
export const QUIZ_TEMPLATE_IDS = QUIZ_TEMPLATES.map((t) => t.id)
export type QuizTemplateId = string

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * The template a deployment renders with, CANONICALISED.
 *
 * This used to keep its own accept-list — the twenty ids plus the six legacy
 * ones — and hand back whatever it was given if it appeared in either, so a
 * stored `'default'` travelled all the way to the renderer as `'default'` and
 * every downstream reader had to know the legacy table too. It now goes through
 * the registry, which means one id space, aliases resolved once, and a fallback
 * that is logged rather than silent.
 *
 * `context` is what appears in that log line. Passing the deployment's identity
 * is what makes a fallback actionable instead of merely visible.
 */
export const resolveQuizTemplateId = (
  deployment: { id?: string; templateId?: string | null } | null | undefined,
  context = 'quiz deployment',
): QuizTemplateId => {
  const res = reportTemplateFallback(
    deployment?.id ? `${context} ${deployment.id}` : context,
    resolveForRender('quiz', deployment?.templateId),
  )
  return res.template.id
}

type SurfacedBrand = {
  colors: Record<string, string> & { primary: string }
  [k: string]: unknown
}

/**
 * Tell a quiz which opaque surface it is being rendered onto.
 *
 * Returns a new brand whose background and card colours are the host's, so
 * every text colour the renderer derives is measured against the surface the
 * text will actually sit on. `onPrimary` is recomputed for the same reason it
 * always is: a carried-over value is the white-on-white bug waiting to happen.
 *
 * The brand's own identity colours (primary, accent) are untouched. This
 * changes where the quiz is standing, not what brand it is.
 */
export const withHostSurface = <B extends SurfacedBrand>(brand: B, surfaceColor: unknown): B => {
  if (!brand) return brand
  if (typeof surfaceColor !== 'string' || !HEX.test(surfaceColor.trim())) return brand
  const surface = surfaceColor.trim()
  const colors: Record<string, string> = {
    ...brand.colors,
    background: surface,
    cardBg: surface,
    // Recomputed here rather than assigned afterwards: the spread narrows the
    // object to the keys it can see, and a later assignment would not type.
    onPrimary: onPrimaryText(brand.colors.primary),
  }
  return { ...brand, colors } as B
}
