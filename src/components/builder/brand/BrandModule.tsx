// @ts-nocheck
/* eslint-disable */
'use client'

// Ported verbatim from the LegalOS funnel-builder artifact: the entire Brand
// Identities subsystem (card grid, full-screen BrandEditor with 7 tabs,
// CreateBrandModal, AIBrandWizard, body-section editors). Persistence and AI
// are rewired from localStorage / direct Anthropic calls to server actions.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, ShieldCheck, Trophy, AlertCircle, Code2, CheckCircle2, Sparkles, Award, Star,
  Globe, Zap, ChevronUp, ChevronDown, Trash2, Plus, X, FileText, Palette, Loader2, Save,
  Building2, Edit3,
} from 'lucide-react'
import {
  T, genId, brandShortName, FONT_OPTIONS,
  Btn, Input, Textarea, Select, Label, Pill, IconBtn, ConfirmDialog, Toast, PageHeader, EmptyState,
} from '../ui'
import { saveBrandIdentity, createBrandSite, deleteBrandSite, aiGenerateBrand, proposeBrandTokens } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'
import { settleAction, failureMessage } from '../server-action'
import {
  DESTINATION_KEYS, DESTINATION_LABELS, DESTINATION_HINTS, DEFAULT_PATHS, isSafeDestinationUrl,
} from '@/lib/quiz-destinations'
// The renderer's own chrome derivation. Shared rather than mirrored, so the
// editor cannot show a header the public page will not paint.
import { resolveDefaultChrome } from '@/lib/brand-map'
// The same limits the server enforces, so the picker cannot offer more than the
// action will accept. The server's check is the control; these are the hint.
import {
  MAX_DOCS as MAX_BRAND_DOCS,
  MAX_IMAGES as MAX_BRAND_IMAGES,
  MAX_DOC_CHARS,
  MAX_IMAGE_B64,
  MAX_TOTAL_PAYLOAD,
  DOC_ACCEPT,
  IMAGE_ACCEPT,
  brandPayloadSize,
  formatBytes,
} from '@/lib/brand/source-limits'
import { prepareBrandImage, MAX_IMAGE_EDGE } from './downscale-image'

/**
 * Read the picked documents, refusing anything the action could not carry.
 *
 * The size check happens here rather than server-side because an oversized
 * server-action body is rejected by the framework before the action runs, and
 * that rejection reaches the operator as an unreadable render error. A refusal
 * naming the file is the difference between "fix this" and "something broke".
 */
const readBrandDocs = async (files) => {
  const docs = []
  const errors = []
  for (const file of files) {
    const text = await file.text().catch(() => null)
    if (text == null) { errors.push(`${file.name} could not be read as text.`); continue }
    if (text.length > MAX_DOC_CHARS) {
      errors.push(`${file.name} is ${formatBytes(text.length)}, over the ${formatBytes(MAX_DOC_CHARS)} limit for one document.`)
      continue
    }
    docs.push({ name: file.name, text })
  }
  return { docs, errors }
}

// ============================================================================
// SEED BRAND (defaults for new + AI merge)
// ============================================================================
/**
 * A genuinely blank brand.
 *
 * This used to return Check My Claim: its display name, phone number,
 * copyright line, privacy and terms URLs, domains, colours and fonts. Creating
 * a "new brand" overrode the name and left everything else, so every brand
 * started life as a copy of one tenant and stayed that way in any field nobody
 * happened to edit.
 *
 * It also seeded fabricated social proof - named people, cities and settlement
 * amounts - into the default body sections. On a legal marketing site that is
 * not a branding mistake, it is invented evidence, so the sections now start
 * empty and the operator adds their own.
 *
 * Colours are left blank on purpose. The brand map resolves an unset brand to a
 * neutral grey and flags it incomplete, which reads as "not configured yet".
 * Seeding a plausible palette here would put us straight back to a brand that
 * looks finished and is wrong.
 */
const buildBlankBrand = () => ({
  id: '',
  name: '',
  displayName: '',
  tagline: '',
  logoUrl: '',
  logoUrlDark: '',
  faviconUrl: '',
  colors: {
    primary: '',
    accent: '',
    background: '',
    cardBg: '',
    textOnDark: '',
    success: '',
    warning: '',
    danger: '',
  },
  typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  contact: { callNumber: '', callCtaText: 'CLICK HERE TO CALL', callCtaStyle: 'pill' },
  domains: [],
  legal: {
    // Templated, not copied. {{brand.displayName}} resolves per brand at render,
    // so this text is correct for whoever uses it instead of naming a tenant.
    copyright: '(c) {{year}} {{brand.displayName}}. All rights reserved.',
    tcpaText:
      'By submitting this form, I agree to be contacted by {{brand.displayName}} and its partner attorneys via phone, SMS, and email regarding my claim.',
    privacyUrl: '',
    termsUrl: '',
    defaultDisclaimer: 'Attorney advertising. Not a law firm.',
  },
  urls: {},
  bgPattern: 'plus',
  bgColor: '',
  // Empty on purpose. See the note above about fabricated social proof.
  defaultBodySections: [],
})

// ============================================================================
// BODY SECTION DEFS + ICONS
// ============================================================================
const BODY_SECTION_DEFS = {
  CallCTA: { label: 'Call CTA', icon: Phone, color: T.info, desc: 'Phone number callout' },
  TrustBlock: { label: 'Trust Block', icon: ShieldCheck, color: T.success, desc: 'Headline + bullets + stats card' },
  RecentWins: { label: 'Recent Wins', icon: Trophy, color: T.warning, desc: 'Settlement cards with amounts' },
  Disclaimer: { label: 'Disclaimer', icon: AlertCircle, color: T.textMute, desc: 'Legal disclaimer text' },
  CustomHTML: { label: 'Custom HTML', icon: Code2, color: T.pink, desc: 'Raw HTML escape hatch' },
}

const ICON_OPTIONS = { Trophy, CheckCircle2, Sparkles, ShieldCheck, Award, Star, Phone, Globe, Zap }

// ============================================================================
// BODY SECTION EDITOR
// ============================================================================
const BodySectionEditor = ({ section, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const def = BODY_SECTION_DEFS[section.type]
  const Icon = def?.icon || FileText
  const cfg = section.config || {}
  const updCfg = (patch) => onUpdate({ ...section, config: { ...cfg, ...patch } })

  return (
    <div style={{ backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: `${def?.color}22`, color: def?.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{def?.label || section.type}</div>
          <div style={{ fontSize: 11, color: T.textMute }}>{def?.desc}</div>
        </div>
        <button onClick={() => onUpdate({ ...section, enabled: !section.enabled })} style={{ padding: '5px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600, backgroundColor: section.enabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${section.enabled ? T.success : T.border}`, color: section.enabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{section.enabled ? 'ON' : 'OFF'}</button>
        <IconBtn icon={ChevronUp} onClick={onMoveUp} />
        <IconBtn icon={ChevronDown} onClick={onMoveDown} />
        <IconBtn icon={Trash2} onClick={onDelete} style={{ color: T.danger }} />
      </div>

      {section.type === 'CallCTA' && (
        <div>
          <Label>Headline above phone number</Label>
          <Input value={cfg.headline || ''} onChange={(e) => updCfg({ headline: e.target.value })} placeholder="If you'd prefer to speak to someone right away, please call:" />
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6 }}>Phone number is pulled from the Brand&apos;s contact settings</div>
        </div>
      )}

      {section.type === 'TrustBlock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><Label>Headline</Label><Input value={cfg.headline || ''} onChange={(e) => updCfg({ headline: e.target.value })} /></div>
          <div><Label>Subheadline</Label><Textarea value={cfg.subheadline || ''} onChange={(e) => updCfg({ subheadline: e.target.value })} style={{ minHeight: 50 }} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label style={{ marginBottom: 0 }}>Bullets · {(cfg.bullets || []).length}</Label>
              <Btn variant="ghost" size="xs" icon={Plus} onClick={() => updCfg({ bullets: [...(cfg.bullets || []), { icon: 'CheckCircle2', text: '' }] })}>Add Bullet</Btn>
            </div>
            {(cfg.bullets || []).map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                <Select value={b.icon} onChange={(e) => { const a = [...cfg.bullets]; a[i] = { ...b, icon: e.target.value }; updCfg({ bullets: a }) }} style={{ width: 140, fontSize: 11 }}>
                  {Object.keys(ICON_OPTIONS).map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
                <Input value={b.text} onChange={(e) => { const a = [...cfg.bullets]; a[i] = { ...b, text: e.target.value }; updCfg({ bullets: a }) }} placeholder="Bullet text" style={{ flex: 1 }} />
                <IconBtn icon={X} onClick={() => updCfg({ bullets: cfg.bullets.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <div style={{ padding: 10, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 6 }}>
            <Label>Stats Card</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Input value={(cfg.statsCard || {}).label || ''} onChange={(e) => updCfg({ statsCard: { ...(cfg.statsCard || {}), label: e.target.value } })} placeholder="LABEL (e.g. TOTAL CLIENT WINS)" />
              <Input value={(cfg.statsCard || {}).value || ''} onChange={(e) => updCfg({ statsCard: { ...(cfg.statsCard || {}), value: e.target.value } })} placeholder="VALUE (e.g. 50,000+)" />
              <Input value={(cfg.statsCard || {}).badge || ''} onChange={(e) => updCfg({ statsCard: { ...(cfg.statsCard || {}), badge: e.target.value } })} placeholder="BADGE (e.g. $50M+ Recovered)" />
              <Input value={(cfg.statsCard || {}).description || ''} onChange={(e) => updCfg({ statsCard: { ...(cfg.statsCard || {}), description: e.target.value } })} placeholder="DESCRIPTION" />
            </div>
          </div>
          <div><Label>CTA Button Text (optional)</Label><Input value={cfg.ctaText || ''} onChange={(e) => updCfg({ ctaText: e.target.value })} placeholder="Get Your Free Claim Check" /></div>
        </div>
      )}

      {section.type === 'RecentWins' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><Label>Headline</Label><Input value={cfg.headline || ''} onChange={(e) => updCfg({ headline: e.target.value })} /></div>
          <div><Label>Subheadline</Label><Textarea value={cfg.subheadline || ''} onChange={(e) => updCfg({ subheadline: e.target.value })} style={{ minHeight: 50 }} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label style={{ marginBottom: 0 }}>Wins · {(cfg.wins || []).length}</Label>
              <Btn variant="ghost" size="xs" icon={Plus} onClick={() => updCfg({ wins: [...(cfg.wins || []), { amount: '$0', name: '', location: '' }] })}>Add Win</Btn>
            </div>
            {(cfg.wins || []).map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                <Input value={w.amount} onChange={(e) => { const a = [...cfg.wins]; a[i] = { ...w, amount: e.target.value }; updCfg({ wins: a }) }} placeholder="$132,700" style={{ width: 110 }} />
                <Input value={w.name} onChange={(e) => { const a = [...cfg.wins]; a[i] = { ...w, name: e.target.value }; updCfg({ wins: a }) }} placeholder="Mike P, 31" style={{ flex: 1 }} />
                <Input value={w.location} onChange={(e) => { const a = [...cfg.wins]; a[i] = { ...w, location: e.target.value }; updCfg({ wins: a }) }} placeholder="Memphis, TN" style={{ flex: 1 }} />
                <IconBtn icon={X} onClick={() => updCfg({ wins: cfg.wins.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <div><Label>CTA Button Text</Label><Input value={cfg.ctaText || ''} onChange={(e) => updCfg({ ctaText: e.target.value })} /></div>
        </div>
      )}

      {section.type === 'Disclaimer' && (
        <div>
          <button onClick={() => updCfg({ useDefault: !cfg.useDefault })} style={{ marginBottom: 10, padding: '6px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: cfg.useDefault ? `${T.info}22` : T.bgElev2, border: `1px solid ${cfg.useDefault ? T.info : T.border}`, color: cfg.useDefault ? T.info : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>
            {cfg.useDefault ? 'USE BRAND DEFAULT' : 'USE CUSTOM TEXT'}
          </button>
          {!cfg.useDefault && <Textarea value={cfg.customText || ''} onChange={(e) => updCfg({ customText: e.target.value })} placeholder="Custom disclaimer text..." />}
        </div>
      )}

      {section.type === 'CustomHTML' && (
        <div>
          <Label>HTML</Label>
          <Textarea value={cfg.html || ''} onChange={(e) => updCfg({ html: e.target.value })} placeholder="<div>...</div>" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, minHeight: 120 }} />
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6 }}>Rendered as-is. Use at your own risk.</div>
        </div>
      )}
    </div>
  )
}

const AddBodySectionPicker = ({ onPick, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
      <div style={{ fontSize: 16, color: T.text, fontWeight: 600, marginBottom: 14 }}>Add Body Section</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {Object.entries(BODY_SECTION_DEFS).map(([type, def]) => {
          const Icon = def.icon
          return (
            <button
              key={type}
              onClick={() => onPick(type)}
              style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text, display: 'flex', flexDirection: 'column', gap: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = def.color }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: `${def.color}22`, color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={13} /></div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</span>
              </div>
              <span style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.4 }}>{def.desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  </div>
)

// ============================================================================
// CREATE BRAND MODAL
// ============================================================================
const CreateBrandModal = ({ onPick, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
      <div style={{ fontSize: 17, color: T.text, fontWeight: 700, letterSpacing: '-0.015em', marginBottom: 4 }}>Create New Brand</div>
      <div style={{ fontSize: 12.5, color: T.textMute, marginBottom: 18 }}>Pick how you want to get started</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { id: 'blank', icon: Palette, color: T.primary, title: 'Blank Brand', desc: 'Start from scratch and fill in everything manually' },
          { id: 'ai', icon: Sparkles, color: T.purple, title: 'Create with AI (from URL)', desc: 'Paste brand URLs - AI will scrape logos, colors, fonts, copy, legal' },
          { id: 'github', icon: Code2, color: T.info, title: 'Import from GitHub Repo', desc: 'Paste a public repo URL - AI will analyze the codebase for brand assets' },
        ].map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.id}
              onClick={() => onPick(opt.id)}
              style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text, display: 'flex', alignItems: 'flex-start', gap: 10 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = opt.color }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: `${opt.color}22`, color: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{opt.title}</div>
                <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.4 }}>{opt.desc}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  </div>
)

// ============================================================================
// AI BRAND WIZARD (AI from URL / GitHub). AI runs server-side via invokeLLM.
// ============================================================================
const AIBrandWizard = ({ mode, onClose, onComplete }) => {
  const [urls, setUrls] = useState([''])
  const [repoUrl, setRepoUrl] = useState('')
  const [docs, setDocs] = useState([])
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [notes, setNotes] = useState([])
  /** A finished brand waiting on the operator to read the notes first. */
  const [pending, setPending] = useState(null)
  const docRef = useRef(null)
  const imgRef = useRef(null)

  const pickDocs = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_BRAND_DOCS)
    e.target.value = ''
    if (!files.length) return
    setError(null)
    const { docs: read, errors } = await readBrandDocs(files)
    setDocs(read)
    if (errors.length) setError(errors.join(' '))
  }

  const pickImages = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_BRAND_IMAGES)
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setProgress('Resizing images...')
    const kept = []
    const errors = []
    for (const file of files) {
      // Resized in the browser: the model resizes anything over 1568px anyway,
      // so sending the original only risks the body limit and costs tokens.
      const res = await prepareBrandImage(file, MAX_IMAGE_B64)
      if ('error' in res) errors.push(res.error)
      else kept.push(res)
    }
    setImages(kept)
    setProgress('')
    if (errors.length) setError(errors.join(' '))
  }

  /** What this request would post, and whether it can be posted at all. */
  const payloadSize = brandPayloadSize(docs, images)
  const overBudget = payloadSize > MAX_TOTAL_PAYLOAD

  const run = async () => {
    if (overBudget) {
      setError(`The attachments total ${formatBytes(payloadSize)}, over the ${formatBytes(MAX_TOTAL_PAYLOAD)} that can be sent at once. Remove a document or an image.`)
      return
    }
    setBusy(true)
    setError(null)
    setNotes([])
    setProgress('Asking Claude...')
    try {
      const res = await aiGenerateBrand({ mode, urls: urls.filter(Boolean), repoUrl, docs, images })
      if (!res.ok) throw new Error(res.error)
      setNotes(res.notes || [])
      setProgress('Building brand...')
      const parsed = res.brand || {}
      const seed = buildBlankBrand()
      const built = {
        ...seed,
        id: genId('brand'),
        defaultBodySections: [],
        ...parsed,
        colors: { ...seed.colors, ...(parsed.colors || {}) },
        typography: { ...seed.typography, ...(parsed.typography || {}) },
        contact: { ...seed.contact, ...(parsed.contact || {}) },
        legal: { ...seed.legal, ...(parsed.legal || {}) },
      }
      // onComplete closes this modal and opens the editor, so anything the
      // reading could not establish would flash past unread. When there is
      // something to say, hold here and make continuing a deliberate click.
      if ((res.notes || []).length) setPending(built)
      else onComplete(built)
    } catch (err) {
      setError(err.message || 'Generation failed')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 115, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* The document and image pickers make this dialog tall enough to run off
          a laptop screen, so it scrolls inside itself rather than pushing the
          action buttons out of reach. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 7, backgroundColor: `${T.purple}22`, color: T.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={16} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, color: T.text, fontWeight: 700, letterSpacing: '-0.01em' }}>{mode === 'github' ? 'Create Brand from GitHub' : 'Create Brand from URLs'}</div>
            <div style={{ fontSize: 12, color: T.textMute, marginTop: 2 }}>Reads the URLs, documents and images you attach, then fills only what none of them state</div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        {mode === 'github' ? (
          <div>
            <Label>GitHub Repo URL</Label>
            <Input mono value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/legenex/checkmyclaim.co" />
          </div>
        ) : (
          <div>
            <Label>Brand URLs · {urls.filter(Boolean).length}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {urls.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 5 }}>
                  <Input mono value={u} onChange={(e) => { const a = [...urls]; a[i] = e.target.value; setUrls(a) }} placeholder="https://checkmyclaim.co" style={{ flex: 1 }} />
                  <IconBtn icon={X} onClick={() => setUrls(urls.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <Btn variant="ghost" size="xs" icon={Plus} onClick={() => setUrls([...urls, ''])} style={{ marginTop: 8 }}>Add URL</Btn>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 10 }}>Tip: include both the homepage and the privacy policy / terms pages for the most complete extraction</div>
          </div>
        )}

        {/* Documents and images are additive to whatever source is selected
            above, and each is optional. A brand guideline states the palette
            outright, so it outranks anything read off a live page; images are
            read for tone and for whatever the other sources leave empty. */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Brand documents · {docs.length}</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Btn variant="secondary" size="sm" icon={FileText} onClick={() => docRef.current?.click()}>Add .md files</Btn>
              <span style={{ fontSize: 11.5, color: T.textMute }}>
                {docs.length ? docs.map((d) => d.name).join(', ').slice(0, 70) : `Brand guidelines or design tokens, up to ${MAX_BRAND_DOCS}`}
              </span>
              {docs.length > 0 && <Btn variant="ghost" size="xs" onClick={() => setDocs([])}>Clear</Btn>}
              <input ref={docRef} type="file" multiple accept={DOC_ACCEPT} onChange={pickDocs} style={{ display: 'none' }} />
            </div>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6, lineHeight: 1.45 }}>
              Colours written as <code>Primary: #0B1F3A</code>, in a markdown table, or as CSS custom properties are read exactly and are never rewritten by the model.
            </div>
          </div>

          <div>
            <Label>Brand images · {images.length}</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Btn variant="secondary" size="sm" icon={Palette} onClick={() => imgRef.current?.click()}>Add images</Btn>
              <span style={{ fontSize: 11.5, color: T.textMute }}>
                {images.length ? images.map((i) => i.name).join(', ').slice(0, 70) : `Logo or screenshots, up to ${MAX_BRAND_IMAGES}, under 3MB each`}
              </span>
              {images.length > 0 && <Btn variant="ghost" size="xs" onClick={() => setImages([])}>Clear</Btn>}
              <input ref={imgRef} type="file" multiple accept={IMAGE_ACCEPT} onChange={pickImages} style={{ display: 'none' }} />
            </div>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6, lineHeight: 1.45 }}>
              Resized to {MAX_IMAGE_EDGE}px in your browser before sending, which is the largest size the model reads.
            </div>
          </div>

          {/* Shown once anything is attached, because the ceiling is on the
              request as a whole and a per-file limit cannot express it. */}
          {(docs.length > 0 || images.length > 0) && <div style={{ fontSize: 10.5, color: overBudget ? T.danger : T.textLow }}>
            {formatBytes(payloadSize)} of {formatBytes(MAX_TOTAL_PAYLOAD)} attached
            {overBudget ? ' — remove a document or an image to send this.' : ''}
          </div>}
        </div>

        {notes.length > 0 && <div style={{ marginTop: 14, padding: 10, backgroundColor: `${T.warning}0e`, border: `1px solid ${T.warning}44`, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.warning }}>What the documents could not tell us</div>
          {notes.map((n, i) => <div key={i} style={{ fontSize: 10.5, color: T.textDim, lineHeight: 1.45 }}>{n}</div>)}
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 2 }}>The brand was still created. Everything above can be set by hand in the editor.</div>
        </div>}
        {progress && <div style={{ marginTop: 14, padding: 10, backgroundColor: `${T.purple}11`, border: `1px solid ${T.purple}55`, borderRadius: 6, fontSize: 12, color: T.purple, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {progress}</div>}
        {error && <div style={{ marginTop: 14, padding: 10, backgroundColor: `${T.danger}11`, border: `1px solid ${T.danger}66`, borderRadius: 6, fontSize: 12, color: T.danger }}>Error: {error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
          {pending
            ? <Btn variant="primary" size="md" icon={CheckCircle2} onClick={() => onComplete(pending)}>Continue to editor</Btn>
            : <Btn variant="primary" size="md" icon={busy ? Loader2 : Sparkles} onClick={run} disabled={busy || overBudget || (!(mode === 'github' ? repoUrl.trim() : urls.some((u) => u.trim())) && !docs.length && !images.length)}>{busy ? 'Analyzing...' : 'Analyze & Create'}</Btn>}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

// ============================================================================
// BRAND EDITOR (full screen, 7 tabs)
// ============================================================================
/**
 * Brand Extraction.
 *
 * Relocated here from the deployment editor, where it used to generate and
 * apply a palette per deployment. That made it a third owner of colour and is
 * why one brand's funnels could render in colours the brand record had never
 * seen. It now PROPOSES to the brand, and a human accepts.
 *
 * Every token shows where it came from and how much to trust it, and the
 * contrast verdict is computed by the same resolver the publish gate uses, so
 * Accept is a decision made while looking at the result rather than a hopeful
 * click followed by a landing page built on top of a bad palette.
 */
const BrandExtractionPanel = ({ onAccept }) => {
  const [mode, setMode] = useState('url')
  const [urlValue, setUrlValue] = useState('')
  const [promptValue, setPromptValue] = useState('')
  const [image, setImage] = useState(null)
  const [docs, setDocs] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState(null)
  const fileRef = useRef(null)
  const docRef = useRef(null)

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    // Downscaled for the same reason the wizard downscales: posting the raw
    // file exceeds the server-action body limit, which is rejected before the
    // action runs and cannot be reported from there. This path predates the
    // wizard and had the same latent fault.
    const res = await prepareBrandImage(file, MAX_IMAGE_B64)
    if ('error' in res) { setError(res.error); return }
    setImage({ name: res.name, base64: res.dataBase64, mediaType: res.mediaType })
  }

  const pickDocs = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_BRAND_DOCS)
    e.target.value = ''
    if (!files.length) return
    setError('')
    const { docs: read, errors } = await readBrandDocs(files)
    setDocs(read)
    if (errors.length) setError(errors.join(' '))
  }

  const run = async () => {
    const size = brandPayloadSize(mode === 'markdown' ? docs : [], mode === 'image' && image ? [{ dataBase64: image.base64 }] : [])
    if (size > MAX_TOTAL_PAYLOAD) {
      setError(`That is ${formatBytes(size)}, over the ${formatBytes(MAX_TOTAL_PAYLOAD)} that can be sent at once.`)
      return
    }
    setError(''); setProposal(null); setBusy(true)
    try {
      const res = await proposeBrandTokens({
        source: mode,
        value: mode === 'url' ? urlValue : mode === 'prompt' ? promptValue : '',
        imageBase64: mode === 'image' ? image?.base64 : undefined,
        imageMediaType: mode === 'image' ? image?.mediaType : undefined,
        docs: mode === 'markdown' ? docs : undefined,
      })
      if (res.ok) setProposal(res.proposal)
      else setError(res.error || 'Extraction failed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.')
    } finally { setBusy(false) }
  }

  const canRun = !busy && (mode === 'url' ? urlValue.trim() : mode === 'prompt' ? promptValue.trim() : mode === 'markdown' ? docs.length : image)
  const MODES = [
    { id: 'url', label: 'From a URL' },
    { id: 'markdown', label: 'From a document' },
    { id: 'image', label: 'From an image' },
    { id: 'prompt', label: 'From a description' },
  ]

  return <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Brand extraction</div>
    <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.5 }}>
      Proposes colours and fonts for this brand. Nothing is applied until you accept it, and every value shows where it came from.
      A brand document is the strongest source, because a guideline that says &quot;Primary: #0B1F3A&quot; is the brand stating the answer rather than us inferring it.
      A URL is read by rendering the page and sampling what it paints, falling back to its stylesheet when the site blocks that.
    </div>

    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {MODES.map((m) => <button key={m.id} onClick={() => { setMode(m.id); setError(''); setProposal(null) }} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, backgroundColor: mode === m.id ? T.bgElev2 : 'transparent', border: `1px solid ${mode === m.id ? T.primary : T.border}`, color: mode === m.id ? T.text : T.textMute, cursor: 'pointer' }}>{m.label}</button>)}
    </div>

    {mode === 'url' && <Input mono value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://example.com" />}
    {mode === 'prompt' && <Textarea value={promptValue} onChange={(e) => setPromptValue(e.target.value)} placeholder="Calm and clinical. Deep green, off-white cards, serif headlines." style={{ minHeight: 60 }} />}
    {mode === 'image' && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Btn variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Choose image</Btn>
      <span style={{ fontSize: 11.5, color: T.textMute }}>{image ? image.name : 'JPEG, PNG, GIF or WebP, under 3MB'}</span>
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} onChange={pickImage} style={{ display: 'none' }} />
    </div>}
    {mode === 'markdown' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn variant="secondary" size="sm" icon={FileText} onClick={() => docRef.current?.click()}>Choose documents</Btn>
        <span style={{ fontSize: 11.5, color: T.textMute }}>
          {docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'}` : `Brand guidelines or design tokens, up to ${MAX_BRAND_DOCS}`}
        </span>
        {docs.length > 0 && <Btn variant="ghost" size="xs" onClick={() => setDocs([])}>Clear</Btn>}
        <input ref={docRef} type="file" multiple accept={DOC_ACCEPT} onChange={pickDocs} style={{ display: 'none' }} />
      </div>
      {docs.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {docs.map((d) => <span key={d.name} style={{ fontSize: 10.5, color: T.textDim, padding: '3px 7px', borderRadius: 4, backgroundColor: T.bg, border: `1px solid ${T.border}`, fontFamily: '"JetBrains Mono", monospace' }}>{d.name}</span>)}
      </div>}
      <div style={{ fontSize: 10.5, color: T.textLow, lineHeight: 1.45 }}>
        Colours are read from lines like <code>Primary: #0B1F3A</code>, markdown tables, and CSS custom properties. Label each colour with its role, or it is reported rather than applied.
      </div>
    </div>}

    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Btn variant="primary" size="sm" icon={busy ? Loader2 : Sparkles} onClick={run} disabled={!canRun} style={!canRun ? { opacity: 0.5 } : {}}>{busy ? 'Reading...' : 'Propose tokens'}</Btn>
      {error && <span style={{ fontSize: 11.5, color: T.danger }}>{error}</span>}
    </div>

    {proposal && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
        {Object.entries(proposal.tokens).map(([k, v]) => {
          const ev = proposal.evidence?.[k]
          const isColor = /^#/.test(String(v))
          return <div key={k} style={{ padding: 8, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isColor && <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: String(v), border: `1px solid ${T.border}` }} />}
              <span style={{ fontSize: 11, color: T.text, fontFamily: '"JetBrains Mono", monospace' }}>{k} {String(v)}</span>
              {ev && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: ev.confidence >= 0.5 ? T.textMute : T.warning }}>{Math.round(ev.confidence * 100)}%</span>}
            </div>
            {ev && <div style={{ fontSize: 10, color: T.textLow, marginTop: 3, lineHeight: 1.35 }}>{ev.source}</div>}
          </div>
        })}
      </div>

      {proposal.rationale && <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.5 }}>{proposal.rationale}</div>}

      {/* What the reading could not establish. Shown because a bare set of
          tokens cannot distinguish "this site has no logo colour" from "we
          could not read this site", and those call for different actions. */}
      {proposal.notes?.length > 0 && <div style={{ padding: 10, backgroundColor: `${T.warning}0e`, border: `1px solid ${T.warning}44`, borderRadius: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.warning, marginBottom: 5 }}>What this reading could not tell us</div>
        {proposal.notes.map((n, i) => <div key={i} style={{ fontSize: 10.5, color: T.textDim, lineHeight: 1.45 }}>{n}</div>)}
      </div>}

      <div style={{ padding: 10, backgroundColor: proposal.passes ? `${T.success}11` : `${T.danger}11`, border: `1px solid ${proposal.passes ? T.success : T.danger}`, borderRadius: 6 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: proposal.passes ? T.success : T.danger, marginBottom: 6 }}>
          {proposal.passes ? 'Contrast passes on every pair' : 'Contrast fails, this palette is not publishable as-is'}
        </div>
        {proposal.audit.filter((a) => !a.pass).map((a) => <div key={a.pair} style={{ fontSize: 10.5, color: T.danger }}>{a.pair}: {a.ratio}:1</div>)}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="primary" size="sm" icon={CheckCircle2} onClick={() => { onAccept(proposal.tokens); setProposal(null) }}>Accept into this brand</Btn>
        <Btn variant="ghost" size="sm" onClick={() => setProposal(null)}>Discard</Btn>
      </div>
    </div>}
  </div>
}

const BrandEditor = ({ brand, isDraft, onSave, onBack }) => {
  const [draft, setDraft] = useState(brand)
  const [dirty, setDirty] = useState(isDraft || false)
  const [tab, setTab] = useState('identity')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [leaveReq, setLeaveReq] = useState(false)
  useEffect(() => { setDraft(brand); setDirty(isDraft || false) }, [brand, isDraft])
  const update = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true) }
  const updColors = (p) => update({ colors: { ...draft.colors, ...p } })
  const updTypo = (p) => update({ typography: { ...draft.typography, ...p } })
  const updContact = (p) => update({ contact: { ...draft.contact, ...p } })
  const updLegal = (p) => update({ legal: { ...draft.legal, ...p } })
  // Destination URLs for this brand. Every quiz and funnel running under it
  // resolves thank-you / DQ / legal links from here, so they are set once per
  // brand instead of being typed into individual quiz nodes.
  const updUrls = (p) => update({ urls: { ...(draft.urls || {}), ...p } })

  // Page chrome for this brand's standalone funnel pages. Resolved through the
  // SAME function the renderer uses, so the editor shows the header and footer a
  // visitor will actually get - including for a brand that has never opened this
  // tab, whose chrome is derived rather than blank.
  const chrome = resolveDefaultChrome(draft, draft.contact)
  const updHeader = (p) => update({ defaultHeader: { ...(draft.defaultHeader || {}), ...p } })
  const updHeaderCta = (p) => update({ defaultHeader: { ...(draft.defaultHeader || {}), ctaButton: { ...((draft.defaultHeader || {}).ctaButton || {}), ...p } } })
  const updFooter = (p) => update({ defaultFooter: { ...(draft.defaultFooter || {}), ...p } })

  const sections = draft.defaultBodySections || []
  const addSection = (type) => { update({ defaultBodySections: [...sections, { id: genId('s'), type, enabled: true, config: {} }] }); setPickerOpen(false) }
  const updSection = (s) => update({ defaultBodySections: sections.map((x) => (x.id === s.id ? s : x)) })
  const delSection = (id) => update({ defaultBodySections: sections.filter((s) => s.id !== id) })
  const moveSection = (idx, dir) => { const a = [...sections]; const ni = idx + dir; if (ni < 0 || ni >= a.length) return;[a[idx], a[ni]] = [a[ni], a[idx]]; update({ defaultBodySections: a }) }

  const handleBack = () => { if (dirty) setLeaveReq(true); else onBack() }
  const handleSave = () => { onSave(draft); setDirty(false) }
  const handleSaveAndExit = () => { onSave(draft); setDirty(false); onBack() }

  // "Default Body Sections" here is NOT the deployment-level "Body Sections"
  // tab that was removed from the LP and Quiz deployment editors. It is where
  // that concept MOVED TO: these are brand-level defaults, siblings of
  // "Default Header & Footer", inherited by every deployment of the brand
  // rather than authored per placement. The word "Default" is what carries the
  // distinction, so keep it — a bare "Body Sections" label here would read as
  // the surface that was deliberately retired.
  const tabs = [
    { id: 'identity', label: 'Identity' }, { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' }, { id: 'contact', label: 'Contact' },
    { id: 'domains', label: 'Domains' }, { id: 'legal', label: 'Legal' },
    { id: 'urls', label: 'URLs' },
    { id: 'chrome', label: 'Default Header & Footer' },
    { id: 'sections', label: `Default Body Sections · ${sections.length}` },
  ]

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: T.bg }}>
        <div style={{ padding: '24px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 24, color: T.text, fontWeight: 700, letterSpacing: '-0.025em' }}>{draft.name}</div>
                {isDraft && <Pill color={T.warning}>NEW · NOT SAVED</Pill>}
              </div>
              <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>{isDraft ? 'Brand will be created when you save' : 'Brand identity used by deployments that point to this brand'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {dirty && !isDraft && <Pill color={T.warning} style={{ alignSelf: 'center' }}>UNSAVED</Pill>}
              <Btn variant="ghost" size="md" onClick={handleBack}>Back</Btn>
              <Btn variant="secondary" size="md" icon={Save} onClick={handleSave}>Save</Btn>
              <Btn variant="primary" size="md" icon={Save} onClick={handleSaveAndExit}>Save & Exit</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 22, overflowX: 'auto' }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '11px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? T.primary : 'transparent'}`, color: tab === t.id ? T.text : T.textMute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>{t.label}</button>
            ))}
          </div>

          {tab === 'identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><Label>Brand Name (internal)</Label><Input value={draft.name} onChange={(e) => update({ name: e.target.value })} /></div>
              <div><Label>Display Name (shown to users)</Label><Input value={draft.displayName} onChange={(e) => update({ displayName: e.target.value })} /></div>
              <div><Label>Tagline (optional)</Label><Input value={draft.tagline || ''} onChange={(e) => update({ tagline: e.target.value })} /></div>
              <div><Label>Logo URL (light)</Label><Input mono value={draft.logoUrl || ''} onChange={(e) => update({ logoUrl: e.target.value })} placeholder="https://..." /></div>
              <div><Label>Logo URL (dark variant)</Label><Input mono value={draft.logoUrlDark || ''} onChange={(e) => update({ logoUrlDark: e.target.value })} placeholder="https://..." /></div>
              <div><Label>Favicon URL</Label><Input mono value={draft.faviconUrl || ''} onChange={(e) => update({ faviconUrl: e.target.value })} placeholder="https://.../favicon.ico" /></div>
              <div>
                <Label>Background Pattern</Label>
                <Select value={draft.bgPattern || 'none'} onChange={(e) => update({ bgPattern: e.target.value })}>
                  <option value="none">None</option>
                  <option value="plus">Plus / Crosses (CMC style)</option>
                  <option value="dots">Dots</option>
                  <option value="grid">Grid</option>
                </Select>
              </div>
            </div>
          )}

          {tab === 'colors' && (
            <div>
              <BrandExtractionPanel onAccept={(tokens) => {
                // Proposals land on the funnel brand shape the editor edits.
                // The canonical token columns are written by the normal save.
                updColors({
                  primary: tokens.primary,
                  accent: tokens.accent,
                  background: tokens.bg,
                  cardBg: tokens.surface,
                })
                updTypo({ headlineFont: tokens.font_heading, bodyFont: tokens.font_body })
              }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['primary', 'Primary / CTA'], ['accent', 'Accent'], ['background', 'Background'], ['cardBg', 'Card Background'], ['textOnDark', 'Text on dark'], ['success', 'Success'], ['warning', 'Warning'], ['danger', 'Danger']].map(([k, lbl]) => (
                <div key={k}>
                  <Label>{lbl}</Label>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <input type="color" value={draft.colors[k] || '#000000'} onChange={(e) => updColors({ [k]: e.target.value })} style={{ width: 40, height: 32, padding: 2, border: `1px solid ${T.border}`, borderRadius: 6, backgroundColor: T.bg, cursor: 'pointer' }} />
                    <Input mono value={draft.colors[k] || ''} onChange={(e) => updColors({ [k]: e.target.value })} style={{ flex: 1, fontSize: 11.5 }} />
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}

          {tab === 'typography' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><Label>Headline Font</Label><Select value={draft.typography.headlineFont} onChange={(e) => updTypo({ headlineFont: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></div>
              <div><Label>Body Font</Label><Select value={draft.typography.bodyFont} onChange={(e) => updTypo({ bodyFont: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></div>
              <div><Label>Base Size</Label><Select value={draft.typography.baseSize} onChange={(e) => updTypo({ baseSize: e.target.value })}><option value="sm">Small (14px)</option><option value="md">Medium (16px) - default</option><option value="lg">Large (18px)</option></Select></div>
              <div style={{ padding: 20, backgroundColor: draft.colors.background, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: `"${draft.typography.headlineFont}", sans-serif`, color: draft.colors.textOnDark }}>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.015em' }}>Headline Preview</div>
                <div style={{ fontFamily: `"${draft.typography.bodyFont}", sans-serif`, fontSize: 14, opacity: 0.85 }}>This is body text using the body font.</div>
              </div>
            </div>
          )}

          {tab === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><Label>Call Number</Label><Input mono value={draft.contact.callNumber || ''} onChange={(e) => updContact({ callNumber: e.target.value })} /></div>
              <div><Label>Call CTA Text</Label><Input value={draft.contact.callCtaText || ''} onChange={(e) => updContact({ callCtaText: e.target.value })} /></div>
              <div><Label>Call CTA Style</Label><Select value={draft.contact.callCtaStyle || 'pill'} onChange={(e) => updContact({ callCtaStyle: e.target.value })}><option value="pill">Pill</option><option value="square">Square</option><option value="text">Text only</option></Select></div>
            </div>
          )}

          {tab === 'domains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: T.textMute }}>
                Domains are attached, verified, and provisioned on the Domains page. This list reflects what is currently attached to this brand.
              </div>
              {draft.siteId == null ? (
                <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 8, fontSize: 12.5, color: T.textDim }}>
                  Save this brand first. Once it exists you can attach and verify domains for it on the Domains page.
                </div>
              ) : draft.__domains && draft.__domains.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {draft.__domains.map((d, i) => {
                    const tone = d.status === 'active' || d.status === 'verified' ? T.success : d.status === 'error' ? T.danger : T.warning
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                        <Globe size={14} color={T.textMute} />
                        <span style={{ flex: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: T.text }}>{d.host}</span>
                        {d.primary && <Pill color={T.success}>PRIMARY</Pill>}
                        <Pill color={tone}>{(d.status || 'pending').toUpperCase()}</Pill>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 8, fontSize: 12.5, color: T.textDim }}>
                  No domains attached to this brand yet.
                </div>
              )}
              <a href="/admin/brands/domains" style={{ color: T.info, fontSize: 12.5, textDecoration: 'none' }}>Manage domains →</a>
            </div>
          )}

          {tab === 'legal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><Label>Copyright</Label><Input value={draft.legal.copyright || ''} onChange={(e) => updLegal({ copyright: e.target.value })} /></div>
              <div><Label>TCPA Consent Text</Label><Textarea value={draft.legal.tcpaText || ''} onChange={(e) => updLegal({ tcpaText: e.target.value })} style={{ minHeight: 80 }} /></div>
              <div><Label>Default Disclaimer</Label><Textarea value={draft.legal.defaultDisclaimer || ''} onChange={(e) => updLegal({ defaultDisclaimer: e.target.value })} style={{ minHeight: 60 }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><Label>Privacy URL</Label><Input mono value={draft.legal.privacyUrl || ''} onChange={(e) => updLegal({ privacyUrl: e.target.value })} /></div>
                <div><Label>Terms URL</Label><Input mono value={draft.legal.termsUrl || ''} onChange={(e) => updLegal({ termsUrl: e.target.value })} /></div>
              </div>
            </div>
          )}

          {tab === 'urls' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12.5, color: T.textMute, lineHeight: 1.55 }}>
                Where this brand&apos;s funnels send people. Quiz nodes point at a destination by name, not by URL,
                so the same quiz can run under several brands and each one sends its own traffic to its own pages.
                A deployment can override any of these for one placement. Leave a field blank to use the site&apos;s
                own page at that path.
              </div>
              {DESTINATION_KEYS.map((key) => (
                <div key={key}>
                  <Label>{DESTINATION_LABELS[key]}</Label>
                  <Input
                    mono
                    value={(draft.urls || {})[key] || ''}
                    onChange={(e) => updUrls({ [key]: e.target.value })}
                    placeholder={DEFAULT_PATHS[key]}
                  />
                  <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 4 }}>
                    {DESTINATION_HINTS[key]}
                    {!(draft.urls || {})[key] && ` Currently using ${DEFAULT_PATHS[key]}.`}
                  </div>
                  {(draft.urls || {})[key] && !isSafeDestinationUrl((draft.urls || {})[key]) && (
                    <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>
                      Not a usable link. Use a full https:// address or a path starting with /.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'chrome' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ fontSize: 12.5, color: T.textMute, lineHeight: 1.55 }}>
                The header and footer every standalone funnel page under this brand wears. They are set once here, not per deployment,
                so two pages running the same quiz can never show different logos or different copyright lines. Embedded and inline
                placements draw no chrome at all.
              </div>

              <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10 }}>Header</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <button onClick={() => updHeader({ logoEnabled: !chrome.header.logoEnabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: chrome.header.logoEnabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${chrome.header.logoEnabled ? T.success : T.border}`, color: chrome.header.logoEnabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{chrome.header.logoEnabled ? 'ON LOGO' : 'OFF LOGO'}</button>
                  <button onClick={() => updHeaderCta({ enabled: !chrome.header.ctaButton.enabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: chrome.header.ctaButton.enabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${chrome.header.ctaButton.enabled ? T.success : T.border}`, color: chrome.header.ctaButton.enabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{chrome.header.ctaButton.enabled ? 'ON CTA BUTTON' : 'OFF CTA BUTTON'}</button>
                </div>
                <div style={{ fontSize: 10.5, color: T.textLow, marginBottom: 12, lineHeight: 1.45 }}>
                  With the logo off, the brand&apos;s display name is shown instead. A brand with no logo URL always shows the name.
                </div>
                {chrome.header.ctaButton.enabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8 }}>
                    <div>
                      <Label>CTA Text</Label>
                      <Input value={(draft.defaultHeader || {}).ctaButton?.text ?? chrome.header.ctaButton.text} onChange={(e) => updHeaderCta({ text: e.target.value })} placeholder={chrome.header.ctaButton.text} />
                    </div>
                    <div>
                      <Label>CTA URL</Label>
                      <Input mono value={(draft.defaultHeader || {}).ctaButton?.url ?? chrome.header.ctaButton.url} onChange={(e) => updHeaderCta({ url: e.target.value })} placeholder={chrome.header.ctaButton.url || 'tel:+1...'} />
                      {/* A tel: link is a copy of the Call Number, so the renderer
                          re-derives it rather than trusting a stored copy. Saying
                          so here is what stops someone editing this field and
                          wondering why the live page dials something else. */}
                      <div style={{ fontSize: 10.5, color: chrome.header.ctaButton.url ? T.textLow : T.warning, marginTop: 4, lineHeight: 1.45 }}>
                        {chrome.header.ctaButton.url
                          ? `Links to ${chrome.header.ctaButton.url}. Phone links follow the Call Number on the Contact tab; enter a full https:// address to send this button somewhere else.`
                          : 'This brand has no Call Number, so the button has nowhere to go and will not render. Set one on the Contact tab, or enter a full https:// address here.'}
                      </div>
                    </div>
                    <div><Label>Font Size (px)</Label><Input type="number" value={chrome.header.ctaButton.fontSize} onChange={(e) => updHeaderCta({ fontSize: parseInt(e.target.value) || 11 })} /></div>
                  </div>
                )}
              </div>

              <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10 }}>Footer</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <button onClick={() => updFooter({ logoEnabled: !chrome.footer.logoEnabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: chrome.footer.logoEnabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${chrome.footer.logoEnabled ? T.success : T.border}`, color: chrome.footer.logoEnabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{chrome.footer.logoEnabled ? 'ON LOGO' : 'OFF LOGO'}</button>
                  <button onClick={() => updFooter({ showCopyright: !chrome.footer.showCopyright })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: chrome.footer.showCopyright ? `${T.success}22` : T.bgElev2, border: `1px solid ${chrome.footer.showCopyright ? T.success : T.border}`, color: chrome.footer.showCopyright ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{chrome.footer.showCopyright ? 'ON COPYRIGHT' : 'OFF COPYRIGHT'}</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><Label>Logo Size (px)</Label><Input type="number" value={chrome.footer.logoSize} onChange={(e) => updFooter({ logoSize: parseInt(e.target.value) || 32 })} /></div>
                  <div><Label>Font Size (px)</Label><Input type="number" value={chrome.footer.fontSize} onChange={(e) => updFooter({ fontSize: parseInt(e.target.value) || 12 })} /></div>
                </div>
                {/* Turning the copyright off is a compliance decision on an
                    attorney-advertising page, so it is stated rather than left
                    to be discovered on a live funnel. */}
                <div style={{ fontSize: 10.5, color: chrome.footer.showCopyright ? T.textLow : T.warning, marginTop: 10, lineHeight: 1.45 }}>
                  {chrome.footer.showCopyright
                    ? `Shows the Legal tab's copyright line: ${draft.legal?.copyright || 'not set yet, so nothing will render'}.`
                    : 'The copyright line is hidden on every standalone page under this brand.'}
                </div>
              </div>
            </div>
          )}

          {tab === 'sections' && (
            <div>
              <div style={{ fontSize: 12.5, color: T.textMute, marginBottom: 14 }}>These body sections render below the quiz card on standalone pages by default. Deployments can override this.</div>
              {sections.map((s, i) => <BodySectionEditor key={s.id} section={s} onUpdate={updSection} onDelete={() => delSection(s.id)} onMoveUp={() => moveSection(i, -1)} onMoveDown={() => moveSection(i, 1)} />)}
              <Btn variant="secondary" size="md" icon={Plus} onClick={() => setPickerOpen(true)} style={{ marginTop: 8 }}>Add Section</Btn>
            </div>
          )}
        </div>
      </div>
      {pickerOpen && <AddBodySectionPicker onPick={addSection} onClose={() => setPickerOpen(false)} />}
      <ConfirmDialog
        open={leaveReq}
        title={isDraft ? 'Discard new brand?' : 'Leave brand editor?'}
        message={isDraft ? 'This brand has not been saved and will be discarded.' : 'You have unsaved changes.'}
        confirmText={isDraft ? 'Discard' : 'Save & Leave'}
        cancelText="Stay"
        tertiaryText={isDraft ? null : 'Discard'}
        onConfirm={() => { if (isDraft) { setLeaveReq(false); onBack() } else { handleSave(); setLeaveReq(false); onBack() } }}
        onCancel={() => setLeaveReq(false)}
        onTertiary={() => { setLeaveReq(false); onBack() }}
      />
    </>
  )
}

// ============================================================================
// BRAND IDENTITIES VIEW (card grid)
// ============================================================================
const BrandIdentitiesView = ({ brands, domains, onCreate, onUpdate, onDelete, onOpenEditor, onAICreate }) => {
  const [createPickerOpen, setCreatePickerOpen] = useState(false)

  const newBlankBrand = () => {
    const b = { ...buildBlankBrand(), id: genId('brand'), name: 'New Brand', displayName: 'New Brand', siteId: null }
    onCreate(b)
    onOpenEditor(b.id, true)
  }

  const pickMode = (mode) => {
    setCreatePickerOpen(false)
    if (mode === 'blank') newBlankBrand()
    else onAICreate?.(mode)
  }

  return (
    <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <PageHeader
        title="Brand Identities"
        subtitle="Each brand owns its logo, colors, typography, phone, copyright and TCPA. The same identity drives quizzes, landing pages, and advertorials. Domains are managed separately."
        primaryAction={<Btn variant="primary" size="md" icon={Plus} onClick={() => setCreatePickerOpen(true)}>New Brand</Btn>}
      />
      {brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No brand identities yet"
          subtitle="Add your first brand to start deploying landing pages and quizzes."
          action={<Btn variant="primary" size="md" icon={Plus} onClick={newBlankBrand}>New Brand</Btn>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {brands.map((brand) => {
            const brandDomains = domains.filter((d) => d.brandId === brand.id)
            const primary = brand.colors?.primary || T.textMute
            const background = brand.colors?.background || T.bgElev2
            const accent = brand.colors?.accent || T.textMute
            return (
              <div key={brand.id} style={{ padding: 16, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg, ${primary}, ${background})`, color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {brand.faviconUrl ? <img loading="lazy" decoding="async" src={brand.faviconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : brandShortName(brand)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.displayName}</div>
                    <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>{brand.contact?.callNumber || brand.primaryDomain || ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 22, borderRadius: 4, backgroundColor: primary }} title={primary} />
                  <div style={{ flex: 1, height: 22, borderRadius: 4, backgroundColor: background }} title={background} />
                  <div style={{ flex: 1, height: 22, borderRadius: 4, backgroundColor: accent }} title={accent} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Pill color={brandDomains.length > 0 ? T.success : T.textLow}>{brandDomains.length} domains</Pill>
                  {brand.logoUrl && <Pill color={T.info}>logo</Pill>}
                  {brand.faviconUrl && <Pill color={T.purple}>favicon</Pill>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpenEditor(brand.id, false)} style={{ flex: 1, justifyContent: 'center' }} aria-label="Edit brand">Edit</Btn>
                  <IconBtn icon={Trash2} onClick={() => onDelete(brand.id)} style={{ color: T.danger }} aria-label="Delete brand" />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {createPickerOpen && <CreateBrandModal onPick={pickMode} onClose={() => setCreatePickerOpen(false)} />}
    </div>
  )
}

// ============================================================================
// ORCHESTRATOR - mirrors the artifact App's brand_identities routing, but
// persists to the Site collection via server actions instead of localStorage.
// ============================================================================
export function BrandIdentitiesApp({ initialBrands }) {
  const router = useRouter()
  const [brands, setBrands] = useState(initialBrands)
  const [editingBrandId, setEditingBrandId] = useState(null)
  const [editingBrandIsDraft, setEditingBrandIsDraft] = useState(false)
  const [brandAIWizardMode, setBrandAIWizardMode] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [toast, setToast] = useState(null)
  const [, startTransition] = useTransition()

  useEffect(() => { setBrands(initialBrands) }, [initialBrands])

  // Domains for the card counts: synthesize one entry per attached domain so the
  // ported view's `domains.filter(d => d.brandId === brand.id)` keeps working.
  const domains = brands.flatMap((b) => Array.from({ length: b.__domainCount || 0 }, () => ({ brandId: b.id })))

  const createBrand = (b) => setBrands((arr) => [...arr, b])
  const updateBrand = (b) => setBrands((arr) => arr.map((x) => (x.id === b.id ? b : x)))

  const saveBrand = (b) => {
    startTransition(async () => {
      if (b.siteId == null) {
        const res = await settleAction(createBrandSite({ brand: b }))
        if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
        const newId = `site_${res.siteId}`
        setBrands((arr) => arr.map((x) => (x.id === b.id ? { ...b, id: newId, siteId: res.siteId, siteSlug: res.slug, primaryDomain: res.previewHost } : x)))
        setEditingBrandId((cur) => (cur === b.id ? newId : cur))
        setEditingBrandIsDraft(false)
        // Tell the author what we created so they don't have to hunt
        // through the Quiz / LP builders to see the new deployments.
        const sf = res.starterFunnels
        if (sf && sf.warnings.length === 0 && sf.quizPath && sf.lpPath) {
          setToast({
            message: `Brand created. Quiz at ${sf.quizPath}, landing page at ${sf.lpPath}.`,
            type: 'success',
          })
        } else if (sf && sf.warnings.length > 0) {
          setToast({
            message: `Brand created, but starter funnels had issues: ${sf.warnings.join('; ')}`,
            type: 'error',
          })
        } else {
          setToast({ message: 'Brand created.', type: 'success' })
        }
      } else {
        const res = await settleAction(saveBrandIdentity({ siteId: b.siteId, brand: b }))
        if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
        setToast({ message: 'Saved.', type: 'success' })
      }
      router.refresh()
    })
  }

  const deleteBrand = (id) => {
    const b = brands.find((x) => x.id === id)
    setConfirm({
      title: 'Delete brand?',
      message: 'This permanently deletes the brand site. Domains and pages attached to it are affected. This cannot be undone.',
      onConfirm: () => {
        if (b?.siteId == null) {
          setBrands((arr) => arr.filter((x) => x.id !== id))
          setConfirm(null)
          return
        }
        startTransition(async () => {
          const res = await settleAction(deleteBrandSite({ siteId: b.siteId }))
          if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); setConfirm(null); return }
          setBrands((arr) => arr.filter((x) => x.id !== id))
          setConfirm(null)
          router.refresh()
        })
      },
    })
  }

  const editingBrand = brands.find((b) => b.id === editingBrandId)

  return (
    <div style={{ backgroundColor: T.bg, color: T.text, fontFamily: '"Inter", system-ui, sans-serif', minHeight: '100vh' }}>
      {/* Load the builder font families so previews reflect the chosen typography. */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&display=swap');`}</style>
      {editingBrand ? (
        <BrandEditor
          brand={editingBrand}
          isDraft={editingBrandIsDraft}
          onSave={(b) => { updateBrand(b); saveBrand(b) }}
          onBack={() => { setEditingBrandId(null); setEditingBrandIsDraft(false); router.refresh() }}
        />
      ) : (
        <BrandIdentitiesView
          brands={brands}
          domains={domains}
          onCreate={createBrand}
          onUpdate={updateBrand}
          onDelete={deleteBrand}
          onOpenEditor={(id, isDraft) => { setEditingBrandId(id); setEditingBrandIsDraft(!!isDraft) }}
          onAICreate={(mode) => setBrandAIWizardMode(mode)}
        />
      )}
      {brandAIWizardMode && (
        <AIBrandWizard
          mode={brandAIWizardMode}
          onClose={() => setBrandAIWizardMode(null)}
          onComplete={(brand) => { createBrand({ ...brand, siteId: null }); setBrandAIWizardMode(null); setEditingBrandId(brand.id); setEditingBrandIsDraft(true) }}
        />
      )}
      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} confirmText="Delete" onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
