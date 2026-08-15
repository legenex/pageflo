// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * The quiz template layer.
 *
 * This file used to hold six templates written out by hand, each one a bag of
 * about twenty-five colour functions. That is why they could only differ in
 * colour: the shape of a question card was identical in all six and there was
 * nowhere to say otherwise. It now resolves the twenty templates in the design
 * handoff, which are DATA - a width, a progress form, an answer form, an icon
 * policy - drawn by shared renderers under `public/quiz/forms/`.
 *
 * What is left here after the composition seam landed is the TOKEN BAG and the
 * colour audit: `getTemplateConfig` still answers "what ground does this
 * template's page take" for the builder toolbar, the gallery thumbnail and the
 * page chrome. The three render helpers that used to live below it are gone -
 * two became primitives a composition places itself, and the third was a header
 * strip identical above all twenty. See the note where they were.
 *
 * Colour comes from the brand through ONE resolver, the same one the landing
 * pages use. Two derivations would give a landing page and the quiz embedded in
 * it different ideas of what that brand's dark ground is, which shows up as a
 * form that not quite matches the page around it.
 */

import { onPrimaryText, auditColorPairs } from '@/lib/builder/color-system'
import { QUIZ_TEMPLATES, templateMaxWidth, cleanProgressForm, PROGRESS_FORM_LABELS } from '@/lib/quiz-templates/model'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { quizTheme, QUIZ_FONTS } from '@/lib/quiz-templates/theme'

/**
 * The spec a stored id draws as.
 *
 * A thin wrapper over the registry rather than its own lookup: the builder must
 * agree with the public renderer about what `'default'` means, and the only way
 * to guarantee that is for both to ask the same module. The wrapper exists so
 * the callers here keep taking a spec rather than a resolution object.
 */
export const resolveQuizTemplate = (id) =>
  reportTemplateFallback(`quiz builder preview`, resolveForRender('quiz', id)).template.template

export { QUIZ_TEMPLATES, PROGRESS_FORM_LABELS }

/**
 * Everything a template needs, for one brand.
 *
 * The keys below the spec are the ones the runtime and the preview already
 * read. They are derived from the same theme the new renderers use rather than
 * computed separately, so there is exactly one answer to "what colour is this
 * card" no matter which of the two paths asks it.
 */
const configFor = (templateId, progressOverride) => {
  const base = resolveQuizTemplate(templateId)
  // The override changes ONE axis. Everything else - width, answers, icons,
  // faces - stays the template's, which is what keeps this a knob rather than
  // a twenty-first template.
  const spec = progressOverride ? { ...base, progress: progressOverride } : base
  const themeFor = (brand, hostSurface) => quizTheme(spec, brand, hostSurface)
  const squared = spec.answers === 'squared_rows' || spec.answers === 'document_stamps' || spec.answers === 'field_rows'

  return {
    spec,
    id: spec.id,
    name: spec.name,
    /** The shape the new form renderers read. */
    theme: themeFor,

    // ---- the keys the existing runtime and preview read --------------------
    resolveColors: (brand) => {
      const t = themeFor(brand)
      return {
        mode: t.surface.isDark ? 'dark' : 'light',
        cardSurface: t.surface.bg,
        surfaceBase: t.surface.bg,
        text: t.surface.text,
        textMute: t.surface.muted,
      }
    },
    pageBg: (brand) => themeFor(brand).page.bg,
    textColorMuted: (brand) => themeFor(brand).page.muted,

    // `cardBackdrop` used to live here as `() => 'none'` and the card spread it
    // straight into a style object: `backdropFilter: tc.cardBackdrop`. A
    // function is truthy, so React was handed a function as a CSS value and
    // dropped it - the knob had never worked in either direction, and could not
    // have, because it was also the same constant for all twenty. Removed
    // rather than corrected: the handoff draws no backdrop filter behind any of
    // the twenty, so there is nothing for it to carry.

    // The handoff draws no page ornament behind any of the twenty. The six this
    // replaces each carried a gradient or a dot grid, and those were the
    // loudest thing on the page that a brand had no way to turn off.
    pageOverlay: () => 'none',
    pagePattern: () => 'none',
    patternSize: '0 0',

    cardBorder: (brand) => `1px solid ${themeFor(brand).surface.line}`,
    cardRadius: squared ? 2 : 12,
    cardShadow: () => 'none',
    /**
     * The template's OWN maximum, in px, or null when it runs full bleed.
     *
     * It used to coalesce full bleed to 1120 - a number that is neither the
     * declared width nor full bleed - and the runtime then wrapped the whole
     * card in a hard 760px column anyway, so the eight templates declaring
     * 820-900 were clamped and `sq_fullscreen_focus` could not reach the edge
     * of anything. Null is passed through to the renderer as "no maximum".
     */
    cardMaxWidth: templateMaxWidth(spec),
    cardPadding: 'clamp(22px, 4vw, 40px) clamp(18px, 3.5vw, 34px)',

    headlineSize: spec.answers === 'oversized_letters' ? 'clamp(28px, 6vw, 44px)' : 'clamp(21px, 4vw, 30px)',
    headlineWeight: spec.serifQuestion ? 600 : 700,
    headlineFamily: () => (spec.serifQuestion ? QUIZ_FONTS.serif : QUIZ_FONTS.display),
    bodyFamily: () => QUIZ_FONTS.body,

    buttonRadius: spec.answers === 'pill_chips' || spec.answers === 'reply_pills' ? 999 : 8,
    footerTrust: '',
  }
}

// Resolved once per template id. The config closes over nothing brand-specific
// - every colour is a function of the brand passed in - so caching it is safe
// and keeps twenty specs from being rebuilt on every render.
const CACHE = new Map()

export const getTemplateConfig = (templateId, progressForm) => {
  const override = cleanProgressForm(progressForm)
  const key = `${typeof templateId === 'string' ? templateId : ''}::${override ?? ''}`
  if (!CACHE.has(key)) CACHE.set(key, configFor(templateId, override))
  return CACHE.get(key)
}

/** Kept under its old name. The six ids it used to hold now resolve forward. */
export const TEMPLATE_CONFIGS = Object.fromEntries(
  QUIZ_TEMPLATES.map((t) => [t.id, getTemplateConfig(t.id)]),
)

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------
//
// THREE OF THEM HAVE MOVED, and where they went is the point.
//
// `renderAnswerButton` and `renderProgressIndicator` are now `P.Answer` and
// `P.Progress` in `src/components/public/quiz/primitives.tsx`, because a
// composition places them itself rather than receiving them in a fixed slot.
//
// `renderHeader` is DELETED. It drew `STEP N OF M` and a `Confidential` pill,
// byte-identical above all twenty templates, immediately above whichever of the
// twenty progress forms the template had chosen - the same class of homogeniser
// as the duplicate progress bar that came out before it, and by then the
// largest single element every template shared. No reference design draws a
// strip common to all twenty: each states its progress in its own words and its
// own place, which is the entire point of having twenty progress forms. A
// header is now the composition's, and sixteen of the twenty progress forms
// already print a step count.

/**
 * Flag pairings a brand can make unreadable.
 *
 * The card and its copy are derived and verified upstream, so those should
 * always pass; what this still catches is the two a brand controls directly -
 * its accent used as a small mark on the card, and the text on a filled button.
 */
export const auditQuizTemplateColors = (templateId, brand) => {
  const tc = getTemplateConfig(templateId)
  const pal = tc.resolveColors(brand)
  // No fallback colour. An audit run against an invented primary reports on a
  // brand that does not exist, which is worse than reporting nothing.
  const primary = brand?.colors?.primary
  if (!primary) return []
  const onPrimary = onPrimaryText(primary)
  return auditColorPairs([
    { label: 'Headline / answer text on card', fg: pal.text, bg: pal.surfaceBase, kind: 'text' },
    { label: 'Muted text on card', fg: pal.textMute, bg: pal.surfaceBase, kind: 'large-text' },
    { label: 'Step badge on card', fg: primary, bg: pal.surfaceBase, kind: 'ui' },
    { label: 'Selected button text', fg: onPrimary, bg: primary, kind: 'text' },
  ])
}
