// @ts-nocheck -- new funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` on the server to restore typing.
import { getPayload } from 'payload'
import config from '@payload-config'
import { LandingPagesApp } from '@/components/builder/lp/LandingPagesApp'
import { buildBrandsFromSites } from '@/lib/brand-map'
import { ensureFunnelSamples, ensureStarterFunnelsForAllBrands } from '@/lib/funnel-samples'
import { ensureBrandTokensSyncedForAllBrands } from '@/app/(app)/admin/(top)/brands/brand-identities/actions'
import {
  ensureTemplateLibrary,
  listLpTemplateRecords,
  listQuizTemplateRecords,
} from '@/lib/template-records'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') return String((v as { id: unknown }).id)
  return String(v)
}

const asStringMap = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

export default async function LandingPagesPage() {
  const payload = await getPayload({ config })

  // ORDER IS LOAD-BEARING. `ensureTemplateLibrary` materialises the twelve stock
  // template rows and then retires the sample pages by repointing their
  // deployments onto those rows, and `ensureFunnelSamples` /
  // `ensureStarterFunnelsForAllBrands` bind their starter deployments to a stock
  // row looked up by `stock_key`. Run the other way round, the starters find no
  // row and every brand lands with a deployment that has no template.
  await ensureTemplateLibrary(payload)
  await ensureFunnelSamples(payload)
  await ensureStarterFunnelsForAllBrands(payload)
  await ensureBrandTokensSyncedForAllBrands()

  const [templates, quizTemplates, depRes, sitesRes, domainsRes, quizRes] = await Promise.all([
    // The record layer, never the code registry: what an operator may select,
    // rename, disable or delete is a row, and this is the one place that knows.
    listLpTemplateRecords(payload),
    listQuizTemplateRecords(payload),
    payload.find({ collection: 'funnel-lp-deployments', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'domains', limit: 1000, sort: ['-primary'], overrideAccess: true }),
    payload.find({ collection: 'funnel-quizzes', limit: 500, overrideAccess: true }),
  ])

  const brands = buildBrandsFromSites(
    sitesRes.docs as unknown as Array<Record<string, unknown>>,
    domainsRes.docs as unknown as Array<Record<string, unknown>>,
  )

  // Domains for the deployment list's orphan check. The editor's picker reads
  // `brand.__domains` instead, because it also needs certificate state.
  const domainHostById = new Map<string, string>()
  const editorDomains = domainsRes.docs.map((d) => {
    const sid = d.site == null ? null : typeof d.site === 'object' ? Number((d.site as { id: unknown }).id) : Number(d.site)
    domainHostById.set(String(d.id), String(d.host ?? ''))
    return { id: String(d.id), brandId: sid != null ? `site_${sid}` : '', domain: String(d.host ?? ''), isPrimary: Boolean(d.primary), status: (d.status as string) ?? 'pending' }
  })

  const deployments = depRes.docs.map((r) => {
    const siteId = relId(r.site)
    const domId = relId(r.domain)
    return {
      id: String(r.id),
      name: r.name ?? '',
      // The TEMPLATE ROW this deployment renders. Named `landingPageId` because
      // that is the column, `landing_page`, that stores it.
      landingPageId: relId(r.landing_page),
      brandId: siteId ? `site_${siteId}` : '',
      domainId: domId,
      domain: domId ? domainHostById.get(domId) ?? '' : '',
      path: r.path ?? '',
      // The flow this page runs. The editor picks a quiz FLOW directly now;
      // `quizDeploymentId` is the older pointer at a standalone quiz page, kept
      // so a row that still carries one is not wiped by an unrelated save.
      quizId: relId(r.quiz),
      quizDeploymentId: r.quiz_deployment_id ?? '',
      embeddedQuizTemplateId: r.embedded_quiz_template_id ?? '',
      embeddedProgressForm: r.embedded_progress_form ?? null,
      contentOverrides: asStringMap(r.content_overrides),
      destinationOverrides: asObject(r.destination_overrides),
      utm: asObject(r.utm),
      pixels: asObject(r.pixels),
      status: r.status ?? 'draft',
    }
  })

  // The whole quiz, not just its name. The hero form runs the REAL quiz runtime
  // rather than a drawing of one, so without the steps and nodes the builder
  // shows an empty card where the most important thing on the page goes, and
  // the layout cannot be judged.
  const quizzes = quizRes.docs.map((r) => ({
    id: String(r.id),
    name: r.name,
    isPublished: Boolean(r.is_published),
    isArchived: Boolean(r.is_archived),
    tiers: Array.isArray(r.tiers) ? r.tiers : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    nodes: Array.isArray(r.nodes) ? r.nodes : [],
    customFields: Array.isArray(r.custom_fields) ? r.custom_fields : [],
  }))

  return (
    <LandingPagesApp
      initialTemplates={templates}
      initialDeployments={deployments}
      brands={brands}
      domains={editorDomains}
      quizzes={quizzes}
      quizTemplates={quizTemplates}
    />
  )
}
