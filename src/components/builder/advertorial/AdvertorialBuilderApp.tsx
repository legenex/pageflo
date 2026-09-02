// @ts-nocheck
/* eslint-disable */
'use client'

// Advertorials builder, ported verbatim from the LegalOS funnel-builder
// artifact (advertorial_builder). The list/editor/preview/deployment views and
// the brand-agnostic article renderer are unchanged from the artifact; only the
// orchestrator's persistence (localStorage -> Payload server actions) and the
// AI helper (artifact capability -> invokeLLM via server action) are adapted.

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { AlertCircle, AlertTriangle, Archive, ArrowRight, BookOpen, Calendar, Check, ChevronLeft, ChevronRight, Copy, Edit3, Eye, FileEdit, FileSearch, FileText, FileWarning, GripVertical, Hash, Heading1, Heading2, ImageIcon, List, ListChecks, ListOrdered, Loader2, MousePointer, Newspaper, Phone, Plus, Power, PowerOff, Quote, Rocket, Save, ScrollText, Search, Settings, ShieldAlert, Sparkles, Tag, Trash2, User, Wand2, X } from 'lucide-react'
import { T, genId, brandShortName, Btn, Input, Textarea, Select, Label, Pill, IconBtn, ConfirmDialog, Toast, Modal, PageHeader } from '../ui'
import { resolveTokens } from '../lp/render'
import { selectableOptions } from '@/lib/selectable'
import { advDefaultBottomSection, advSlugify } from './seed-data'
import {
  createAdvertorial as svCreateAdvertorial,
  saveAdvertorial as svSaveAdvertorial,
  deleteAdvertorial as svDeleteAdvertorial,
  saveAdvertorialDeployment as svSaveDeployment,
  deleteAdvertorialDeployment as svDeleteDeployment,
  aiAdvertorial,
  aiBulkSimplify,
} from '@/app/(app)/admin/(top)/advertorials/actions'
import { settleAction, commitOptimistic, failureMessage } from '../server-action'

const ADV_TEMPLATES = [
  {
    id: 'personal_story',
    name: 'Personal Story',
    desc: 'First-person victim story. Highest empathy and conversion for MVA. Conversational, narrative-driven.',
    icon: BookOpen,
    color: T.primary,
    voiceTone: 'conversational, urgent, vulnerable',
    structure: ['kicker', 'headline', 'byline', 'lede', 'paragraph', 'pull_quote', 'paragraph', 'callout_box', 'paragraph', 'sub_headline', 'paragraph', 'cta_inline', 'paragraph', 'disclaimer']
  },
  {
    id: 'news_authority',
    name: 'News Authority',
    desc: 'Newspaper-style reporting. Neutral, authoritative tone with sourced stats and expert quotes.',
    icon: Newspaper,
    color: T.info,
    voiceTone: 'journalistic, authoritative, factual',
    structure: ['kicker', 'headline', 'dateline', 'lede', 'paragraph', 'stat_block', 'paragraph', 'pull_quote', 'sub_headline', 'paragraph', 'bullet_list', 'cta_inline', 'disclaimer']
  },
  {
    id: 'whistleblower',
    name: 'Whistleblower',
    desc: 'Industry insider exposes what insurance companies do not want you to know. High intrigue.',
    icon: ShieldAlert,
    color: T.warning,
    voiceTone: 'conspiratorial, insider, urgent',
    structure: ['kicker', 'headline', 'byline', 'lede', 'callout_box', 'paragraph', 'numbered_list', 'pull_quote', 'paragraph', 'cta_inline', 'paragraph', 'disclaimer']
  },
  {
    id: 'investigative',
    name: 'Investigative Listicle',
    desc: 'Numbered investigation. "5 things insurance companies will not tell you". Skimmable, high engagement.',
    icon: FileSearch,
    color: T.purple,
    voiceTone: 'investigative, punchy, list-driven',
    structure: ['kicker', 'headline', 'byline', 'lede', 'sub_headline', 'paragraph', 'sub_headline', 'paragraph', 'sub_headline', 'paragraph', 'callout_box', 'cta_inline', 'disclaimer']
  }
];

// ============================================================================
// SECTION TYPES - building blocks of an advertorial body
// ============================================================================
const ADV_SECTION_TYPES = [
  { id: 'kicker', name: 'Kicker / Eyebrow', desc: 'Small label above headline', icon: Tag, color: T.textMute },
  { id: 'headline', name: 'Headline', desc: 'H1 emotional hook', icon: Heading1, color: T.primary },
  { id: 'sub_headline', name: 'Sub-Headline', desc: 'H2 section break', icon: Heading2, color: T.purple },
  { id: 'byline', name: 'Byline', desc: 'Author + date + read time', icon: User, color: T.textMute },
  { id: 'dateline', name: 'Dateline', desc: 'LOCATION - Date prefix', icon: Calendar, color: T.textMute },
  { id: 'lede', name: 'Lead', desc: 'Opening italic paragraph', icon: ScrollText, color: T.info },
  { id: 'paragraph', name: 'Paragraph', desc: 'Standard body text', icon: FileText, color: T.text },
  { id: 'pull_quote', name: 'Pull Quote', desc: 'Large blockquote callout', icon: Quote, color: T.orange },
  { id: 'callout_box', name: 'Callout Box', desc: 'Highlighted info box', icon: AlertTriangle, color: T.warning },
  { id: 'stat_block', name: 'Stat Block', desc: 'Big number + caption', icon: Hash, color: T.cyan },
  { id: 'bullet_list', name: 'Bullet List', desc: 'Unordered points', icon: List, color: T.text },
  { id: 'numbered_list', name: 'Numbered List', desc: 'Ordered points', icon: ListOrdered, color: T.text },
  { id: 'image_block', name: 'Image', desc: 'Image with caption', icon: ImageIcon, color: T.textMute },
  { id: 'cta_inline', name: 'CTA Card', desc: 'In-body conversion card to quiz', icon: MousePointer, color: T.success },
  { id: 'divider', name: 'Divider', desc: 'Section separator', icon: ChevronRight, color: T.textLow },
  { id: 'disclaimer', name: 'Disclaimer', desc: 'Footer legal text', icon: FileWarning, color: T.textMute }
];

const advFindSectionMeta = (id) => ADV_SECTION_TYPES.find(s => s.id === id) || ADV_SECTION_TYPES[6];

// ============================================================================
// ADV_TOKENS - resolved at preview/render time with brand data
// ============================================================================
const ADV_TOKENS = [
  { key: 'brandName', label: 'Brand display name', sample: 'CheckACase' },
  { key: 'brandShortName', label: 'Brand short name', sample: 'CAC' },
  { key: 'brandPhone', label: 'Brand phone (formatted)', sample: '(833) 754-0124' },
  { key: 'brandPhoneRaw', label: 'Brand phone (raw)', sample: '+18337540124' },
  { key: 'brandUrl', label: 'Brand domain', sample: 'checkacase.com' },
  { key: 'brandTagline', label: 'Brand tagline', sample: 'Get the settlement you deserve' },
  { key: 'quizUrl', label: 'Linked quiz deployment URL', sample: 'qualify.checkacase.com/s/mva' },
  { key: 'currentYear', label: 'Current year', sample: String(new Date().getFullYear()) }
];

// advResolveTokens delegates to the unified resolveTokens. We translate the
// quizDeployment object into the canonical `quiz` context shape.
const advResolveTokens = (text, brand, quizDeployment) => {
  if (!text || typeof text !== 'string') return text;
  const quiz = quizDeployment ? {
    fullUrl: `https://${quizDeployment.domain}${quizDeployment.path}`,
    path: quizDeployment.path || '',
    domain: quizDeployment.domain || '',
    name: quizDeployment.quizName || ''
  } : null;
  return resolveTokens(text, { brand, quiz });
};

// ============================================================================
// LENGTH TIERS - used in list filter (matches Base44 screenshot's "All Lengths")
// ============================================================================
const ADV_LENGTH_TIERS = [
  { id: 'short', label: 'Short', min: 0, max: 400 },
  { id: 'medium', label: 'Medium', min: 400, max: 900 },
  { id: 'long', label: 'Long', min: 900, max: 1600 },
  { id: 'epic', label: 'Epic', min: 1600, max: 99999 }
];

const advGetWordCount = (advertorial) => {
  return (advertorial.sections || []).reduce((sum, s) => {
    const txt = typeof s.content === 'string' ? s.content : (s.content?.text || s.content?.items?.join(' ') || '');
    return sum + (txt || '').split(/\s+/).filter(Boolean).length;
  }, 0);
};

const advGetLengthTier = (wordCount) => {
  return ADV_LENGTH_TIERS.find(t => wordCount >= t.min && wordCount < t.max)?.id || 'short';
};
// TOP BAR
// ============================================================================
const AdvBuilderTopBar = ({ view, title, onBack, onPreview, onSave, isDirty, status, onPublish, onSettings }) => (
  <div style={{ position: 'sticky', top: 0, zIndex: 30, height: 56, backgroundColor: 'rgba(37,46,57,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
    {view !== 'list' && <>
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack}>Back</Btn>
      <div style={{ width: 1, height: 26, backgroundColor: T.border }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 480 }}>{title}</span>
        {status && <Pill color={status === 'published' ? T.success : status === 'draft' ? T.textMute : T.warning}>{status.toUpperCase()}</Pill>}
        {isDirty && <Pill color={T.warning}>UNSAVED</Pill>}
      </div>
    </>}
    <div style={{ flex: 1 }} />
    {view === 'advertorialEdit' && <>
      {onSettings && <Btn variant="secondary" size="sm" icon={Settings} onClick={onSettings}>Settings</Btn>}
      <Btn variant="secondary" size="sm" icon={Eye} onClick={onPreview}>Preview</Btn>
      <Btn variant="primary" size="sm" icon={Save} onClick={onSave}>Save</Btn>
      {onPublish && <Btn variant={status === 'published' ? 'danger' : 'success'} size="sm" icon={status === 'published' ? PowerOff : Power} onClick={onPublish}>{status === 'published' ? 'Unpublish' : 'Publish'}</Btn>}
    </>}
    {view === 'deploymentEdit' && <Btn variant="primary" size="sm" icon={Save} onClick={onSave}>Save</Btn>}
    {view === 'brandEdit' && <Btn variant="primary" size="sm" icon={Save} onClick={onSave}>Save</Btn>}
  </div>
);

const AdvBuilderTabBar = ({ active, onChange }) => {
  const tabs = [
    { id: 'advertorials', label: 'Advertorials', icon: Newspaper },
    { id: 'deployments', label: 'Deployments', icon: Rocket }
  ];
  return <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', borderBottom: `1px solid ${T.border}` }}>
    {tabs.map(t => {
      const isActive = active === t.id;
      const Icon = t.icon;
      return <button key={t.id} onClick={() => onChange(t.id)} style={{
        padding: '14px 18px', backgroundColor: 'transparent', border: 'none',
        borderBottom: `2px solid ${isActive ? T.primary : 'transparent'}`,
        color: isActive ? T.text : T.textMute, fontSize: 13, fontWeight: 500,
        fontFamily: '"Inter", sans-serif', cursor: 'pointer', marginBottom: -1,
        display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.005em'
      }}>
        <Icon size={14} /> {t.label}
      </button>;
    })}
  </div>;
};

// ============================================================================
// ADVERTORIAL LIST VIEW - matches Base44 screenshot layout
// ============================================================================
const AdvertorialListView = ({ advertorials, brands, deployments, onOpen, onCreate, onClone, onDelete, onPreview, onAICreate, onBulkSimplify, onRename }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTemplate, setFilterTemplate] = useState('all');
  const [filterLength, setFilterLength] = useState('all');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');

  const filtered = useMemo(() => {
    return advertorials.filter(a => {
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterTemplate !== 'all' && a.templateId !== filterTemplate) return false;
      if (filterLength !== 'all') {
        const wc = advGetWordCount(a);
        const tier = advGetLengthTier(wc);
        if (tier !== filterLength) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !(a.slug || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [advertorials, search, filterStatus, filterTemplate, filterLength]);

  const startRename = (a) => { setRenamingId(a.id); setRenameDraft(a.title); };
  const commitRename = () => { if (renamingId && renameDraft.trim()) onRename?.(renamingId, renameDraft.trim()); setRenamingId(null); };

  return <div>
    {/* Action bar */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
      {/* Search and filters on the left */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 400 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMute, pointerEvents: 'none' }} />
          <Input placeholder="Search by title or slug..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 34, padding: '9px 12px 9px 34px', fontSize: 13 }} />
        </div>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 140, padding: '9px 12px', fontSize: 13 }}>
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Select value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)} style={{ width: 170, padding: '9px 12px', fontSize: 13 }}>
          <option value="all">All Templates</option>
          {ADV_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={filterLength} onChange={(e) => setFilterLength(e.target.value)} style={{ width: 140, padding: '9px 12px', fontSize: 13 }}>
          <option value="all">All Lengths</option>
          {ADV_LENGTH_TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      {/* Action buttons on the right */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Btn variant="secondary" size="md" icon={Wand2} onClick={onBulkSimplify} aria-label="Bulk simplify">Bulk Simplify</Btn>
        <Btn variant="primary" size="md" icon={Sparkles} onClick={onAICreate} aria-label="Generate with AI">New with AI</Btn>
        <Btn variant="primary" size="md" icon={Plus} onClick={onCreate} aria-label="New advertorial">New Advertorial</Btn>
      </div>
    </div>

    {/* Count caption */}
    <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{filtered.length} advertorials</div>

    {/* Card rows - one card per advertorial, matching Landing Pages list style.
        Cards live in a scrollable container so a long list doesn't push the
        page header off-screen. */}
    {filtered.length === 0 ? (
      <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 12, color: T.textMute }}>
        {advertorials.length === 0 ? 'No advertorials yet. Click "New with AI" to generate one from a brand + angle, or "New Advertorial" to start from a template.' : 'No advertorials match those filters.'}
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', paddingRight: 4 }}>
        {filtered.map(a => {
          const template = ADV_TEMPLATES.find(t => t.id === a.templateId);
          const wc = advGetWordCount(a);
          const lengthTier = ADV_LENGTH_TIERS.find(t => t.id === advGetLengthTier(wc));
          const depCount = (deployments || []).filter(d => d.advertorialId === a.id).length;
          const statusColor = a.status === 'published' ? T.success : a.status === 'archived' ? T.textMute : T.warning;
          return (
            <div key={a.id} style={{
              padding: '14px 18px',
              backgroundColor: T.bgElev,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 14,
              transition: 'border-color 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; }}>
              {/* Icon block - newspaper for advertorials, matches LP rocket */}
              <div style={{
                width: 42, height: 42, borderRadius: 10,
                backgroundColor: T.bg,
                border: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.textDim, flexShrink: 0
              }}>
                <Newspaper size={18} />
              </div>
              {/* Title + meta column */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  {renamingId === a.id ? (
                    <input autoFocus value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                      style={{ flex: 1, maxWidth: 400, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 14, fontWeight: 600, outline: 'none' }} />
                  ) : (
                    <span onClick={(e) => { e.stopPropagation(); startRename(a); }}
                      style={{ fontSize: 14, fontWeight: 600, color: T.text, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '36ch' }}
                      title={a.title}>{a.title}</span>
                  )}
                  <Pill color={statusColor}>{(a.status || 'draft').toUpperCase()}</Pill>
                  {template && <Pill color={T.purple}>{template.name}</Pill>}
                  {lengthTier && <Pill color={T.info}>{lengthTier.label}</Pill>}
                  <Pill color={T.textMute}>{wc} words</Pill>
                  <Pill color={depCount > 0 ? T.success : T.textLow}>{depCount} deployments</Pill>
                </div>
                <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>/{a.slug}</div>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onPreview(a.id)} aria-label="Preview advertorial">Preview</Btn>
                <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(a.id)} aria-label="Edit advertorial">Edit</Btn>
                <IconBtn icon={Copy} onClick={() => onClone(a.id)} aria-label="Duplicate advertorial" />
                <IconBtn icon={Archive} onClick={() => onDelete(a.id)} style={{ color: T.danger }} aria-label="Archive advertorial" />
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>;
};

// ============================================================================
// BRAND LIST VIEW
// ============================================================================
const AdvBrandListView = ({ brands, advertorials, deployments, onOpen, onCreate, onDelete }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <div style={{ fontSize: 24, color: T.text, letterSpacing: '-0.025em', fontWeight: 700 }}>Brands</div>
        <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>Brand identities. Logo, colors, phone, legal copy. Pulled in dynamically when an advertorial is deployed to a domain.</div>
      </div>
      <Btn variant="primary" size="lg" icon={Plus} onClick={onCreate}>New Brand</Btn>
    </div>

    <div style={{ display: 'grid', gap: 12 }}>
      {brands.length === 0 ? <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textMute }}>No brands yet.</div> :
        brands.map(b => {
          const deploymentCount = deployments.filter(d => d.brandId === b.id).length;
          return <div key={b.id} style={{ backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: b.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{b.shortName || b.name.slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 15, color: T.text, fontWeight: 600, letterSpacing: '-0.01em' }}>{b.displayName}</div>
                <Pill color={deploymentCount > 0 ? T.info : T.textMute}>{deploymentCount} {deploymentCount === 1 ? 'deployment' : 'deployments'}</Pill>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', flexWrap: 'wrap' }}>
                <span>{b.domains.join(', ') || 'no domain'}</span><span>·</span>
                <span>{b.contact.callNumber}</span><span>·</span>
                <span>{b.typography.headlineFont}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {['primary', 'accent', 'background', 'cardBg'].map(k => <div key={k} title={`${k}: ${b.colors[k]}`} style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: b.colors[k], border: `1px solid ${T.border}` }} />)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(b.id)}>Edit</Btn>
              <IconBtn icon={Trash2} onClick={() => onDelete(b.id)} style={{ color: T.danger }} />
            </div>
          </div>;
        })}
    </div>
  </div>
);

// ============================================================================
// DEPLOYMENT LIST VIEW
// ============================================================================
const AdvDeploymentListView = ({ deployments, advertorials, brands, domains, quizDeployments, onOpen, onCreate, onClone, onDelete, onToggleStatus, onPreview, onRename }) => {
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const startRename = (d) => { setRenamingId(d.id); setRenameDraft(d.name || ''); };
  const commitRename = () => { if (renamingId) onRename?.(renamingId, renameDraft.trim()); setRenamingId(null); };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div />
        <Btn variant="primary" size="md" icon={Plus} onClick={onCreate}>New Deployment</Btn>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {deployments.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textMute }}>
            No deployments yet. A deployment puts an advertorial live at a specific brand domain and routes its CTA to a linked quiz.
          </div>
        ) : deployments.map(d => {
          const ad = advertorials.find(a => a.id === d.advertorialId);
          const brand = brands.find(x => x.id === d.brandId);
          const orphaned = !!d.brandId && !brand;
          const refDomain = d.domainId ? (domains || []).find(dom => dom.id === d.domainId) : null;
          const orphanedDomain = !!d.domainId && !refDomain;
          const domainStr = refDomain?.domain || d.domain || '';
          const qd = quizDeployments.find(x => x.id === d.quizDeploymentId);
          const url = domainStr ? `https://${domainStr}${d.path || ''}` : `https://preview.legenex.com/a/${d.id}`;
          const depName = d.name || (ad ? `${ad.title?.slice(0, 40) || 'Untitled'} . ${brand?.displayName || 'No brand'}` : 'Untitled deployment');
          const primary = brand?.colors?.primary;
          const background = brand?.colors?.background;
          return <div key={d.id} style={{ backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8,
              background: primary ? `linear-gradient(135deg, ${primary}, ${background || primary})` : T.bgElev2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 11, overflow: 'hidden'
            }}>
              {brand?.faviconUrl
                ? <img loading="lazy" decoding="async" src={brand.faviconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (brand ? brandShortName(brand) : <Newspaper size={18} />)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {renamingId === d.id ? (
                  <input autoFocus value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ flex: 1, maxWidth: 360, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 14, fontWeight: 600, outline: 'none' }} />
                ) : (
                  <div onClick={(e) => { e.stopPropagation(); startRename(d); }}
                    style={{ fontSize: 14, color: T.text, fontWeight: 600, cursor: 'text' }}
                    title="Click to rename">{depName}</div>
                )}
                <Pill color={d.status === 'live' ? T.success : d.status === 'paused' ? T.warning : T.textMute}>{(d.status || 'draft').toUpperCase()}</Pill>
                {!domainStr && <Pill color={T.info}>PREVIEW URL</Pill>}
                {orphaned && <Pill color={T.warning}>Brand missing, select a new brand to fix</Pill>}
                {orphanedDomain && <Pill color={T.warning}>Domain missing, falling back to preview URL</Pill>}
              </div>
              <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {url}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: T.textLow, fontFamily: '"JetBrains Mono", monospace', flexWrap: 'wrap' }}>
                <span>advertorial: {ad?.title?.slice(0, 40) || '.'}{ad?.title?.length > 40 ? '...' : ''}</span><span>{'\u00B7'}</span>
                <span style={{ color: primary || T.textMute }}>brand: {brand?.displayName || '.'}</span><span>{'\u00B7'}</span>
                <span style={{ color: qd ? T.info : T.warning }}>quiz: {qd ? `${qd.domain || 'preview'}${qd.path || ''}` : 'not linked'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="secondary" size="sm" icon={Eye} onClick={() => onPreview(d.id)} aria-label="Preview deployment">Preview</Btn>
              <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onOpen(d.id)} aria-label="Edit deployment">Edit</Btn>
              <IconBtn icon={Copy} onClick={() => onClone(d.id)} aria-label="Duplicate deployment" />
              <IconBtn icon={d.status === 'live' ? PowerOff : Power} onClick={() => onToggleStatus(d.id)} aria-label={d.status === 'live' ? 'Unpublish' : 'Publish'} />
              <IconBtn icon={Trash2} onClick={() => onDelete(d.id)} style={{ color: T.danger }} aria-label="Delete deployment" />
            </div>
          </div>;
        })}
      </div>
    </div>
  );
};

// ============================================================================
// LIST SHELL - wraps a tab content area
// ============================================================================
const AdvListShell = ({ tab, onTabChange, children }) => {
  const subheading = {
    advertorials: 'Native-style story pages that warm cold Facebook traffic before the quiz.',
    deployments: 'Live URLs. An advertorial deployed at a brand domain and path.'
  }[tab] || '';
  // Uses shared PageHeader for visual congruence with Landing Pages and Quizzes.
  return <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
    <PageHeader title="Advertorials" subtitle={subheading} />
    <AdvBuilderTabBar active={tab} onChange={onTabChange} />
    <div style={{ marginTop: 18 }}>{children}</div>
  </div>;
};

// ============================================================================
// SECTION CONTENT EDITOR - type-specific field UI
// ============================================================================
const AdvSectionContentEditor = ({ section, onChange }) => {
  const setText = (v) => onChange({ ...section, content: v });
  const setObj = (k, v) => {
    const cur = typeof section.content === 'object' && section.content !== null ? section.content : {};
    onChange({ ...section, content: { ...cur, [k]: v } });
  };

  switch (section.type) {
    case 'kicker':
    case 'byline':
    case 'dateline':
    case 'sub_headline':
      return <Input value={section.content || ''} onChange={(e) => setText(e.target.value)} placeholder={section.type === 'kicker' ? 'PERSONAL FINANCE · ACCIDENT CLAIMS' : section.type === 'byline' ? 'By [Author] · 8 min read · [Date]' : section.type === 'dateline' ? 'NEW YORK - May 15, 2026' : 'Section heading'} />;

    case 'headline':
      return <Textarea value={section.content || ''} onChange={(e) => setText(e.target.value)} placeholder="The $4,200 check that cost her $186,000" rows={2} style={{ fontSize: 16, fontWeight: 600 }} />;

    case 'lede':
      return <Textarea value={section.content || ''} onChange={(e) => setText(e.target.value)} placeholder="Opening paragraph that sets the scene and pulls the reader in. Often italicized." rows={3} style={{ fontStyle: 'italic' }} />;

    case 'paragraph':
      return <Textarea value={section.content || ''} onChange={(e) => setText(e.target.value)} placeholder="Body paragraph text. Use {{brand.displayName}} and other tokens for dynamic content." rows={5} />;

    case 'pull_quote':
      return <Textarea value={section.content || ''} onChange={(e) => setText(e.target.value)} placeholder="Short, punchy quote that stands out in the body." rows={2} style={{ fontStyle: 'italic' }} />;

    case 'callout_box': {
      const c = section.content || {};
      return <div style={{ display: 'grid', gap: 8 }}>
        <Input value={c.headline || ''} onChange={(e) => setObj('headline', e.target.value)} placeholder="Callout headline (e.g. What insurers will not tell you)" />
        <Textarea value={c.text || ''} onChange={(e) => setObj('text', e.target.value)} placeholder="Callout body text" rows={4} />
      </div>;
    }

    case 'stat_block': {
      const c = section.content || {};
      return <div style={{ display: 'grid', gap: 8 }}>
        <Input value={c.value || ''} onChange={(e) => setObj('value', e.target.value)} placeholder="$186,000" style={{ fontSize: 18, fontWeight: 700 }} />
        <Input value={c.label || ''} onChange={(e) => setObj('label', e.target.value)} placeholder="Median compensation when claim filed within 14 days" />
        <Input value={c.source || ''} onChange={(e) => setObj('source', e.target.value)} placeholder="Source: Insurance Industry Report 2024 (optional)" />
      </div>;
    }

    case 'bullet_list':
    case 'numbered_list': {
      const c = section.content || { items: [''] };
      const items = c.items || [''];
      const update = (idx, val) => setObj('items', items.map((x, i) => i === idx ? val : x));
      const add = () => setObj('items', [...items, '']);
      const remove = (idx) => setObj('items', items.filter((_, i) => i !== idx));
      return <div style={{ display: 'grid', gap: 6 }}>
        {items.map((it, i) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ width: 22, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMute, fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}>{section.type === 'numbered_list' ? `${i + 1}.` : '•'}</div>
          <Textarea value={it} onChange={(e) => update(i, e.target.value)} placeholder="List item" rows={2} style={{ minHeight: 40 }} />
          <IconBtn icon={X} onClick={() => remove(i)} style={{ marginTop: 4 }} />
        </div>)}
        <Btn variant="ghost" size="sm" icon={Plus} onClick={add} style={{ alignSelf: 'flex-start' }}>Add item</Btn>
      </div>;
    }

    case 'image_block': {
      const c = section.content || {};
      return <div style={{ display: 'grid', gap: 8 }}>
        <Input value={c.url || ''} onChange={(e) => setObj('url', e.target.value)} placeholder="https://..." />
        <Input value={c.alt || ''} onChange={(e) => setObj('alt', e.target.value)} placeholder="Alt text" />
        <Input value={c.caption || ''} onChange={(e) => setObj('caption', e.target.value)} placeholder="Caption (optional)" />
      </div>;
    }

    case 'cta_inline': {
      const c = section.content || {};
      return <div style={{ display: 'grid', gap: 8 }}>
        <Input value={c.headline || ''} onChange={(e) => setObj('headline', e.target.value)} placeholder="See what your case is really worth" />
        <Input value={c.subline || ''} onChange={(e) => setObj('subline', e.target.value)} placeholder="Free 60-second case review. No commitment." />
        <Input value={c.buttonText || ''} onChange={(e) => setObj('buttonText', e.target.value)} placeholder="Check My Case Now" />
        <Select value={c.linkType || 'quiz'} onChange={(e) => setObj('linkType', e.target.value)}>
          <option value="quiz">Linked Quiz (deployment routes to its quiz)</option>
          <option value="call">Call (uses brand phone)</option>
          <option value="external">External URL</option>
        </Select>
        {c.linkType === 'external' && <Input value={c.externalUrl || ''} onChange={(e) => setObj('externalUrl', e.target.value)} placeholder="https://..." />}
      </div>;
    }

    case 'divider':
      return <div style={{ fontSize: 12, color: T.textMute, padding: 10, textAlign: 'center', backgroundColor: T.bg, borderRadius: 6, border: `1px dashed ${T.border}` }}>Divider (no content)</div>;

    case 'disclaimer': {
      const c = section.content || {};
      const useDefault = c.useDefault !== false;
      return <div style={{ display: 'grid', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.textDim, cursor: 'pointer' }}>
          <input type="checkbox" checked={useDefault} onChange={(e) => setObj('useDefault', e.target.checked)} />
          Use brand default disclaimer (recommended - stays consistent across deployments)
        </label>
        {!useDefault && <Textarea value={c.customText || ''} onChange={(e) => setObj('customText', e.target.value)} placeholder="Custom disclaimer text" rows={4} />}
      </div>;
    }

    default:
      return <Textarea value={typeof section.content === 'string' ? section.content : JSON.stringify(section.content)} onChange={(e) => setText(e.target.value)} rows={4} />;
  }
};

// ============================================================================
// SECTION ROW - left column entry in the editor
// ============================================================================
const AdvSectionRow = ({ section, isSelected, isDragSrc, idx, onSelect, onDelete, onAIEdit, setDragSrc, onDrop }) => {
  const meta = advFindSectionMeta(section.type);
  const Icon = meta.icon;
  const preview = useMemo(() => {
    if (typeof section.content === 'string') return section.content.slice(0, 80);
    if (section.content?.headline) return section.content.headline.slice(0, 80);
    if (section.content?.text) return section.content.text.slice(0, 80);
    if (section.content?.items?.length) return section.content.items[0]?.slice(0, 80);
    if (section.content?.value) return section.content.value;
    if (section.content?.url) return section.content.url;
    return meta.desc;
  }, [section]);

  return <div
    draggable
    onDragStart={() => setDragSrc(idx)}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => { e.preventDefault(); onDrop(idx); }}
    onClick={onSelect}
    style={{
      padding: '10px 12px',
      backgroundColor: isSelected ? T.primarySoft : T.bgElev,
      border: `1px solid ${isSelected ? T.primary : T.border}`,
      borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      opacity: isDragSrc ? 0.5 : 1, transition: 'all 0.12s'
    }}>
    <GripVertical size={12} color={T.textLow} style={{ cursor: 'grab', flexShrink: 0 }} />
    <div style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: `${meta.color}22`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={13} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: T.text, fontWeight: 500, letterSpacing: '-0.005em' }}>{meta.name}</div>
      <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview || meta.desc}</div>
    </div>
    <button onClick={(e) => { e.stopPropagation(); onAIEdit(); }} title="Edit with AI" style={{
      background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
      border: 'none', borderRadius: 5, padding: 4, color: '#fff', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}><Sparkles size={11} /></button>
    <IconBtn icon={Trash2} onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ color: T.danger, flexShrink: 0 }} />
  </div>;
};

// ============================================================================
// ADD SECTION MODAL
// ============================================================================
const AdvAddSectionModal = ({ open, onClose, onAdd }) => (
  <Modal open={open} onClose={onClose} title="Add Section" maxWidth={680}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {ADV_SECTION_TYPES.map(s => {
        const Icon = s.icon;
        return <button key={s.id} onClick={() => { onAdd(s.id); onClose(); }} style={{
          padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 8,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          transition: 'all 0.12s'
        }} onMouseEnter={(e) => e.currentTarget.style.borderColor = T.borderHover}
           onMouseLeave={(e) => e.currentTarget.style.borderColor = T.border}>
          <div style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: `${s.color}22`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 2 }}>{s.desc}</div>
          </div>
        </button>;
      })}
    </div>
  </Modal>
);

// ============================================================================
// AI HELPER - routes through the invokeLLM server action (server-side key).
// Returns a string when jsonMode is false, or a parsed object when true, so the
// AI modals (which branch on typeof result) work unchanged.
// ============================================================================
const advCallClaude = async (systemPrompt, userPrompt, jsonMode = false) => {
  const res = await aiAdvertorial({ system: systemPrompt, user: userPrompt, json: jsonMode })
  if (!res?.ok) throw new Error(res?.error || 'AI request failed')
  return res.result
}

// ============================================================================
// AI EDIT SECTION MODAL - rewrite single section content
// ============================================================================
const AdvAIEditSectionModal = ({ open, section, onClose, onApply }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setPrompt(''); setResult(null); setError(null); } }, [open]);

  // Hooks must run unconditionally (rules of hooks): compute before the guard.
  const meta = section ? advFindSectionMeta(section.type) : null;
  const currentText = useMemo(() => {
    if (!section) return '';
    if (typeof section.content === 'string') return section.content;
    return JSON.stringify(section.content, null, 2);
  }, [section]);

  if (!open || !section) return null;

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const isStructured = typeof section.content === 'object' && section.content !== null;
      const sys = `You are an expert direct-response copywriter editing one section of an MVA (motor vehicle accident) legal advertorial. You write in plain conversational English. You avoid AI tells: no em dashes, no "delve", no "tapestry", no rule-of-three patterns, no inflated symbolism. Use natural sentence rhythm. Keep tokens like {{brand.displayName}} {{brand.callNumber}} intact.\n\nSection type: ${meta.name} (${meta.desc}).\n\n${isStructured ? `Return ONLY a JSON object with the same shape as the input. No markdown fences, no commentary.` : `Return ONLY the rewritten plain text. No quotes around it, no markdown fences, no commentary.`}`;
      const user = `Current content:\n${currentText}\n\nEdit request: ${prompt || 'Make this more compelling and concise. Tighten language. Keep the same length or shorter.'}`;
      const out = await advCallClaude(sys, user, typeof section.content === 'object' && section.content !== null);
      setResult(out);
    } catch (e) {
      setError(e.message || 'Failed to edit. Check API access.');
    }
    setLoading(false);
  };

  const apply = () => {
    if (result === null) return;
    onApply(result);
    onClose();
  };

  const quickPrompts = [
    'Make this more urgent and emotional',
    'Tighten this - same meaning, fewer words',
    'Make it sound more conversational',
    'Add a specific detail or number',
    'Increase fear of missing out',
    'Rewrite with a clearer hook'
  ];

  return <Modal open={open} onClose={onClose} title={`Edit ${meta.name} with AI`} maxWidth={720}
    footer={<>
      <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
      {result !== null && <Btn variant="success" size="md" icon={Check} onClick={apply}>Apply rewrite</Btn>}
      <Btn variant="ai" size="md" icon={loading ? Loader2 : Sparkles} onClick={run} disabled={loading} style={loading ? { opacity: 0.7 } : {}}>{loading ? 'Generating...' : 'Generate rewrite'}</Btn>
    </>}>
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Current content</Label>
        <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12.5, color: T.textDim, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', fontFamily: typeof section.content === 'object' ? '"JetBrains Mono", monospace' : 'inherit' }}>
          {currentText}
        </div>
      </div>
      <div>
        <Label>How should I edit it?</Label>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Make this more urgent, add a specific dollar figure, tighten the language..." rows={3} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {quickPrompts.map(q => <button key={q} onClick={() => setPrompt(q)} style={{
            padding: '3px 8px', fontSize: 10.5, backgroundColor: T.bgElev, color: T.textDim,
            border: `1px solid ${T.border}`, borderRadius: 4, cursor: 'pointer',
            fontFamily: '"Inter", sans-serif'
          }}>{q}</button>)}
        </div>
      </div>
      {error && <div style={{ padding: 12, backgroundColor: `${T.danger}1f`, border: `1px solid ${T.danger}55`, borderRadius: 7, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertCircle size={14} style={{ marginTop: 2 }} /> {error}
      </div>}
      {result !== null && <div>
        <Label>AI rewrite (preview)</Label>
        <div style={{ padding: 12, backgroundColor: `${T.success}0f`, border: `1px solid ${T.success}55`, borderRadius: 7, fontSize: 12.5, color: T.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', fontFamily: typeof result === 'object' ? '"JetBrains Mono", monospace' : 'inherit' }}>
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </div>
      </div>}
    </div>
  </Modal>;
};

// ============================================================================
// AI CREATE WIZARD - multi-step modal to generate a fresh advertorial
// ============================================================================
const AdvAICreateWizard = ({ open, brands, onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const [templateId, setTemplateId] = useState('personal_story');
  const [topic, setTopic] = useState('');
  const [hook, setHook] = useState('');
  const [tone, setTone] = useState('urgent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setStep(1); setTopic(''); setHook(''); setError(null); } }, [open]);

  const selectedTemplate = ADV_TEMPLATES.find(t => t.id === templateId);
  const selectedBrand = brands.find(b => b.id === brandId);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const tpl = selectedTemplate;
      const sys = `You are an expert direct-response copywriter for MVA (motor vehicle accident) legal advertorials. You write story-driven, emotionally resonant long-form pages that funnel readers to a free case-value quiz.

CRITICAL STYLE RULES:
- No em dashes anywhere. Use periods, commas, or parentheses.
- No AI tells: avoid "delve", "tapestry", "navigate the complexities", "in today's fast-paced world", "it is important to note".
- Natural sentence rhythm with varied length. Avoid the rule of three.
- Use plain words. A 14-year-old should understand every sentence.
- Keep brand-agnostic. Use {{brand.displayName}} {{brand.callNumber}} {{brand.primaryDomain}} tokens where the brand would naturally appear so the same advertorial can run across multiple brands.
- US English. American grammar and spellings.

Template: ${tpl.name} (${tpl.desc})
Voice/tone: ${tpl.voiceTone}, additional tone direction: ${tone}

Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):
{
  "title": "string - the article title, also used as H1",
  "slug": "string - kebab-case URL slug, 5-9 words max",
  "sections": [
    { "type": "kicker", "content": "string" },
    { "type": "headline", "content": "string" },
    { "type": "byline", "content": "string" },
    { "type": "lede", "content": "string" },
    { "type": "paragraph", "content": "string" },
    { "type": "pull_quote", "content": "string" },
    { "type": "callout_box", "content": { "headline": "string", "text": "string" } },
    { "type": "sub_headline", "content": "string" },
    { "type": "bullet_list", "content": { "items": ["...", "..."] } },
    { "type": "numbered_list", "content": { "items": ["...", "..."] } },
    { "type": "cta_inline", "content": { "headline": "string", "subline": "string", "buttonText": "string", "linkType": "quiz" } },
    { "type": "disclaimer", "content": { "useDefault": true } }
  ]
}

Suggested section structure for ${tpl.name}: ${tpl.structure.join(' → ')}

Aim for 800-1200 words across paragraph sections combined. Embed at least one cta_inline mid-article and another near the end. Always end with a disclaimer with useDefault: true.`;

      const user = `Create a fresh MVA advertorial.

Topic / angle: ${topic}
${hook ? `Hook idea: ${hook}` : ''}

Generate the JSON now.`;
      const result = await advCallClaude(sys, user, true);
      if (!result.title || !result.sections) throw new Error('Generated content missing title or sections');
      onCreate({ ...result, templateId, defaultBrandId: brandId });
      onClose();
    } catch (e) {
      setError(e.message || 'Generation failed');
    }
    setLoading(false);
  };

  if (!open) return null;

  return <Modal open={open} onClose={onClose} title={`Generate Advertorial with AI · Step ${step} of 3`} maxWidth={720}
    footer={<>
      <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
      {step > 1 && <Btn variant="secondary" size="md" icon={ChevronLeft} onClick={() => setStep(s => s - 1)}>Back</Btn>}
      {step < 3 && <Btn variant="primary" size="md" iconRight={ChevronRight} onClick={() => setStep(s => s + 1)} disabled={step === 1 ? !brandId : !templateId}>Next</Btn>}
      {step === 3 && <Btn variant="ai" size="md" icon={loading ? Loader2 : Sparkles} onClick={generate} disabled={loading || !topic.trim()}>{loading ? 'Generating advertorial...' : 'Generate advertorial'}</Btn>}
    </>}>
    {step === 1 && <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Pick a default brand</Label>
        <div style={{ fontSize: 12, color: T.textMute, marginBottom: 10 }}>This brand's tagline, voice, and footer disclaimer will be used during generation. The finished advertorial works with any brand at deployment time.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {brands.map(b => <button key={b.id} onClick={() => setBrandId(b.id)} style={{
            padding: '12px 14px', backgroundColor: brandId === b.id ? T.primarySoft : T.bgElev,
            border: `1px solid ${brandId === b.id ? T.primary : T.border}`, borderRadius: 8,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', transition: 'all 0.12s'
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: b.colors.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{b.shortName || b.name.slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{b.displayName}</div>
              <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>{b.domains[0]} · {b.contact.callNumber}</div>
            </div>
            {brandId === b.id && <Check size={16} color={T.primary} />}
          </button>)}
        </div>
      </div>
    </div>}

    {step === 2 && <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Pick a template / angle</Label>
        <div style={{ display: 'grid', gap: 10 }}>
          {ADV_TEMPLATES.map(t => {
            const Icon = t.icon;
            const isSel = templateId === t.id;
            return <button key={t.id} onClick={() => setTemplateId(t.id)} style={{
              padding: 14, backgroundColor: isSel ? `${t.color}1c` : T.bgElev,
              border: `1px solid ${isSel ? t.color : T.border}`, borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', transition: 'all 0.12s'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: `${t.color}22`, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>{t.desc}</div>
                <div style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.voiceTone}</div>
              </div>
              {isSel && <Check size={16} color={t.color} />}
            </button>;
          })}
        </div>
      </div>
    </div>}

    {step === 3 && <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Topic / story angle</Label>
        <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. A driver accepted a $5,000 quick settlement from insurance, then weeks later discovered she needed back surgery and her real claim was worth $200K. Tell her story." rows={4} />
      </div>
      <div>
        <Label>Optional hook idea</Label>
        <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="e.g. The 14-day rule no one talks about" />
      </div>
      <div>
        <Label>Tone</Label>
        <Select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="urgent">Urgent - high stakes, time pressure</option>
          <option value="conversational">Conversational - warm, like a friend explaining</option>
          <option value="authoritative">Authoritative - expert tone, sourced</option>
          <option value="conspiratorial">Conspiratorial - what they don't want you to know</option>
          <option value="empathetic">Empathetic - emotional, victim-centered</option>
        </Select>
      </div>
      <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11.5, color: T.textMute, lineHeight: 1.6 }}>
        <strong style={{ color: T.text }}>Brand:</strong> {selectedBrand?.displayName} · <strong style={{ color: T.text }}>Template:</strong> {selectedTemplate?.name}<br />
        Generates a full 800-1200 word advertorial with sections, CTAs, and brand tokens. You can edit any section after, manually or with AI.
      </div>
      {error && <div style={{ padding: 12, backgroundColor: `${T.danger}1f`, border: `1px solid ${T.danger}55`, borderRadius: 7, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertCircle size={14} style={{ marginTop: 2 }} /> {error}
      </div>}
    </div>}
  </Modal>;
};

// ============================================================================
// ADVERTORIAL EDITOR - main editing view: section list + section editor
// ============================================================================
const AdvertorialEditor = ({ advertorial, brands, deployments, onPatch, onAddSection, onUpdateSection, onDeleteSection, onReorderSections, onPreview }) => {
  const [selectedSectionId, setSelectedSectionId] = useState(advertorial.sections[0]?.id || null);
  const [dragSrc, setDragSrc] = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [aiEditSection, setAiEditSection] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const selectedSection = advertorial.sections.find(s => s.id === selectedSectionId);
  const defaultBrand = brands.find(b => b.id === advertorial.defaultBrandId) || brands[0];
  const template = ADV_TEMPLATES.find(t => t.id === advertorial.templateId);

  const handleDrop = (targetIdx) => {
    if (dragSrc === null || dragSrc === targetIdx) { setDragSrc(null); return; }
    const reordered = [...advertorial.sections];
    const [moved] = reordered.splice(dragSrc, 1);
    reordered.splice(targetIdx, 0, moved);
    onReorderSections(reordered);
    setDragSrc(null);
  };

  const wordCount = advGetWordCount(advertorial);
  const lengthTier = ADV_LENGTH_TIERS.find(t => t.id === advGetLengthTier(wordCount));

  return <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
    {/* Left column - section list */}
    <div style={{ width: 360, backgroundColor: T.bg, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sections</div>
          <div style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>{wordCount} words · {lengthTier?.label}</div>
        </div>
        <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowAddSection(true)} style={{ width: '100%', justifyContent: 'center' }}>Add Section</Btn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gap: 6 }}>
        {advertorial.sections.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 11.5, color: T.textMute }}>No sections yet. Add your first section to start.</div>
        ) : advertorial.sections.map((s, idx) => (
          <AdvSectionRow
            key={s.id}
            section={s}
            isSelected={selectedSectionId === s.id}
            isDragSrc={dragSrc === idx}
            idx={idx}
            onSelect={() => setSelectedSectionId(s.id)}
            onDelete={() => { onDeleteSection(s.id); if (selectedSectionId === s.id) setSelectedSectionId(null); }}
            onAIEdit={() => setAiEditSection(s)}
            setDragSrc={setDragSrc}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>

    {/* Right column - section editor or settings */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {showSettings ? (
        <AdvertorialSettingsPanel advertorial={advertorial} brands={brands} onPatch={onPatch} onClose={() => setShowSettings(false)} />
      ) : !selectedSection ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: T.textMute }}>
          <FileEdit size={32} color={T.textLow} />
          <div style={{ fontSize: 13 }}>Select a section to edit or add a new one</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, backgroundColor: T.bg, zIndex: 1 }}>
            {(() => {
              const meta = advFindSectionMeta(selectedSection.type);
              const Icon = meta.icon;
              return <>
                <div style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: `${meta.color}22`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={15} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600, letterSpacing: '-0.01em' }}>{meta.name}</div>
                  <div style={{ fontSize: 11, color: T.textMute }}>{meta.desc}</div>
                </div>
              </>;
            })()}
            <div style={{ flex: 1 }} />
            <Btn variant="ai" size="sm" icon={Sparkles} onClick={() => setAiEditSection(selectedSection)} style={{ backgroundColor: '#f97316', borderColor: '#f97316' }}>Edit with AI</Btn>
            <Btn variant="secondary" size="sm" icon={Settings} onClick={() => setShowSettings(true)}>Article Settings</Btn>
          </div>
          <div style={{ padding: 22, maxWidth: 720 }}>
            <AdvSectionContentEditor section={selectedSection} onChange={(updated) => onUpdateSection(updated)} />
            <div style={{ marginTop: 16, padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Token reference (click to insert)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ADV_TOKENS.map(t => <button key={t.key} onClick={() => {
                  // For string content, append the token; for objects, leave to user
                  if (typeof selectedSection.content === 'string') {
                    onUpdateSection({ ...selectedSection, content: (selectedSection.content || '') + `{{${t.key}}}` });
                  }
                }} title={t.label} style={{
                  padding: '3px 7px', fontSize: 10, backgroundColor: T.bg, color: T.cyan,
                  border: `1px solid ${T.border}`, borderRadius: 4, cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace'
                }}>{`{{${t.key}}}`}</button>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

    <AdvAddSectionModal open={showAddSection} onClose={() => setShowAddSection(false)} onAdd={(type) => onAddSection(type)} />
    <AdvAIEditSectionModal open={!!aiEditSection} section={aiEditSection} onClose={() => setAiEditSection(null)} onApply={(newContent) => {
      onUpdateSection({ ...aiEditSection, content: newContent });
    }} />
  </div>;
};

// ============================================================================
// ADVERTORIAL SETTINGS PANEL - title, slug, template, default brand
// ============================================================================
const AdvertorialSettingsPanel = ({ advertorial, brands, onPatch, onClose }) => {
  return <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 720 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <Settings size={18} color={T.textDim} />
      <div style={{ fontSize: 16, color: T.text, fontWeight: 600, letterSpacing: '-0.01em', flex: 1 }}>Article Settings</div>
      <Btn variant="secondary" size="sm" icon={X} onClick={onClose}>Close</Btn>
    </div>
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <Label>Title</Label>
        <Input value={advertorial.title} onChange={(e) => onPatch({ title: e.target.value })} />
      </div>
      <div>
        <Label>Slug (URL path)</Label>
        <Input mono value={advertorial.slug} onChange={(e) => onPatch({ slug: e.target.value })} placeholder="kebab-case-slug" />
        <div style={{ fontSize: 11, color: T.textMute, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>Live URL: [domain]/a/{advertorial.slug}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Label>Template</Label>
          <Select value={advertorial.templateId} onChange={(e) => onPatch({ templateId: e.target.value })}>
            {ADV_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Default brand (for preview)</Label>
          <Select value={advertorial.defaultBrandId} onChange={(e) => onPatch({ defaultBrandId: e.target.value })}>
            {selectableOptions({
                records: brands,
                selectedId: advertorial.defaultBrandId,
                toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
          </Select>
        </div>
      </div>
      <div style={{ padding: 12, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11.5, color: T.textMute, lineHeight: 1.55 }}>
        The default brand is only used when previewing this article in isolation. At deployment time, each deployment specifies its own brand and the article re-renders with that brand's tokens, colors, and disclaimer.
      </div>
    </div>
  </div>;
};

// ============================================================================
// DEPLOYMENT EDITOR
// ============================================================================
const AdvDeploymentEditor = ({ deployment, isDraft, advertorials, brands, quizDeployments, quizzes, onSave, onBack }) => {
  const [draft, setDraft] = useState(deployment);
  const [dirty, setDirty] = useState(isDraft || false);

  useEffect(() => { setDraft(deployment); setDirty(isDraft || false); }, [deployment, isDraft]);

  const patch = (p) => { setDraft(d => ({ ...d, ...p })); setDirty(true); };
  const patchUtm = (k, v) => { setDraft(d => ({ ...d, utm: { ...(d.utm || {}), [k]: v } })); setDirty(true); };
  const patchPixels = (k, v) => { setDraft(d => ({ ...d, pixels: { ...(d.pixels || {}), [k]: v } })); setDirty(true); };

  const ad = advertorials.find(a => a.id === draft.advertorialId);
  const brand = brands.find(b => b.id === draft.brandId);
  const filteredQuizDeployments = quizDeployments.filter(qd => !draft.brandId || qd.brandId === draft.brandId);
  const hasQuizzes = quizzes.length > 0;
  const hasQuizDeployments = quizDeployments.length > 0;

  const handleSave = () => { onSave(draft); setDirty(false); };

  return <div style={{ flex: 1, overflowY: 'auto' }}>
    <div style={{ padding: '24px 40px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, color: T.text, letterSpacing: '-0.02em', fontWeight: 700 }}>{isDraft ? 'New Deployment' : 'Edit Deployment'}</div>
          <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>Maps one advertorial + brand + quiz to a live URL.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="md" onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" size="md" icon={Save} onClick={handleSave}>{isDraft ? 'Create deployment' : 'Save changes'}</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {/* Advertorial */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>Advertorial</Label>
          <Select value={draft.advertorialId || ''} onChange={(e) => patch({ advertorialId: e.target.value })}>
            <option value="">- Select an advertorial -</option>
            {advertorials.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </Select>
          {ad && <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 6, fontFamily: '"JetBrains Mono", monospace' }}>slug: /{ad.slug} · template: {ADV_TEMPLATES.find(t => t.id === ad.templateId)?.name}</div>}
        </div>

        {/* Brand */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>Brand</Label>
          <Select value={draft.brandId || ''} onChange={(e) => patch({ brandId: e.target.value, quizDeploymentId: '' })}>
            <option value="">- Select a brand -</option>
            {selectableOptions({
                records: brands,
                selectedId: draft.brandId,
                toRecord: (b) => ({ id: b.id, label: `${b.displayName} - ${b.domains[0] || 'no domain'}`, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
          </Select>
          {brand && <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 6, fontFamily: '"JetBrains Mono", monospace' }}>{brand.domains.join(', ')} · {brand.contact.callNumber}</div>}
        </div>

        {/* Domain + path */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Domain</Label>
            <Select value={draft.domain || ''} onChange={(e) => patch({ domain: e.target.value })}>
              <option value="">- Pick a domain -</option>
              {(brand?.domains || []).map(d => <option key={d} value={d}>{d}</option>)}
              {brands.flatMap(b => b.domains).filter(d => !brand?.domains?.includes(d)).map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div>
            <Label>Path</Label>
            <Input mono value={draft.path || ''} onChange={(e) => patch({ path: e.target.value })} placeholder={`/a/${ad?.slug || 'slug'}`} />
            <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>Suggested: /a/{ad?.slug || 'your-slug'}</div>
          </div>
        </div>

        {/* CTA Mode - choose how the bottom section closes the advertorial.
            Button mode shows the brand-colored card with buttons that link to
            the linked quiz deployment. Embed mode renders the linked quiz
            inline directly in the page, so the user can start answering without
            navigating away. */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>CTA Mode</Label>
          <div style={{ fontSize: 11.5, color: T.textMute, marginBottom: 10 }}>How the bottom of the advertorial closes the sale.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { id: 'button', icon: MousePointer, label: 'Button to Quiz', desc: 'Brand-colored CTA card. Buttons link out to the quiz deployment URL.' },
              { id: 'embed',  icon: ListChecks,   label: 'Embedded Quiz', desc: 'Quiz renders inline at the bottom of the advertorial. No navigation.' }
            ].map(opt => {
              const isActive = (draft.ctaMode || 'button') === opt.id;
              const Icon = opt.icon;
              return (
                <button key={opt.id} type="button" onClick={() => patch({ ctaMode: opt.id })}
                  aria-pressed={isActive}
                  style={{
                    padding: 14, textAlign: 'left', cursor: 'pointer',
                    backgroundColor: isActive ? T.primarySoft : T.bg,
                    border: `1px solid ${isActive ? T.primary : T.border}`,
                    borderRadius: 8, color: T.text,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    fontFamily: '"Inter", sans-serif'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={15} color={isActive ? T.primary : T.textMute} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{opt.label}</span>
                    {isActive && <Pill color={T.primary}>SELECTED</Pill>}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.4 }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>
          {(draft.ctaMode || 'button') === 'embed' && !draft.quizDeploymentId && (
            <div style={{ marginTop: 10, padding: 10, backgroundColor: `${T.warning}1f`, border: `1px solid ${T.warning}55`, borderRadius: 7, fontSize: 11.5, color: T.warning }}>
              Pick a quiz deployment below. Embed mode needs a quiz to embed.
            </div>
          )}
        </div>

        {/* Linked Quiz */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>Linked Quiz Deployment</Label>
          <div style={{ fontSize: 11.5, color: T.textMute, marginBottom: 8 }}>
            {(draft.ctaMode || 'button') === 'embed'
              ? 'The selected quiz will be embedded inline at the bottom of the advertorial. Inline cta_inline buttons elsewhere in the page still scroll-to or link out to this same quiz.'
              : 'All CTAs in the advertorial (cta_inline sections) that link to "quiz" will route here.'}
          </div>
          {!hasQuizzes ? (
            <div style={{ padding: 14, backgroundColor: `${T.warning}1f`, border: `1px solid ${T.warning}55`, borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={16} color={T.warning} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, marginBottom: 4 }}>No quizzes exist yet</div>
                <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.5 }}>Create a quiz in the Quiz Builder first, then come back here to link it. Until you do, CTAs will fall back to the brand's call number.</div>
              </div>
            </div>
          ) : !hasQuizDeployments ? (
            <div style={{ padding: 14, backgroundColor: `${T.warning}1f`, border: `1px solid ${T.warning}55`, borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={16} color={T.warning} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, marginBottom: 4 }}>No quiz deployments yet</div>
                <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.5 }}>You have quizzes but none are deployed to a domain. Create a deployment in the Quiz Builder first.</div>
              </div>
            </div>
          ) : (
            <>
              <Select value={draft.quizDeploymentId || ''} onChange={(e) => patch({ quizDeploymentId: e.target.value })}>
                <option value="">- No quiz linked (CTAs fall back to phone) -</option>
                {filteredQuizDeployments.map(qd => <option key={qd.id} value={qd.id}>{qd.quizName} · {qd.domain}{qd.path} · {qd.status}</option>)}
                {brand && filteredQuizDeployments.length === 0 && <option disabled>No quiz deployments for this brand yet</option>}
              </Select>
              {brand && filteredQuizDeployments.length === 0 && <div style={{ fontSize: 11.5, color: T.warning, marginTop: 6 }}>No quiz deployment exists for {brand.displayName} yet. Create one in the Quiz Builder, or pick a different brand.</div>}
            </>
          )}
        </div>

        {/* Status */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>Status</Label>
          <Select value={draft.status || 'draft'} onChange={(e) => patch({ status: e.target.value })}>
            <option value="draft">Draft (not live)</option>
            <option value="live">Live (publicly accessible)</option>
            <option value="paused">Paused (off but preserved)</option>
          </Select>
        </div>

        {/* UTM defaults */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>UTM Defaults (optional)</Label>
          <div style={{ fontSize: 11.5, color: T.textMute, marginBottom: 8 }}>Applied to outbound quiz links if no UTM is on the inbound URL.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Input mono placeholder="utm_source" value={draft.utm?.source || ''} onChange={(e) => patchUtm('source', e.target.value)} />
            <Input mono placeholder="utm_medium" value={draft.utm?.medium || ''} onChange={(e) => patchUtm('medium', e.target.value)} />
            <Input mono placeholder="utm_campaign" value={draft.utm?.campaign || ''} onChange={(e) => patchUtm('campaign', e.target.value)} />
          </div>
        </div>

        {/* Pixels */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <Label>Tracking Pixels (optional)</Label>
          <div style={{ display: 'grid', gap: 8 }}>
            <Input mono placeholder="Meta Pixel ID" value={draft.pixels?.metaPixelId || ''} onChange={(e) => patchPixels('metaPixelId', e.target.value)} />
            <Input mono placeholder="TikTok Pixel ID" value={draft.pixels?.tiktokPixelId || ''} onChange={(e) => patchPixels('tiktokPixelId', e.target.value)} />
            <Input mono placeholder="GA4 Measurement ID" value={draft.pixels?.ga4MeasurementId || ''} onChange={(e) => patchPixels('ga4MeasurementId', e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  </div>;
};

// ============================================================================
// BRAND EDITOR (light version - full identity manager lives elsewhere)
// ============================================================================
const AdvBrandEditor = ({ brand, isDraft, onSave, onBack }) => {
  const [draft, setDraft] = useState(brand);
  useEffect(() => { setDraft(brand); }, [brand]);
  const patch = (p) => setDraft(d => ({ ...d, ...p }));
  const patchColors = (k, v) => setDraft(d => ({ ...d, colors: { ...d.colors, [k]: v } }));
  const patchContact = (k, v) => setDraft(d => ({ ...d, contact: { ...d.contact, [k]: v } }));
  const patchLegal = (k, v) => setDraft(d => ({ ...d, legal: { ...d.legal, [k]: v } }));
  const patchTypography = (k, v) => setDraft(d => ({ ...d, typography: { ...d.typography, [k]: v } }));
  const patchBottom = (k, v) => setDraft(d => ({ ...d, bottomSection: { ...(d.bottomSection || {}), [k]: v } }));

  return <div style={{ flex: 1, overflowY: 'auto' }}>
    <div style={{ padding: '24px 40px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, color: T.text, letterSpacing: '-0.02em', fontWeight: 700 }}>{isDraft ? 'New Brand' : `Edit ${brand.displayName}`}</div>
          <div style={{ fontSize: 12.5, color: T.textMute, marginTop: 4 }}>Brand identity used by advertorial deployments. Tokens like {`{{brand.displayName}}`} resolve from here.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="md" onClick={onBack}>Cancel</Btn>
          <Btn variant="primary" size="md" icon={Save} onClick={() => onSave(draft)}>{isDraft ? 'Create brand' : 'Save changes'}</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>Identity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10 }}>
            <div><Label>Name (internal)</Label><Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></div>
            <div><Label>Display name</Label><Input value={draft.displayName} onChange={(e) => patch({ displayName: e.target.value })} /></div>
            <div><Label>Short</Label><Input value={draft.shortName} onChange={(e) => patch({ shortName: e.target.value })} placeholder="CAC" /></div>
          </div>
          <div><Label>Tagline</Label><Input value={draft.tagline} onChange={(e) => patch({ tagline: e.target.value })} /></div>
          <div><Label>Primary Domain(s) (comma separated)</Label><Input mono value={(draft.domains || []).join(', ')} onChange={(e) => patch({ domains: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></div>
          <div><Label>Logo URL</Label><Input mono value={draft.logoUrl} onChange={(e) => patch({ logoUrl: e.target.value })} placeholder="https://..." /></div>
        </div>

        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Colors</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {['primary', 'accent', 'background', 'cardBg'].map(k => (
              <div key={k}>
                <Label>{k}</Label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={draft.colors[k]} onChange={(e) => patchColors(k, e.target.value)} style={{ width: 32, height: 32, border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer', backgroundColor: 'transparent', padding: 2 }} />
                  <Input mono value={draft.colors[k]} onChange={(e) => patchColors(k, e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Typography</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Headline font</Label>
              <Select value={draft.typography.headlineFont} onChange={(e) => patchTypography('headlineFont', e.target.value)}>
                {['Fredoka', 'Inter', 'Poppins', 'Plus Jakarta Sans', 'DM Sans', 'Manrope', 'Outfit', 'Sora'].map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </div>
            <div>
              <Label>Body font</Label>
              <Select value={draft.typography.bodyFont} onChange={(e) => patchTypography('bodyFont', e.target.value)}>
                {['Inter', 'Fredoka', 'Plus Jakarta Sans', 'DM Sans', 'Manrope'].map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </div>
          </div>
        </div>

        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Label>Call number</Label><Input mono value={draft.contact.callNumber} onChange={(e) => patchContact('callNumber', e.target.value)} placeholder="(833) 754-0124" /></div>
            <div><Label>CTA text</Label><Input value={draft.contact.callCtaText} onChange={(e) => patchContact('callCtaText', e.target.value)} placeholder="CLICK HERE TO CALL" /></div>
          </div>
        </div>

        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Legal</div>
          <div><Label>Copyright</Label><Input value={draft.legal.copyright} onChange={(e) => patchLegal('copyright', e.target.value)} /></div>
          <div><Label>Default disclaimer (used by disclaimer sections)</Label><Textarea value={draft.legal.disclaimer} onChange={(e) => patchLegal('disclaimer', e.target.value)} rows={3} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Label>Privacy URL</Label><Input mono value={draft.legal.privacyUrl} onChange={(e) => patchLegal('privacyUrl', e.target.value)} /></div>
            <div><Label>Terms URL</Label><Input mono value={draft.legal.termsUrl} onChange={(e) => patchLegal('termsUrl', e.target.value)} /></div>
          </div>
        </div>

        {/* BOTTOM CTA SECTION - brand-themed bottom-of-page CTA, dynamic copy per brand */}
        <div style={{ padding: 18, backgroundColor: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 10, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Bottom CTA Section</div>
              <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 4 }}>Renders below every advertorial body, themed in brand colors. Use {`{{brand.displayName}}`} {`{{brand.primaryDomain}}`} for dynamic copy. This is where the brand voice lives.</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.bottomSection?.enabled !== false} onChange={(e) => patchBottom('enabled', e.target.checked)} />
              Enabled
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
            <div><Label>Badge text (small pill at top)</Label><Input value={draft.bottomSection?.badgeText || ''} onChange={(e) => patchBottom('badgeText', e.target.value)} placeholder="FREE EVALUATION" /></div>
            <div><Label>Badge color</Label>
              <Select value={draft.bottomSection?.badgeColor || 'auto'} onChange={(e) => patchBottom('badgeColor', e.target.value)}>
                <option value="auto">Auto (accent)</option>
                <option value="#f59e0b">Orange</option>
                <option value="#10b981">Green</option>
                <option value="#1d8df6">Blue</option>
                <option value="#a78bfa">Purple</option>
                <option value="#ef4444">Red</option>
              </Select>
            </div>
          </div>
          <div><Label>Headline</Label><Input value={draft.bottomSection?.headline || ''} onChange={(e) => patchBottom('headline', e.target.value)} placeholder="Find Out What Your Case Could Be Worth" /></div>
          <div><Label>Subline</Label><Input value={draft.bottomSection?.subline || ''} onChange={(e) => patchBottom('subline', e.target.value)} placeholder="Takes 60 seconds. No obligation. Confidential." /></div>
          <div><Label>USP / dynamic brand copy (use {`{{brand.displayName}}`})</Label><Textarea value={draft.bottomSection?.uspCopy || ''} onChange={(e) => patchBottom('uspCopy', e.target.value)} rows={3} placeholder="At {{brand.displayName}}, we analyse the details of your accident and connect you with the attorney best suited to win your case." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><Label>Primary button text</Label><Input value={draft.bottomSection?.primaryButtonText || ''} onChange={(e) => patchBottom('primaryButtonText', e.target.value)} placeholder="Start My Free Evaluation" /></div>
            <div><Label>Secondary button text (optional)</Label><Input value={draft.bottomSection?.secondaryButtonText || ''} onChange={(e) => patchBottom('secondaryButtonText', e.target.value)} placeholder="Estimate My Claim Value" /></div>
          </div>
          <div><Label>Micro copy under buttons</Label><Input value={draft.bottomSection?.microCopy || ''} onChange={(e) => patchBottom('microCopy', e.target.value)} placeholder="Free Case Review · No Obligation" /></div>
        </div>
      </div>
    </div>
  </div>;
};

// ============================================================================
// PREVIEW VIEW - renders advertorial with brand styles + token substitution
// ============================================================================
// Body sections always use Inter on a white page. Per Nick's spec:
// only header, accent colors, phone, logo, CTA button colors, and the
// brand bottom section change per brand. The article body itself is
// brand-agnostic typography on white.
const ADV_ARTICLE_FONT = '"Inter", system-ui, -apple-system, sans-serif';

const advRenderSection = (section, brand, quizDeployment) => {
  const tokens = (s) => advResolveTokens(s, brand, quizDeployment);
  const primary = brand?.colors?.primary || '#1d8df6';
  const accent = brand?.colors?.accent || primary;

  switch (section.type) {
    case 'kicker':
      return <div style={{ fontSize: 12, color: primary, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 16, fontFamily: ADV_ARTICLE_FONT }}>{tokens(section.content)}</div>;

    case 'headline':
      return <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', lineHeight: 1.15, color: '#0f172a', fontWeight: 800, letterSpacing: '-0.025em', marginTop: 0, marginBottom: 18, fontFamily: ADV_ARTICLE_FONT }}>{tokens(section.content)}</h1>;

    case 'sub_headline':
      return <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 26px)', lineHeight: 1.25, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.015em', marginTop: 36, marginBottom: 14, fontFamily: ADV_ARTICLE_FONT }}>{tokens(section.content)}</h2>;

    case 'byline':
      return <div style={{ fontSize: 13.5, color: '#64748b', marginBottom: 28, fontFamily: ADV_ARTICLE_FONT, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{tokens(section.content)}</div>;

    case 'dateline':
      return <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, fontFamily: ADV_ARTICLE_FONT, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tokens(section.content)}</div>;

    case 'lede':
      return <p style={{ fontSize: 19, lineHeight: 1.6, color: '#1e293b', fontStyle: 'italic', fontWeight: 500, marginTop: 0, marginBottom: 24, fontFamily: ADV_ARTICLE_FONT, borderLeft: `3px solid ${primary}`, paddingLeft: 18 }}>{tokens(section.content)}</p>;

    case 'paragraph':
      return <p style={{ fontSize: 17, lineHeight: 1.75, color: '#334155', marginTop: 0, marginBottom: 18, fontFamily: ADV_ARTICLE_FONT, fontWeight: 400 }}>{tokens(section.content)}</p>;

    case 'pull_quote':
      return <blockquote style={{ fontSize: 22, lineHeight: 1.45, color: '#0f172a', fontStyle: 'italic', fontWeight: 600, margin: '28px 0', padding: '8px 0 8px 22px', borderLeft: `4px solid ${primary}`, fontFamily: ADV_ARTICLE_FONT, letterSpacing: '-0.01em' }}>{tokens(section.content)}</blockquote>;

    case 'callout_box': {
      // Solid brand-color callout card with a side icon, matching the CAC reference design
      const c = section.content || {};
      return <aside style={{ margin: '28px 0', padding: 'clamp(18px, 3vw, 26px)', borderRadius: 12, background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`, color: '#fff', fontFamily: ADV_ARTICLE_FONT, display: 'flex', alignItems: 'flex-start', gap: 16, boxShadow: `0 10px 30px -10px ${primary}55` }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldAlert size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {c.headline && <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.005em' }}>{tokens(c.headline)}</div>}
          {c.text && <div style={{ fontSize: 14.5, opacity: 0.92, lineHeight: 1.55 }}>{tokens(c.text)}</div>}
        </div>
      </aside>;
    }

    case 'stat_block': {
      const c = section.content || {};
      return <div style={{ margin: '28px 0', padding: '28px 24px', backgroundColor: '#f8fafc', border: `1px solid #e2e8f0`, borderRadius: 12, textAlign: 'center', fontFamily: ADV_ARTICLE_FONT }}>
        <div style={{ fontSize: 'clamp(36px, 6vw, 56px)', color: primary, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: ADV_ARTICLE_FONT }}>{tokens(c.value)}</div>
        <div style={{ fontSize: 14, color: '#475569', marginTop: 10, fontWeight: 500, lineHeight: 1.5 }}>{tokens(c.label)}</div>
        {c.source && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' }}>{c.source}</div>}
      </div>;
    }

    case 'bullet_list': {
      const items = section.content?.items || [];
      return <ul style={{ margin: '14px 0 24px', paddingLeft: 22, fontFamily: ADV_ARTICLE_FONT, color: '#334155', fontSize: 17, lineHeight: 1.7 }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: 8 }}>{tokens(it)}</li>)}
      </ul>;
    }

    case 'numbered_list': {
      const items = section.content?.items || [];
      return <ol style={{ margin: '14px 0 24px', paddingLeft: 0, listStyle: 'none', fontFamily: ADV_ARTICLE_FONT }}>
        {items.map((it, i) => <li key={i} style={{ display: 'flex', gap: 16, marginBottom: 18, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 999, backgroundColor: primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, fontFamily: ADV_ARTICLE_FONT }}>{i + 1}</div>
          <div style={{ flex: 1, fontSize: 17, lineHeight: 1.65, color: '#334155', paddingTop: 4 }}>{tokens(it)}</div>
        </li>)}
      </ol>;
    }

    case 'image_block': {
      const c = section.content || {};
      return <figure style={{ margin: '24px 0' }}>
        {c.url ? <img loading="lazy" decoding="async" src={c.url} alt={c.alt || ''} style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }} /> : <div style={{ width: '100%', height: 200, backgroundColor: '#f1f5f9', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, fontFamily: ADV_ARTICLE_FONT }}>Image placeholder</div>}
        {c.caption && <figcaption style={{ fontSize: 12.5, color: '#64748b', textAlign: 'center', marginTop: 10, fontStyle: 'italic', fontFamily: ADV_ARTICLE_FONT }}>{tokens(c.caption)}</figcaption>}
      </figure>;
    }

    case 'cta_inline': {
      const c = section.content || {};
      const href = c.linkType === 'call' ? `tel:${(brand?.contact?.callNumber || '').replace(/[^\d+]/g, '')}` : c.linkType === 'external' ? c.externalUrl : quizDeployment ? `https://${quizDeployment.domain}${quizDeployment.path}` : '#';
      return <div style={{ margin: '32px 0', padding: 'clamp(22px, 4vw, 32px)', borderRadius: 14, background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`, color: '#fff', fontFamily: ADV_ARTICLE_FONT, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', boxShadow: `0 14px 40px -12px ${primary}55` }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          {c.headline && <div style={{ fontSize: 'clamp(18px, 2.6vw, 22px)', fontWeight: 700, letterSpacing: '-0.015em', marginBottom: 6 }}>{tokens(c.headline)}</div>}
          {c.subline && <div style={{ fontSize: 14.5, opacity: 0.92 }}>{tokens(c.subline)}</div>}
        </div>
        <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 22px', backgroundColor: '#fff', color: primary, borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', letterSpacing: '-0.005em', flexShrink: 0 }}>{c.buttonText || 'Check My Case'} <ArrowRight size={16} /></a>
      </div>;
    }

    case 'divider':
      return <hr style={{ border: 'none', borderTop: `1px solid #e2e8f0`, margin: '36px 0' }} />;

    case 'disclaimer': {
      const c = section.content || {};
      const text = c.useDefault !== false ? (brand?.legal?.disclaimer || '') : (c.customText || '');
      return <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid #e2e8f0`, fontSize: 11.5, color: '#64748b', lineHeight: 1.6, fontFamily: ADV_ARTICLE_FONT }}>{tokens(text)}</div>;
    }

    default:
      return null;
  }
};

// Embedded quiz CTA - shown at the bottom of an advertorial when its
// deployment has ctaMode === 'embed'. Renders the first step of the linked
// quiz inline inside a brand-colored container, so the visitor can start
// answering without leaving the advertorial. In production this would mount
// the live quiz iframe; in admin preview we render a representation of the
// first step + a Start button.
const AdvEmbeddedQuizPreview = ({ brand, quizDeployment, quiz }) => {
  const primary = brand?.colors?.primary || '#1d8df6';
  const darkenHex = (hex, amount = 0.55) => {
    const m = (hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const f = (c) => Math.round(c * (1 - amount));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  const primaryDark = darkenHex(primary, 0.55);

  // Pull the first question variant for a representative preview.
  const firstStep = quiz?.steps?.[0];
  const firstVariant = firstStep && (quiz?.nodes || []).find(n => n.stepKey === firstStep.key) || null;
  const headline = firstVariant?.headline || firstVariant?.question || 'Start the quiz';
  const tagline = firstVariant?.tagline || quiz?.name || '';
  const answers = (firstVariant?.answers || []).slice(0, 4);
  const quizHref = quizDeployment ? `https://${quizDeployment.domain}${quizDeployment.path}` : '#';

  return (
    <div style={{ padding: '32px 20px 56px', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 760,
        background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
        borderRadius: 20,
        padding: 'clamp(28px, 4vw, 44px) clamp(20px, 3.5vw, 40px)',
        color: '#fff',
        fontFamily: ADV_ARTICLE_FONT,
        boxShadow: `0 24px 60px -20px ${primary}80, 0 8px 24px -8px rgba(0,0,0,0.4)`,
        position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10) 0%, transparent 50%)`,
          pointerEvents: 'none'
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fde68a',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 16
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#fde68a' }} />
            EMBEDDED QUIZ {quiz ? `· ${quiz.name}` : ''}
          </div>
          {tagline && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tagline}</div>}
          <h2 style={{
            fontSize: 'clamp(22px, 3.4vw, 32px)', lineHeight: 1.2,
            color: '#fff', fontWeight: 800, letterSpacing: '-0.02em',
            margin: '0 0 24px'
          }}>{headline}</h2>

          {/* Answer buttons preview (if the first variant has them) */}
          {answers.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: answers.length > 2 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18 }}>
              {answers.map((a, i) => (
                <a key={i} href={quizHref} style={{
                  padding: '14px 18px',
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 10,
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  textDecoration: 'none', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700
                  }}>{i + 1}</span>
                  {a.label || a.text || `Option ${i + 1}`}
                </a>
              ))}
            </div>
          ) : (
            <a href={quizHref} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px',
              backgroundColor: '#1d8df6',
              color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700,
              textDecoration: 'none', letterSpacing: '-0.005em',
              boxShadow: '0 8px 24px -6px rgba(29, 141, 246, 0.6)'
            }}>Start the quiz <ArrowRight size={16} /></a>
          )}

          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>
            Free Case Review · No Obligation · Takes 60 seconds
          </div>
        </div>
      </div>
    </div>
  );
};

// Brand bottom section - renders inside the advertorial article body as a
// contained, brand-colored gradient box. Not full-width: a rounded card with
// drop shadow that sits within the page content. Edit copy in Brand Editor
// → Bottom CTA Section.
const AdvBrandBottomCTA = ({ brand, quizDeployment }) => {
  const bs = brand?.bottomSection;
  if (!bs || bs.enabled === false) return null;
  const tokens = (s) => advResolveTokens(s, brand, quizDeployment);
  const primary = brand?.colors?.primary || '#1d8df6';
  const accent = brand?.colors?.accent || primary;
  const callHref = `tel:${(brand?.contact?.callNumber || '').replace(/[^\d+]/g, '')}`;
  const quizHref = quizDeployment ? `https://${quizDeployment.domain}${quizDeployment.path}` : callHref;
  const badgeColor = bs.badgeColor && bs.badgeColor !== 'auto' ? bs.badgeColor : accent;
  // Darker shade of the brand primary used for the gradient endpoint. We compose
  // it by mixing the primary toward black.
  const darkenHex = (hex, amount = 0.35) => {
    const m = (hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const f = (c) => Math.round(c * (1 - amount));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  const primaryDark = darkenHex(primary, 0.55);

  // Outer wrapper sits inside the article column (max-width 760).
  // Box has rounded corners, gradient bg, soft drop shadow.
  return (
    <div style={{ padding: '32px 20px 56px', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 760,
        background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
        borderRadius: 20,
        padding: 'clamp(36px, 5vw, 56px) clamp(24px, 4vw, 48px)',
        color: '#fff', textAlign: 'center',
        fontFamily: ADV_ARTICLE_FONT,
        boxShadow: `0 24px 60px -20px ${primary}80, 0 8px 24px -8px rgba(0,0,0,0.4)`,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle inner gradient overlay for depth */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10) 0%, transparent 50%)`,
          pointerEvents: 'none'
        }} />
        <div style={{ position: 'relative' }}>
          {bs.badgeText && <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 18px', borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.25)',
            border: `1px solid rgba(255,255,255,0.18)`,
            color: '#fde68a',
            fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 22
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#fde68a' }} />
            {bs.badgeText}
          </div>}
          <h2 style={{
            fontSize: 'clamp(26px, 4vw, 38px)', lineHeight: 1.18,
            color: '#fff', fontWeight: 800, letterSpacing: '-0.02em',
            margin: '0 0 14px', fontFamily: ADV_ARTICLE_FONT
          }}>{tokens(bs.headline)}</h2>
          {bs.subline && <p style={{
            fontSize: 15.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)',
            margin: '0 0 28px', fontWeight: 400, fontFamily: ADV_ARTICLE_FONT
          }}>{tokens(bs.subline)}</p>}

          <div className="adv-cta-buttons" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <a href={quizHref} style={{
              padding: '14px 28px',
              backgroundColor: '#1d8df6',
              color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              letterSpacing: '-0.005em',
              boxShadow: '0 8px 24px -6px rgba(29, 141, 246, 0.6)',
              border: 'none'
            }}>{bs.primaryButtonText || 'Start My Free Evaluation'} <ArrowRight size={16} /></a>
            {bs.secondaryButtonText && <a href={quizHref} style={{
              padding: '14px 26px', backgroundColor: 'transparent',
              color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 600,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              letterSpacing: '-0.005em',
              border: `1px solid rgba(255,255,255,0.35)`
            }}>{bs.secondaryButtonText}</a>}
          </div>
          {bs.microCopy && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', fontFamily: ADV_ARTICLE_FONT, marginTop: 12 }}>{tokens(bs.microCopy)}</div>}
          {bs.verifiedText && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', fontFamily: ADV_ARTICLE_FONT, marginTop: 14 }}>© {new Date().getFullYear()} {brand?.displayName || ''} · {tokens(bs.verifiedText)}</div>}
        </div>
      </div>
    </div>
  );
};

const AdvPreviewView = ({ advertorial, brands, deployments, quizDeployments, quizzes, onBack }) => {
  const [selectedBrandId, setSelectedBrandId] = useState(advertorial.defaultBrandId || brands[0]?.id);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(null);

  const advertorialDeployments = deployments.filter(d => d.advertorialId === advertorial.id);
  const effectiveDeployment = deployments.find(d => d.id === selectedDeploymentId);
  const effectiveBrand = effectiveDeployment ? brands.find(b => b.id === effectiveDeployment.brandId) : brands.find(b => b.id === selectedBrandId);
  const effectiveQuizDep = effectiveDeployment ? quizDeployments.find(qd => qd.id === effectiveDeployment.quizDeploymentId) : null;

  const brandBg = effectiveBrand?.colors?.background || '#0a1628';
  const primary = effectiveBrand?.colors?.primary || '#1d8df6';
  const accent = effectiveBrand?.colors?.accent || primary;
  const callDigits = (effectiveBrand?.contact?.callNumber || '').replace(/[^\d+]/g, '');

  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    {/* Builder preview chrome (only visible inside admin) */}
    <div style={{ padding: '12px 22px', backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Preview as</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: T.textMute }}>Brand:</span>
        <Select value={effectiveDeployment ? '' : selectedBrandId} onChange={(e) => { setSelectedBrandId(e.target.value); setSelectedDeploymentId(null); }} style={{ width: 200, padding: '5px 8px', fontSize: 11.5 }} disabled={!!effectiveDeployment}>
          {selectableOptions({
                records: brands,
                selectedId: selectedBrandId,
                toRecord: (b) => ({ id: b.id, label: b.displayName, status: b.status === 'archived' ? 'archived' : 'published' }),
              }).map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}{o.archived ? ' - ARCHIVED' : ''}</option>)}
        </Select>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: T.textMute }}>Or deployment:</span>
        <Select value={selectedDeploymentId || ''} onChange={(e) => setSelectedDeploymentId(e.target.value || null)} style={{ width: 280, padding: '5px 8px', fontSize: 11.5 }}>
          <option value="">- None (use brand only) -</option>
          {advertorialDeployments.map(d => {
            const b = brands.find(x => x.id === d.brandId);
            return <option key={d.id} value={d.id}>{d.domain}{d.path} · {b?.displayName}</option>;
          })}
        </Select>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>{advGetWordCount(advertorial)} words</div>
    </div>

    {/* The actual rendered advertorial (what the visitor sees) */}
    <div className="adv-public-root" style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
      <style>{`
        /* Advertorial mobile responsive
           The article body already uses clamp() for padding/font-size, so we
           only need to fix the sticky-header CTAs and the bottom CTA card
           buttons on small screens. */
        @media (max-width: 640px) {
          .adv-public-root .adv-header {
            flex-wrap: wrap !important;
            padding: 12px 18px !important;
            gap: 10px !important;
          }
          .adv-public-root .adv-header > *:nth-child(1) {
            flex-basis: 100%;
          }
          .adv-public-root .adv-header > *:nth-child(2),
          .adv-public-root .adv-header > *:nth-child(3) {
            flex: 1;
            min-height: 44px;
            justify-content: center;
          }
          .adv-public-root .adv-cta-buttons {
            flex-direction: column !important;
          }
          .adv-public-root .adv-cta-buttons a {
            width: 100% !important;
            justify-content: center !important;
            min-height: 48px;
          }
          .adv-public-root h1 { font-size: clamp(26px, 7vw, 32px) !important; }
          .adv-public-root h2 { font-size: clamp(22px, 6vw, 28px) !important; }
        }
      `}</style>
      {/* Brand-themed header. No nav. Just logo (left) + phone link + brand CTA (right). */}
      <div className="adv-header" style={{
        backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: ADV_ARTICLE_FONT, maxWidth: 1200, margin: '0 auto'
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {effectiveBrand?.logoUrl ? <img loading="lazy" decoding="async" src={effectiveBrand.logoUrl} alt={effectiveBrand.displayName} style={{ height: 28 }} /> :
            <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 800, letterSpacing: '-0.01em', fontFamily: ADV_ARTICLE_FONT, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{effectiveBrand?.shortName?.[0] || effectiveBrand?.displayName?.[0] || 'B'}</div>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13.5 }}>{effectiveBrand?.displayName}</span>
            </div>}
        </div>
        <a href={`tel:${callDigits}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: '#0f172a', fontSize: 14, fontWeight: 600, textDecoration: 'none',
          fontFamily: ADV_ARTICLE_FONT, whiteSpace: 'nowrap'
        }}><Phone size={14} /> {effectiveBrand?.contact?.callNumber}</a>
        <a href={effectiveQuizDep ? `https://${effectiveQuizDep.domain}${effectiveQuizDep.path}` : `tel:${callDigits}`} style={{
          padding: '9px 18px',
          background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
          color: '#fff', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '-0.005em',
          boxShadow: `0 6px 16px -6px ${primary}77`, whiteSpace: 'nowrap'
        }}>{effectiveBrand?.cta?.label || 'See if you qualify'} <ArrowRight size={14} /></a>
      </div>

      {/* Article body - always Inter on white, brand-agnostic typography */}
      <article style={{
        maxWidth: 760, margin: '0 auto',
        padding: 'clamp(32px, 5vw, 64px) clamp(20px, 4vw, 32px)',
        backgroundColor: '#fff',
        fontFamily: ADV_ARTICLE_FONT
      }}>
        {advertorial.sections.map(s => <React.Fragment key={s.id}>{advRenderSection(s, effectiveBrand, effectiveQuizDep)}</React.Fragment>)}
      </article>

      {/* Bottom: either the brand-themed button CTA OR an embedded quiz,
          based on the deployment's ctaMode setting. */}
      {(effectiveDeployment?.ctaMode === 'embed' && effectiveQuizDep)
        ? <AdvEmbeddedQuizPreview brand={effectiveBrand} quizDeployment={effectiveQuizDep} quiz={quizzes?.find?.(q => q.id === effectiveQuizDep.quizId)} />
        : <AdvBrandBottomCTA brand={effectiveBrand} quizDeployment={effectiveQuizDep} />}

      {/* Full footer: logo + prefer-to-call + copyright/links, then disclaimer paragraph */}
      <footer style={{
        backgroundColor: '#0a1322', color: 'rgba(255,255,255,0.6)',
        fontFamily: ADV_ARTICLE_FONT, fontSize: 13, lineHeight: 1.55,
        paddingTop: 36, paddingBottom: 28
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          padding: '0 clamp(20px, 4vw, 32px)',
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap'
        }}>
          {/* Logo column */}
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            {effectiveBrand?.logoUrl ? <img loading="lazy" decoding="async" src={effectiveBrand.logoUrl} alt={effectiveBrand.displayName} style={{ height: 26, filter: 'brightness(0) invert(1)' }} /> :
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', border: `1px solid ${primary}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: primary, fontSize: 11, fontWeight: 800 }}>{effectiveBrand?.shortName?.[0] || effectiveBrand?.displayName?.[0] || 'B'}</div>
                {effectiveBrand?.displayName}
              </div>}
          </div>

          {/* Center: prefer to call us */}
          <div style={{ flex: '1 1 200px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>Prefer to call us?</div>
            <a href={`tel:${callDigits}`} style={{ fontSize: 17, color: '#fff', fontWeight: 700, textDecoration: 'none', letterSpacing: '-0.01em' }}>{effectiveBrand?.contact?.callNumber}</a>
          </div>

          {/* Right: copyright + legal links */}
          <div style={{ flex: '1 1 200px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            <div style={{ marginBottom: 6 }}>{advResolveTokens(effectiveBrand?.legal?.copyright || '', effectiveBrand, effectiveQuizDep)}</div>
            <div style={{ display: 'inline-flex', gap: 14, justifyContent: 'flex-end' }}>
              {effectiveBrand?.legal?.termsUrl && <a href={effectiveBrand.legal.termsUrl} style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Terms &amp; Conditions</a>}
              {effectiveBrand?.legal?.privacyUrl && <a href={effectiveBrand.legal.privacyUrl} style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Privacy Policy</a>}
            </div>
          </div>
        </div>

        {/* Disclaimer paragraph */}
        {effectiveBrand?.legal?.disclaimer && <div style={{
          maxWidth: 1100, margin: '24px auto 0',
          padding: '20px clamp(20px, 4vw, 32px) 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)',
          fontFamily: ADV_ARTICLE_FONT
        }}>
          <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>DISCLAIMER:&nbsp;</span>
          {advResolveTokens(effectiveBrand.legal.disclaimer, effectiveBrand, effectiveQuizDep)}
        </div>}
      </footer>
    </div>
  </div>;
};
// ============================================================================
// MAIN APP - wired to Payload via server actions. Advertorials + deployments
// are real records (seeded once, then fully editable). Brands come from Sites
// (managed in Brand Identities) and quizzes/quiz deployments from the Quiz
// Builder, all passed in as props.
// ============================================================================
const AdvertorialBuilderApp = ({
  initialAdvertorials = [],
  initialDeployments = [],
  brands: brandsProp = [],
  quizzes = [],
  quizDeployments = [],
}) => {
  const [tab, setTab] = useState('advertorials')
  const [view, setView] = useState('list')
  const [advertorials, setAdvertorials] = useState(initialAdvertorials)
  const [deployments, setDeployments] = useState(initialDeployments)
  // Brands are managed in Brand Identities; held here as state only so the
  // (unreachable) brand editor code from the artifact stays intact.
  const [brands, setBrands] = useState(brandsProp)
  const [currentAdvertorialId, setCurrentAdvertorialId] = useState(null)
  const [currentBrandId, setCurrentBrandId] = useState(null)
  const [currentDeploymentId, setCurrentDeploymentId] = useState(null)
  const [draftBrand, setDraftBrand] = useState(null)
  const [draftDeployment, setDraftDeployment] = useState(null)
  const [previewAdvertorialId, setPreviewAdvertorialId] = useState(null)
  const [showAICreate, setShowAICreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [toast, setToast] = useState(null)

  // Keep brands fresh if the server re-renders with new Site data.
  useEffect(() => { setBrands(brandsProp) }, [brandsProp])

  // Debounced per-advertorial autosave so editing sections does not spam writes.
  // The write is settled rather than fired and forgotten: an autosave that
  // rejects used to be an unhandled rejection and nothing else, so the editor
  // went on showing edits that were never stored.
  const saveTimers = useRef({})
  const scheduleSave = (ad) => {
    if (!ad || !ad.id) return
    if (saveTimers.current[ad.id]) clearTimeout(saveTimers.current[ad.id])
    saveTimers.current[ad.id] = setTimeout(() => {
      void settleAction(svSaveAdvertorial({ id: ad.id, advertorial: ad })).then((res) => {
        if (!res.ok) setToast({ message: `Autosave failed: ${failureMessage(res)}`, type: 'error' })
      })
    }, 600)
  }

  // Apply an update to the current advertorial, persist (debounced).
  const mutateCurrent = (updater) => {
    const next = advertorials.map((a) => (a.id === currentAdvertorialId ? { ...updater(a), updatedAt: Date.now() } : a))
    setAdvertorials(next)
    const cur = next.find((a) => a.id === currentAdvertorialId)
    if (cur) scheduleSave(cur)
  }

  // Derived state
  const currentAdvertorial = advertorials.find((a) => a.id === currentAdvertorialId)
  const currentBrand = draftBrand || brands.find((b) => b.id === currentBrandId)
  const currentDeployment = draftDeployment || deployments.find((d) => d.id === currentDeploymentId)
  const previewAdvertorial = advertorials.find((a) => a.id === previewAdvertorialId)

  // =========================================================================
  // ADVERTORIAL HANDLERS
  // =========================================================================
  const createAdvertorial = async () => {
    const base = {
      title: 'Untitled Advertorial',
      slug: 'untitled-advertorial',
      templateId: 'personal_story',
      defaultBrandId: brands[0]?.id || '',
      status: 'draft',
      sections: [
        { id: genId('sec'), type: 'kicker', content: 'CATEGORY · TOPIC' },
        { id: genId('sec'), type: 'headline', content: 'Your compelling headline here' },
        { id: genId('sec'), type: 'byline', content: 'By [Author] · X min read · ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
        { id: genId('sec'), type: 'lede', content: 'Opening paragraph that sets the scene and hooks the reader.' },
        { id: genId('sec'), type: 'paragraph', content: 'Body paragraph. Use {{brand.displayName}} and other tokens for dynamic content.' },
        { id: genId('sec'), type: 'cta_inline', content: { headline: 'See what your case is really worth', subline: 'Free 60-second case review.', buttonText: 'Check My Case', linkType: 'quiz' } },
        { id: genId('sec'), type: 'disclaimer', content: { useDefault: true } },
      ],
    }
    const res = await settleAction(svCreateAdvertorial({ advertorial: base }))
    if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
    const ad = { ...base, id: res.id, createdAt: Date.now(), updatedAt: Date.now() }
    setAdvertorials((prev) => [ad, ...prev])
    setCurrentAdvertorialId(res.id)
    setView('advertorialEdit')
  }

  const openAdvertorial = (id) => { setCurrentAdvertorialId(id); setView('advertorialEdit') }

  const cloneAdvertorial = async (id) => {
    const orig = advertorials.find((a) => a.id === id)
    if (!orig) return
    const base = {
      title: `${orig.title} (copy)`,
      slug: `${orig.slug}-copy`,
      templateId: orig.templateId,
      defaultBrandId: orig.defaultBrandId,
      status: 'draft',
      sections: orig.sections.map((s) => ({ ...s, id: genId('sec') })),
    }
    const res = await settleAction(svCreateAdvertorial({ advertorial: base }))
    if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
    setAdvertorials((prev) => [{ ...base, id: res.id, createdAt: Date.now(), updatedAt: Date.now() }, ...prev])
    setToast({ message: 'Advertorial duplicated.', type: 'success' })
  }

  const deleteAdvertorial = (id) => {
    const ad = advertorials.find((a) => a.id === id)
    if (!ad) return
    setPendingDelete({
      title: 'Archive advertorial?',
      message: `"${ad.title}" will be deleted. Any deployments using it are removed too.`,
      onConfirm: async () => {
        const res = await settleAction(svDeleteAdvertorial({ id }))
        if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); setPendingDelete(null); return }
        setAdvertorials((prev) => prev.filter((a) => a.id !== id))
        setDeployments((prev) => prev.filter((d) => d.advertorialId !== id))
        setPendingDelete(null)
      },
    })
  }

  const togglePublishAdvertorial = () => {
    if (!currentAdvertorial) return
    const previous = currentAdvertorial
    const status = previous.status === 'published' ? 'draft' : 'published'
    const updated = { ...previous, status, updatedAt: Date.now() }
    setAdvertorials((prev) => prev.map((a) => (a.id === previous.id ? updated : a)))
    /*
     * Unpublishing is the direction that matters: the header pill flipping to
     * DRAFT while the write never landed tells an operator an article is off the
     * air when it is still being served.
     *
     * No `reconcile` here, unlike the quiz and landing-page builders. This
     * screen has no refetch to call - it copies its props into state once and
     * never resyncs - so a `router.refresh()` would re-render the server
     * component while this one went on showing the same stale copy, which is a
     * reconcile in name only. The rollback restores the last status the server
     * is known to have acknowledged, and the message says to reload when the
     * cause is a tab running an older build.
     */
    void commitOptimistic({
      action: () => svSaveAdvertorial({ id: updated.id, advertorial: updated }),
      rollback: () => setAdvertorials((prev) => prev.map((a) => (a.id === previous.id ? previous : a))),
      onError: (message) => setToast({ message: `Could not ${status === 'published' ? 'publish' : 'unpublish'}: ${message}`, type: 'error' }),
    })
  }

  const patchAdvertorial = (patch) => { if (currentAdvertorial) mutateCurrent((a) => ({ ...a, ...patch })) }

  const renameAdvertorial = (id, title) => {
    const previous = advertorials.find((a) => a.id === id)
    if (!previous) return
    const next = { ...previous, title, updatedAt: Date.now() }
    setAdvertorials((prev) => prev.map((a) => (a.id === id ? next : a)))
    void commitOptimistic({
      action: () => svSaveAdvertorial({ id, advertorial: next }),
      rollback: () => setAdvertorials((prev) => prev.map((a) => (a.id === id ? previous : a))),
      onError: (message) => setToast({ message, type: 'error' }),
    })
  }

  const addSection = (type) => {
    if (!currentAdvertorial) return
    let defaultContent
    if (type === 'callout_box') defaultContent = { headline: '', text: '' }
    else if (type === 'stat_block') defaultContent = { value: '', label: '', source: '' }
    else if (type === 'bullet_list' || type === 'numbered_list') defaultContent = { items: [''] }
    else if (type === 'image_block') defaultContent = { url: '', alt: '', caption: '' }
    else if (type === 'cta_inline') defaultContent = { headline: '', subline: '', buttonText: 'Check My Case', linkType: 'quiz' }
    else if (type === 'disclaimer') defaultContent = { useDefault: true }
    else defaultContent = ''
    const sec = { id: genId('sec'), type, content: defaultContent }
    mutateCurrent((a) => ({ ...a, sections: [...a.sections, sec] }))
  }

  const updateSection = (updated) => { if (currentAdvertorial) mutateCurrent((a) => ({ ...a, sections: a.sections.map((s) => (s.id === updated.id ? updated : s)) })) }
  const deleteSection = (sectionId) => { if (currentAdvertorial) mutateCurrent((a) => ({ ...a, sections: a.sections.filter((s) => s.id !== sectionId) })) }
  const reorderSections = (newSections) => { if (currentAdvertorial) mutateCurrent((a) => ({ ...a, sections: newSections })) }

  const handleAICreate = async (generated) => {
    const base = {
      title: generated.title,
      slug: advSlugify(generated.slug || generated.title),
      templateId: generated.templateId,
      defaultBrandId: generated.defaultBrandId,
      status: 'draft',
      sections: (generated.sections || []).map((s) => ({ ...s, id: genId('sec') })),
    }
    const res = await settleAction(svCreateAdvertorial({ advertorial: base }))
    if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
    setAdvertorials((prev) => [{ ...base, id: res.id, createdAt: Date.now(), updatedAt: Date.now() }, ...prev])
    setCurrentAdvertorialId(res.id)
    setView('advertorialEdit')
  }

  // =========================================================================
  // BRAND HANDLERS (unreachable: brands live in Brand Identities) - local only
  // =========================================================================
  const createBrand = () => {
    const b = {
      id: genId('brand'), name: 'New Brand', displayName: 'New Brand', shortName: 'NB', tagline: '', logoUrl: '', domains: [],
      colors: { primary: '#1d8df6', accent: '#0ea5e9', background: '#0a1628', cardBg: '#0d1f33', textOnDark: '#ffffff' },
      typography: { headlineFont: 'Inter', bodyFont: 'Inter' },
      contact: { callNumber: '', callCtaText: 'CALL NOW' },
      legal: { copyright: '© {{site.currentYear}} New Brand', disclaimer: 'Attorney advertising. Not legal advice.', privacyUrl: '', termsUrl: '' },
      bottomSection: advDefaultBottomSection('New Brand'),
    }
    setDraftBrand(b); setCurrentBrandId(null); setView('brandEdit')
  }
  const openBrand = (id) => { setDraftBrand(null); setCurrentBrandId(id); setView('brandEdit') }
  const saveBrand = (b) => {
    if (draftBrand) { setBrands((prev) => [...prev, b]); setDraftBrand(null) }
    else { setBrands((prev) => prev.map((x) => (x.id === b.id ? b : x))) }
    setView('list'); setTab('advertorials')
  }
  const deleteBrand = (id) => {
    const b = brands.find((x) => x.id === id)
    if (!b) return
    setPendingDelete({ title: 'Delete brand?', message: `"${b.displayName}" will be removed locally.`, onConfirm: () => { setBrands((prev) => prev.filter((x) => x.id !== id)); setPendingDelete(null) } })
  }

  // =========================================================================
  // DEPLOYMENT HANDLERS
  // =========================================================================
  const createDeployment = () => {
    const d = {
      id: genId('addep'),
      advertorialId: advertorials[0]?.id || '',
      brandId: brands[0]?.id || '',
      domain: (brands[0]?.domains || [])[0] || '',
      path: '',
      quizDeploymentId: '',
      ctaMode: 'button',
      status: 'draft',
      createdAt: Date.now(),
      utm: { source: '', medium: '', campaign: '' },
      pixels: { metaPixelId: '', tiktokPixelId: '', ga4MeasurementId: '' },
    }
    setDraftDeployment(d); setCurrentDeploymentId(null); setView('deploymentEdit')
  }

  const openDeployment = (id) => { setDraftDeployment(null); setCurrentDeploymentId(id); setView('deploymentEdit') }

  const saveDeployment = async (d) => {
    const wasDraft = !!draftDeployment
    const res = await settleAction(svSaveDeployment({ deployment: d }))
    if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
    const saved = { ...d, id: res.id }
    setDeployments((prev) => (wasDraft ? [saved, ...prev] : prev.map((x) => (x.id === saved.id ? saved : x))))
    setDraftDeployment(null)
    setView('list'); setTab('deployments')
  }

  const cloneDeployment = async (id) => {
    const orig = deployments.find((d) => d.id === id)
    if (!orig) return
    const copy = { ...orig, id: genId('addep'), status: 'draft', createdAt: Date.now(), path: (orig.path || '') + '-copy' }
    const res = await settleAction(svSaveDeployment({ deployment: copy }))
    if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); return }
    setDeployments((prev) => [{ ...copy, id: res.id }, ...prev])
    setToast({ message: 'Deployment duplicated.', type: 'success' })
  }

  const deleteDeployment = (id) => {
    const d = deployments.find((x) => x.id === id)
    if (!d) return
    setPendingDelete({
      title: 'Delete deployment?',
      message: `Deployment at ${d.domain || 'preview'}${d.path || ''} will be permanently removed.`,
      onConfirm: async () => {
        const res = await settleAction(svDeleteDeployment({ id }))
        if (!res.ok) { setToast({ message: failureMessage(res), type: 'error' }); setPendingDelete(null); return }
        setDeployments((prev) => prev.filter((x) => x.id !== id))
        setPendingDelete(null)
      },
    })
  }

  const toggleDeploymentStatus = (id) => {
    const d = deployments.find((x) => x.id === id)
    if (!d) return
    const updated = { ...d, status: d.status === 'live' ? 'paused' : 'live' }
    setDeployments((prev) => prev.map((x) => (x.id === id ? updated : x)))
    // The pause path. This used to fire the write and forget it entirely - not
    // even the server's own refusal was read - so the row showed PAUSED over a
    // deployment that was still live, which is the compliance exposure rather
    // than a cosmetic one.
    void commitOptimistic({
      action: () => svSaveDeployment({ deployment: updated }),
      rollback: () => setDeployments((prev) => prev.map((x) => (x.id === id ? d : x))),
      onError: (message) => setToast({ message: `Could not ${updated.status === 'live' ? 'publish' : 'pause'}: ${message}`, type: 'error' }),
    })
  }

  const renameDeployment = (id, name) => {
    const d = deployments.find((x) => x.id === id)
    if (!d) return
    const updated = { ...d, name }
    setDeployments((prev) => prev.map((x) => (x.id === id ? updated : x)))
    void commitOptimistic({
      action: () => svSaveDeployment({ deployment: updated }),
      rollback: () => setDeployments((prev) => prev.map((x) => (x.id === id ? d : x))),
      onError: (message) => setToast({ message, type: 'error' }),
    })
  }

  const openPreviewFromList = (advertorialId) => { setPreviewAdvertorialId(advertorialId); setView('preview') }
  const openPreviewFromEditor = () => { if (currentAdvertorial) { setPreviewAdvertorialId(currentAdvertorial.id); setView('preview') } }
  const openPreviewFromDeployment = (deploymentId) => {
    const d = deployments.find((x) => x.id === deploymentId)
    if (!d) return
    setPreviewAdvertorialId(d.advertorialId); setView('preview')
  }

  // Bulk simplify: one AI pass per advertorial over its lede + paragraph bodies,
  // saved as each finishes. Fully wired (no stub) with a progress toast.
  const handleBulkSimplify = () => {
    if (!advertorials.length) { setToast({ message: 'No advertorials to simplify.', type: 'info' }); return }
    setPendingDelete({
      title: 'Bulk simplify all advertorials?',
      message: 'Runs an AI pass that lowers the reading level and tightens the body paragraphs across every advertorial. Each article is saved as it finishes.',
      confirmText: 'Run simplify',
      onConfirm: async () => {
        setPendingDelete(null)
        const list = [...advertorials]
        let done = 0
        for (const ad of list) {
          const idxs = ad.sections.map((s, i) => (typeof s.content === 'string' && (s.type === 'paragraph' || s.type === 'lede') ? i : -1)).filter((i) => i >= 0)
          if (idxs.length) {
            const texts = idxs.map((i) => ad.sections[i].content)
            const res = await settleAction(aiBulkSimplify({ texts }))
            if (res?.ok && Array.isArray(res.texts) && res.texts.length === texts.length) {
              const sections = ad.sections.map((s, i) => { const k = idxs.indexOf(i); return k >= 0 ? { ...s, content: res.texts[k] } : s })
              const updated = { ...ad, sections, updatedAt: Date.now() }
              setAdvertorials((prev) => prev.map((a) => (a.id === ad.id ? updated : a)))
              const w = await settleAction(svSaveAdvertorial({ id: ad.id, advertorial: updated }))
              if (!w.ok) {
                // Put the original copy back and STOP. Carrying on would leave a
                // run that reports "complete" over a list showing rewrites that
                // were never stored.
                setAdvertorials((prev) => prev.map((a) => (a.id === ad.id ? ad : a)))
                setToast({ message: `Bulk simplify stopped at "${ad.title}": ${failureMessage(w)}`, type: 'error' })
                return
              }
            }
          }
          done++
          setToast({ message: `Simplified ${done}/${list.length}...`, type: 'info' })
        }
        setToast({ message: 'Bulk simplify complete.', type: 'success' })
      },
    })
  }

  // =========================================================================
  // VIEW ROUTING
  // =========================================================================
  const topBarProps = (() => {
    if (view === 'advertorialEdit' && currentAdvertorial) {
      return {
        view, title: currentAdvertorial.title, status: currentAdvertorial.status,
        onBack: () => setView('list'),
        onPreview: openPreviewFromEditor,
        onSave: () => { const cur = advertorials.find((a) => a.id === currentAdvertorialId); if (cur) { void settleAction(svSaveAdvertorial({ id: cur.id, advertorial: cur })).then((res) => setToast(res.ok ? { message: 'Saved.', type: 'success' } : { message: failureMessage(res), type: 'error' })) } },
        onPublish: togglePublishAdvertorial,
      }
    }
    if (view === 'brandEdit') {
      return { view, title: currentBrand?.displayName || 'New Brand', onBack: () => { setDraftBrand(null); setView('list'); setTab('advertorials') }, onSave: () => currentBrand && saveBrand(currentBrand) }
    }
    if (view === 'deploymentEdit') {
      return { view, title: (currentDeployment?.domain || 'New') + (currentDeployment?.path || ''), onBack: () => { setDraftDeployment(null); setView('list'); setTab('deployments') }, onSave: () => currentDeployment && saveDeployment(currentDeployment) }
    }
    if (view === 'preview' && previewAdvertorial) {
      return { view, title: previewAdvertorial.title, onBack: () => setView('list') }
    }
    return { view: 'list' }
  })()

  return <div style={{ minHeight: '100vh', backgroundColor: T.bg, color: T.text, fontFamily: '"Inter", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Lora:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      button:hover { filter: brightness(1.08); }
      input:focus, select:focus, textarea:focus { border-color: ${T.primary} !important; box-shadow: 0 0 0 3px ${T.primarySoft} !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .spin { animation: spin 0.9s linear infinite; }
    `}</style>

    {view !== 'list' && <AdvBuilderTopBar {...topBarProps} />}

    {view === 'list' && <AdvListShell tab={tab} onTabChange={setTab}>
      {tab === 'advertorials' && <AdvertorialListView
        advertorials={advertorials}
        brands={brands}
        deployments={deployments}
        onOpen={openAdvertorial}
        onCreate={createAdvertorial}
        onClone={cloneAdvertorial}
        onDelete={deleteAdvertorial}
        onPreview={openPreviewFromList}
        onAICreate={() => setShowAICreate(true)}
        onBulkSimplify={handleBulkSimplify}
        onRename={renameAdvertorial}
      />}
      {tab === 'deployments' && <AdvDeploymentListView
        deployments={deployments}
        advertorials={advertorials}
        brands={brands}
        quizDeployments={quizDeployments}
        onOpen={openDeployment}
        onCreate={createDeployment}
        onClone={cloneDeployment}
        onDelete={deleteDeployment}
        onToggleStatus={toggleDeploymentStatus}
        onPreview={openPreviewFromDeployment}
        onRename={renameDeployment}
      />}
    </AdvListShell>}

    {view === 'advertorialEdit' && currentAdvertorial && <AdvertorialEditor
      advertorial={currentAdvertorial}
      brands={brands}
      deployments={deployments}
      onPatch={patchAdvertorial}
      onAddSection={addSection}
      onUpdateSection={updateSection}
      onDeleteSection={deleteSection}
      onReorderSections={reorderSections}
      onPreview={openPreviewFromEditor}
    />}

    {view === 'brandEdit' && currentBrand && <AdvBrandEditor
      brand={currentBrand}
      isDraft={!!draftBrand}
      onSave={saveBrand}
      onBack={() => { setDraftBrand(null); setView('list'); setTab('advertorials') }}
    />}

    {view === 'deploymentEdit' && currentDeployment && <AdvDeploymentEditor
      deployment={currentDeployment}
      isDraft={!!draftDeployment}
      advertorials={advertorials}
      brands={brands}
      quizDeployments={quizDeployments}
      quizzes={quizzes}
      onSave={saveDeployment}
      onBack={() => { setDraftDeployment(null); setView('list'); setTab('deployments') }}
    />}

    {view === 'preview' && previewAdvertorial && <AdvPreviewView
      advertorial={previewAdvertorial}
      brands={brands}
      deployments={deployments}
      quizDeployments={quizDeployments}
      quizzes={quizzes}
      onBack={() => setView('list')}
    />}

    <AdvAICreateWizard
      open={showAICreate}
      brands={brands}
      onClose={() => setShowAICreate(false)}
      onCreate={handleAICreate}
    />

    {pendingDelete && <ConfirmDialog
      open={true}
      title={pendingDelete.title}
      message={pendingDelete.message}
      confirmText={pendingDelete.confirmText || 'Confirm'}
      onConfirm={pendingDelete.onConfirm}
      onCancel={() => setPendingDelete(null)}
    />}

    <Toast message={toast?.message} type={toast?.type} onDismiss={() => setToast(null)} />
  </div>
}

export { AdvertorialBuilderApp }

