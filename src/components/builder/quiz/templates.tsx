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
 * The exported surface is unchanged on purpose. `getTemplateConfig`, the three
 * render helpers and the colour audit are what the preview engine, the public
 * runtime and the template picker already call, so the twenty arrive behind the
 * same seam the six sat behind and nothing else had to be rewritten.
 *
 * Colour comes from the brand through ONE resolver, the same one the landing
 * pages use. Two derivations would give a landing page and the quiz embedded in
 * it different ideas of what that brand's dark ground is, which shows up as a
 * form that not quite matches the page around it.
 */

import { ShieldCheck } from 'lucide-react'
import { onPrimaryText, auditColorPairs } from '@/lib/builder/color-system'
import { QUIZ_TEMPLATES, templateMaxWidth, cleanProgressForm, PROGRESS_FORM_LABELS } from '@/lib/quiz-templates/model'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { quizTheme, QUIZ_FONTS } from '@/lib/quiz-templates/theme'
import { QuizProgress } from '@/components/public/quiz/forms/progress'
import { QuizAnswer, answerLayout } from '@/components/public/quiz/forms/answers'

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

export { QUIZ_TEMPLATES, answerLayout, PROGRESS_FORM_LABELS }

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
    cardBackdrop: () => 'none',

    // The handoff draws no page ornament behind any of the twenty. The six this
    // replaces each carried a gradient or a dot grid, and those were the
    // loudest thing on the page that a brand had no way to turn off.
    pageOverlay: () => 'none',
    pagePattern: () => 'none',
    patternSize: '0 0',

    cardBorder: (brand) => `1px solid ${themeFor(brand).surface.line}`,
    cardRadius: squared ? 2 : 12,
    cardShadow: () => 'none',
    cardMaxWidth: templateMaxWidth(spec) ?? 1120,
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
// Render helpers, called by the preview engine and the public runtime
// ---------------------------------------------------------------------------

/**
 * One answer, in whichever form this template draws answers.
 *
 * The key belongs on the element returned here, because both callers map over
 * the answer list without supplying one.
 */
export const renderAnswerButton = (a, idx, isSelected, onClick, tc, brand) => (
  <QuizAnswer
    key={a?.id ?? idx}
    form={tc.spec.answers}
    icons={tc.spec.icons}
    theme={tc.theme(brand)}
    label={a?.label ?? ''}
    meta={a?.meta ?? a?.sublabel ?? ''}
    index={idx}
    selected={Boolean(isSelected)}
    multi={Boolean(a?.multi)}
    icon={a?.iconNode ?? null}
    onSelect={onClick}
  />
)

export const renderProgressIndicator = (stepIdx, totalSteps, tc, brand) => (
  // The percentage is carried as an attribute as well as drawn, because a
  // progress bar is twenty different shapes across the library and "did it
  // move" should not depend on which one a deployment chose.
  <div
    data-quiz-progress={String(totalSteps > 1 ? Math.round((stepIdx / (totalSteps - 1)) * 100) : 0)}
    style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}
  >
    <QuizProgress form={tc.spec.progress} theme={tc.theme(brand)} index={stepIdx} total={totalSteps} />
  </div>
)

/**
 * The strip above the question.
 *
 * Deliberately thin. Several of the twenty put their entire progress treatment
 * up here - tabs, a milestone rail, a path of nodes - so anything loud in this
 * strip would compete with the form the template already chose.
 */
export const renderHeader = (stepIdx, totalSteps, tc, brand) => {
  const theme = tc.theme(brand)
  const s = theme.surface
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(12px, 2.5vw, 20px)', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontFamily: theme.fonts.utility, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: s.muted, fontWeight: 600 }}>
        Step {stepIdx + 1} of {totalSteps}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: s.muted, padding: '4px 10px', borderRadius: 999, border: `1px solid ${s.line}` }}>
        <ShieldCheck size={11} /> Confidential
      </span>
    </div>
  )
}

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
