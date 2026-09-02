import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ChevronLeft } from 'lucide-react'
import { CreatePageForm } from './CreatePageForm'
import { TEMPLATE_KEYS } from '@/collections/SharedLegalTemplates'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function NewSitePage({ params }: Props) {
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

  // Primary domain (for the live-URL preview in the form).
  const dom = await payload.find({
    collection: 'domains',
    where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
  })
  const primaryHost = (dom.docs[0]?.host as string | undefined) || `${slug}.preview.legenex.com`

  const templateOptions = [
    { label: 'Custom (author your own blocks)', value: 'custom' },
    ...TEMPLATE_KEYS.map((k) => ({ label: `Shared: ${k}`, value: k })),
  ]

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[820px]">
      <Link
        href={`/admin/sites/${slug}/pages`}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink-muted)] hover:text-white transition-colors mb-5"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to Pages
      </Link>

      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight text-white">New Page</h1>
        <p className="text-[var(--color-ink-muted)] text-[14px] mt-1">
          Creating a page on <span className="text-white font-medium">{site.name as string}</span>
        </p>
      </header>

      <CreatePageForm
        siteId={site.id as number}
        siteSlug={slug}
        primaryHost={primaryHost}
        templateOptions={templateOptions}
      />
    </div>
  )
}
