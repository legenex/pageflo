/**
 * The colours and faces a quiz template draws with.
 *
 * Two things come from two places, and keeping them apart is the whole of it.
 * The BRAND owns colour, exactly as it does on a landing page, and the same
 * resolver produces it, so a quiz embedded in a landing page and the page
 * around it cannot end up with different ideas of what that brand's dark ground
 * is. The TEMPLATE owns width, faces and the forms its progress and answers
 * take - none of which is a hue.
 *
 * The fallback below is the neutral set the design handoff draws every template
 * in. That is not a placeholder palette waiting to be replaced: the handoff
 * uses it deliberately, because a template shown in its own colours would be
 * advertising something the deployed quiz will not look like. Reading it as
 * "unfinished" and inventing a hue would put a colour on the page that nobody
 * chose, which is the failure the whole colour system exists to prevent.
 */

import { deriveSurface, type Surface } from '@/lib/lp-nodes/surface'
import { paletteFrom, type Palette, type PaletteFallback } from '@/lib/lp-nodes/palette'
import type { QuizTemplate } from './model'

/**
 * The handoff's neutral fallback, used only where a brand is silent.
 *
 * Grey on purpose. A brand with no colour set renders as visibly unset rather
 * than as a finished design that happens to be the wrong colour, which is the
 * distinction that makes a missing token findable.
 */
export const NEUTRAL_QUIZ_FALLBACK: PaletteFallback = {
  surface: '#ffffff',
  surfaceAlt: '#f2f3f0',
  surfaceDark: '#1c1c1c',
  primary: '#232a34',
  primaryInk: '#ffffff',
  accent: '#8a8e98',
  ink: '#131313',
  inkMuted: '#6e6b5f',
  line: '#c9ccd2',
}

/** The faces the twenty templates are set in, per the handoff. */
export const QUIZ_FONTS = {
  display: "'Archivo', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  serif: "'Source Serif 4', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
}

export const QUIZ_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap'

export type QuizTheme = {
  palette: Palette
  /** The ground the quiz card sits on, with every text colour verified on it. */
  surface: Surface
  /** The page behind the card. Equals the card in inline mode. */
  page: Surface
  /**
   * `question` is the face the template sets its question in - serif for the
   * four that declare it, the display sans otherwise. `display` is that sans
   * unconditionally, which is what a composition's own caps labels and band
   * titles are set in: those are the template's furniture rather than its
   * question, so they must not switch to a serif when the question does.
   */
  fonts: { question: string; display: string; body: string; utility: string }
  width: number | null
}

/**
 * Resolve everything a template needs to draw, for one brand.
 *
 * `hostSurface` is how an embedded quiz is told the opaque colour it will
 * actually sit on. When it is given, every text colour is derived against that
 * rather than against the quiz's own idea of a page, which is what keeps a
 * quiz readable inside a landing-page card of any tone.
 */
/**
 * A second ground inside one template, with its own verified copy colours.
 *
 * Four of the twenty designs band their shell — SQ-03 a dark console header,
 * SQ-05 a dark headline band, SQ-07 an amber urgency strip, SQ-16 a dark
 * titlebar over a tab strip. A band is a different GROUND from the card it sits
 * in, so the text on it has to be derived against the band and not against the
 * card, which is the whole reason this is a function and not a colour constant
 * in a composition. `deriveSurface` is the same resolver the card itself goes
 * through, so a band cannot end up with an idea of the brand's dark that the
 * page around it disagrees with.
 */
export type QuizBand = 'page' | 'card' | 'alt' | 'primary' | 'dark'

export const quizBandSurface = (theme: QuizTheme, band: QuizBand): Surface => {
  const p = theme.palette
  switch (band) {
    case 'page': return theme.page
    case 'card': return theme.surface
    case 'alt': return deriveSurface(p.surfaceAlt, p)
    case 'primary': return deriveSurface(p.primary, p)
    case 'dark': return deriveSurface(p.surfaceDark, p)
    default: return theme.surface
  }
}

export const quizTheme = (
  template: QuizTemplate,
  brand: { colors?: Record<string, unknown> } | null | undefined,
  hostSurface?: string | null,
): QuizTheme => {
  const palette = paletteFrom(NEUTRAL_QUIZ_FALLBACK, brand)
  const pageGround = template.dark ? palette.surfaceDark : palette.surface
  const page = deriveSurface(pageGround, palette)
  const surface = hostSurface ? deriveSurface(hostSurface, palette) : deriveSurface(template.dark ? palette.surfaceDark : palette.surfaceAlt, palette)
  return {
    palette,
    surface,
    page,
    fonts: {
      question: template.serifQuestion ? QUIZ_FONTS.serif : QUIZ_FONTS.display,
      display: QUIZ_FONTS.display,
      body: QUIZ_FONTS.body,
      utility: QUIZ_FONTS.mono,
    },
    width: template.width[1] === 0 ? null : template.width[1],
  }
}
