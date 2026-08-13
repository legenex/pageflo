// @ts-nocheck -- funnel-* collection slugs are not in committed payload-types yet;
// run `pnpm generate:types` on the server to restore typing for this module.
/**
 * One-time auto-seed of the sample funnel content (landing pages, quizzes, and
 * their deployments) so the builders open populated with REAL, editable records
 * the first time they are visited, matching the artifact's out-of-the-box state
 * without a manual `pnpm seed` step.
 *
 * Guarded by the `funnel_samples_seeded` flag on the integration-config global:
 * it runs exactly once, ever. After that, deleting a sample never re-creates it,
 * so the samples behave like any record the user authored.
 *
 * Idempotent and defensive: every create is existence-checked, and the whole
 * routine is wrapped so a failure can never break the page that calls it.
 */
import type { Payload } from 'payload'
import {
  SAMPLE_LANDING_PAGES,
  SAMPLE_LP_DEPLOYMENTS,
  buildSeedSections,
} from '@/components/builder/lp/section-copy'
import { buildSeedQuiz } from '@/components/builder/quiz/seed-data'
import { advBuildSeedAdvertorials } from '@/components/builder/advertorial/seed-data'

const primaryDomainId = async (payload: Payload, siteId: number): Promise<number | null> => {
  const dom = await payload.find({
    collection: 'domains',
    where: { and: [{ site: { equals: siteId } }, { primary: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
  })
  return dom.docs[0] ? Number(dom.docs[0].id) : null
}

let inFlight: Promise<void> | null = null
// Process-level latch: once both sample groups are confirmed seeded, skip the
// integration-config lookup on every subsequent funnel-page navigation.
let samplesEnsured = false

// Sample landing pages + quizzes (the "base" group, guarded by funnel_samples_seeded).
const seedBase = async (payload: Payload, sites: number[]): Promise<void> => {
  // 1) Sample landing pages (brandless), matched by slug so re-entry is safe.
  const lpIdBySlug: Record<string, number | null> = {}
  for (const spec of SAMPLE_LANDING_PAGES) {
    const existing = await payload.find({
      collection: 'funnel-landing-pages',
      where: { slug: { equals: spec.slug } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      lpIdBySlug[spec.slug] = Number(existing.docs[0].id)
      continue
    }
    const created = await payload.create({
      collection: 'funnel-landing-pages',
      data: {
        name: spec.name,
        slug: spec.slug,
        template_id: spec.template_id,
        angle: spec.angle,
        is_published: spec.is_published,
        sections: buildSeedSections(),
      },
      overrideAccess: true,
    })
    lpIdBySlug[spec.slug] = Number(created.id)
  }

  // 2) Sample LP deployments, bound to whichever sites exist (by index).
  for (const dep of SAMPLE_LP_DEPLOYMENTS) {
    const lpId = lpIdBySlug[dep.lpSlug] ?? null
    const siteId = sites[Math.min(dep.siteIndex, sites.length - 1)] ?? null
    if (!lpId || siteId == null) continue
    const existing = await payload.find({
      collection: 'funnel-lp-deployments',
      where: { and: [{ landing_page: { equals: lpId } }, { path: { equals: dep.path } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0]) continue
    await payload.create({
      collection: 'funnel-lp-deployments',
      data: {
        name: dep.name,
        landing_page: lpId,
        site: siteId,
        domain: await primaryDomainId(payload, siteId),
        path: dep.path,
        status: dep.status,
        quiz_deployment_id: '',
      },
      overrideAccess: true,
    })
  }

  // 3) Sample MVA Tiered Quiz, matched by slug.
  let quizId: number | null = null
  const existingQuiz = await payload.find({ collection: 'funnel-quizzes', where: { slug: { equals: 'mva' } }, limit: 1, overrideAccess: true })
  if (existingQuiz.docs[0]) {
    quizId = Number(existingQuiz.docs[0].id)
  } else {
    const q = buildSeedQuiz()
    const created = await payload.create({
      collection: 'funnel-quizzes',
      data: { name: q.name, slug: q.slug, is_published: q.isPublished, tiers: q.tiers, steps: q.steps, nodes: q.nodes, custom_fields: q.customFields },
      overrideAccess: true,
    })
    quizId = Number(created.id)
  }

  // 4) Sample quiz deployment bound to the first site.
  const qSiteId = sites[0] ?? null
  let quizDeploymentId: string | null = null
  if (quizId != null && qSiteId != null) {
    const existingDep = await payload.find({
      collection: 'funnel-quiz-deployments',
      where: { and: [{ quiz: { equals: quizId } }, { path: { equals: '/s/mva' } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (existingDep.docs[0]) {
      quizDeploymentId = String(existingDep.docs[0].id)
    } else {
      const dep = await payload.create({
        collection: 'funnel-quiz-deployments',
        data: {
          name: 'MVA Tiered Quiz',
          quiz: quizId,
          site: qSiteId,
          domain: await primaryDomainId(payload, qSiteId),
          path: '/s/mva',
          render_mode: 'standalone',
          template_id: 'sq_quiz_first',
          status: 'live',
          header_config: { logoEnabled: true, ctaButton: { enabled: true, text: 'CLICK HERE TO CALL', url: 'tel:', fontSize: 11 } },
          footer_config: { logoEnabled: true, logoSize: 32, showCopyright: true, fontSize: 12 },
          body_section_overrides: null,
          embed_preview_bg: '#0a1a3a',
          utm: {},
          pixels: {},
        },
        overrideAccess: true,
      })
      quizDeploymentId = String(dep.id)
    }
  }

}

// Sample advertorials (the "advertorial" group, guarded separately).
const seedAdvertorials = async (payload: Payload, sites: number[]): Promise<void> => {
  const brandSiteId = sites[0] ?? null
  const defaultBrandId = brandSiteId != null ? `site_${brandSiteId}` : ''
  let firstAdId: number | null = null
  let firstAdSlug = ''
  for (const a of advBuildSeedAdvertorials()) {
    const existing = await payload.find({ collection: 'funnel-advertorials', where: { slug: { equals: a.slug } }, limit: 1, overrideAccess: true })
    let adId: number
    if (existing.docs[0]) {
      adId = Number(existing.docs[0].id)
    } else {
      const created = await payload.create({
        collection: 'funnel-advertorials',
        data: { title: a.title, slug: a.slug, template_id: a.templateId, default_brand_id: defaultBrandId, status: a.status, sections: a.sections },
        overrideAccess: true,
      })
      adId = Number(created.id)
    }
    if (firstAdId == null) { firstAdId = adId; firstAdSlug = a.slug }
  }

  if (firstAdId != null && brandSiteId != null) {
    // Link the sample deployment to the MVA quiz deployment if one exists.
    const qd = await payload.find({ collection: 'funnel-quiz-deployments', where: { path: { equals: '/s/mva' } }, limit: 1, overrideAccess: true })
    const quizDeploymentId = qd.docs[0] ? String(qd.docs[0].id) : ''
    const path = `/a/${firstAdSlug}`
    const existingAdDep = await payload.find({
      collection: 'funnel-advertorial-deployments',
      where: { and: [{ advertorial: { equals: firstAdId } }, { path: { equals: path } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (!existingAdDep.docs[0]) {
      await payload.create({
        collection: 'funnel-advertorial-deployments',
        data: {
          name: 'Personal Story · sample',
          advertorial: firstAdId,
          site: brandSiteId,
          domain: await primaryDomainId(payload, brandSiteId),
          path,
          quiz_deployment_id: quizDeploymentId,
          cta_mode: 'button',
          status: 'live',
          utm: { source: 'facebook', medium: 'cpc', campaign: 'mva_advertorial' },
          pixels: { metaPixelId: '', tiktokPixelId: '', ga4MeasurementId: '' },
        },
        overrideAccess: true,
      })
    }
  }
}

const seedOnce = async (payload: Payload): Promise<void> => {
  const cfg = await payload.findGlobal({ slug: 'integration-config', overrideAccess: true })
  const needBase = !cfg?.funnel_samples_seeded
  const needAdv = !cfg?.funnel_advertorial_samples_seeded
  if (!needBase && !needAdv) { samplesEnsured = true; return }

  // Brands == Sites. Deployments need a real Site; quizzes/LPs/ads are brandless.
  const sitesRes = await payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true })
  const sites = sitesRes.docs.map((s) => Number(s.id))

  if (needBase) await seedBase(payload, sites)
  if (needAdv) await seedAdvertorials(payload, sites)

  // Flip the one-time markers last, so a partial failure retries next load.
  const data: Record<string, unknown> = {}
  if (needBase) data.funnel_samples_seeded = true
  if (needAdv) data.funnel_advertorial_samples_seeded = true
  await payload.updateGlobal({ slug: 'integration-config', data, overrideAccess: true })
  samplesEnsured = true
}

// -----------------------------------------------------------------------------
// Per-brand starter content. Called by createBrandSite right after the Site
// row + brand attach so EVERY new brand lands with a working LP deployment
// and Quiz deployment from day one — no manual 'now go to the LP builder
// and create a deployment for this brand' step.
// -----------------------------------------------------------------------------
const ensureMvaLandingPageId = async (payload: Payload): Promise<number | null> => {
  // The "MVA Pain First" brandless LP is the canonical starter. If for some
  // reason it doesn't exist yet, seed it on the fly.
  const slug = 'mva-pain-first'
  const existing = await payload.find({
    collection: 'funnel-landing-pages',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return Number(existing.docs[0].id)
  const spec = SAMPLE_LANDING_PAGES.find((p) => p.slug === slug) ?? SAMPLE_LANDING_PAGES[0]
  const created = await payload.create({
    collection: 'funnel-landing-pages',
    data: {
      name: spec.name,
      slug: spec.slug,
      template_id: spec.template_id,
      angle: spec.angle,
      is_published: spec.is_published,
      sections: buildSeedSections(),
    },
    overrideAccess: true,
  })
  return Number(created.id)
}

const ensureMvaQuizId = async (payload: Payload): Promise<number | null> => {
  const existing = await payload.find({
    collection: 'funnel-quizzes',
    where: { slug: { equals: 'mva' } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return Number(existing.docs[0].id)
  const q = buildSeedQuiz()
  const created = await payload.create({
    collection: 'funnel-quizzes',
    data: {
      name: q.name,
      slug: q.slug,
      is_published: q.isPublished,
      tiers: q.tiers,
      steps: q.steps,
      nodes: q.nodes,
      custom_fields: q.customFields,
    },
    overrideAccess: true,
  })
  return Number(created.id)
}

/**
 * Seed a starter Landing Page deployment + Quiz deployment for a freshly
 * created brand Site so the builders surface working content immediately.
 *
 * Idempotent: if a deployment already exists at the target path for this
 * Site, the create is skipped — so calling this twice on the same brand
 * is safe.
 *
 * Never throws: errors are logged and the function returns. createBrandSite
 * already succeeded by the time we hit this code; failing to seed the
 * starters shouldn't roll the whole brand back.
 */
export type StarterFunnelsResult = {
  ok: true
  quizDeploymentId: string | null
  quizPath: string | null
  lpDeploymentId: string | null
  lpPath: string | null
  warnings: string[]
}

// Quick error log: prefix every line so the user can grep journalctl for
// '[funnel-samples]' and see exactly which step failed for which brand.
const logStep = (siteId: number, step: string, err: unknown): string => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  // eslint-disable-next-line no-console
  console.error(`[funnel-samples] site=${siteId} step=${step} failed:`, msg)
  return `${step}: ${msg}`
}

export const seedStarterFunnelsForBrand = async (
  payload: Payload,
  siteId: number,
): Promise<StarterFunnelsResult | { ok: false; error: string }> => {
  const warnings: string[] = []

  // Per-step try/catch so one failure (e.g. clashing brandless-quiz slug,
  // missing domain) doesn't take down the rest. The function still returns
  // ok: true so the brand stays usable; per-step warnings are bubbled up
  // for the UI to surface.

  let domainId: number | null = null
  try {
    domainId = await primaryDomainId(payload, siteId)
  } catch (err) {
    warnings.push(logStep(siteId, 'primaryDomainId', err))
  }

  let quizId: number | null = null
  try {
    quizId = await ensureMvaQuizId(payload)
  } catch (err) {
    warnings.push(logStep(siteId, 'ensureMvaQuizId', err))
  }

  let lpId: number | null = null
  try {
    lpId = await ensureMvaLandingPageId(payload)
  } catch (err) {
    warnings.push(logStep(siteId, 'ensureMvaLandingPageId', err))
  }

  // Pull the brand's slug + display name so deployment paths and names
  // identify which brand they belong to. Falls back to the bare site id
  // if for any reason these aren't on the row.
  let brandSlug = `site-${siteId}`
  let displayName = `Brand ${siteId}`
  try {
    const site = (await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })) as
      | { slug?: string; name?: string; brand?: { display_name?: string } }
      | null
    brandSlug = (site?.slug || `site-${siteId}`).toString().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    displayName = site?.brand?.display_name || site?.name || `Brand ${siteId}`
  } catch (err) {
    warnings.push(logStep(siteId, 'site lookup', err))
  }

  // 1) Quiz deployment first — the LP deployment links to it. Path is
  // /s/<brand-slug> so a multi-brand admin list shows /s/claim-checker,
  // /s/check-my-claim, etc. instead of every brand sharing /s/mva.
  let quizDeploymentId: string | null = null
  let quizPath: string | null = null
  if (quizId != null) {
    quizPath = `/s/${brandSlug}`
    try {
      const existingQuiz = await payload.find({
        collection: 'funnel-quiz-deployments',
        where: { and: [{ site: { equals: siteId } }, { path: { equals: quizPath } }] },
        limit: 1,
        overrideAccess: true,
      })
      if (existingQuiz.docs[0]) {
        quizDeploymentId = String(existingQuiz.docs[0].id)
      } else {
        const dep = await payload.create({
          collection: 'funnel-quiz-deployments',
          data: {
            name: `${displayName} · MVA Tiered Quiz`,
            quiz: quizId,
            site: siteId,
            domain: domainId,
            path: quizPath,
            render_mode: 'standalone',
            template_id: 'sq_quiz_first',
            status: 'live',
            header_config: { logoEnabled: true, ctaButton: { enabled: true, text: 'CLICK HERE TO CALL', url: 'tel:', fontSize: 11 } },
            footer_config: { logoEnabled: true, logoSize: 32, showCopyright: true, fontSize: 12 },
            body_section_overrides: null,
            embed_preview_bg: '#0a1a3a',
            utm: {},
            pixels: {},
          },
          overrideAccess: true,
        })
        quizDeploymentId = String(dep.id)
      }
    } catch (err) {
      warnings.push(logStep(siteId, 'quiz deployment create', err))
    }
  } else {
    warnings.push('quiz deployment skipped: no brandless MVA quiz available')
  }

  // 2) LP deployment, wired to the quiz deployment if we have one. Path is
  // /c/<brand-slug> — same brand-identifying pattern.
  let lpDeploymentId: string | null = null
  let lpPath: string | null = null
  if (lpId != null) {
    lpPath = `/c/${brandSlug}`
    try {
      const existingLp = await payload.find({
        collection: 'funnel-lp-deployments',
        where: { and: [{ site: { equals: siteId } }, { path: { equals: lpPath } }] },
        limit: 1,
        overrideAccess: true,
      })
      if (existingLp.docs[0]) {
        lpDeploymentId = String(existingLp.docs[0].id)
      } else {
        const dep = await payload.create({
          collection: 'funnel-lp-deployments',
          data: {
            name: `${displayName} · MVA Pain First`,
            landing_page: lpId,
            site: siteId,
            domain: domainId,
            path: lpPath,
            status: 'live',
            quiz_deployment_id: quizDeploymentId ?? '',
          },
          overrideAccess: true,
        })
        lpDeploymentId = String(dep.id)
      }
    } catch (err) {
      warnings.push(logStep(siteId, 'lp deployment create', err))
    }
  } else {
    warnings.push('lp deployment skipped: no brandless MVA LP available')
  }

  return { ok: true, quizDeploymentId, quizPath, lpDeploymentId, lpPath, warnings }
}

/**
 * Backfill helper: walk every Site and run seedStarterFunnelsForBrand on
 * each one. The seeder is idempotent on (site + brand-slug path), so a
 * Site that already has the per-brand /s/<slug> + /c/<slug> deployments
 * stays unchanged.
 *
 * Importantly, Sites that have OLD shared-path deployments like /s/mva or
 * /c/pain ALSO get the new per-brand paths added — the seeder doesn't
 * delete the old ones, it just creates the brand-slug-prefixed ones
 * alongside. The user can clean up the old shared paths later by hand.
 *
 * Called by the funnel admin pages so existing brands created before the
 * per-brand-slug auto-seed feature shipped get their brand-specific
 * deployments the next time someone opens the Quiz / LP builder.
 */
const brandsBackfilled = new Set<number>()
export const ensureStarterFunnelsForAllBrands = async (payload: Payload): Promise<void> => {
  try {
    const sitesRes = await payload.find({ collection: 'sites', limit: 500, overrideAccess: true })
    for (const s of sitesRes.docs) {
      const siteId = Number(s.id)
      if (brandsBackfilled.has(siteId)) continue
      // No 'has any deployment' shortcut — we want every Site to end up
      // with its per-brand /s/<slug> + /c/<slug> paths even if it already
      // has older shared-path deployments like /s/mva.
      await seedStarterFunnelsForBrand(payload, siteId)
      brandsBackfilled.add(siteId)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[funnel-samples] backfill failed:', err)
  }
}

/**
 * Ensure the sample funnel content exists (runs at most once, ever).
 * Never throws: on error it logs and returns so the calling page still renders.
 * Concurrent callers on a cold first load share a single in-flight run.
 */
export const ensureFunnelSamples = async (payload: Payload): Promise<void> => {
  if (samplesEnsured) return // already confirmed this process; no DB hit
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      await seedOnce(payload)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[funnel-samples] auto-seed failed (page still renders):', err)
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
