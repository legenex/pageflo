// @ts-nocheck -- new funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` on the server to restore typing.
import { getPayload } from 'payload'
import config from '@payload-config'
import { LandingPagesApp } from '@/components/builder/lp/LandingPagesApp'
import { buildBrandsFromSites } from '@/lib/brand-map'
import { ensureFunnelSamples, ensureStarterFunnelsForAllBrands } from '@/lib/funnel-samples'
import { ensureBrandTokensSyncedForAllBrands } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') return String((v as { id: unknown }).id)
  return String(v)
}

export default async function LandingPagesPage() {
  const payload = await getPayload({ config })
  await ensureFunnelSamples(payload)
  await ensureStarterFunnelsForAllBrands(payload)
  await ensureBrandTokensSyncedForAllBrands()
  const [lpRes, depRes, sitesRes, domainsRes, quizRes, quizDepRes] = await Promise.all([
    payload.find({ collection: 'funnel-landing-pages', limit: 500, sort: '-updatedAt', overrideAccess: true }),
    payload.find({ collection: 'funnel-lp-deployments', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'domains', limit: 1000, sort: ['-primary'], overrideAccess: true }),
    payload.find({ collection: 'funnel-quizzes', limit: 500, overrideAccess: true }),
    payload.find({ collection: 'funnel-quiz-deployments', limit: 1000, depth: 0, overrideAccess: true }),
  ])

  const landingPages = lpRes.docs.map((r) => ({
    id: String(r.id),
    name: r.name,
    slug: r.slug,
    // The raw stored value. Substituting a default here would be a fourth
    // opinion about what an absent id means; the registry has the only one.
    templateId: r.template_id ?? '',
    angle: r.angle ?? 'pain',
    isPublished: Boolean(r.is_published),
    sections: Array.isArray(r.sections) ? r.sections : [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))

  const brands = buildBrandsFromSites(
    sitesRes.docs as unknown as Array<Record<string, unknown>>,
    domainsRes.docs as unknown as Array<Record<string, unknown>>,
  )

  // Domains for the deployment editor's domain picker (keyed by brand = site).
  const domainHostById = new Map<string, string>()
  const editorDomains = domainsRes.docs.map((d) => {
    const sid = d.site == null ? null : typeof d.site === 'object' ? Number((d.site as { id: unknown }).id) : Number(d.site)
    domainHostById.set(String(d.id), String(d.host ?? ''))
    return { id: String(d.id), brandId: sid != null ? `site_${sid}` : '', domain: String(d.host ?? ''), isPrimary: Boolean(d.primary), status: (d.status as string) ?? 'pending' }
  })

  const deployments = depRes.docs.map((r) => {
    const lpId = relId(r.landing_page)
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    return {
      id: String(r.id),
      name: r.name ?? '',
      landingPageId: lpId,
      brandId: siteId ? `site_${siteId}` : '',
      domainId: domId,
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
      quizDeploymentId: r.quiz_deployment_id ?? '',
      status: r.status ?? 'draft',
    }
  })

  // Real quizzes + quiz deployments so the LP deployment editor's quiz picker populates.
  // The whole quiz, not just its name. The hero form runs the REAL quiz runtime
  // rather than a drawing of one, so without the steps and nodes the builder
  // shows an empty card where the most important thing on the page goes, and
  // the layout cannot be judged.
  const quizzes = quizRes.docs.map((r) => ({
    id: String(r.id),
    name: r.name,
    tiers: Array.isArray(r.tiers) ? r.tiers : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    nodes: Array.isArray(r.nodes) ? r.nodes : [],
    customFields: Array.isArray(r.custom_fields) ? r.custom_fields : [],
  }))
  const quizDeployments = quizDepRes.docs.map((r) => {
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    return {
      id: String(r.id),
      quizId: relId(r.quiz),
      brandId: siteId ? `site_${siteId}` : '',
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
    }
  })

  return (
    <LandingPagesApp
      initialLandingPages={landingPages}
      initialDeployments={deployments}
      brands={brands}
      domains={editorDomains}
      quizzes={quizzes}
      quizDeployments={quizDeployments}
    />
  )
}
