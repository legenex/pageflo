// @ts-nocheck -- new funnel-* collection slugs are not in committed payload-types
// yet; run `pnpm generate:types` on the server to restore typing.
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { AdvertorialBuilderApp } from '@/components/builder/advertorial/AdvertorialBuilderApp'
import { buildBrandsFromSites } from '@/lib/brand-map'
import { advDefaultBottomSection } from '@/components/builder/advertorial/seed-data'
import { ensureFunnelSamples } from '@/lib/funnel-samples'

export const dynamic = 'force-dynamic'

const relId = (v) => (v == null ? '' : typeof v === 'object' ? String(v.id) : String(v))

export default async function AdvertorialsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const payload = await getPayload({ config })
  await ensureFunnelSamples(payload)
  const [adRes, depRes, sitesRes, domainsRes, quizRes, quizDepRes] = await Promise.all([
    payload.find({ collection: 'funnel-advertorials', limit: 500, sort: '-updatedAt', overrideAccess: true }),
    payload.find({ collection: 'funnel-advertorial-deployments', limit: 1000, depth: 0, user, overrideAccess: false }),
    payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'domains', limit: 1000, sort: ['-primary'], overrideAccess: true }),
    payload.find({ collection: 'funnel-quizzes', limit: 500, overrideAccess: true }),
    payload.find({ collection: 'funnel-quiz-deployments', limit: 1000, depth: 0, user, overrideAccess: false }),
  ])

  const advertorials = adRes.docs.map((r) => ({
    id: String(r.id),
    title: r.title,
    slug: r.slug,
    templateId: r.template_id ?? 'personal_story',
    defaultBrandId: r.default_brand_id ?? '',
    status: r.status ?? 'draft',
    sections: Array.isArray(r.sections) ? r.sections : [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))

  // Brands == Sites, adapted to the advertorial brand shape: domains as host
  // strings, a `legal.disclaimer` alias, and a bottomSection default so the
  // brand-themed bottom CTA renders in preview.
  const brands = buildBrandsFromSites(
    sitesRes.docs as unknown as Array<Record<string, unknown>>,
    domainsRes.docs as unknown as Array<Record<string, unknown>>,
  ).map((b) => ({
    ...b,
    domains: (b.__domains || []).map((d) => d.host).filter(Boolean),
    legal: { ...(b.legal || {}), disclaimer: b.legal?.disclaimer || b.legal?.defaultDisclaimer || '' },
    bottomSection: b.bottomSection || advDefaultBottomSection(b.displayName || b.name),
  }))

  const domainHostById = new Map()
  for (const d of domainsRes.docs) domainHostById.set(String(d.id), String(d.host ?? ''))

  const deployments = depRes.docs.map((r) => {
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    return {
      id: String(r.id),
      name: r.name ?? '',
      advertorialId: relId(r.advertorial),
      brandId: siteId ? `site_${siteId}` : '',
      domainId: domId,
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
      quizDeploymentId: r.quiz_deployment_id ?? '',
      ctaMode: r.cta_mode ?? 'button',
      status: r.status ?? 'draft',
      utm: r.utm ?? {},
      pixels: r.pixels ?? {},
    }
  })

  // Full quizzes (steps/nodes) so the embedded-quiz preview can render.
  const quizzes = quizRes.docs.map((r) => ({
    id: String(r.id),
    name: r.name,
    slug: r.slug,
    isPublished: Boolean(r.is_published),
    tiers: Array.isArray(r.tiers) ? r.tiers : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    nodes: Array.isArray(r.nodes) ? r.nodes : [],
  }))
  const quizNameById = new Map(quizzes.map((q) => [q.id, q.name]))

  const quizDeployments = quizDepRes.docs.map((r) => {
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    const quizId = relId(r.quiz)
    return {
      id: String(r.id),
      quizId,
      quizName: quizNameById.get(quizId) ?? r.name ?? 'Quiz',
      brandId: siteId ? `site_${siteId}` : '',
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
      status: r.status ?? 'draft',
    }
  })

  return (
    <AdvertorialBuilderApp
      initialAdvertorials={advertorials}
      initialDeployments={deployments}
      brands={brands}
      quizzes={quizzes}
      quizDeployments={quizDeployments}
    />
  )
}
