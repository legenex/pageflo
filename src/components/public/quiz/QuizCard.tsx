// @ts-nocheck -- ported artifact component (loose node/brand shapes). Run
// `pnpm generate:types` on the server to restore typing across the funnel builder.
'use client'

/**
 * The question card. ONE card, mounted by every quiz surface there is.
 *
 * Moved here from `builder/quiz/preview.tsx` so the public surface no longer
 * has to import the builder's flow-preview module (and, through it, a server
 * action and the whole quiz editor) to draw a question. Nothing about the
 * composition changed in the move; the fixes below did change, and each says
 * what it was.
 *
 * It is deliberately the ONLY card. `TemplatePreview` used to draw a second,
 * simplified one for every gallery thumbnail and preview modal, which is how a
 * template could be chosen from a picture that no live page would ever produce.
 */

import { useState, useEffect } from 'react'
import { GitBranch, Loader2, CheckCircle2 } from 'lucide-react'

import { T } from '@/components/builder/ui'
import { findNodeTypeMeta } from '@/components/builder/quiz/config'
import { applyDynamicContent, isNodeVisible, isWithin3MonthsOfToday } from '@/components/builder/quiz/seed-data'
import { getTemplateConfig, renderAnswerButton, renderProgressIndicator, renderHeader } from '@/components/builder/quiz/templates'
import { answerLayout } from '@/components/public/quiz/forms/answers'
import { resolveRedirectUrl } from '@/lib/quiz-destinations'
import { onPrimaryText } from '@/lib/builder/color-system'

export const SmartDatePicker = ({ value, onChange, color, theme = 'dark' }) => {
  const [year, setYear] = useState((value || {}).year || '')
  const [month, setMonth] = useState((value || {}).month || '')
  const [day, setDay] = useState((value || {}).day || '')
  const [dayPopupOpen, setDayPopupOpen] = useState(false)
  const now = new Date()
  const minDate = new Date(now.getTime() - 1460 * 24 * 60 * 60 * 1000)
  const minYear = minDate.getFullYear()
  const years = []
  for (let y = now.getFullYear(); y >= minYear; y--) years.push(y)
  const months = [['1', 'January'], ['2', 'February'], ['3', 'March'], ['4', 'April'], ['5', 'May'], ['6', 'June'], ['7', 'July'], ['8', 'August'], ['9', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']]
  const needDay = year && month && isWithin3MonthsOfToday(parseInt(year), parseInt(month))
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
  const dayOpts = year && month ? Array.from({ length: daysInMonth(parseInt(year), parseInt(month)) }, (_, i) => i + 1) : []
  useEffect(() => {
    if (year && month && (!needDay || day)) {
      onChange({ year: parseInt(year), month: parseInt(month), day: needDay ? parseInt(day) : null })
    }
  }, [year, month, day, needDay])

  const isDark = theme === 'dark'
  const fieldBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'
  const fieldBorder = `2px solid ${color}55`
  const labelColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'
  const textColor = isDark ? '#fff' : '#1a1a1a'

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
    <div style={{ display: 'grid', gridTemplateColumns: needDay ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, color: labelColor, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>YEAR</div>
        <select value={year} onChange={(e) => { setYear(e.target.value); setMonth(''); setDay('') }} style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: fieldBorder, backgroundColor: fieldBg, color: textColor, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="" style={{ color: '#333' }}>Select year</option>
          {years.map((y) => <option key={y} value={y} style={{ color: '#333' }}>{y}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontSize: 11, color: labelColor, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>MONTH</div>
        <select value={month} onChange={(e) => { setMonth(e.target.value); setDay('') }} disabled={!year} style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: fieldBorder, backgroundColor: fieldBg, color: textColor, fontSize: 15, fontFamily: 'inherit', cursor: year ? 'pointer' : 'not-allowed', opacity: year ? 1 : 0.5 }}>
          <option value="" style={{ color: '#333' }}>Select month</option>
          {months.map(([mv, ml]) => <option key={mv} value={mv} style={{ color: '#333' }}>{ml}</option>)}
        </select>
      </div>
      {needDay && <div>
        <div style={{ fontSize: 11, color: labelColor, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>DAY</div>
        <button onClick={() => setDayPopupOpen(true)} style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: fieldBorder, backgroundColor: fieldBg, color: textColor, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>{day || 'Pick day'}</button>
      </div>}
    </div>
    {needDay && <div style={{ fontSize: 11.5, color: color, opacity: 0.85, padding: '4px 2px' }}>Within 3 months - day is required</div>}

    {dayPopupOpen && <div onClick={() => setDayPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, backgroundColor: isDark ? '#1a1f2a' : '#fff', border: `1px solid ${color}55`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: textColor, marginBottom: 14, textAlign: 'center' }}>Select Day</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
          {dayOpts.map((d) => <button key={d} onClick={() => { setDay(d); setDayPopupOpen(false) }} style={{ padding: '10px 4px', borderRadius: 6, border: `1px solid ${day === d ? color : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)')}`, backgroundColor: day === d ? `${color}22` : 'transparent', color: textColor, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{d}</button>)}
        </div>
      </div>
    </div>}
  </div>
}

/**
 * @param progressForm    the deployment's progress override. Passed IN rather
 *                        than re-resolved: this component used to call
 *                        `getTemplateConfig(templateId)` with no second
 *                        argument, so the `progress_form` column an operator
 *                        could edit reached the page background and never
 *                        reached the widget it names.
 * @param stepLabels      the authored label of each VISIBLE step. Eight of the
 *                        twenty progress forms name their milestones and every
 *                        one of them was drawing "Factor 1 / Step 2 / …"
 *                        because no caller in the repository passed these.
 * @param selectedAnswerId  forces the drawn selection. Only a frozen still uses
 *                        it; a live card owns its own selection state.
 */
export const PreviewQuestionCard = ({
  node: rawNode, brand, customFields, onAnswer, fieldValues, templateId = 'minimal',
  progressForm = null, stepIdx = 0, totalSteps = 1, stepLabels = null, onBack, canGoBack,
  destinationCtx = null, columns = null, previewMode = false, selectedAnswerId = null,
}) => {
  const node = applyDynamicContent(rawNode, fieldValues)
  const tc = getTemplateConfig(templateId, progressForm)
  const C = brand.colors
  // Resolve the contrast-verified palette once. pal.text / pal.textMute are
  // guaranteed readable on pal.surfaceBase, so headlines/answers/inputs can
  // never go white-on-white regardless of the brand's configured colours.
  const pal = tc.resolveColors(brand)
  const cardFont = tc.bodyFamily(brand)
  const [text, setText] = useState('')
  const [multi, setMulti] = useState([])
  const [smartDate, setSmartDate] = useState({})
  const [formValues, setFormValues] = useState({})
  const [honeypot, setHoneypot] = useState('')
  const [selectedSingle, setSelectedSingle] = useState(null)
  const [dropdownVal, setDropdownVal] = useState('')
  const meta = findNodeTypeMeta(node.questionType)
  const Icon = meta?.icon || GitBranch
  useEffect(() => { setText(''); setMulti([]); setSmartDate({}); setFormValues({}); setHoneypot(''); setSelectedSingle(null); setDropdownVal('') }, [node.id])
  const interp = (s) => (s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => fieldValues[k] || `{{${k}}}`)

  const autoAdvance = node.autoAdvance !== false
  const showBack = node.showBackButton !== false && canGoBack
  const nextText = node.nextButtonText || 'Next →'
  const backText = node.backButtonText || '← Back'
  // `columns` is the container-aware override: the runtime measures the space
  // the card actually has and passes the count that fits. Falling back to the
  // author's setting keeps the builder preview showing what they configured.
  const cols = columns ?? node.answerColumns ?? (node.questionType === 'button_grid' ? 2 : 1)

  /*
   * How the run of answers is arranged.
   *
   * `answerLayout` follows from the answer FORM - chips wrap, reply pills stack
   * to the right, hairline rows sit flush, tiles auto-fit - and it was computed,
   * exported, and then read by nothing except the thumbnail. The live card drew
   * a uniform `repeat(cols, 1fr)` grid for all nineteen forms, which is why a
   * chip row rendered as full-width blocks and the thumbnail disagreed with the
   * page it was advertising. The author's column count still governs the forms
   * whose shape does not dictate an arrangement.
   */
  const answersStyle = answerLayout(tc.spec.answers, cols)

  // The address a redirect resolves to comes from the deployment, then the
  // brand, then the site's own page - never from a URL typed into the node.
  // See src/lib/quiz-destinations.ts for why.
  const redirectUrl = resolveRedirectUrl(node.redirect, destinationCtx || {}, fieldValues || {})

  // A preview must never navigate. Without this guard, opening the last step of
  // a flow in the builder would throw the admin out of the builder and onto the
  // partner's site - and it would do it 800ms later, so it would read as a
  // random crash rather than a redirect.
  useEffect(() => {
    if (previewMode) return
    if (node.type === 'endpoint' && node.redirect?.mode === 'immediate' && redirectUrl) {
      const t = setTimeout(() => { try { window.location.href = redirectUrl } catch {} }, 800)
      return () => clearTimeout(t)
    }
  }, [node.id, redirectUrl, previewMode])

  // Derive from the ACTUAL resolved surface, not a hardcoded template-name
  // guess — so input field tints + the date picker theme follow the real
  // card lightness even when the brand makes a normally-dark template light.
  const isDarkTemplate = pal.mode === 'dark'
  const primaryBtnText = onPrimaryText(C.primary)

  const submitSelected = () => {
    if (selectedSingle) onAnswer(selectedSingle)
    else if (node.questionType === 'multi_select') onAnswer(node.answers[0] || { label: 'Continue' })
    else if (node.questionType === 'smart_date' && smartDate.year && smartDate.month) onAnswer({ ...node.answers[0], fieldMappings: [{ key: node.fieldName, value: `${smartDate.year}-${String(smartDate.month).padStart(2, '0')}${smartDate.day ? '-' + String(smartDate.day).padStart(2, '0') : ''}` }] })
    else if (node.questionType === 'dropdown' && dropdownVal) onAnswer({ ...node.answers[0], fieldMappings: [{ key: node.dropdownField || node.fieldName, value: dropdownVal }] })
    else if (text) onAnswer({ ...node.answers[0], fieldMappings: [{ key: node.fieldName, value: text }] })
    else if (Object.keys(formValues).length) { if (honeypot) return; onAnswer({ ...node.answers[0], fieldMappings: Object.entries(formValues).map(([k, v]) => ({ key: k, value: v })) }) }
    else onAnswer({ nextStepKey: '' })
  }

  const canSubmit = selectedSingle || (node.questionType === 'multi_select' && multi.length > 0) || (node.questionType === 'smart_date' && smartDate.year && smartDate.month && (!isWithin3MonthsOfToday(smartDate.year, smartDate.month) || smartDate.day)) || (node.questionType === 'dropdown' && dropdownVal) || (node.type === 'form' && (node.formFields || []).every((f) => !f.required || formValues[f.key])) || text

  /*
   * The card's own maximum width, which is now the ONLY thing that decides it.
   *
   * The runtime used to wrap this in a hard 760px column, so the eight
   * templates declaring 820-900 were silently clamped and `sq_fullscreen_focus`
   * - the one design that declares full bleed - could not reach the edge of
   * anything. A null maximum means full bleed and is passed through as such.
   */
  const cardStyle = {
    backgroundColor: pal.cardSurface,
    border: tc.cardBorder(brand),
    borderRadius: tc.cardRadius,
    boxShadow: tc.cardShadow(brand),
    padding: tc.cardPadding,
    color: pal.text,
    fontFamily: cardFont,
    maxWidth: tc.cardMaxWidth ?? '100%',
    width: '100%',
    margin: '0 auto',
  }

  // A still forces the selection so a frozen render can show the selected
  // state - the axis on which the twenty differ most - without being clicked.
  const isSelected = (a) => (selectedAnswerId != null ? a?.id === selectedAnswerId : selectedSingle?.id === a?.id)

  /*
   * TEST HOOKS, and they are load-bearing rather than decorative.
   *
   * The landing-page quiz shipped as static markup that LOOKED exactly like this
   * card. Measured in production: `button type=submit`, no React props, seven
   * clicks and zero lead posts. Nothing in the DOM distinguished the real
   * runtime from the picture of it, so nothing could assert the difference.
   *
   * These attributes are what `scripts/test-e2e-lead.mts` addresses, so "the
   * quiz on this page is the real one" is a claim a browser can check on both
   * pages rather than one a person checks by clicking.
   */
  return <div style={cardStyle} className="preview-card" data-quiz-root="" data-quiz-node-type={node.type}>
    {!isNodeVisible(node) && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, padding: 8, backgroundColor: `${C.primary}11`, border: `1px dashed ${C.primary}44`, borderRadius: 6 }}>
      <Icon size={14} style={{ opacity: 0.7 }} /><span style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hidden in live quiz · preview only</span>
    </div>}
    {renderHeader(stepIdx, totalSteps, tc, brand)}
    {renderProgressIndicator(stepIdx, totalSteps, tc, brand, stepLabels)}

    {(rawNode.dynamicContent || []).length > 0 && <div style={{ fontSize: 10, color: T.purple, opacity: 0.75, marginBottom: 8, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>dynamic content active</div>}
    {node.tagline && <div style={{ fontSize: 'clamp(12px, 2.5vw, 13px)', color: pal.textMute, marginBottom: 10, fontWeight: 500, letterSpacing: '0.04em' }}>{interp(node.tagline)}</div>}
    {node.headline && <div data-quiz-headline="" style={{ fontSize: tc.headlineSize, fontWeight: tc.headlineWeight, marginBottom: 8, letterSpacing: '-0.015em', lineHeight: 1.18, color: pal.text, fontFamily: tc.headlineFamily(brand) }}>{interp(node.headline)}</div>}
    {node.question && node.question !== node.headline && <div data-quiz-question="" style={{ fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 600, marginBottom: 8, color: pal.text }}>{interp(node.question)}</div>}
    {node.subheadline && <div style={{ fontSize: 'clamp(13px, 2.7vw, 15px)', color: pal.textMute, marginBottom: 'clamp(16px, 3vw, 24px)', lineHeight: 1.5 }}>{interp(node.subheadline)}</div>}

    {(node.questionType === 'button_grid' || node.questionType === 'single_select') && <div style={answersStyle}>
      {node.answers.map((a, i) => renderAnswerButton(a, i, isSelected(a), () => { if (autoAdvance) onAnswer(a); else setSelectedSingle(a) }, tc, brand))}
    </div>}

    {node.questionType === 'multi_select' && <div style={answersStyle}>
      {node.answers.map((a, i) => renderAnswerButton(a, i, multi.includes(a.id), () => setMulti(multi.includes(a.id) ? multi.filter((x) => x !== a.id) : [...multi, a.id]), tc, brand))}
    </div>}

    {node.questionType === 'dropdown' && <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <select value={dropdownVal} onChange={(e) => { setDropdownVal(e.target.value); if (autoAdvance && e.target.value) onAnswer({ ...node.answers[0], fieldMappings: [{ key: node.dropdownField || node.fieldName, value: e.target.value }] }) }} style={{ width: '100%', padding: '14px 18px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 15, fontFamily: cardFont, cursor: 'pointer' }}>
        <option value="" style={{ color: '#333' }}>- Select -</option>
        {(customFields.find((cf) => cf.key === node.dropdownField)?.options || []).map((o) => <option key={o.value} value={o.value} style={{ color: '#333' }}>{o.label}</option>)}
      </select>
    </div>}

    {node.questionType === 'smart_date' && <SmartDatePicker value={smartDate} onChange={(v) => { setSmartDate(v); if (autoAdvance && v.year && v.month && (!isWithin3MonthsOfToday(v.year, v.month) || v.day)) onAnswer({ ...node.answers[0], fieldMappings: [{ key: node.fieldName, value: `${v.year}-${String(v.month).padStart(2, '0')}${v.day ? '-' + String(v.day).padStart(2, '0') : ''}` }] }) }} color={C.primary} theme={isDarkTemplate ? 'dark' : 'light'} />}

    {(node.questionType === 'text_input' || node.questionType === 'number_input') && <input type={node.questionType === 'number_input' ? 'number' : 'text'} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer..." style={{ width: '100%', maxWidth: 480, margin: '0 auto', padding: '14px 18px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 15, fontFamily: cardFont, display: 'block' }} />}

    {node.questionType === 'textarea' && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us..." rows={5} style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '14px 18px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 14, fontFamily: cardFont, resize: 'vertical', display: 'block' }} />}

    {node.type === 'form' && <div data-quiz-form="" style={{ position: 'relative', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(node.formFields || []).map((f) => f.type === 'textarea' ?
        <textarea key={f.key} name={f.key} value={formValues[f.key] || ''} onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })} placeholder={f.placeholder} rows={3} style={{ padding: '12px 16px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 14, fontFamily: cardFont }} /> :
        <input key={f.key} name={f.key} type={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'} value={formValues[f.key] || ''} onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ padding: '12px 16px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 14, fontFamily: cardFont }} />,
      )}
      {node.honeypot && <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" name="hp_email_secondary" aria-hidden="true" style={{ position: 'absolute', left: -9999, opacity: 0, height: 0, width: 0, pointerEvents: 'none' }} />}
    </div>}

    {(node.type === 'webhook' || node.type === 'decision' || node.type === 'verification') && <div style={{ padding: 24, border: `2px dashed ${C.primary}55`, borderRadius: 8, textAlign: 'center' }}>
      <Loader2 size={28} color={C.primary} style={{ marginBottom: 12, animation: 'spin 1s linear infinite' }} />
      <div style={{ fontSize: 14, color: pal.textMute, marginBottom: 14 }}>{node.type === 'webhook' ? 'Webhook fires automatically' : node.type === 'verification' ? 'Verifying...' : 'Routing...'}</div>
      <button onClick={() => onAnswer({ nextStepKey: '' })} style={{ padding: '12px 24px', backgroundColor: C.primary, color: primaryBtnText, border: 'none', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: cardFont }}>Continue → (debug)</button>
    </div>}

    {node.type === 'transition' && <div style={{ padding: 24, textAlign: 'center' }}>
      <Loader2 size={32} color={C.primary} style={{ animation: 'spin 1s linear infinite', marginBottom: 14 }} />
    </div>}

    {node.type === 'endpoint' && <div data-quiz-endpoint="" style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', backgroundColor: `${C.primary}22`, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={32} /></div>
      {node.redirect?.mode === 'immediate' && redirectUrl && <div style={{ fontSize: 13, color: pal.textMute }}>{previewMode ? 'Would redirect here' : 'Redirecting...'}</div>}
      {node.redirect?.mode === 'button' && redirectUrl && <a href={redirectUrl} rel="noreferrer" onClick={previewMode ? (e) => e.preventDefault() : undefined} style={{ display: 'inline-block', marginTop: 8, padding: '14px 32px', backgroundColor: C.primary, color: primaryBtnText, borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: 'none', fontFamily: cardFont, cursor: previewMode ? 'default' : 'pointer' }}>{node.redirect.buttonText || 'Continue'}</a>}
      {previewMode && redirectUrl && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 10, fontFamily: '"JetBrains Mono", monospace', opacity: 0.8, wordBreak: 'break-all' }}>{redirectUrl}</div>}
      {(!node.redirect || node.redirect.mode === 'none' || !redirectUrl) && <div style={{ fontSize: 13, color: pal.textMute }}>{node.headline ? '' : 'End of flow'}</div>}
    </div>}

    {(node.type === 'question' || node.type === 'form') && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'clamp(18px, 3vw, 28px)', gap: 10 }}>
      {showBack ? <button data-quiz-back="" onClick={onBack} style={{ padding: '12px 20px', borderRadius: tc.buttonRadius, border: `1px solid ${C.primary}44`, backgroundColor: 'transparent', color: pal.textMute, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: cardFont }}>{backText}</button> : <div />}
      {(!autoAdvance || node.questionType === 'multi_select' || node.questionType === 'smart_date' || node.questionType === 'textarea' || node.questionType === 'text_input' || node.questionType === 'number_input' || node.type === 'form') && <button data-quiz-submit="" onClick={submitSelected} disabled={!canSubmit} aria-disabled={!canSubmit} style={{ padding: '14px 28px', borderRadius: tc.buttonRadius === 999 ? 999 : tc.buttonRadius + 4, border: 'none', backgroundColor: canSubmit ? C.primary : `${C.primary}55`, color: primaryBtnText, cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, fontFamily: cardFont, transition: 'all 0.15s', opacity: canSubmit ? 1 : 0.6 }}>{nextText}</button>}
    </div>}

    {node.type === 'form' && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 12, lineHeight: 1.4, opacity: 0.7 }}>{interp(brand.legal.tcpaText)}</div>}
    {tc.footerTrust && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 14, textAlign: 'center', letterSpacing: '0.06em', opacity: 0.6 }}>{tc.footerTrust}</div>}
  </div>
}

export default PreviewQuestionCard
