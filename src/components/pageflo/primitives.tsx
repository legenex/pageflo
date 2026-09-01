import type { ReactNode } from 'react'

/**
 * PageFlo shared primitives.
 *
 * Before this file every admin page hand-rolled its own card, table and header
 * from the same repeated Tailwind string. These are the consolidated versions.
 * Everything reads from the semantic tokens in `src/app/globals.css`; no
 * component here contains a colour literal, so a palette change lands in one
 * place and a contrast decision cannot be quietly overridden per page.
 *
 * Server components by default. The interactive primitives that need state live
 * in `interactive.tsx` and carry `'use client'`.
 */

/* ------------------------------------------------------------------ layout */

/** Standard page frame. Every `(top)` admin page renders inside one. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-16 pt-6 sm:px-7 ${className}`}>{children}</div>
}

/**
 * Page header. Title, subtitle, an optional live-state badge and actions.
 *
 * Rendered in-content rather than in a top bar: PageFlo has no application top
 * bar, so the page title is the first thing inside the content area, which is
 * also what keeps the sidebar the only fixed chrome.
 */
export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string
  subtitle?: string
  badge?: { label: string; tone?: Tone }
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
          {badge ? <StatusPill label={badge.label} tone={badge.tone ?? 'neutral'} pulse /> : null}
        </div>
        {subtitle ? <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Section heading inside a page. One level below PageHeader. */
export function SectionHeader({
  title,
  sub,
  actions,
  icon,
}: {
  title: string
  sub?: string
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
      {icon ? <span className="shrink-0 text-ink-muted">{icon}</span> : null}
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {sub ? <span className="text-[11px] text-ink-muted">{sub}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** The standard surface. One card idiom for the whole application. */
export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag
      className={`rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 ${className}`}
    >
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------------------ status */

export type Tone = 'neutral' | 'pos' | 'warn' | 'neg' | 'info' | 'teal' | 'purple' | 'orange' | 'brand'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-ink-muted/12 text-ink-muted',
  pos: 'bg-pos/14 text-pos',
  warn: 'bg-warn/14 text-warn',
  neg: 'bg-neg/14 text-neg',
  info: 'bg-info/15 text-info',
  teal: 'bg-accent-teal/14 text-accent-teal',
  purple: 'bg-accent-purple/16 text-accent-purple',
  orange: 'bg-accent-orange/14 text-accent-orange',
  brand: 'bg-brand/12 text-brand',
}

/**
 * The one status indicator. `pulse` animates the dot for genuinely live state
 * and is suppressed under prefers-reduced-motion by the rule in globals.css.
 */
export function StatusPill({
  label,
  tone = 'neutral',
  pulse = false,
  dot = true,
}: {
  label: string
  tone?: Tone
  pulse?: boolean
  dot?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-app-sm px-[7px] py-[2px] text-[11px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`h-[5px] w-[5px] shrink-0 rounded-full bg-current ${pulse ? 'pf-pulse' : ''}`}
        />
      ) : null}
      {label}
    </span>
  )
}

/** Small uppercase label used above values and in table headers. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted ${className}`}>
      {children}
    </span>
  )
}

/** Monospace value: identifiers, timestamps, domains, counts, paths. */
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>
}

/* ------------------------------------------------------------------ metrics */

/**
 * Metric card. `delta` and `sub` are optional because not every metric has an
 * honest comparison to show, and a card that invents one is worse than a card
 * that shows a single number.
 */
export function MetricCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  sub,
  icon,
  accent = false,
}: {
  label: string
  value: ReactNode
  delta?: string
  deltaTone?: Tone
  sub?: string
  icon?: ReactNode
  accent?: boolean
}) {
  const deltaColor =
    deltaTone === 'pos'
      ? 'text-pos'
      : deltaTone === 'neg'
        ? 'text-neg'
        : deltaTone === 'warn'
          ? 'text-warn'
          : 'text-ink-muted'
  return (
    <div className="relative overflow-hidden rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 px-3.5 pb-3 pt-3">
      {accent ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-brand/60" /> : null}
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        {icon ? <span className="shrink-0 text-ink-dim">{icon}</span> : null}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-[26px] font-bold tracking-[-0.02em] tabular-nums text-ink">{value}</span>
        {delta ? <span className={`text-[11px] font-semibold ${deltaColor}`}>{delta}</span> : null}
      </div>
      {sub ? <div className="mt-2 border-t border-border pt-2 text-[10.5px] text-ink-muted">{sub}</div> : null}
    </div>
  )
}

/** Responsive metric grid. */
export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-2.5">{children}</div>
}

/* ------------------------------------------------------------------- states */

/**
 * Empty state. `action` is a real control, never a decorative button: an empty
 * state whose only affordance does nothing is worse than a sentence.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title?: string
  message: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-app border border-border bg-surface-1 text-ink-dim">
          {icon}
        </span>
      ) : null}
      {title ? <p className="text-[15px] font-semibold text-ink">{title}</p> : null}
      <p className="mt-1.5 max-w-[420px] text-[13px] leading-[1.6] text-ink-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Error state. Distinguished from empty: something failed, and it says what. */
export function ErrorState({ title = 'Something went wrong', message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-app border border-neg/30 bg-neg/10 text-neg">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <path d="M12 4l9 16H3zM12 10v5M12 17.5v.5" />
        </svg>
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-[440px] text-[13px] leading-[1.6] text-ink-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * Permission-denied state. Separate from ErrorState on purpose: nothing failed,
 * the answer is simply no, and telling a user "an error occurred" when they are
 * not authorized sends them to support instead of to their administrator.
 */
export function DeniedState({ message, what = 'this area' }: { message?: string; what?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-app border border-warn/30 bg-warn/10 text-warn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
          <path d="M12 10v3M12 16v.5" />
        </svg>
      </span>
      <p className="text-[15px] font-semibold text-ink">You do not have access to {what}</p>
      <p className="mt-1.5 max-w-[440px] text-[13px] leading-[1.6] text-ink-muted">
        {message ?? 'Ask a workspace administrator to grant your account the role this area requires.'}
      </p>
    </div>
  )
}

/** Skeleton block. Uses the shared `.skeleton` sweep from globals.css. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

/**
 * "Coming soon" surface for a designed but unbuilt product area.
 *
 * `waitingFor` is required. A coming-soon page that does not say what it is
 * waiting for is indistinguishable from a page someone forgot to build.
 */
export function ComingSoon({
  title,
  body,
  waitingFor,
  icon,
  preview,
}: {
  title: string
  body: string
  waitingFor: string
  icon?: ReactNode
  preview?: ReactNode
}) {
  return (
    <div className="flex justify-center px-5 py-14">
      <div className="w-full max-w-[620px] text-center">
        {icon ? (
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-app border border-border bg-surface-1 text-brand">
            {icon}
          </span>
        ) : null}
        <span className="mt-4 inline-flex items-center rounded-app-sm border border-border bg-surface-1 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Coming soon
        </span>
        <h2 className="mt-3 text-[19px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
        <p className="mx-auto mt-2.5 max-w-[480px] text-[13px] leading-[1.65] text-ink-muted">{body}</p>
        {preview ? <div className="mt-6">{preview}</div> : null}
        <p className="mx-auto mt-6 max-w-[480px] border-t border-border pt-4 text-[11.5px] leading-[1.6] text-ink-dim">
          <span className="font-semibold text-ink-muted">Waiting on:</span> {waitingFor}
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- table */

/** Dense table shell. Owns the horizontal scroll so a page never scrolls sideways. */
export function TableWrap({ children, minWidth = 880 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  className = '',
  width,
}: {
  children?: ReactNode
  className?: string
  width?: number | string
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={`whitespace-nowrap border-b border-border bg-surface-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-muted ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle text-[13px] text-ink-secondary ${className}`}>{children}</td>
}

export function Tr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`border-b border-border/70 last:border-b-0 ${className}`}>{children}</tr>
}

/* --------------------------------------------------------------- telemetry */

/**
 * Footer strip of live operational numbers. Every entry must come from a real
 * measurement; there is no placeholder variant on purpose.
 */
export function TelemetryStrip({
  label,
  items,
  note,
}: {
  label: string
  items: Array<{ label: string; value: string; tone?: Tone }>
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 px-3.5 py-2.5">
      <Eyebrow>{label}</Eyebrow>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-baseline gap-1.5">
          <Eyebrow>{i.label}</Eyebrow>
          <Mono
            className={`text-[11.5px] font-semibold ${
              i.tone === 'pos'
                ? 'text-pos'
                : i.tone === 'warn'
                  ? 'text-warn'
                  : i.tone === 'neg'
                    ? 'text-neg'
                    : 'text-ink'
            }`}
          >
            {i.value}
          </Mono>
        </span>
      ))}
      {note ? (
        <>
          <span className="flex-1" />
          <Mono className="text-[11px] text-ink-dim">{note}</Mono>
        </>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- code */

/** Payload / JSON viewer. Scrolls inside itself; never widens the page. */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div>
      {label ? <Eyebrow className="mb-1.5 block">{label}</Eyebrow> : null}
      <pre className="max-h-[360px] overflow-auto rounded-app border border-border bg-surface-deep p-3 font-mono text-[11.5px] leading-[1.6] text-ink-secondary">
        {children}
      </pre>
    </div>
  )
}
