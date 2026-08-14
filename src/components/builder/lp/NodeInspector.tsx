// @ts-nocheck
'use client'

/**
 * The editor for whatever node is selected.
 *
 * It lives in the right pane rather than in a modal, and that is a deliberate
 * change of shape. When the smallest editable thing was a section, a modal per
 * edit was tolerable. When it is a single line of a checklist, a dialog that
 * covers the page you are editing between every change is the wrong tool: you
 * cannot see what you are doing. The inspector edits in place, beside the
 * preview, and the preview repaints as you type.
 *
 * Which fields appear is read from the node's spec rather than written out per
 * type, so adding an element type to the model gives it an editor for free and
 * the two cannot disagree about what a `step` holds.
 */

import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { T, Btn, Input, Textarea, Select, Label, IconBtn } from '../ui'
import { elementSpec, sectionSpec, sectionPropFields, TONES } from '@/lib/lp-nodes/model'
import { surfaceForSection } from '@/lib/lp-nodes/surface'
import { contrastRatio } from '@/lib/builder/page-lint'
import { ICON_NAMES, iconFor, treeIcon } from './nodes/icons'
import { aiWriteSectionNodes } from '@/app/(app)/admin/(top)/landing-pages/actions'
import { settleAction, failureMessage } from '../server-action'

const Field = ({ field, value, onChange }) => {
  if (field.kind === 'textarea') {
    return (
      <div>
        <Label>{field.label}</Label>
        <Textarea rows={3} value={value ?? ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }
  if (field.kind === 'select') {
    return (
      <div>
        <Label>{field.label}</Label>
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </div>
    )
  }
  if (field.kind === 'number') {
    return (
      <div>
        <Label>{field.label}</Label>
        <Input
          type="number"
          value={value ?? ''}
          placeholder={field.placeholder || ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>
    )
  }
  if (field.kind === 'icon') {
    return (
      <div>
        <Label>{field.label}</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 132, overflowY: 'auto', padding: 6, border: `1px solid ${T.border}`, borderRadius: 6, backgroundColor: T.bg }}>
          <button
            onClick={() => onChange('')}
            title="No icon"
            style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'pointer', backgroundColor: !value ? T.primarySoft : 'transparent', border: `1px solid ${!value ? T.primary : T.border}`, color: T.textMute, fontSize: 15, lineHeight: 1 }}
          >
            {'×'}
          </button>
          {ICON_NAMES.map((name) => {
            const Icon = iconFor(name)
            const on = value === name
            return (
              <button
                key={name}
                onClick={() => onChange(name)}
                title={name}
                style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'pointer', backgroundColor: on ? T.primarySoft : 'transparent', border: `1px solid ${on ? T.primary : T.border}` }}
              >
                <Icon size={14} color={on ? T.primary : T.textMute} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div>
      <Label>{field.label}</Label>
      <Input value={value ?? ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/**
 * Free colour fields, with a warning rather than a rule.
 *
 * These override the ground the tone chose. The contrast figure is live and
 * warns below 4.5 to 1 without blocking, because the judgement is the
 * operator's and a tool that silently corrects a colour someone picked on
 * purpose is worse than one that says plainly what they have done. The
 * protection that stays is narrow: an unset field shows the colour the section
 * is ACTUALLY painted with, so a swatch never reads as black when it is not,
 * and changing a background without naming a text colour re-derives the text
 * downstream rather than carrying the old one onto a new ground.
 */
const ColorPanel = ({ section, palette, onChange }) => {
  const chosen = section.colors || {}
  const painted = surfaceForSection({ ...section, colors: undefined }, palette)
  const inherited = { bg: painted.bg, text: painted.text, surface: painted.card, accent: painted.accentFill }
  const effective = (k) => chosen[k] || inherited[k] || '#000000'

  const set = (k, v) => {
    const next = { ...chosen }
    if (v) next[k] = v
    else delete next[k]
    onChange(Object.keys(next).length ? next : undefined)
  }

  const ratio = contrastRatio(effective('text'), effective('bg'))
  const bad = ratio !== null && ratio < 4.5

  const FIELDS = [
    { key: 'bg', label: 'Background' },
    { key: 'text', label: 'Text' },
    { key: 'surface', label: 'Cards' },
    { key: 'accent', label: 'Accent' },
  ]

  return (
    <div style={{ padding: 12, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>Colours</span>
        {Object.keys(chosen).length > 0 ? (
          <button onClick={() => onChange(undefined)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, cursor: 'pointer' }}>
            Back to the brand
          </button>
        ) : (
          <span style={{ fontSize: 10.5, color: T.textLow }}>All from the brand</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {FIELDS.map((f) => {
          const overridden = Boolean(chosen[f.key])
          const val = effective(f.key)
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <label style={{ position: 'relative', width: 30, height: 30, borderRadius: 6, flexShrink: 0, cursor: 'pointer', backgroundColor: val, border: `1px solid ${overridden ? T.primary : T.border}`, boxShadow: overridden ? `0 0 0 2px ${T.primary}33` : 'none' }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000'} onChange={(e) => set(f.key, e.target.value)} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
              </label>
              <div style={{ width: 62, flexShrink: 0, fontSize: 11.5, color: T.text }}>{f.label}</div>
              <input
                value={chosen[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={inherited[f.key] || 'inherited'}
                style={{ flex: 1, minWidth: 0, padding: '5px 8px', backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: overridden ? T.text : T.textLow }}
              />
              <button
                onClick={() => set(f.key, null)}
                disabled={!overridden}
                title="Back to the brand colour"
                style={{ width: 50, flexShrink: 0, padding: '4px 0', backgroundColor: 'transparent', border: `1px solid ${overridden ? T.border : 'transparent'}`, borderRadius: 5, color: overridden ? T.textMute : T.textLow, fontSize: 10, cursor: overridden ? 'pointer' : 'default' }}
              >
                {overridden ? 'Reset' : 'Auto'}
              </button>
            </div>
          )
        })}
      </div>
      {ratio !== null ? (
        <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 5, fontSize: 10.5, lineHeight: 1.45, backgroundColor: bad ? `${T.danger}18` : `${T.success}12`, border: `1px solid ${bad ? `${T.danger}55` : `${T.success}33`}`, color: bad ? T.danger : T.textMute }}>
          Text on background is {ratio.toFixed(2)}:1{bad ? '. Body copy needs 4.5:1, so some readers will struggle with this.' : ', which passes for body copy.'}
        </div>
      ) : null}
    </div>
  )
}

/** Write a whole section's nodes in one pass, ids as the contract. */
const SectionWriter = ({ section, onApply }) => {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setBusy(true); setError(null)
    const elements = section.elements
      .map((el) => {
        const spec = elementSpec(el.type)
        if (!spec || spec.fields.length === 0) return null
        const writable = spec.fields.filter((f) => f.kind === 'text' || f.kind === 'textarea')
        if (writable.length === 0) return null
        const current = {}
        for (const f of writable) if (typeof el[f.key] === 'string' && el[f.key]) current[f.key] = el[f.key]
        return { id: el.id, type: el.type, fields: writable.map((f) => f.key), current }
      })
      .filter(Boolean)

    const res = await settleAction(aiWriteSectionNodes({ sectionType: section.type, instruction, elements }))
    if (!res.ok) setError(failureMessage(res))
    else onApply(res.elements)
    setBusy(false)
  }

  return (
    <div style={{ padding: 12, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Sparkles size={12} color={T.purple} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>Write this section with Claude</span>
      </div>
      <Textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="eg Truck accidents. Lead with the deadline, keep it calm." />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn variant="secondary" size="sm" icon={busy ? Loader2 : Sparkles} onClick={run} disabled={busy}>{busy ? 'Writing...' : 'Write'}</Btn>
      </div>
      {error ? <div style={{ marginTop: 8, padding: 8, backgroundColor: `${T.danger}11`, border: `1px solid ${T.danger}66`, borderRadius: 6, fontSize: 11, color: T.danger }}>{error}</div> : null}
      <div style={{ fontSize: 10, color: T.textLow, marginTop: 8, lineHeight: 1.5 }}>
        It fills the elements that are here. It cannot add, remove or reorder them.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export const NodeInspector = ({ section, element, palette, splits, onChangeSection, onChangeElement, onApplyWrite, onDelete, onClose }) => {
  const [tab, setTab] = useState('content')
  useEffect(() => { setTab('content') }, [element?.id, section?.id])

  if (!section) {
    return (
      <div style={{ padding: 16, border: `1px dashed ${T.border}`, borderRadius: 8, fontSize: 11.5, color: T.textMute, lineHeight: 1.6 }}>
        Click anything on the page, or a row in the tree, to edit it. Every heading, button, step and line is its own thing.
      </div>
    )
  }

  const editingElement = Boolean(element)
  const spec = editingElement ? elementSpec(element.type) : sectionSpec(section.type)
  const Icon = treeIcon(spec?.icon)
  const title = editingElement ? spec?.name || element.type : spec?.name || section.type

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} color={T.primary} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ fontSize: 10.5, color: T.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spec?.desc || ''}</div>
        </div>
        <IconBtn icon={X} onClick={onClose} aria-label="Close the inspector" />
      </div>

      {editingElement ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {spec?.fields?.length ? (
            spec.fields.map((f) => (
              <Field key={f.key} field={f} value={element[f.key]} onChange={(v) => onChangeElement({ ...element, [f.key]: v })} />
            ))
          ) : (
            <div style={{ fontSize: 11.5, color: T.textMute }}>This one has nothing to fill in. It is a shape.</div>
          )}

          {splits ? (
            <div>
              <Label>Column</Label>
              <Select value={element.slot === 'aside' ? 'aside' : 'lead'} onChange={(e) => onChangeElement({ ...element, slot: e.target.value === 'aside' ? 'aside' : undefined })}>
                <option value="lead">First column</option>
                <option value="aside">Second column</option>
              </Select>
              <div style={{ fontSize: 10, color: T.textLow, marginTop: 5, lineHeight: 1.5 }}>
                Anything in the second column turns this section into a split.
              </div>
            </div>
          ) : null}

          <Btn variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(element.id)}>Delete this element</Btn>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
            {[{ id: 'content', label: 'Layout' }, { id: 'colour', label: 'Colours' }, { id: 'ai', label: 'Claude' }].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ padding: '7px 11px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${T.primary}` : '2px solid transparent', color: tab === t.id ? T.text : T.textMute, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', marginBottom: -1, fontFamily: '"Inter", system-ui, sans-serif' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'content' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sectionPropFields(section.type).map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={f.key === 'tone' ? section.tone ?? 'default' : section.props?.[f.key] ?? ''}
                  onChange={(v) =>
                    f.key === 'tone'
                      ? onChangeSection({ ...section, tone: v })
                      : onChangeSection({ ...section, props: { ...(section.props || {}), [f.key]: v } })
                  }
                />
              ))}
              <div style={{ fontSize: 10, color: T.textLow, lineHeight: 1.55, paddingTop: 4 }}>
                {TONES.find((t) => t.id === (section.tone || 'default'))?.desc}, taken from the brand this page is previewed as. The shape of the section follows what is inside it: a run of the same kind of element becomes a row.
              </div>
              <Btn variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(section.id)}>Delete this section</Btn>
            </div>
          ) : null}

          {tab === 'colour' ? (
            <ColorPanel section={section} palette={palette} onChange={(colors) => onChangeSection({ ...section, colors })} />
          ) : null}

          {tab === 'ai' ? <SectionWriter section={section} onApply={onApplyWrite} /> : null}
        </>
      )}
    </div>
  )
}
