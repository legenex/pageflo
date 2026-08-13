// @ts-nocheck -- new funnel-* collection slugs are not in committed payload-types
// yet; run `pnpm generate:types` on the server to restore typing.
import { getPayload } from 'payload'
import config from '@payload-config'
import { QuizBuilderApp } from '@/components/builder/quiz/QuizBuilderApp'
import { buildBrandsFromSites } from '@/lib/brand-map'
import { ensureFunnelSamples, ensureStarterFunnelsForAllBrands } from '@/lib/funnel-samples'
import { ensureBrandTokensSyncedForAllBrands } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'
import { ensureTemplateLibrary, listQuizTemplateRecords } from '@/lib/template-records'

export const dynamic = 'force-dynamic'

const relId = (v) => (v == null ? '' : typeof v === 'object' ? String(v.id) : String(v))

export default async function QuizzesPage() {
  const payload = await getPayload({ config })
  await ensureFunnelSamples(payload)
  await ensureStarterFunnelsForAllBrands(payload)
  await ensureBrandTokensSyncedForAllBrands()
  // Before the list read, not beside it: the stock rows have to exist before
  // anything asks what templates there are, or the first render of a fresh
  // database shows an empty library and the operator's first impression is that
  // the twenty templates are gone.
  await ensureTemplateLibrary(payload)
  const [qRes, depRes, sitesRes, domainsRes, quizTemplates] = await Promise.all([
    payload.find({ collection: 'funnel-quizzes', limit: 500, sort: '-updatedAt', overrideAccess: true }),
    payload.find({ collection: 'funnel-quiz-deployments', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'domains', limit: 1000, sort: ['-primary'], overrideAccess: true }),
    // Tolerated rather than awaited blindly: on a database where the template
    // migration has not run the table is missing, and a builder that 500s is
    // worse than one whose gallery is empty and says so.
    listQuizTemplateRecords(payload).catch(() => []),
  ])

  const quizzes = qRes.docs.map((r) => ({
    id: String(r.id),
    name: r.name,
    slug: r.slug,
    isPublished: Boolean(r.is_published),
    isArchived: Boolean(r.is_archived),
    archivedAt: r.archived_at ?? null,
    tiers: Array.isArray(r.tiers) ? r.tiers : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    nodes: Array.isArray(r.nodes) ? r.nodes : [],
    customFields: Array.isArray(r.custom_fields) ? r.custom_fields : [],
  }))

  const brands = buildBrandsFromSites(sitesRes.docs, domainsRes.docs)

  const domainHostById = new Map()
  for (const d of domainsRes.docs) domainHostById.set(String(d.id), String(d.host ?? ''))

  const deployments = depRes.docs.map((r) => {
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    return {
      id: String(r.id),
      name: r.name ?? '',
      quizId: relId(r.quiz),
      brandId: siteId ? `site_${siteId}` : '',
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
      renderMode: r.render_mode ?? 'standalone',
      // The raw stored value. Substituting a default here would be a fourth
    // opinion about what an absent id means; the registry has the only one.
    templateId: r.template_id ?? '',
      progressForm: r.progress_form ?? null,
      status: r.status ?? 'draft',
      embedPreviewBg: r.embed_preview_bg ?? '',
      destinationOverrides: r.destination_overrides ?? null,
      // No header_config / footer_config / body_section_overrides. Page chrome
      // and body sections are authored on Brand Identity now; hydrating the
      // deprecated columns was what put an empty bordered header strip in the
      // builder preview (`?? {}` is truthy, so the renderer's chrome branch fired
      // for a deployment that had never configured one).
      utm: r.utm ?? {},
      pixels: r.pixels ?? {},
    }
  })

  return (
    <QuizBuilderApp
      initialQuizzes={quizzes}
      initialDeployments={deployments}
      brands={brands}
      quizTemplates={quizTemplates}
    />
  )
}
