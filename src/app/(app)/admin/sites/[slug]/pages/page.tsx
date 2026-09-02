import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { Plus, Search } from 'lucide-react'
import { PageRowMenu } from './PageRowMenu'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string }> }

const TEMPLATE_LABEL: Record<string, { label: string; tone: 'brand' | 'legal' }> = {
  home: { label: 'Home', tone: 'brand' },
  custom: { label: 'Custom', tone: 'brand' },
  about: { label: 'About', tone: 'brand' },
  faq: { label: 'FAQ', tone: 'brand' },
  privacy: { label: 'Legal: Privacy', tone: 'legal' },
  'privacy-policy': { label: 'Legal: Privacy Policy', tone: 'legal' },
  terms: { label: 'Legal: Terms', tone: 'legal' },
  partners: { label: 'Legal: Partners', tone: 'legal' },
  submitted: { label: 'Legal: Submitted', tone: 'legal' },
  'thanks-dq': { label: 'Legal: DQ', tone: 'legal' },
  tcpa: { label: 'Legal: TCPA', tone: 'legal' },
  disclosures: { label: 'Legal: Disclosures', tone: 'legal' },
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function SitePagesPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const status = sp.status ?? 'all'
  const q = (sp.q ?? '').trim()

  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]; if (!site) notFound()

  const baseWhere: Where = { site: { equals: site.id } }
  const [all, published, drafts, archived] = await Promise.all([
    payload.count({ collection: 'pages', where: baseWhere, overrideAccess: true }),
    payload.count({ collection: 'pages', where: { and: [baseWhere, { status: { equals: 'published' } }] }, overrideAccess: true }),
    payload.count({ collection: 'pages', where: { and: [baseWhere, { status: { equals: 'draft' } }] }, overrideAccess: true }),
    payload.count({ collection: 'pages', where: { and: [baseWhere, { status: { equals: 'archived' } }] }, overrideAccess: true }),
  ])

  const ands: Where[] = [baseWhere]
  if (status !== 'all') ands.push({ status: { equals: status } })
  if (q) ands.push({ or: [{ title: { like: q } }, { slug: { like: q } }] })
  const pages = await payload.find({
    collection: 'pages',
    where: { and: ands },
    sort: 'slug',
    limit: 200,
    overrideAccess: true,
  })

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Pages</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">{site.name} site pages</p>
        </div>
        <Link
          href={`/admin/sites/${slug}/pages/new`}
          className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> New Page
        </Link>
      </header>

      <StatusTabs
        slug={slug}
        current={status}
        counts={{ all: all.totalDocs, published: published.totalDocs, drafts: drafts.totalDocs, archived: archived.totalDocs }}
        q={q}
      />

      <SearchBox slug={slug} status={status} q={q} />

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1.4fr_1.2fr_0.8fr_0.9fr_60px] px-5 py-3 text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold border-b border-[var(--color-border)]">
          <span>Title</span>
          <span>Slug</span>
          <span>Template</span>
          <span>Status</span>
          <span>Updated</span>
          <span></span>
        </div>
        {pages.docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-[var(--color-ink-dim)]">No pages match your filters.</div>
        ) : (
          <ul>
            {pages.docs.map((p) => {
              const tk = (p.template_key ?? 'custom') as string
              const t = TEMPLATE_LABEL[tk] ?? { label: tk, tone: 'brand' as const }
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1.5fr_1.4fr_1.2fr_0.8fr_0.9fr_60px] px-5 py-3.5 items-center border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <Link href={`/admin/sites/${slug}/pages/${p.id}`} className="text-white font-medium text-[14px] hover:underline truncate">
                    {p.title}
                  </Link>
                  <code className="text-[13px] text-[var(--color-ink-muted)] font-mono">/{p.slug.replace(/^\//, '')}</code>
                  <span>
                    <TemplateChip label={t.label} tone={t.tone} />
                  </span>
                  <span>
                    <StatusPill status={p.status ?? 'draft'} />
                  </span>
                  <span className="text-[13px] text-[var(--color-ink-muted)]">{fmtDate(p.updatedAt ?? null)}</span>
                  <PageRowMenu pageId={p.id} pageSlug={p.slug} pageTitle={p.title} siteSlug={slug} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatusTabs({
  slug,
  current,
  counts,
  q,
}: {
  slug: string
  current: string
  counts: { all: number; published: number; drafts: number; archived: number }
  q: string
}) {
  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'published', label: 'Published', count: counts.published },
    { key: 'draft', label: 'Drafts', count: counts.drafts },
    { key: 'archived', label: 'Archived', count: counts.archived },
  ]
  return (
    <div className="inline-flex p-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] mb-4">
      {tabs.map((tab) => {
        const params = new URLSearchParams()
        if (tab.key !== 'all') params.set('status', tab.key)
        if (q) params.set('q', q)
        const href = `/admin/sites/${slug}/pages${params.toString() ? `?${params}` : ''}`
        const active = current === tab.key
        return (
          <Link
            key={tab.key}
            href={href}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              active ? 'bg-[var(--color-surface-3)] text-white' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {tab.label} ({tab.count})
          </Link>
        )
      })}
    </div>
  )
}

function SearchBox({ slug, status, q }: { slug: string; status: string; q: string }) {
  return (
    <form action={`/admin/sites/${slug}/pages`} method="get" className="mb-5 max-w-[420px] relative">
      {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Search pages..."
        className="w-full bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg pl-10 pr-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]"
      />
    </form>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string; border: string }> = {
    published: { label: 'Published', bg: 'rgba(45,190,108,0.12)', fg: '#7FE3A8', border: 'rgba(45,190,108,0.3)' },
    draft: { label: 'Draft', bg: 'rgba(232,177,75,0.12)', fg: '#F4C97F', border: 'rgba(232,177,75,0.3)' },
    archived: { label: 'Archived', bg: 'rgba(140,148,166,0.12)', fg: '#A8AFC0', border: 'rgba(140,148,166,0.3)' },
  }
  const v = map[status] ?? map.archived
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: v.bg, color: v.fg, border: `1px solid ${v.border}` }}>
      {v.label}
    </span>
  )
}

function TemplateChip({ label, tone }: { label: string; tone: 'brand' | 'legal' }) {
  const color = tone === 'brand' ? 'var(--color-info)' : 'var(--color-brand-strong)'
  const bg = tone === 'brand' ? 'rgba(92,193,225,0.08)' : 'rgba(255,92,117,0.08)'
  const border = tone === 'brand' ? 'rgba(92,193,225,0.25)' : 'rgba(255,92,117,0.25)'
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap" style={{ color, background: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  )
}

