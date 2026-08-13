// @ts-nocheck
/* eslint-disable */
'use client'

// Ported verbatim (adapted): the quiz builder orchestrator + top bar + list views
// + quiz DeploymentEditor + embed modal. Brands come from props (shared Brand
// Identities); persistence is via server actions instead of localStorage.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Settings, Eye, Power, PowerOff, ListChecks, Rocket, Edit3, Copy, Trash2,
  Plus, Code2, Save, X, Undo2, Redo2, Archive, ArchiveRestore, Loader2, Check, AlertTriangle, LayoutTemplate,
} from 'lucide-react'
import { T, Btn, Input, Select, Label, Pill, IconBtn, ConfirmDialog, Toast, PageHeader } from '../ui'
import { BodySectionEditor, AddBodySectionPicker, BODY_SECTION_DEFS } from '../body-sections'
import { NODE_TYPE_FOR_QTYPE, QUIZ_TEMPLATES, RENDER_MODES, PIXEL_PROVIDERS } from './config'
import { genId, mkA, defaultLeadFormFields, VISIBLE_BY_DEFAULT } from './seed-data'
import { QuizFlowGrid } from './builder'
import { NodeEditorModal, SettingsModal, AddStepModal } from './editors'
import { QuizPreviewView, NodePreviewModal } from './preview'
import { auditQuizTemplateColors, resolveQuizTemplate, PROGRESS_FORM_LABELS } from './templates'
import { TemplatePreview } from './TemplatePreview'
import { brandShortName } from '../ui'
import {
  moveStepBy, duplicateStep, duplicateNode, deleteStep,
  upsertCustomField, newCustomField, lintQuizGraph,
} from '@/lib/quiz-graph'
import {
  createQuiz, saveQuiz, cloneQuiz, deleteQuiz, setQuizArchived,
  saveQuizDeployment, deleteQuizDeployment,
} from '@/app/(app)/admin/(top)/quizzes/actions'
import { buildQuizEmbedSnippet, QUIZ_EMBED_INCOMPLETE } from '@/lib/quiz-embed'
import { selectableOptions } from '@/lib/selectable'
import { TemplateLibrary } from '@/components/builder/templates/TemplateLibrary'
import { BrandQuickEdit } from '../brand/BrandQuickEdit'
import {
  DESTINATION_KEYS, DESTINATION_LABELS, resolveDestination, destinationOrigin, isSafeDestinationUrl,
} from '@/lib/quiz-destinations'

/**
 * Save status indicator. The builder autosaves, so the useful signal is not "is
 * there a Save button" but "is my work actually on the server yet" - which is
 * also what lets Back skip the confirm dialog entirely when nothing is pending.
 */
const SaveIndicator = ({ state }) => {
  const map = {
    saved: { color: T.success, icon: Check, label: 'Saved' },
    pending: { color: T.warning, icon: null, label: 'Unsaved' },
    saving: { color: T.info, icon: Loader2, label: 'Saving...' },
    error: { color: T.danger, icon: AlertTriangle, label: 'Save failed' },
  }
  const s = map[state] || map.saved
  const Icon = s.icon
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: s.color, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
    {Icon && <Icon size={11} style={state === 'saving' ? { animation: 'spin 1s linear infinite' } : undefined} />}
    {s.label}
  </span>
}

const QuizBuilderTopBar = ({
  view, quizName, onBack, onSettings, onPreview, onPublish, isPublished, onBackToBuilder, previewSource,
  saveState, onSave, onUndo, onRedo, canUndo, canRedo,
}) => (
  <div style={{ position: 'sticky', top: 0, zIndex: 30, height: 56, backgroundColor: 'rgba(37,46,57,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
    {view === 'builder' && <>
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack}>Back</Btn>
      <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quizName}</span>
        <Pill color={isPublished ? T.success : T.textMute}>{isPublished ? 'LIVE' : 'DRAFT'}</Pill>
      </div>
      <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn
          icon={Undo2}
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? 'Undo (Ctrl/Cmd+Z)' : 'Nothing to undo'}
          style={{ opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'not-allowed' }}
        />
        <IconBtn
          icon={Redo2}
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo ? 'Redo (Ctrl/Cmd+Shift+Z)' : 'Nothing to redo'}
          style={{ opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'not-allowed' }}
        />
      </div>
    </>}
    {view === 'deploymentEdit' && <>
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack}>Back</Btn>
      <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
      <span style={{ fontSize: 13, color: T.text, fontWeight: 600, letterSpacing: '-0.01em' }}>Deployment</span>
    </>}
    <div style={{ flex: 1 }} />
    {view === 'builder' && <>
      <SaveIndicator state={saveState} />
      <Btn variant="secondary" size="sm" icon={Settings} onClick={onSettings}>Settings</Btn>
      <Btn variant="secondary" size="sm" icon={Eye} onClick={onPreview}>Preview</Btn>
      <Btn
        variant={saveState === 'error' ? 'danger' : 'secondary'}
        size="sm"
        icon={Save}
        onClick={onSave}
        disabled={saveState === 'saved' || saveState === 'saving'}
        title={saveState === 'error' ? 'Retry saving' : saveState === 'saved' ? 'Everything is saved' : 'Save now (Ctrl/Cmd+S)'}
        style={{ opacity: (saveState === 'saved' || saveState === 'saving') ? 0.5 : 1 }}
      >{saveState === 'error' ? 'Retry Save' : 'Save'}</Btn>
      <Btn variant={isPublished ? 'danger' : 'primary'} size="sm" icon={isPublished ? PowerOff : Power} onClick={onPublish}>{isPublished ? 'Unpublish' : 'Publish'}</Btn>
    </>}
    {view === 'preview' && <Btn variant="secondary" size="sm" icon={ChevronLeft} onClick={onBackToBuilder}>{previewSource === 'list-deployments' ? 'Back to Deployments' : previewSource === 'list-quizzes' ? 'Back to Quizzes' : 'Back to Builder'}</Btn>}
  </div>
)

const QuizBuilderTabBar = ({ active, onChange }) => {
  // Three surfaces, and the third is not a nicety. "Which twenty templates are
  // there" was a question the product could not answer: the only way to see one
  // was to already be editing a deployment, so people picked whatever was
  // already selected. The catalogue is the STOCK registry, never the quizzes
  // people have built - see TemplateLibrary for why that distinction is load
  // bearing.
  const tabs = [
    { id: 'quizzes', label: 'Quiz Builder', icon: ListChecks },
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  ]
  return <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', borderBottom: `1px solid ${T.border}` }}>
    {tabs.map((t) => {
      const isActive = active === t.id
      const Icon = t.icon
      return <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: '14px 18px', backgroundColor: 'transparent', border: 'none', borderBottom: `2px solid ${isActive ? T.primary : 'transparent'}`, color: isActive ? T.text : T.textMute, fontSize: 13, fontWeight: 500, fontFamily: '"Inter", sans-serif', cursor: 'pointer', marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.005em' }}>
        <Icon size={14} /> {t.label}
      </button>
    })}
  </div>
}

const QuizListView = ({
  quizzes, brands, deployments, scope, onScopeChange,
  onOpen, onClone, onDelete, onTogglePublish, onPreview, onRename, onArchive,
}) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const startRename = (q) => { setRenamingId(q.id); setRenameDraft(q.name) }
  const commitRename = () => { if (renamingId && renameDraft.trim()) onRename?.(renamingId, renameDraft.trim()); setRenamingId(null) }

  const activeCount = quizzes.filter((q) => !q.isArchived).length
  const archivedCount = quizzes.filter((q) => q.isArchived).length
  const showingArchived = scope === 'archived'
  const shown = quizzes.filter((q) => (showingArchived ? q.isArchived : !q.isArchived))

  const scopes = [
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'archived', label: 'Archived', count: archivedCount },
  ]

  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {scopes.map((s) => {
        const active = scope === s.id
        return <button
          key={s.id}
          onClick={() => onScopeChange(s.id)}
          style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, backgroundColor: active ? T.primarySoft : T.bgElev, border: `1px solid ${active ? T.primary : T.border}`, color: active ? T.primary : T.textMute, cursor: 'pointer', fontFamily: '"Inter", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {s.id === 'archived' && <Archive size={11} />}
          {s.label}
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, opacity: 0.8 }}>{s.count}</span>
        </button>
      })}
      {showingArchived && <span style={{ fontSize: 11, color: T.textMute, marginLeft: 6 }}>
        Archived quizzes are always unpublished. Restore one to edit or publish it again.
      </span>}
    </div>

    {shown.length === 0 ? <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textMute }}>
      {showingArchived ? 'Nothing archived.' : activeCount === 0 && archivedCount > 0 ? 'No active quizzes. Check the Archived tab.' : 'No quizzes yet.'}
    </div> :
      shown.map((q) => {
        const quizDeployments = deployments.filter((d) => d.quizId === q.id)
        const liveDeployments = quizDeployments.filter((d) => d.status === 'live').length
        const usedBrandNames = [...new Set(quizDeployments.map((d) => brands.find((b) => b.id === d.brandId)?.displayName).filter(Boolean))]
        return <div key={q.id} style={{ backgroundColor: T.bgElev, border: `1px solid ${q.isArchived ? T.border : T.border}`, borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20, opacity: q.isArchived ? 0.75 : 1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: q.isArchived ? T.bgElev2 : q.isPublished ? T.primarySoft : T.bgElev2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: q.isArchived ? T.textLow : q.isPublished ? T.primary : T.textMute, flexShrink: 0 }}>
            {q.isArchived ? <Archive size={18} /> : <ListChecks size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {renamingId === q.id ? (
                <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }} style={{ flex: 1, maxWidth: 360, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 15, fontWeight: 600, outline: 'none' }} />
              ) : (
                <div onClick={(e) => { e.stopPropagation(); startRename(q) }} style={{ fontSize: 15, color: T.text, fontWeight: 600, letterSpacing: '-0.01em', cursor: 'text' }} title="Click to rename">{q.name}</div>
              )}
              {q.isArchived
                ? <Pill color={T.textMute}>ARCHIVED</Pill>
                : <Pill color={q.isPublished ? T.success : T.textMute}>{q.isPublished ? 'LIVE' : 'DRAFT'}</Pill>}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', flexWrap: 'wrap' }}>
              <span>{q.steps.length} steps</span><span>·</span><span>{q.nodes.length} variants</span><span>·</span><span>{q.tiers.length} tiers</span>
              {quizDeployments.length > 0 && <><span>·</span><span style={{ color: T.info }}>{quizDeployments.length} deployment{quizDeployments.length === 1 ? '' : 's'}{liveDeployments > 0 ? ` (${liveDeployments} live)` : ''}</span></>}
              {usedBrandNames.length > 0 && <><span>·</span><span style={{ color: T.purple }}>{usedBrandNames.join(', ')}</span></>}
              {q.isArchived && q.archivedAt && <><span>·</span><span>archived {new Date(q.archivedAt).toLocaleDateString()}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {q.isArchived ? <>
              <Btn variant="secondary" size="sm" icon={ArchiveRestore} onClick={() => onArchive(q.id, false)}>Restore</Btn>
              <IconBtn icon={Trash2} onClick={() => onDelete(q.id)} style={{ color: T.danger }} title="Delete permanently" />
            </> : <>
              <Btn variant="secondary" size="sm" icon={Eye} onClick={() => onPreview(q.id)}>Preview</Btn>
              <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(q.id)}>Edit</Btn>
              <IconBtn icon={Copy} onClick={() => onClone(q.id)} title="Clone" />
              <IconBtn icon={q.isPublished ? PowerOff : Power} onClick={() => onTogglePublish(q.id)} title={q.isPublished ? 'Unpublish' : 'Publish'} />
              <IconBtn icon={Archive} onClick={() => onArchive(q.id, true)} title="Archive" />
              <IconBtn icon={Trash2} onClick={() => onDelete(q.id)} style={{ color: T.danger }} title="Delete" />
            </>}
          </div>
        </div>
      })}
  </div>
}

const DeploymentListView = ({ deployments, quizzes, brands, onOpen, onClone, onDelete, onToggleStatus, onCopyEmbed, onPreview, onRename }) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const startRename = (d) => { setRenamingId(d.id); setRenameDraft(d.name || '') }
  const commitRename = () => { if (renamingId) onRename?.(renamingId, renameDraft.trim()); setRenamingId(null) }
  return <div style={{ display: 'grid', gap: 12 }}>
    {deployments.length === 0 ? <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textMute }}>No deployments yet. A deployment maps a quiz and brand to a live URL.</div> :
      deployments.map((d) => {
        const q = quizzes.find((x) => x.id === d.quizId)
        const brand = brands.find((x) => x.id === d.brandId)
        const orphaned = !!d.brandId && !brand
        const domainStr = d.domain || ''
        const url = domainStr ? `https://${domainStr}${d.path || ''}` : `https://preview.legenex.com/q/${d.id}`
        const depName = d.name || (q ? `${q.name} · ${brand?.displayName || 'No brand'}` : 'Untitled deployment')
        const primary = brand?.colors?.primary
        const background = brand?.colors?.background
        return <div key={d.id} style={{ backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: primary ? `linear-gradient(135deg, ${primary}, ${background || primary})` : T.bgElev2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, overflow: 'hidden' }}>
            {brand?.faviconUrl ? <img loading="lazy" decoding="async" src={brand.faviconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : brand ? brandShortName(brand) : <Rocket size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {renamingId === d.id ? (
                <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }} style={{ flex: 1, maxWidth: 360, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 14, fontWeight: 600, outline: 'none' }} />
              ) : (
                <div onClick={(e) => { e.stopPropagation(); startRename(d) }} style={{ fontSize: 14, color: T.text, fontWeight: 600, cursor: 'text' }} title="Click to rename">{depName}</div>
              )}
              <Pill color={d.status === 'live' ? T.success : d.status === 'paused' ? T.warning : T.textMute}>{(d.status || 'draft').toUpperCase()}</Pill>
              {!domainStr && <Pill color={T.info}>PREVIEW URL</Pill>}
              {orphaned && <Pill color={T.warning}>Brand missing, select a new brand to fix</Pill>}
              {d.renderMode && <Pill color={d.renderMode === 'embed' ? T.info : T.purple}>{(d.renderMode || 'standalone').toUpperCase()}</Pill>}
              {d.templateId && <Pill color={T.textMute}>{(d.templateId || 'default').toUpperCase()}</Pill>}
            </div>
            <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: T.textLow, fontFamily: '"JetBrains Mono", monospace', flexWrap: 'wrap' }}>
              <span>quiz: {q?.name || '.'}</span><span>·</span>
              <span style={{ color: primary || T.textMute }}>brand: {brand?.displayName || '.'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="secondary" size="sm" icon={Eye} onClick={() => onPreview(d.id)} aria-label="Preview deployment">Preview</Btn>
            {d.renderMode === 'embed' && <Btn variant="secondary" size="sm" icon={Code2} onClick={() => onCopyEmbed(d.id)} aria-label="Copy embed code">Embed Code</Btn>}
            <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(d.id)} aria-label="Edit deployment">Edit</Btn>
            <IconBtn icon={Copy} onClick={() => onClone(d.id)} aria-label="Duplicate deployment" />
            <IconBtn icon={d.status === 'live' ? PowerOff : Power} onClick={() => onToggleStatus(d.id)} aria-label={d.status === 'live' ? 'Unpublish deployment' : 'Publish deployment'} />
            <IconBtn icon={Trash2} onClick={() => onDelete(d.id)} style={{ color: T.danger }} aria-label="Delete deployment" />
          </div>
        </div>
      })}
  </div>
}

const ListShell = ({ tab, onTabChange, onCreate, children }) => {
  const createLabel = { quizzes: 'New Quiz', deployments: 'New Deployment' }[tab]
  const subheading = {
    quizzes: 'Flow logic. The questions, routing, tier conditions.',
    deployments: 'Live URLs. A quiz at a domain and path under a specific brand.',
    templates: 'The stock visual library. Every preview is a real render, not a picture of one.',
  }[tab]
  return <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
    {/* The Templates tab is a catalogue, not a workspace: there is nothing to
        create on it, and an action that did nothing would be worse than none. */}
    <PageHeader title="Quizzes" subtitle={subheading} primaryAction={createLabel ? <Btn variant="primary" size="md" icon={Plus} onClick={onCreate}>{createLabel}</Btn> : null} />
    <QuizBuilderTabBar active={tab} onChange={onTabChange} />
    <div style={{ marginTop: 18 }}>{children}</div>
  </div>
}

const TrackingTab = ({ draft, update }) => {
  const pixels = draft.pixels || {}
  const updPixel = (provider, p) => update({ pixels: { ...pixels, [provider]: { ...(pixels[provider] || {}), ...p } } })
  const updUtm = (p) => update({ utm: { ...(draft.utm || {}), ...p } })
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10 }}>UTM Defaults</div>
      <div style={{ fontSize: 11, color: T.textMute, marginBottom: 10 }}>Used when no UTM parameters are passed in the URL. Captured params override these.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div><Label>Source</Label><Input mono value={(draft.utm || {}).source || ''} onChange={(e) => updUtm({ source: e.target.value })} placeholder="meta" /></div>
        <div><Label>Medium</Label><Input mono value={(draft.utm || {}).medium || ''} onChange={(e) => updUtm({ medium: e.target.value })} placeholder="cpc" /></div>
        <div><Label>Campaign</Label><Input mono value={(draft.utm || {}).campaign || ''} onChange={(e) => updUtm({ campaign: e.target.value })} placeholder="mva_q1" /></div>
      </div>
    </div>
    <div style={{ fontSize: 10, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 8 }}>Pixels & CAPI Providers</div>
    {PIXEL_PROVIDERS.map((p) => {
      const cfg = pixels[p.id] || { enabled: false }
      return <div key={p.id} style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cfg.enabled ? 12 : 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: `${p.color}22`, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>{p.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{p.label}</div>
            <div style={{ fontSize: 11, color: T.textMute }}>{p.fields.length} configuration field{p.fields.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={() => updPixel(p.id, { enabled: !cfg.enabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: cfg.enabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${cfg.enabled ? T.success : T.border}`, color: cfg.enabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{cfg.enabled ? 'ENABLED' : 'DISABLED'}</button>
        </div>
        {cfg.enabled && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.fields.map(([fkey, flabel]) => <div key={fkey}><Label>{flabel}</Label><Input mono value={cfg[fkey] || ''} onChange={(e) => updPixel(p.id, { [fkey]: e.target.value })} /></div>)}
        </div>}
      </div>
    })}
  </div>
}

/**
 * Per-deployment destination overrides.
 *
 * Shows the URL each destination will ACTUALLY resolve to and where that value
 * came from, rather than an empty box that hides an inherited value. An empty
 * override field is not "no destination" - it means "use the brand's", and the
 * panel says so, so nobody sets a redirect they think is unconfigured.
 */
const DestinationsPanel = ({ draft, brand, onChange }) => {
  const overrides = draft.destinationOverrides || {}
  const ctx = { deployment: overrides, brand: brand?.urls }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ fontSize: 12.5, color: T.textMute, lineHeight: 1.55 }}>
      Quiz nodes point at a destination by name, so this deployment can send traffic somewhere different
      from the brand&apos;s default without editing the quiz. Leave a field blank to inherit.
      {brand ? null : ' Pick a brand on the Basics tab to see what would be inherited.'}
    </div>
    {DESTINATION_KEYS.map((key) => {
      const value = overrides[key] || ''
      const resolved = resolveDestination(key, ctx)
      const origin = destinationOrigin(key, ctx)
      const invalid = value && !isSafeDestinationUrl(value)
      return <div key={key}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Label style={{ marginBottom: 0 }}>{DESTINATION_LABELS[key]}</Label>
          <Pill color={origin === 'deployment' ? T.primary : origin === 'brand' ? T.info : T.textMute}>
            {origin === 'deployment' ? 'THIS DEPLOYMENT' : origin === 'brand' ? 'FROM BRAND' : 'SITE DEFAULT'}
          </Pill>
        </div>
        <Input mono value={value} onChange={(e) => onChange(key, e.target.value)} placeholder={resolved} />
        <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
          resolves to {resolved}
        </div>
        {invalid ? <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>
          Not a usable link. Use a full https:// address or a path starting with /.
        </div> : null}
      </div>
    })}
  </div>
}

const DeploymentEditor = ({ deployment, isDraft, quizzes, brands, onBrandSaved, onSave, onBack }) => {
  const [draft, setDraft] = useState(deployment)
  const [dirty, setDirty] = useState(isDraft || false)
  const [tab, setTab] = useState('basics')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [leaveReq, setLeaveReq] = useState(false)
  useEffect(() => { setDraft(deployment); setDirty(isDraft || false) }, [deployment, isDraft])
  const update = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true) }
  const updHeader = (p) => update({ headerConfig: { ...draft.headerConfig, ...p } })
  const updHeaderCta = (p) => updHeader({ ctaButton: { ...(draft.headerConfig?.ctaButton || {}), ...p } })
  const updFooter = (p) => update({ footerConfig: { ...draft.footerConfig, ...p } })

  // The brand paints the quiz. A deployment picks a template; it never authors
  // a colour, so what the contrast audit below judges IS what ships.
  const brand = brands.find((b) => b.id === draft.brandId)
  // Pickers go through one helper so archived records are never offered and a
  // saved reference to one is never silently dropped. See src/lib/selectable.ts.
  const quizOptions = selectableOptions({
    records: quizzes,
    selectedId: draft.quizId,
    toRecord: (q) => ({ id: q.id, label: q.name, status: q.isArchived ? 'archived' : q.isPublished ? 'published' : 'draft' }),
  })

  // Only a domain that is active AND holds an active certificate can serve a
  // funnel. Anything else is offered disabled rather than hidden, so "why is my
  // domain not in the list" has an answer on screen.
  const brandDomains = (brands.find((b) => b.id === draft.brandId)?.__domains ?? [])
  const domainOptions = selectableOptions({
    records: brandDomains,
    selectedId: draft.domain,
    toRecord: (d) => ({
      id: d.host,
      label: `${d.host}${d.primary ? '  (primary)' : ''}${d.status !== 'active' ? `  - ${d.status}` : d.sslStatus !== 'active' ? '  - certificate pending' : ''}`,
      status: 'published',
      meta: { ready: d.status === 'active' && d.sslStatus === 'active' },
    }),
    isEligible: (_rec, d) => d.status === 'active' && d.sslStatus === 'active',
  })

  const isOverriding = draft.bodySectionOverrides !== null && draft.bodySectionOverrides !== undefined
  const effectiveSections = isOverriding ? draft.bodySectionOverrides : (brand?.defaultBodySections || [])
  const toggleOverride = () => { if (isOverriding) update({ bodySectionOverrides: null }); else update({ bodySectionOverrides: JSON.parse(JSON.stringify(brand?.defaultBodySections || [])) }) }
  const updSection = (s) => update({ bodySectionOverrides: effectiveSections.map((x) => x.id === s.id ? s : x) })
  const delSection = (id) => update({ bodySectionOverrides: effectiveSections.filter((s) => s.id !== id) })
  const addSection = (type) => { update({ bodySectionOverrides: [...effectiveSections, { id: genId('s'), type, enabled: true, config: {} }] }); setPickerOpen(false) }
  const moveSection = (idx, dir) => { const a = [...effectiveSections]; const ni = idx + dir; if (ni < 0 || ni >= a.length) return;[a[idx], a[ni]] = [a[ni], a[idx]]; update({ bodySectionOverrides: a }) }

  const handleBack = () => { if (dirty) setLeaveReq(true); else onBack() }
  const handleSave = () => { onSave(draft); setDirty(false) }
  const handleSaveAndExit = () => { onSave(draft); setDirty(false); onBack() }

  const embedCode = buildQuizEmbedSnippet({ deploymentId: draft.id, domain: draft.domain, path: draft.path })

  const tabs = [
    { id: 'basics', label: 'Basics' },
    { id: 'render', label: 'Render & Embed' },
    { id: 'destinations', label: `Destinations${Object.keys(draft.destinationOverrides || {}).length ? ' · OVERRIDE' : ''}` },
    { id: 'chrome', label: 'Header / Footer', show: draft.renderMode === 'standalone' },
    { id: 'sections', label: `Body Sections${isOverriding ? ' · OVERRIDE' : ''}`, show: draft.renderMode === 'standalone' },
    { id: 'tracking', label: 'Tracking & Pixels' },
  ].filter((t) => t.show !== false)

  return <>
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: T.bg }}>
      <div style={{ padding: '24px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 24, color: T.text, fontWeight: 700, letterSpacing: '-0.025em', fontFamily: '"JetBrains Mono", monospace' }}>{draft.domain}{draft.path}</div>
              {isDraft && <Pill color={T.warning}>NEW · NOT SAVED</Pill>}
            </div>
            <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>{(quizzes.find((q) => q.id === draft.quizId) || {}).name || '-'} · {(brands.find((b) => b.id === draft.brandId) || {}).displayName || '-'} · {draft.renderMode}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {dirty && !isDraft && <Pill color={T.warning} style={{ alignSelf: 'center' }}>UNSAVED</Pill>}
            <Btn variant="ghost" size="md" onClick={handleBack}>Back</Btn>
            <Btn variant="secondary" size="md" icon={Save} onClick={handleSave}>Save</Btn>
            <Btn variant="primary" size="md" icon={Save} onClick={handleSaveAndExit}>Save & Exit</Btn>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 22, overflowX: 'auto' }}>
          {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '11px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? T.primary : 'transparent'}`, color: tab === t.id ? T.text : T.textMute, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>{t.label}</button>)}
        </div>

        {tab === 'basics' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Quiz</Label>
              <Select value={draft.quizId} onChange={(e) => update({ quizId: e.target.value })}>
                <option value="">- pick quiz -</option>
                {quizOptions.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' · ARCHIVED' : ''}</option>)}
              </Select>
              {quizOptions.some((o) => o.archived) && <div style={{ fontSize: 10.5, color: T.warning, marginTop: 4 }}>
                This deployment points at an archived quiz. Restore it on the Quizzes tab, or pick another. It is kept here rather than dropped so the reference is not lost silently.
              </div>}
            </div>
            <div><Label>Brand</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select value={draft.brandId} onChange={(e) => update({ brandId: e.target.value })}><option value="">- pick brand -</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.displayName}</option>)}</Select>
                </div>
                {/* Beside the picker, because the moment you notice a colour is
                    wrong is the moment you are looking at which brand is set. */}
                <BrandQuickEdit brand={brands.find((b) => b.id === draft.brandId)} onSaved={onBrandSaved} align="right" />
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <Label>Domain</Label>
              {domainOptions.length > 0 ? (
                <Select value={draft.domain} onChange={(e) => update({ domain: e.target.value })}>
                  <option value="">- pick domain -</option>
                  {domainOptions.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}</option>)}
                </Select>
              ) : (
                <div style={{ padding: 10, backgroundColor: T.bgElev, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11.5, color: T.warning }}>
                  {draft.brandId
                    ? <>This brand has no domain with an active certificate yet. <a href="/admin/brands/domains" style={{ color: T.info }}>Connect a domain</a>, then come back.</>
                    : 'Pick a brand first. Domains are listed per brand.'}
                </div>
              )}
              {domainOptions.some((o) => o.disabled) && <div style={{ fontSize: 10.5, color: T.warning, marginTop: 4 }}>
                A domain shown greyed out is not ready to serve traffic. Publishing to it is blocked until its status and certificate are both active.
              </div>}
            </div>
            <div><Label>Path</Label><Input mono value={draft.path} onChange={(e) => update({ path: e.target.value })} placeholder="/s/mva" /></div>
          </div>
          <div><Label>Status</Label><Select value={draft.status} onChange={(e) => update({ status: e.target.value })}><option value="draft">Draft</option><option value="live">Live</option><option value="paused">Paused</option></Select></div>
        </div>}

        {tab === 'render' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Label>Render Mode</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {RENDER_MODES.map((m) => {
                const active = draft.renderMode === m.id
                return <button key={m.id} onClick={() => update({ renderMode: m.id })} style={{ padding: 14, backgroundColor: active ? T.bgElev2 : T.bgElev, border: `1px solid ${active ? T.primary : T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11.5, color: T.textMute }}>{m.desc}</div>
                </button>
              })}
            </div>
          </div>
          <div>
            <Label>Visual Template</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {QUIZ_TEMPLATES.map((t) => {
                const active = (draft.templateId || 'minimal') === t.id
                // Color-overlap detector: flag any template that would render
                // unreadable text for THIS brand before it ships.
                const violations = brand ? auditQuizTemplateColors(t.id, brand) : []
                const hasError = violations.some((v) => v.severity === 'error')
                const hasWarn = violations.length > 0
                return <button key={t.id} onClick={() => update({ templateId: t.id })} title={hasWarn ? violations.map((v) => v.message).join('\n') : undefined} style={{ padding: 10, backgroundColor: active ? T.bgElev2 : T.bgElev, border: `1px solid ${active ? T.primary : hasError ? T.danger : T.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: T.text, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <TemplatePreview spec={resolveQuizTemplate(t.id)} brand={brand} progress={active ? draft.progressForm : null} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${active ? T.primary : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: T.primary }} />}</div>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{t.code}</span>
                    {hasWarn && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, letterSpacing: '0.04em', backgroundColor: hasError ? `${T.danger}22` : `${T.warning}22`, color: hasError ? T.danger : T.warning }}>{hasError ? 'LOW CONTRAST' : 'CHECK'}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.4 }}>{t.desc}</div>
                </button>
              })}
            </div>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6 }}>Brand colours still apply. The template controls width, answers, typography and icon policy. A <span style={{ color: T.warning }}>CHECK</span> / <span style={{ color: T.danger }}>LOW CONTRAST</span> tag means this template plus the selected brand has a colour overlap that hurts readability.</div>
          </div>

          <div>
            <Label>Progress</Label>
            {/* What the template would show if nothing is overridden, named so
                "Match the template" is a concrete choice rather than a blank. */}
            <Select
              value={draft.progressForm || ''}
              onChange={(e) => update({ progressForm: e.target.value || null })}
            >
              <option value="">
                Match the template ({PROGRESS_FORM_LABELS.find((p) => p.id === resolveQuizTemplate(draft.templateId).progress)?.label ?? 'template default'})
              </option>
              {PROGRESS_FORM_LABELS.map((p) => (
                <option key={p.id} value={p.id}>{p.label} {'·'} from {p.from}</option>
              ))}
            </Select>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6, lineHeight: 1.5 }}>
              Each template comes with its own way of showing progress. Change it here to borrow another one without changing anything else about the template: the width, the answers and the icons stay as they are.
            </div>
          </div>
          {draft.renderMode === 'embed' && <>
            <div>
              <Label>Embed Preview Background</Label>
              <div style={{ display: 'flex', gap: 5 }}>
                <input type="color" value={draft.embedPreviewBg || '#0a1a3a'} onChange={(e) => update({ embedPreviewBg: e.target.value })} style={{ width: 40, height: 32, padding: 2, border: `1px solid ${T.border}`, borderRadius: 6, backgroundColor: T.bg, cursor: 'pointer' }} />
                <Input mono value={draft.embedPreviewBg || ''} onChange={(e) => update({ embedPreviewBg: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Label style={{ marginBottom: 0 }}>Embed Code</Label>
                <Btn variant="secondary" size="xs" icon={Copy} onClick={() => { if (embedCode) navigator.clipboard.writeText(embedCode) }} disabled={!embedCode} style={!embedCode ? { opacity: 0.5 } : {}}>Copy</Btn>
              </div>
              {embedCode
                ? <>
                  <pre style={{ margin: 0, padding: 12, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, color: T.textDim, overflow: 'auto' }}>{embedCode}</pre>
                  <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6 }}>Paste this on any page. The loader is served from this deployment&apos;s own domain, so there is no third-party script and no CORS setup. The frame reports its height as the visitor moves through the quiz, so it grows and shrinks in place.</div>
                </>
                : <div style={{ padding: 12, backgroundColor: T.bg, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11.5, color: T.warning }}>{QUIZ_EMBED_INCOMPLETE}</div>}
            </div>
          </>}
        </div>}

        {tab === 'destinations' && <DestinationsPanel
          draft={draft}
          brand={brand}
          onChange={(key, value) => {
            const next = { ...(draft.destinationOverrides || {}) }
            if (value.trim()) next[key] = value
            else delete next[key]
            update({ destinationOverrides: Object.keys(next).length ? next : null })
          }}
        />}

        {tab === 'chrome' && <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10 }}>Header</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <button onClick={() => updHeader({ logoEnabled: !draft.headerConfig?.logoEnabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: draft.headerConfig?.logoEnabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${draft.headerConfig?.logoEnabled ? T.success : T.border}`, color: draft.headerConfig?.logoEnabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{draft.headerConfig?.logoEnabled ? 'ON LOGO' : 'OFF LOGO'}</button>
              <button onClick={() => updHeaderCta({ enabled: !(draft.headerConfig?.ctaButton || {}).enabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: (draft.headerConfig?.ctaButton || {}).enabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${(draft.headerConfig?.ctaButton || {}).enabled ? T.success : T.border}`, color: (draft.headerConfig?.ctaButton || {}).enabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{(draft.headerConfig?.ctaButton || {}).enabled ? 'ON CTA BUTTON' : 'OFF CTA BUTTON'}</button>
            </div>
            {(draft.headerConfig?.ctaButton || {}).enabled && <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8 }}>
              <div><Label>CTA Text</Label><Input value={(draft.headerConfig?.ctaButton || {}).text || ''} onChange={(e) => updHeaderCta({ text: e.target.value })} /></div>
              <div><Label>CTA URL</Label><Input mono value={(draft.headerConfig?.ctaButton || {}).url || ''} onChange={(e) => updHeaderCta({ url: e.target.value })} placeholder="tel:+1..." /></div>
              <div><Label>Font Size</Label><Input type="number" value={(draft.headerConfig?.ctaButton || {}).fontSize || 11} onChange={(e) => updHeaderCta({ fontSize: parseInt(e.target.value) || 11 })} /></div>
            </div>}
          </div>
          <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 10 }}>Footer</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <button onClick={() => updFooter({ logoEnabled: !draft.footerConfig?.logoEnabled })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: draft.footerConfig?.logoEnabled ? `${T.success}22` : T.bgElev2, border: `1px solid ${draft.footerConfig?.logoEnabled ? T.success : T.border}`, color: draft.footerConfig?.logoEnabled ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{draft.footerConfig?.logoEnabled ? 'ON LOGO' : 'OFF LOGO'}</button>
              <button onClick={() => updFooter({ showCopyright: !draft.footerConfig?.showCopyright })} style={{ padding: '6px 11px', borderRadius: 5, fontSize: 10.5, fontWeight: 600, backgroundColor: draft.footerConfig?.showCopyright ? `${T.success}22` : T.bgElev2, border: `1px solid ${draft.footerConfig?.showCopyright ? T.success : T.border}`, color: draft.footerConfig?.showCopyright ? T.success : T.textMute, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{draft.footerConfig?.showCopyright ? 'ON COPYRIGHT' : 'OFF COPYRIGHT'}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><Label>Logo Size (px)</Label><Input type="number" value={draft.footerConfig?.logoSize || 32} onChange={(e) => updFooter({ logoSize: parseInt(e.target.value) || 32 })} /></div>
              <div><Label>Font Size (px)</Label><Input type="number" value={draft.footerConfig?.fontSize || 12} onChange={(e) => updFooter({ fontSize: parseInt(e.target.value) || 12 })} /></div>
            </div>
          </div>
        </div>}

        {tab === 'sections' && <div>
          <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{isOverriding ? 'Using Custom Sections' : `Inheriting from Brand: ${brand?.displayName || 'none'}`}</div>
              <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 2 }}>{isOverriding ? 'These sections only apply to this deployment' : 'Changes to the brand will reflect here'}</div>
            </div>
            <Btn variant={isOverriding ? 'danger' : 'secondary'} size="md" onClick={toggleOverride}>{isOverriding ? 'Reset to Brand Default' : 'Override for this Deployment'}</Btn>
          </div>
          {effectiveSections.map((s, i) => isOverriding ?
            <BodySectionEditor key={s.id} section={s} onUpdate={updSection} onDelete={() => delSection(s.id)} onMoveUp={() => moveSection(i, -1)} onMoveDown={() => moveSection(i, 1)} /> :
            <div key={s.id} style={{ padding: 12, backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7 }}>
              <Pill color={s.enabled ? T.success : T.textMute}>{s.enabled ? 'ON' : 'OFF'}</Pill>
              <div style={{ fontSize: 12.5, color: T.text }}>{BODY_SECTION_DEFS[s.type]?.label || s.type}</div>
              <div style={{ flex: 1, fontSize: 11, color: T.textMute }}>read-only · override to edit</div>
            </div>,
          )}
          {isOverriding && <Btn variant="secondary" size="md" icon={Plus} onClick={() => setPickerOpen(true)} style={{ marginTop: 8 }}>Add Section</Btn>}
        </div>}

        {tab === 'tracking' && <TrackingTab draft={draft} update={update} />}
      </div>
    </div>
    {pickerOpen && <AddBodySectionPicker onPick={addSection} onClose={() => setPickerOpen(false)} />}
    <ConfirmDialog open={leaveReq} title={isDraft ? 'Discard new deployment?' : 'Leave deployment editor?'} message={isDraft ? 'This deployment has not been saved and will be discarded.' : 'You have unsaved changes.'} confirmText={isDraft ? 'Discard' : 'Save & Leave'} cancelText="Stay" tertiaryText={isDraft ? null : 'Discard'} onConfirm={() => { if (isDraft) { setLeaveReq(false); onBack() } else { handleSave(); setLeaveReq(false); onBack() } }} onCancel={() => setLeaveReq(false)} onTertiary={() => { setLeaveReq(false); onBack() }} />
  </>
}

const EmbedCodeModal = ({ deployment, onClose }) => {
  if (!deployment) return null
  const code = buildQuizEmbedSnippet({ deploymentId: deployment.id, domain: deployment.domain, path: deployment.path })
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, color: T.text, fontWeight: 600 }}>Embed Code</div>
          <div style={{ fontSize: 12, color: T.textMute, marginTop: 2, fontFamily: '"JetBrains Mono", monospace' }}>{deployment.domain}{deployment.path}</div>
        </div>
        <div style={{ flex: 1 }} />
        <IconBtn icon={X} onClick={onClose} />
      </div>
      {code
        ? <pre style={{ margin: 0, padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: T.textDim, overflow: 'auto' }}>{code}</pre>
        : <div style={{ padding: 14, backgroundColor: T.bgElev, border: `1px solid ${T.warning}`, borderRadius: 8, fontSize: 12.5, color: T.warning }}>{QUIZ_EMBED_INCOMPLETE}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
        <Btn variant="ghost" size="md" onClick={onClose}>Close</Btn>
        <Btn variant="primary" size="md" icon={Copy} onClick={() => code && navigator.clipboard.writeText(code)} disabled={!code} style={!code ? { opacity: 0.5 } : {}}>Copy to Clipboard</Btn>
      </div>
    </div>
  </div>
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================
export function QuizBuilderApp({ initialQuizzes, initialDeployments, brands: initialBrands }) {
  // Held locally so a brand edit made from inside the builder repaints the
  // preview at once instead of after a reload.
  const [brands, setBrands] = useState(initialBrands)
  const onBrandSaved = (next) => setBrands((prev) => prev.map((b) => (b.siteId === next.siteId ? { ...b, ...next } : b)))
  const router = useRouter()
  const [tab, setTab] = useState('quizzes')
  const [quizScope, setQuizScope] = useState('active')
  const [view, setView] = useState('list')
  const [quizzes, setQuizzes] = useState(initialQuizzes)
  const [deployments, setDeployments] = useState(initialDeployments)
  const [draftDeployment, setDraftDeployment] = useState(null)
  const [currentQuizId, setCurrentQuizId] = useState(null)
  const [currentDeploymentId, setCurrentDeploymentId] = useState(null)
  const [selectedStepKey, setSelectedStepKey] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [previewNodeId, setPreviewNodeId] = useState(null)
  const [previewSource, setPreviewSource] = useState('builder')
  const [previewDeploymentId, setPreviewDeploymentId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [pendingTiers, setPendingTiers] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingStepDelete, setPendingStepDelete] = useState(null)
  const [pendingArchive, setPendingArchive] = useState(null)
  const [showEmbed, setShowEmbed] = useState(null)
  const [leaveBuilderReq, setLeaveBuilderReq] = useState(false)
  const [toast, setToast] = useState(null)

  // --- save state -----------------------------------------------------------
  // The builder autosaves on a debounce, so "dirty" is not a boolean the UI can
  // guess at: it is the gap between the last edit and the last acknowledged
  // write. Tracking that gap with sequence numbers gives an accurate status, an
  // explicit Save that flushes now, and - the point of the request - a Back
  // action that only interrupts the user when a save is actually outstanding.
  const [saveState, setSaveState] = useState('saved')
  const saveTimer = useRef(null)
  const dirtySeq = useRef(0)
  const savedSeq = useRef(0)
  const pendingSave = useRef(null) // { id, quiz } most recent unsaved snapshot

  // --- undo / redo ----------------------------------------------------------
  // Snapshots are stored by reference, not cloned: every mutation path (the
  // quiz-graph ops, patchNode, the modal drafts) is immutable, so an old
  // reference can never be mutated out from under the stack. Cloning whole
  // node graphs on every keystroke would be the expensive way to buy nothing.
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const UNDO_LIMIT = 50

  // Mirror of `quizzes` so a handler can read the result of the edit it just
  // made. React state is async, and several actions chain (save a node, then
  // duplicate it) - reading stale state there would duplicate the old version.
  const quizzesRef = useRef(initialQuizzes)
  const applyQuizzes = useCallback((next) => { quizzesRef.current = next; setQuizzes(next) }, [])

  // Resync from the server only when nothing is outstanding, so a router
  // refresh can never overwrite work that has not been acknowledged yet.
  useEffect(() => {
    if (view !== 'list') return
    if (saveState !== 'saved') return
    quizzesRef.current = initialQuizzes
    setQuizzes(initialQuizzes)
    setDeployments(initialDeployments)
  }, [initialQuizzes, initialDeployments, view, saveState])

  const quizPatch = (q) => ({ name: q.name, slug: q.slug, is_published: q.isPublished, tiers: q.tiers, steps: q.steps, nodes: q.nodes, custom_fields: q.customFields })

  const currentQuiz = quizzes.find((q) => q.id === currentQuizId)
  const currentDeployment = draftDeployment || deployments.find((d) => d.id === currentDeploymentId)
  const selectedNode = currentQuiz?.nodes.find((n) => n.id === selectedNodeId)
  const previewNode = currentQuiz?.nodes.find((n) => n.id === previewNodeId)
  const customFields = currentQuiz?.customFields || []
  const graphIssues = useMemo(() => (currentQuiz ? lintQuizGraph(currentQuiz) : []), [currentQuiz])

  const getQuiz = useCallback((id) => quizzesRef.current.find((q) => q.id === id), [])

  const runSave = useCallback(async () => {
    clearTimeout(saveTimer.current)
    const target = pendingSave.current
    if (!target) { setSaveState('saved'); return true }
    const seq = dirtySeq.current
    if (seq === savedSeq.current) { setSaveState('saved'); return true }
    setSaveState('saving')
    const res = await saveQuiz({ id: target.id, patch: quizPatch(target.quiz) })
    if (!res?.ok) {
      setSaveState('error')
      setToast({ message: `Save failed: ${res?.error || 'unknown error'}`, type: 'error' })
      return false
    }
    savedSeq.current = seq
    if (dirtySeq.current === seq) {
      pendingSave.current = null
      setSaveState('saved')
    } else {
      // An edit landed while the write was in flight; keep the newer one queued.
      setSaveState('pending')
      saveTimer.current = setTimeout(() => { void runSave() }, 450)
    }
    return true
  }, [])

  /** Write a quiz into state and schedule the debounced save. */
  const writeQuiz = useCallback((quiz) => {
    applyQuizzes(quizzesRef.current.map((q) => (q.id === quiz.id ? quiz : q)))
    dirtySeq.current += 1
    pendingSave.current = { id: quiz.id, quiz }
    setSaveState('pending')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void runSave() }, 450)
  }, [applyQuizzes, runSave])

  // Never leave a debounce armed after unmount.
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // The stacks are mirrored in refs so undo/redo can read them synchronously and
  // do their work OUTSIDE a setState updater. Updaters must be pure - React
  // invokes them twice under StrictMode - so writing the quiz or cross-pushing
  // to the other stack from inside one would double-apply in development.
  const undoRef = useRef([])
  const redoRef = useRef([])
  const setUndo = useCallback((next) => { undoRef.current = next; setUndoStack(next) }, [])
  const setRedo = useCallback((next) => { redoRef.current = next; setRedoStack(next) }, [])
  const resetHistory = useCallback(() => { setUndo([]); setRedo([]) }, [setUndo, setRedo])

  const pushUndo = useCallback((snapshot) => {
    setUndo([...undoRef.current, snapshot].slice(-UNDO_LIMIT))
    // A fresh edit invalidates the redo branch.
    setRedo([])
  }, [setUndo, setRedo])

  /**
   * Apply a pure quiz-graph operation to the open quiz: snapshot for undo, then
   * write. Ops that are a no-op return their input by reference, which is the
   * signal to skip both (so a disabled-looking button never burns an undo slot
   * or a save round-trip).
   */
  const mutateQuiz = useCallback((fn) => {
    const q = getQuiz(currentQuizId)
    if (!q) return null
    const next = fn(q)
    if (!next || next === q) return null
    pushUndo(q)
    writeQuiz(next)
    return next
  }, [currentQuizId, getQuiz, pushUndo, writeQuiz])

  const undo = useCallback(() => {
    const stack = undoRef.current
    if (stack.length === 0) return
    const prev = stack[stack.length - 1]
    const live = getQuiz(prev.id)
    setUndo(stack.slice(0, -1))
    if (live) setRedo([...redoRef.current, live].slice(-UNDO_LIMIT))
    writeQuiz(prev)
  }, [getQuiz, writeQuiz, setUndo, setRedo])

  const redo = useCallback(() => {
    const stack = redoRef.current
    if (stack.length === 0) return
    const next = stack[stack.length - 1]
    const live = getQuiz(next.id)
    setRedo(stack.slice(0, -1))
    if (live) setUndo([...undoRef.current, live].slice(-UNDO_LIMIT))
    writeQuiz(next)
  }, [getQuiz, writeQuiz, setUndo, setRedo])

  // Keyboard shortcuts, suppressed while a modal is open or focus is in a text
  // control - undoing quiz structure out from under an open editor draft would
  // discard edits the user can still see on screen.
  const anyModalOpen = !!selectedNode || !!previewNode || showSettings || showAddStep
    || !!pendingDelete || !!pendingStepDelete || !!pendingArchive || !!showEmbed || leaveBuilderReq
  useEffect(() => {
    if (view !== 'builder' || anyModalOpen) return
    const onKey = (e) => {
      const el = e.target
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      if (!(e.metaKey || e.ctrlKey)) return
      const key = (e.key || '').toLowerCase()
      if (key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (key === 'y') { e.preventDefault(); redo() }
      else if (key === 's') { e.preventDefault(); void runSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, anyModalOpen, undo, redo, runSave])

  // Last-resort guard: a browser-level close/reload with a write outstanding.
  useEffect(() => {
    if (saveState === 'saved') return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  /** Rename/publish/archive edits from the list view: immediate, not undoable. */
  const patchQuizById = (id, patch) => {
    const q = getQuiz(id)
    if (!q) return
    writeQuiz({ ...q, ...patch })
  }
  const patchNode = (qid, nid, patch) => {
    const q = getQuiz(qid)
    if (!q) return
    pushUndo(q)
    writeQuiz({ ...q, nodes: q.nodes.map((n) => (n.id === nid ? { ...n, ...patch } : n)) })
  }

  const openQuiz = (id) => {
    setCurrentQuizId(id)
    const q = getQuiz(id)
    if (q?.steps[0]) setSelectedStepKey(q.steps[0].key)
    // Undo history is per editing session: carrying it across quizzes would let
    // an undo write one quiz's structure while a different one is open.
    resetHistory()
    setView('builder')
  }
  const cloneQuizHandler = (id) => { cloneQuiz({ id }).then((res) => { if (res.ok) router.refresh(); else setToast({ message: res.error, type: 'error' }) }) }
  const deleteQuizHandler = (id) => setPendingDelete({ kind: 'quiz', id })
  const togglePublish = (id) => {
    const q = getQuiz(id)
    if (!q) return
    // An archived quiz must never be publishable: archive means retired, and a
    // retired quiz that still serves traffic is the exact state to prevent.
    if (q.isArchived) { setToast({ message: 'Restore this quiz before publishing it.', type: 'warning' }); return }
    const isPublished = !q.isPublished
    applyQuizzes(quizzesRef.current.map((x) => (x.id === id ? { ...x, isPublished } : x)))
    saveQuiz({ id, patch: { is_published: isPublished } }).then((res) => {
      if (!res?.ok) {
        // Roll the optimistic flip back rather than showing a state the server
        // did not accept.
        applyQuizzes(quizzesRef.current.map((x) => (x.id === id ? { ...x, isPublished: !isPublished } : x)))
        setToast({ message: `Could not ${isPublished ? 'publish' : 'unpublish'}: ${res?.error || 'unknown error'}`, type: 'error' })
        return
      }
      router.refresh()
    })
  }
  const archiveQuizHandler = (id, archived) => setPendingArchive({ id, archived })
  const confirmArchive = () => {
    if (!pendingArchive) return
    const { id, archived } = pendingArchive
    setPendingArchive(null)
    const q = getQuiz(id)
    if (!q) return
    const optimistic = { ...q, isArchived: archived, isPublished: archived ? false : q.isPublished, archivedAt: archived ? new Date().toISOString() : null }
    applyQuizzes(quizzesRef.current.map((x) => (x.id === id ? optimistic : x)))
    // After a restore the quiz leaves the Archived list, so follow it over to
    // Active rather than leaving the user looking at where it used to be.
    if (!archived) setQuizScope('active')
    setQuizArchived({ id, archived }).then((res) => {
      if (!res?.ok) {
        applyQuizzes(quizzesRef.current.map((x) => (x.id === id ? q : x)))
        setToast({ message: `Could not ${archived ? 'archive' : 'restore'}: ${res?.error || 'unknown error'}`, type: 'error' })
        return
      }
      setToast({ message: archived ? 'Quiz archived and unpublished.' : 'Quiz restored.', type: 'success' })
      router.refresh()
    })
  }
  const createQuizHandler = () => {
    const q = { name: 'New Quiz', slug: `quiz-${Date.now().toString(36)}`, isPublished: false, isArchived: false, tiers: [{ id: genId('t'), name: 'Tier 1', color: T.success }], steps: [{ key: 'welcome', label: 'Welcome' }], nodes: [], customFields: JSON.parse(JSON.stringify(currentQuiz?.customFields || [])) }
    createQuiz({ quiz: q }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      applyQuizzes([...quizzesRef.current, { ...q, id: res.id }])
      openQuiz(res.id)
    })
  }

  const openDeployment = (id) => { setDraftDeployment(null); setCurrentDeploymentId(id); setView('deploymentEdit') }
  const cloneDeploymentHandler = (id) => { const d = deployments.find((x) => x.id === id); if (!d) return; setDraftDeployment({ ...JSON.parse(JSON.stringify(d)), id: '', path: `${d.path}-copy`, status: 'draft' }); setCurrentDeploymentId(null); setView('deploymentEdit') }
  const deleteDeploymentHandler = (id) => setPendingDelete({ kind: 'deployment', id })
  const toggleDeploymentStatus = (id) => {
    const d = deployments.find((x) => x.id === id)
    if (!d) return
    const status = d.status === 'live' ? 'paused' : 'live'
    setDeployments((ds) => ds.map((x) => x.id === id ? { ...x, status } : x))
    saveQuizDeployment({ deployment: { ...d, status } }).then(() => router.refresh())
  }
  const createDeployment = () => {
    const d = { id: '', quizId: quizzes[0]?.id || '', brandId: brands[0]?.id || '', domain: '', path: `/new-${Date.now().toString(36)}`, status: 'draft', renderMode: 'standalone', templateId: 'default', headerConfig: { logoEnabled: true, ctaButton: { enabled: true, text: 'CLICK HERE TO CALL', url: 'tel:', fontSize: 11 } }, footerConfig: { logoEnabled: true, logoSize: 32, showCopyright: true, fontSize: 12 }, bodySectionOverrides: null, embedPreviewBg: '#0a1a3a', utm: { source: '', medium: '', campaign: '' }, pixels: {} }
    setDraftDeployment(d); setCurrentDeploymentId(null); setView('deploymentEdit')
  }
  const persistDeployment = (d) => {
    saveQuizDeployment({ deployment: d }).then((res) => {
      if (!res.ok) { setToast({ message: res.error, type: 'error' }); return }
      setView('list'); setTab('deployments'); setDraftDeployment(null); router.refresh()
    })
  }

  const renameStep = (key, newLabel) => mutateQuiz((q) => ({ ...q, steps: q.steps.map((s) => (s.key === key ? { ...s, label: newLabel } : s)) }))

  // --- structural edits, all delegated to quiz-graph ------------------------
  const moveStepHandler = (stepKey, delta) => mutateQuiz((q) => moveStepBy(q, stepKey, delta))

  const duplicateStepHandler = (stepKey) => {
    const q = getQuiz(currentQuizId)
    if (!q) return
    const res = duplicateStep(q, stepKey, genId)
    if (!res) return
    pushUndo(q)
    writeQuiz(res.quiz)
    setSelectedStepKey(res.newStepKey)
    setToast({ message: `Step duplicated with ${res.clonedNodeIds.length} variant${res.clonedNodeIds.length === 1 ? '' : 's'}.`, type: 'success' })
  }

  const duplicateNodeHandler = (nodeId) => {
    const q = getQuiz(currentQuizId)
    if (!q) return
    const res = duplicateNode(q, nodeId, genId)
    if (!res.ok) {
      setToast({
        message: res.reason === 'no_free_slot'
          ? 'This step is full: every tier and the SHARED cell already have a variant. Duplicate the step instead, or free a cell.'
          : 'Could not find that variant.',
        type: 'warning',
      })
      return
    }
    pushUndo(q)
    writeQuiz(res.quiz)
    setSelectedNodeId(res.newNodeId)
    setToast({
      message: res.assignedTiers.length === 0
        ? 'Variant duplicated into the SHARED cell.'
        : `Variant duplicated into ${q.tiers.find((t) => t.id === res.assignedTiers[0])?.name || 'the next free tier'}.`,
      type: 'success',
    })
  }

  /** Create a custom field from inside a node editor. Returns the result so the
   *  caller can surface a validation message and select the new key. */
  const createCustomField = useCallback((seed) => {
    const q = getQuiz(currentQuizId)
    if (!q) return { ok: false, error: 'No quiz is open.' }
    const key = (seed?.key ?? '').trim()
    const field = key
      ? { id: genId('cf'), key, label: (seed.label ?? '').trim() || key, type: seed.type || 'text', options: seed.options ?? [] }
      : newCustomField(q, { label: seed?.label, type: seed?.type }, genId)
    const res = upsertCustomField(q, field)
    if (!res.ok) return res
    pushUndo(q)
    writeQuiz(res.quiz)
    setToast({ message: `Created field {{${res.field.key}}}`, type: 'success' })
    return res
  }, [currentQuizId, getQuiz, pushUndo, writeQuiz])
  const baseNewNode = (typeMeta, stepKey, tiers) => {
    const nodeType = NODE_TYPE_FOR_QTYPE[typeMeta.id] || 'question'
    const visibleByDef = VISIBLE_BY_DEFAULT[nodeType]
    return { id: genId('n'), stepKey, tiers, type: nodeType, fieldName: `field_${Date.now().toString(36).slice(-4)}`, questionType: typeMeta.id, headline: 'New Question', question: '', subheadline: '', isVisible: visibleByDef, answers: nodeType === 'question' ? [mkA('Answer 1'), mkA('Answer 2')] : nodeType === 'form' ? [mkA('Submitted')] : [], formFields: nodeType === 'form' ? defaultLeadFormFields() : undefined, conditions: nodeType === 'decision' ? [] : undefined, webhookMethod: (nodeType === 'webhook' || nodeType === 'verification') ? 'POST' : undefined, webhookUrl: '', webhookHeaders: [], webhookPayload: '', responseMappings: [], redirect: nodeType === 'endpoint' ? { mode: 'none', url: '', buttonText: 'Continue' } : undefined, dynamicContent: [], ai: { enabled: false }, enterScript: '', exitScript: '' }
  }
  const handleAddStepPick = (typeMeta) => {
    const newStepKey = genId('step')
    let newNodeId = null
    mutateQuiz((q) => {
      const newNode = { ...baseNewNode(typeMeta, newStepKey, []), tiers: [] }
      newNodeId = newNode.id
      return { ...q, steps: [...q.steps, { key: newStepKey, label: typeMeta.name }], nodes: [...q.nodes, newNode] }
    })
    setSelectedStepKey(newStepKey)
    if (newNodeId) setSelectedNodeId(newNodeId)
    setShowAddStep(false)
  }
  const addVariantToCell = (stepKey, tiers) => { setPendingTiers({ stepKey, tiers }); setShowAddStep(true) }
  const handleAddVariantPick = (typeMeta) => {
    if (!pendingTiers) return handleAddStepPick(typeMeta)
    const { stepKey, tiers } = pendingTiers
    let newNodeId = null
    mutateQuiz((q) => {
      const newNode = baseNewNode(typeMeta, stepKey, tiers)
      newNodeId = newNode.id
      return { ...q, nodes: [...q.nodes, newNode] }
    })
    if (newNodeId) setSelectedNodeId(newNodeId)
    setShowAddStep(false)
    setPendingTiers(null)
  }

  const deleteStepRequest = (key) => setPendingStepDelete(key)
  const pendingStepInfo = useMemo(() => {
    if (!pendingStepDelete || !currentQuiz) return null
    const step = currentQuiz.steps.find((s) => s.key === pendingStepDelete)
    const preview = deleteStep(currentQuiz, pendingStepDelete)
    return { label: step?.label || 'this step', variants: preview.deletedNodeIds.length, refs: preview.clearedRefs }
  }, [pendingStepDelete, currentQuiz])
  const confirmDeleteStep = () => {
    if (!pendingStepDelete) return
    const key = pendingStepDelete
    setPendingStepDelete(null)
    const q = getQuiz(currentQuizId)
    if (!q) return
    const res = deleteStep(q, key)
    pushUndo(q)
    writeQuiz(res.quiz)
    if (selectedStepKey === key) setSelectedStepKey(null)
    if (res.deletedNodeIds.includes(selectedNodeId)) setSelectedNodeId(null)
    if (res.clearedRefs > 0) {
      setToast({ message: `Step deleted. ${res.clearedRefs} route${res.clearedRefs === 1 ? '' : 's'} that pointed at it ${res.clearedRefs === 1 ? 'was' : 'were'} cleared.`, type: 'info' })
    }
  }

  const saveNode = (node) => patchNode(currentQuizId, node.id, node)
  const deleteNode = (nid) => {
    mutateQuiz((q) => ({ ...q, nodes: q.nodes.filter((n) => n.id !== nid) }))
    if (selectedNodeId === nid) setSelectedNodeId(null)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { kind, id } = pendingDelete
    if (kind === 'quiz') { deleteQuiz({ id }).then((res) => { if (res.ok) { applyQuizzes(quizzesRef.current.filter((q) => q.id !== id)); router.refresh() } else setToast({ message: res.error, type: 'error' }) }) }
    if (kind === 'deployment') { deleteQuizDeployment({ id }).then((res) => { if (res.ok) { setDeployments((ds) => ds.filter((d) => d.id !== id)); router.refresh() } else setToast({ message: res.error, type: 'error' }) }) }
    setPendingDelete(null)
  }

  const exitBuilder = () => {
    setLeaveBuilderReq(false)
    setView('list')
    setCurrentQuizId(null)
    setSelectedStepKey(null)
    setSelectedNodeId(null)
    resetHistory()
    setTab('quizzes')
  }

  /**
   * Back out of the builder. The requested behaviour: no dialog when there is
   * nothing to save. A pending write is flushed silently first; only a write
   * that has actually FAILED is worth interrupting the user for, because that is
   * the one case where leaving loses work.
   */
  const handleBackFromBuilder = async () => {
    if (saveState === 'saved') { exitBuilder(); router.refresh(); return }
    if (saveState === 'error') { setLeaveBuilderReq(true); return }
    const ok = await runSave()
    if (!ok) { setLeaveBuilderReq(true); return }
    exitBuilder()
    router.refresh()
  }

  const previewBrand = (previewDeploymentId ? brands.find((b) => b.id === deployments.find((d) => d.id === previewDeploymentId)?.brandId) : null) || brands.find((b) => deployments.find((d) => d.quizId === currentQuiz?.id && d.brandId === b.id)) || brands[0]
  const previewDep = previewDeploymentId ? deployments.find((d) => d.id === previewDeploymentId) : deployments.find((d) => d.quizId === currentQuiz?.id)

  return <div style={{ minHeight: '100vh', backgroundColor: T.bg, color: T.text, fontFamily: '"Inter", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

    {view !== 'list' && <QuizBuilderTopBar
      view={view}
      quizName={currentQuiz?.name}
      onBack={view === 'builder' ? handleBackFromBuilder : view === 'deploymentEdit' ? () => { setView('list'); setTab('deployments'); setDraftDeployment(null); setCurrentDeploymentId(null) } : () => setView('list')}
      onSettings={() => setShowSettings(true)}
      onPreview={() => { setPreviewSource('builder'); setPreviewDeploymentId(null); setView('preview') }}
      onPublish={() => togglePublish(currentQuizId)}
      isPublished={currentQuiz?.isPublished}
      saveState={saveState}
      onSave={() => { void runSave() }}
      onUndo={undo}
      onRedo={redo}
      canUndo={undoStack.length > 0}
      canRedo={redoStack.length > 0}
      onBackToBuilder={() => { if (previewSource === 'list-deployments') { setView('list'); setTab('deployments') } else if (previewSource === 'list-quizzes') { setView('list'); setTab('quizzes') } else { setView('builder') } }}
      previewSource={previewSource}
    />}

    {view === 'list' && <ListShell tab={tab} onTabChange={setTab} onCreate={tab === 'quizzes' ? createQuizHandler : createDeployment}>
      {tab === 'quizzes' && <QuizListView
        quizzes={quizzes}
        brands={brands}
        deployments={deployments}
        scope={quizScope}
        onScopeChange={setQuizScope}
        onOpen={openQuiz}
        onClone={cloneQuizHandler}
        onDelete={deleteQuizHandler}
        onTogglePublish={togglePublish}
        onArchive={archiveQuizHandler}
        onPreview={(id) => { openQuiz(id); setPreviewSource('list-quizzes'); setPreviewDeploymentId(null); setView('preview') }}
        onRename={(id, name) => patchQuizById(id, { name })}
      />}
      {tab === 'templates' && <TemplateLibrary kind="quiz" brands={brands} />}
      {tab === 'deployments' && <DeploymentListView deployments={deployments} quizzes={quizzes} brands={brands} onOpen={openDeployment} onClone={cloneDeploymentHandler} onDelete={deleteDeploymentHandler} onToggleStatus={toggleDeploymentStatus} onCopyEmbed={(id) => setShowEmbed(id)} onPreview={(id) => { const dep = deployments.find((d) => d.id === id); if (!dep) return; openQuiz(dep.quizId); setPreviewSource('list-deployments'); setPreviewDeploymentId(id); setView('preview') }} onRename={(id, name) => { const d = deployments.find((x) => x.id === id); setDeployments((ds) => ds.map((x) => x.id === id ? { ...x, name } : x)); if (d) saveQuizDeployment({ deployment: { ...d, name } }) }} />}
    </ListShell>}

    {view === 'builder' && currentQuiz && <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <QuizFlowGrid
        quiz={currentQuiz}
        selectedStepKey={selectedStepKey}
        selectedNodeId={selectedNodeId}
        issues={graphIssues}
        onSelectStep={setSelectedStepKey}
        onSelectNode={setSelectedNodeId}
        onPreviewNode={setPreviewNodeId}
        onAddVariantToCell={addVariantToCell}
        onAddStepClick={() => { setPendingTiers(null); setShowAddStep(true) }}
        onMoveStep={moveStepHandler}
        onDuplicateStep={duplicateStepHandler}
        onDeleteStepRequest={deleteStepRequest}
        onRenameStep={renameStep}
        onDuplicateNode={duplicateNodeHandler}
      />
    </div>}

    {view === 'preview' && currentQuiz && <QuizPreviewView quiz={currentQuiz} brand={previewBrand} deployment={previewDep} brands={brands} deployments={deployments} onBackToBuilder={() => setView('builder')} />}

    {view === 'deploymentEdit' && currentDeployment && <DeploymentEditor onBrandSaved={onBrandSaved} deployment={currentDeployment} isDraft={!!draftDeployment} quizzes={quizzes} brands={brands} onSave={persistDeployment} onBack={() => { setView('list'); setTab('deployments'); setDraftDeployment(null); setCurrentDeploymentId(null) }} />}

    {selectedNode && <NodeEditorModal
      node={selectedNode}
      quiz={currentQuiz}
      customFields={customFields}
      onSave={saveNode}
      onClose={() => setSelectedNodeId(null)}
      onDelete={deleteNode}
      onRenameStep={renameStep}
      onDuplicate={duplicateNodeHandler}
      onCreateCustomField={createCustomField}
    />}

    {previewNode && <NodePreviewModal node={previewNode} brand={brands[0]} customFields={customFields} onClose={() => setPreviewNodeId(null)} />}

    {showSettings && currentQuiz && <SettingsModal quiz={currentQuiz} onClose={() => setShowSettings(false)} onSave={(q) => { mutateQuiz(() => q); setShowSettings(false) }} />}

    {showAddStep && <AddStepModal open={showAddStep} onClose={() => { setShowAddStep(false); setPendingTiers(null) }} onPick={pendingTiers ? handleAddVariantPick : handleAddStepPick} />}

    {showEmbed && <EmbedCodeModal deployment={deployments.find((d) => d.id === showEmbed)} onClose={() => setShowEmbed(null)} />}

    <ConfirmDialog
      open={!!pendingDelete}
      title={`Delete this ${pendingDelete?.kind}?`}
      message={pendingDelete?.kind === 'quiz'
        ? `This permanently deletes the quiz and its ${deployments.filter((d) => d.quizId === pendingDelete.id).length} deployment(s). Archive it instead if you only want it out of the way.`
        : 'This cannot be undone.'}
      confirmText="Delete"
      onConfirm={confirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
    <ConfirmDialog
      open={!!pendingStepDelete}
      title={`Delete "${pendingStepInfo?.label || 'this step'}"?`}
      message={[
        pendingStepInfo?.variants
          ? `${pendingStepInfo.variants} variant${pendingStepInfo.variants === 1 ? '' : 's'} on this step will be removed.`
          : 'This step has no variants.',
        pendingStepInfo?.refs
          ? `${pendingStepInfo.refs} route${pendingStepInfo.refs === 1 ? '' : 's'} elsewhere point here and will be cleared so nothing routes to a missing step.`
          : '',
        'Undo is available afterwards.',
      ].filter(Boolean).join(' ')}
      confirmText="Delete step"
      onConfirm={confirmDeleteStep}
      onCancel={() => setPendingStepDelete(null)}
    />
    <ConfirmDialog
      open={!!pendingArchive}
      title={pendingArchive?.archived ? 'Archive this quiz?' : 'Restore this quiz?'}
      message={pendingArchive?.archived
        ? [
          'It moves to the Archived tab and is unpublished so it cannot serve traffic.',
          (() => {
            const live = deployments.filter((d) => d.quizId === pendingArchive.id && d.status === 'live').length
            return live > 0
              ? `${live} deployment${live === 1 ? '' : 's'} still reference it and will stop serving this quiz.`
              : ''
          })(),
          'Nothing is deleted; you can restore it at any time.',
        ].filter(Boolean).join(' ')
        : 'It returns to the Active tab as a draft. Publish it again when you are ready.'}
      confirmText={pendingArchive?.archived ? 'Archive' : 'Restore'}
      onConfirm={confirmArchive}
      onCancel={() => setPendingArchive(null)}
    />
    <ConfirmDialog
      open={leaveBuilderReq}
      title="Your last change did not save"
      message="Leaving now loses that change. Retry the save, or leave anyway."
      confirmText="Retry save"
      cancelText="Stay"
      tertiaryText="Leave anyway"
      onConfirm={async () => { const ok = await runSave(); if (ok) { exitBuilder(); router.refresh() } }}
      onCancel={() => setLeaveBuilderReq(false)}
      onTertiary={() => { exitBuilder(); router.refresh() }}
    />
    <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
  </div>
}
