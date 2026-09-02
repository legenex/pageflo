import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { TrackingForm } from './TrackingForm'
import type { TrackingPayload } from './actions'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function TrackingPage({ params }: Props) {
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

  const tcRes = await payload.find({
    collection: 'tracking-configs',
    where: { site: { equals: site.id } },
    limit: 1,
    overrideAccess: true,
  })
  const tc = tcRes.docs[0]
  // Payload returns nullable nested fields; the client form treats null as undefined.
  // Round-trip through JSON to strip nulls and Payload internals (id, site, timestamps).
  const initial: TrackingPayload = tc
    ? (JSON.parse(
        JSON.stringify({
          meta_pixel: tc.meta_pixel,
          google_ads: tc.google_ads,
          ga4: tc.ga4,
          tiktok: tc.tiktok,
          gtm: tc.gtm,
          trustedform: tc.trustedform,
          truecall: tc.truecall,
          jornaya: tc.jornaya,
          custom_webhooks: tc.custom_webhooks,
        }),
      ) as TrackingPayload)
    : {}

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Tracking &amp; Pixels</h1>
        <p className="text-ink-muted text-[13px] mt-1.5">
          Configure advertising pixels, CAPI, analytics, and webhooks for this site
        </p>
      </header>
      <TrackingForm siteId={Number(site.id)} siteSlug={slug} initial={initial} />
    </div>
  )
}
