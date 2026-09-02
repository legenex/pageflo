import Link from 'next/link'
import { Search } from 'lucide-react'
import { ComingSoon, Page, PageHeader } from '@/components/pageflo/primitives'

export const metadata = { title: 'Site SEO' }

type Props = { params: Promise<{ slug: string }> }

/**
 * Site-wide SEO defaults do not exist yet.
 *
 * PER-PAGE SEO DOES. `meta_title`, `meta_description` and `og_image_url` are
 * real fields on every Page, they are read by `generateMetadata` in the public
 * router, and they are what a crawler actually sees. What is missing is the
 * layer above: one place to set the fallbacks a page inherits when it sets
 * nothing of its own.
 */
export default async function SiteSeoPage({ params }: Props) {
  const { slug } = await params
  return (
    <Page className="max-w-[900px]">
      <PageHeader title="SEO" subtitle="Search and social defaults for every page on this Site." />
      <ComingSoon
        icon={<Search className="h-[22px] w-[22px]" aria-hidden="true" />}
        title="Site-wide SEO defaults are not built yet"
        body="Per-page SEO is fully working: title, meta description and Open Graph image are fields on every Page, and the public router emits them as real tags with a canonical URL. A page that sets none of them falls back to its title and the brand name."
        waitingFor="a defaults layer on the Site, so a brand can set one Open Graph image and one description template that every page inherits instead of repeating them per page."
        preview={
          <Link
            href={`/admin/sites/${slug}/pages`}
            className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            Edit per-page SEO
          </Link>
        }
      />
    </Page>
  )
}
