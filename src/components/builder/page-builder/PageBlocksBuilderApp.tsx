// @ts-nocheck
/* eslint-disable */
'use client'

// Pages builder, body_blocks edition. Same visual shell as Landing Pages
// (TopBar + 3-pane), but the data model IS body_blocks (the same JSON the
// public BlockRenderer reads), and the center pane is an iframe of the live
// page URL — so what you see in the backend is exactly what visitors see.
//
// Per type, the section editor on the right surfaces only that block type's
// fields (defined in src/collections/Pages.ts). Save writes body_blocks back
// to the row; the iframe is refreshed via a cache-buster querystring so the
// preview reflects the save without a manual reload.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, MoveUp, MoveDown, Trash2, ChevronLeft, ChevronRight, Eye, EyeOff, Save, X,
  Layers, Rocket, Image as ImageIcon, Megaphone, List, FileText, Code2, Quote,
  HelpCircle, Star, Award, Trophy, ListChecks, ListOrdered, Grid3x3, Shield,
  MousePointerClick, RotateCw, Sparkles, Check, Loader2, Copy, GripVertical,
  Smartphone, Tablet, Monitor, Video as VideoIcon, Images, Building2, Minus,
  AlertTriangle, XCircle,
} from 'lucide-react'
import {
  T, Btn, Input, Textarea, Select, Label, Pill, IconBtn, ConfirmDialog, Toast,
  TopBar,
} from '../ui'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { ImagePickerField } from './ImagePicker'
import { LinkPickerField } from './LinkPicker'
import { GoogleSerpPreview, OgPreviewCards } from './PageSettingsPreviews'
import { savePageBodyBlocks } from '@/app/(app)/admin/sites/[slug]/pages/[id]/blocks-actions'
import { rewriteSection } from '@/app/(app)/admin/sites/[slug]/pages/[id]/ai-rewrite-action'
import { saveAsSiteDefault } from '@/app/(app)/admin/sites/[slug]/pages/[id]/site-defaults-action'
import { detectStructuredFromHtml } from '@/app/(app)/admin/sites/[slug]/pages/[id]/convert-action'
import { lintBlocks, judgeContrast } from '@/lib/builder/page-lint'
import { settleAction, failureMessage } from '../server-action'

const genId = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// <input type="datetime-local"> expects "YYYY-MM-DDTHH:MM" with no timezone
// and renders/parses against the local timezone. We store publish_at as a
// UTC ISO string on the row, so convert in both directions when binding.
const toLocalInputValue = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ============================================================================
// BLOCK TYPE REGISTRY — mirrors Pages.ts blocks config so the Add panel and
// list icons stay in sync. Order here is the recommended insertion order.
// ============================================================================
const BLOCK_TYPES = [
  { id: 'nav_header',    name: 'Navigation Header', icon: Layers,             desc: 'Top nav with links + CTA' },
  { id: 'hero',          name: 'Hero',              icon: Rocket,             desc: 'Headline, sub, CTAs' },
  { id: 'trust_strip',   name: 'Trust Strip',       icon: Award,              desc: 'Inline trust badges' },
  { id: 'services_grid', name: 'Services Grid',     icon: Grid3x3,            desc: 'Practice areas / services' },
  { id: 'how_it_works',  name: 'How It Works',      icon: ListChecks,         desc: 'Step-by-step process' },
  { id: 'cards',         name: 'Cards',             icon: List,               desc: 'Generic 2-up / 3-up cards' },
  { id: 'recent_wins',   name: 'Recent Wins',       icon: Trophy,             desc: 'Past case results' },
  { id: 'testimonials',  name: 'Testimonials',      icon: Quote,              desc: 'Client quotes' },
  { id: 'stats',         name: 'Stats',             icon: ListOrdered,        desc: 'Numbers and labels' },
  { id: 'bullet_list',   name: 'Bullet List',       icon: List,               desc: 'Bulleted points' },
  { id: 'prose',         name: 'Prose',             icon: FileText,           desc: 'Markdown copy' },
  { id: 'image',         name: 'Image',             icon: ImageIcon,          desc: 'Single image + alt' },
  { id: 'cta',           name: 'CTA',               icon: Megaphone,          desc: 'Mid-page CTA' },
  { id: 'final_cta',     name: 'Final CTA',         icon: MousePointerClick,  desc: 'Closing CTA' },
  { id: 'faq',           name: 'FAQ',               icon: HelpCircle,         desc: 'Question / answer accordion' },
  { id: 'disclosure',    name: 'Disclosure',        icon: Shield,             desc: 'Legal disclaimer copy' },
  { id: 'lead_form',     name: 'Lead Form',         icon: Star,               desc: 'Inline capture form' },
  { id: 'custom_html',   name: 'Custom HTML',       icon: Code2,              desc: 'Raw HTML embed' },
  { id: 'embed',         name: 'Embed',             icon: Code2,              desc: 'Iframe / script embed' },
  { id: 'site_footer',   name: 'Site Footer',       icon: Layers,             desc: 'Footer with link columns' },
  { id: 'video',         name: 'Video',             icon: VideoIcon,          desc: 'YouTube / Vimeo / file embed' },
  { id: 'gallery',       name: 'Gallery',           icon: Images,             desc: 'Image grid (2 / 3 / 4 cols)' },
  { id: 'logo_cloud',    name: 'Logo Cloud',        icon: Building2,          desc: '"As seen on" client/partner logos' },
  { id: 'spacer',        name: 'Spacer / Divider',  icon: Minus,              desc: 'Vertical gap with optional hr' },
]
const BLOCK_META = Object.fromEntries(BLOCK_TYPES.map((b) => [b.id, b]))

// Per-type default copy. Keeps additions non-empty so the iframe shows
// something useful immediately.
const SEED_FOR: Record<string, () => Record<string, unknown>> = {
  nav_header: () => ({
    blockType: 'nav_header',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Services', href: '#services' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Contact', href: '#contact' },
    ],
    cta_label: 'Start',
    cta_href: '#hero',
    show_phone: true,
  }),
  hero: () => ({
    blockType: 'hero',
    // Neutral placeholders. Previously these seeded every new hero with
    // Check My Claim copy ('Start Your Free Claim Check' etc.) which then
    // leaked onto unrelated Sites whose authors didn't realise the defaults
    // weren't generic.
    eyebrow: 'Free case review',
    heading: 'New hero headline',
    sub: 'Sub copy explaining what this page offers.',
    primary_cta_label: 'Get started',
    primary_cta_href: '#',
    secondary_cta_label: '',
    secondary_cta_href: '',
    image_url: '',
  }),
  trust_strip: () => ({
    blockType: 'trust_strip',
    items: [
      { value: '100% Free', label: 'No fees' },
      { value: 'No Win No Fee', label: 'Pay nothing unless we recover' },
    ],
  }),
  services_grid: () => ({
    blockType: 'services_grid',
    eyebrow: 'Specialties',
    heading: 'What we do',
    sub: '',
    items: [
      { title: 'Auto Accidents', description: '', icon: 'Car' },
      { title: 'Commercial Accidents', description: '', icon: 'Truck' },
    ],
  }),
  how_it_works: () => ({
    blockType: 'how_it_works',
    eyebrow: 'Process',
    heading: 'How it works',
    sub: '',
    steps: [
      { title: 'Step 1', description: '' },
      { title: 'Step 2', description: '' },
      { title: 'Step 3', description: '' },
    ],
  }),
  cards: () => ({
    blockType: 'cards',
    heading: 'Two cards',
    items: [
      { title: 'Card 1', body: '', icon: '✓' },
      { title: 'Card 2', body: '', icon: '✓' },
    ],
  }),
  recent_wins: () => ({
    blockType: 'recent_wins',
    eyebrow: 'Recent results',
    heading: 'Past wins',
    sub: '',
    items: [{ amount: '$0', case_type: 'Case type', description: '' }],
    disclaimer: '',
  }),
  testimonials: () => ({
    blockType: 'testimonials',
    heading: 'What clients say',
    items: [{ quote: 'Great service.', attribution: 'Client', avatar_url: '' }],
  }),
  stats: () => ({
    blockType: 'stats',
    heading: 'By the numbers',
    items: [
      { value: '$0', label: 'Recovered' },
      { value: '0', label: 'Clients served' },
    ],
  }),
  bullet_list: () => ({
    blockType: 'bullet_list',
    heading: 'Highlights',
    items: [{ item: 'Point one' }, { item: 'Point two' }],
  }),
  prose: () => ({ blockType: 'prose', markdown: 'Write your copy here.' }),
  image: () => ({ blockType: 'image', url: '', alt: '', caption: '' }),
  cta: () => ({
    blockType: 'cta',
    heading: 'Ready to get started?',
    sub: '',
    label: 'Start',
    href: '#',
  }),
  final_cta: () => ({
    blockType: 'final_cta',
    eyebrow: '',
    heading: 'Talk to us today',
    sub: '',
    primary_cta_label: 'Start',
    primary_cta_href: '#',
    show_phone: true,
  }),
  faq: () => ({
    blockType: 'faq',
    heading: 'Frequently asked',
    items: [{ question: 'A question?', answer: 'An answer.' }],
  }),
  disclosure: () => ({ blockType: 'disclosure', markdown: 'Legal disclaimer copy.' }),
  lead_form: () => ({
    blockType: 'lead_form',
    eyebrow: '',
    heading: 'Start your check',
    sub: '',
    submit_label: 'See if I qualify',
    consent_md: '',
    funnel_type: 'contact-form',
    funnel_id: '',
    success_slug: '/submitted',
  }),
  custom_html: () => ({ blockType: 'custom_html', html: '<div></div>' }),
  embed: () => ({ blockType: 'embed', html: '<iframe></iframe>', note: '' }),
  site_footer: () => ({
    blockType: 'site_footer',
    columns: [{ heading: 'Company', links: [{ label: 'About', href: '/about' }] }],
    legal_md: '',
  }),
  video: () => ({
    blockType: 'video',
    heading: '',
    provider: 'youtube',
    video_id: '',
    aspect_ratio: '16:9',
    caption: '',
  }),
  gallery: () => ({
    blockType: 'gallery',
    heading: '',
    columns: '3',
    images: [
      { image_url: '', alt: '', caption: '' },
      { image_url: '', alt: '', caption: '' },
      { image_url: '', alt: '', caption: '' },
    ],
  }),
  logo_cloud: () => ({
    blockType: 'logo_cloud',
    heading: 'As seen on',
    grayscale: true,
    logos: [
      { image_url: '', alt: '', href: '' },
      { image_url: '', alt: '', href: '' },
      { image_url: '', alt: '', href: '' },
    ],
  }),
  spacer: () => ({
    blockType: 'spacer',
    size: 'md',
    show_divider: false,
  }),
}

// ============================================================================
// ARRAY EDITOR — generic repeated-item helper, used by every block editor
// that surfaces an array (links, items, steps, columns, etc.)
// ============================================================================
const ArrayEditor = ({ items, blank, render, onChange, addLabel = 'Add item' }) => {
  const update = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange(next)
  }
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))
  const move = (idx, dir) => {
    const next = [...items]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, idx) => (
        <div key={idx} style={{ padding: 10, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <Pill color={T.textMute}>{idx + 1}</Pill>
            <div style={{ flex: 1 }} />
            <IconBtn icon={MoveUp} onClick={() => move(idx, -1)} />
            <IconBtn icon={MoveDown} onClick={() => move(idx, 1)} />
            <IconBtn icon={Trash2} onClick={() => remove(idx)} style={{ color: T.danger }} />
          </div>
          {render(it, (patch) => update(idx, patch))}
        </div>
      ))}
      <Btn variant="secondary" size="sm" icon={Plus} onClick={() => onChange([...items, { ...blank }])}>
        {addLabel}
      </Btn>
    </div>
  )
}

// ============================================================================
// AI REWRITE PANEL — inline "Ask AI" affordance at the top of every section
// editor. The user types an instruction ("make this more urgent / shorten by
// 30% / add a stat about $50M+ recovered"), Claude rewrites the block within
// its blockType's field schema, and the user accepts or rejects the result.
// On accept, the parent block state replaces the current block with the
// rewritten one (id is preserved by the caller).
// ============================================================================
const QUICK_PROMPTS = [
  'Make it more urgent and direct.',
  'Shorten by ~30% without losing meaning.',
  'Add an empathetic, human tone.',
  'Make the CTA copy more action-oriented.',
]

const AIRewritePanel = ({ block, onAccept }) => {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    // When the user clicks to another section, clear panel state so a
    // pending preview doesn't get applied to the wrong block.
    setOpen(false)
    setInstruction('')
    setBusy(false)
    setError(null)
    setResult(null)
  }, [block?.id])

  const run = async (override) => {
    const text = (override ?? instruction).trim()
    if (!text) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await settleAction(rewriteSection({ block, instruction: text }))
      if (!res.ok) {
        setError(failureMessage(res))
      } else {
        setResult(res.block)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 12 }}>
        <Btn variant="secondary" size="sm" icon={Sparkles} onClick={() => setOpen(true)}>
          Ask AI to rewrite this section
        </Btn>
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: 14,
        padding: 12,
        background: T.bgElev,
        border: `1px solid ${T.primary}40`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Sparkles size={14} color={T.primary} />
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>AI rewrite</span>
        <div style={{ flex: 1 }} />
        <IconBtn icon={X} onClick={() => setOpen(false)} />
      </div>

      {!result ? (
        <>
          <Textarea
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What should change? e.g. shorten by 30%, make more urgent, add a stat"
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                disabled={busy}
                onClick={() => {
                  setInstruction(p)
                  run(p)
                }}
                style={{
                  padding: '5px 9px',
                  borderRadius: 999,
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  color: T.textMute,
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn
              variant="primary"
              size="sm"
              icon={busy ? Loader2 : Sparkles}
              onClick={() => run()}
              disabled={busy || !instruction.trim()}
            >
              {busy ? 'Rewriting…' : 'Rewrite'}
            </Btn>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: T.textMute, marginBottom: 8 }}>
            Preview below — accept to replace the section, or reject to keep editing manually.
          </div>
          <div
            style={{
              padding: 10,
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              maxHeight: 220,
              overflow: 'auto',
              color: T.text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(result, null, 2)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Btn
              variant="primary"
              size="sm"
              icon={Check}
              onClick={() => {
                onAccept(result)
                setResult(null)
                setOpen(false)
                setInstruction('')
              }}
            >
              Accept
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setResult(null)}>
              Try again
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setResult(null); setOpen(false) }}>
              Reject
            </Btn>
          </div>
        </>
      )}

      {error ? (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: `${T.danger}15`,
            border: `1px solid ${T.danger}40`,
            borderRadius: 6,
            color: T.danger,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// SECTION CONTEXT MENU — right-click on any section row to get a quick menu
// (Duplicate / Move to top / Move to bottom / Hide-Show / Delete). Position
// follows the cursor; clicking outside or pressing Escape closes it.
// ============================================================================
const SectionContextMenu = ({ x, y, items, onClose }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const onClick = () => onClose()
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])
  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 300,
        minWidth: 200,
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        padding: 4,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => {
        if (it.separator) {
          return (
            <div
              key={`sep-${i}`}
              style={{ height: 1, background: T.border, margin: '4px 6px' }}
            />
          )
        }
        const Icon = it.icon
        return (
          <button
            key={it.id || i}
            onClick={() => {
              it.onClick()
              onClose()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: it.danger ? T.danger : T.text,
              padding: '7px 10px',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: 5,
              fontSize: 12.5,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = T.bgElev)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            {Icon ? <Icon size={13} /> : <span style={{ width: 13 }} />}
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.shortcut ? (
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: T.textLow }}>
                {it.shortcut}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// VIEWPORT TOGGLE — three buttons in the top bar that constrain the canvas
// max-width to a rough desktop / tablet / mobile width. This is an
// *approximate* preview — the underlying CSS @media queries still fire based
// on the real browser viewport — but it lets the user inspect layout reflow
// without manually resizing the window. Per-block hide_mobile / hide_desktop
// flags shipped alongside this control still take effect at the public site's
// real viewport breakpoints.
// ============================================================================
const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: '100%' },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 380 },
]

const ViewportToggle = ({ viewport, onChange }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: 2,
      background: T.bgElev,
      border: `1px solid ${T.border}`,
      borderRadius: 7,
    }}
  >
    {VIEWPORTS.map((v) => {
      const Icon = v.icon
      const active = viewport === v.id
      return (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          title={v.label}
          aria-label={v.label}
          aria-pressed={active}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 24,
            background: active ? T.primary : 'transparent',
            color: active ? '#fff' : T.textMute,
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            transition: 'background 0.12s ease',
          }}
        >
          <Icon size={13} />
        </button>
      )
    })}
  </div>
)

// ============================================================================
// PAGE HEALTH CARD — accessibility + heading-hierarchy lint summary plus a
// brand-color contrast check. Rendered in the page-settings panel above the
// JSON-LD editor. Issues are listed with severity icon; clicking jumps to
// the offending block in the section list. No state; pure derive-from-lint.
// ============================================================================
const PageHealthCard = ({ issues, errors, warnings, blocks, onJumpToBlock, siteBrand }) => {
  const blockTitleFor = (id) => {
    if (!id) return ''
    const b = blocks.find((x) => x.id === id)
    if (!b) return ''
    return (b.heading || b.title || b.eyebrow || b.blockType || '').toString().slice(0, 40)
  }
  const contrasts = (() => {
    if (!siteBrand) return []
    const surface = siteBrand.surface || '#F7F5F0'
    const ink = siteBrand.ink || '#0E1116'
    const primary = siteBrand.primary || '#0B1F3A'
    return [
      { name: 'Ink on surface', fg: ink, bg: surface, ...judgeContrast(ink, surface) },
      { name: 'Primary on surface', fg: primary, bg: surface, ...judgeContrast(primary, surface) },
      { name: 'White on primary', fg: '#ffffff', bg: primary, ...judgeContrast('#ffffff', primary) },
    ]
  })()
  return (
    <div>
      <Label>Page health</Label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: T.bgElev,
          border: `1px solid ${T.border}`,
          borderRadius: 7,
        }}
      >
        {errors === 0 && warnings === 0 ? (
          <>
            <Check size={14} color={T.success} />
            <span style={{ fontSize: 12, color: T.text }}>No accessibility or hierarchy issues.</span>
          </>
        ) : (
          <>
            {errors > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.danger, fontSize: 12 }}>
                <XCircle size={13} />
                {errors} error{errors === 1 ? '' : 's'}
              </span>
            ) : null}
            {warnings > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.warning, fontSize: 12 }}>
                <AlertTriangle size={13} />
                {warnings} warning{warnings === 1 ? '' : 's'}
              </span>
            ) : null}
          </>
        )}
      </div>

      {issues.length > 0 ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {issues.map((it, i) => {
            const Icon = it.severity === 'error' ? XCircle : AlertTriangle
            const color = it.severity === 'error' ? T.danger : T.warning
            const where = it.blockId ? blockTitleFor(it.blockId) || it.blockId : ''
            return (
              <button
                key={i}
                onClick={() => it.blockId && onJumpToBlock(it.blockId)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: T.text,
                  cursor: it.blockId ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = T.bgElev)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                <Icon size={12} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4 }}>{it.message}</div>
                  {where ? (
                    <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 3, fontFamily: '"JetBrains Mono", monospace' }}>
                      {where}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: `${T.textMute}30`,
                    color: T.textMute,
                    letterSpacing: '0.05em',
                  }}
                >
                  {it.category.toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <Label style={{ marginTop: 16 }}>Brand contrast (WCAG)</Label>
      {contrasts.length === 0 ? (
        <div style={{ fontSize: 11, color: T.textLow }}>
          Configure brand colors on the Site to see contrast pass/fail.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {contrasts.map((c) => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: T.bgElev,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: c.bg,
                  border: '1px solid rgba(0,0,0,0.15)',
                  position: 'relative',
                }}
                aria-hidden
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 2,
                    background: c.fg,
                    borderRadius: 2,
                  }}
                />
              </span>
              <span style={{ fontSize: 12, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: T.textMute }}>
                {c.ratio == null ? '–' : `${c.ratio.toFixed(2)}:1`}
              </span>
              <span
                title="WCAG AA — 4.5:1 normal text, 3:1 large only"
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background:
                    c.AA === 'pass' ? `${T.success}25` : c.AA === 'large-only' ? `${T.warning}25` : `${T.danger}25`,
                  color: c.AA === 'pass' ? T.success : c.AA === 'large-only' ? T.warning : T.danger,
                }}
              >
                {c.AA === 'pass' ? 'AA' : c.AA === 'large-only' ? 'AA LRG' : 'AA ✗'}
              </span>
              <span
                title="WCAG AAA — 7:1 normal text, 4.5:1 large only"
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background:
                    c.AAA === 'pass' ? `${T.success}25` : c.AAA === 'large-only' ? `${T.warning}25` : `${T.danger}25`,
                  color: c.AAA === 'pass' ? T.success : c.AAA === 'large-only' ? T.warning : T.danger,
                }}
              >
                {c.AAA === 'pass' ? 'AAA' : c.AAA === 'large-only' ? 'AAA LRG' : 'AAA ✗'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SAVE AS SITE DEFAULT — small row shown above the field editor when the
// selected block is a nav_header or site_footer. Clicking persists the
// current block (without its id) onto Sites.site_nav or Sites.site_footer
// via the saveAsSiteDefault server action, so every page on the Site that
// doesn't have its own nav/footer will auto-render this one.
// ============================================================================
const SaveAsSiteDefaultRow = ({ block, siteSlug, siteId, onToast }) => {
  const [busy, setBusy] = useState(false)
  const kind = block.blockType === 'nav_header' ? 'nav' : 'footer'
  const label =
    kind === 'nav'
      ? 'Save as Site default nav (applies to every page)'
      : 'Save as Site default footer (applies to every page)'
  const run = async () => {
    setBusy(true)
    const res = await settleAction(saveAsSiteDefault({ siteSlug, siteId, kind, block }))
    setBusy(false)
    if (res.ok) {
      onToast({
        message:
          kind === 'nav'
            ? 'Saved as Site default nav. Every page that doesn’t have its own nav_header will now show this one.'
            : 'Saved as Site default footer. Every page that doesn’t have its own site_footer will now show this one.',
        type: 'success',
      })
    } else {
      onToast({ message: failureMessage(res), type: 'error' })
    }
  }
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 10,
        background: T.bgElev,
        border: `1px solid ${T.primary}40`,
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          Site default
        </div>
        <div style={{ fontSize: 12, color: T.text }}>{label}</div>
      </div>
      <Btn variant="primary" size="sm" icon={busy ? Loader2 : Save} onClick={run} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Btn>
    </div>
  )
}

// ============================================================================
// CUSTOM HTML QUICK EDIT — parses the block's HTML with the browser's
// DOMParser, surfaces the editable spots (headings / paragraphs / images /
// links) as labelled fields, and writes edits back into the same HTML by
// querying the same tag at the same index. The raw HTML textarea below
// still works for full-control editing — the two are kept in sync via the
// shared block.html state. No new persisted fields and no server calls.
// ============================================================================
const QE_TEXT_SPECS = [
  { tag: 'h1', label: 'Heading (H1)' },
  { tag: 'h2', label: 'Subheading (H2)' },
  { tag: 'h3', label: 'Section title (H3)' },
  { tag: 'p', label: 'Paragraph', minLen: 10 },
] as const

const summary = (s: string, n = 36) => {
  const c = s.replace(/\s+/g, ' ').trim()
  return c.length > n ? c.slice(0, n) + '…' : c
}

const escapeHtmlText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type QuickField =
  | { kind: 'text'; tag: string; index: number; label: string; value: string }
  | { kind: 'image'; index: number; label: string; src: string; alt: string }
  | { kind: 'link'; index: number; label: string; href: string; text: string }

const parseQuickFields = (html: string): QuickField[] => {
  if (!html || typeof window === 'undefined') return []
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const fields: QuickField[] = []
  for (const spec of QE_TEXT_SPECS) {
    const nodes = Array.from(doc.querySelectorAll(spec.tag))
    nodes.forEach((el, idx) => {
      const value = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!value) return
      const minLen = (spec as { minLen?: number }).minLen ?? 0
      if (value.length < minLen) return
      fields.push({ kind: 'text', tag: spec.tag, index: idx, label: spec.label, value })
    })
  }
  Array.from(doc.querySelectorAll('img')).forEach((el, idx) => {
    const src = el.getAttribute('src') ?? ''
    if (!src) return
    fields.push({ kind: 'image', index: idx, label: 'Image', src, alt: el.getAttribute('alt') ?? '' })
  })
  Array.from(doc.querySelectorAll('a')).forEach((el, idx) => {
    const href = el.getAttribute('href') ?? ''
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!href && !text) return
    fields.push({ kind: 'link', index: idx, label: 'Link', href, text })
  })
  return fields
}

// Apply a field-level edit back into the HTML string. We re-parse on every
// edit so the field list and the HTML stay aligned — re-parsing a typical
// section (a few KB) is cheap and avoids stale-cache bugs when the user
// switches between the textarea and quick-edit fields.
const applyQuickEdit = (
  html: string,
  patch:
    | { kind: 'text'; tag: string; index: number; value: string }
    | { kind: 'image'; index: number; src?: string; alt?: string }
    | { kind: 'link'; index: number; href?: string; text?: string },
): string => {
  if (!html || typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  if (patch.kind === 'text') {
    const el = doc.querySelectorAll(patch.tag)[patch.index] as HTMLElement | undefined
    if (!el) return html
    el.textContent = patch.value
  } else if (patch.kind === 'image') {
    const el = doc.querySelectorAll('img')[patch.index] as HTMLImageElement | undefined
    if (!el) return html
    if (patch.src !== undefined) el.setAttribute('src', patch.src)
    if (patch.alt !== undefined) el.setAttribute('alt', patch.alt)
  } else if (patch.kind === 'link') {
    const el = doc.querySelectorAll('a')[patch.index] as HTMLAnchorElement | undefined
    if (!el) return html
    if (patch.href !== undefined) el.setAttribute('href', patch.href)
    if (patch.text !== undefined) el.textContent = patch.text
  }
  return doc.body.innerHTML
}

const CustomHtmlQuickEdit = ({ html, onChange, ctx }) => {
  const [open, setOpen] = useState(true)
  // Re-derive on every html change — cheap, keeps the field list current
  // even when the user edits the raw HTML textarea.
  const fields = useMemo(() => parseQuickFields(html), [html])
  if (fields.length === 0) {
    return (
      <div style={{ marginBottom: 12, padding: 10, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textMute, fontSize: 12 }}>
        <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
          Quick edit
        </div>
        No headings / paragraphs / images / links found in this block. Edit the raw HTML below.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 12, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          color: T.text,
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Quick edit
          </span>
          <Pill color={T.primary}>{fields.length} fields</Pill>
        </span>
        <span style={{ fontSize: 10, color: T.textMute }}>{open ? '▾ Hide' : '▸ Show'}</span>
      </button>
      {open ? (
        <div style={{ padding: 10, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map((f, i) => {
            const key = `${f.kind}-${f.kind === 'text' ? f.tag : ''}-${f.kind === 'text' ? f.index : f.index}-${i}`
            if (f.kind === 'text') {
              const Comp = f.tag === 'p' ? Textarea : Input
              return (
                <div key={key}>
                  <Label>
                    {f.label}
                    <span style={{ color: T.textLow, fontWeight: 400, marginLeft: 6 }}>· {summary(f.value)}</span>
                  </Label>
                  <Comp
                    rows={f.tag === 'p' ? 3 : undefined}
                    value={f.value}
                    onChange={(e) =>
                      onChange(applyQuickEdit(html, { kind: 'text', tag: f.tag, index: f.index, value: e.target.value }))
                    }
                  />
                </div>
              )
            }
            if (f.kind === 'image') {
              return (
                <div key={key}>
                  <ImagePickerField
                    label={`${f.label} ${f.index + 1}`}
                    value={f.src}
                    onChange={(src) => onChange(applyQuickEdit(html, { kind: 'image', index: f.index, src }))}
                    siteSlug={ctx?.siteSlug}
                    siteId={ctx?.siteId}
                  />
                  <div style={{ marginTop: 6 }}>
                    <Label>Alt text</Label>
                    <Input
                      value={f.alt}
                      onChange={(e) => onChange(applyQuickEdit(html, { kind: 'image', index: f.index, alt: e.target.value }))}
                      placeholder="Short description for screen readers"
                    />
                  </div>
                </div>
              )
            }
            // link
            return (
              <div key={key}>
                <Label>
                  {f.label}
                  <span style={{ color: T.textLow, fontWeight: 400, marginLeft: 6 }}>· {summary(f.text || f.href)}</span>
                </Label>
                <Input
                  value={f.text}
                  onChange={(e) => onChange(applyQuickEdit(html, { kind: 'link', index: f.index, text: e.target.value }))}
                  placeholder="Link text"
                />
                <div style={{ marginTop: 6 }}>
                  <LinkPickerField
                    label="Href"
                    value={f.href}
                    onChange={(href) => onChange(applyQuickEdit(html, { kind: 'link', index: f.index, href }))}
                    sitePages={ctx?.sitePages}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// CONVERT CUSTOM HTML — when the selected block is a custom_html (most likely
// from a 'Structured copy (raw HTML per section)' import), offer to run the
// detector chain on its HTML and convert in-place to a structured block
// (hero, faq, services_grid, etc.) so the right-side editor shows proper
// fields. Two-step UI: 'Detect' shows the detector's best guess, 'Convert'
// commits — so the author can verify before swapping the block out.
// ============================================================================
const ConvertCustomHtmlPanel = ({ block, onConvert, onToast }) => {
  const [busy, setBusy] = useState(false)
  const [detected, setDetected] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Clear preview state if the user clicks to a different block before
    // committing the conversion.
    setDetected(null)
    setError(null)
    setBusy(false)
  }, [block?.id])

  const run = async () => {
    setBusy(true)
    setError(null)
    setDetected(null)
    const res = await settleAction(detectStructuredFromHtml({ html: String(block.html ?? '') }))
    setBusy(false)
    if (!res.ok) {
      setError(failureMessage(res))
      return
    }
    setDetected({ type: res.detected, block: res.block })
  }

  const commit = () => {
    if (!detected?.block) return
    // Strip id from the detected block — caller re-applies the original
    // block.id so the section keeps its position in the list.
    const { id: _unusedId, ...rest } = detected.block
    onConvert(rest)
    onToast({ message: `Converted to ${detected.type}.`, type: 'success' })
    setDetected(null)
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 10,
        background: T.bgElev,
        border: `1px solid ${T.primary}40`,
        borderRadius: 7,
      }}
    >
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Convert to structured block
      </div>
      {!detected ? (
        <>
          <div style={{ fontSize: 12, color: T.text, marginBottom: 8, lineHeight: 1.45 }}>
            This is currently a raw HTML block. Detect tries to recognise the
            section as a known structured type (hero / faq / services_grid /
            etc.) so you can edit it field-by-field instead of as HTML.
          </div>
          <Btn variant="primary" size="sm" icon={busy ? Loader2 : Sparkles} onClick={run} disabled={busy}>
            {busy ? 'Detecting…' : 'Detect type'}
          </Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>
            Detected:{' '}
            <Pill color={T.success}>{detected.type}</Pill>
          </div>
          <div style={{ fontSize: 11, color: T.textMute, marginBottom: 10, lineHeight: 1.45 }}>
            Conversion replaces this raw HTML block with a structured one. The
            position in the section list and any responsive-hide flags carry
            over. You can revert by undoing in the browser (Cmd+Z) or by
            re-importing.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="primary" size="sm" icon={Check} onClick={commit}>
              Convert
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setDetected(null)}>
              Keep as HTML
            </Btn>
          </div>
        </>
      )}
      {error ? (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: `${T.danger}15`,
            border: `1px solid ${T.danger}40`,
            borderRadius: 6,
            color: T.danger,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// ADVANCED PANEL — collapsible per-block style overrides (background colour,
// text colour, accent / CTA colour, alignment, vertical padding). Stored in
// the existing block_meta JSON field so no schema change / migration needed.
// The public BlockRenderer wraps each block in a div whose inline style
// overrides --site-primary / --site-ink / etc., and the bespoke CSS picks
// the overrides up via the brand cascade — so changing the accent here
// recolours buttons / pills / gradients inside that one section without
// touching anything else.
// ============================================================================
const ALIGN_CHOICES = [
  { id: '', label: 'Default' },
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
]
const PAD_CHOICES = [
  { id: '', label: 'Default' },
  { id: 'none', label: 'None' },
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
  { id: 'xl', label: 'X-Large' },
]

const ColorRow = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <input
      type="color"
      value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 28, height: 26, padding: 0, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, cursor: 'pointer' }}
      aria-label={`${label} color`}
    />
    <Input
      mono
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="#______ or inherit"
      style={{ flex: 1 }}
    />
    {value ? (
      <button
        type="button"
        onClick={() => onChange('')}
        title="Reset to brand cascade"
        style={{ padding: '2px 6px', fontSize: 10, color: T.textMute, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, cursor: 'pointer' }}
      >
        Reset
      </button>
    ) : null}
  </div>
)

const AdvancedBlockPanel = ({ blockId, meta, onPatch }) => {
  const [open, setOpen] = useState(false)
  const m = meta || {}
  const hasAny = Boolean(
    m.bg_color || m.text_color || m.accent_color || m.align || m.padding_top || m.padding_bottom,
  )
  return (
    <div
      style={{
        marginBottom: 12,
        background: T.bgElev,
        border: `1px solid ${T.border}`,
        borderRadius: 7,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          color: T.text,
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Advanced
          </span>
          {hasAny ? <Pill color={T.primary}>customised</Pill> : null}
        </span>
        <span style={{ fontSize: 10, color: T.textMute }}>{open ? '▾ Hide' : '▸ Show'}</span>
      </button>
      {open ? (
        <div style={{ padding: 10, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Background color</Label>
            <ColorRow label="Background" value={m.bg_color} onChange={(v) => onPatch({ bg_color: v })} />
          </div>
          <div>
            <Label>Text color</Label>
            <ColorRow label="Text" value={m.text_color} onChange={(v) => onPatch({ text_color: v })} />
          </div>
          <div>
            <Label>Accent / CTA color</Label>
            <ColorRow label="Accent" value={m.accent_color} onChange={(v) => onPatch({ accent_color: v })} />
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 4 }}>
              Drives the gradient buttons, badges, and brand accents inside this section.
            </div>
          </div>
          <div>
            <Label>Text alignment</Label>
            <Select value={m.align || ''} onChange={(e) => onPatch({ align: e.target.value })}>
              {ALIGN_CHOICES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Label>Padding top</Label>
              <Select value={m.padding_top || ''} onChange={(e) => onPatch({ padding_top: e.target.value })}>
                {PAD_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Padding bottom</Label>
              <Select value={m.padding_bottom || ''} onChange={(e) => onPatch({ padding_bottom: e.target.value })}>
                {PAD_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {hasAny ? (
            <Btn
              variant="ghost"
              size="xs"
              onClick={() =>
                onPatch({
                  bg_color: '',
                  text_color: '',
                  accent_color: '',
                  align: '',
                  padding_top: '',
                  padding_bottom: '',
                })
              }
            >
              Reset all to brand defaults
            </Btn>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ============================================================================
// VISIBILITY ROW — per-section responsive visibility checkboxes shown in the
// section editor right under the AI rewrite panel. Sets hide_mobile /
// hide_desktop flags on the page's block_meta[blockId] map; the public
// BlockRenderer adds .legalos-hide-mobile / .legalos-hide-desktop wrapper
// classes whose @media rules drop the block at the matching breakpoint.
// ============================================================================
const VisibilityRow = ({ blockId, meta, onPatch }) => (
  <div
    style={{
      marginBottom: 12,
      padding: 10,
      background: T.bgElev,
      border: `1px solid ${T.border}`,
      borderRadius: 7,
    }}
  >
    <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
      Visibility
    </div>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.text, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={!!meta.hide_mobile}
          onChange={(e) => onPatch({ hide_mobile: e.target.checked })}
        />
        Hide on mobile (≤640px)
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.text, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={!!meta.hide_desktop}
          onChange={(e) => onPatch({ hide_desktop: e.target.checked })}
        />
        Hide on desktop (≥1024px)
      </label>
    </div>
  </div>
)

// ============================================================================
// FORM FIELDS EDITOR — repeated editor for lead_form's custom field list. A
// field is { name, label, placeholder, type, required, half_width, options? }.
// The default empty list signals 'use the legacy first_name/last_name/email/
// phone/state/zip set' to the public LeadForm renderer.
// ============================================================================
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'hidden', label: 'Hidden' },
]

const slugifyName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

const FormFieldsEditor = ({ items, onChange }) => {
  const update = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    onChange(next)
  }
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))
  const move = (idx, dir) => {
    const next = [...items]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }
  const addField = (type) =>
    onChange([
      ...items,
      {
        name: `field_${items.length + 1}`,
        label: '',
        placeholder: '',
        type,
        required: false,
        half_width: false,
        options: type === 'select' ? [{ value: '', label: '' }] : undefined,
      },
    ])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.length === 0 ? (
        <div style={{ padding: 12, background: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 7, fontSize: 12, color: T.textMute }}>
          No custom fields. The public form will render: First name, Last name, Email, Phone, State, ZIP.
        </div>
      ) : (
        items.map((it, idx) => (
          <div key={idx} style={{ padding: 10, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Pill color={T.textMute}>{idx + 1}</Pill>
              <Pill color={T.primary}>{(FIELD_TYPES.find((t) => t.value === it.type) || {}).label || it.type}</Pill>
              <div style={{ flex: 1 }} />
              <IconBtn icon={MoveUp} onClick={() => move(idx, -1)} />
              <IconBtn icon={MoveDown} onClick={() => move(idx, 1)} />
              <IconBtn icon={Trash2} onClick={() => remove(idx)} style={{ color: T.danger }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <Label>Name (key)</Label>
                <Input
                  mono
                  value={it.name || ''}
                  onChange={(e) => update(idx, { name: slugifyName(e.target.value) })}
                  placeholder="first_name"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={it.type || 'text'}
                  onChange={(e) => {
                    const t = e.target.value
                    update(idx, {
                      type: t,
                      options: t === 'select' && !Array.isArray(it.options) ? [{ value: '', label: '' }] : it.options,
                    })
                  }}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {it.type !== 'hidden' ? (
              <>
                <Label>Label</Label>
                <Input value={it.label || ''} onChange={(e) => update(idx, { label: e.target.value })} placeholder="First name" />
                <Label>Placeholder</Label>
                <Input value={it.placeholder || ''} onChange={(e) => update(idx, { placeholder: e.target.value })} />
              </>
            ) : (
              <>
                <Label>Default value</Label>
                <Input mono value={it.value || ''} onChange={(e) => update(idx, { value: e.target.value })} placeholder="(constant)" />
              </>
            )}
            {it.type === 'select' ? (
              <div style={{ marginTop: 8 }}>
                <Label>Options</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(it.options || []).map((opt, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
                      <Input
                        mono
                        value={opt.value || ''}
                        onChange={(e) => {
                          const next = [...(it.options || [])]
                          next[j] = { ...next[j], value: e.target.value }
                          update(idx, { options: next })
                        }}
                        placeholder="value"
                      />
                      <Input
                        value={opt.label || ''}
                        onChange={(e) => {
                          const next = [...(it.options || [])]
                          next[j] = { ...next[j], label: e.target.value }
                          update(idx, { options: next })
                        }}
                        placeholder="Label shown to user"
                      />
                      <IconBtn
                        icon={Trash2}
                        onClick={() => update(idx, { options: (it.options || []).filter((_, k) => k !== j) })}
                        style={{ color: T.danger }}
                      />
                    </div>
                  ))}
                  <Btn
                    variant="secondary"
                    size="xs"
                    icon={Plus}
                    onClick={() => update(idx, { options: [...(it.options || []), { value: '', label: '' }] })}
                  >
                    Add option
                  </Btn>
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.text }}>
                <input
                  type="checkbox"
                  checked={!!it.required}
                  onChange={(e) => update(idx, { required: e.target.checked })}
                />
                Required
              </label>
              {it.type !== 'hidden' && it.type !== 'textarea' && it.type !== 'checkbox' ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.text }}>
                  <input
                    type="checkbox"
                    checked={!!it.half_width}
                    onChange={(e) => update(idx, { half_width: e.target.checked })}
                  />
                  Half width (pair w/ next field)
                </label>
              ) : null}
            </div>
          </div>
        ))
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FIELD_TYPES.map((t) => (
          <Btn key={t.value} variant="secondary" size="xs" icon={Plus} onClick={() => addField(t.value)}>
            {t.label}
          </Btn>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// PER-BLOCK EDITORS — each takes (block, set) where `set(patch)` shallow-merges
// into the block. They render only the fields that block type owns.
// ============================================================================
const Ed = {
  nav_header: (b, set, ctx) => (
    <>
      <Label>Links</Label>
      <ArrayEditor
        items={b.links || []}
        blank={{ label: '', href: '' }}
        onChange={(links) => set({ links })}
        render={(it, u) => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><Label>Label</Label><Input value={it.label || ''} onChange={(e) => u({ label: e.target.value })} /></div>
            <div>
              <Label>Href</Label>
              <LinkPickerField label="Href" value={it.href || ''} onChange={(v) => u({ href: v })} sitePages={ctx.sitePages} />
            </div>
          </div>
        )}
        addLabel="Add link"
      />
      <Label style={{ marginTop: 12 }}>CTA label</Label>
      <Input value={b.cta_label || ''} onChange={(e) => set({ cta_label: e.target.value })} />
      <Label>CTA href</Label>
      <LinkPickerField label="CTA href" value={b.cta_href || ''} onChange={(v) => set({ cta_href: v })} sitePages={ctx.sitePages} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input id="np" type="checkbox" checked={b.show_phone !== false} onChange={(e) => set({ show_phone: e.target.checked })} />
        <label htmlFor="np" style={{ fontSize: 12.5, color: T.text }}>Show phone number</label>
      </div>
    </>
  ),
  hero: (b, set, ctx) => (
    <>
      <Label>Eyebrow (badge)</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={3} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div><Label>Primary CTA label</Label><Input value={b.primary_cta_label || ''} onChange={(e) => set({ primary_cta_label: e.target.value })} /></div>
        <div>
          <Label>Primary CTA href</Label>
          <LinkPickerField label="Primary CTA href" value={b.primary_cta_href || ''} onChange={(v) => set({ primary_cta_href: v })} sitePages={ctx.sitePages} />
        </div>
        <div><Label>Secondary CTA label</Label><Input value={b.secondary_cta_label || ''} onChange={(e) => set({ secondary_cta_label: e.target.value })} /></div>
        <div>
          <Label>Secondary CTA href</Label>
          <LinkPickerField label="Secondary CTA href" value={b.secondary_cta_href || ''} onChange={(v) => set({ secondary_cta_href: v })} sitePages={ctx.sitePages} />
        </div>
      </div>
      <ImagePickerField
        label="Background image"
        value={b.image_url || ''}
        onChange={(url) => set({ image_url: url })}
        siteSlug={ctx.siteSlug}
        siteId={ctx.siteId}
      />
    </>
  ),
  trust_strip: (b, set) => (
    <>
      <Label>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ value: '', label: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><Label>Value</Label><Input value={it.value || ''} onChange={(e) => u({ value: e.target.value })} /></div>
            <div><Label>Label</Label><Input value={it.label || ''} onChange={(e) => u({ label: e.target.value })} /></div>
          </div>
        )}
        addLabel="Add item"
      />
    </>
  ),
  services_grid: (b, set) => (
    <>
      <Label>Eyebrow</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ title: '', description: '', icon: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <>
            <Label>Title</Label><Input value={it.title || ''} onChange={(e) => u({ title: e.target.value })} />
            <Label>Description</Label><Textarea rows={2} value={it.description || ''} onChange={(e) => u({ description: e.target.value })} />
            <Label>Icon (Lucide name)</Label><Input mono value={it.icon || ''} onChange={(e) => u({ icon: e.target.value })} />
          </>
        )}
        addLabel="Add service"
      />
    </>
  ),
  how_it_works: (b, set) => (
    <>
      <Label>Eyebrow</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Steps</Label>
      <ArrayEditor
        items={b.steps || []}
        blank={{ title: '', description: '' }}
        onChange={(steps) => set({ steps })}
        render={(it, u) => (
          <>
            <Label>Title</Label><Input value={it.title || ''} onChange={(e) => u({ title: e.target.value })} />
            <Label>Description</Label><Textarea rows={2} value={it.description || ''} onChange={(e) => u({ description: e.target.value })} />
          </>
        )}
        addLabel="Add step"
      />
    </>
  ),
  cards: (b, set) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ title: '', body: '', icon: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <>
            <Label>Title</Label><Input value={it.title || ''} onChange={(e) => u({ title: e.target.value })} />
            <Label>Body</Label><Textarea rows={2} value={it.body || ''} onChange={(e) => u({ body: e.target.value })} />
            <Label>Icon</Label><Input value={it.icon || ''} onChange={(e) => u({ icon: e.target.value })} />
          </>
        )}
        addLabel="Add card"
      />
    </>
  ),
  recent_wins: (b, set) => (
    <>
      <Label>Eyebrow</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ amount: '', case_type: '', description: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <>
            <Label>Amount</Label><Input value={it.amount || ''} onChange={(e) => u({ amount: e.target.value })} />
            <Label>Case type</Label><Input value={it.case_type || ''} onChange={(e) => u({ case_type: e.target.value })} />
            <Label>Description</Label><Textarea rows={2} value={it.description || ''} onChange={(e) => u({ description: e.target.value })} />
          </>
        )}
        addLabel="Add win"
      />
      <Label style={{ marginTop: 10 }}>Disclaimer</Label>
      <Textarea rows={2} value={b.disclaimer || ''} onChange={(e) => set({ disclaimer: e.target.value })} />
    </>
  ),
  testimonials: (b, set) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ quote: '', attribution: '', avatar_url: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <>
            <Label>Quote</Label><Textarea rows={3} value={it.quote || ''} onChange={(e) => u({ quote: e.target.value })} />
            <Label>Attribution</Label><Input value={it.attribution || ''} onChange={(e) => u({ attribution: e.target.value })} />
            <Label>Avatar URL</Label><Input mono value={it.avatar_url || ''} onChange={(e) => u({ avatar_url: e.target.value })} />
          </>
        )}
        addLabel="Add testimonial"
      />
    </>
  ),
  stats: (b, set) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ value: '', label: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><Label>Value</Label><Input value={it.value || ''} onChange={(e) => u({ value: e.target.value })} /></div>
            <div><Label>Label</Label><Input value={it.label || ''} onChange={(e) => u({ label: e.target.value })} /></div>
          </div>
        )}
        addLabel="Add stat"
      />
    </>
  ),
  bullet_list: (b, set) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ item: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <Input value={it.item || ''} onChange={(e) => u({ item: e.target.value })} />
        )}
        addLabel="Add bullet"
      />
    </>
  ),
  prose: (b, set) => (
    <>
      <Label>Markdown</Label>
      <Textarea rows={12} value={b.markdown || ''} onChange={(e) => set({ markdown: e.target.value })} />
    </>
  ),
  image: (b, set, ctx) => (
    <>
      <ImagePickerField
        label="Image"
        value={b.url || ''}
        onChange={(url) => set({ url })}
        siteSlug={ctx.siteSlug}
        siteId={ctx.siteId}
      />
      <Label>Alt</Label><Input value={b.alt || ''} onChange={(e) => set({ alt: e.target.value })} />
      <Label>Caption</Label><Input value={b.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
    </>
  ),
  cta: (b, set, ctx) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label>Button label</Label><Input value={b.label || ''} onChange={(e) => set({ label: e.target.value })} />
      <Label>Button href</Label>
      <LinkPickerField label="Button href" value={b.href || ''} onChange={(v) => set({ href: v })} sitePages={ctx.sitePages} />
    </>
  ),
  final_cta: (b, set, ctx) => (
    <>
      <Label>Eyebrow</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label>Primary CTA label</Label><Input value={b.primary_cta_label || ''} onChange={(e) => set({ primary_cta_label: e.target.value })} />
      <Label>Primary CTA href</Label>
      <LinkPickerField label="Primary CTA href" value={b.primary_cta_href || ''} onChange={(v) => set({ primary_cta_href: v })} sitePages={ctx.sitePages} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input id="fcp" type="checkbox" checked={b.show_phone !== false} onChange={(e) => set({ show_phone: e.target.checked })} />
        <label htmlFor="fcp" style={{ fontSize: 12.5, color: T.text }}>Show phone number</label>
      </div>
    </>
  ),
  faq: (b, set) => (
    <>
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label style={{ marginTop: 10 }}>Items</Label>
      <ArrayEditor
        items={b.items || []}
        blank={{ question: '', answer: '' }}
        onChange={(items) => set({ items })}
        render={(it, u) => (
          <>
            <Label>Question</Label><Input value={it.question || ''} onChange={(e) => u({ question: e.target.value })} />
            <Label>Answer</Label><Textarea rows={3} value={it.answer || ''} onChange={(e) => u({ answer: e.target.value })} />
          </>
        )}
        addLabel="Add Q&A"
      />
    </>
  ),
  disclosure: (b, set) => (
    <>
      <Label>Markdown</Label>
      <Textarea rows={10} value={b.markdown || ''} onChange={(e) => set({ markdown: e.target.value })} />
    </>
  ),
  lead_form: (b, set) => (
    <>
      <Label>Eyebrow</Label><Input value={b.eyebrow || ''} onChange={(e) => set({ eyebrow: e.target.value })} />
      <Label>Heading</Label><Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Sub</Label><Textarea rows={2} value={b.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
      <Label>Submit label</Label><Input value={b.submit_label || ''} onChange={(e) => set({ submit_label: e.target.value })} />
      <Label>Consent markdown</Label><Textarea rows={4} value={b.consent_md || ''} onChange={(e) => set({ consent_md: e.target.value })} />
      <Label>Success slug</Label><Input mono value={b.success_slug || ''} onChange={(e) => set({ success_slug: e.target.value })} />

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <Label style={{ marginBottom: 0 }}>Form fields</Label>
          <span style={{ fontSize: 10.5, color: T.textLow }}>
            {Array.isArray(b.form_fields) && b.form_fields.length > 0
              ? `${b.form_fields.length} custom field${b.form_fields.length === 1 ? '' : 's'}`
              : 'Using default: name / email / phone / state / zip'}
          </span>
        </div>
        <FormFieldsEditor
          items={Array.isArray(b.form_fields) ? b.form_fields : []}
          onChange={(form_fields) => set({ form_fields })}
        />
      </div>
    </>
  ),
  custom_html: (b, set, ctx) => (
    <>
      <CustomHtmlQuickEdit html={b.html || ''} onChange={(html) => set({ html })} ctx={ctx} />
      <Label>HTML</Label>
      <Textarea rows={12} value={b.html || ''} onChange={(e) => set({ html: e.target.value })} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }} />
    </>
  ),
  embed: (b, set) => (
    <>
      <Label>HTML</Label>
      <Textarea rows={10} value={b.html || ''} onChange={(e) => set({ html: e.target.value })} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }} />
      <Label>Admin note</Label>
      <Input value={b.note || ''} onChange={(e) => set({ note: e.target.value })} />
    </>
  ),
  site_footer: (b, set) => (
    <>
      <Label>Columns</Label>
      <ArrayEditor
        items={b.columns || []}
        blank={{ heading: '', links: [] }}
        onChange={(columns) => set({ columns })}
        render={(col, u) => (
          <>
            <Label>Heading</Label><Input value={col.heading || ''} onChange={(e) => u({ heading: e.target.value })} />
            <Label>Links</Label>
            <ArrayEditor
              items={col.links || []}
              blank={{ label: '', href: '' }}
              onChange={(links) => u({ links })}
              render={(it, uu) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div><Label>Label</Label><Input value={it.label || ''} onChange={(e) => uu({ label: e.target.value })} /></div>
                  <div><Label>Href</Label><Input mono value={it.href || ''} onChange={(e) => uu({ href: e.target.value })} /></div>
                </div>
              )}
              addLabel="Add link"
            />
          </>
        )}
        addLabel="Add column"
      />
      <Label style={{ marginTop: 10 }}>Legal markdown</Label>
      <Textarea rows={5} value={b.legal_md || ''} onChange={(e) => set({ legal_md: e.target.value })} />
    </>
  ),
  video: (b, set) => (
    <>
      <Label>Heading (optional)</Label>
      <Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Provider</Label>
      <Select value={b.provider || 'youtube'} onChange={(e) => set({ provider: e.target.value })}>
        <option value="youtube">YouTube</option>
        <option value="vimeo">Vimeo</option>
        <option value="url">Direct URL (mp4 / iframe)</option>
      </Select>
      <Label>
        {b.provider === 'vimeo' ? 'Vimeo id or URL' : b.provider === 'url' ? 'Embed URL' : 'YouTube id or URL'}
      </Label>
      <Input
        mono
        value={b.video_id || ''}
        onChange={(e) => set({ video_id: e.target.value })}
        placeholder={
          b.provider === 'vimeo'
            ? '76979871 or https://vimeo.com/76979871'
            : b.provider === 'url'
              ? 'https://example.com/video.mp4'
              : 'dQw4w9WgXcQ or https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        }
      />
      <Label>Aspect ratio</Label>
      <Select value={b.aspect_ratio || '16:9'} onChange={(e) => set({ aspect_ratio: e.target.value })}>
        <option value="16:9">16:9 (widescreen)</option>
        <option value="4:3">4:3 (classic)</option>
        <option value="1:1">1:1 (square)</option>
      </Select>
      <Label>Caption (optional)</Label>
      <Input value={b.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
    </>
  ),
  gallery: (b, set, ctx) => (
    <>
      <Label>Heading (optional)</Label>
      <Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} />
      <Label>Columns</Label>
      <Select value={b.columns || '3'} onChange={(e) => set({ columns: e.target.value })}>
        <option value="2">2 columns</option>
        <option value="3">3 columns</option>
        <option value="4">4 columns</option>
      </Select>
      <Label style={{ marginTop: 10 }}>Images</Label>
      <ArrayEditor
        items={b.images || []}
        blank={{ image_url: '', alt: '', caption: '' }}
        onChange={(images) => set({ images })}
        render={(it, u) => (
          <>
            <ImagePickerField
              label="Image"
              value={it.image_url || ''}
              onChange={(url) => u({ image_url: url })}
              siteSlug={ctx.siteSlug}
              siteId={ctx.siteId}
            />
            <Label>Alt</Label>
            <Input value={it.alt || ''} onChange={(e) => u({ alt: e.target.value })} />
            <Label>Caption</Label>
            <Input value={it.caption || ''} onChange={(e) => u({ caption: e.target.value })} />
          </>
        )}
        addLabel="Add image"
      />
    </>
  ),
  logo_cloud: (b, set, ctx) => (
    <>
      <Label>Heading (optional)</Label>
      <Input value={b.heading || ''} onChange={(e) => set({ heading: e.target.value })} placeholder='e.g. "As seen on"' />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          id="lcgs"
          type="checkbox"
          checked={b.grayscale !== false}
          onChange={(e) => set({ grayscale: e.target.checked })}
        />
        <label htmlFor="lcgs" style={{ fontSize: 12.5, color: T.text }}>
          Grayscale + reduced opacity ("as seen on" look)
        </label>
      </div>
      <Label style={{ marginTop: 12 }}>Logos</Label>
      <ArrayEditor
        items={b.logos || []}
        blank={{ image_url: '', alt: '', href: '' }}
        onChange={(logos) => set({ logos })}
        render={(it, u) => (
          <>
            <ImagePickerField
              label="Logo image"
              value={it.image_url || ''}
              onChange={(url) => u({ image_url: url })}
              siteSlug={ctx.siteSlug}
              siteId={ctx.siteId}
            />
            <Label>Alt (brand name)</Label>
            <Input value={it.alt || ''} onChange={(e) => u({ alt: e.target.value })} />
            <Label>Link (optional)</Label>
            <LinkPickerField label="Link" value={it.href || ''} onChange={(v) => u({ href: v })} sitePages={ctx.sitePages} />
          </>
        )}
        addLabel="Add logo"
      />
    </>
  ),
  spacer: (b, set) => (
    <>
      <Label>Size</Label>
      <Select value={b.size || 'md'} onChange={(e) => set({ size: e.target.value })}>
        <option value="sm">Small (32px)</option>
        <option value="md">Medium (64px)</option>
        <option value="lg">Large (96px)</option>
        <option value="xl">Extra large (128px)</option>
      </Select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <input
          id="spdv"
          type="checkbox"
          checked={!!b.show_divider}
          onChange={(e) => set({ show_divider: e.target.checked })}
        />
        <label htmlFor="spdv" style={{ fontSize: 12.5, color: T.text }}>
          Show thin horizontal rule inside the gap
        </label>
      </div>
    </>
  ),
}

const BlockEditor = ({ block, onChange, ctx }) => {
  if (!block) return null
  const Editor = Ed[block.blockType]
  if (!Editor) {
    return (
      <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.warning}`, borderRadius: 8, color: T.warning, fontSize: 12.5 }}>
        No dedicated editor for blockType <strong>{block.blockType}</strong>. Edit raw JSON below.
        <Textarea
          rows={12}
          mono
          value={JSON.stringify(block, null, 2)}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)) } catch { /* ignore parse errors mid-typing */ }
          }}
          style={{ marginTop: 10 }}
        />
      </div>
    )
  }
  return Editor(block, (patch) => onChange({ ...block, ...patch }), ctx)
}

// ============================================================================
// ADD BLOCK MODAL
// ============================================================================
const AddBlockModal = ({ open, onPick, onClose }) => {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, maxHeight: '85vh', overflowY: 'auto', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, color: T.text, fontWeight: 600 }}>Add a block</div>
            <div style={{ fontSize: 12, color: T.textMute, marginTop: 2 }}>Pick a block type to insert</div>
          </div>
          <div style={{ flex: 1 }} />
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {BLOCK_TYPES.map((bt) => {
            const Icon = bt.icon
            return (
              <button key={bt.id} onClick={() => onPick(bt.id)} style={{ padding: 12, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: T.bgElev2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={14} color={T.primary} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{bt.name}</div>
                  <div style={{ fontSize: 11, color: T.textMute, marginTop: 2 }}>{bt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN APP
// ============================================================================
export function PageBlocksBuilderApp({ pageId, siteSlug, siteId, primaryHost, sitePages = [], siteBrand = null, initial }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title || 'Untitled')
  const [slug, setSlug] = useState(initial.slug || '/')
  const [status, setStatus] = useState(initial.status || 'draft')
  const [metaTitle, setMetaTitle] = useState(initial.meta_title || '')
  const [metaDescription, setMetaDescription] = useState(initial.meta_description || '')
  const [ogImageUrl, setOgImageUrl] = useState(initial.og_image_url || '')
  const [publishAt, setPublishAt] = useState(initial.publish_at || '')
  const [schemaJson, setSchemaJson] = useState(initial.schema_json || '')
  const [blocks, setBlocks] = useState(() =>
    (Array.isArray(initial.body_blocks) ? initial.body_blocks : []).map((b, i) => ({
      ...b,
      id: b.id || `${b.blockType || 'block'}_${i}_${genId()}`,
    })),
  )
  const [hiddenBlocks, setHiddenBlocks] = useState(() =>
    Array.isArray(initial.hidden_blocks) ? initial.hidden_blocks : [],
  )
  const [blockMeta, setBlockMeta] = useState(() =>
    initial.block_meta && typeof initial.block_meta === 'object' ? initial.block_meta : {},
  )
  const [selectedId, setSelectedId] = useState(blocks[0]?.id || null)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  // { x, y, blockId } — null means closed.
  const [ctxMenu, setCtxMenu] = useState(null)
  // 'desktop' | 'tablet' | 'mobile' — drives the canvas max-width so the
  // user can see roughly how a page will look at each breakpoint.
  const [viewport, setViewport] = useState('desktop')
  const saveTimer = useRef(null)

  const selected = blocks.find((b) => b.id === selectedId)

  /*
   * Undo callbacks for state this screen flipped optimistically and the pending
   * save has not confirmed yet. Only the PUBLISH status registers one: a save
   * carries the whole page, so a failure invalidates the block edits too, but
   * dropping those would throw the operator's work away — whereas a page still
   * reading PUBLISHED after an unpublish that never landed is a lie about what
   * visitors can see, which is the half that must not survive.
   *
   * A list rather than a single slot because the debounce coalesces writes: two
   * flips before one save means two rollbacks, and they are applied newest-first
   * so the value the server actually holds is the one restored.
   */
  const pendingRollbacks = useRef([])

  // Debounced auto-save. body_blocks IS the public render source, so any
  // successful save here is immediately visible to visitors on the next
  // page render — no iframe to refresh.
  const persist = useCallback((next, rollback) => {
    if (rollback) pendingRollbacks.current = [...pendingRollbacks.current, rollback]
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      const res = await settleAction(savePageBodyBlocks({
        pageId,
        siteSlug,
        title: next.title,
        slug: next.slug,
        status: next.status,
        meta_title: next.metaTitle,
        meta_description: next.metaDescription,
        og_image_url: next.ogImageUrl,
        body_blocks: next.blocks.map(({ id, ...rest }) => ({ id, ...rest })),
        hidden_blocks: next.hiddenBlocks,
        block_meta: next.blockMeta,
        publish_at: next.publishAt || null,
        schema_json: next.schemaJson || null,
      }))
      setSaving(false)
      if (res.ok) { pendingRollbacks.current = []; return }
      const undo = pendingRollbacks.current
      pendingRollbacks.current = []
      for (let i = undo.length - 1; i >= 0; i--) undo[i]()
      setToast({ message: failureMessage(res), type: 'error' })
    }, 600)
  }, [pageId, siteSlug])

  const bump = (patch = {}, rollback) => {
    persist({
      title, slug, status, metaTitle, metaDescription, ogImageUrl,
      blocks, hiddenBlocks, blockMeta,
      publishAt, schemaJson,
      ...patch,
    }, rollback)
  }

  // Per-block meta helper: merge new flags into block_meta[blockId].
  const setBlockMetaFor = (id, patch) => {
    const current = (blockMeta[id] || {}) as Record<string, unknown>
    const merged = { ...current, ...patch }
    // Drop falsy keys so the map stays compact.
    const cleaned = {}
    for (const k of Object.keys(merged)) {
      if (merged[k]) cleaned[k] = merged[k]
    }
    const nextMeta = { ...blockMeta }
    if (Object.keys(cleaned).length === 0) delete nextMeta[id]
    else nextMeta[id] = cleaned
    setBlockMeta(nextMeta)
    bump({ blockMeta: nextMeta })
  }

  // Lint runs on every blocks-state change. Pure + cheap, so we don't bother
  // debouncing; the memo cache lets re-renders that don't change `blocks`
  // skip the walk entirely.
  const lintIssues = useMemo(() => lintBlocks(blocks), [blocks])
  const lintByBlock = useMemo(() => {
    const m = {}
    for (const issue of lintIssues) {
      if (!issue.blockId) continue
      ;(m[issue.blockId] || (m[issue.blockId] = [])).push(issue)
    }
    return m
  }, [lintIssues])
  const lintErrorCount = lintIssues.filter((i) => i.severity === 'error').length
  const lintWarnCount = lintIssues.filter((i) => i.severity === 'warning').length

  // Wrap setters so any update fires a debounced save.
  const setTitleX = (v) => { setTitle(v); bump({ title: v }) }
  const setSlugX = (v) => { setSlug(v); bump({ slug: v }) }
  // The status pill is the operator's answer to "is this page live", so the flip
  // is registered for rollback: a save that never lands must not leave it
  // claiming a page was published or taken down when it was not.
  const setStatusX = (v) => { const previous = status; setStatus(v); bump({ status: v }, () => setStatus(previous)) }
  const setMetaTitleX = (v) => { setMetaTitle(v); bump({ metaTitle: v }) }
  const setMetaDescX = (v) => { setMetaDescription(v); bump({ metaDescription: v }) }
  const setOgUrlX = (v) => { setOgImageUrl(v); bump({ ogImageUrl: v }) }
  const setPublishAtX = (v) => { setPublishAt(v); bump({ publishAt: v }) }
  const setSchemaJsonX = (v) => { setSchemaJson(v); bump({ schemaJson: v }) }

  const updateBlock = (id, patch) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    setBlocks(next)
    bump({ blocks: next })
  }

  const addBlock = (type) => {
    const seed = SEED_FOR[type]?.() ?? { blockType: type }
    const newBlock = { id: `${type}_${genId()}`, ...seed }
    const next = [...blocks, newBlock]
    setBlocks(next)
    setSelectedId(newBlock.id)
    setAddOpen(false)
    bump({ blocks: next })
  }

  const deleteBlock = (id) => {
    const next = blocks.filter((b) => b.id !== id)
    setBlocks(next)
    if (selectedId === id) setSelectedId(next[0]?.id || null)
    bump({ blocks: next })
  }

  const moveBlock = (id, dir) => {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx === -1) return
    const swap = idx + dir
    if (swap < 0 || swap >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setBlocks(next)
    bump({ blocks: next })
  }

  const moveBlockTo = (id, where) => {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx === -1) return
    if (where === 'top' && idx === 0) return
    if (where === 'bottom' && idx === blocks.length - 1) return
    const next = [...blocks]
    const [moved] = next.splice(idx, 1)
    if (where === 'top') next.unshift(moved)
    else next.push(moved)
    setBlocks(next)
    bump({ blocks: next })
  }

  const duplicateBlock = (id) => {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx === -1) return
    const src = blocks[idx]
    // Deep clone + rebrand id so sibling ids stay distinct. Arrays inside
    // (links/items/steps/etc.) get JSON-cloned too so editing the copy
    // doesn't mutate the original.
    const clone = JSON.parse(JSON.stringify(src))
    clone.id = `${src.blockType || 'block'}_${genId()}`
    const next = [...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)]
    setBlocks(next)
    setSelectedId(clone.id)
    bump({ blocks: next })
  }

  const toggleHidden = (id) => {
    const next = hiddenBlocks.includes(id)
      ? hiddenBlocks.filter((x) => x !== id)
      : [...hiddenBlocks, id]
    setHiddenBlocks(next)
    bump({ hiddenBlocks: next })
  }

  // Drag-drop reorder. dragId is the block being dragged; dragOverId is the
  // block currently under the pointer (used to highlight the drop target).
  // On drop, we insert the dragged block in front of the over-block. Dropping
  // onto self or onto the empty trailing area is a no-op.
  const handleDragStart = (e, id) => {
    setDragId(id)
    try { e.dataTransfer.effectAllowed = 'move' } catch {}
  }
  const handleDragOver = (e, id) => {
    e.preventDefault()
    if (id !== dragOverId) setDragOverId(id)
    try { e.dataTransfer.dropEffect = 'move' } catch {}
  }
  const handleDragEnd = () => {
    setDragId(null)
    setDragOverId(null)
  }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    const sourceId = dragId
    setDragId(null)
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return
    const fromIdx = blocks.findIndex((b) => b.id === sourceId)
    const toIdx = blocks.findIndex((b) => b.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...blocks]
    const [moved] = next.splice(fromIdx, 1)
    // If we removed an earlier block, the target index shifts down by 1.
    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx
    next.splice(insertAt, 0, moved)
    setBlocks(next)
    bump({ blocks: next })
  }

  // Keyboard shortcuts:
  //   /      open Add Section modal (when not typing in a field)
  //   Esc    deselect / close modal
  //   Cmd+S / Ctrl+S → force-save (auto-save runs in 600ms anyway, but
  //          authors hit Cmd+S out of habit; we ack with a toast).
  useEffect(() => {
    const isTypingTarget = (t) => {
      if (!t) return false
      const tag = (t as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((t as HTMLElement).isContentEditable) return true
      return false
    }
    const onKey = (e: KeyboardEvent) => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey
      if (cmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        // Force an immediate save by clearing the debounce + calling persist
        // with the current state. The next render will fire again, idempotently.
        if (saveTimer.current) clearTimeout(saveTimer.current)
        bump({})
        setToast({ message: 'Saved.', type: 'success' })
        return
      }
      if (e.key === '/' && !cmdOrCtrl && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setAddOpen(true)
        return
      }
      if (e.key === 'Escape') {
        if (addOpen) setAddOpen(false)
        else if (ctxMenu) setCtxMenu(null)
        else if (selectedId) setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, selectedId, ctxMenu])

  const handleBack = () => router.push(`/admin/sites/${siteSlug}/pages`)
  const handlePreview = () => {
    // Open the page via the current admin origin instead of the Site's
    // primary domain. That way:
    //   - Sites without a real configured domain still get a working preview
    //     (no DNS lookup against {slug}.preview.legenex.com that may not exist).
    //   - We can carry admin auth cookies through (same origin) so the route
    //     can detect 'this is an admin previewing draft content'.
    //   - ?site=<slug>  picks the Site by slug (host header is the admin host).
    //   - ?preview=1    asks the public route to bypass the status='published'
    //                   filter so the admin sees draft / scheduled pages
    //                   rendered as they would look when live.
    //   - ?ts=<now>     cache-buster so we get the freshest auto-saved state.
    const path = slug.startsWith('/') ? slug : `/${slug}`
    const origin = typeof window !== 'undefined' ? window.location.origin : `https://${primaryHost}`
    const url = `${origin}${path}?site=${encodeURIComponent(siteSlug)}&preview=1&ts=${Date.now()}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const handlePublishToggle = () => {
    const previous = status
    const next = status === 'published' ? 'draft' : 'published'
    setStatus(next)
    bump({ status: next }, () => setStatus(previous))
  }

  const previewPath = slug.startsWith('/') ? slug : `/${slug}`
  const livePath = `https://${primaryHost}${previewPath}`

  // The preview is the SAME React tree the public route uses (BlockRenderer)
  // — rendered directly here so click-to-edit and instant updates work. We
  // synthesize a minimal RenderContext from props because the builder doesn't
  // yet have direct access to the Site doc / resolved phone.
  const renderCtx = {
    site: {
      id: 0,
      slug: siteSlug,
      name: title || siteSlug,
      default_phone: null,
      default_phone_tel: null,
      org_name: title || siteSlug,
      org_address: null,
      support_email: null,
      default_disclaimer_md: null,
    },
    phone: { display: '', tel: '' },
    isPreview: true,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, color: T.text, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <TopBar
        crumbs={`ADMIN / SITES / ${siteSlug.toUpperCase()} / PAGES`}
        title={title || 'Untitled'}
        isPublished={status === 'published'}
        onBack={handleBack}
        onPreview={handlePreview}
        onPublish={handlePublishToggle}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ViewportToggle viewport={viewport} onChange={setViewport} />
            {saving && <Pill color={T.warning}>SAVING…</Pill>}
          </div>
        }
      />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 360px', overflow: 'hidden' }}>
        {/* Left: blocks list */}
        <div style={{ borderRight: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Label>Sections · {blocks.length}</Label>
            <Btn variant="primary" size="xs" icon={Plus} onClick={() => setAddOpen(true)}>Add</Btn>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {blocks.length === 0 && (
              <div style={{ padding: 14, border: `1px dashed ${T.border}`, borderRadius: 8, color: T.textMute, fontSize: 12, textAlign: 'center' }}>
                No blocks yet. Click Add to insert one.
              </div>
            )}
            {blocks.map((b) => {
              const meta = BLOCK_META[b.blockType] || { name: b.blockType, icon: Layers }
              const Icon = meta.icon
              const active = b.id === selectedId
              const hidden = hiddenBlocks.includes(b.id)
              const isDragging = dragId === b.id
              const isDropTarget = dragOverId === b.id && dragId && dragId !== b.id
              const summary =
                b.heading ||
                b.title ||
                b.eyebrow ||
                b.note ||
                (typeof b.markdown === 'string' ? b.markdown.slice(0, 40) : '') ||
                ''
              return (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, b.id)}
                  onDragOver={(e) => handleDragOver(e, b.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, b.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSelectedId(b.id)
                    setCtxMenu({ x: e.clientX, y: e.clientY, blockId: b.id })
                  }}
                  style={{
                    padding: '8px 8px 8px 4px',
                    backgroundColor: active ? T.bgElev2 : T.bgElev,
                    border: `1px solid ${isDropTarget ? T.primary : active ? T.primary : T.border}`,
                    borderRadius: 7,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: isDragging ? 0.5 : hidden ? 0.55 : 1,
                    boxShadow: isDropTarget ? `0 -2px 0 ${T.primary}` : 'none',
                    transition: 'box-shadow 0.12s ease, border-color 0.12s ease',
                  }}
                >
                  <span
                    title="Drag to reorder"
                    style={{ display: 'flex', alignItems: 'center', cursor: 'grab', color: T.textLow, padding: '0 2px' }}
                  >
                    <GripVertical size={12} />
                  </span>
                  <Icon size={13} color={active ? T.primary : T.textMute} />
                  <button
                    onClick={() => setSelectedId(b.id)}
                    style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: T.text, minWidth: 0, overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.name}
                      </div>
                      {hidden ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: `${T.textMute}30`,
                            color: T.textMute,
                            letterSpacing: '0.05em',
                          }}
                        >
                          HIDDEN
                        </span>
                      ) : null}
                      {(() => {
                        const issues = lintByBlock[b.id] || []
                        if (issues.length === 0) return null
                        const hasError = issues.some((i) => i.severity === 'error')
                        const Icon = hasError ? XCircle : AlertTriangle
                        const color = hasError ? T.danger : T.warning
                        return (
                          <span
                            title={issues.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`).join('\n\n')}
                            style={{ display: 'inline-flex', alignItems: 'center', color }}
                          >
                            <Icon size={11} />
                          </span>
                        )
                      })()}
                    </div>
                    {summary && (
                      <div style={{ fontSize: 10.5, color: T.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</div>
                    )}
                  </button>
                  <IconBtn
                    icon={hidden ? EyeOff : Eye}
                    onClick={() => toggleHidden(b.id)}
                    style={{ padding: 3, color: hidden ? T.textMute : T.text }}
                    title={hidden ? 'Show on public site' : 'Hide on public site'}
                  />
                  <IconBtn icon={Copy} onClick={() => duplicateBlock(b.id)} style={{ padding: 3 }} title="Duplicate" />
                  <IconBtn icon={Trash2} onClick={() => deleteBlock(b.id)} style={{ padding: 3, color: T.danger }} title="Delete" />
                </div>
              )
            })}
          </div>
        </div>

        {/* Center: live page rendered inline. Each block is wrapped in a
            click-to-select overlay; selecting opens that block's editor in
            the right panel. The user is literally editing the same JSX the
            public site renders. */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#0c1118', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: T.textMute }}>
            <Pill color={T.success}>{status === 'published' ? 'PUBLISHED' : 'DRAFT'}</Pill>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{livePath}</span>
            <div style={{ flex: 1 }} />
            <span>Click any section to edit ›</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', background: viewport === 'desktop' ? '#fff' : '#0c1118', padding: viewport === 'desktop' ? 0 : '24px 0' }}>
            {blocks.length === 0 ? (
              <div style={{ padding: '120px 40px', textAlign: 'center', color: '#94a3b8', fontSize: 14, fontFamily: '"Inter", system-ui, sans-serif' }}>
                No sections yet. Click <strong>Add</strong> in the left panel to insert one.
              </div>
            ) : (
              <div
                className="legalos-builder-canvas"
                style={
                  viewport === 'desktop'
                    ? undefined
                    : {
                        maxWidth: (VIEWPORTS.find((v) => v.id === viewport) || VIEWPORTS[0]).width,
                        margin: '0 auto',
                        background: '#fff',
                        borderRadius: 12,
                        overflow: 'hidden',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
                      }
                }
              >
                {blocks.map((b) => {
                  const active = b.id === selectedId
                  const hidden = hiddenBlocks.includes(b.id)
                  const meta = blockMeta[b.id] || {}
                  const dimmedByViewport =
                    (viewport === 'mobile' && meta.hide_mobile) ||
                    (viewport === 'desktop' && meta.hide_desktop)
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      style={{
                        position: 'relative',
                        outline: active ? `2px solid ${T.primary}` : '2px solid transparent',
                        outlineOffset: -2,
                        cursor: 'pointer',
                        opacity: hidden ? 0.4 : dimmedByViewport ? 0.5 : 1,
                        filter: hidden || dimmedByViewport ? 'grayscale(0.6)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.outline = `2px dashed ${T.primary}80`
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.outline = '2px solid transparent'
                      }}
                    >
                      {hidden ? (
                        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 20, padding: '4px 10px', background: '#000a', color: '#fff', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em' }}>
                          HIDDEN ON PUBLIC SITE
                        </div>
                      ) : dimmedByViewport ? (
                        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 20, padding: '4px 10px', background: '#000a', color: '#fff', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', borderRadius: 4, fontWeight: 600, letterSpacing: '0.05em' }}>
                          {viewport === 'mobile' ? 'HIDDEN ON MOBILE' : 'HIDDEN ON DESKTOP'}
                        </div>
                      ) : null}
                      {active && (
                        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 20, padding: '4px 10px', background: T.primary, color: '#fff', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', borderRadius: 4, fontWeight: 600 }}>
                          EDITING · {(BLOCK_META[b.blockType] || {}).name || b.blockType}
                        </div>
                      )}
                      <BlockRenderer blocks={[b as unknown as Record<string, unknown> & { blockType: string }]} ctx={renderCtx as never} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: section editor OR page settings */}
        <div style={{ borderLeft: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 16 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Pill color={T.primary}>{(BLOCK_META[selected.blockType] || {}).name || selected.blockType}</Pill>
                <div style={{ flex: 1 }} />
                <Btn variant="ghost" size="xs" onClick={() => setSelectedId(null)}>Page settings ›</Btn>
              </div>
              <AIRewritePanel
                block={selected}
                onAccept={(next) => updateBlock(selected.id, { ...next, id: selected.id })}
              />
              {selected.blockType === 'nav_header' || selected.blockType === 'site_footer' ? (
                <SaveAsSiteDefaultRow
                  block={selected}
                  siteSlug={siteSlug}
                  siteId={siteId}
                  onToast={(t) => setToast(t)}
                />
              ) : null}
              {selected.blockType === 'custom_html' ? (
                <ConvertCustomHtmlPanel
                  block={selected}
                  onConvert={(next) => updateBlock(selected.id, { ...next, id: selected.id })}
                  onToast={(t) => setToast(t)}
                />
              ) : null}
              <AdvancedBlockPanel
                blockId={selected.id}
                meta={blockMeta[selected.id] || {}}
                onPatch={(patch) => setBlockMetaFor(selected.id, patch)}
              />
              <VisibilityRow
                blockId={selected.id}
                meta={blockMeta[selected.id] || {}}
                onPatch={(patch) => setBlockMetaFor(selected.id, patch)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BlockEditor block={selected} onChange={(next) => updateBlock(selected.id, next)} ctx={{ siteSlug, siteId, sitePages }} />
              </div>
            </>
          ) : (
            <>
              <Label>Page</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitleX(e.target.value)} /></div>
                <div><Label>Slug</Label><Input mono value={slug} onChange={(e) => setSlugX(e.target.value)} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={status} onChange={(e) => setStatusX(e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </Select>
                </div>
                {status === 'scheduled' ? (
                  <div>
                    <Label>Publish at</Label>
                    <Input
                      type="datetime-local"
                      value={publishAt ? toLocalInputValue(publishAt) : ''}
                      onChange={(e) => setPublishAtX(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    />
                    <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 4 }}>
                      Page goes live automatically at this time. Until then, it's hidden from the public site.
                    </div>
                  </div>
                ) : null}
              </div>
              <Label>SEO</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><Label>Meta title</Label><Input value={metaTitle} onChange={(e) => setMetaTitleX(e.target.value)} /></div>
                <div><Label>Meta description</Label><Textarea rows={3} value={metaDescription} onChange={(e) => setMetaDescX(e.target.value)} /></div>
                <div>
                  <ImagePickerField
                    label="OG image"
                    value={ogImageUrl}
                    onChange={(url) => setOgUrlX(url)}
                    siteSlug={siteSlug}
                    siteId={siteId}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <GoogleSerpPreview
                  primaryHost={primaryHost}
                  slug={slug}
                  metaTitle={metaTitle}
                  metaDescription={metaDescription}
                  pageTitle={title}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <OgPreviewCards
                  primaryHost={primaryHost}
                  metaTitle={metaTitle}
                  metaDescription={metaDescription}
                  ogImageUrl={ogImageUrl}
                  pageTitle={title}
                />
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <PageHealthCard
                  issues={lintIssues}
                  errors={lintErrorCount}
                  warnings={lintWarnCount}
                  blocks={blocks}
                  onJumpToBlock={(id) => setSelectedId(id)}
                  siteBrand={siteBrand}
                />
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <Label>JSON-LD (schema.org)</Label>
                <Textarea
                  mono
                  rows={8}
                  value={schemaJson}
                  onChange={(e) => setSchemaJsonX(e.target.value)}
                  placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "LegalService",\n  "name": "..."\n}'}
                />
                <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6 }}>
                  Injected as a {`<script type="application/ld+json">`} tag in the page head. Must be valid JSON — invalid JSON blocks the save and surfaces an error.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AddBlockModal open={addOpen} onClose={() => setAddOpen(false)} onPick={addBlock} />
      {ctxMenu ? (
        (() => {
          const target = blocks.find((b) => b.id === ctxMenu.blockId)
          if (!target) return null
          const isHidden = hiddenBlocks.includes(target.id)
          const idx = blocks.findIndex((b) => b.id === target.id)
          return (
            <SectionContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              onClose={() => setCtxMenu(null)}
              items={[
                { id: 'dup', label: 'Duplicate', icon: Copy, onClick: () => duplicateBlock(target.id) },
                { id: 'top', label: 'Move to top', icon: MoveUp, onClick: () => moveBlockTo(target.id, 'top') },
                { id: 'bot', label: 'Move to bottom', icon: MoveDown, onClick: () => moveBlockTo(target.id, 'bottom') },
                { separator: true },
                {
                  id: 'vis',
                  label: isHidden ? 'Show on public site' : 'Hide on public site',
                  icon: isHidden ? Eye : EyeOff,
                  onClick: () => toggleHidden(target.id),
                },
                { separator: true },
                { id: 'del', label: 'Delete section', icon: Trash2, danger: true, onClick: () => deleteBlock(target.id) },
              ]}
            />
          )
        })()
      ) : null}
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
