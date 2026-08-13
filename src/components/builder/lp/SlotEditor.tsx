// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * Editing the copy of one of the twelve PORTED templates.
 *
 * Those templates are the design handoff's own markup, so they have no node
 * tree: `PortedTemplateView` offers no element tree by design and the section /
 * element inspector has nothing to point at. Their editable copy is SLOTS -
 * named, typed holes that `src/lib/lp-slots/` derives from the reference's own
 * structure - and this is the editor for them.
 *
 * Two rules the shape of this editor encodes:
 *
 *  1. AN EMPTY FIELD IS "USE THE TEMPLATE'S WORDING", NOT "SAY NOTHING".
 *     `composeTemplate` treats a MISSING key as inherit and a present empty
 *     string as an override to empty, so clearing a field deletes the key rather
 *     than storing ''. The reference's own copy is the placeholder, so what an
 *     unfilled field will render is on screen.
 *
 *  2. THE OVERRIDES ARE THE ONLY THING STORED. The literal markup between slots
 *     is a build asset, so a corrected template reaches every deployment at
 *     once and no row holds a private copy of the design.
 */

import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'

import { asSlotted } from '@/lib/lp-templates'
import { isSafeImageUrl, slotsBySection } from '@/lib/lp-slots/model'
import { resolveTemplate } from '@/lib/template-registry'
import { T, Input, Textarea, Label, Pill, IconBtn } from '../ui'

/** Roles whose copy is a paragraph rather than a line. */
const LONG_ROLES = new Set(['subheadline', 'section_body', 'card_body', 'faq_answer', 'disclaimer'])

const ROLE_LABELS = {
  eyebrow: 'Eyebrow',
  headline: 'Headline',
  subheadline: 'Subheadline',
  cta_label: 'Button label',
  trust_line: 'Trust line',
  section_headline: 'Section headline',
  section_body: 'Section body',
  card_title: 'Card title',
  card_body: 'Card body',
  faq_question: 'Question',
  faq_answer: 'Answer',
  disclaimer: 'Disclaimer',
  image_src: 'Image URL',
  image_alt: 'Image alt text',
  text: 'Text',
}

/**
 * The slot groups for a stored renderer id, or null when that renderer draws
 * from sections instead (the four legacy identity templates).
 *
 * Resolution goes through the registry rather than indexing the template map,
 * so an alias reaches its markup here exactly as it does on the public page.
 */
export const slotGroupsFor = (templateId) => {
  const res = resolveTemplate('lp', templateId)
  const ported = res.ok && res.template.kind === 'lp' ? res.template.template : null
  return ported ? slotsBySection(asSlotted(ported)) : null
}

/** How many slots in a group this template has its own words for. */
const changedCount = (group, overrides) =>
  group.slots.filter((s) => Object.prototype.hasOwnProperty.call(overrides, s.id)).length

/* --------------------------------------------------------------------- nav */

export const SlotSectionNav = ({ groups, selectedSection, onSelect, overrides }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Label>Sections</Label>
    {groups.map((g) => {
      const active = g.section === selectedSection
      const changed = changedCount(g, overrides)
      return (
        <button
          key={g.section}
          data-lp-slot-section={g.section}
          onClick={() => onSelect(g.section)}
          style={{
            textAlign: 'left',
            padding: '9px 10px',
            backgroundColor: active ? T.bgElev2 : T.bgElev,
            border: `1px solid ${active ? T.primary : T.border}`,
            borderRadius: 7,
            cursor: 'pointer',
            color: T.text,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9.5,
              color: T.textLow,
              flexShrink: 0,
              width: 18,
            }}
          >
            {String(g.section).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.label}
          </span>
          {changed > 0 && <Pill color={T.primary}>{changed}</Pill>}
        </button>
      )
    })}
  </div>
)

/* ------------------------------------------------------------------ fields */

const SlotField = ({ slot, value, onChange, onReset }) => {
  const overridden = value !== undefined
  const shown = overridden ? value : ''
  const isUrl = slot.role === 'image_src'
  const unsafe = isUrl && shown.trim() !== '' && !isSafeImageUrl(shown)
  const long = LONG_ROLES.has(slot.role)

  return (
    <div data-lp-slot={slot.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <Label style={{ marginBottom: 0 }}>{ROLE_LABELS[slot.role] || slot.role}</Label>
        {slot.required && <Pill color={T.warning}>REQUIRED</Pill>}
        {overridden && <Pill color={T.primary}>CHANGED</Pill>}
        <div style={{ flex: 1 }} />
        {overridden && (
          <IconBtn icon={RotateCcw} onClick={() => onReset(slot.id)} title="Back to the template's own wording" aria-label="Reset to template default" />
        )}
      </div>
      {long ? (
        <Textarea rows={3} value={shown} placeholder={slot.default} onChange={(e) => onChange(slot.id, e.target.value)} />
      ) : (
        <Input mono={isUrl} value={shown} placeholder={slot.default} onChange={(e) => onChange(slot.id, e.target.value)} />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, color: T.textLow }}>{slot.id}</span>
        {slot.maxChars > 0 && (
          <span style={{ fontSize: 10, color: shown.length > slot.maxChars * 1.4 ? T.warning : T.textLow }}>
            {shown.length} / about {slot.maxChars}
          </span>
        )}
        {!overridden && <span style={{ fontSize: 10, color: T.textLow }}>using the template&apos;s own wording</span>}
      </div>
      {unsafe && (
        <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>
          Not an allowed image URL. Use https://, a path starting with /, or a base64 image.
        </div>
      )}
    </div>
  )
}

export const SlotSectionFields = ({ group, overrides, onChange, onReset }) => {
  const slots = useMemo(() => group?.slots ?? [], [group])
  if (!group) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {slots.map((s) => (
        <SlotField
          key={s.id}
          slot={s}
          value={Object.prototype.hasOwnProperty.call(overrides, s.id) ? overrides[s.id] : undefined}
          onChange={onChange}
          onReset={onReset}
        />
      ))}
    </div>
  )
}
