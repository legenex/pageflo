'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Circle, RefreshCw } from 'lucide-react'
import type { PlanAgent, PlanFinding, Severity } from '@/lib/agent-plan/plan'

type AgentState = 'idle' | 'running' | 'done' | 'error'
type AgentStatus = {
  agent: string
  state: AgentState
  currentFindingId?: string | null
  currentTask?: string | null
  message?: string | null
  completed: string[]
  startedAt?: string | null
  updatedAt: string
}
type StatusMap = Record<string, AgentStatus>

const SEVERITY: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: '#ef4444' },
  high: { label: 'High', color: '#f97316' },
  medium: { label: 'Medium', color: '#eab308' },
  low: { label: 'Low', color: '#60a5fa' },
  nit: { label: 'Nit', color: '#94a3b8' },
}
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'nit']

const STATE: Record<AgentState, { label: string; color: string }> = {
  idle: { label: 'Idle', color: '#64748b' },
  running: { label: 'Running', color: '#38bdf8' },
  done: { label: 'Done', color: '#22c55e' },
  error: { label: 'Error', color: '#ef4444' },
}

const POLL_MS = 3000

function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const idleStatus = (agent: string): AgentStatus => ({
  agent,
  state: 'idle',
  completed: [],
  updatedAt: '',
})

export function PlanBoard({
  agents,
  findings,
  initialStatus,
}: {
  agents: PlanAgent[]
  findings: PlanFinding[]
  initialStatus: StatusMap
}) {
  const [status, setStatus] = useState<StatusMap>(initialStatus)
  const [syncedAt, setSyncedAt] = useState<string>(new Date().toISOString())
  const [connected, setConnected] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const inFlight = useRef(false)

  const findingsById = useMemo(() => {
    const m = new Map<string, PlanFinding>()
    for (const f of findings) m.set(f.id, f)
    return m
  }, [findings])

  const poll = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const res = await fetch('/api/pageflo/agent-plan', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { ok: boolean; status: StatusMap; syncedAt: string }
      if (data.ok) {
        setStatus(data.status)
        setSyncedAt(data.syncedAt)
        setConnected(true)
      } else {
        setConnected(false)
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setConnected(false)
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    poll(ctl.signal)
    const id = setInterval(() => poll(ctl.signal), POLL_MS)
    return () => {
      ctl.abort()
      clearInterval(id)
    }
  }, [poll])

  const reviewers = agents.filter((a) => a.role === 'reviewer-fixer')

  // Per-agent derived progress (only findings actually assigned to that agent count).
  const rows = reviewers.map((a) => {
    const st = status[a.name] ?? idleStatus(a.name)
    const completedSet = new Set(st.completed)
    const done = a.findingIds.filter((id) => completedSet.has(id)).length
    const total = a.findingIds.length
    return { agent: a, st, done, total }
  })

  const totalFindings = findings.length
  const totalDone = rows.reduce((n, r) => n + r.done, 0)
  const running = rows.filter((r) => r.st.state === 'running').length
  const errored = rows.filter((r) => r.st.state === 'error').length
  const agentsComplete = rows.filter((r) => r.total > 0 && r.done === r.total).length
  const pct = totalFindings ? Math.round((totalDone / totalFindings) * 100) : 0

  const sevCounts = useMemo(() => {
    const c: Record<Severity, { total: number; done: number }> = {
      critical: { total: 0, done: 0 },
      high: { total: 0, done: 0 },
      medium: { total: 0, done: 0 },
      low: { total: 0, done: 0 },
      nit: { total: 0, done: 0 },
    }
    for (const f of findings) {
      c[f.severity].total += 1
      const owner = status[f.agent]
      if (owner && owner.completed.includes(f.id)) c[f.severity].done += 1
    }
    return c
  }, [findings, status])

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const verifier = agents.find((a) => a.role === 'verifier')

  return (
    <div>
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Agent Plan</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">
            Live board of what every review/fix agent is working on — {totalFindings} confirmed findings from the{' '}
            2026-06-04 audit, assigned across {reviewers.length} agents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: connected ? '#22c55e' : '#ef4444',
                boxShadow: connected ? '0 0 0 3px rgba(34,197,94,0.15)' : '0 0 0 3px rgba(239,68,68,0.15)',
              }}
              aria-hidden
            />
            {connected ? 'Live' : 'Reconnecting'} · synced {timeAgo(syncedAt)}
          </span>
          <button
            onClick={() => poll()}
            className="flex items-center gap-1.5 text-[12px] text-[var(--color-ink-muted)] hover:text-white px-2.5 py-1.5 rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Tile label="Findings fixed" value={`${totalDone} / ${totalFindings}`} sub={`${pct}% complete`} />
        <Tile label="Agents running" value={String(running)} sub={`${agentsComplete} fully done`} />
        <Tile label="Errors" value={String(errored)} sub={errored ? 'needs attention' : 'none'} accent={errored ? '#ef4444' : undefined} />
        <Tile label="Verifier" value={verifier ? 'ready' : '—'} sub="confirms fixes" />
      </div>

      {/* Overall progress + severity breakdown */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 mb-6 card-edge">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-white">Overall progress</span>
          <span className="text-[12px] text-[var(--color-ink-muted)]">{totalDone}/{totalFindings}</span>
        </div>
        <ProgressBar done={totalDone} total={totalFindings} color="#22c55e" />
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
          {SEVERITY_ORDER.map((s) => {
            const c = sevCounts[s]
            if (!c.total) return null
            return (
              <div key={s} className="flex items-center gap-2 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEVERITY[s].color }} aria-hidden />
                <span className="text-[var(--color-ink-muted)]">{SEVERITY[s].label}</span>
                <span className="text-white tabular-nums">
                  {c.done}/{c.total}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Agent rows */}
      <div className="space-y-2">
        {rows.map(({ agent, st, done, total }) => {
          const isOpen = expanded.has(agent.name)
          const state = STATE[st.state]
          return (
            <div key={agent.name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
              <button
                onClick={() => toggle(agent.name)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)] transition-colors"
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-[var(--color-ink-dim)] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--color-ink-dim)] shrink-0" />
                )}

                {/* state dot */}
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.state === 'running' ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: state.color }}
                  title={state.label}
                  aria-hidden
                />

                {/* label + agent id */}
                <div className="min-w-0 w-[240px] shrink-0">
                  <div className="text-[14px] font-medium text-white truncate">{agent.label}</div>
                  <div className="text-[11px] text-[var(--color-ink-dim)] font-mono truncate">{agent.name}</div>
                </div>

                {/* progress */}
                <div className="flex-1 min-w-0">
                  <ProgressBar done={done} total={total} color={state.color} />
                  <div className="text-[11px] text-[var(--color-ink-muted)] mt-1 truncate">
                    {st.currentTask
                      ? st.currentTask
                      : st.message
                        ? st.message
                        : total === 0
                          ? 'no findings assigned'
                          : `${done}/${total} fixed`}
                  </div>
                </div>

                {/* right meta */}
                {/* Fixed width only once there is room for it. At 390px a
                    120px column that cannot shrink pushes the row wider than
                    the screen. */}
                <div className="w-full text-left sm:w-[120px] sm:shrink-0 sm:text-right">
                  <div className="text-[12px] tabular-nums" style={{ color: state.color }}>
                    {state.label}
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-dim)]">{timeAgo(st.updatedAt)}</div>
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                  {agent.findingIds.length === 0 ? (
                    <div className="px-4 py-3 text-[13px] text-[var(--color-ink-muted)]">
                      This agent has no assigned findings.
                    </div>
                  ) : (
                    agent.findingIds.map((id) => {
                      const f = findingsById.get(id)
                      if (!f) return null
                      const isDone = st.completed.includes(id)
                      const isCurrent = st.currentFindingId === id && st.state === 'running'
                      return (
                        <div
                          key={id}
                          className="px-4 py-3 flex items-start gap-3"
                          style={isCurrent ? { backgroundColor: 'rgba(56,189,248,0.06)' } : undefined}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#22c55e' }} />
                          ) : (
                            <Circle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-ink-dim)]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono text-[var(--color-ink-dim)]">{f.id}</span>
                              <SevChip sev={f.severity} />
                              {isCurrent ? (
                                <span className="text-[10px] uppercase tracking-wider" style={{ color: '#38bdf8' }}>
                                  working now
                                </span>
                              ) : null}
                            </div>
                            <div className={`text-[13px] mt-1 ${isDone ? 'text-[var(--color-ink-muted)] line-through' : 'text-white'}`}>
                              {f.title}
                            </div>
                            <div className="text-[11px] text-[var(--color-ink-dim)] font-mono mt-0.5 truncate">
                              {f.file}
                              {f.line ? `:${f.line}` : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--color-ink-dim)] mt-5">
        Status is reported by the agents as they work (POST /api/pageflo/agent-plan). The board polls every{' '}
        {POLL_MS / 1000}s. Assignments come from docs/audit-2026-06-04.md.
      </p>
    </div>
  )
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 card-edge">
      <div className="text-[12px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="text-[24px] font-semibold mt-1 tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
      </div>
      {sub ? <div className="text-[11px] text-[var(--color-ink-dim)] mt-0.5">{sub}</div> : null}
    </div>
  )
}

function ProgressBar({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

function SevChip({ sev }: { sev: Severity }) {
  const s = SEVERITY[sev]
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ color: s.color, backgroundColor: `${s.color}1a`, border: `1px solid ${s.color}40` }}
    >
      {s.label}
    </span>
  )
}
