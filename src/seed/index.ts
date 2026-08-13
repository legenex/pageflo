// @ts-nocheck -- funnel-* collection slugs are not in committed payload-types yet;
// run `pnpm generate:types` on the server to restore typing for this script.
/**
 * Seed script. Run with: pnpm seed
 *
 * Idempotent: if a record already exists (matched by unique key) it is updated rather than
 * duplicated. Safe to re-run on every deploy.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { TEMPLATE_BODIES } from './templates'
import { SEED_SITES, DEFAULT_LEGAL_PAGES } from './sites'
import { HOME_BLOCKS_BY_SLUG } from './home-blocks'
import { SAMPLE_LANDING_PAGES, SAMPLE_LP_DEPLOYMENTS, buildSeedSections } from '../components/builder/lp/section-copy'
import { buildSeedQuiz } from '../components/builder/quiz/seed-data'
import { advBuildSeedAdvertorials } from '../components/builder/advertorial/seed-data'

const log = (msg: string): void => {
  process.stdout.write(`[seed] ${msg}\n`)
}

const upsertTemplate = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  tpl: (typeof TEMPLATE_BODIES)[number],
): Promise<void> => {
  const existing = await payload.find({
    collection: 'shared-legal-templates',
    where: { template_key: { equals: tpl.template_key } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'shared-legal-templates',
      id: existing.docs[0].id,
      data: {
        body_markdown_with_vars: tpl.body_markdown_with_vars,
        default_meta_title: tpl.default_meta_title,
        default_meta_description: tpl.default_meta_description,
        last_reviewed_at: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    log(`updated template: ${tpl.template_key}`)
  } else {
    await payload.create({
      collection: 'shared-legal-templates',
      data: {
        template_key: tpl.template_key,
        body_markdown_with_vars: tpl.body_markdown_with_vars,
        default_meta_title: tpl.default_meta_title,
        default_meta_description: tpl.default_meta_description,
        last_reviewed_at: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    log(`created template: ${tpl.template_key}`)
  }
}

const ensureSuperAdmin = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const email = process.env.SUPER_ADMIN_EMAIL
  const password = process.env.SUPER_ADMIN_PASSWORD
  if (!email || !password) {
    log('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD missing; skipping super admin creation')
    return null
  }
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    log(`super admin already exists: ${email}`)
    return existing.docs[0]
  }
  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      name: 'LegalOS Super Admin',
      super_admin: true,
      status: 'active',
    },
    overrideAccess: true,
  })
  log(`created super admin: ${email}`)
  return user
}

const upsertSite = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  spec: (typeof SEED_SITES)[number],
): Promise<number> => {
  const existing = await payload.find({
    collection: 'sites',
    where: { slug: { equals: spec.slug } },
    limit: 1,
    overrideAccess: true,
  })
  const data = {
    name: spec.name,
    slug: spec.slug,
    status: 'active' as const,
    vertical: spec.vertical,
    tagline: spec.tagline,
    default_phone: spec.default_phone,
    default_phone_tel: spec.default_phone_tel,
    org_name: spec.org_name,
    support_email: spec.support_email,
    brand: {
      primary: spec.brand.primary,
      accent: spec.brand.accent,
      surface: spec.brand.surface,
      ink: spec.brand.ink,
      muted: '#5C6470',
      success: '#1F9D55',
      warning: '#E8B14B',
      danger: '#C03A2B',
      font_heading: 'Inter',
      font_body: 'Inter',
    },
    default_tone: 'empathetic' as const,
  }
  if (existing.docs[0]) {
    await payload.update({ collection: 'sites', id: existing.docs[0].id, data, overrideAccess: true })
    log(`updated site: ${spec.slug}`)
    return Number(existing.docs[0].id)
  }
  const created = await payload.create({ collection: 'sites', data, overrideAccess: true })
  log(`created site: ${spec.slug}`)
  return Number(created.id)
}

const upsertDomain = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
  host: string,
  primary: boolean,
  status: 'pending' | 'verified' | 'active',
  kind: 'preview' | 'custom' = 'custom',
) => {
  const normalized = host.toLowerCase().trim()
  const existing = await payload.find({
    collection: 'domains',
    where: { host: { equals: normalized } },
    limit: 1,
    overrideAccess: true,
  })
  const data = { site: siteId, host: normalized, primary, status, kind }
  if (existing.docs[0]) {
    await payload.update({ collection: 'domains', id: existing.docs[0].id, data, overrideAccess: true })
    log(`updated domain: ${normalized}`)
  } else {
    await payload.create({ collection: 'domains', data, overrideAccess: true })
    log(`created domain: ${normalized}`)
  }
}

/**
 * Remove any Domain rows on this Site whose host is NOT in the keep list.
 * Used so the seed can converge on the canonical "one primary URL per Site" state.
 */
const pruneDomainsExcept = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
  keepHosts: string[],
) => {
  const existing = await payload.find({
    collection: 'domains',
    where: { site: { equals: siteId } },
    limit: 200,
    overrideAccess: true,
  })
  const keep = new Set(keepHosts.map((h) => h.toLowerCase()))
  for (const d of existing.docs) {
    if (!keep.has(d.host.toLowerCase())) {
      await payload.delete({ collection: 'domains', id: d.id, overrideAccess: true })
      log(`pruned domain: ${d.host}`)
    }
  }
}

const upsertPage = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
  siteSlug: string,
  page: (typeof DEFAULT_LEGAL_PAGES)[number],
) => {
  const existing = await payload.find({
    collection: 'pages',
    where: { and: [{ site: { equals: siteId } }, { slug: { equals: page.slug } }] },
    limit: 1,
    overrideAccess: true,
  })
  // For the home page, attach real body_blocks. Legal pages stay shared-template.
  const isHome = page.slug === '/'
  const homeBlocks = isHome ? HOME_BLOCKS_BY_SLUG[siteSlug] : undefined
  const data: Record<string, unknown> = {
    site: siteId,
    title: page.title,
    slug: page.slug,
    status: 'published' as const,
    template_key: page.template_key,
    uses_shared_template: page.uses_shared_template,
    published_at: new Date().toISOString(),
  }
  if (homeBlocks) data.body_blocks = homeBlocks
  if (existing.docs[0]) {
    await payload.update({ collection: 'pages', id: existing.docs[0].id, data: data as never, overrideAccess: true })
  } else {
    await payload.create({ collection: 'pages', data: data as never, overrideAccess: true })
    log(`created page: ${page.slug}${isHome ? ' (with body_blocks)' : ''}`)
  }
}

const upsertTrackingConfig = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
) => {
  const existing = await payload.find({
    collection: 'tracking-configs',
    where: { site: { equals: siteId } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return
  await payload.create({
    collection: 'tracking-configs',
    data: { site: siteId },
    overrideAccess: true,
  })
  log(`created tracking-config for site ${siteId}`)
}

// Sample brandless funnel landing pages (artifact buildSeedLandingPages).
const upsertFunnelLP = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  spec: (typeof SAMPLE_LANDING_PAGES)[number],
): Promise<number | null> => {
  const existing = await payload.find({
    collection: 'funnel-landing-pages',
    where: { slug: { equals: spec.slug } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    log(`funnel LP exists: ${spec.slug}`)
    return Number(existing.docs[0].id)
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
  log(`created funnel LP: ${spec.slug}`)
  return Number(created.id)
}

// Sample LP deployments (artifact buildSeedLPDeployments), bound to real sites.
const upsertFunnelDeployment = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  dep: (typeof SAMPLE_LP_DEPLOYMENTS)[number],
  lpId: number | null,
  siteId: number | null,
  domainId: number | null,
): Promise<void> => {
  if (!lpId || !siteId) return
  const existing = await payload.find({
    collection: 'funnel-lp-deployments',
    where: { and: [{ landing_page: { equals: lpId } }, { path: { equals: dep.path } }] },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    log(`funnel deployment exists: ${dep.name}`)
    return
  }
  await payload.create({
    collection: 'funnel-lp-deployments',
    data: { name: dep.name, landing_page: lpId, site: siteId, domain: domainId, path: dep.path, status: dep.status, quiz_deployment_id: '' },
    overrideAccess: true,
  })
  log(`created funnel deployment: ${dep.name}`)
}

// Sample MVA Tiered Quiz (artifact buildSeedQuiz) + a live deployment.
const upsertFunnelQuiz = async (payload: Awaited<ReturnType<typeof getPayload>>): Promise<number | null> => {
  const existing = await payload.find({ collection: 'funnel-quizzes', where: { slug: { equals: 'mva' } }, limit: 1, overrideAccess: true })
  if (existing.docs[0]) { log('funnel quiz exists: mva'); return Number(existing.docs[0].id) }
  const q = buildSeedQuiz()
  const created = await payload.create({
    collection: 'funnel-quizzes',
    data: { name: q.name, slug: q.slug, is_published: q.isPublished, tiers: q.tiers, steps: q.steps, nodes: q.nodes, custom_fields: q.customFields },
    overrideAccess: true,
  })
  log('created funnel quiz: mva')
  return Number(created.id)
}

const upsertFunnelQuizDeployment = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  quizId: number | null,
  siteId: number | null,
  domainId: number | null,
): Promise<void> => {
  if (!quizId || !siteId) return
  const existing = await payload.find({
    collection: 'funnel-quiz-deployments',
    where: { and: [{ quiz: { equals: quizId } }, { path: { equals: '/s/mva' } }] },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) { log('funnel quiz deployment exists'); return }
  await payload.create({
    collection: 'funnel-quiz-deployments',
    data: {
      name: 'MVA Tiered Quiz', quiz: quizId, site: siteId, domain: domainId, path: '/s/mva',
      render_mode: 'standalone', template_id: 'sq_quiz_first', status: 'live',
      header_config: { logoEnabled: true, ctaButton: { enabled: true, text: 'CLICK HERE TO CALL', url: 'tel:', fontSize: 11 } },
      footer_config: { logoEnabled: true, logoSize: 32, showCopyright: true, fontSize: 12 },
      body_section_overrides: null, embed_preview_bg: '#0a1a3a', utm: {}, pixels: {},
    },
    overrideAccess: true,
  })
  log('created funnel quiz deployment')
}

const run = async () => {
  const payload = await getPayload({ config: await config })

  log('seeding shared legal templates...')
  for (const t of TEMPLATE_BODIES) await upsertTemplate(payload, t)

  log('seeding super admin...')
  const superAdmin = await ensureSuperAdmin(payload)

  log('seeding sites...')
  const siteIds: Array<{ slug: string; id: number }> = []
  for (const spec of SEED_SITES) {
    const siteId = await upsertSite(payload, spec)
    siteIds.push({ slug: spec.slug, id: siteId })

    // Each Site gets a preview subdomain (always live, never primary unless no custom)
    // plus its custom primary domain. Custom is primary when verified/active; otherwise
    // the preview subdomain is the primary so the Site has a working URL out of the box.
    const previewBase = process.env.LEGALOS_PREVIEW_DOMAIN ?? 'preview.legenex.com'
    const previewHost = `${spec.slug}.${previewBase}`
    const customIsActive = spec.primary_status === 'active'

    await upsertDomain(payload, siteId, previewHost, !customIsActive, 'active', 'preview')
    await upsertDomain(payload, siteId, spec.primary_host, customIsActive, spec.primary_status, 'custom')
    await pruneDomainsExcept(payload, siteId, [previewHost, spec.primary_host])

    for (const page of DEFAULT_LEGAL_PAGES) await upsertPage(payload, siteId, spec.slug, page)
    await upsertTrackingConfig(payload, siteId)
  }

  if (superAdmin) {
    log('binding super admin to all sites...')
    await payload.update({
      collection: 'users',
      id: superAdmin.id,
      data: {
        siteBindings: siteIds.map((s) => ({ site: s.id, role: 'admin' as const, invited_at: new Date().toISOString(), accepted_at: new Date().toISOString() })),
      },
      overrideAccess: true,
    })
  }

  log('seeding sample funnel landing pages...')
  const lpIdBySlug: Record<string, number | null> = {}
  for (const spec of SAMPLE_LANDING_PAGES) {
    lpIdBySlug[spec.slug] = await upsertFunnelLP(payload, spec)
  }

  log('seeding sample LP deployments...')
  for (const dep of SAMPLE_LP_DEPLOYMENTS) {
    const lpId = lpIdBySlug[dep.lpSlug] ?? null
    const site = siteIds[Math.min(dep.siteIndex, siteIds.length - 1)]
    if (!site) continue
    const dom = await payload.find({
      collection: 'domains',
      where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    })
    const domainId = dom.docs[0] ? Number(dom.docs[0].id) : null
    await upsertFunnelDeployment(payload, dep, lpId, site.id, domainId)
  }

  log('seeding sample funnel quiz...')
  const quizId = await upsertFunnelQuiz(payload)
  const qsite = siteIds[0]
  let primaryDomainId: number | null = null
  if (qsite) {
    const qdom = await payload.find({
      collection: 'domains',
      where: { and: [{ site: { equals: qsite.id } }, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    })
    primaryDomainId = qdom.docs[0] ? Number(qdom.docs[0].id) : null
    await upsertFunnelQuizDeployment(payload, quizId, qsite.id, primaryDomainId)
  }

  log('seeding sample funnel advertorials...')
  const brandSiteId = qsite ? qsite.id : null
  const defaultBrandId = brandSiteId != null ? `site_${brandSiteId}` : ''
  let firstAdId: number | null = null
  let firstAdSlug = ''
  for (const a of advBuildSeedAdvertorials()) {
    const existing = await payload.find({ collection: 'funnel-advertorials', where: { slug: { equals: a.slug } }, limit: 1, overrideAccess: true })
    let adId: number
    if (existing.docs[0]) {
      adId = Number(existing.docs[0].id)
      log(`funnel advertorial exists: ${a.slug}`)
    } else {
      const created = await payload.create({
        collection: 'funnel-advertorials',
        data: { title: a.title, slug: a.slug, template_id: a.templateId, default_brand_id: defaultBrandId, status: a.status, sections: a.sections },
        overrideAccess: true,
      })
      adId = Number(created.id)
      log(`created funnel advertorial: ${a.slug}`)
    }
    if (firstAdId == null) { firstAdId = adId; firstAdSlug = a.slug }
  }

  if (firstAdId != null && brandSiteId != null) {
    let quizDeploymentId = ''
    if (quizId != null) {
      const qd = await payload.find({ collection: 'funnel-quiz-deployments', where: { and: [{ quiz: { equals: quizId } }, { path: { equals: '/s/mva' } }] }, limit: 1, overrideAccess: true })
      quizDeploymentId = qd.docs[0] ? String(qd.docs[0].id) : ''
    }
    const path = `/a/${firstAdSlug}`
    const existingAdDep = await payload.find({ collection: 'funnel-advertorial-deployments', where: { and: [{ advertorial: { equals: firstAdId } }, { path: { equals: path } }] }, limit: 1, overrideAccess: true })
    if (existingAdDep.docs[0]) {
      log('funnel advertorial deployment exists')
    } else {
      await payload.create({
        collection: 'funnel-advertorial-deployments',
        data: {
          name: 'Personal Story · sample', advertorial: firstAdId, site: brandSiteId, domain: primaryDomainId, path,
          quiz_deployment_id: quizDeploymentId, cta_mode: 'button', status: 'live',
          utm: { source: 'facebook', medium: 'cpc', campaign: 'mva_advertorial' },
          pixels: { metaPixelId: '', tiktokPixelId: '', ga4MeasurementId: '' },
        },
        overrideAccess: true,
      })
      log('created funnel advertorial deployment')
    }
  }

  log('done.')
  process.exit(0)
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err)
  process.exit(1)
})
