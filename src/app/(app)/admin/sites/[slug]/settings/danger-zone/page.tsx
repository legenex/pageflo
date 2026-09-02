import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/pageflo/primitives'
import type { SiteStatus } from '../general/actions'
import { DangerZoneClient } from './DangerZoneClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'Danger zone' }

type Props = { params: Promise<{ slug: string }> }

/**
 * Counts are read here, not estimated in the dialog.
 *
 * The delete confirmation names how many leads go with the Site, and a number
 * that is close but wrong is worse than no number: the whole point of showing
 * it is that the operator can recognise "that is not the Site I meant".
 */
export default async function DangerZonePage({ params }: Props) {
  const { slug } = await params
  const me = await getCurrentUser()
  if (!me) redirect(`/sign-in?next=/admin/sites/${slug}/settings/danger-zone`)

  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]
  if (!site) notFound()

  const where = { site: { equals: site.id } }
  const [pages, leads, domains, quizDeployments, lpDeployments, primary] = await Promise.all([
    payload.count({ collection: 'pages', where, overrideAccess: true }),
    payload.count({ collection: 'leads', where, overrideAccess: true }),
    payload.count({ collection: 'domains', where, overrideAccess: true }),
    payload.count({ collection: 'funnel-quiz-deployments' as never, where, overrideAccess: true }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: 'funnel-lp-deployments' as never, where, overrideAccess: true }).catch(() => ({ totalDocs: 0 })),
    payload.find({
      collection: 'domains',
      where: { and: [where, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    }),
  ])

  return (
    <Page className="max-w-[900px]">
      <PageHeader
        title="Danger zone"
        subtitle={`Actions on ${site.name} that stop it serving, or remove it entirely. Each one says exactly what it does before it does it.`}
      />
      <DangerZoneClient
        siteId={Number(site.id)}
        siteName={site.name}
        siteSlug={site.slug}
        status={(site.status ?? 'draft') as SiteStatus}
        primaryHost={primary.docs[0]?.host ?? null}
        counts={{
          pages: pages.totalDocs,
          leads: leads.totalDocs,
          domains: domains.totalDocs,
          quizDeployments: quizDeployments.totalDocs,
          lpDeployments: lpDeployments.totalDocs,
        }}
        canDelete={Boolean(me.super_admin)}
      />
    </Page>
  )
}
