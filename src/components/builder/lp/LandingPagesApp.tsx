// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * Landing Pages: TEMPLATES and DEPLOYMENTS, and nothing else.
 *
 * The module used to have three tabs. `Pages` listed rows the product called
 * pages but which every brand deployed, `Templates` listed the twelve code
 * renderers and could only be looked at, and `Deployments` picked from the first
 * list. Two names for one idea, and the only one an operator could act on was
 * the wrong one: a deployment picked a "page", so the twelve designs the
 * business bought were unreachable.
 *
 * There is one library now. `Templates` is the management surface for the
 * records in `src/lib/template-records/`, and `Deployments` binds one of those
 * records to a brand, a domain and a path. Everything on either tab reaches the
 * database through the actions in `../../app/(app)/admin/(top)/template-actions.ts`
 * and `landing-pages/actions.ts`; nothing here reads the code registry's
 * catalogue except to answer "what draws this row".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Rocket, Eye, Edit3, Sparkles, X, Plus, Loader2, Palette, ChevronRight, Plug,
  Power, PowerOff, Trash2,
} from 'lucide-react'

import { selectableOptions } from '@/lib/selectable'
import {
  T, Btn, Input, Textarea, Select, Label, Pill, IconBtn, ConfirmDialog, Toast,
  PageHeader, EmptyState, TopBar, brandShortName,
} from '../ui'
import {
  TEMPLATES, ANGLES, LivePreview, PREVIEW_BRAND_DEFAULT,
  templateFor, templatePreviewSurface, templatePalette, GALLERY_TEMPLATES, SKELETON_TEMPLATES,
} from './render'
import { BrandQuickEdit } from '../brand/BrandQuickEdit'
import { NodeTree } from './NodeTree'
import { NodeInspector } from './NodeInspector'
import { SectionHeading } from './SectionHeading'
import { TemplateListView } from './TemplateListView'
import { LPDeploymentEditor } from './LPDeploymentEditor'
import { SlotSectionFields, SlotSectionNav, slotGroupsFor } from './SlotEditor'
import { treeIcon } from './nodes/icons'
import {
  SECTION_SPECS, SECTION_TYPES as NODE_SECTION_TYPES, newNodeId, sectionSpec,
} from '@/lib/lp-nodes/model'
import { toNodeSections } from '@/lib/lp-nodes/from-legacy'
import { instantiateSkeleton } from '@/lib/lp-skeletons'
import { saveDeployment, deleteDeployment, aiWriteSectionNodes } from '@/app/(app)/admin/(top)/landing-pages/actions'
import {
  createLpTemplate, cloneLpTemplate, saveLpTemplate, setLpTemplateEnabled, deleteLpTemplate,
} from '@/app/(app)/admin/(top)/template-actions'
import { elementSpec } from '@/lib/lp-nodes/model'

// ============================================================================
// TOP-LEVEL TAB BAR
// ============================================================================
/**
 * A local copy of `TabBar` for one reason: a stable per-tab test hook.
 *
 * The shared component takes no attributes, and a suite that has to find a tab
 * by its visible label breaks the first time the label is reworded. The styling
 * is deliberately identical.
 */
const LpTabBar = ({ active, onChange, tabs }) => (
  <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
    {tabs.map((t) => (
      <button
        key={t.id}
        data-lp-tab={t.id}
        aria-current={active === t.id ? 'true' : undefined}
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

// ============================================================================
// LP DEPLOYMENT LIST VIEW
// ============================================================================
const LPDeploymentListView = ({ deployments, templates, brands, quizzes, domains, onOpen, onDelete, onToggleStatus, onPreview, onRename }) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  if (deployments.length === 0) {
    return <EmptyState icon={Plug} title="No deployments yet" subtitle="A deployment maps a landing page template to a brand and domain. The same template can be deployed many times, to many brands." />
  }
  const startRename = (dep) => { setRenamingId(dep.id); setRenameDraft(dep.name || '') }
  const commitRename = () => { if (renamingId) { onRename(renamingId, renameDraft.trim()); setRenamingId(null) } }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {deployments.map((dep) => {
        const template = templates.find((t) => t.id === dep.landingPageId)
        const brand = brands.find((b) => b.id === dep.brandId)
        const orphaned = !!dep.brandId && !brand
        // The flow this page runs. `quiz_deployment_id` is the older pointer at
        // a standalone quiz page and is only reported, never chosen, here.
        const quiz = quizzes.find((q) => q.id === dep.quizId)
        const refDomain = dep.domainId ? domains.find((d) => d.id === dep.domainId) : null
        const orphanedDomain = !!dep.domainId && !refDomain
        const domainStr = refDomain?.domain || dep.domain || ''
        const url = domainStr ? `https://${domainStr}${dep.path || ''}` : `https://preview.legenex.com/lp/${dep.id}`
        const depName = dep.name || (template ? `${template.name} · ${brand?.displayName || 'No brand'}` : 'Untitled deployment')
        const primary = brand?.colors?.primary
        const background = brand?.colors?.background
        return (
          <div key={dep.id} style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 9, background: primary ? `linear-gradient(135deg, ${primary}, ${background || primary})` : T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0, overflow: 'hidden' }}>
              {brand?.faviconUrl ? <img loading="lazy" decoding="async" src={brand.faviconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : brand ? brandShortName(brand) : <Rocket size={18} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                {renamingId === dep.id ? (
                  <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }} style={{ flex: 1, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                ) : (
                  <span onClick={(e) => { e.stopPropagation(); startRename(dep) }} style={{ fontSize: 13, fontWeight: 600, color: T.text, cursor: 'text' }} title="Click to rename">{depName}</span>
                )}
                <Pill color={dep.status === 'live' ? T.success : dep.status === 'paused' ? T.warning : T.textLow}>{(dep.status || 'draft').toUpperCase()}</Pill>
                {!domainStr && <Pill color={T.info}>PREVIEW URL</Pill>}
                {!template && <Pill color={T.danger}>Template missing, pick one to fix</Pill>}
                {template?.rendererError && <Pill color={T.danger}>Template renderer broken</Pill>}
                {orphaned && <Pill color={T.warning}>Brand missing, select a new brand to fix</Pill>}
                {orphanedDomain && <Pill color={T.warning}>Domain missing, falling back to preview URL</Pill>}
              </div>
              <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
              <div style={{ fontSize: 10, color: T.textLow, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>Template: {template?.name || 'unknown'}</span>
                <span>{'·'}</span>
                <span>{brand?.displayName || 'No brand'}</span>
                <span>{'·'}</span>
                <span>Quiz: {quiz?.name || (dep.quizDeploymentId ? `legacy deployment ${dep.quizDeploymentId}` : 'none')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview(dep)} aria-label="Preview deployment">Preview</Btn>
              <Btn variant="secondary" size="sm" icon={Edit3} onClick={() => onOpen(dep)} aria-label="Edit deployment">Edit</Btn>
              <IconBtn icon={dep.status === 'live' ? PowerOff : Power} onClick={() => onToggleStatus(dep.id)} aria-label={dep.status === 'live' ? 'Pause deployment' : 'Publish deployment'} />
              <IconBtn icon={Trash2} onClick={() => onDelete(dep.id)} style={{ color: T.danger }} aria-label="Delete deployment" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// ADD SECTION MODAL (legacy identity templates only)
// ============================================================================
const AddSectionModal = ({ open, onClose, onAdd }) => {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 22, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Add a section</div>
            <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>A section is a shape, not a subject. What it looks like follows what you put in it.</div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {NODE_SECTION_TYPES.map((id) => {
            const s = SECTION_SPECS[id]
            const Icon = treeIcon(s.icon)
            return (
              <button key={id} onClick={() => { onAdd(id); onClose() }} style={{ textAlign: 'left', padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={15} color={T.primary} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: T.textMute, marginTop: 3, lineHeight: 1.4 }}>{s.desc}</div>
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
// RENDERER PICKER
// ============================================================================
/**
 * Which CODE draws this template row.
 *
 * Deliberately not the record gallery. The gallery answers "which template
 * should this deployment use", and its cards are rows; this answers "which of
 * the shipped designs is this row", and its cards are renderers. Conflating them
 * is how the module ended up with a library nothing could select.
 *
 * The four legacy identity renderers are offered separately and last. They are
 * the only ones whose copy travels as nodes, which is why they are still here at
 * all - and why a row on one is edited with the element tree rather than slots.
 */
const RendererPickerModal = ({ open, onClose, currentTemplateId, onPick }) => {
  if (!open) return null
  const legacy = TEMPLATES.filter((t) => !t.ported)
  const card = (t) => {
    const isCurrent = t.id === currentTemplateId
    const s = templatePreviewSurface(t, null)
    return (
      <button
        key={t.id}
        data-renderer={t.id}
        onClick={() => { if (!isCurrent) onPick(t.id); onClose() }}
        style={{ textAlign: 'left', padding: 0, backgroundColor: T.bgElev, border: `2px solid ${isCurrent ? T.primary : T.border}`, borderRadius: 10, cursor: 'pointer', overflow: 'hidden', color: T.text }}
      >
        <div style={{ height: 44, backgroundColor: s.bg, display: 'flex', alignItems: 'center', paddingLeft: 12, gap: 6 }}>
          {[s.accentFill, s.card, s.text].map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c, border: `1px solid ${s.line}` }} />)}
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
            {t.code && <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{t.code}</span>}
            {isCurrent && <Pill color={T.primary}>CURRENT</Pill>}
          </div>
          <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.45 }}>{t.blurb}</div>
        </div>
      </button>
    )
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1080, maxHeight: '90vh', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 22, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Which design draws this template</div>
            <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>Changing it replaces the layout. Copy written against the old design does not carry over, because a slot belongs to the design it was cut from.</div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>
          <SectionHeading eyebrow="Ported" title={`The ${GALLERY_TEMPLATES.length} shipped designs`} hint="Pixel ports of the design handoff. Their copy is edited as slots." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12, marginBottom: 26 }}>
            {GALLERY_TEMPLATES.map(card)}
          </div>
          <SectionHeading eyebrow="Legacy" title="Identity templates" hint="Kept resolvable for rows already built on them. Their copy is an element tree, not slots." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
            {legacy.map(card)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// AI NEW TEMPLATE WIZARD
// ============================================================================
/**
 * A new template: the design's skeleton, filled section by section.
 *
 * The structure comes from the skeleton and the model only writes into it, one
 * call per section, ids as the contract. It cannot add a section, remove one or
 * reorder anything, which is what keeps "generated with Claude" and "built from
 * design B" the same page rather than two.
 *
 * Only designs with a skeleton can be chosen here, because there is nothing to
 * fill in otherwise. The twelve ported designs carry their copy in slots rather
 * than nodes, so they are edited rather than generated; offering them and
 * quietly substituting another design's shape is the failure this guards.
 */
const AINewLPWizard = ({ open, onClose, onCreate }) => {
  const withStructure = SKELETON_TEMPLATES
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState(withStructure[0]?.id || TEMPLATES[0].id)
  const [angle, setAngle] = useState('pain')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setStep(1); setName(''); setTemplateId(withStructure[0]?.id || TEMPLATES[0].id)
    setAngle('pain'); setNotes(''); setBusy(false); setProgress(0); setError(null)
  }, [open])
  if (!open) return null

  const template = templateFor(templateId)

  const generate = async () => {
    if (!template.skeleton) { setError('That design has no structure yet.'); return }
    setBusy(true); setError(null); setProgress(0)
    try {
      const sections = instantiateSkeleton(template.skeleton)
      const angleLabel = ANGLES.find((a) => a.id === angle)?.label || angle
      const brief = [
        `Page angle: ${angleLabel}. ${ANGLES.find((a) => a.id === angle)?.desc || ''}`,
        `Brand voice: ${template.identity.voice.join(' ')}`,
        notes ? `Operator notes: ${notes}` : '',
        'This is one section of a longer page, so do not restate the whole offer in it.',
      ].filter(Boolean).join('\n')

      let done = 0
      const written = await Promise.all(
        sections.map(async (section) => {
          const elements = section.elements
            .map((el) => {
              const spec = elementSpec(el.type)
              if (!spec) return null
              const writable = spec.fields.filter((f) => f.kind === 'text' || f.kind === 'textarea')
              return writable.length ? { id: el.id, type: el.type, fields: writable.map((f) => f.key), current: {} } : null
            })
            .filter(Boolean)
          if (elements.length === 0) { done += 1; setProgress(done); return section }
          const res = await aiWriteSectionNodes({ sectionType: section.type, instruction: brief, elements })
          done += 1; setProgress(done)
          if (!res.ok) return section
          const patch = new Map(res.elements.map((e) => [e.id, e.fields]))
          return { ...section, elements: section.elements.map((el) => (patch.has(el.id) ? { ...el, ...patch.get(el.id) } : el)) }
        }),
      )

      await onCreate({
        name: name || `${angleLabel} template`,
        slug: (name || 'new-template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        templateId, angle, sections: written,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const stepCount = 4
  return (
    <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: 22, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} color={T.purple} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>New template with Claude</div>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 2 }}>Step {step} of {stepCount}</div>
            </div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ padding: 22, minHeight: 280 }}>
          {step === 1 && (
            <div>
              <Label>Template name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MVA Truck Urgency" autoFocus />
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 10 }}>This template will be brandless. You attach brands when you deploy it.</div>
            </div>
          )}
          {step === 2 && (
            <div>
              <Label>Angle</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {ANGLES.map((a) => (
                  <button key={a.id} onClick={() => setAngle(a.id)} style={{ textAlign: 'left', padding: 14, backgroundColor: T.bgElev, border: `2px solid ${angle === a.id ? T.primary : T.border}`, borderRadius: 10, cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: T.textMute, marginTop: 4, lineHeight: 1.45 }}>{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <Label>Design</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {SKELETON_TEMPLATES.map((t) => {
                  const s = templatePreviewSurface(t, null)
                  const usable = Boolean(t.skeleton)
                  return (
                    <button
                      key={t.id}
                      onClick={() => usable && setTemplateId(t.id)}
                      disabled={!usable}
                      style={{ textAlign: 'left', padding: 0, backgroundColor: T.bgElev, border: `2px solid ${templateId === t.id ? T.primary : T.border}`, borderRadius: 10, cursor: usable ? 'pointer' : 'not-allowed', overflow: 'hidden', opacity: usable ? 1 : 0.5 }}
                    >
                      <div style={{ height: 46, backgroundColor: s.bg, display: 'flex', alignItems: 'center', paddingLeft: 12, gap: 6 }}>
                        {[s.accentFill, s.card, s.text].map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c, border: `1px solid ${s.line}` }} />)}
                      </div>
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: usable ? T.textMute : T.warning, marginTop: 3, lineHeight: 1.4 }}>
                          {usable ? t.structure : 'No structure built yet'}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {step === 4 && (
            <div>
              <Label>Operator notes (optional)</Label>
              <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="eg Focus on truck accidents specifically. Mention statute of limitations." />
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 10, lineHeight: 1.55 }}>
                Claude fills the {template.skeleton?.sections.length || 0} sections of {template.name}, one call each, writing only into the elements that are there. It cannot change the structure.
              </div>
              {busy && (
                <div style={{ marginTop: 12, fontSize: 11.5, color: T.textMute }}>
                  Writing section {Math.min(progress + 1, template.skeleton?.sections.length || 1)} of {template.skeleton?.sections.length || 0}...
                </div>
              )}
              {error && <div style={{ marginTop: 12, padding: 10, backgroundColor: `${T.danger}11`, border: `1px solid ${T.danger}66`, borderRadius: 6, fontSize: 12, color: T.danger }}>{error}</div>}
            </div>
          )}
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <Btn variant="ghost" size="md" onClick={() => (step > 1 ? setStep(step - 1) : onClose())} disabled={busy}>{step > 1 ? 'Back' : 'Cancel'}</Btn>
          {step < stepCount ? (
            <Btn variant="primary" size="md" onClick={() => setStep(step + 1)} disabled={step === 1 && !name.trim()}>Next {'→'}</Btn>
          ) : (
            <Btn variant="primary" size="md" icon={busy ? Loader2 : Sparkles} onClick={generate} disabled={busy}>{busy ? 'Writing...' : 'Generate with Claude'}</Btn>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TEMPLATE EDITOR (3-pane)
// ============================================================================
/**
 * The three-pane builder, editing a TEMPLATE rather than a deployment.
 *
 * Left is navigation and the template's own settings, centre is a live render,
 * right is the inspector for whatever the left pane selected. Which inspector
 * depends on the renderer, and that is not a preference:
 *
 *  - the twelve PORTED designs have no node tree - `PortedTemplateView` offers
 *    no element affordances by design - so their copy is edited as SLOTS,
 *    grouped by the section labels the reference itself carries;
 *  - the four LEGACY identity designs keep the element tree, because their copy
 *    genuinely is a tree of nodes.
 *
 * Nothing brand-specific is ever written here. See the preview picker below.
 */
export const LandingPageBuilder = ({ template, brands, onBrandSaved, quizzes, onBack, onPatch, onToggleEnabled, onPreview }) => {
  const [selectedId, setSelectedId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [rendererOpen, setRendererOpen] = useState(false)
  const [slotSection, setSlotSection] = useState(null)
  // PREVIEW ONLY. This picker never writes a brand colour, a brand phone number
  // or a line of brand copy into the template record: a template is brandless by
  // construction and the brand is applied at deploy time. It exists so an author
  // can see what a real client's visitor gets before publishing.
  const [previewBrandId, setPreviewBrandId] = useState(null)
  const [previewQuizId, setPreviewQuizId] = useState(null)
  const [slotDiag, setSlotDiag] = useState(null)

  const previewBrand = brands.find((b) => b.id === previewBrandId) || PREVIEW_BRAND_DEFAULT
  const previewQuiz = quizzes.find((q) => q.id === previewQuizId) || null
  const renderer = templateFor(template.templateId)

  const slotGroups = useMemo(() => slotGroupsFor(template.templateId), [template.templateId])
  const usesSlots = Boolean(slotGroups)
  const overrides = template.slotOverrides || {}
  const overridesKey = useMemo(() => JSON.stringify(overrides), [overrides])

  // Reset the section selection when the renderer changes: slot section numbers
  // belong to the design they were cut from.
  useEffect(() => { setSlotSection(null); setSelectedId(null) }, [template.id, template.templateId])

  const activeSection = slotGroups ? (slotGroups.some((g) => g.section === slotSection) ? slotSection : slotGroups[0]?.section) : null
  const activeGroup = slotGroups ? slotGroups.find((g) => g.section === activeSection) || null : null

  /*
   * A composer complaint is stamped with the override set that produced it, so
   * a warning cannot outlive the copy it was about. Reporting is an effect in
   * the preview, so the callback identity has to change with the overrides or
   * the fresh set is never re-reported.
   */
  const onSlotDiagnostics = useCallback((d) => { setSlotDiag({ forKey: overridesKey, ...d }) }, [overridesKey])
  const liveDiag = slotDiag && slotDiag.forKey === overridesKey ? slotDiag : null

  const setSlot = (id, value) => {
    const next = { ...overrides }
    // Absent means "use the design's own wording"; an empty string would
    // override it with nothing. See composeTemplate.
    if (value === '') delete next[id]
    else next[id] = value
    onPatch({ slotOverrides: next })
  }
  const resetSlot = (id) => {
    const next = { ...overrides }
    delete next[id]
    onPatch({ slotOverrides: next })
  }

  // ---- legacy identity editing (nodes) -------------------------------------
  const sections = toNodeSections(template.sections)
  const setSections = (next) => onPatch({ sections: next })
  const selectedSection = sections.find((s) => s.id === selectedId) || sections.find((s) => s.elements.some((e) => e.id === selectedId)) || null
  const selectedElement = selectedSection ? selectedSection.elements.find((e) => e.id === selectedId) || null : null

  const patchSection = (id, fn) => setSections(sections.map((s) => (s.id === id ? fn(s) : s)))
  const move = (arr, index, dir) => {
    const to = index + dir
    if (index < 0 || to < 0 || to >= arr.length) return arr
    const out = [...arr]
    ;[out[index], out[to]] = [out[to], out[index]]
    return out
  }
  const moveSection = (id, dir) => setSections(move(sections, sections.findIndex((s) => s.id === id), dir))
  const toggleSection = (id) => patchSection(id, (s) => ({ ...s, isVisible: s.isVisible === false ? undefined : false }))
  const deleteSection = (id) => { setSections(sections.filter((s) => s.id !== id)); if (selectedId === id) setSelectedId(null) }
  const addSection = (type) => {
    // Seeded with one empty heading so the new section is visible and clickable
    // straight away. An entirely empty section draws nothing, which reads as the
    // button having failed.
    const section = { id: newNodeId('sec'), type, tone: 'default', props: {}, elements: [{ id: newNodeId('el'), type: 'heading', level: '2' }] }
    setSections([...sections, section])
    setSelectedId(section.id)
  }
  const moveElement = (sectionId, elId, dir) =>
    patchSection(sectionId, (s) => ({ ...s, elements: move(s.elements, s.elements.findIndex((e) => e.id === elId), dir) }))
  const toggleElement = (sectionId, elId) =>
    patchSection(sectionId, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === elId ? { ...e, isVisible: e.isVisible === false ? undefined : false } : e)) }))
  const deleteElement = (sectionId, elId) => {
    patchSection(sectionId, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== elId) }))
    if (selectedId === elId) setSelectedId(sectionId)
  }
  const addElement = (sectionId, type) => {
    const el = { id: newNodeId('el'), type }
    patchSection(sectionId, (s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedId(el.id)
  }
  const updateElement = (next) => patchSection(selectedSection.id, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === next.id ? next : e)) }))
  const updateSection = (next) => patchSection(next.id, () => next)
  const applyWrite = (written) => {
    const patch = new Map(written.map((e) => [e.id, e.fields]))
    patchSection(selectedSection.id, (s) => ({ ...s, elements: s.elements.map((e) => (patch.has(e.id) ? { ...e, ...patch.get(e.id) } : e)) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        crumbs="ADMIN / FUNNELS / LANDING PAGES / TEMPLATE"
        title={template.name}
        onBack={onBack}
        onPreview={onPreview}
        actions={
          <>
            <Pill color={template.isEnabled ? T.success : T.textLow}>{template.isEnabled ? 'ENABLED' : 'DISABLED'}</Pill>
            <Btn variant="ghost" size="sm" icon={Palette} onClick={() => setRendererOpen(true)}>Design: {renderer.name}</Btn>
            <Btn variant="secondary" size="sm" icon={template.isEnabled ? PowerOff : Power} onClick={() => onToggleEnabled(template)}>
              {template.isEnabled ? 'Disable' : 'Enable'}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '288px 1fr 340px', overflow: 'hidden' }}>
        {/* ---------------------------------------------------------- left */}
        <div style={{ borderRight: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div><Label>Name</Label><Input value={template.name} onChange={(e) => onPatch({ name: e.target.value })} /></div>
            <div>
              <Label>Slug</Label>
              <Input mono value={template.slug} onChange={(e) => onPatch({ slug: e.target.value })} />
              <div style={{ fontSize: 10, color: T.textLow, marginTop: 4 }}>Lower case, dashes. It identifies the template, not a public URL: the URL is the deployment&apos;s path.</div>
            </div>
            <div>
              <Label>Angle</Label>
              <Select value={template.angle} onChange={(e) => onPatch({ angle: e.target.value })}>
                {ANGLES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Design</Label>
              <Btn variant="secondary" size="sm" icon={Palette} onClick={() => setRendererOpen(true)} style={{ width: '100%', justifyContent: 'space-between' }}>
                {renderer.name}
                <ChevronRight size={12} />
              </Btn>
              {template.rendererError ? (
                <div style={{ fontSize: 10.5, color: T.danger, marginTop: 6, lineHeight: 1.5 }}>{template.rendererError}</div>
              ) : (
                <div style={{ fontSize: 10, color: T.textLow, marginTop: 6, lineHeight: 1.5 }}>
                  {usesSlots ? 'Copy is edited as slots, section by section.' : (renderer.structure || 'This design has a look but no structure yet.')}
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
            <Label style={{ marginBottom: 8 }}>Preview as</Label>
            <Select value={previewBrandId || ''} onChange={(e) => setPreviewBrandId(e.target.value || null)}>
              <option value="">No brand (the design&apos;s own colours)</option>
              {selectableOptions({
                records: brands,
                selectedId: previewBrandId,
                toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
            </Select>
            <BrandQuickEdit brand={brands.find((b) => b.id === previewBrandId)} onSaved={onBrandSaved} />
            <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 6, lineHeight: 1.5 }}>
              Preview only. Nothing about the brand is written into the template: the same template under two brands is one layout in two palettes.
            </div>
            {!usesSlots && (
              <div style={{ marginTop: 10 }}>
                <Label style={{ marginBottom: 6 }}>Quiz in the hero (preview)</Label>
                <Select value={previewQuizId || ''} onChange={(e) => setPreviewQuizId(e.target.value || null)}>
                  <option value="">None</option>
                  {quizzes.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </Select>
              </div>
            )}
          </div>

          {usesSlots ? (
            <SlotSectionNav groups={slotGroups} selectedSection={activeSection} onSelect={setSlotSection} overrides={overrides} />
          ) : (
            <NodeTree
              sections={sections}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveSection={moveSection}
              onToggleSection={toggleSection}
              onDeleteSection={deleteSection}
              onMoveElement={moveElement}
              onToggleElement={toggleElement}
              onDeleteElement={deleteElement}
              onAddElement={addElement}
              onAddSection={() => setAddOpen(true)}
            />
          )}
        </div>

        {/* -------------------------------------------------------- centre */}
        <div style={{ overflowY: 'auto', backgroundColor: '#0c1118', padding: 24 }} onClick={() => setSelectedId(null)}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
            <LivePreview
              landingPage={{ ...template, sections }}
              brand={previewBrand}
              quiz={previewQuiz}
              quizDepLabel={previewQuiz?.name}
              selectedId={selectedId}
              onSelectNode={setSelectedId}
              slotOverrides={usesSlots ? overrides : null}
              onSlotDiagnostics={usesSlots ? onSlotDiagnostics : null}
            />
          </div>
        </div>

        {/* --------------------------------------------------------- right */}
        <div style={{ borderLeft: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 18 }}>
          {liveDiag && (
            <div style={{ marginBottom: 14, padding: 10, backgroundColor: `${T.danger}11`, border: `1px solid ${T.danger}66`, borderRadius: 6, fontSize: 11, color: T.danger, lineHeight: 1.5 }}>
              {liveDiag.unknown.length > 0 && <div>Copy stored for {liveDiag.unknown.join(', ')} names nothing in this design and is not on the page.</div>}
              {liveDiag.refused.map((r) => <div key={r.id}>{r.id}: {r.reason}</div>)}
            </div>
          )}

          {usesSlots ? (
            activeGroup ? (
              <>
                <SectionHeading
                  eyebrow={`Section ${String(activeGroup.section).padStart(2, '0')}`}
                  title={activeGroup.label}
                  hint="Leave a field empty to keep the design's own wording. What you type replaces it for every deployment of this template, unless that deployment overrides it again."
                />
                <SlotSectionFields group={activeGroup} overrides={overrides} onChange={setSlot} onReset={resetSlot} />
              </>
            ) : (
              <div style={{ fontSize: 12, color: T.textMute }}>This design exposes no editable copy.</div>
            )
          ) : selectedSection ? (
            <NodeInspector
              section={selectedSection}
              element={selectedElement}
              palette={templatePalette(renderer, previewBrand)}
              splits={Boolean(sectionSpec(selectedSection.type)?.splits)}
              onChangeSection={updateSection}
              onChangeElement={updateElement}
              onApplyWrite={applyWrite}
              onDelete={(id) => (selectedElement ? deleteElement(selectedSection.id, id) : deleteSection(id))}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <>
              <SectionHeading eyebrow="Inspector" title="Nothing selected" hint="Pick a section or an element in the tree on the left to edit it." />
              <div style={{ fontSize: 11, color: T.textMute }}>
                <div style={{ marginBottom: 6, fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textLow }}>Placeholders</div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, lineHeight: 1.7, color: T.textDim }}>
                  {`{{brand.displayName}}`}<br />{`{{brand.callNumber}}`}<br />{`{{brand.copyright}}`}<br />{`{{brand.disclaimer}}`}<br />{`{{brand.privacyUrl}}`}<br />{`{{brand.termsUrl}}`}<br />{`{{site.year}}`}
                </div>
                <div style={{ marginTop: 8, lineHeight: 1.55 }}>Type these into any field. They resolve per brand at preview and at deploy.</div>
              </div>
            </>
          )}
        </div>
      </div>

      <AddSectionModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addSection} />
      <RendererPickerModal
        open={rendererOpen}
        currentTemplateId={template.templateId}
        onClose={() => setRendererOpen(false)}
        onPick={(id) => onPatch({ templateId: id, slotOverrides: {} }, { confirmRenderer: true })}
      />
    </div>
  )
}

// ============================================================================
// PREVIEW MODAL
// ============================================================================
const LPPreviewModal = ({ previewState, templates, brands, deployments, quizzes, onClose }) => {
  const [brandOverride, setBrandOverride] = useState(null)
  useEffect(() => { setBrandOverride(null) }, [previewState?.templateId, previewState?.deploymentId])
  if (!previewState) return null

  const deployment = previewState.deploymentId ? deployments.find((d) => d.id === previewState.deploymentId) : null
  const template = templates.find((t) => t.id === (previewState.templateId || deployment?.landingPageId))
  if (!template) return null

  const lockedBrandId = deployment?.brandId
  const selectedBrandId = lockedBrandId || brandOverride
  const brand = brands.find((b) => b.id === selectedBrandId)

  /*
   * The same merge `resolveLpDeployment` precomputes as `composedOverrides`:
   * the template's own copy with the deployment's copy on top. Merging it
   * differently here would make this a preview of a page that does not exist.
   */
  const slotOverrides = { ...(template.slotOverrides || {}), ...(deployment?.contentOverrides || {}) }
  const quiz = deployment ? quizzes.find((q) => q.id === deployment.quizId) || null : null

  const url = deployment
    ? (deployment.domain ? `https://${deployment.domain}${deployment.path || ''}` : `https://preview.legenex.com/lp/${deployment.id}`)
    : `https://preview.legenex.com/lp/${template.slug}`

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 56, flexShrink: 0, padding: '0 20px', backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={15} color={T.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Preview: {template.name}</span>
          {deployment && <Pill color={T.info}>DEPLOYMENT</Pill>}
        </div>
        <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
        <div style={{ fontSize: 12, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>{url}</div>
        <div style={{ flex: 1 }} />
        {!deployment && brands.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview as</span>
            <Select value={brandOverride || ''} onChange={(e) => setBrandOverride(e.target.value || null)} style={{ width: 220 }}>
              <option value="">No brand (the design&apos;s own colours)</option>
              {selectableOptions({
                records: brands,
                selectedId: brandOverride,
                toRecord: (b) => ({ id: b.id, label: b.displayName || b.name, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
            </Select>
          </div>
        )}
        <Btn variant="primary" size="sm" icon={X} onClick={onClose}>Close</Btn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#0c1118', padding: 24 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <LivePreview
            landingPage={template}
            brand={brand}
            quiz={quiz}
            quizDepLabel={quiz?.name}
            editable={false}
            slotOverrides={slotOverrides}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================
export function LandingPagesApp({ initialTemplates, initialDeployments, brands: initialBrands, domains, quizzes = [], quizTemplates = [] }) {
  // Held locally so an edit made from inside the builder repaints the preview
  // at once. The server copy is authoritative on the next load; this only
  // closes the gap between saving and seeing.
  const [brands, setBrands] = useState(initialBrands)
  const onBrandSaved = (next) => setBrands((prev) => prev.map((b) => (b.siteId === next.siteId ? { ...b, ...next } : b)))
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [lpDeployments, setLpDeployments] = useState(initialDeployments)
  const [subView, setSubView] = useState('lp_list')
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [editingDeployment, setEditingDeployment] = useState(null)
  const [lpTab, setLpTab] = useState('templates')
  const [previewState, setPreviewState] = useState(null)
  const [aiWizardOpen, setAiWizardOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  // A refusal or a warning from the server is shown in full and stays until it
  // is dismissed. A toast would truncate it and take it away after 3 seconds,
  // and these messages name the deployments an operator has to go and fix.
  const [notice, setNotice] = useState(null)
  const [toast, setToast] = useState(null)
  const [pendingOpenId, setPendingOpenId] = useState(null)

  /*
   * Debounced saves, keyed by WHICH FIELDS they carry.
   *
   * One shared timer would let a slot edit cancel a pending rename, because the
   * later timeout replaces the earlier one and each patch carries only its own
   * keys. Keyed timers keep independent edits independent, and every one of them
   * is flushed before the editor closes.
   */
  const pendingSaves = useRef({})
  const saveTimers = useRef({})

  const runSave = useCallback((key) => {
    const job = pendingSaves.current[key]
    if (!job) return Promise.resolve({ ok: true })
    delete pendingSaves.current[key]
    clearTimeout(saveTimers.current[key])
    delete saveTimers.current[key]
    return saveLpTemplate(job).then((res) => {
      if (!res.ok) setToast({ message: res.error, type: 'error' })
      return res
    })
  }, [])

  const queueTemplateSave = useCallback((id, patch) => {
    const key = `${id}:${Object.keys(patch).sort().join(',')}`
    pendingSaves.current[key] = { id, patch }
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => runSave(key), 450)
  }, [runSave])

  const flushTemplateSaves = useCallback(
    () => Promise.all(Object.keys(pendingSaves.current).map(runSave)),
    [runSave],
  )

  // Only resync from the server when sitting on the list, so a refresh triggered
  // by one action cannot clobber an editor somebody is typing into.
  useEffect(() => {
    if (subView === 'lp_list') {
      setTemplates(initialTemplates)
      setLpDeployments(initialDeployments)
    }
  }, [initialTemplates, initialDeployments, subView])

  /*
   * Open the editor on a row the SERVER has confirmed, rather than on a local
   * guess at what it created. `createLpTemplate` returns an id and nothing else
   * - the slug it derived, for one, is its own - so inventing a record here
   * would show the operator fields that do not match the row.
   */
  useEffect(() => {
    if (!pendingOpenId) return
    if (templates.some((t) => t.id === pendingOpenId)) {
      setEditingTemplateId(pendingOpenId)
      setSubView('template_editor')
      setPendingOpenId(null)
    }
  }, [templates, pendingOpenId])

  const editingTemplate = templates.find((t) => t.id === editingTemplateId) || null

  /** Where a refusal or a warning about deployments sends the operator. */
  const showDeployments = () => {
    setSubView('lp_list')
    setEditingTemplateId(null)
    setLpTab('deployments')
  }

  /* ------------------------------------------------------------- templates */

  const applyTemplatePatch = (id, patch) => {
    setTemplates((arr) => arr.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    queueTemplateSave(id, patch)
  }

  // The record's field names and the action's patch keys are the same five
  // words, so the editor patches the record and the patch IS the payload.
  const patchTemplate = (id, patch, opts = {}) => {
    if (!opts.confirmRenderer) { applyTemplatePatch(id, patch); return }
    const current = templates.find((t) => t.id === id)
    const copyCount = Object.keys(current?.slotOverrides || {}).length
    if (copyCount === 0) { applyTemplatePatch(id, patch); return }
    setConfirm({
      title: 'Change the design?',
      message: `${copyCount} line${copyCount === 1 ? '' : 's'} of copy were written against ${templateFor(current.templateId).name}. Slot ids belong to the design they were cut from, so that copy is cleared rather than left pointing at nothing.`,
      confirmText: 'Change design',
      onConfirm: () => { setConfirm(null); applyTemplatePatch(id, patch) },
    })
  }

  const createBlankTemplate = () => {
    createLpTemplate({ name: 'Untitled template' }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setToast({ message: 'Template created.', type: 'success' })
      setPendingOpenId(res.id)
      router.refresh()
    })
  }

  const createFromWizard = async (lp) => {
    const created = await createLpTemplate({ name: lp.name, rendererKey: lp.templateId })
    if (!created.ok) { setToast({ message: created.error, type: 'error' }); return }
    // Two calls because they answer two questions: `createLpTemplate` mints the
    // row and the design that draws it, and only `saveLpTemplate` carries copy.
    // The row's origin reads BLANK rather than CLAUDE: neither action accepts an
    // origin, and inventing one client side would be a value the server never
    // agreed to.
    const saved = await saveLpTemplate({ id: created.id, patch: { slug: lp.slug, angle: lp.angle, sections: lp.sections } })
    setToast(
      saved.ok
        ? { message: 'Template written by Claude.', type: 'success' }
        : { message: `Template created, but its copy did not save: ${saved.error}`, type: 'error' },
    )
    setPendingOpenId(created.id)
    router.refresh()
  }

  const cloneTemplate = (t) => {
    cloneLpTemplate({ id: t.id }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setToast({ message: `Cloned "${t.name}".`, type: 'success' })
      router.refresh()
    })
  }

  const toggleTemplateEnabled = (t) => {
    const enabled = !t.isEnabled
    // Optimistic, and it mirrors the server rule exactly: enabling opens both
    // gates, disabling touches only selectability so live pages keep serving.
    setTemplates((arr) => arr.map((x) => (x.id === t.id ? { ...x, isEnabled: enabled, isPublished: enabled ? true : x.isPublished } : x)))
    setLpTemplateEnabled({ id: t.id, enabled }).then((res) => {
      if (!res.ok) {
        setTemplates((arr) => arr.map((x) => (x.id === t.id ? t : x)))
        setToast({ message: res.error, type: 'error' })
        return
      }
      if (res.warning) {
        setNotice({
          title: `"${t.name}" is disabled for new deployments`,
          message: res.warning,
          actionText: 'See deployments',
          onAction: showDeployments,
        })
      } else {
        setToast({
          message: enabled ? `"${t.name}" can be selected again.` : `"${t.name}" is disabled for new deployments.`,
          type: 'success',
        })
      }
      router.refresh()
    })
  }

  const deleteTemplate = (t) => {
    setConfirm({
      title: `Delete "${t.name}"?`,
      message: t.stockKey
        ? 'This is a stock template. The library is rebuilt from code on every boot, so it is archived rather than dropped: it stops being selectable and the removal sticks.'
        : 'A deployment that still uses this template blocks the delete, and you will be told which.',
      confirmText: 'Delete',
      onConfirm: () => {
        setConfirm(null)
        deleteLpTemplate({ id: t.id }).then((res) => {
          if (!res.ok) {
            // The refusal names the deployments in the way. It is shown verbatim
            // rather than summarised: "3 deployments use this" makes an operator
            // go looking, and the action already did the looking.
            setNotice({ title: 'This template cannot be deleted', message: res.error, actionText: 'See deployments', onAction: showDeployments })
            return
          }
          setTemplates((arr) => arr.filter((x) => x.id !== t.id))
          setToast({ message: res.archived ? `"${t.name}" archived.` : `"${t.name}" deleted.`, type: 'success' })
          router.refresh()
        })
      },
    })
  }

  /* ----------------------------------------------------------- deployments */

  const persistDeployment = (dep) => {
    saveDeployment({ deployment: dep }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setSubView('lp_list'); setLpTab('deployments'); setEditingDeployment(null)
      setToast({ message: dep.domain ? 'Deployment saved.' : 'Deployment saved as a preview URL.', type: 'success' })
      router.refresh()
    })
  }

  const deleteDeploymentHandler = (id) => {
    setConfirm({
      title: 'Delete deployment?',
      message: 'The template itself remains. Only this placement goes away.',
      confirmText: 'Delete',
      onConfirm: () => {
        deleteDeployment({ id }).then((res) => {
          if (!res.ok) { setToast({ message: res.error, type: 'error' }); setConfirm(null); return }
          setLpDeployments((arr) => arr.filter((d) => d.id !== id))
          setConfirm(null); setSubView('lp_list'); setLpTab('deployments'); setEditingDeployment(null)
          router.refresh()
        })
      },
    })
  }

  const toggleDepStatus = (id) => {
    const dep = lpDeployments.find((d) => d.id === id)
    if (!dep) return
    const status = dep.status === 'live' ? 'paused' : 'live'
    setLpDeployments((arr) => arr.map((d) => (d.id === id ? { ...d, status } : d)))
    saveDeployment({ deployment: { ...dep, status } }).then((res) => {
      if (!res.ok) {
        setLpDeployments((arr) => arr.map((d) => (d.id === id ? dep : d)))
        setToast({ message: res.error, type: 'error' })
        return
      }
      router.refresh()
    })
  }

  const renameDeployment = (id, name) => {
    const dep = lpDeployments.find((d) => d.id === id)
    if (!dep) return
    setLpDeployments((arr) => arr.map((d) => (d.id === id ? { ...d, name } : d)))
    saveDeployment({ deployment: { ...dep, name } }).then((res) => {
      if (!res.ok) setToast({ message: res.error, type: 'error' })
    })
  }

  const newDeployment = () => {
    setEditingDeployment({
      id: '', name: '', landingPageId: '', brandId: '', domainId: '', domain: '', path: '/c/',
      quizId: '', quizDeploymentId: '', embeddedQuizTemplateId: '', embeddedProgressForm: null,
      contentOverrides: {}, destinationOverrides: {}, utm: {}, pixels: {}, status: 'draft',
    })
    setSubView('lp_deployment_edit')
  }

  /* ------------------------------------------------------------------ view */

  let body
  if (subView === 'template_editor' && editingTemplate) {
    body = (
      <LandingPageBuilder
        template={editingTemplate}
        brands={brands}
        onBrandSaved={onBrandSaved}
        quizzes={quizzes}
        onBack={() => {
          // Flush before leaving: the list re-reads from the server, so an
          // unsent keystroke would look like it had been saved and then lost.
          flushTemplateSaves().then(() => router.refresh())
          setSubView('lp_list'); setEditingTemplateId(null); setLpTab('templates')
        }}
        onPatch={(patch, opts) => patchTemplate(editingTemplate.id, patch, opts)}
        onToggleEnabled={toggleTemplateEnabled}
        onPreview={() => setPreviewState({ templateId: editingTemplate.id })}
      />
    )
  } else if (subView === 'lp_deployment_edit') {
    body = (
      <LPDeploymentEditor
        deployment={editingDeployment}
        templates={templates}
        brands={brands}
        quizzes={quizzes}
        quizTemplates={quizTemplates}
        onBrandSaved={onBrandSaved}
        onSave={persistDeployment}
        onDelete={deleteDeploymentHandler}
        onCancel={() => { setSubView('lp_list'); setEditingDeployment(null); setLpTab('deployments') }}
        onToast={setToast}
        onPreview={(dep) => (dep.id ? setPreviewState({ deploymentId: dep.id }) : setToast({ message: 'Save the deployment first.', type: 'error' }))}
      />
    )
  } else {
    body = (
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        <PageHeader
          title="Landing Pages"
          subtitle="One brandless library of templates, and the deployments that put them on a brand's domain."
          primaryAction={
            lpTab === 'templates'
              ? <Btn variant="primary" size="md" icon={Sparkles} onClick={() => setAiWizardOpen(true)}>New template with Claude</Btn>
              : <Btn variant="primary" size="md" icon={Plus} onClick={newDeployment}>New Deployment</Btn>
          }
          secondaryAction={
            lpTab === 'templates'
              ? <Btn variant="secondary" size="md" icon={Plus} onClick={createBlankTemplate}>New blank template</Btn>
              : null
          }
        />
        <LpTabBar active={lpTab} onChange={setLpTab} tabs={[
          { id: 'templates', label: 'Templates', count: templates.length },
          { id: 'deployments', label: 'Deployments', count: lpDeployments.length },
        ]} />
        <div style={{ marginTop: 18 }}>
          {lpTab === 'templates' && (
            <TemplateListView
              templates={templates}
              deployments={lpDeployments}
              onPreview={(t) => setPreviewState({ templateId: t.id })}
              onEdit={(t) => { setEditingTemplateId(t.id); setSubView('template_editor') }}
              onClone={cloneTemplate}
              onToggleEnabled={toggleTemplateEnabled}
              onDelete={deleteTemplate}
              onRename={(id, name) => patchTemplate(id, { name })}
            />
          )}
          {lpTab === 'deployments' && (
            <LPDeploymentListView
              deployments={lpDeployments}
              templates={templates}
              brands={brands}
              quizzes={quizzes}
              domains={domains}
              onOpen={(dep) => { setEditingDeployment(dep); setSubView('lp_deployment_edit') }}
              onDelete={deleteDeploymentHandler}
              onToggleStatus={toggleDepStatus}
              onPreview={(dep) => setPreviewState({ deploymentId: dep.id })}
              onRename={renameDeployment}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: T.bg, color: T.text, fontFamily: '"Inter", system-ui, sans-serif', minHeight: '100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&display=swap');`}</style>
      {body}

      <AINewLPWizard open={aiWizardOpen} onClose={() => setAiWizardOpen(false)} onCreate={createFromWizard} />
      <LPPreviewModal
        previewState={previewState}
        templates={templates}
        brands={brands}
        deployments={lpDeployments}
        quizzes={quizzes}
        onClose={() => setPreviewState(null)}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText || 'Confirm'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!notice}
        title={notice?.title}
        message={notice?.message}
        confirmText={notice?.actionText || 'OK'}
        cancelText="Close"
        onConfirm={() => { const act = notice?.onAction; setNotice(null); act?.() }}
        onCancel={() => setNotice(null)}
      />
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
