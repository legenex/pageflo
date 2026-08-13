// @ts-nocheck
/* eslint-disable */
'use client'

// Ported verbatim: the quiz preview/runtime engine (date picker, question card,
// body-section renderer, full preview runner, node preview modal). The single
// AI call (per-node processing) is routed through a server action.

import { useState, useEffect, useMemo } from 'react'
import { GitBranch, Loader2, CheckCircle2, ChevronLeft, RotateCw, Phone, ArrowRight, X } from 'lucide-react'
import { T, Btn, Pill, IconBtn } from '../ui'
import { ICON_OPTIONS } from '../body-sections'
import { findNodeTypeMeta } from './config'
import {
  SEED_CUSTOM_FIELDS, applyDynamicContent, isNodeVisible, isWithin3MonthsOfToday,
} from './seed-data'
import {
  resolveNodeForStep, nextSequentialStepIndex, explicitStepIndex, entryStepIndex,
} from '@/lib/quiz-graph'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { getTemplateConfig, renderAnswerButton, renderProgressIndicator, renderHeader } from './templates'
import { resolveRedirectUrl } from '@/lib/quiz-destinations'
import { onPrimaryText, getSafeTextColor, getSafeMutedColor, deriveBrandSurface } from '@/lib/builder/color-system'
import { aiTestPrompt } from '@/app/(app)/admin/(top)/quizzes/actions'

// Resolve a contrast-safe palette for the standalone PAGE background (the
// surface body sections + header/footer chrome sit on). Distinct from the
// card palette because page bg != card surface for minimal/compact. Editorial
// uses a fixed cream page; everything else uses the brand background.
const resolvePagePalette = (brand, templateId) => {
  // The ground comes from the template's OWN resolver, which is brand-derived.
  // This used to hardcode a cream page for the editorial template and fall back
  // to a navy for everything else, so a brand's background was ignored twice
  // over: once by the template and once by the fallback.
  const tc = getTemplateConfig(templateId)
  const base = tc.pageBg(brand)
  const text = getSafeTextColor(base).hex
  const muted = getSafeMutedColor(text, base).hex
  const cardSurface = deriveBrandSurface(brand?.colors?.cardBg || base, brand?.colors?.primary || base, { hueBlend: 0.05 })
  const cardText = getSafeTextColor(cardSurface).hex
  const cardMuted = getSafeMutedColor(cardText, cardSurface).hex
  return { base, text, muted, cardSurface, cardText, cardMuted, onPrimary: onPrimaryText(brand?.colors?.primary || base) }
}

export const captureURLParamsToFields = (customFields) => {
  if (typeof window === 'undefined' || !window.location) return {}
  const captured = {}
  try {
    const params = new URLSearchParams(window.location.search)
    customFields.forEach((cf) => { if (params.has(cf.key)) captured[cf.key] = params.get(cf.key) })
  } catch {}
  return captured
}

export const renderBodySection = (section, brand, deployment, pal) => {
  if (!section.enabled) return null
  const cfg = section.config || {}
  const C = brand.colors
  // pal is the resolved PAGE palette (text/muted verified against the page bg,
  // cardText/cardSurface verified against the inner card). Falls back to a
  // dark-page assumption only if a caller forgot to pass it.
  const P = pal || { text: C.textOnDark, muted: `${C.textOnDark}b3`, cardSurface: C.cardBg, cardText: C.textOnDark, cardMuted: `${C.textOnDark}b3`, onPrimary: onPrimaryText(C.primary) }
  const fontFamily = `"${brand.typography.headlineFont}", sans-serif`
  const phoneNumber = brand.contact.callNumber

  if (section.type === 'CallCTA') {
    return <div key={section.id} style={{ padding: '40px 24px', textAlign: 'center', fontFamily }}>
      <div style={{ fontSize: 18, color: P.text, marginBottom: 16, fontWeight: 500 }}>{cfg.headline || "If you'd prefer to speak to someone right away, please call:"}</div>
      <a href={`tel:${(phoneNumber || '').replace(/[^0-9+]/g, '')}`} style={{ fontSize: 32, color: C.primary, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <Phone size={26} /> {phoneNumber}
      </a>
    </div>
  }

  if (section.type === 'TrustBlock') {
    const stats = cfg.statsCard || {}
    return <div key={section.id} style={{ padding: '60px 24px', fontFamily, color: P.text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-0.015em', color: P.text }}>{cfg.headline || "We'll Never Stop Fighting For You"}</div>
          <div style={{ fontSize: 15, color: P.muted, marginBottom: 22, lineHeight: 1.5 }}>{cfg.subheadline}</div>
          {(cfg.bullets || []).map((b, i) => {
            const Icon = ICON_OPTIONS[b.icon] || CheckCircle2
            return <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: `${C.primary}33`, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} /></div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, color: P.text }}>{b.text}</div>
            </div>
          })}
          {cfg.ctaText && <button style={{ marginTop: 18, padding: '14px 28px', backgroundColor: C.primary, color: P.onPrimary, border: 'none', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily }}>{cfg.ctaText}</button>}
        </div>
        <div style={{ backgroundColor: P.cardSurface, border: `1px solid ${C.primary}33`, borderRadius: 14, padding: 28, textAlign: 'center', color: P.cardText }}>
          {stats.badge && <div style={{ display: 'inline-block', padding: '5px 12px', backgroundColor: `${C.primary}22`, color: C.primary, fontSize: 12, fontWeight: 600, borderRadius: 999, marginBottom: 14, letterSpacing: '0.02em' }}>{stats.badge}</div>}
          <div style={{ fontSize: 11, color: P.cardMuted, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>{stats.label}</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: C.primary, letterSpacing: '-0.02em', lineHeight: 1 }}>{stats.value}</div>
          {stats.description && <div style={{ fontSize: 13, color: P.cardMuted, marginTop: 14, lineHeight: 1.45 }}>{stats.description}</div>}
        </div>
      </div>
    </div>
  }

  if (section.type === 'RecentWins') {
    return <div key={section.id} style={{ padding: '60px 24px', fontFamily, color: P.text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.015em', color: P.text }}>{cfg.headline}</div>
          <div style={{ fontSize: 14.5, color: P.muted, lineHeight: 1.45, maxWidth: 640, margin: '0 auto' }}>{cfg.subheadline}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {(cfg.wins || []).map((w, i) => <div key={i} style={{ backgroundColor: P.cardSurface, border: `1px solid ${C.primary}33`, borderRadius: 12, padding: '24px 20px', textAlign: 'center', color: P.cardText }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: '-0.02em', marginBottom: 6 }}>{w.amount}</div>
            <div style={{ fontSize: 13.5, color: P.cardText, fontWeight: 500 }}>{w.name}</div>
            <div style={{ fontSize: 12, color: P.cardMuted, marginTop: 2 }}>{w.location}</div>
          </div>)}
        </div>
        {cfg.ctaText && <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button style={{ padding: '14px 32px', backgroundColor: C.primary, color: P.onPrimary, border: 'none', borderRadius: 999, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily }}>{cfg.ctaText}</button>
        </div>}
      </div>
    </div>
  }

  if (section.type === 'Disclaimer') {
    const text = cfg.useDefault ? brand.legal.defaultDisclaimer : cfg.customText
    return <div key={section.id} style={{ padding: '24px', textAlign: 'center', fontFamily, fontSize: 11.5, color: P.muted, lineHeight: 1.5, maxWidth: 900, margin: '0 auto' }}>{text}</div>
  }

  if (section.type === 'CustomHTML') {
    return <div key={section.id} style={{ fontFamily, color: P.text }} dangerouslySetInnerHTML={{ __html: cfg.html || '' }} />
  }

  return null
}

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

export const PreviewQuestionCard = ({ node: rawNode, brand, customFields, onAnswer, fieldValues, templateId = 'minimal', stepIdx = 0, totalSteps = 1, onBack, canGoBack, destinationCtx = null, columns = null, previewMode = false }) => {
  const node = applyDynamicContent(rawNode, fieldValues)
  const tc = getTemplateConfig(templateId)
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

  const cardStyle = {
    backgroundColor: pal.cardSurface,
    border: tc.cardBorder(brand),
    borderRadius: tc.cardRadius,
    boxShadow: tc.cardShadow(brand),
    padding: tc.cardPadding,
    color: pal.text,
    fontFamily: cardFont,
    maxWidth: tc.cardMaxWidth,
    width: '100%',
    margin: '0 auto',
    ...(tc.cardBackdrop ? { backdropFilter: tc.cardBackdrop, WebkitBackdropFilter: tc.cardBackdrop } : {}),
  }

  return <div style={cardStyle} className="preview-card">
    {!isNodeVisible(node) && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, padding: 8, backgroundColor: `${C.primary}11`, border: `1px dashed ${C.primary}44`, borderRadius: 6 }}>
      <Icon size={14} style={{ opacity: 0.7 }} /><span style={{ fontSize: 11, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hidden in live quiz · preview only</span>
    </div>}
    {renderHeader(stepIdx, totalSteps, tc, brand)}
    {renderProgressIndicator(stepIdx, totalSteps, tc, brand)}

    {(rawNode.dynamicContent || []).length > 0 && <div style={{ fontSize: 10, color: T.purple, opacity: 0.75, marginBottom: 8, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>dynamic content active</div>}
    {node.tagline && <div style={{ fontSize: 'clamp(12px, 2.5vw, 13px)', color: pal.textMute, marginBottom: 10, fontWeight: 500, letterSpacing: '0.04em' }}>{interp(node.tagline)}</div>}
    {node.headline && <div style={{ fontSize: tc.headlineSize, fontWeight: tc.headlineWeight, marginBottom: 8, letterSpacing: '-0.015em', lineHeight: 1.18, color: pal.text, fontFamily: tc.headlineFamily(brand) }}>{interp(node.headline)}</div>}
    {node.question && node.question !== node.headline && <div style={{ fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 600, marginBottom: 8, color: pal.text }}>{interp(node.question)}</div>}
    {node.subheadline && <div style={{ fontSize: 'clamp(13px, 2.7vw, 15px)', color: pal.textMute, marginBottom: 'clamp(16px, 3vw, 24px)', lineHeight: 1.5 }}>{interp(node.subheadline)}</div>}

    {(node.questionType === 'button_grid' || node.questionType === 'single_select') && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'clamp(8px, 1.5vw, 12px)' }}>
      {node.answers.map((a, i) => renderAnswerButton(a, i, selectedSingle?.id === a.id, () => { if (autoAdvance) onAnswer(a); else setSelectedSingle(a) }, tc, brand))}
    </div>}

    {node.questionType === 'multi_select' && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
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

    {node.type === 'form' && <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(node.formFields || []).map((f) => f.type === 'textarea' ?
        <textarea key={f.key} value={formValues[f.key] || ''} onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })} placeholder={f.placeholder} rows={3} style={{ padding: '12px 16px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 14, fontFamily: cardFont }} /> :
        <input key={f.key} type={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'} value={formValues[f.key] || ''} onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ padding: '12px 16px', borderRadius: tc.buttonRadius, border: `2px solid ${C.primary}55`, backgroundColor: isDarkTemplate ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', color: pal.text, fontSize: 14, fontFamily: cardFont }} />,
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

    {node.type === 'endpoint' && <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', backgroundColor: `${C.primary}22`, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 size={32} /></div>
      {node.redirect?.mode === 'immediate' && redirectUrl && <div style={{ fontSize: 13, color: pal.textMute }}>{previewMode ? 'Would redirect here' : 'Redirecting...'}</div>}
      {node.redirect?.mode === 'button' && redirectUrl && <a href={redirectUrl} rel="noreferrer" onClick={previewMode ? (e) => e.preventDefault() : undefined} style={{ display: 'inline-block', marginTop: 8, padding: '14px 32px', backgroundColor: C.primary, color: primaryBtnText, borderRadius: 999, fontSize: 15, fontWeight: 600, textDecoration: 'none', fontFamily: cardFont, cursor: previewMode ? 'default' : 'pointer' }}>{node.redirect.buttonText || 'Continue'}</a>}
      {previewMode && redirectUrl && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 10, fontFamily: '"JetBrains Mono", monospace', opacity: 0.8, wordBreak: 'break-all' }}>{redirectUrl}</div>}
      {(!node.redirect || node.redirect.mode === 'none' || !redirectUrl) && <div style={{ fontSize: 13, color: pal.textMute }}>{node.headline ? '' : 'End of flow'}</div>}
    </div>}

    {(node.type === 'question' || node.type === 'form') && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'clamp(18px, 3vw, 28px)', gap: 10 }}>
      {showBack ? <button onClick={onBack} style={{ padding: '12px 20px', borderRadius: tc.buttonRadius, border: `1px solid ${C.primary}44`, backgroundColor: 'transparent', color: pal.textMute, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: cardFont }}>{backText}</button> : <div />}
      {(!autoAdvance || node.questionType === 'multi_select' || node.questionType === 'smart_date' || node.questionType === 'textarea' || node.questionType === 'text_input' || node.questionType === 'number_input' || node.type === 'form') && <button onClick={submitSelected} disabled={!canSubmit} style={{ padding: '14px 28px', borderRadius: tc.buttonRadius === 999 ? 999 : tc.buttonRadius + 4, border: 'none', backgroundColor: canSubmit ? C.primary : `${C.primary}55`, color: primaryBtnText, cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, fontFamily: cardFont, transition: 'all 0.15s', opacity: canSubmit ? 1 : 0.6 }}>{nextText}</button>}
    </div>}

    {node.type === 'form' && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 12, lineHeight: 1.4, opacity: 0.7 }}>{interp(brand.legal.tcpaText)}</div>}
    {tc.footerTrust && <div style={{ fontSize: 11, color: pal.textMute, marginTop: 14, textAlign: 'center', letterSpacing: '0.06em', opacity: 0.6 }}>{tc.footerTrust}</div>}
  </div>
}

export const NodePreviewModal = ({ node, brand, customFields, templateId = 'minimal', onClose }) => {
  if (!node) return null
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: T.textDim, fontFamily: '"JetBrains Mono", monospace' }}>Variant preview · {node.fieldName} · {templateId}</div>
        <div style={{ flex: 1 }} />
        <IconBtn icon={X} onClick={onClose} />
      </div>
      <div style={{ backgroundColor: brand.colors.background, borderRadius: 12, padding: 'clamp(20px, 4vw, 40px) clamp(12px, 3vw, 20px)', overflow: 'auto', flex: 1 }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <PreviewQuestionCard node={node} brand={brand} customFields={customFields} onAnswer={() => {}} fieldValues={{}} templateId={templateId} stepIdx={0} totalSteps={6} canGoBack={false} />
      </div>
    </div>
  </div>
}

export const QuizPreviewView = ({ quiz, brand, deployment, onBackToBuilder, brands, deployments }) => {
  // Entry obeys the same skip rules as advancing, so a quiz whose first row is
  // an optional question opens on the first step a visitor would really see.
  const [stepIdx, setStepIdx] = useState(() => Math.max(entryStepIndex(quiz, null), 0))
  const [currentTier, setCurrentTier] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [history, setHistory] = useState([])
  const [selectedBrandId, setSelectedBrandId] = useState(brand?.id)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(deployment?.id)
  const [aiBusy, setAiBusy] = useState(false)
  const customFields = quiz.customFields || SEED_CUSTOM_FIELDS

  useEffect(() => {
    const captured = {}
    customFields.forEach((cf) => { if (/^(utm_|ad_|campaign|source|medium|gclid|fbclid)/i.test(cf.key)) captured[cf.key] = `preview_${cf.key}` })
    if (Object.keys(captured).length > 0) setFieldValues((prev) => ({ ...captured, ...prev }))
  }, [quiz.id])

  const effectiveDeployment = deployments.find((d) => d.id === selectedDeploymentId) || deployment
  // The brand paints the quiz. A deployment picks the template; it does not
  // author colour, so there is nothing to layer on top here.
  const effectiveBrand = brands.find((b) => b.id === selectedBrandId) || brand
  const renderMode = effectiveDeployment?.renderMode || 'standalone'
  const sections = effectiveDeployment?.bodySectionOverrides || effectiveBrand?.defaultBodySections || []
  // Same source as the public runtime: the brand owns the header and footer, so
  // switching the Brand selector above repaints the chrome and the preview keeps
  // showing what a visitor would actually get.
  const headerConfig = effectiveBrand?.defaultHeader
  const footerConfig = effectiveBrand?.defaultFooter

  // Node resolution and step sequencing both come from quiz-graph so the
  // preview walks the flow exactly as the builder draws it (and, in turn,
  // exactly as the public runtime will).
  const currentNode = useMemo(
    () => resolveNodeForStep(quiz, quiz.steps[stepIdx]?.key, currentTier),
    [quiz, stepIdx, currentTier],
  )

  useEffect(() => {
    if (!currentNode) return
    if (!isNodeVisible(currentNode)) handleAnswer({ nextStepKey: '' })
  }, [currentNode])

  const reset = () => {
    setStepIdx(Math.max(entryStepIndex(quiz, null), 0)); setCurrentTier(null); setHistory([])
    const captured = {}
    customFields.forEach((cf) => { if (/^(utm_|ad_|campaign|source|medium|gclid|fbclid)/i.test(cf.key)) captured[cf.key] = `preview_${cf.key}` })
    setFieldValues(captured)
  }

  const runAINode = async (node, newValues) => {
    if (!node.ai?.enabled || !node.ai.prompt || !node.ai.outputField) return null
    setAiBusy(true)
    try {
      const prompt = node.ai.prompt.replace(/\{\{(\w+)\}\}/g, (_, k) => newValues[k] || `{{${k}}}`)
      const res = await aiTestPrompt({ prompt, model: node.ai.model })
      const text = res.ok ? (res.text || '').trim() : ''
      return { [node.ai.outputField]: text }
    } catch (e) { return null } finally { setAiBusy(false) }
  }

  const handleAnswer = async (answer) => {
    if (!currentNode) return
    setHistory((h) => [...h, { stepIdx, tier: currentTier, values: { ...fieldValues } }])
    let newValues = { ...fieldValues }
    ;(answer.fieldMappings || []).forEach((m) => { if (m.key) newValues[m.key] = m.value })
    if (answer.isDQ) newValues.dq_lead = 'yes'
    if (answer.setTier) setCurrentTier(answer.setTier)

    if (currentNode.ai?.enabled) {
      const aiResult = await runAINode(currentNode, newValues)
      if (aiResult) newValues = { ...newValues, ...aiResult }
    }

    setFieldValues(newValues)

    // Tier can change on this very answer, and the next step must be resolved
    // against the NEW tier - otherwise a tier switch reads the outgoing tier's
    // variants for one step.
    const nextTier = answer.setTier || currentTier

    if (currentNode.type === 'decision' && currentNode.conditions) {
      for (const cond of currentNode.conditions) {
        const v = newValues[cond.field] || ''
        const ok = cond.operator === 'eq' ? v === cond.value : cond.operator === 'neq' ? v !== cond.value : cond.operator === 'contains' ? v.includes(cond.value) : cond.operator === 'is_empty' ? !v : cond.operator === 'is_not_empty' ? !!v : false
        // Explicit routing reaches optional steps on purpose.
        if (ok) { const ti = explicitStepIndex(quiz, cond.nextStepKey); if (ti >= 0) { setStepIdx(ti); return } }
      }
      const di = explicitStepIndex(quiz, currentNode.defaultNextStepKey)
      if (di >= 0) { setStepIdx(di); return }
    }
    const ai = explicitStepIndex(quiz, answer.nextStepKey)
    if (ai >= 0) { setStepIdx(ai); return }

    // No explicit route: fall through in step order, skipping steps marked
    // optional (routed-only) and steps with no variant for this tier.
    const seq = nextSequentialStepIndex(quiz, stepIdx, nextTier)
    if (seq >= 0) setStepIdx(seq)
  }

  const goBack = () => { if (!history.length) return; const last = history[history.length - 1]; setStepIdx(last.stepIdx); setCurrentTier(last.tier); setFieldValues(last.values); setHistory((h) => h.slice(0, -1)) }

  if (!effectiveBrand) return <div style={{ padding: 40, color: T.text }}>No brand selected</div>

  const C = effectiveBrand.colors
  const fontFamily = `"${effectiveBrand.typography.headlineFont}", sans-serif`
  const totalVisible = quiz.steps.filter((s, i) => i <= stepIdx).length
  // ONE resolution, through the registry. There used to be three defaults in
  // this component and two named DIFFERENT templates - `'minimal'` resolves to
  // sq_editorial_inline and `'default'` to sq_quiz_first - so a quiz with no
  // deployment yet (every newly created one) painted its page chrome from one
  // template and its question card from another. Both were valid aliases, so
  // the registry set no fallback flag and nothing was logged.
  const previewTemplateId = reportTemplateFallback(
    'quiz builder preview',
    resolveForRender('quiz', effectiveDeployment?.templateId),
  ).template.id
  const tc = getTemplateConfig(previewTemplateId, effectiveDeployment?.progressForm)
  // Page-level palette for standalone chrome + body sections (verified
  // against the actual page bg, so the editorial cream page / any light brand
  // never renders white-on-white text below the card).
  const pagePal = resolvePagePalette(effectiveBrand, previewTemplateId)
  const pageBg = renderMode === 'embed' ? (effectiveDeployment?.embedPreviewBg || '#1a1a1a') : tc.pageBg(effectiveBrand)
  const pageOverlay = renderMode === 'embed' ? 'none' : tc.pageOverlay(effectiveBrand)
  const pagePattern = renderMode === 'embed' ? 'none' : tc.pagePattern(effectiveBrand)
  const capturedKeys = Object.keys(fieldValues).filter((k) => customFields.find((cf) => cf.key === k))

  return <div className="quiz-public-root" style={{ flex: 1, overflowY: 'auto', background: pageBg, position: 'relative', fontFamily }}>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    {pageOverlay !== 'none' && <div style={{ position: 'absolute', inset: 0, background: pageOverlay, pointerEvents: 'none' }} />}
    {pagePattern !== 'none' && <div style={{ position: 'absolute', inset: 0, backgroundImage: pagePattern, backgroundSize: tc.patternSize || '24px 24px', pointerEvents: 'none', opacity: 0.5 }} />}
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 20px', backgroundColor: 'rgba(37,46,57,0.95)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Brand:</span>
          <select value={selectedBrandId} onChange={(e) => setSelectedBrandId(e.target.value)} style={{ padding: '5px 8px', backgroundColor: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11.5 }}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name || b.displayName}</option>)}</select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Deploy:</span>
          <select value={selectedDeploymentId || ''} onChange={(e) => setSelectedDeploymentId(e.target.value)} style={{ padding: '5px 8px', backgroundColor: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11.5 }}><option value="">- none -</option>{deployments.filter((d) => d.quizId === quiz.id).map((d) => <option key={d.id} value={d.id}>{d.domain}{d.path} ({d.renderMode})</option>)}</select>
        </div>
        <Pill color={renderMode === 'embed' ? T.info : T.purple}>{renderMode.toUpperCase()}</Pill>
        <Pill color={currentTier ? quiz.tiers.find((t) => t.id === currentTier)?.color || T.purple : T.purple}>{currentTier ? quiz.tiers.find((t) => t.id === currentTier)?.name : 'SHARED'}</Pill>
        <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>step {stepIdx + 1}/{quiz.steps.length}</div>
        {capturedKeys.length > 0 && <Pill color={T.info}>{capturedKeys.length} UTM</Pill>}
        {aiBusy && <Pill color={T.purple}><Loader2 size={9} style={{ verticalAlign: '-1px', marginRight: 3, animation: 'spin 1s linear infinite' }} />AI</Pill>}
        <div style={{ flex: 1, minWidth: 100 }} />
        <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={goBack} disabled={!history.length} style={!history.length ? { opacity: 0.4 } : {}}>Back</Btn>
        <Btn variant="secondary" size="sm" icon={RotateCw} onClick={reset}>Reset</Btn>
      </div>

      {renderMode === 'standalone' && headerConfig && <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.primary}33`, display: 'flex', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
        <div style={{ flex: 1 }}>
          {headerConfig.logoEnabled && effectiveBrand.logoUrl ? <img loading="lazy" decoding="async" src={effectiveBrand.logoUrl} alt={effectiveBrand.displayName} style={{ height: 28 }} /> :
            headerConfig.logoEnabled ? <div style={{ fontSize: 18, color: pagePal.text, fontWeight: 700, letterSpacing: '-0.01em' }}>{effectiveBrand.displayName}</div> : null}
        </div>
        {headerConfig.ctaButton?.enabled && headerConfig.ctaButton?.url && <a href={headerConfig.ctaButton.url} style={{ padding: '8px 16px', backgroundColor: C.primary, color: pagePal.onPrimary, borderRadius: effectiveBrand.contact.callCtaStyle === 'pill' ? 999 : 8, fontSize: headerConfig.ctaButton.fontSize || 11, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '0.02em' }}><Phone size={12} /> {headerConfig.ctaButton.text}</a>}
      </div>}

      <div style={{ padding: '40px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ height: 4, backgroundColor: `${C.primary}22`, borderRadius: 999, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(totalVisible / quiz.steps.length) * 100}%`, backgroundColor: C.primary, transition: 'width 0.3s' }} />
          </div>
          {currentNode && isNodeVisible(currentNode) ? <PreviewQuestionCard node={currentNode} brand={effectiveBrand} customFields={customFields} onAnswer={handleAnswer} fieldValues={fieldValues} templateId={previewTemplateId} stepIdx={stepIdx} totalSteps={quiz.steps.length} onBack={goBack} canGoBack={history.length > 0} destinationCtx={{ deployment: effectiveDeployment?.destinationOverrides, brand: effectiveBrand?.urls }} previewMode /> :
            currentNode ? <div style={{ minHeight: 200 }} /> :
            <div style={{ padding: 40, textAlign: 'center', color: pagePal.muted }}>End of quiz</div>}
        </div>
      </div>

      {renderMode === 'standalone' && currentNode && currentNode.type !== 'endpoint' && sections.map((s) => renderBodySection(s, effectiveBrand, effectiveDeployment, pagePal))}

      {renderMode === 'standalone' && footerConfig && <div style={{ padding: '28px 24px', borderTop: `1px solid ${C.primary}22`, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
        {footerConfig.logoEnabled && effectiveBrand.logoUrl ? <img loading="lazy" decoding="async" src={effectiveBrand.logoUrl} alt={effectiveBrand.displayName} style={{ height: footerConfig.logoSize || 32, marginBottom: 12 }} /> : null}
        {footerConfig.showCopyright && effectiveBrand.legal?.copyright ? <div style={{ fontSize: footerConfig.fontSize || 12, color: pagePal.muted }}>{effectiveBrand.legal.copyright}</div> : null}
      </div>}
    </div>

    <style>{`
      .quiz-btn-outlined-box:hover { background-color: var(--quiz-primary) !important; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @media (max-width: 640px) {
        .quiz-public-root .preview-card { padding: 24px 18px !important; border-radius: 14px !important; margin: 16px 12px !important; }
        .quiz-public-root [style*="grid-template-columns"], .quiz-public-root [style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; gap: 10px !important; }
      }
    `}</style>
  </div>
}
