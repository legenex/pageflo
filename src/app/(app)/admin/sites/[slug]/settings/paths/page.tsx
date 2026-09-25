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
          Published website pages appear in sitemap.xml. Funnel deployments (quiz, landing page, advertorial)
          are routed separately and are not listed here.
        </p>
        <p className="text-[12px] text-[var(--color-ink-muted)] mt-4 mb-2 font-semibold">
          Published pages ({pages.docs.length})
        </p>
        <ul className="font-mono text-[13px] text-[var(--color-info)] space-y-1 max-h-[260px] overflow-y-auto">
          {pages.docs.map((p) => (
            <li key={p.id}>/{p.slug.replace(/^\//, '')}</li>
          ))}
        </ul>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-5">
          Per-slug sitemap exclusions are not a stored V1 setting. Hide a page from the public site by
          unpublishing it in the website builder.
        </p>
      </Card>

      <Card title="robots.txt" className="mt-4">
        <p className="text-[13px] text-[var(--color-ink-muted)] mb-3">
          This Brand uses the default robots.txt. A stored override is not a V1 setting.
        </p>
        <pre className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-3 text-[13px] text-white font-mono whitespace-pre-wrap">
          {buildRobots(primaryHost)}
        </pre>
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
