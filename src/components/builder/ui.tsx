// @ts-nocheck
/* eslint-disable */
'use client'

// Shared theme (T) and UI primitives used by every builder screen (Brand
// Identities, Landing Pages, Quizzes, Advertorials, Page Blocks). The JSX is the
// port of the original funnel-builder artifact and still paints with inline
// styles; only the palette below decides what colour those styles produce.
//
// THE REBRAND CHANGES VALUES, NOT KEYS, with one exception. 1,797 call sites
// across 23 files read
// `T.bg`, `T.primary`, `T.textMute` and the rest. Renaming them would be a
// mechanical sweep through @ts-nocheck'd ported code with a large blast radius
// and no design benefit, so every key below keeps its name and takes the
// PageFlo value from `src/app/globals.css`. The builder is now the same palette
// as the rest of the console rather than a second, lighter dark theme sitting
// next to it. The exception is `pink`, renamed to `orange`: PageFlo's accent set
// is teal, purple, orange and blue, and a key named `pink` holding #F97316 is a
// lie a future reader has to discover by rendering it. Six call sites, all
// mechanical.
//
// The values are literals rather than `var(--color-*)` because this object is
// also read in plain JavaScript (comparisons, canvas fills, colour maths in
// TemplateGallery and the LP renderer), where a CSS variable is an opaque
// string. `scripts/test-brand-tokens` style checks treat this file as admin
// chrome, which is fixed product surface and deliberately not brand-painted.
//
// Contrast, measured against the surface each value actually sits on:
//   text      #EEF2F8 on bg #0A0E15 -> 17.2:1
//   textDim   #C7D0DC on bgElev #131924 -> 10.9:1
//   textMute  #8B95A8 on bgElev #131924 ->  5.8:1
//   textLow   #808C9E on bgElev #131924 ->  5.2:1
// All four clear WCAG AA for normal text on every builder surface.

import { useEffect } from 'react'
import { AlertCircle, ChevronLeft, Eye, Power, PowerOff, X } from 'lucide-react'

// ============================================================================
// THEME
// ============================================================================
export const T = {
  bg: '#0A0E15',
  bgElev: '#131924',
  bgElev2: '#182030',
  bgElev3: '#1F2939',
  border: '#243044',
  borderHover: '#2C3A4E',
  text: '#EEF2F8',
  textDim: '#C7D0DC',
  textMute: '#8B95A8',
  textLow: '#808C9E',
  primary: '#E5484D',
  primaryHover: '#D43B40',
  primarySoft: 'rgba(229, 72, 77, 0.08)',
  primaryGlow: 'rgba(229, 72, 77, 0.25)',
  success: '#3DD68C',
  warning: '#FACC14',
  danger: '#E5484D',
  info: '#5AA6DC',
  purple: '#9585DD',
  orange: '#F97316',
  cyan: '#41D9C7',
}

// ============================================================================
// HELPERS
// ============================================================================
export const genId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// brandShortName derives the short logo letters from displayName on the fly.
export const brandShortName = (brand) => {
  if (!brand) return 'YB'
  if (brand.shortName) return brand.shortName
  const name = brand.displayName || brand.name || 'YB'
  return name
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

export const FONT_OPTIONS = [
  { value: 'Fredoka', label: 'Fredoka (rounded, friendly)' },
  { value: 'Inter', label: 'Inter (clean, modern)' },
  { value: 'Poppins', label: 'Poppins (geometric)' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans' },
  { value: 'DM Sans', label: 'DM Sans (compact)' },
  { value: 'Manrope', label: 'Manrope (rounded)' },
  { value: 'Outfit', label: 'Outfit (display)' },
  { value: 'Sora', label: 'Sora (humanist)' },
]

// ============================================================================
// UI PRIMITIVES
// ============================================================================
export const Btn = ({ children, variant = 'secondary', size = 'md', icon: Icon, style, ...props }) => {
  const variants = {
    primary: { bg: T.primary, color: '#fff', border: T.primary },
    secondary: { bg: T.bgElev, color: T.text, border: T.border },
    ghost: { bg: 'transparent', color: T.textDim, border: 'transparent' },
    danger: { bg: 'transparent', color: T.danger, border: T.border },
    success: { bg: T.success, color: '#fff', border: T.success },
    ai: { bg: T.purple, color: '#fff', border: T.purple },
  }
  const sizes = {
    xs: { padding: '4px 8px', fontSize: 11 },
    sm: { padding: '6px 10px', fontSize: 12 },
    md: { padding: '8px 14px', fontSize: 12.5 },
    lg: { padding: '10px 16px', fontSize: 13 },
  }
  const v = variants[variant] || variants.secondary
  const s = sizes[size] || sizes.md
  return (
    <button
      {...props}
      style={{
        backgroundColor: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        borderRadius: 6,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 500,
        fontFamily: '"Inter", system-ui, sans-serif',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.005em',
        ...style,
      }}
    >
      {Icon && <Icon size={s.fontSize + 1} strokeWidth={2} />} {children}
    </button>
  )
}

export const Input = ({ mono, style, ...props }) => (
  <input
    {...props}
    style={{
      width: '100%',
      backgroundColor: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: '7px 10px',
      color: T.text,
      fontSize: 12.5,
      fontFamily: mono ? '"JetBrains Mono", monospace' : '"Inter", system-ui, sans-serif',
      outline: 'none',
      ...style,
    }}
  />
)

export const Textarea = ({ rows = 3, style, ...props }) => (
  <textarea
    {...props}
    rows={rows}
    style={{
      width: '100%',
      backgroundColor: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: '7px 10px',
      color: T.text,
      fontSize: 12.5,
      fontFamily: '"Inter", system-ui, sans-serif',
      outline: 'none',
      resize: 'vertical',
      ...style,
    }}
  />
)

export const Select = ({ children, style, ...props }) => (
  <select
    {...props}
    style={{
      width: '100%',
      backgroundColor: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: '7px 10px',
      color: T.text,
      fontSize: 12.5,
      fontFamily: '"Inter", system-ui, sans-serif',
      outline: 'none',
      appearance: 'none',
      backgroundImage:
        'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23a1a1aa\' d=\'M3 4.5L6 8l3-3.5\'/%3E%3C/svg%3E")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 10px center',
      paddingRight: 28,
      ...style,
    }}
  >
    {children}
  </select>
)

export const Label = ({ children, style }) => (
  <div
    style={{
      fontSize: 10,
      color: T.textMute,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 500,
      marginBottom: 6,
      ...style,
    }}
  >
    {children}
  </div>
)

export const Pill = ({ children, color = T.textMute, style }) => (
  <span
    style={{
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      backgroundColor: `${color}1f`,
      color,
      fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: '0.06em',
      display: 'inline-block',
      ...style,
    }}
  >
    {children}
  </span>
)

export const IconBtn = ({ icon: Icon, style, ...props }) => (
  <button
    {...props}
    style={{
      background: 'none',
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: 5,
      color: T.textMute,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.15s',
      ...style,
    }}
  >
    <Icon size={11} />
  </button>
)

export const ConfirmDialog = ({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', tertiaryText, onConfirm, onCancel, onTertiary }) => {
  if (!open) return null
  return (
    // `role`/`aria-modal`/`aria-label` so the dialog announces itself as one
    // rather than as an anonymous div — and so a keyboard or a test can find it
    // by what it IS. It covers the whole viewport and swallows clicks, which is
    // exactly the thing that most needs to be reachable by name.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-confirm-dialog=""
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          backgroundColor: T.bg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 22,
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: T.text, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.01em' }}>{title}</div>
            <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" size="md" onClick={onCancel}>{cancelText}</Btn>
          {tertiaryText && <Btn variant="secondary" size="md" onClick={onTertiary}>{tertiaryText}</Btn>}
          <Btn variant="primary" size="md" onClick={onConfirm}>{confirmText}</Btn>
        </div>
      </div>
    </div>
  )
}

// Generic Modal, ported verbatim from the artifact. Anchors to the top so it
// does not jump when content height changes (used by the Advertorials builder's
// Add Section / AI Edit / AI Create wizard dialogs).
export const Modal = ({ open, onClose, title, maxWidth = 720, footer, children }) => {
  if (!open) return null
  return (
    // Announced as a dialog for the same reason ConfirmDialog is: it covers the
    // viewport and swallows clicks, so it is the element that most needs to be
    // reachable by what it is rather than by where it sits.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      data-modal=""
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 150, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px 20px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8)' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMute, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}><X size={18} /></button>
        </div>
        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>{children}</div>
        {/* Footer */}
        {footer && (
          <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export const Toast = ({ message, type = 'info', onDismiss }) => {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => onDismiss?.(), 3000)
    return () => clearTimeout(t)
  }, [message, onDismiss])
  if (!message) return null
  const colors = { info: T.info, success: T.success, error: T.danger, warning: T.warning }
  const c = colors[type] || T.info
  return (
    <div
      // A refusal an operator must act on has to reach an operator who is not
      // watching the bottom of the screen, so failures are announced assertively
      // and everything else politely. `data-toast` is what the browser harnesses
      // wait on - they were already written against it, and without the hook the
      // wait silently matched nothing.
      data-toast=""
      data-toast-type={type}
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: T.bgElev2,
        border: `1px solid ${c}66`,
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 300,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
      <span style={{ fontSize: 13, color: T.text }}>{message}</span>
    </div>
  )
}

export const PageHeader = ({ title, subtitle, primaryAction, secondaryAction }) => (
  // Wraps at narrow widths so the action buttons drop under the title instead
  // of running off the right edge of a phone. Desktop has room and never wraps.
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
    <div>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 13, color: T.textMute, marginTop: 4 }}>{subtitle}</div>}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {secondaryAction}
      {primaryAction}
    </div>
  </div>
)

export const EmptyState = ({ icon: Icon, title, subtitle, action }) => (
  <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 12 }}>
    {Icon && (
      <div style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: T.bg, border: `1px solid ${T.border}`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={24} color={T.textMute} />
      </div>
    )}
    <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{title}</div>
    {subtitle && <div style={{ fontSize: 12, color: T.textMute, marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>{subtitle}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
)

export const TabBar = ({ active, onChange, tabs }) => (
  <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
    {tabs.map((t) => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        style={{
          padding: '10px 16px',
          backgroundColor: 'transparent',
          border: 'none',
          borderBottom: active === t.id ? `2px solid ${T.primary}` : '2px solid transparent',
          color: active === t.id ? T.text : T.textMute,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: '"Inter", system-ui, sans-serif',
          marginBottom: -1,
        }}
      >
        {t.label}
        {t.count !== undefined && <Pill color={active === t.id ? T.primary : T.textLow}>{t.count}</Pill>}
      </button>
    ))}
  </div>
)

export const TopBar = ({ crumbs, title, isPublished, onBack, onPreview, onPublish, actions }) => (
  <div
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 30,
      // minHeight + wrap rather than a fixed 56px single line: the action
      // cluster cannot shrink (nowrap buttons), so at phone widths a fixed
      // row pushed the whole document 78px past the viewport. Wrapping drops
      // the actions onto a second line instead; on desktop nothing wraps and
      // the bar renders exactly as before.
      minHeight: 56,
      backgroundColor: 'rgba(37,46,57,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.border}`,
      padding: '6px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 8,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      {onBack && <IconBtn icon={ChevronLeft} onClick={onBack} />}
      <div style={{ minWidth: 0 }}>
        {crumbs && <div style={{ fontSize: 10, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.08em' }}>{crumbs}</div>}
        {title && (
          <div style={{ fontSize: 14, color: T.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {title}
            {isPublished !== undefined && <Pill color={isPublished ? T.success : T.warning}>{isPublished ? 'LIVE' : 'DRAFT'}</Pill>}
          </div>
        )}
      </div>
    </div>
    {/* flexWrap here too: four buttons at phone width exceed the line on
        their own, and a cluster that cannot break re-creates the overflow
        the bar's own wrap just removed. */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {actions}
      {onPreview && <Btn variant="ghost" size="sm" icon={Eye} onClick={onPreview}>Preview</Btn>}
      {onPublish && <Btn variant={isPublished ? 'secondary' : 'primary'} size="sm" icon={isPublished ? PowerOff : Power} onClick={onPublish}>{isPublished ? 'Unpublish' : 'Publish'}</Btn>}
    </div>
  </div>
)
