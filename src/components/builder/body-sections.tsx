// @ts-nocheck
/* eslint-disable */
'use client'

// Ported verbatim: body section defs + editor used by quiz standalone pages
// (and brand default sections). Shared so the quiz deployment editor + preview
// renderer use one source.

import {
  Phone, ShieldCheck, Trophy, AlertCircle, Code2, CheckCircle2, Sparkles, Award, Star,
  Globe, Zap, ChevronUp, ChevronDown, Trash2, Plus, X, FileText,
} from 'lucide-react'
import { T, Btn, Input, Textarea, Select, Label, IconBtn } from './ui'

export const BODY_SECTION_DEFS = {
  CallCTA: { label: 'Call CTA', icon: Phone, color: T.info, desc: 'Phone number callout' },
  TrustBlock: { label: 'Trust Block', icon: ShieldCheck, color: T.success, desc: 'Headline + bullets + stats card' },
  RecentWins: { label: 'Recent Wins', icon: Trophy, color: T.warning, desc: 'Settlement cards with amounts' },
  Disclaimer: { label: 'Disclaimer', icon: AlertCircle, color: T.textMute, desc: 'Legal disclaimer text' },
  CustomHTML: { label: 'Custom HTML', icon: Code2, color: T.orange, desc: 'Raw HTML escape hatch' },
}

export const ICON_OPTIONS = { Trophy, CheckCircle2, Sparkles, ShieldCheck, Award, Star, Phone, Globe, Zap }

export const BodySectionEditor = ({ section, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
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

export const AddBodySectionPicker = ({ onPick, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
      <div style={{ fontSize: 16, color: T.text, fontWeight: 600, marginBottom: 14 }}>Add Body Section</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {Object.entries(BODY_SECTION_DEFS).map(([type, def]) => {
          const Icon = def.icon
          return (
            <button key={type} onClick={() => onPick(type)} style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text, display: 'flex', flexDirection: 'column', gap: 6 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = def.color }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border }}>
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
