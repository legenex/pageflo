import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ExternalLink } from 'lucide-react'
import { AttachFromPool } from './AttachFromPool'
import { AttachedDomainRow } from './AttachedDomainRow'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function DomainsPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]
  if (!site) notFound()
  const [domains, poolRes] = await Promise.all([
    payload.find({
      collection: 'domains',
      where: { site: { equals: site.id } },
      sort: ['kind', '-primary', 'host'],
      limit: 100,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'domains',
      where: { site: { equals: null } },
      sort: 'host',
      limit: 200,
      overrideAccess: true,
    }),
  ])

  const pool = poolRes.docs.map((d) => ({ id: Number(d.id), host: d.host }))

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Domains</h1>
        <p className="text-ink-muted text-[13px] mt-1.5">
          Pick domains for {site.name} from the pool. All configuration (DNS, verification, primary) is managed in{' '}
          <Link href="/admin/brands/domains" className="text-[var(--color-info)] hover:underline inline-flex items-center gap-1">
            Brands → Domains <ExternalLink className="w-3 h-3" />
          </Link>
          .
        </p>
      </header>

      <div className="mb-6">
        <AttachFromPool pool={pool} siteId={Number(site.id)} siteSlug={slug} />
      </div>

      {domains.docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-12 text-center text-[var(--color-ink-dim)]">
          No domains attached to this brand yet. Pick one from the pool above, or{' '}
          <Link href="/admin/brands/domains" className="text-[var(--color-info)] hover:underline">
            connect a new domain
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-2">
          {domains.docs.map((d) => (
            <AttachedDomainRow
              key={d.id}
              domain={{
                id: Number(d.id),
                host: d.host,
                kind: (d.kind ?? 'custom') as 'preview' | 'custom',
                status: d.status ?? 'pending',
                primary: Boolean(d.primary),
              }}
              siteSlug={slug}
            />
          ))}
        </div>
      )}
    </div>
  )
}
