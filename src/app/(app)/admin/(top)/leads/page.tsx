import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Bolt, Check, Clock, Inbox, ShieldAlert, ShieldX } from 'lucide-react'
import {
  Card,
  Eyebrow,
  Mono,
  Page,
  PageHeader,
  TelemetryStrip,
} from '@/components/pageflo/primitives'
import { getCurrentUser } from '@/lib/auth'
import { LeadsTable, ExportButton } from './LeadsTable'
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from './model'
import { RANGE_LABEL, buildWhere, parseSearch, toQuery, type LeadsSearch } from './query'
import type { LeadRow } from './types'

export const dynamic = 'force-dynamic'

const PER_PAGE = 50

const VIEW_ICON: Record<string, typeof Inbox> = {
  all: Inbox,
  new: Clock,
  contacted: Inbox,
  qualified: Check,
  sold: Bolt,
  'soft-dq': ShieldAlert,
  'hard-dq': ShieldX,
  archived: Inbox,
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function LeadsPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/leads')

  const raw = await searchParams
  const search = parseSearch(raw)
  const where = buildWhere(search)
  const payload = await getPayload({ config })

  /*
   * Tenancy is Payload's job here, not this page's.
   *
   * Every read below passes the real `user` with `overrideAccess: false`, so
   * `siteScopedRead` on the Leads collection decides which rows exist for this
   * request. The rest of the admin reads with `overrideAccess: true` and relies
   * on a layout auth gate, which is fine for a Site-scoped route but wrong for a
   * cross-Site list: an editor bound to one brand would otherwise see every
   * brand's leads. See AGENTS.md invariant 1.
   */
  const scoped = { user, overrideAccess: false } as const

  const [result, sites, ...statusCounts] = await Promise.all([
    payload.find({
      collection: 'leads',
      where,
      sort: '-createdAt',
      limit: PER_PAGE,
      page: search.page,
      depth: 1,
      ...scoped,
    }),
    payload.find({ collection: 'sites', limit: 200, depth: 0, sort: 'name', ...scoped }),
    ...LEAD_STATUSES.map((s) =>
      payload.count({
        collection: 'leads',
        where: buildWhere({ ...search, status: s, page: 1 }),
        ...scoped,
      }),
    ),
  ])

  const totalAll = await payload.count({ collection: 'leads', where: buildWhere({ ...search, status: 'all', page: 1 }), ...scoped })

  const countByStatus = Object.fromEntries(
    LEAD_STATUSES.map((s, i) => [s, statusCounts[i]?.totalDocs ?? 0]),
  ) as Record<LeadStatus, number>

  const leads: LeadRow[] = result.docs.map((d) => {
    const lead = d as Record<string, any>
    const site = lead.site && typeof lead.site === 'object' ? lead.site : null
    return {
      id: String(lead.id),
      createdAt: String(lead.createdAt ?? ''),
      updatedAt: String(lead.updatedAt ?? ''),
      status: (lead.status ?? 'new') as LeadStatus,
      source_entity_type: String(lead.source_entity_type ?? ''),
      source_entity_id: lead.source_entity_id ?? null,
      test_capture: Boolean(lead.test_capture),
      siteName: site?.name ?? null,
      siteSlug: site?.slug ?? null,
      brandColor: site?.brand?.primary ?? null,
      contact: lead.contact ?? null,
      quiz_answers: lead.quiz_answers ?? null,
      attribution: lead.attribution ?? null,
      hlr_result: lead.hlr_result ?? null,
      trustedform_cert_url: lead.trustedform_cert_url ?? null,
      jornaya_lead_id: lead.jornaya_lead_id ?? null,
      client_submission_id: lead.client_submission_id ?? null,
      buyer_id: lead.buyer_id ?? null,
      sold_at: lead.sold_at ?? null,
      status_history: lead.status_history ?? null,
      delivery_log: lead.delivery_log ?? null,
    }
  })

  const flatSearch = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? (v[0] ?? '') : (v ?? '')]),
  ) as Record<string, string>

  const views: Array<{ key: string; label: string; count: number; href: string; active: boolean }> = [
    {
      key: 'all',
      label: 'All Leads',
      count: totalAll.totalDocs,
      href: `/admin/leads${toQuery({ ...search, status: 'all', page: 1 })}`,
      active: search.status === 'all',
    },
    ...LEAD_STATUSES.filter((s) => s !== 'archived' || countByStatus.archived > 0).map((s) => ({
      key: s,
      label: STATUS_LABEL[s],
      count: countByStatus[s],
      href: `/admin/leads${toQuery({ ...search, status: s, page: 1 })}`,
      active: search.status === s,
    })),
  ]

  const totalPages = Math.max(1, Math.ceil(result.totalDocs / PER_PAGE))
  const from = result.totalDocs === 0 ? 0 : (search.page - 1) * PER_PAGE + 1
  const to = Math.min(search.page * PER_PAGE, result.totalDocs)

  const failedCount = countByStatus ? undefined : undefined
  const deliveryFailures = await payload.count({
    collection: 'leads',
    where: buildWhere({ ...search, status: 'all', delivery: 'failed', page: 1 }),
    ...scoped,
  })
  const newest = result.docs[0] as Record<string, any> | undefined

  return (
    <Page>
      <PageHeader
        title="Leads"
        subtitle="Every captured lead with its answers, acquisition path, consent evidence and delivery trace."
        actions={
          <>
            <Mono className="mr-1 text-[12px] text-ink-muted">{result.totalDocs.toLocaleString()} leads</Mono>
            <ExportButton search={flatSearch} />
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sub-navigation. Counts are live and respect the active filters, which
            is why this rail exists instead of a second copy in the sidebar. */}
        <nav aria-label="Lead views" className="shrink-0 lg:w-[196px] lg:border-r lg:border-border lg:pr-2.5">
          <Eyebrow className="mb-2 block px-2">Views</Eyebrow>
          <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
            {views.map((v) => {
              const Icon = VIEW_ICON[v.key] ?? Inbox
              return (
                <li key={v.key} className="min-w-0">
                  <Link
                    href={v.href}
                    aria-current={v.active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-app px-2.5 py-1.5 text-[13px] transition-colors ${
                      v.active
                        ? 'border-l-2 border-brand bg-brand/10 font-semibold text-brand'
                        : 'border-l-2 border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{v.label}</span>
                    <Mono
                      className={`rounded-full px-1.5 text-[10px] font-semibold ${
                        v.count > 0 ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-ink-dim'
                      }`}
                    >
                      {v.count}
                    </Mono>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <LeadFilters search={search} sites={sites.docs as Array<Record<string, any>>} />

          <Card className="overflow-hidden">
            <LeadsTable leads={leads} search={flatSearch} />

            <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-2.5">
              <span className="text-[11.5px] text-ink-muted">
                Showing {from.toLocaleString()} to {to.toLocaleString()} of {result.totalDocs.toLocaleString()}
              </span>
              <span className="flex-1" />
              <span className="text-[11.5px] text-ink-muted">
                Page {search.page} of {totalPages}
              </span>
              <PageLink
                href={`/admin/leads${toQuery({ ...search, page: search.page - 1 })}`}
                disabled={search.page <= 1}
                label="Previous"
              />
              <PageLink
                href={`/admin/leads${toQuery({ ...search, page: search.page + 1 })}`}
                disabled={search.page >= totalPages}
                label="Next"
              />
            </div>
          </Card>

          <TelemetryStrip
            label="Leads telemetry"
            items={[
              { label: 'In view', value: result.totalDocs.toLocaleString() },
              { label: 'Delivery failures', value: String(deliveryFailures.totalDocs), tone: deliveryFailures.totalDocs > 0 ? 'neg' : 'pos' },
              { label: 'Newest', value: newest?.createdAt ? new Date(newest.createdAt).toISOString().slice(0, 16).replace('T', ' ') : 'none' },
              { label: 'Sites in scope', value: String(sites.totalDocs) },
            ]}
            note={search.includeTest ? 'including test captures' : 'test captures excluded'}
          />
        </div>
      </div>
    </Page>
  )
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-7 cursor-not-allowed items-center rounded-app-sm border border-border bg-surface-1 px-2.5 text-[11.5px] text-ink-dim"
      >
        {label}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex h-7 items-center rounded-app-sm border border-border bg-surface-1 px-2.5 text-[11.5px] text-ink-secondary transition-colors hover:border-brand hover:text-ink"
    >
      {label}
    </Link>
  )
}

/**
 * Filters, as a plain GET form.
 *
 * No client JavaScript: every control is a native input inside a form that
 * navigates. That keeps the filter state in the URL, which makes a filtered view
 * linkable and shareable, and makes the CSV export provably the same query.
 */
function LeadFilters({ search, sites }: { search: LeadsSearch; sites: Array<Record<string, any>> }) {
  const selectClass =
    'h-8 rounded-app-sm border border-border bg-surface-deep px-2 text-[12.5px] text-ink outline-none focus-visible:border-brand'
  return (
    <form method="get" action="/admin/leads" className="flex flex-wrap items-center gap-2 rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-3">
      <label className="sr-only" htmlFor="lead-q">
        Search leads
      </label>
      <input
        id="lead-q"
        name="q"
        defaultValue={search.q}
        placeholder="Search name, email, phone, state, ZIP"
        className="h-8 w-[240px] max-w-full rounded-app-sm border border-border bg-surface-deep px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-dim focus-visible:border-brand"
      />

      <label className="sr-only" htmlFor="lead-site">
        Site
      </label>
      <select id="lead-site" name="site" defaultValue={search.site} className={selectClass}>
        <option value="">All sites</option>
        {sites.map((s) => (
          <option key={String(s.id)} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="lead-source">
        Source
      </label>
      <select id="lead-source" name="source" defaultValue={search.source} className={selectClass}>
        <option value="">All sources</option>
        <option value="quiz">Quiz</option>
        <option value="landing-page">Landing Page</option>
        <option value="advertorial">Advertorial</option>
        <option value="page">Page</option>
        <option value="contact-form">Contact Form</option>
      </select>

      <label className="sr-only" htmlFor="lead-delivery">
        Delivery
      </label>
      <select id="lead-delivery" name="delivery" defaultValue={search.delivery} className={selectClass}>
        <option value="all">Any delivery</option>
        <option value="delivered">Delivered</option>
        <option value="failed">Has a failure</option>
        <option value="not-sent">Never dispatched</option>
      </select>

      <label className="sr-only" htmlFor="lead-range">
        Date range
      </label>
      <select id="lead-range" name="range" defaultValue={search.range} className={selectClass}>
        {(Object.keys(RANGE_LABEL) as Array<LeadsSearch['range']>).map((r) => (
          <option key={r} value={r}>
            {RANGE_LABEL[r]}
          </option>
        ))}
      </select>

      <label className="inline-flex h-8 items-center gap-2 rounded-app-sm border border-border bg-surface-deep px-2.5 text-[12.5px] text-ink-muted">
        <input type="checkbox" name="test" value="1" defaultChecked={search.includeTest} className="accent-[var(--color-brand)]" />
        Include test captures
      </label>

      {search.status !== 'all' ? <input type="hidden" name="status" value={search.status} /> : null}

      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-app-sm bg-brand px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        Apply
      </button>
      <Link
        href="/admin/leads"
        className="inline-flex h-8 items-center rounded-app-sm border border-border px-3 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
      >
        Reset
      </Link>
    </form>
  )
}
