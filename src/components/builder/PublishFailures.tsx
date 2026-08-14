// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * What an operator sees when a publish is refused.
 *
 * The refusal used to be one string. `decideTransition` joined every blocking
 * check as `label: detail` with semicolons, a save wrapped it in "Saved, but not
 * published:", and a toast showed the result for three seconds. Six unrelated
 * problems, in server-run order, with nothing saying which tab any of them lived
 * on — and the deployment editor kept its local `status: 'live'` the whole time,
 * so the screen went on reading LIVE above a paragraph explaining that it was
 * not. Every part of that is fixed here and in `publish-preflight.ts`:
 *
 *   - the failures arrive GROUPED, by the area that fixes them, in repair order;
 *   - each group carries the editor TAB its controls are on, and offers it as a
 *     button, so "Brand" is one click from the Brand picker;
 *   - the banner states the two facts separately — the content IS saved, and it
 *     is NOT live — because collapsing them is what made operators believe a
 *     rejected publish had partially taken;
 *   - the raw check list is kept, behind a disclosure, for whoever has to debug
 *     the checker rather than the deployment.
 *
 * Presentational only. It reads a `PreflightGroupResult[]` exactly as the server
 * produced it and asks the caller to switch tabs; it never re-derives which
 * group a check belongs to, because that mapping has one home.
 */

import { useState } from 'react'
import { AlertTriangle, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react'

import { T, Btn, Pill } from './ui'

/** The tab labels an operator sees, so a deep link names the tab they will land on. */
const TAB_LABELS = {
  general: 'General',
  destinations: "Destination URL's",
  tracking: 'Tracking & Pixels',
}

export const tabLabel = (tab) => TAB_LABELS[tab] || 'General'

/**
 * How many blocking failures sit on each tab.
 *
 * Returned as a plain map so a tab bar can badge itself without knowing what a
 * preflight group is.
 */
export const blockingCountsByTab = (groups) => {
  const counts = {}
  for (const g of groups || []) {
    if (!g.blocking?.length) continue
    counts[g.group.tab] = (counts[g.group.tab] || 0) + g.blocking.length
  }
  return counts
}

const formatWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * The last state that genuinely passed the gate, said plainly.
 *
 * Exported because the list and the editor must not word this differently: a
 * row described as "never published" in one place and "not live" in the other
 * is two claims about one fact.
 */
export const publishStateLine = (status, publishState) => {
  const live = status === 'live'
  const when = formatWhen(publishState?.lastPublishedAt)

  if (!publishState?.everPublished) {
    return live
      ? 'This deployment is serving, but no publish check has ever been recorded for it.'
      : 'This deployment has never been published.'
  }
  if (live && publishState.unverifiedChanges) {
    return `Serving changes that have not been through a publish check. The last version that passed was published ${when}.`
  }
  if (live) return `Published ${when}.`
  return `Not live. The last version that passed a publish check was published ${when}.`
}

/**
 * The pill beside a deployment's status.
 *
 * `null` when the status alone is the whole truth. A pill that appears on every
 * row is a pill nobody reads.
 */
export const publishStatePill = (status, publishState) => {
  if (!publishState?.everPublished) return null
  if (!publishState.unverifiedChanges) return null
  return status === 'live'
    ? { label: 'UNCHECKED EDITS ARE LIVE', color: T.warning }
    : { label: 'CHANGES NOT PUBLISHED', color: T.warning }
}

/* ------------------------------------------------------------------ panel */

const GroupCard = ({ entry, onGoToTab }) => (
  <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, backgroundColor: T.bgElev, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{entry.group.label}</span>
      {entry.blocking.length > 0 && <Pill color={T.danger}>{entry.blocking.length}</Pill>}
      {entry.warnings.length > 0 && <Pill color={T.warning}>{entry.warnings.length} to check</Pill>}
      <div style={{ flex: 1 }} />
      {onGoToTab && (
        <Btn variant="ghost" size="sm" onClick={() => onGoToTab(entry.group.tab)}>
          {tabLabel(entry.group.tab)}
          <ChevronRight size={12} />
        </Btn>
      )}
    </div>
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {entry.blocking.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldAlert size={13} color={T.danger} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.5 }}>{c.detail}</div>
          </div>
        </div>
      ))}
      {entry.warnings.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={13} color={T.warning} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.5 }}>{c.detail}</div>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: T.textLow }}>Fix in {entry.group.where}.</div>
    </div>
  </div>
)

/**
 * @param tone       'block' for a refused publish, 'ok' for a clean dry run.
 * @param body       the sentence under the title. A refused SAVE and a dry RUN
 *                   are two different claims and must not share wording.
 * @param groups     `PreflightGroupResult[]` from the server, already ordered.
 * @param preflight  the full result, for the diagnostics disclosure.
 * @param onGoToTab  switches the editor tab. Omit in surfaces with no tabs.
 */
export const PublishFailurePanel = ({
  tone = 'block',
  title = 'Saved. Not published.',
  body,
  summary,
  statusLine,
  groups = [],
  preflight,
  onGoToTab,
  attemptedAt,
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const blocking = groups.reduce((n, g) => n + (g.blocking?.length || 0), 0)
  const checks = preflight?.checks || []
  const accent = tone === 'ok' ? T.success : T.danger
  const Icon = tone === 'ok' ? ShieldCheck : ShieldAlert

  return (
    <div
      // A refusal interrupts; a clean dry run reports. Announcing both as an
      // alert trains people to ignore the one that matters.
      role={tone === 'ok' ? 'status' : 'alert'}
      data-publish-failure={tone === 'ok' ? undefined : true}
      data-publish-checks={tone}
      style={{
        marginBottom: 20,
        border: `1px solid ${accent}66`,
        borderRadius: 10,
        backgroundColor: `${accent}0e`,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Icon size={18} color={accent} style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{title}</div>
          {/* The two facts, kept apart. "Saved, but not published: <paragraph>"
              read as one event with a long explanation, and operators took the
              length as a sign the save had half-landed. */}
          <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 4, lineHeight: 1.55 }}>
            {body ?? (
              <>
                Your changes are stored. They are <strong style={{ color: T.text }}>not live</strong>
                {blocking > 0 ? ` until ${blocking === 1 ? 'this check passes' : 'these checks pass'}.` : '.'}
              </>
            )}
          </div>
          {statusLine && (
            <div style={{ fontSize: 12, color: T.textMute, marginTop: 4, lineHeight: 1.55 }}>{statusLine}</div>
          )}
          {summary && (
            <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
              {summary}
            </div>
          )}
        </div>
        {attemptedAt && (
          <div style={{ fontSize: 10.5, color: T.textLow, whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono", monospace' }}>
            {formatWhen(attemptedAt)}
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
          {groups.map((entry) => (
            <GroupCard key={entry.group.id} entry={entry} onGoToTab={onGoToTab} />
          ))}
        </div>
      )}

      {/* For whoever is debugging the CHECKER rather than the deployment. Every
          check, passes included, with its stable id — the thing a bug report
          needs and the thing an operator must not be handed first. */}
      {checks.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '9px 16px' }}>
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            aria-expanded={showDiagnostics}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textMute, fontSize: 11, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.05em', textTransform: 'uppercase' }}
          >
            {showDiagnostics ? '▾' : '▸'} Diagnostics ({checks.length} checks)
          </button>
          {showDiagnostics && (
            <div style={{ marginTop: 9, maxHeight: 260, overflowY: 'auto', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: 10 }}>
              {checks.map((c, i) => (
                <div key={`${c.id}-${i}`} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, lineHeight: 1.7, color: c.ok ? T.textLow : c.severity === 'warn' ? T.warning : T.danger }}>
                  {c.ok ? 'PASS ' : c.severity === 'warn' ? 'WARN ' : 'BLOCK'} {c.id}
                  {c.detail ? ` — ${c.detail}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
