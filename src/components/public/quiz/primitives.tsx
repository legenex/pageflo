'use client'

/**
 * The shared visual primitives every composition draws with.
 *
 * This is the half of the composition seam that stops seven designs becoming
 * seven runtimes. A composition owns its canvas, its bands, its type scale and
 * where everything sits; it does NOT own what an input is, what "can submit"
 * means, where the consent line comes from, or how a selection is applied.
 * Those are here, once.
 *
 * Two rules hold across the file and are worth stating before the code:
 *
 * 1. EVERY COLOUR IS DERIVED. Nothing reads `brand.colors.primary` raw. The
 *    card this replaces did, in more than a dozen places — input, textarea and
 *    dropdown borders, the submit fill, the back border, the endpoint medallion
 *    and its button, the routing spinner — and under the product's own
 *    colourless preview brand `${C.primary}55` interpolates to the string
 *    `undefined55`, which is an invalid declaration. Chromium then fell back to
 *    its own `2px inset` input chrome and a transparent disabled submit, so the
 *    brandless lead form was drawn by the browser rather than by the template.
 *    Every value below comes off a `Surface`, which was derived from the brand
 *    and verified against the ground it actually sits on.
 *
 * 2. EVERY PRIMITIVE IS A MODULE-SCOPE COMPONENT taking explicit props, never a
 *    closure rebuilt per render. A composition holds `P` across renders; a
 *    per-render component identity would remount the subtree on every keystroke
 *    and drop focus out of a half-typed phone number.
 */

import { useEffect, useState, type CSSProperties } from 'react'
import { CheckCircle2, GitBranch, Loader2 } from 'lucide-react'

import { isWithin3MonthsOfToday } from '@/components/builder/quiz/seed-data'
import { QuizAnswer, answerLayout } from '@/components/public/quiz/forms/answers'
import { QuizProgress } from '@/components/public/quiz/forms/progress'
import type { Surface } from '@/lib/lp-nodes/surface'
import type { QuizFieldVariant, QuizPrimitives } from '@/lib/quiz-compositions/types'
import type { QuizTheme } from '@/lib/quiz-templates/theme'

const surfaceOf = (theme: QuizTheme, surface?: Surface): Surface => surface ?? theme.surface

/* ------------------------------------------------------------------- copy */

const Tagline: QuizPrimitives['Tagline'] = ({ view, style }) =>
  view.node.tagline ? <div style={style}>{view.node.tagline}</div> : null

const Headline: QuizPrimitives['Headline'] = ({ view, style }) =>
  view.node.headline ? <h2 data-quiz-headline="" style={{ margin: 0, ...style }}>{view.node.headline}</h2> : null

const Question: QuizPrimitives['Question'] = ({ view, style }) =>
  view.node.question ? <div data-quiz-question="" style={style}>{view.node.question}</div> : null

const Subheadline: QuizPrimitives['Subheadline'] = ({ view, style }) =>
  view.node.subheadline ? <p style={{ margin: 0, ...style }}>{view.node.subheadline}</p> : null

/* --------------------------------------------------------------- progress */

/**
 * The percentage is carried as an attribute as well as drawn, because progress
 * is twenty different shapes across the library and "did it move" should not
 * depend on which one a deployment chose.
 */
const Progress: QuizPrimitives['Progress'] = ({ view, theme, spec, surface, style }) => (
  <div data-quiz-progress={String(view.step.percent)} style={style}>
    <QuizProgress
      form={spec.progress}
      theme={surface ? { ...theme, surface } : theme}
      index={view.step.index}
      total={view.step.total}
      labels={[...view.step.labels]}
    />
  </div>
)

/* ---------------------------------------------------------------- answers */

const Answer: QuizPrimitives['Answer'] = ({ option, theme, spec, surface, multi }) => (
  <QuizAnswer
    form={spec.answers}
    icons={spec.icons}
    theme={surface ? { ...theme, surface } : theme}
    label={option.label}
    meta={option.meta ?? ''}
    index={option.index}
    selected={option.selected}
    multi={Boolean(multi)}
    /*
     * NO DATA SOURCE EXISTS FOR THIS, and saying so is the point. A quiz answer
     * is `{ id, label, isDQ, fieldMappings, nextStepKey, setTier }`; there is no
     * icon field anywhere in the model, the editor or the collection, so the
     * fifteen-value `IconPolicy` axis is inert. The forms that draw an icon slot
     * fall back to a letter rather than an empty well. Feeding it is a schema
     * change, and none of the compositions here needs one to be distinct.
     */
    icon={null}
    onSelect={option.select}
  />
)

const AnswerList: QuizPrimitives['AnswerList'] = ({ view, theme, spec, surface, style }) => {
  if (view.input.kind !== 'options') return null
  const layout = answerLayout(spec.answers, view.input.columns)
  return (
    <div style={{ ...layout, ...style }}>
      {view.input.options.map((o) => (
        <Answer key={o.id} option={o} theme={theme} spec={spec} surface={surface} multi={view.input.kind === 'options' && view.input.multi} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- fields */

const fieldChrome = (s: Surface, radius: number, variant: QuizFieldVariant = 'box'): CSSProperties => {
  const base: CSSProperties = {
    color: s.cardText,
    // 16px is the iOS no-zoom threshold. A lead form that zooms the page on
    // focus is a lead form that loses the next field.
    fontSize: 16,
    fontFamily: 'inherit',
    width: '100%',
    minWidth: 0,
  }
  if (variant === 'underline') {
    return {
      ...base,
      padding: '10px 2px',
      border: 'none',
      borderBottom: `1px solid ${s.line}`,
      borderRadius: 0,
      backgroundColor: 'transparent',
    }
  }
  return {
    ...base,
    padding: '12px 16px',
    borderRadius: radius,
    border: `1px solid ${s.line}`,
    backgroundColor: s.card,
  }
}

const Field: QuizPrimitives['Field'] = ({ model, theme, surface, radius = 8, variant = 'box', style }) => {
  const s = surfaceOf(theme, surface)
  const chrome = { ...fieldChrome(s, radius, variant === 'record' ? 'box' : variant), ...style }
  if (model.type === 'textarea') {
    return (
      <textarea
        name={model.key}
        value={model.value}
        onChange={(e) => model.set(e.target.value)}
        placeholder={model.placeholder}
        rows={4}
        aria-label={model.label || model.key}
        style={{ ...chrome, resize: 'vertical' }}
      />
    )
  }
  if (model.type === 'select') {
    return (
      <select
        name={model.key}
        value={model.value}
        onChange={(e) => model.set(e.target.value)}
        aria-label={model.label || model.key}
        style={{ ...chrome, cursor: 'pointer' }}
      >
        <option value="">- Select -</option>
        {model.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  return (
    <input
      name={model.key}
      type={model.type === 'number' ? 'number' : model.type === 'tel' ? 'tel' : model.type === 'email' ? 'email' : 'text'}
      value={model.value}
      onChange={(e) => model.set(e.target.value)}
      placeholder={model.placeholder}
      aria-label={model.label || model.key}
      style={chrome}
    />
  )
}

/**
 * Every field of a form node.
 *
 * `columns` is the composition's, because a lead form is one of the two screens
 * the library differentiates worst and a two-up grid against a stacked column
 * is one of the few structural moves left on it. The honeypot is NOT the
 * composition's: it is drawn here on every form, always, so no design can ship
 * without one.
 */
const Fields: QuizPrimitives['Fields'] = ({ view, theme, surface, radius = 8, columns = 1, variant = 'box', style }) => {
  if (view.input.kind !== 'fields') return null
  const s = surfaceOf(theme, surface)
  const { fields, honeypot } = view.input
  const cols = variant === 'record' ? 1 : columns
  return (
    <div
      data-quiz-form=""
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: cols > 1 ? `repeat(${cols}, minmax(0, 1fr))` : '1fr',
        gap: variant === 'record' ? 0 : 10,
        ...style,
      }}
    >
      {fields.map((f) => (variant === 'record' ? (
        // SQ-16's record row: a fixed mono label column beside the value, the
        // same shape the answer rows above it take, so a case file does not
        // turn into a generic contact form on its last step.
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${s.line}`, padding: '6px 0' }}>
          <span style={{ flex: '0 0 92px', fontFamily: theme.fonts.utility, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.muted }}>
            {f.label || f.key}
          </span>
          <Field model={f} theme={theme} surface={surface} radius={radius} variant="underline" style={{ flex: 1 }} />
        </div>
      ) : (
        <Field
          key={f.key}
          model={f}
          theme={theme}
          surface={surface}
          radius={radius}
          variant={variant}
          style={f.type === 'textarea' && cols > 1 ? { gridColumn: '1 / -1' } : undefined}
        />
      )))}
      {honeypot ? (
        <input
          type="text"
          value={honeypot.value}
          onChange={(e) => honeypot.set(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          name={honeypot.key}
          aria-hidden="true"
          style={{ position: 'absolute', left: -9999, opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ date picker */

const MONTHS: Array<[string, string]> = [
  ['1', 'January'], ['2', 'February'], ['3', 'March'], ['4', 'April'], ['5', 'May'], ['6', 'June'],
  ['7', 'July'], ['8', 'August'], ['9', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
]

const DatePicker: QuizPrimitives['DatePicker'] = ({ view, theme, surface }) => {
  const s = surfaceOf(theme, surface)
  const model = view.input.kind === 'date' ? view.input : null
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  const now = new Date()
  const minYear = new Date(now.getTime() - 1460 * 24 * 60 * 60 * 1000).getFullYear()
  const years: number[] = []
  for (let y = now.getFullYear(); y >= minYear; y -= 1) years.push(y)
  const needDay = Boolean(year && month && isWithin3MonthsOfToday(parseInt(year, 10), parseInt(month, 10)))
  const dayCount = year && month ? new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate() : 0

  const set = model?.set
  useEffect(() => {
    if (!set) return
    if (year && month && (!needDay || day)) {
      set({ year: parseInt(year, 10), month: parseInt(month, 10), day: needDay ? parseInt(day, 10) : null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day, needDay])

  // Reset when the node changes. The picker used to seed its local state on
  // mount only, so two consecutive smart-date questions shared one answer.
  useEffect(() => { setYear(''); setMonth(''); setDay('') }, [view.node.id])

  if (!model) return null

  const label: CSSProperties = { fontSize: 11, color: s.muted, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', fontFamily: theme.fonts.utility }
  const control: CSSProperties = { ...fieldChrome(s, 8), cursor: 'pointer' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: needDay ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
      <div>
        <div style={label}>YEAR</div>
        <select value={year} onChange={(e) => { setYear(e.target.value); setMonth(''); setDay('') }} aria-label="Year" style={control}>
          <option value="">Select year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div>
        <div style={label}>MONTH</div>
        <select value={month} onChange={(e) => { setMonth(e.target.value); setDay('') }} disabled={!year} aria-label="Month" style={{ ...control, opacity: year ? 1 : 0.5 }}>
          <option value="">Select month</option>
          {MONTHS.map(([mv, ml]) => <option key={mv} value={mv}>{ml}</option>)}
        </select>
      </div>
      {needDay ? (
        <div>
          <div style={label}>DAY</div>
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" style={control}>
            <option value="">Pick day</option>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------- naviation */

const Back: QuizPrimitives['Back'] = ({ view, actions, theme, surface, radius = 8, label, style }) => {
  if (!view.nav.canGoBack) return null
  const s = surfaceOf(theme, surface)
  return (
    <button
      type="button"
      data-quiz-back=""
      onClick={actions.back}
      style={{
        padding: '12px 18px', borderRadius: radius, border: `1px solid ${s.line}`,
        backgroundColor: 'transparent', color: s.muted, cursor: 'pointer',
        fontSize: 14, fontWeight: 500, fontFamily: theme.fonts.body, ...style,
      }}
    >
      {label ?? view.nav.backLabel}
    </button>
  )
}

const Submit: QuizPrimitives['Submit'] = ({ view, actions, theme, surface, radius = 8, block, label, style }) => {
  if (!view.nav.showSubmit) return null
  const s = surfaceOf(theme, surface)
  const on = view.nav.canSubmit
  return (
    <button
      type="button"
      data-quiz-submit=""
      onClick={actions.submit}
      disabled={!on}
      aria-disabled={!on}
      style={{
        padding: '14px 28px', borderRadius: radius, border: 'none',
        backgroundColor: on ? s.accentFill : s.line,
        color: on ? s.onAccentFill : s.muted,
        cursor: on ? 'pointer' : 'not-allowed',
        fontSize: 15, fontWeight: 700, fontFamily: theme.fonts.body,
        width: block ? '100%' : undefined, minHeight: 48, ...style,
      }}
    >
      {label ?? view.nav.submitLabel}
    </button>
  )
}

const NAV_JUSTIFY = { between: 'space-between', center: 'center', end: 'flex-end' } as const

const Nav: QuizPrimitives['Nav'] = ({ view, actions, theme, surface, radius = 8, align = 'between', style }) => {
  if (view.phase !== 'question' && view.phase !== 'form') return null
  if (!view.nav.canGoBack && !view.nav.showSubmit) return null
  return (
    <div style={{ display: 'flex', justifyContent: NAV_JUSTIFY[align], alignItems: 'center', gap: 10, flexWrap: 'wrap', ...style }}>
      {view.nav.canGoBack ? <Back view={view} actions={actions} theme={theme} surface={surface} radius={radius} /> : <span />}
      <Submit view={view} actions={actions} theme={theme} surface={surface} radius={radius} />
    </div>
  )
}

/* ---------------------------------------------------------------- consent */

/**
 * The consent line, and THE only place any composition renders it.
 *
 * The publish preflight and the flow validator both treat "the visitor reached
 * a form node" as equivalent to "the visitor saw the TCPA text", and that
 * equivalence is only true while exactly one component prints it on exactly one
 * node type. `scripts/test-quiz-flow.mts` asserts both halves against this
 * file, and asserts that no composition mentions `tcpa` at all.
 */
const Consent: QuizPrimitives['Consent'] = ({ view, theme, surface, style }) => {
  if (view.phase !== 'form' || !view.legal.tcpa) return null
  const s = surfaceOf(theme, surface)
  return (
    <div style={{ fontSize: 11, color: s.muted, marginTop: 12, lineHeight: 1.45, fontFamily: theme.fonts.body, ...style }}>
      {view.legal.tcpa}
    </div>
  )
}

/* --------------------------------------------------------------- outcomes */

const Spinner: QuizPrimitives['Spinner'] = ({ theme, surface, size = 30 }) => {
  const s = surfaceOf(theme, surface)
  return <Loader2 size={size} color={s.accent} style={{ animation: 'spin 1s linear infinite' }} />
}

const Endpoint: QuizPrimitives['Endpoint'] = ({ view, theme, surface, mode }) => {
  const s = surfaceOf(theme, surface)
  const e = view.endpoint
  const preview = mode !== 'live'
  return (
    <div data-quiz-endpoint="" style={{ padding: 24, textAlign: 'center', fontFamily: theme.fonts.body }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', backgroundColor: s.card, border: `1px solid ${s.line}`, color: s.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={32} />
      </div>
      {e?.mode === 'immediate' && e.url ? (
        <div style={{ fontSize: 13, color: s.muted }}>{preview ? 'Would redirect here' : 'Redirecting...'}</div>
      ) : null}
      {e?.mode === 'button' && e.url ? (
        <a
          href={e.url}
          rel="noreferrer"
          onClick={preview ? (ev) => ev.preventDefault() : undefined}
          style={{ display: 'inline-block', marginTop: 8, padding: '14px 32px', backgroundColor: s.accentFill, color: s.onAccentFill, borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: 'none', cursor: preview ? 'default' : 'pointer' }}
        >
          {e.buttonLabel}
        </a>
      ) : null}
      {preview && e?.url ? (
        <div style={{ fontSize: 11, color: s.muted, marginTop: 10, fontFamily: theme.fonts.utility, opacity: 0.8, wordBreak: 'break-all' }}>{e.url}</div>
      ) : null}
      {!e || e.mode === 'none' || !e.url ? (
        <div style={{ fontSize: 13, color: s.muted }}>{view.node.headline ? '' : 'End of flow'}</div>
      ) : null}
    </div>
  )
}

/**
 * A step the visitor never sees: a decision, a webhook, a verification, a
 * transition, or the beat while the lead is being persisted before a
 * redirecting endpoint is allowed to paint.
 *
 * The card this replaces carried a "Continue -> (debug)" affordance for these
 * node types that no surface could ever reach: the runtime tests
 * `machine.showSpinner` first, and every one of those node types sets it. It is
 * dropped rather than kept, because unreachable code that looks like a fallback
 * is read as one.
 */
const Working: QuizPrimitives['Working'] = ({ theme, surface }) => (
  <div style={{ padding: 60, textAlign: 'center' }}>
    <Spinner theme={theme} surface={surface} size={30} />
  </div>
)

const Complete: QuizPrimitives['Complete'] = ({ theme, surface }) => {
  const s = surfaceOf(theme, surface)
  return (
    <div style={{ padding: 48, textAlign: 'center', color: s.text, fontFamily: theme.fonts.body }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Thank you</div>
      <div style={{ fontSize: 15, color: s.muted }}>Your answers have been received.</div>
    </div>
  )
}

/** Builder-only annotations. Never drawn on a live page. */
const Badges: QuizPrimitives['Badges'] = ({ view, theme, surface }) => {
  const s = surfaceOf(theme, surface)
  if (!view.node.hiddenInLive && !view.node.dynamic) return null
  return (
    <>
      {view.node.hiddenInLive ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, padding: 8, backgroundColor: s.card, border: `1px dashed ${s.line}`, borderRadius: 6, color: s.muted }}>
          <GitBranch size={14} />
          <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hidden in live quiz &middot; preview only</span>
        </div>
      ) : null}
      {view.node.dynamic ? (
        <div style={{ fontSize: 10, color: s.accent, marginBottom: 8, fontFamily: theme.fonts.utility, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          dynamic content active
        </div>
      ) : null}
    </>
  )
}

export const QUIZ_PRIMITIVES: QuizPrimitives = {
  Tagline, Headline, Question, Subheadline,
  Progress, Answer, AnswerList,
  Field, Fields, DatePicker,
  Back, Submit, Nav,
  Consent, Endpoint, Working, Complete, Spinner, Badges,
}
