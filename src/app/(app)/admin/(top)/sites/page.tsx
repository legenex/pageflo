import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { CheckCircle2, ExternalLink, Globe } from 'lucide-react'
import {
  Card,
  EmptyState,
  Eyebrow,
  Mono,
  Page,
  PageHeader,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
  type Tone,
} from '@/components/pageflo/primitives'
import { verticalLabel } from '@/lib/verticals'
import { SitesFilters } from './SitesFilters'
import { NewSiteButton } from './CreateSiteWizard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sites' }

type SearchParams = Promise<{ status?: string; vertical?: string; q?: string }>

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SITE_STATUS_TONE: Record<string, Tone> = {
  active: 'pos',
  draft: 'info',
  paused: 'warn',
  archived: 'neutral',
}

const SITE_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  paused: 'Paused',
  archived: 'Archived',
}

export default async function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = params.status ?? 'all'
  const vertical = params.vertical ?? ''
  const q = (params.q ?? '').trim()

  const payload = await getPayload({ config })

  const [allCount, activeCount, draftCount, pausedCount, archivedCount] = await Promise.all([
    payload.count({ collection: 'sites', overrideAccess: true }),
    payload.count({ collection: 'sites', where: { status: { equals: 'active' } }, overrideAccess: true }),
    payload.count({ collection: 'sites', where: { status: { equals: 'draft' } }, overrideAccess: true }),
    payload.count({ collection: 'sites', where: { status: { equals: 'paused' } }, overrideAccess: true }),
    payload.count({ collection: 'sites', where: { status: { equals: 'archived' } }, overrideAccess: true }),
  ])

  const ands: Where[] = []
  if (status !== 'all') ands.push({ status: { equals: status } })
  if (vertical) ands.push({ vertical: { equals: vertical } })
  if (q) ands.push({ or: [{ name: { like: q } }, { slug: { like: q } }] })
  const where: Where = ands.length > 0 ? { and: ands } : {}

  const sites = await payload.find({
    collection: 'sites',
    where,
    sort: '-updatedAt',
    limit: 100,
    overrideAccess: true,
  })

  const siteIds = sites.docs.map((s) => s.id)
  const domains = siteIds.length
    ? await payload.find({
        collection: 'domains',
        where: { and: [{ site: { in: siteIds } }, { primary: { equals: true } }] },
        limit: 200,
        overrideAccess: true,
      })
    : { docs: [] as Array<{ site: number | string | { id: number | string }; host: string; status: string }> }

  const primaryByEntry = new Map<string | number, { host: string; status: string }>()
  for (const d of domains.docs) {
    if (d.site == null) continue
    const sid = typeof d.site === 'object' ? d.site.id : d.site
    primaryByEntry.set(sid, { host: d.host, status: d.status ?? 'pending' })
  }

  const filtered = status !== 'all' || Boolean(vertical) || Boolean(q)

  return (
    <Page>
      <PageHeader
        title="Sites"
        subtitle="Every brand you operate. A Site is the tenant root: pages, quizzes, domains, numbers and leads all belong to one."
        actions={<NewSiteButton sources={sites.docs.map((s) => ({ id: Number(s.id), name: s.name, slug: s.slug }))} />}
      />

      <StatusTabs
        current={status}
        counts={{
          all: allCount.totalDocs,
          active: activeCount.totalDocs,
          draft: draftCount.totalDocs,
          paused: pausedCount.totalDocs,
          archived: archivedCount.totalDocs,
        }}
        q={q}
        vertical={vertical}
      />

      <SitesFilters status={status} vertical={vertical} q={q} />

      <Card className="mt-2.5 overflow-hidden">
        {sites.docs.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-[18px] w-[18px]" aria-hidden="true" />}
            title={filtered ? 'No Sites match these filters' : 'No Sites yet'}
            message={
              filtered
                ? 'Clear the search, status or vertical filter to see the full list.'
                : 'A Site is the root of everything: its pages, quizzes, landing pages, domains, phone numbers and leads. Create the first one to begin.'
            }
            action={
              filtered ? (
                <Link
                  href="/admin/sites"
                  className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface-3"
                >
                  Clear filters
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            {/*
              * TWO PRESENTATIONS, ONE DATA SET.
              *
              * Seven columns need about 940px. That is fine on a desktop and
              * wrong on a phone: a table that wide inside a scroller is a row
              * the reader has to drag sideways to finish reading, and it moved
              * the whole window sideways in testing rather than staying inside
              * its container. Below `lg` the same rows render as cards, which
              * is the shape the information actually wants at that width.
              */}
            <ul className="divide-y divide-border/70 lg:hidden">
              {sites.docs.map((site) => {
                const primary = primaryByEntry.get(site.id)
                return (
                  <li key={site.id} className="px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-app-sm text-[10.5px] font-bold text-white"
                        style={{ backgroundColor: site.brand?.primary ?? 'var(--color-surface-3)' }}
                      >
                        {initials(site.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/sites/${site.slug}`}
                          className="block truncate text-[13.5px] font-semibold text-ink"
                        >
                          {site.name}
                        </Link>
                        <Mono className="block truncate text-[11px] text-ink-dim">{site.slug}</Mono>
                      </div>
                      <StatusPill
                        label={SITE_STATUS_LABEL[site.status] ?? site.status}
                        tone={SITE_STATUS_TONE[site.status] ?? 'neutral'}
                        dot={false}
                      />
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <dt>
                          <Eyebrow>Primary domain</Eyebrow>
                        </dt>
                        <dd className="mt-0.5 truncate text-[12px]">
                          {primary ? (
                            <a
                              href={`https://${primary.host}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-info hover:underline"
                            >
                              <Mono className="text-[11.5px]">{primary.host}</Mono>
                            </a>
                          ) : (
                            <Link
                              href={`/admin/sites/${site.slug}/settings/domains`}
                              className="text-info hover:underline"
                            >
                              Add domain
                            </Link>
                          )}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>
                          <Eyebrow>Vertical</Eyebrow>
                        </dt>
                        <dd className="mt-0.5 truncate text-[12px] text-ink-secondary">
                          {verticalLabel(site.vertical)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>
                          <Eyebrow>Delivery</Eyebrow>
                        </dt>
                        <dd className="mt-0.5 text-[12px]">
                          {primary?.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-pos">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Serving
                            </span>
                          ) : (
                            <StatusPill
                              label={primary ? 'Awaiting SSL' : 'No domain'}
                              tone={primary ? 'warn' : 'neutral'}
                              dot={false}
                            />
                          )}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>
                          <Eyebrow>Updated</Eyebrow>
                        </dt>
                        <dd className="mt-0.5 text-[12px] text-ink-muted">
                          <Mono className="text-[11.5px]">{fmtDate(site.updatedAt ?? null)}</Mono>
                        </dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>

            <div className="hidden lg:block">
              <TableWrap minWidth={880}>
                <thead>
                  <tr>
                    <Th>Site</Th>
                    <Th>Primary domain</Th>
                    <Th>Vertical</Th>
                    <Th>Delivery</Th>
                    <Th>Status</Th>
                    <Th>Updated</Th>
                    <Th width={52}>
                      <span className="sr-only">Preview</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {sites.docs.map((site) => {
                    const primary = primaryByEntry.get(site.id)
                    const previewUrl = `/?site=${encodeURIComponent(site.slug)}`
                    return (
                      <Tr key={site.id} className="hover:bg-surface-2/60">
                        <Td>
                          <Link href={`/admin/sites/${site.slug}`} className="flex min-w-0 items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-app-sm text-[10.5px] font-bold text-white"
                              style={{ backgroundColor: site.brand?.primary ?? 'var(--color-surface-3)' }}
                            >
                              {initials(site.name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold text-ink">{site.name}</span>
                              <Mono className="block truncate text-[11px] text-ink-dim">{site.slug}</Mono>
                            </span>
                          </Link>
                        </Td>
                        <Td>
                          {primary ? (
                            <a
                              href={`https://${primary.host}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-info hover:underline"
                            >
                              <Mono className="text-[12px]">{primary.host}</Mono>
                            </a>
                          ) : (
                            <span className="text-[12px] text-ink-dim">
                              Not connected{' '}
                              <Link
                                href={`/admin/sites/${site.slug}/settings/domains`}
                                className="text-info hover:underline"
                              >
                                Add domain
                              </Link>
                            </span>
                          )}
                        </Td>
                        <Td>{verticalLabel(site.vertical)}</Td>
                        <Td>
                          {primary?.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-pos">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Serving
                            </span>
                          ) : (
                            <StatusPill
                              label={primary ? 'Awaiting SSL' : 'No domain'}
                              tone={primary ? 'warn' : 'neutral'}
                              dot={false}
                            />
                          )}
                        </Td>
                        <Td>
                          <StatusPill
                            label={SITE_STATUS_LABEL[site.status] ?? site.status}
                            tone={SITE_STATUS_TONE[site.status] ?? 'neutral'}
                            dot={false}
                          />
                        </Td>
                        <Td className="text-ink-muted">
                          <Mono className="text-[12px]">{fmtDate(site.updatedAt ?? null)}</Mono>
                        </Td>
                        <Td>
                          <Link
                            href={previewUrl}
                            target="_blank"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-app-sm text-ink-dim transition-colors hover:bg-surface-3 hover:text-ink"
                            aria-label={`Preview ${site.name}`}
                          >
                            <ExternalLink className="h-[15px] w-[15px]" aria-hidden="true" />
                          </Link>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      {sites.docs.length >= 100 ? (
        <p className="mt-2.5 text-[11.5px] text-ink-dim">
          Showing the 100 most recently updated Sites. Narrow the search to reach the rest.
        </p>
      ) : null}
    </Page>
  )
}

function StatusTabs({
  current,
  counts,
  q,
  vertical,
}: {
  current: string
  counts: { all: number; active: number; draft: number; paused: number; archived: number }
  q: string
  vertical: string
}) {
  const tabs: Array<{ key: string; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'draft', label: 'Draft', count: counts.draft },
    { key: 'paused', label: 'Paused', count: counts.paused },
    { key: 'archived', label: 'Archived', count: counts.archived },
  ]
  return (
    <div
      role="tablist"
      aria-label="Filter Sites by status"
      className="inline-flex flex-wrap gap-1 rounded-app border border-border bg-surface-1 p-1"
    >
      {tabs.map((tab) => {
        const params = new URLSearchParams()
        if (tab.key !== 'all') params.set('status', tab.key)
        if (q) params.set('q', q)
        if (vertical) params.set('vertical', vertical)
        const href = `/admin/sites${params.toString() ? `?${params}` : ''}`
        const active = current === tab.key
        return (
          <Link
            key={tab.key}
            href={href}
            role="tab"
            aria-selected={active}
            className={`inline-flex items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              active ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
            <Mono className={`text-[11px] ${active ? 'text-ink-secondary' : 'text-ink-dim'}`}>{tab.count}</Mono>
          </Link>
        )
      })}
    </div>
  )
}
