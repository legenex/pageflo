import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { SiteSidebar } from '@/components/app/SiteSidebar'
import { SiteContextProvider } from './SiteContext'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = res.docs[0]
  if (!site) notFound()

  // Authorization: every page under /admin/sites/[slug] reads that Site's data
  // with overrideAccess, so the per-Site guard lives here. Without it any
  // authenticated user could read any tenant's leads/pages/credentials by URL.
  const user = await getCurrentUser()
  if (!user || !isBoundToSite(user, site.id)) notFound()

  const primaryDomain = await payload.find({
    collection: 'domains',
    where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
  })
  const primaryHost = primaryDomain.docs[0]?.host ?? null
  const primaryStatus = primaryDomain.docs[0]?.status ?? null
  const livePreviewUrl = primaryHost ? `https://${primaryHost}` : `/?site=${site.slug}`

  return (
    <>
      <SiteSidebar
        site={{ slug: site.slug, name: site.name, status: site.status, brand: site.brand ?? undefined }}
        livePreviewUrl={livePreviewUrl}
        userEmail={user?.email ?? ''}
      />
      <main className="flex-1 min-w-0 bg-[var(--color-canvas)]">
        <SiteContextProvider
          value={{
            id: Number(site.id),
            slug: site.slug,
            name: site.name,
            primaryHost,
            primaryStatus,
            livePreviewUrl,
          }}
        >
          {children}
        </SiteContextProvider>
      </main>
    </>
  )
}
