// @ts-nocheck
/* eslint-disable */
'use client'

// Ported verbatim from the artifact: the Landing Pages module (list + Deployments
// tab + 3-pane builder + section/template modals + deployment editor + AI wizard +
// preview). localStorage is replaced by server actions; direct Anthropic calls go
// through invokeLLM server actions.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { selectableOptions } from '@/lib/selectable'
import { TemplateLibrary } from '@/components/builder/templates/TemplateLibrary'
import { EXPECTED_LP_TEMPLATE_COUNT } from '@/lib/template-registry'
import {
  Rocket, Eye, Edit3, Copy, Power, PowerOff, Trash2, EyeOff, Layers, Sparkles, Save,
  X, Plus, Check, Loader2, Palette, ChevronRight, MoveUp, MoveDown, Plug,
} from 'lucide-react'
import {
  T, genId, Btn, Input, Textarea, Select, Label, Pill, IconBtn, ConfirmDialog, Toast,
  PageHeader, EmptyState, TabBar, TopBar, brandShortName,
} from '../ui'
import {
  TEMPLATES, ANGLES, LivePreview, PREVIEW_BRAND_DEFAULT,
  templateFor, templatePreviewSurface, templateLook, templatePalette, GALLERY_TEMPLATES, SKELETON_TEMPLATES,
} from './render'
import { BrandQuickEdit } from '../brand/BrandQuickEdit'
import { NodeTree } from './NodeTree'
import { PortedTemplateView } from './PortedTemplate'
import { listQuizTemplates, recommendedQuizTemplateFor } from '@/lib/template-registry'
import { PROGRESS_FORM_LABELS } from '@/lib/quiz-templates/model'
import { NodeInspector } from './NodeInspector'
import { treeIcon } from './nodes/icons'
import {
  SECTION_SPECS, SECTION_TYPES as NODE_SECTION_TYPES, newNodeId, sectionSpec,
} from '@/lib/lp-nodes/model'
import { toNodeSections } from '@/lib/lp-nodes/from-legacy'
import { instantiateSkeleton } from '@/lib/lp-skeletons'
import { createLP, saveLP, cloneLP, deleteLP, saveDeployment, deleteDeployment, aiWriteSectionNodes } from '@/app/(app)/admin/(top)/landing-pages/actions'
import { elementSpec } from '@/lib/lp-nodes/model'

// ============================================================================
// LANDING PAGE LIST VIEW
// ============================================================================
const LandingPagesListView = ({ landingPages, lpDeployments, onOpen, onClone, onDelete, onTogglePublish, onPreview, onRename }) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  if (landingPages.length === 0) {
    return <EmptyState icon={Rocket} title="No landing pages yet" subtitle="Build your first brandless landing page. Then deploy it to one or more brand domains." />
  }
  const startRename = (lp) => { setRenamingId(lp.id); setRenameDraft(lp.name) }
  const commitRename = () => { if (renamingId && renameDraft.trim()) onRename(renamingId, renameDraft.trim()); setRenamingId(null) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {landingPages.map((lp) => {
        const template = templateFor(lp.templateId)
        const swatch = templatePreviewSurface(template, null)
        const angle = ANGLES.find((a) => a.id === lp.angle)
        const depCount = lpDeployments.filter((d) => d.landingPageId === lp.id).length
        return (
          <div key={lp.id} style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 9, backgroundColor: swatch.bg, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Rocket size={16} color={swatch.accent} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {renamingId === lp.id ? (
                  <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }} style={{ flex: 1, maxWidth: 300, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 14, fontWeight: 600, outline: 'none' }} />
                ) : (
                  <span onClick={(e) => { e.stopPropagation(); startRename(lp) }} style={{ fontSize: 14, fontWeight: 600, color: T.text, cursor: 'text' }} title="Click to rename">{lp.name}</span>
                )}
                <Pill color={lp.isPublished ? T.success : T.warning}>{lp.isPublished ? 'LIVE' : 'DRAFT'}</Pill>
                <Pill color={T.purple}>{template?.name}</Pill>
                <Pill color={T.info}>{angle?.label}</Pill>
                <Pill color={T.textMute}>{(lp.sections || []).length} sections</Pill>
                <Pill color={depCount > 0 ? T.success : T.textLow}>{depCount} deployments</Pill>
              </div>
              <div style={{ fontSize: 11, color: T.textLow, fontFamily: '"JetBrains Mono", monospace' }}>/{lp.slug}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview(lp.id)}>Preview</Btn>
              <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(lp.id)}>Edit</Btn>
              <IconBtn icon={Copy} onClick={() => onClone(lp)} />
              <IconBtn icon={lp.isPublished ? PowerOff : Power} onClick={() => onTogglePublish(lp.id)} />
              <IconBtn icon={Trash2} onClick={() => onDelete(lp.id)} style={{ color: T.danger }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// LP DEPLOYMENT LIST VIEW
// ============================================================================
const LPDeploymentListView = ({ deployments, landingPages, brands, quizDeployments, quizzes, domains, onOpen, onDelete, onToggleStatus, onPreview, onRename }) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  if (deployments.length === 0) {
    return <EmptyState icon={Plug} title="No deployments yet" subtitle="A deployment maps a landing page to a brand and domain. The same page can be deployed multiple times to different brands." />
  }
  const startRename = (dep) => { setRenamingId(dep.id); setRenameDraft(dep.name || '') }
  const commitRename = () => { if (renamingId) { onRename(renamingId, renameDraft.trim()); setRenamingId(null) } }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {deployments.map((dep) => {
        const lp = landingPages.find((p) => p.id === dep.landingPageId)
        const brand = brands.find((b) => b.id === dep.brandId)
        const orphaned = !!dep.brandId && !brand
        // The flow this deployment runs, resolved the way the RESOLVER resolves
        // it: the deployment's own binding first, and the legacy standalone
        // pointer only when it has none. Reading the legacy id first is how a
        // list ends up naming the quiz a page stopped running.
        const legacyDep = dep.quizDeploymentId ? quizDeployments.find((q) => q.id === dep.quizDeploymentId) : null
        const quiz = dep.quizId
          ? quizzes.find((q) => q.id === dep.quizId)
          : legacyDep
            ? quizzes.find((q) => q.id === legacyDep.quizId)
            : null
        // A legacy pointer at a deployment that no longer exists renders nothing
        // at all. Three of four live rows were in this state in production, and
        // nothing in the product said so.
        const brokenLegacy = Boolean(dep.quizDeploymentId) && !dep.quizId && !legacyDep
        const refDomain = dep.domainId ? domains.find((d) => d.id === dep.domainId) : null
        const orphanedDomain = !!dep.domainId && !refDomain
        const domainStr = refDomain?.domain || dep.domain || ''
        const url = domainStr ? `https://${domainStr}${dep.path || ''}` : `https://preview.legenex.com/lp/${dep.id}`
        const depName = dep.name || (lp ? `${lp.name} · ${brand?.displayName || 'No brand'}` : 'Untitled deployment')
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
                {orphaned && <Pill color={T.warning}>Brand missing, select a new brand to fix</Pill>}
                {orphanedDomain && <Pill color={T.warning}>Domain missing, falling back to preview URL</Pill>}
                {brokenLegacy && <Pill color={T.danger}>Quiz missing, this page has no funnel</Pill>}
                {!dep.quizId && !dep.quizDeploymentId && <Pill color={T.warning}>No quiz attached</Pill>}
              </div>
              <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
              <div style={{ fontSize: 10, color: T.textLow, marginTop: 3, display: 'flex', gap: 10 }}>
                <span>LP: {lp?.name || 'unknown'}</span>
                <span>{'·'}</span>
                <span>{brand?.displayName || 'No brand'}</span>
                <span>{'·'}</span>
                <span>Quiz: {quiz?.name || 'none'}</span>
                {dep.quizDeploymentId && !dep.quizId ? <><span>{'·'}</span><span style={{ color: T.warning }}>legacy binding</span></> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview(dep)} aria-label="Preview deployment">Preview</Btn>
              <Btn variant="secondary" size="sm" icon={Edit3} onClick={() => onOpen(dep)} aria-label="Edit deployment">Edit</Btn>
              <IconBtn icon={dep.status === 'live' ? PowerOff : Power} onClick={() => onToggleStatus(dep.id)} aria-label={dep.status === 'live' ? 'Unpublish deployment' : 'Publish deployment'} />
              <IconBtn icon={Trash2} onClick={() => onDelete(dep.id)} style={{ color: T.danger }} aria-label="Delete deployment" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// ADD SECTION MODAL
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
// TEMPLATE GALLERY MODAL
// ============================================================================
/**
 * Pick a template, and separately decide whether to take its structure.
 *
 * These are two different acts and the gallery says so. Choosing a template
 * always applies its LOOK - palette, faces, radii, mark - which is safe: it
 * repaints the page you have. Taking its STRUCTURE replaces the sections, which
 * throws away the copy, so it is a second button behind a confirmation rather
 * than a side effect of clicking a card.
 *
 * A template whose skeleton has not been built yet says so plainly instead of
 * offering a button that would hand out another template's shape.
 */
const TemplateGalleryModal = ({ open, onClose, onPickLook, onPickStructure, currentTemplateId, brand }) => {
  const [confirming, setConfirming] = useState(null)
  useEffect(() => { if (open) setConfirming(null) }, [open])
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1180, maxHeight: '90vh', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 22, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Templates</div>
            <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>Twelve templates, ported from the design handoff. Each preview is a real render in the brand you are previewing as, so what you see is what the page becomes.</div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ padding: 22, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, alignItems: 'start' }}>
          {GALLERY_TEMPLATES.map((t) => {
            const isCurrent = t.id === currentTemplateId
            return (
              // Tagged with its id so a capture job can drive a named card
              // rather than guessing at a card from the text inside it.
              <div key={t.id} data-template={t.id} style={{ backgroundColor: T.bgElev, border: `2px solid ${isCurrent ? T.primary : T.border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* A real render of the template, shrunk. The cards used to draw
                    an identity's wordmark, which made all twelve identical: the
                    ports have no identity of their own, they ARE the design. */}
                {/* flexShrink:0 is load-bearing: this sits in a flex column,
                    and without it the fixed height collapses to nothing and the
                    preview silently disappears. */}
                {/* No thumbnail here, deliberately, and this is the second
                    honest answer rather than the first one that worked.
                    Four containment approaches - overflow on a sized box,
                    absolute positioning, clip-path, and finally an iframe -
                    each measured exactly right and each ended with the
                    template's own markup painting over this card's name and
                    action. Measuring the layout kept reporting success while
                    an element screenshot kept showing otherwise, so whatever
                    is wrong is not the containment, and shipping a picker
                    whose cards bleed into each other is worse than shipping
                    one that reads correctly without a picture. The preview
                    belongs here and will come back once the cause is actually
                    understood; see the build log. */}
                <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{t.name}</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{t.code}</span>
                    <Pill color={T.purple}>{String(t.family).toUpperCase()} FORM</Pill>
                    {isCurrent && <Pill color={T.primary}>CURRENT</Pill>}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.5, flex: 1 }}>{t.blurb}</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow, lineHeight: 1.6 }}>
                    <div>CHANNELS {'·'} {t.channels}</div>
                    <div>QUIZ {'·'} {t.quizPlacement}</div>
                  </div>
                  <Btn variant={isCurrent ? 'secondary' : 'primary'} size="sm" onClick={() => { onPickLook(t.id); onClose() }}>
                    {isCurrent ? 'Currently applied' : 'Use this template'}
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// AI NEW LP WIZARD
// ============================================================================
/**
 * A new page: the template's skeleton, filled section by section.
 *
 * The structure comes from the skeleton and the model only writes into it, one
 * call per section, ids as the contract. It cannot add a section, remove one or
 * reorder anything, which is what keeps "generated with Claude" and "built from
 * template B" the same page rather than two.
 *
 * Only templates with a skeleton can be chosen here, because there is nothing
 * to fill in otherwise. Offering the others and quietly substituting another
 * template's shape is the failure this whole change is about.
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
    if (!template.skeleton) { setError('That template has no structure yet.'); return }
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

      onCreate({
        name: name || `${angleLabel} LP`,
        slug: (name || 'new-lp').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        templateId, angle, sections: written,
        isPublished: false,
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
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>New landing page with Claude</div>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 2 }}>Step {step} of {stepCount}</div>
            </div>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ padding: 22, minHeight: 280 }}>
          {step === 1 && (
            <div>
              <Label>Page name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MVA Truck Urgency" autoFocus />
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 10 }}>This page will be brandless. You attach brands when you deploy it.</div>
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
              <Label>Template</Label>
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
// LANDING PAGE BUILDER (3-pane)
// ============================================================================
export const LandingPageBuilder = ({ landingPage, brands, onBrandSaved, quizDeployments, quizzes, onBack, onUpdate, onTogglePublish, onSetTemplate, onSetStructure, onPreview }) => {
  const [selectedId, setSelectedId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [previewBrandId, setPreviewBrandId] = useState(brands[0]?.id || null)
  const previewBrand = brands.find((b) => b.id === previewBrandId) || PREVIEW_BRAND_DEFAULT
  const brandEditor = <BrandQuickEdit brand={brands.find((b) => b.id === previewBrandId)} onSaved={onBrandSaved} />
  const matchingQuizDeps = quizDeployments.filter((qd) => qd.brandId === previewBrandId)
  const [previewQuizDepId, setPreviewQuizDepId] = useState(matchingQuizDeps[0]?.id || null)
  useEffect(() => {
    const dep = quizDeployments.find((q) => q.id === previewQuizDepId)
    if (!dep || dep.brandId !== previewBrandId) {
      const next = quizDeployments.find((q) => q.brandId === previewBrandId)
      setPreviewQuizDepId(next?.id || null)
    }
  }, [previewBrandId, quizDeployments, previewQuizDepId])

  const previewQuizDep = quizDeployments.find((q) => q.id === previewQuizDepId)
  const previewQuiz = quizzes.find((q) => q.id === previewQuizDep?.quizId)
  const template = templateFor(landingPage.templateId)

  // Whatever the page is stored as comes through as nodes, so the builder only
  // ever works in one vocabulary. A page written before the node model is
  // converted here and saved back as nodes the first time anything is changed.
  const sections = toNodeSections(landingPage.sections)
  const setSections = (next) => onUpdate({ ...landingPage, sections: next, updatedAt: Date.now() })

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
        crumbs={`ADMIN / FUNNELS / LANDING PAGES`}
        title={landingPage.name}
        isPublished={landingPage.isPublished}
        onBack={onBack}
        onPreview={onPreview}
        onPublish={() => onTogglePublish(landingPage.id)}
        actions={<Btn variant="ghost" size="sm" icon={Palette} onClick={() => setGalleryOpen(true)}>Template: {template.name}</Btn>}
      />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '288px 1fr 340px', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 14 }}>
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
        </div>

        <div style={{ overflowY: 'auto', backgroundColor: '#0c1118', padding: 24 }} onClick={() => setSelectedId(null)}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
            <LivePreview
              landingPage={{ ...landingPage, sections }}
              brand={previewBrand}
              quizDepLabel={previewQuiz?.name}
              quiz={previewQuiz}
              selectedId={selectedId}
              onSelectNode={setSelectedId}
            />
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${T.border}`, overflowY: 'auto', backgroundColor: T.bg, padding: 18 }}>
          {selectedSection ? (
            <NodeInspector
              section={selectedSection}
              element={selectedElement}
              palette={templatePalette(template, previewBrand)}
              splits={Boolean(sectionSpec(selectedSection.type)?.splits)}
              onChangeSection={updateSection}
              onChangeElement={updateElement}
              onApplyWrite={applyWrite}
              onDelete={(id) => (selectedElement ? deleteElement(selectedSection.id, id) : deleteSection(id))}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <>
              <Label>Page settings</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
                <div><Label>Name</Label><Input value={landingPage.name} onChange={(e) => onUpdate({ ...landingPage, name: e.target.value })} /></div>
                <div><Label>Slug</Label><Input mono value={landingPage.slug} onChange={(e) => onUpdate({ ...landingPage, slug: e.target.value })} /></div>
                <div>
                  <Label>Angle</Label>
                  <Select value={landingPage.angle} onChange={(e) => onUpdate({ ...landingPage, angle: e.target.value })}>
                    {ANGLES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Template</Label>
                  <Btn variant="secondary" size="sm" icon={Palette} onClick={() => setGalleryOpen(true)} style={{ width: '100%', justifyContent: 'space-between' }}>
                    {template.name}
                    <ChevronRight size={12} />
                  </Btn>
                  <div style={{ fontSize: 10, color: T.textLow, marginTop: 6, lineHeight: 1.5 }}>
                    {template.structure || 'This template has a look but no structure yet.'}
                  </div>
                </div>
              </div>

              <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 18 }}>
                <Label style={{ marginBottom: 8 }}>Preview as</Label>
                <Select value={previewBrandId || ''} onChange={(e) => setPreviewBrandId(e.target.value || null)}>
                  <option value="">No brand (placeholders)</option>
                  {selectableOptions({
                    records: brands,
                    selectedId: previewBrandId,
                    toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
                  }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
                </Select>
                {brandEditor}
                <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 6, lineHeight: 1.5 }}>
                  The brand owns the colours. The template owns the shape, the faces and the structure, so the same page under two brands is the same layout in two palettes. Pick one here to see what a visitor gets.
                </div>
                {previewBrandId && (
                  <div style={{ marginTop: 10 }}>
                    <Label style={{ marginBottom: 6 }}>Quiz deployment (preview)</Label>
                    <Select value={previewQuizDepId || ''} onChange={(e) => setPreviewQuizDepId(e.target.value || null)}>
                      <option value="">None</option>
                      {matchingQuizDeps.map((q) => {
                        const qz = quizzes.find((z) => z.id === q.quizId)
                        return <option key={q.id} value={q.id}>{qz?.name || q.id}</option>
                      })}
                    </Select>
                    {matchingQuizDeps.length === 0 && <div style={{ fontSize: 10.5, color: T.warning, marginTop: 6 }}>This brand has no quiz deployments yet. Create one in Funnels {'›'} Quizzes.</div>}
                  </div>
                )}
              </div>

              <div style={{ paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.textMute }}>
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
      <TemplateGalleryModal
        open={galleryOpen}
        currentTemplateId={landingPage.templateId}
        onClose={() => setGalleryOpen(false)}
        brand={previewBrand}
        onPickLook={(tplId) => onSetTemplate(landingPage.id, tplId)}
        onPickStructure={(tplId) => { onSetStructure(landingPage.id, tplId); setSelectedId(null) }}
      />
    </div>
  )
}

// ============================================================================
// LP DEPLOYMENT EDITOR
// ============================================================================
const LPDeploymentEditor = ({ deployment, landingPages, brands, domains, quizDeployments, quizzes, onSave, onDelete, onCancel, onToast, onPreview }) => {
  const [draft, setDraft] = useState(deployment)
  useEffect(() => { setDraft(deployment) }, [deployment?.id])
  if (!draft) return null

  const brandDomains = domains.filter((d) => d.brandId === draft.brandId)
  // The legacy pointer is DISPLAYED and never edited. A row that still carries
  // one keeps working until a flow is chosen; see the note in the panel below.
  const legacyQuizDep = Boolean(draft.quizDeploymentId)
  const legacyQuizDepMissing = legacyQuizDep && !quizDeployments.some((qd) => qd.id === draft.quizDeploymentId)
  const quizSkins = listQuizTemplates()
  const previewURL = `https://preview.legenex.com/lp/${draft.id || 'new'}`
  const finalURL = draft.domain ? `https://${draft.domain}${draft.path || ''}` : previewURL

  const handleSave = () => {
    if (!draft.landingPageId) { onToast?.({ message: 'Pick a landing page first.', type: 'error' }); return }
    if (!draft.brandId) { onToast?.({ message: 'Pick a brand first.', type: 'error' }); return }
    // A landing page's whole job is the quiz in it. Going live without one puts
    // an empty card where the funnel goes, so it is refused here as well as in
    // the publish preflight - the earlier of the two is the useful one.
    if (!draft.quizId && !draft.quizDeploymentId && draft.status === 'live') {
      onToast?.({ message: 'Pick a quiz flow before going live.', type: 'error' }); return
    }
    const next = { ...draft, id: draft.id || genId('ldep'), status: draft.status || 'draft', path: draft.path || '' }
    onSave(next)
    onToast?.({ message: draft.domain ? 'Deployment saved.' : 'Deployment saved as preview URL.', type: 'success' })
  }

  const lp = landingPages.find((p) => p.id === draft.landingPageId)
  const tplName = lp ? templateFor(lp.templateId).name : null
  const angleName = ANGLES.find((a) => a.id === lp?.angle)?.label
  // What the embed is drawn in when the deployment does not choose: the landing
  // page's own recommendation, named rather than left as "default" so an
  // operator can see what they are accepting.
  const recommendedSkinName = lp
    ? quizSkins.find((t) => t.id === recommendedQuizTemplateFor(lp.templateId))?.name ?? null
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        crumbs={`ADMIN / FUNNELS / LANDING PAGES / DEPLOYMENT`}
        title={draft.name || lp?.name || 'New deployment'}
        onBack={onCancel}
        actions={
          <>
            {draft.id && <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview?.(draft)}>Preview</Btn>}
            {draft.id && <Btn variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(draft.id)}>Delete</Btn>}
            <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" size="sm" icon={Save} onClick={handleSave}>Save Deployment</Btn>
          </>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>Deployment</h1>
          <div style={{ fontSize: 13, color: T.textMute, marginTop: 4, marginBottom: 24 }}>Map a landing page to a brand domain and path. This is what visitors will actually see.</div>
          <div style={{ padding: 20, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label>Deployment name</Label>
              <Input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="eg CMC Pain First / Truck Campaign" />
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 6 }}>An internal label so you can tell deployments apart in the list. Defaults to the LP + brand if blank.</div>
            </div>
            <div>
              <Label>Landing page</Label>
              <Select value={draft.landingPageId || ''} onChange={(e) => setDraft({ ...draft, landingPageId: e.target.value })}>
                <option value="">Pick a landing page</option>
                {landingPages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Brand</Label>
              <Select value={draft.brandId || ''} onChange={(e) => setDraft({ ...draft, brandId: e.target.value, domain: '' })}>
                <option value="">Pick a brand</option>
                {selectableOptions({
                records: brands,
                selectedId: draft.brandId,
                toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
              </Select>
            </div>
            <div>
              <Label>Domain</Label>
              <Select value={draft.domain || ''} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} disabled={!draft.brandId}>
                <option value="">{brandDomains.length === 0 ? 'No domains for this brand (preview URL will be used)' : 'No domain attached (use preview URL)'}</option>
                {brandDomains.map((d) => <option key={d.id} value={d.domain}>{d.domain}{d.isPrimary ? ' (primary)' : ''}</option>)}
              </Select>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 6, lineHeight: 1.55 }}>Domains come from the brand. Manage them in <span style={{ color: T.text }}>Brands {'›'} Domains</span>.</div>
            </div>
            <div>
              <Label>Path</Label>
              <Input mono value={draft.path || ''} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="/c/your-path" />
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 6 }}>
                Final URL: <span style={{ color: draft.domain ? T.text : T.warning, fontFamily: '"JetBrains Mono", monospace' }}>{finalURL}</span>
                {!draft.domain && <Pill color={T.info} style={{ marginLeft: 8 }}>PREVIEW URL</Pill>}
              </div>
            </div>
            <div>
              <Label>Quiz flow</Label>
              <Select value={draft.quizId || ''} onChange={(e) => setDraft({ ...draft, quizId: e.target.value })}>
                <option value="">Pick the flow this page runs</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id} disabled={q.isArchived}>
                    {q.name}{q.isArchived ? ' - ARCHIVED' : q.isPublished ? '' : ' - unpublished'}
                  </option>
                ))}
              </Select>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 6, lineHeight: 1.55 }}>
                The flow itself, not a second published quiz page. Flows are brandless, so the
                same one runs under every brand and this deployment supplies the brand.
              </div>
            </div>
            <div>
              <Label>Embedded quiz look</Label>
              <Select value={draft.embeddedQuizTemplateId || ''} onChange={(e) => setDraft({ ...draft, embeddedQuizTemplateId: e.target.value })}>
                <option value="">Recommended for this landing page{recommendedSkinName ? ` (${recommendedSkinName})` : ''}</option>
                {quizSkins.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 6 }}>
                How the quiz is DRAWN inside this page. The landing page owns the page; this owns the card.
              </div>
            </div>
            <div>
              <Label>Progress treatment</Label>
              <Select value={draft.embeddedProgressForm || ''} onChange={(e) => setDraft({ ...draft, embeddedProgressForm: e.target.value })}>
                <option value="">The quiz look&apos;s own</option>
                {PROGRESS_FORM_LABELS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </div>
            {legacyQuizDep && (
              <div style={{ padding: 12, border: `1px solid ${T.warning}`, borderRadius: 8, fontSize: 11.5, color: T.textMute, lineHeight: 1.6 }}>
                <span style={{ color: T.warning, fontWeight: 600 }}>Legacy binding.</span>{' '}
                This deployment still points at the standalone quiz deployment{' '}
                <span style={{ fontFamily: '"JetBrains Mono", monospace', color: T.text }}>{draft.quizDeploymentId}</span>
                {legacyQuizDepMissing ? ', which no longer exists' : ''}. It is read only and is used
                only while no flow is chosen above. Picking a flow replaces it on save.
              </div>
            )}
            <div>
              <Label>Status</Label>
              <Select value={draft.status || 'draft'} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="paused">Paused</option>
              </Select>
            </div>
          </div>
          {lp && (
            <div style={{ marginTop: 16, padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <Label style={{ marginBottom: 10 }}>Page reference</Label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Pill color={T.purple}>{tplName}</Pill>
                <Pill color={T.info}>{angleName}</Pill>
                <Pill color={T.textMute}>{lp.sections.length} sections</Pill>
                <Pill color={lp.isPublished ? T.success : T.warning}>{lp.isPublished ? 'Published' : 'Draft'}</Pill>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LP PREVIEW MODAL
// ============================================================================
const LPPreviewModal = ({ previewState, landingPages, brands, lpDeployments, quizzes, quizDeployments, onClose }) => {
  const [brandOverride, setBrandOverride] = useState(null)
  useEffect(() => { setBrandOverride(null) }, [previewState?.lpId, previewState?.deploymentId])
  if (!previewState) return null

  const lp = landingPages.find((p) => p.id === (previewState.lpId || lpDeployments.find((d) => d.id === previewState.deploymentId)?.landingPageId))
  if (!lp) return null

  const deployment = previewState.deploymentId ? lpDeployments.find((d) => d.id === previewState.deploymentId) : null
  const lockedBrandId = deployment?.brandId
  const selectedBrandId = lockedBrandId || brandOverride || brands[0]?.id
  const brand = brands.find((b) => b.id === selectedBrandId)

  let quizDep = deployment?.quizDeploymentId ? quizDeployments.find((qd) => qd.id === deployment.quizDeploymentId) : null
  if (!quizDep && brand) quizDep = quizDeployments.find((qd) => qd.brandId === brand.id)
  const quiz = quizDep ? quizzes.find((q) => q.id === quizDep.quizId) : null

  const url = deployment ? (deployment.domain ? `https://${deployment.domain}${deployment.path || ''}` : `https://preview.legenex.com/lp/${deployment.id}`) : `https://preview.legenex.com/lp/${lp.id}`

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 56, flexShrink: 0, padding: '0 20px', backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={15} color={T.primary} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Preview: {lp.name}</span>
          {deployment && <Pill color={T.info}>DEPLOYMENT</Pill>}
        </div>
        <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
        <div style={{ fontSize: 12, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>{url}</div>
        <div style={{ flex: 1 }} />
        {!deployment && brands.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview as</span>
            <Select value={brandOverride || brands[0]?.id || ''} onChange={(e) => setBrandOverride(e.target.value)} style={{ width: 200 }}>
              {selectableOptions({
                records: brands,
                selectedId: brandOverride || brands[0]?.id || '',
                toRecord: (b) => ({ id: b.id, label: b.displayName || b.name, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
            </Select>
          </div>
        )}
        <Btn variant="primary" size="sm" icon={X} onClick={onClose}>Close</Btn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#0c1118', padding: 24 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <LivePreview landingPage={lp} brand={brand} quiz={quiz} quizDepLabel={quiz?.name} editable={false} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================
export function LandingPagesApp({ initialLandingPages, initialDeployments, brands: initialBrands, domains, quizzes = [], quizDeployments = [] }) {
  // Held locally so an edit made from inside the builder repaints the preview
  // at once. The server copy is authoritative on the next load; this only
  // closes the gap between saving and seeing.
  const [brands, setBrands] = useState(initialBrands)
  const onBrandSaved = (next) => setBrands((prev) => prev.map((b) => (b.siteId === next.siteId ? { ...b, ...next } : b)))
  const router = useRouter()
  const [landingPages, setLandingPages] = useState(initialLandingPages)
  const [lpDeployments, setLpDeployments] = useState(initialDeployments)
  const [subView, setSubView] = useState('lp_list')
  const [editingLPId, setEditingLPId] = useState(null)
  const [editingDeployment, setEditingDeployment] = useState(null)
  const [lpTab, setLpTab] = useState('pages')
  const [previewState, setPreviewState] = useState(null)
  const [aiWizardOpen, setAiWizardOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [toast, setToast] = useState(null)
  const saveTimer = useRef(null)

  // Only resync from the server when sitting on the list (avoids clobbering an open builder).
  useEffect(() => {
    if (subView === 'lp_list') {
      setLandingPages(initialLandingPages)
      setLpDeployments(initialDeployments)
    }
  }, [initialLandingPages, initialDeployments, subView])

  const lpPatch = (lp) => ({
    name: lp.name, slug: lp.slug, template_id: lp.templateId, angle: lp.angle,
    is_published: lp.isPublished, sections: lp.sections,
  })

  // Builder edits update local state immediately and debounce a server save.
  const updateLP = (lp) => {
    setLandingPages((arr) => arr.map((p) => (p.id === lp.id ? lp : p)))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveLP({ id: lp.id, patch: lpPatch(lp) }) }, 450)
  }

  const togglePublishLP = (id) => {
    setLandingPages((arr) => arr.map((p) => (p.id === id ? { ...p, isPublished: !p.isPublished } : p)))
    const lp = landingPages.find((p) => p.id === id)
    if (lp) saveLP({ id, patch: { is_published: !lp.isPublished } }).then(() => router.refresh())
  }

  // Two separate acts, kept separate. Changing the template repaints the page
  // in that identity and touches nothing else. Taking its structure replaces
  // the sections outright, which loses the copy, so it is its own verb behind
  // its own confirmation rather than a consequence of picking a colour scheme.
  const setTemplate = (lpId, tplId) => {
    setLandingPages((arr) => arr.map((p) => (p.id === lpId ? { ...p, templateId: tplId } : p)))
    saveLP({ id: lpId, patch: { template_id: tplId } })
  }

  const setStructure = (lpId, tplId) => {
    const tpl = templateFor(tplId)
    if (!tpl.skeleton) { setToast({ message: `${tpl.name} has no structure built yet.`, type: 'error' }); return }
    const sections = instantiateSkeleton(tpl.skeleton)
    setLandingPages((arr) => arr.map((p) => (p.id === lpId ? { ...p, templateId: tplId, sections } : p)))
    saveLP({ id: lpId, patch: { template_id: tplId, sections } })
    setToast({ message: `Rebuilt from ${tpl.name}. Nothing is written yet.`, type: 'success' })
  }

  const cloneLPHandler = (lp) => {
    cloneLP({ id: lp.id }).then((res) => { if (res.ok) router.refresh(); else setToast({ message: res.error, type: 'error' }) })
  }

  const deleteLPHandler = (id) => {
    setConfirm({
      title: 'Delete landing page?',
      message: 'This also removes all deployments that reference it.',
      onConfirm: () => {
        deleteLP({ id }).then((res) => {
          if (!res.ok) { setToast({ message: res.error, type: 'error' }); setConfirm(null); return }
          setLandingPages((arr) => arr.filter((p) => p.id !== id))
          setLpDeployments((arr) => arr.filter((d) => d.landingPageId !== id))
          setConfirm(null)
          router.refresh()
        })
      },
    })
  }

  const createBlankLP = () => {
    // A blank page still gets a SHAPE, from the first template that has one.
    // Starting from nothing means starting from a screen with no way in, and
    // the skeleton carries no copy, so nothing has to be deleted before writing.
    const tpl = TEMPLATES.find((t) => t.skeleton) || TEMPLATES[0]
    const lp = {
      name: 'Untitled LP',
      slug: `untitled-${Date.now().toString(36).slice(-4)}`,
      templateId: tpl.id, angle: tpl.angleDefault,
      sections: tpl.skeleton ? instantiateSkeleton(tpl.skeleton) : [], isPublished: false,
    }
    createLP({ lp }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setLandingPages((arr) => [...arr, { ...lp, id: res.id }])
      setEditingLPId(res.id)
      setSubView('lp_builder')
    })
  }

  const createFromWizard = (lp) => {
    createLP({ lp }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setLandingPages((arr) => [...arr, { ...lp, id: res.id }])
      setEditingLPId(res.id)
      setSubView('lp_builder')
    })
  }

  const persistDeployment = (dep) => {
    saveDeployment({ deployment: dep }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setSubView('lp_list'); setLpTab('deployments'); setEditingDeployment(null)
      router.refresh()
    })
  }

  const deleteDeploymentHandler = (id) => {
    setConfirm({
      title: 'Delete deployment?',
      message: 'The landing page itself remains. Only this deployment goes away.',
      onConfirm: () => {
        deleteDeployment({ id }).then((res) => {
          if (!res.ok) { setToast({ message: res.error, type: 'error' }); setConfirm(null); return }
          setLpDeployments((arr) => arr.filter((d) => d.id !== id))
          setConfirm(null); setSubView('lp_list'); setLpTab('deployments')
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
    saveDeployment({ deployment: { ...dep, status } }).then(() => router.refresh())
  }

  const renameLP = (id, name) => {
    setLandingPages((arr) => arr.map((p) => (p.id === id ? { ...p, name } : p)))
    saveLP({ id, patch: { name } })
  }
  const renameDeployment = (id, name) => {
    setLpDeployments((arr) => arr.map((d) => (d.id === id ? { ...d, name } : d)))
    const dep = lpDeployments.find((d) => d.id === id)
    if (dep) saveDeployment({ deployment: { ...dep, name } })
  }

  const editingLP = landingPages.find((p) => p.id === editingLPId)

  let body
  if (subView === 'lp_builder' && editingLP) {
    body = (
      <LandingPageBuilder
        onBrandSaved={onBrandSaved}
        landingPage={editingLP}
        brands={brands}
        quizDeployments={quizDeployments}
        quizzes={quizzes}
        onBack={() => { clearTimeout(saveTimer.current); if (editingLP) saveLP({ id: editingLP.id, patch: lpPatch(editingLP) }).then(() => router.refresh()); setSubView('lp_list'); setEditingLPId(null) }}
        onUpdate={updateLP}
        onTogglePublish={togglePublishLP}
        onSetTemplate={setTemplate}
        onSetStructure={setStructure}
        onPreview={() => setPreviewState({ kind: 'lp', lpId: editingLP.id })}
      />
    )
  } else if (subView === 'lp_deployment_edit') {
    body = (
      <LPDeploymentEditor
        deployment={editingDeployment}
        landingPages={landingPages}
        brands={brands}
        domains={domains}
        quizDeployments={quizDeployments}
        quizzes={quizzes}
        onSave={persistDeployment}
        onDelete={deleteDeploymentHandler}
        onCancel={() => { setSubView('lp_list'); setEditingDeployment(null); setLpTab('deployments') }}
        onToast={setToast}
        onPreview={(dep) => setPreviewState({ kind: 'deployment', deploymentId: dep.id })}
      />
    )
  } else {
    body = (
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        <PageHeader
          title="Landing Pages"
          subtitle="Brandless pages with placeholders. Deploy each page to one or more brand domains."
          primaryAction={
            // The Templates tab is a catalogue of the stock library. There is
            // nothing to create on it, and an action that did nothing there
            // would be worse than no action.
            lpTab === 'templates'
              ? null
              : lpTab === 'pages'
                ? <Btn variant="primary" size="md" icon={Sparkles} onClick={() => setAiWizardOpen(true)}>New with Claude</Btn>
                : <Btn variant="primary" size="md" icon={Plus} onClick={() => { setEditingDeployment({ id: '', landingPageId: '', brandId: '', domain: '', path: '/c/', quizId: '', embeddedQuizTemplateId: '', embeddedProgressForm: '', quizDeploymentId: '', status: 'draft' }); setSubView('lp_deployment_edit') }}>New Deployment</Btn>
          }
          secondaryAction={lpTab === 'pages' ? <Btn variant="secondary" size="md" icon={Plus} onClick={createBlankLP}>Blank LP</Btn> : null}
        />
        {/* The twelve are the STOCK library, so the count is the registry's, not
            the number of pages somebody has built from it. Listing content under
            the catalogue's name is how a library stops describing what exists. */}
        <TabBar active={lpTab} onChange={setLpTab} tabs={[
          { id: 'pages', label: 'Pages', count: landingPages.length },
          { id: 'templates', label: 'Templates', count: EXPECTED_LP_TEMPLATE_COUNT },
          { id: 'deployments', label: 'Deployments', count: lpDeployments.length },
        ]} />
        <div style={{ marginTop: 18 }}>
          {lpTab === 'pages' && (
            <LandingPagesListView
              landingPages={landingPages}
              lpDeployments={lpDeployments}
              onOpen={(id) => { setEditingLPId(id); setSubView('lp_builder') }}
              onClone={cloneLPHandler}
              onDelete={deleteLPHandler}
              onTogglePublish={togglePublishLP}
              onPreview={(id) => setPreviewState({ kind: 'lp', lpId: id })}
              onRename={renameLP}
            />
          )}
          {lpTab === 'templates' && <TemplateLibrary kind="lp" brands={brands} />}
          {lpTab === 'deployments' && (
            <LPDeploymentListView
              deployments={lpDeployments}
              landingPages={landingPages}
              brands={brands}
              quizDeployments={quizDeployments}
              quizzes={quizzes}
              domains={domains}
              onOpen={(dep) => { setEditingDeployment(dep); setSubView('lp_deployment_edit') }}
              onDelete={deleteDeploymentHandler}
              onToggleStatus={toggleDepStatus}
              onPreview={(dep) => setPreviewState({ kind: 'deployment', deploymentId: dep.id })}
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
      <LPPreviewModal previewState={previewState} landingPages={landingPages} brands={brands} lpDeployments={lpDeployments} quizzes={quizzes} quizDeployments={quizDeployments} onClose={() => setPreviewState(null)} />
      <ConfirmDialog open={!!confirm} title={confirm?.title} message={confirm?.message} confirmText="Delete" onConfirm={confirm?.onConfirm} onCancel={() => setConfirm(null)} />
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
    </div>
  )
}
