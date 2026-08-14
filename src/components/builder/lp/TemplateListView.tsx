// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * The Landing Page TEMPLATES tab: the library, managed.
 *
 * This replaces two screens that each did half the job. The old `Pages` tab
 * listed rows an operator could edit but which the product called pages, and the
 * old `Templates` tab listed the twelve code renderers, which could be looked at
 * and never selected, renamed, disabled or deleted. There is one library now and
 * every row here is a real record, so every verb on the row reaches the database.
 *
 * A row that names a renderer which no longer exists is shown, badged and kept
 * selectable-never. Hiding it would make "where did my template go" unanswerable,
 * and drawing a stand-in is how a deployment ends up serving a design nobody
 * chose.
 */

import { useState } from 'react'
import { Rocket, Eye, Edit3, Copy, Power, PowerOff, Trash2, Layers } from 'lucide-react'

import { T, Btn, Pill, IconBtn, EmptyState } from '../ui'
import { ANGLES, templateFor, templatePreviewSurface } from './render'

const ORIGIN_LABELS = {
  stock: 'STOCK',
  clone: 'CLONE',
  blank: 'BLANK',
  ai: 'CLAUDE',
  legacy: 'LEGACY',
}

const ORIGIN_COLORS = {
  stock: T.info,
  clone: T.purple,
  blank: T.textMute,
  ai: T.pink,
  legacy: T.warning,
}

export const TemplateListView = ({
  templates,
  deployments,
  onPreview,
  onEdit,
  onClone,
  onToggleEnabled,
  onDelete,
  onRename,
}) => {
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No landing page templates yet"
        subtitle="The stock library is materialised on load. If this is empty the reconcile could not run - check the server log for [template-records]."
      />
    )
  }

  const startRename = (t) => { setRenamingId(t.id); setRenameDraft(t.name) }
  const commitRename = () => {
    if (renamingId && renameDraft.trim()) onRename(renamingId, renameDraft.trim())
    setRenamingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {templates.map((t) => {
        // The swatch is drawn from the RENDERER, so a broken row gets no colour
        // it has not earned. `templateFor` falls back loudly; the badge below is
        // what the operator reads, not the tile.
        const swatch = templatePreviewSurface(templateFor(t.templateId), null)
        const angle = ANGLES.find((a) => a.id === t.angle)
        const depCount = deployments.filter((d) => d.landingPageId === t.id).length
        const broken = Boolean(t.rendererError)

        return (
          <div
            key={t.id}
            data-lp-template={t.id}
            data-lp-template-name={t.name}
            data-lp-template-origin={t.origin}
            data-enabled={t.isEnabled ? 'true' : 'false'}
            style={{
              padding: 14,
              backgroundColor: T.bgElev,
              border: `1px solid ${broken ? T.danger : T.border}`,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              // Wrap rather than overflow: at phone widths the fixed-width
              // action cluster is wider than the row, and without wrapping it
              // forces the whole list into a sideways scroll. Desktop never
              // wraps — there is room — so nothing changes there.
              flexWrap: 'wrap',
              opacity: t.isEnabled ? 1 : 0.72,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 9,
                backgroundColor: broken ? T.bg : swatch.bg,
                border: `1px solid ${T.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Rocket size={16} color={broken ? T.danger : swatch.accent} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                {renamingId === t.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                    style={{ flex: 1, maxWidth: 300, backgroundColor: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4, padding: '3px 8px', color: T.text, fontSize: 14, fontWeight: 600, outline: 'none' }}
                  />
                ) : (
                  <span
                    onClick={(e) => { e.stopPropagation(); startRename(t) }}
                    style={{ fontSize: 14, fontWeight: 600, color: T.text, cursor: 'text' }}
                    title="Click to rename"
                  >
                    {t.name}
                  </span>
                )}
                {broken && <Pill color={T.danger}>BROKEN RENDERER</Pill>}
                <Pill color={ORIGIN_COLORS[t.origin] || T.textMute}>{ORIGIN_LABELS[t.origin] || String(t.origin || '').toUpperCase()}</Pill>
                <Pill color={t.isEnabled ? T.success : T.textLow}>{t.isEnabled ? 'ENABLED' : 'DISABLED'}</Pill>
                {!t.isPublished && <Pill color={T.warning}>NOT PUBLISHED</Pill>}
                {t.code && <Pill color={T.purple}>{t.code}</Pill>}
                {angle && <Pill color={T.info}>{angle.label}</Pill>}
                <Pill color={depCount > 0 ? T.success : T.textLow}>{depCount} deployment{depCount === 1 ? '' : 's'}</Pill>
              </div>

              <div style={{ fontSize: 11, color: T.textLow, fontFamily: '"JetBrains Mono", monospace' }}>
                /{t.slug} {'·'} {t.templateId || 'no renderer'} {'·'} {t.usesSlots ? 'slot copy' : `${(t.sections || []).length} sections`}
              </div>

              {broken && (
                <div style={{ fontSize: 11, color: T.danger, marginTop: 5, lineHeight: 1.5 }}>
                  {t.rendererError}. Nothing is drawn in its place - pick a renderer in the editor, or delete the row.
                </div>
              )}
            </div>

            {/* flexWrap here too: the cluster is wider than a phone-width row,
                and a cluster that cannot wrap re-creates the sideways scroll
                the row's own wrap just removed. */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              {/* A broken row has nothing to preview, and drawing another
                  template in its place is the failure the badge exists to
                  report. */}
              <Btn
                variant="ghost"
                size="sm"
                icon={Eye}
                onClick={() => onPreview(t)}
                disabled={broken}
                title={broken ? t.rendererError : undefined}
                style={broken ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                aria-label="Preview template"
              >
                Preview
              </Btn>
              <Btn variant="primary" size="sm" icon={Edit3} onClick={() => onEdit(t)} aria-label="Edit template">Edit</Btn>
              <Btn
                variant="secondary"
                size="sm"
                icon={t.isEnabled ? PowerOff : Power}
                onClick={() => onToggleEnabled(t)}
                aria-label={t.isEnabled ? 'Disable template' : 'Enable template'}
              >
                {t.isEnabled ? 'Disable' : 'Enable'}
              </Btn>
              <IconBtn icon={Copy} onClick={() => onClone(t)} title="Clone" aria-label="Clone template" />
              <IconBtn icon={Trash2} onClick={() => onDelete(t)} style={{ color: T.danger }} title="Delete" aria-label="Delete template" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
