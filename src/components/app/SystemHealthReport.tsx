import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  GitCommit,
  Globe,
  Info,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { runSystemReport, type Category, type CheckStatus, type SystemCheck } from '@/lib/system-health'
import { Card, Eyebrow, Mono, Page, PageHeader, SectionHeader, type Tone } from '@/components/pageflo/primitives'

/**
 * The system health report.
 *
 * Two routes render this: `/admin/system` under Tools and
 * `/admin/settings/system` under Settings. Both existed as byte-identical
 * 173-line copies of each other, differing only in which path their refresh
 * action revalidated, which is two places for every future change to the health
 * UI to be made in and one place for it to be forgotten.
 *
 * The refresh action stays with the route, because `revalidatePath` needs the
 * caller's own path; everything else lives here.
 */

const CATEGORY_LABEL: Record<Category, string> = {
  deploy: 'Deploy',
  runtime: 'Runtime',
  database: 'Data',
  integrations: 'Integrations',
  dns: 'DNS & SSL',
}

const CATEGORY_ICON: Record<Category, typeof Activity> = {
  deploy: GitCommit,
  runtime: Activity,
  database: Database,
  integrations: Sparkles,
  dns: Globe,
}

const ORDER: Category[] = ['deploy', 'runtime', 'database', 'integrations', 'dns']

const STATUS_TONE: Record<CheckStatus, Tone> = {
  ok: 'pos',
  warn: 'warn',
  error: 'neg',
  info: 'info',
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: 'text-pos',
  warn: 'text-warn',
  error: 'text-neg',
  info: 'text-info',
}

const STATUS_CHIP: Record<CheckStatus, string> = {
  ok: 'bg-pos/14 text-pos',
  warn: 'bg-warn/14 text-warn',
  error: 'bg-neg/14 text-neg',
  info: 'bg-info/15 text-info',
}

const STATUS_ICON: Record<CheckStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertCircle,
  error: XCircle,
  info: Info,
}

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })

export async function SystemHealthReport({
  title = 'System health',
  refreshAction,
}: {
  title?: string
  /** Server action that invalidates the cache and revalidates the caller's path. */
  refreshAction: () => Promise<void>
}) {
  const report = await runSystemReport()
  const groups = ORDER.map((cat) => ({
    category: cat,
    checks: report.checks.filter((c) => c.category === cat),
  })).filter((g) => g.checks.length > 0)

  // The worst status present decides the header badge. A report with one error
  // in it is not "healthy" because the other eleven checks passed.
  const worst: CheckStatus =
    report.counts.error > 0 ? 'error' : report.counts.warn > 0 ? 'warn' : 'ok'
  const worstLabel =
    worst === 'error'
      ? `${report.counts.error} failing`
      : worst === 'warn'
        ? `${report.counts.warn} to check`
        : 'All checks passing'

  return (
    <Page>
      <PageHeader
        title={title}
        subtitle="Live checks against the real dependencies. Each one reports what it observed; a check that has not run is shown as not run rather than folded into a pass."
        badge={{ label: worstLabel, tone: STATUS_TONE[worst] }}
        actions={
          <form action={refreshAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-app border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface-3"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {(
          [
            { label: 'Passing', value: report.counts.ok, status: 'ok' },
            { label: 'Warning', value: report.counts.warn, status: 'warn' },
            { label: 'Failing', value: report.counts.error, status: 'error' },
            { label: 'Informational', value: report.counts.info, status: 'info' },
          ] as Array<{ label: string; value: number; status: CheckStatus }>
        ).map((c) => (
          <div
            key={c.label}
            className="rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 px-3.5 py-3"
          >
            <Eyebrow className={STATUS_TEXT[c.status]}>{c.label}</Eyebrow>
            <p className="mt-2 text-[26px] font-bold leading-none tabular-nums text-ink">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-2.5 space-y-2.5">
        {groups.map((g) => {
          const Icon = CATEGORY_ICON[g.category]
          return (
            <Card key={g.category} className="overflow-hidden">
              <SectionHeader
                title={CATEGORY_LABEL[g.category]}
                sub={`${g.checks.length} ${g.checks.length === 1 ? 'check' : 'checks'}`}
                icon={<Icon className="h-[15px] w-[15px]" aria-hidden="true" />}
              />
              <ul className="divide-y divide-border/70">
                {g.checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </ul>
            </Card>
          )
        })}
      </div>

      <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-dim">
        <Mono>
          Generated {fmtTime(report.generated_at)} · {report.duration_ms}ms
        </Mono>
        <span>Cached for 30 seconds. Refresh bypasses the cache.</span>
      </footer>
    </Page>
  )
}

function CheckRow({ check }: { check: SystemCheck }) {
  const Icon = STATUS_ICON[check.status]
  const detailEntries = check.detail
    ? Object.entries(check.detail).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : []
  return (
    <li className="px-3.5 py-2.5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-app-sm ${STATUS_CHIP[check.status]}`}
          >
            <Icon className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{check.label}</span>
            <span className="block truncate text-[11.5px] text-ink-muted">{check.message}</span>
          </span>
          {typeof check.duration_ms === 'number' ? (
            <Mono className="shrink-0 text-[10.5px] text-ink-dim">{check.duration_ms}ms</Mono>
          ) : null}
          {detailEntries.length > 0 ? (
            <span className="shrink-0 text-[10.5px] text-ink-dim group-open:hidden">Detail</span>
          ) : null}
        </summary>
        {detailEntries.length > 0 ? (
          <div className="ml-7 mt-2.5 rounded-app border border-border bg-surface-deep p-2.5">
            <dl className="grid grid-cols-[minmax(90px,150px)_1fr] gap-x-3 gap-y-1 text-[11.5px]">
              {detailEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate font-mono text-ink-muted">{k}</dt>
                  <dd className="break-all font-mono text-ink-secondary">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </details>
    </li>
  )
}
