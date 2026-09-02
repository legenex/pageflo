import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Plus, Search, Wand2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function SiteBlogPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]; if (!site) notFound()
  const posts = await payload.find({
    collection: 'blog-posts',
    where: { site: { equals: site.id } },
    sort: '-updatedAt',
    limit: 50,
    overrideAccess: true,
  })

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Blog Manager</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">Manage blog posts and programmatic SEO across all sites</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/blog/seo-builder"
            className="text-[14px] text-white font-medium px-4 py-2.5 rounded-lg border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] inline-flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" /> SEO Builder
          </Link>
          <Link
            href={`/cms/collections/blog-posts/create?site=${site.id}`}
            className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> New Post
          </Link>
        </div>
      </header>

      <div className="flex gap-3 mb-5">
        <div className="relative">
          <select className="appearance-none bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg pl-3.5 pr-9 py-2.5 text-[14px] text-[var(--color-ink)] focus:outline-none">
            <option>{site.name}</option>
          </select>
        </div>
        <div className="flex-1 max-w-[420px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
          <input
            type="text"
            placeholder="Search posts..."
            className="w-full bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg pl-10 pr-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge">
        {posts.docs.length === 0 ? (
          <div className="px-5 py-24 text-center">
            <h2 className="text-[18px] font-semibold text-white">No posts yet</h2>
            <p className="text-[14px] text-[var(--color-ink-muted)] mt-2">Create your first blog post or use the SEO Builder.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {posts.docs.map((p) => (
              <li key={p.id} className="px-5 py-4 flex items-center justify-between gap-3">
                <Link href={`/cms/collections/blog-posts/${p.id}`} className="text-white text-[14px] font-medium hover:underline truncate">
                  {p.title}
                </Link>
                <span className="text-[12px] text-[var(--color-ink-muted)] capitalize">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
