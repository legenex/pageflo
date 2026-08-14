// @ts-nocheck
'use client'

import { useState } from 'react'
import { Palette, Check, X, Loader2, AlertTriangle } from 'lucide-react'
import { T } from '../ui'
import { saveBrandIdentity } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'
import { settleAction, failureMessage } from '../server-action'

/**
 * Edit the brand without leaving the builder you are already in.
 *
 * The colours a landing page or a quiz wears come from the Site's brand
 * identity, which lived on one screen. So changing a brand colour meant leaving
 * the thing you were looking at, editing it somewhere else, and coming back to
 * see whether it worked. That is the wrong shape for a decision you make BY
 * looking at the page.
 *
 * This writes to the same record through the same action, so it is not a second
 * store that can disagree with the first: an edit here is an edit to the brand,
 * and every other deployment of that brand changes with it. That is the point,
 * and it is also why the panel says so out loud - a colour changed from inside
 * one landing page is not scoped to that landing page, and someone who thinks
 * it is will be surprised later.
 */

const FIELDS = [
  { key: 'primary', label: 'Primary / CTA', hint: 'Buttons and highlights' },
  { key: 'accent', label: 'Accent', hint: 'Secondary emphasis' },
  { key: 'background', label: 'Page background', hint: 'The ground the page sits on' },
  { key: 'cardBg', label: 'Card background', hint: 'Panels sitting on the page' },
]

const isHex = (v) => typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())

export function BrandQuickEdit({ brand, onSaved, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)

  if (!brand || brand.siteId == null) return null

  const start = () => {
    setDraft({
      ...(brand.colors || {}),
      __headlineFont: brand.typography?.headlineFont || '',
      __bodyFont: brand.typography?.bodyFont || '',
    })
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    const bad = FIELDS.filter((f) => draft[f.key] && !isHex(draft[f.key]))
    if (bad.length) {
      setError(`${bad.map((f) => f.label).join(' and ')} must be a hex colour like #0B1F3A.`)
      return
    }
    setSaving(true)
    setError(null)

    // The whole identity is sent, not just the colours, because the action
    // replaces the record rather than merging into it. Sending a partial object
    // would quietly drop the brand's contact details and legal URLs.
    const next = {
      ...brand,
      colors: { ...(brand.colors || {}), ...Object.fromEntries(FIELDS.map((f) => [f.key, draft[f.key]]).filter(([, v]) => v)) },
      typography: {
        ...(brand.typography || {}),
        ...(draft.__headlineFont ? { headlineFont: draft.__headlineFont } : {}),
        ...(draft.__bodyFont ? { bodyFont: draft.__bodyFont } : {}),
      },
    }

    const res = await settleAction(saveBrandIdentity({ siteId: brand.siteId, brand: next }))
    setSaving(false)
    if (!res.ok) {
      setError(failureMessage(res))
      return
    }
    setOpen(false)
    // Handed back so the preview re-renders against the new brand immediately.
    // Without it the save is invisible until a reload, which reads as a save
    // that did not work.
    onSaved?.(next)
  }

  const swatch = (v) => (isHex(v) ? v : 'transparent')

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => (open ? setOpen(false) : start())}
        title="Edit this brand's colours without leaving the builder"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
          backgroundColor: T.bgElev, border: `1px solid ${open ? T.primary : T.border}`,
          borderRadius: 6, color: T.text, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Palette size={13} />
        Brand colours
        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 2 }}>
          {['primary', 'accent', 'background'].map((k) => (
            <span key={k} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: swatch(brand.colors?.[k]), border: `1px solid ${T.border}` }} />
          ))}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 60, width: 330,
            backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10,
            boxShadow: '0 18px 48px -12px rgba(0,0,0,0.6)', padding: 14,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, marginBottom: 2 }}>
            {brand.displayName || brand.name}
          </div>
          <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.45, marginBottom: 12 }}>
            This is the brand itself, not this page. Every landing page, quiz and site using it changes too.
          </div>

          {FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: 9 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMute, marginBottom: 3 }}>
                {f.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input
                  type="color"
                  value={isHex(draft?.[f.key]) ? draft[f.key] : '#000000'}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  style={{ width: 30, height: 26, padding: 0, border: `1px solid ${T.border}`, borderRadius: 4, background: 'none', cursor: 'pointer' }}
                />
                <input
                  value={draft?.[f.key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  placeholder="#0B1F3A"
                  style={{ flex: 1, padding: '5px 8px', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}
                />
              </div>
              <div style={{ fontSize: 10, color: T.textLow, marginTop: 2 }}>{f.hint}</div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
            {[['__headlineFont', 'Heading font'], ['__bodyFont', 'Body font']].map(([k, label]) => (
              <div key={k} style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMute, marginBottom: 3 }}>{label}</div>
                <input
                  value={draft?.[k] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  placeholder="Inter"
                  style={{ width: '100%', padding: '5px 8px', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 12 }}
                />
              </div>
            ))}
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 6, marginTop: 11, padding: 8, borderRadius: 6, backgroundColor: `${T.danger}18`, border: `1px solid ${T.danger}55` }}>
              <AlertTriangle size={13} color={T.danger} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11.5, color: T.text, lineHeight: 1.4 }}>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 7, marginTop: 13 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', backgroundColor: T.primary, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? <Loader2 size={13} className="lo-spin" /> : <Check size={13} />}
              {saving ? 'Saving' : 'Save to brand'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ padding: '7px 10px', backgroundColor: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, color: T.textMute, fontSize: 12, cursor: 'pointer' }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
