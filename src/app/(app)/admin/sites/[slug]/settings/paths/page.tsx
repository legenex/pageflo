import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const buildRobots = (primaryHost: string | null): string =>
  `User-agent: *\nAllow: /\nSitemap: https://${primaryHost ?? '<your-domain>'}/sitemap.xml\n`

export default async function PathsPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]; if (!site) notFound()

  const [pages, primaryDomain] = await Promise.all([
    payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: site.id } }, { status: { equals: 'published' } }] },
      sort: 'slug',
      limit: 500,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'domains',
      where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    }),
  ])
  const primaryHost = primaryDomain.docs[0]?.host ?? null

  // Collect slug_redirects across all pages of this Site.
  const allRedirects: Array<{ from: string; to: string }> = []
  for (const p of pages.docs) {
    const fromList = (p.slug_redirects ?? []) as Array<{ from: string }>
    for (const r of fromList) {
      if (r.from) allRedirects.push({ from: r.from, to: p.slug })
    }
  }

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Paths</h1>
        <p className="text-ink-muted text-[13px] mt-1.5">Redirects, sitemap exclusions, and robots.txt</p>
      </header>

      <Card title="Slug Redirects">
        <p className="text-[13px] text-[var(--color-ink-muted)] mb-3">
          Auto-populated when page slugs change. Manage these per page in the Page Editor.
        </p>
        {allRedirects.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ink-dim)]">
            No redirects yet. They appear here automatically when a published page&apos;s slug changes.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {allRedirects.map((r, i) => (
              <li key={i} className="font-mono text-[13px] text-[var(--color-ink)]">
                <span className="text-[var(--color-ink-muted)]">{r.from}</span>{' '}
                <span className="text-[var(--color-ink-dim)]">→</span>{' '}
                <span className="text-[var(--color-info)]">{r.to}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Sitemap" className="mt-4">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Published pages automatically appear in sitemap.xml. Exclude specific slugs below.
        </p>
        <p className="text-[12px] text-[var(--color-ink-muted)] mt-4 mb-2 font-semibold">
          Published pages ({pages.docs.length})
        </p>
        <ul className="font-mono text-[13px] text-[var(--color-info)] space-y-1 max-h-[260px] overflow-y-auto">
          {pages.docs.map((p) => (
            <li key={p.id}>/{p.slug.replace(/^\//, '')}</li>
          ))}
        </ul>
        <label className="block mt-5">
          <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-2">Excluded slugs</span>
          <div className="flex gap-2">
            <input
              placeholder="slug-to-exclude"
              className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-white placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]"
            />
            <button className="text-[13px] font-medium px-4 py-2 rounded-md border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-white">
              Add
            </button>
          </div>
        </label>
      </Card>

      <Card title="robots.txt" right={<button className="text-[12px] text-[var(--color-info)] hover:underline">Reset to default</button>} className="mt-4">
        <p className="text-[13px] text-[var(--color-ink-muted)] mb-3">Override the default robots.txt for this site.</p>
        <textarea
          rows={6}
          defaultValue={buildRobots(primaryHost)}
          className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-3 text-[13px] text-white font-mono focus:outline-none focus:border-[var(--color-border-strong)]"
        />
      </Card>
    </div>
  )
}

function Card({
  title,
  right,
  children,
  className,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 card-edge ${className ?? ''}`}>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-semibold text-white">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  )
}
