import { getPayload } from 'payload'
import config from '@payload-config'
import { Globe } from 'lucide-react'
import { buildDnsRecords, type DnsRecord } from '@/lib/dns-records'
import { Card, EmptyState, Mono, Page, PageHeader } from '@/components/pageflo/primitives'
import { AddDomainButton } from './AddDomainModal'
import { BrandDomainRow } from './BrandDomainRow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Domains' }

type SiteLite = { id: number; name: string; slug: string }
type DomainLite = {
  id: number
  host: string
  kind: 'preview' | 'custom'
  status: string
  primary: boolean
  siteId: number | null
  siteSlug: string | null
  verificationToken: string | null
  dnsRecords: DnsRecord[]
  lastCheckedAt: string | null
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join('')
    .toUpperCase()

const brandColorOf = (slug: string): string => {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  const palette = ['#4F86E1', '#FF5C75', '#2DBE6C', '#B57DE1', '#E8B14B', '#5CC1E1']
  return palette[h % palette.length]
}

export default async function DomainsIndexPage() {
  const payload = await getPayload({ config })
  const [sitesRes, domainsRes] = await Promise.all([
    payload.find({ collection: 'sites', limit: 500, overrideAccess: true }),
    payload.find({
      collection: 'domains',
      sort: ['-primary', 'kind', 'host'],
      limit: 1000,
      overrideAccess: true,
    }),
  ])

  const sites: SiteLite[] = sitesRes.docs.map((s) => ({ id: Number(s.id), name: s.name, slug: s.slug }))
  const siteById = new Map<number, SiteLite>(sites.map((s) => [s.id, s]))

  const domains: DomainLite[] = domainsRes.docs.map((d) => {
    const siteId = d.site == null ? null : typeof d.site === 'object' ? Number(d.site.id) : Number(d.site)
    const siteSlug = siteId != null ? (siteById.get(siteId)?.slug ?? null) : null
    return {
      id: Number(d.id),
      host: d.host,
      kind: (d.kind ?? 'custom') as 'preview' | 'custom',
      status: d.status ?? 'pending',
      primary: Boolean(d.primary),
      siteId,
      siteSlug,
      verificationToken: d.verification_token ?? null,
      // Recompute records from the current (apex-aware) logic so existing rows
      // self-heal — never trust possibly-stale stored guidance for display.
      dnsRecords:
        (d.kind ?? 'custom') === 'custom'
          ? buildDnsRecords(d.host)
          : Array.isArray(d.dns_records)
          ? (d.dns_records as DnsRecord[])
          : [],
      lastCheckedAt: d.last_checked_at ?? null,
    }
  })

  const unassigned = domains.filter((d) => d.siteId == null)
  const byBrand = new Map<number, DomainLite[]>()
  for (const d of domains) {
    if (d.siteId == null) continue
    const arr = byBrand.get(d.siteId) ?? []
    arr.push(d)
    byBrand.set(d.siteId, arr)
  }
  const brandGroups = [...byBrand.entries()]
    .map(([siteId, list]) => ({ site: siteById.get(siteId), list }))
    .filter((g): g is { site: SiteLite; list: DomainLite[] } => Boolean(g.site))
    .sort((a, b) => a.site.name.localeCompare(b.site.name))

  return (
    <Page>
      <PageHeader
        title="Domains"
        subtitle="Every hostname pointed at a Site: add one, verify its DNS, set the primary, move it between brands or remove it."
        actions={<AddDomainButton />}
      />

      <div className="space-y-6">
        {unassigned.length > 0 ? (
          <BrandGroup
            heading="Unassigned"
            badge={String(unassigned.length)}
            tint="#5C6376"
            initials="—"
            sub="Expand a row to attach it to a brand"
          >
            {unassigned.map((d) => (
              <BrandDomainRow key={d.id} domain={d} sites={sites} />
            ))}
          </BrandGroup>
        ) : null}

        {brandGroups.map(({ site, list }) => (
          <BrandGroup
            key={site.id}
            heading={site.name}
            badge={String(list.length)}
            tint={brandColorOf(site.slug)}
            initials={initialsOf(site.name)}
            sub={null}
          >
            {list.map((d) => (
              <BrandDomainRow key={d.id} domain={d} sites={sites} />
            ))}
          </BrandGroup>
        ))}

        {domains.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Globe className="h-[18px] w-[18px]" aria-hidden="true" />}
              title="No domains yet"
              message="Add a hostname and point its DNS at PageFlo. Every Site also gets a preview domain automatically, which stays primary until a custom domain has completed a real HTTPS handshake."
              action={<AddDomainButton />}
            />
          </Card>
        ) : null}
      </div>
    </Page>
  )
}

function BrandGroup({
  heading,
  badge,
  initials,
  tint,
  sub,
  children,
}: {
  heading: string
  badge: string
  initials: string
  tint: string
  sub: string | null
  children: React.ReactNode
}) {
  return (
    <section>
      <header className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 items-center justify-center rounded-app-sm text-[10.5px] font-bold text-white"
          style={{ background: tint }}
        >
          {initials}
        </span>
        <h2 className="text-[14px] font-semibold text-ink">{heading}</h2>
        <Mono className="rounded-app-sm border border-border bg-surface-1 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted">
          {badge}
        </Mono>
        {sub ? <span className="text-[11.5px] text-ink-dim">{sub}</span> : null}
      </header>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}
