import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Plus, Phone } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function SiteNumbersPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]; if (!site) notFound()
  const numbers = await payload.find({
    collection: 'numbers',
    where: { site: { equals: site.id } },
    sort: '-updatedAt',
    limit: 100,
    overrideAccess: true,
  })

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Call Tracking Numbers</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">Manage call-tracking number pools and path routing</p>
        </div>
        <Link
          href={`/cms/collections/numbers/create?site=${site.id}`}
          className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> New Number
        </Link>
      </header>

      {numbers.docs.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge px-5 py-24 text-center">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--color-info)]/10 text-[var(--color-info)] mb-4">
            <Phone className="w-6 h-6" />
          </span>
          <h2 className="text-[18px] font-semibold text-white">No numbers yet</h2>
          <p className="text-[14px] text-[var(--color-ink-muted)] mt-2">Add call-tracking numbers to route calls by page path.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
          <ul className="divide-y divide-[var(--color-border)]">
            {numbers.docs.map((n) => (
              <li key={n.id} className="px-5 py-4 grid grid-cols-[1fr_1fr_2fr_80px] items-center gap-3">
                <span className="text-white font-medium text-[14px]">{n.display}</span>
                <span className="text-[13px] text-[var(--color-ink-muted)]">{n.tel}</span>
                <span className="text-[13px] text-[var(--color-ink-muted)] truncate">
                  {(n.page_paths ?? []).map((p: { path: string }) => p.path).join(', ') || (n.fallback ? 'Fallback' : '—')}
                </span>
                <Link href={`/cms/collections/numbers/${n.id}`} className="text-[var(--color-info)] text-[13px] hover:underline">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
