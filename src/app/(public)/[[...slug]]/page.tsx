import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { resolveSiteByHost } from '@/lib/site-resolver'
import { classifyHost, isMarketingHost, appOrigin, marketingOrigin } from '@/lib/pageflo/hosts'
import { legalFacts } from '@/lib/pageflo/legal'
import {
  resolveQuizDeployment,
  quizDeploymentMeta,
  deploymentUrl,
  type ResolvedQuizDeployment,
} from '@/lib/quiz-deployment'
import { QuizRuntime } from '@/components/public/quiz/QuizRuntime'
import {
  resolveLpDeployment,
  lpDeploymentMeta,
  type ResolvedLpDeployment,
} from '@/lib/lp-deployment'
import { LivePreview as LandingPageSections } from '@/components/builder/lp/render'
import { renderTemplateVars, applyTemplateOverrides, deepRenderTemplateVars, type SiteForTemplate } from '@/lib/template-vars'
import { resolvePhoneForPath } from '@/lib/resolve-phone'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'
import { MarketingSite } from '@/components/marketing/MarketingSite'
import { PrivacyPolicy } from '@/components/marketing/PrivacyPolicy'
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/pageflo/product'
import { BlockRenderer, type Block, type SiteForRender } from '@/components/blocks/BlockRenderer'
import { SiteScripts, type TrackingConfigShape } from '@/components/public/SiteScripts'
import CmcAdvertisingDisclosure from '@/components/public/check-my-claim/AdvertisingDisclosure'
import CmcPrivacyPolicy from '@/components/public/check-my-claim/PrivacyPolicy'
import CmcTermsOfService from '@/components/public/check-my-claim/TermsOfService'
import CmcSubmitted from '@/components/public/check-my-claim/Submitted'
import CmcThanks from '@/components/public/check-my-claim/Thanks'
import CmcSorry from '@/components/public/check-my-claim/Sorry'
import CmcPartnerList from '@/components/public/check-my-claim/PartnerList'
import CmcSb37List from '@/components/public/check-my-claim/Sb37List'

// Map of normalized path → custom component for the check-my-claim brand.
// Path comparison is case-insensitive (live site accepts /PartnerList and /partnerlist).
//
// '/' is INTENTIONALLY omitted so the Home page falls through to the Pages
// collection and its body_blocks render via BlockRenderer. This is what makes
// the /admin Pages editor and the public Home page share a single source of
// truth — what you save in /admin renders for visitors.
//
// The bespoke CheckMyClaimHome component that used to live here was deleted:
// an unrouted component kept "as a historical reference" is dead code, and git
// is the reference. Its section designs live on in the BlockRenderer ports and
// in bespoke-css.ts.
//
// The entries below are the same problem at an earlier stage. They are one
// tenant's content living as source code, and they only render for that tenant
// when no authored Page claims the path. They should be migrated into Pages or
// SharedLegalTemplates for that Site and then deleted.
const CMC_PAGES: Record<string, () => ReactNode> = {
  '/partnerlist': CmcPartnerList,
  '/partners': CmcPartnerList,
  '/submitted': CmcSubmitted,
  '/thanks': CmcThanks,
  '/sorry': CmcSorry,
  '/sb-37-list': CmcSb37List,
  '/privacypolicy': CmcPrivacyPolicy,
  '/privacy-policy': CmcPrivacyPolicy,
  '/privacy': CmcPrivacyPolicy,
  '/termsofservice': CmcTermsOfService,
  '/terms-of-service': CmcTermsOfService,
  '/terms': CmcTermsOfService,
  '/advertisingdisclosure': CmcAdvertisingDisclosure,
  '/disclosures': CmcAdvertisingDisclosure,
}

const hasLeadFormBlock = (blocks: unknown[] | null | undefined): boolean => {
  if (!Array.isArray(blocks)) return false
  return blocks.some((b) => typeof b === 'object' && b !== null && (b as { blockType?: string }).blockType === 'lead_form')
}

const loadTrackingConfig = async (siteId: string | number): Promise<TrackingConfigShape | null> => {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'tracking-configs',
    where: { site: { equals: siteId } },
    limit: 1,
    overrideAccess: true,
  })
  const tc = res.docs[0]
  if (!tc) return null
  return {
    meta_pixel: tc.meta_pixel,
    google_ads: tc.google_ads as TrackingConfigShape['google_ads'],
    ga4: tc.ga4,
    tiktok: tc.tiktok,
    gtm: tc.gtm,
    trustedform: tc.trustedform,
    jornaya: tc.jornaya,
  }
}

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug?: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Per-deployment metadata.
 *
 * Only quiz deployments produce tags here; every other path returns `{}` and
 * keeps whatever the layout already sets, so adding this cannot change how an
 * existing page presents itself. The lookup is the same React-cached call the
 * body makes, so a deployment page costs one resolution total, not two, and
 * the crawler's <title> is guaranteed to describe the document the visitor is
 * served.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const path = normalizePath(slug)
  const h = await headers()
  const host = h.get('x-pageflo-host') ?? h.get('x-legalos-host') ?? h.get('host') ?? ''
  const hostRole = classifyHost(host)

  // PageFlo's own hosts describe PageFlo, not a tenant. The console is
  // explicitly noindex: it is an authenticated application and nothing about it
  // belongs in a search result.
  if (hostRole !== 'tenant') {
    if (!isMarketingHost(host)) {
      return { title: `${PRODUCT_NAME} Console`, robots: { index: false, follow: false } }
    }
    const origin = marketingOrigin() || `https://${host}`
    if (path === '/privacy') {
      return legalFacts()
        ? {
            title: `Privacy Policy — ${PRODUCT_NAME}`,
            description: `How ${PRODUCT_NAME} handles operator, customer and lead information.`,
            alternates: { canonical: `${origin}/privacy` },
            robots: { index: true, follow: true },
          }
        : { robots: { index: false, follow: false } }
    }
    if (path !== '/') return {}
    return {
      title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
      description: PRODUCT_DESCRIPTION,
      alternates: { canonical: `${origin}/` },
      robots: { index: true, follow: true },
      openGraph: {
        type: 'website',
        siteName: PRODUCT_NAME,
        title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
        description: PRODUCT_DESCRIPTION,
        url: `${origin}/`,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
        description: PRODUCT_DESCRIPTION,
      },
    }
  }

  const resolved = await resolveSiteByHost(host)
  if (!resolved?.siteId) return {}

  const payload = await getPayload({ config })

  // Resolution order MUST match the body's, or the tags describe a different
  // document than the one served. The body tries an authored Page FIRST and
  // only then a deployment, so this does too. It previously checked
  // deployments first, which meant a path claimed by both was rendered as the
  // Page and described as the deployment.
  const site = await payload.findByID({
    collection: 'sites',
    id: resolved.siteId,
    overrideAccess: true,
    depth: 0,
  }).catch(() => null) as { name?: string | null; status?: string } | null

  // A draft or archived Site serves nothing, so it must not advertise a title
  // either. Anything else would put an unpublished brand into a link preview.
  if (!site || site.status === 'draft' || site.status === 'archived') return {}

  const brandFallback = site.name || undefined

  // Same visibility rule the body uses for public requests: published, or
  // scheduled with the time already passed.
  const nowIso = new Date().toISOString()
  const visible: Where = {
    or: [
      { status: { equals: 'published' } },
      { and: [{ status: { equals: 'scheduled' } }, { publish_at: { less_than_equal: nowIso } }] },
    ],
  }

  const pageDoc = (
    await payload.find({
      collection: 'pages',
      where: {
        and: [
          { site: { equals: resolved.siteId } },
          visible,
          { slug: { in: [path, path.replace(/^\//, '')] } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      // Only the tag fields, so adding metadata does not double the cost of
      // rendering a page.
      select: { title: true, meta_title: true, meta_description: true, og_image_url: true },
    }).catch(() => ({ docs: [] as Array<Record<string, unknown>> }))
  ).docs[0] as
    | { title?: string | null; meta_title?: string | null; meta_description?: string | null; og_image_url?: string | null }
    | undefined

  const url = deploymentUrl(host, path)

  if (pageDoc) {
    const title = pageDoc.meta_title || [pageDoc.title, brandFallback].filter(Boolean).join(' | ') || brandFallback
    const description = pageDoc.meta_description || undefined
    const image = pageDoc.og_image_url || undefined
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: 'website',
        title,
        description,
        url,
        siteName: brandFallback,
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    }
  }

  const dep = await resolveQuizDeployment(Number(resolved.siteId), host, path, false)
  const lp = dep ? null : await resolveLpDeployment(Number(resolved.siteId), host, path, false)

  if (!dep && !lp) {
    // Nothing authored at this path. A shared legal template or a fallback
    // still renders, so the brand name is better than no title at all: an
    // untitled page is what a search engine and a link preview both punish.
    return brandFallback
      ? { title: brandFallback, alternates: { canonical: url }, openGraph: { type: 'website', title: brandFallback, url, siteName: brandFallback } }
      : {}
  }

  const meta = dep ? quizDeploymentMeta(dep) : lpDeploymentMeta(lp!)
  const brandName = dep ? dep.brand.displayName : lp!.brand.displayName
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: meta.title,
      description: meta.description,
      url,
      siteName: brandName || undefined,
      ...(meta.image ? { images: [{ url: meta.image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      ...(meta.image ? { images: [meta.image] } : {}),
    },
  }
}

const normalizePath = (segments: string[] | undefined): string => {
  if (!segments || segments.length === 0) return '/'
  return `/${segments.join('/')}`
}

const isSharedTemplatePath = (path: string): boolean => {
  const map: Record<string, string> = {
    '/': 'home',
    '/privacy': 'privacy',
    '/privacy-policy': 'privacy-policy',
    '/terms-of-service': 'terms',
    '/terms': 'terms',
    '/partners': 'partners',
    '/submitted': 'submitted',
    '/thanks': 'thanks-dq',
    '/tcpa': 'tcpa',
    '/disclosures': 'disclosures',
  }
  return path in map
}

const sharedTemplateKeyForPath = (path: string): string | null => {
  const map: Record<string, string> = {
    '/privacy': 'privacy',
    '/privacy-policy': 'privacy-policy',
    '/terms-of-service': 'terms',
    '/terms': 'terms',
    '/partners': 'partners',
    '/submitted': 'submitted',
    '/thanks': 'thanks-dq',
    '/tcpa': 'tcpa',
    '/disclosures': 'disclosures',
  }
  return map[path] ?? null
}

export default async function PublicCatchAll({ params, searchParams }: Props) {
  const { slug } = await params
  const path = normalizePath(slug)
  // ?embed=1 renders a quiz deployment without page chrome, for the iframe the
  // embed script injects. It affects nothing else on the public router.
  const embedMode = (await searchParams)?.embed === '1'
  const h = await headers()
  const rawPreviewSiteSlug = h.get('x-pageflo-preview-site') ?? h.get('x-legalos-preview-site')
  const previewMode = (h.get('x-pageflo-preview') ?? h.get('x-legalos-preview')) === '1'
  const host = h.get('x-pageflo-host') ?? h.get('x-legalos-host') ?? h.get('host')

  // Both preview channels (?site=<slug> and ?preview=1) are admin-only. Resolve
  // the user once, up front, so an anonymous visitor can never use a preview
  // header to view another Site or its draft / paused content. An unauthenticated
  // ?site= is ignored entirely and falls back to normal host resolution.
  //
  // The user is also resolved when no preview flag is present, because a draft
  // Site must still be viewable by the people who own it. Without that, a Site
  // created in the builder returns 404 on its own preview domain and nothing
  // explains why, which is exactly the trap this codebase is meant to avoid.
  const wantsPreview = previewMode || Boolean(rawPreviewSiteSlug)

  // Resolved for a preview request, and otherwise only when a session cookie is
  // actually present. payload.auth() is a real verification, and running it for
  // every anonymous visitor to a public marketing page would be a cost paid on
  // the busiest path in the system to answer a question almost always no.
  const hasSessionCookie = (h.get('cookie') ?? '').includes('payload-token')
  const authedUser = wantsPreview || hasSessionCookie ? await getCurrentUser() : null
  const previewSiteSlug = authedUser ? rawPreviewSiteSlug : null

  // PageFlo's own hosts, resolved before any Domains lookup so a `Domains` row
  // can never claim the marketing site or the console. `?site=<slug>` is an
  // authenticated tenant preview and deliberately still wins, which is how an
  // operator previews a Site from the console host.
  if (!previewSiteSlug) {
    const hostRole = classifyHost(host)
    if (!host || hostRole !== 'tenant') {
      if (isMarketingHost(host)) {
        if (path === '/privacy') {
          const facts = legalFacts()
          // Fail closed. Until the operating business supplies its legal facts
          // there is no policy to publish, and a policy with a hole in it is
          // worse than no page. See src/lib/pageflo/legal.ts.
          if (!facts) notFound()
          return <PrivacyPolicy facts={facts} appUrl={appOrigin()} />
        }
        // A legacy console host served the marketing page at every path before
        // the rebrand. Preserved so nothing a visitor currently reaches starts
        // returning 404 mid-migration. The dedicated marketing host is stricter.
        if (path === '/' || hostRole === 'legacy-app') {
          return <MarketingSite appUrl={appOrigin()} />
        }
        notFound()
      }
      // A dedicated console host has no public surface. `/` goes to the
      // application, which sends an unauthenticated visitor to sign-in.
      if (path === '/') redirect('/admin')
      notFound()
    }
  }

  const payload = await getPayload({ config })

  let siteId: string | number | null = null
  if (previewSiteSlug) {
    const matches = await payload.find({
      collection: 'sites',
      where: { slug: { equals: previewSiteSlug } },
      limit: 1,
      overrideAccess: true,
    })
    siteId = matches.docs[0]?.id ?? null
  } else {
    const resolved = await resolveSiteByHost(host)
    if (resolved?.redirectTo) {
      const target = `https://${resolved.redirectTo}${path}`
      redirect(target)
    }
    siteId = resolved?.siteId ?? null
  }

  // An unresolvable host is not PageFlo's marketing site. Rendering the product
  // page for it advertised PageFlo on every misconfigured or hostile Host
  // header, and disagreed with robots.txt, which already answered `Disallow: /`
  // for the same request.
  if (!siteId) {
    notFound()
  }

  const site = (await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })) as SiteForTemplate & {
    id: string | number
    name?: string | null
    status?: string
  }

  // Someone bound to this Site may view it before it is published, on its own
  // domain, without knowing to append a query string. This requires a real
  // session AND a binding to THIS Site, so it grants nothing to an anonymous
  // visitor and nothing across tenants. A super admin is bound to everything by
  // definition.
  const ownsThisSite = isBoundToSite(authedUser, site.id)

  // Both preview bypasses require that binding too.
  //
  // They previously required only that SOME user was logged in: `?site=<slug>`
  // selected any tenant by slug, and `?preview=1` relaxed the content filter on
  // any host. Either one let any authenticated user of any tenant read another
  // brand's draft and scheduled content. `isBoundToSite` was already computed
  // here and fed only the same-host case, so the check existed and the bypasses
  // simply did not consult it.
  const isAdminPreview = ownsThisSite && (Boolean(previewSiteSlug) || previewMode)
  const maySeeUnpublished = ownsThisSite

  if (site.status === 'archived') notFound()
  if (site.status === 'draft' && !maySeeUnpublished) notFound()
  if (site.status === 'paused' && !maySeeUnpublished) {
    return <PausedSite name={site.name ?? 'This site'} />
  }

  const siteSlug = (site as { slug?: string }).slug

  // Pages are visible publicly if status='published', OR if status='scheduled'
  // and publish_at has already passed. Captured once so the Pages + redirect
  // queries below stay terse. In an authenticated admin preview we relax this
  // to 'any non-archived status' so draft / scheduled / paused content also
  // renders — that's the whole point of the Preview button in the builder.
  const nowIso = new Date().toISOString()
  const publishedOrLive: Where = isAdminPreview
    ? { status: { not_equals: 'archived' } }
    : {
        or: [
          { status: { equals: 'published' } },
          {
            and: [
              { status: { equals: 'scheduled' } },
              { publish_at: { less_than_equal: nowIso } },
            ],
          },
        ],
      }

  // 1. Look for an explicit Page that matches this path.
  const slugVariants = [path, path.replace(/^\//, '')]
  const explicit = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { site: { equals: siteId } },
        publishedOrLive,
        { slug: { in: slugVariants } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  if (explicit.docs[0]) {
    return <RenderPage page={explicit.docs[0] as unknown as RenderPageDoc} site={site} path={path} />
  }

  // 1b. Brand-specific hardcoded fallback. Authored Pages above always win,
  // so this only ever fires for CMC paths the author hasn't written a Page
  // for yet. Skipped entirely under any preview (?site= or ?preview=1) so
  // the builder never accidentally shows a hardcoded component instead of
  // the author's draft.
  if (siteSlug === 'check-my-claim' && !isAdminPreview) {
    const CmcComponent = CMC_PAGES[path.toLowerCase()]
    if (CmcComponent) {
      const tc = await loadTrackingConfig(site.id)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <SiteScripts tc={tc} hasForm={false} />
          <CmcComponent />
        </div>
      )
    }
  }

  // 2. Check slug_redirects on Pages collection for this Site.
  const redirected = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { site: { equals: siteId } },
        publishedOrLive,
        { 'slug_redirects.from': { in: slugVariants } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (redirected.docs[0]) {
    const newSlug = redirected.docs[0].slug
    redirect(newSlug.startsWith('/') ? newSlug : `/${newSlug}`)
  }

  // 3. If this is a known shared-template path, render the shared template wrapped in Site chrome.
  if (isSharedTemplatePath(path)) {
    const key = sharedTemplateKeyForPath(path)
    if (key) {
      const tpl = await payload.find({
        collection: 'shared-legal-templates',
        where: { template_key: { equals: key } },
        limit: 1,
        overrideAccess: true,
      })
      const t = tpl.docs[0]
      if (t) {
        const rendered = renderTemplateVars(t.body_markdown_with_vars, site)
        return <SharedTemplatePage title={t.default_meta_title ?? key} markdown={rendered} site={site} path={path} />
      }
    }
  }

  // 4. Try LandingPages.
  const lp = await payload.find({
    collection: 'landing-pages',
    where: {
      and: [
        { site: { equals: siteId } },
        { status: { equals: 'published' } },
        { slug: { in: slugVariants } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (lp.docs[0]) {
    return <RenderLandingPage lp={lp.docs[0] as unknown as RenderLPDoc} site={site} path={path} />
  }

  // 5. Try a funnel quiz deployment bound to this Site + path. This is what
  // makes a brandless quiz a real, separately crawlable page: its own URL, its
  // own brand, its own theme, its own metadata (see generateMetadata above).
  // An authored Page always wins, so a deployment can never shadow one.
  const quizDep = await resolveQuizDeployment(Number(siteId), host ?? '', path, isAdminPreview)
  if (quizDep) {
    const tc = await loadTrackingConfig(site.id)
    return <RenderQuizDeployment resolved={quizDep} tc={tc} embed={embedMode} site={site} />
  }

  // 6. Try a funnel landing-page deployment. Resolved after quiz deployments so
  // the order here matches generateMetadata's, which is what keeps the tags and
  // the document in agreement when a path is somehow claimed by both.
  const lpDep = await resolveLpDeployment(Number(siteId), host ?? '', path, isAdminPreview)
  if (lpDep) {
    const tc = await loadTrackingConfig(site.id)
    return <RenderLpDeployment resolved={lpDep} tc={tc} site={site} />
  }

  // 7. Try BlogPosts under /blog/<slug>.
  if (path.startsWith('/blog/')) {
    const blogSlug = path.slice('/blog/'.length)
    const post = await payload.find({
      collection: 'blog-posts',
      where: {
        and: [
          { site: { equals: siteId } },
          { status: { equals: 'published' } },
          { slug: { equals: blogSlug } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (post.docs[0]) {
      return (
        <article style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px' }}>
          <h1>{post.docs[0].title}</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{post.docs[0].body_markdown}</pre>
        </article>
      )
    }
  }

  notFound()
}

type RenderPageDoc = {
  uses_shared_template?: boolean
  template_key?: string
  shared_template_overrides?: Record<string, string> | null
  title: string
  body_blocks?: unknown[]
  hidden_blocks?: string[] | null
  block_meta?: Record<string, { hide_mobile?: boolean; hide_desktop?: boolean }> | null
  schema_json?: Record<string, unknown> | null
}

async function RenderPage({
  page,
  site,
  path,
}: {
  page: RenderPageDoc
  site: SiteForTemplate & { id: string | number }
  path: string
}) {
  const phone = await resolvePhoneForPath(path, site.id)

  // Shared legal template path
  if (page.uses_shared_template && page.template_key && page.template_key !== 'custom') {
    const payload = await getPayload({ config })
    const tpl = await payload.find({
      collection: 'shared-legal-templates',
      where: { template_key: { equals: page.template_key } },
      limit: 1,
      overrideAccess: true,
    })
    const t = tpl.docs[0]
    if (t) {
      const rendered = applyTemplateOverrides(
        renderTemplateVars(t.body_markdown_with_vars, site),
        page.shared_template_overrides ?? undefined,
      )
      return <SharedTemplatePage title={page.title} markdown={rendered} site={site} path={path} />
    }
  }

  // Custom blocks path: substitute {{site.*}} server-side then dispatch.
  // Filter out blocks the page author has marked as hidden in the builder.
  const hidden = new Set(Array.isArray(page.hidden_blocks) ? page.hidden_blocks : [])
  const pageBlocks = ((page.body_blocks ?? []) as Block[]).filter(
    (b) => !b.id || !hidden.has(b.id),
  )

  // Global nav + footer: if the page's body_blocks doesn't include a
  // nav_header / site_footer, fall back to the Site's globals. Authors set
  // these once per Site (via 'Save as Site default' on any nav_header /
  // site_footer block); we stash them inside brand_identity to avoid a
  // schema migration that was breaking prod.
  const hasNav = pageBlocks.some((b) => b.blockType === 'nav_header')
  const hasFooter = pageBlocks.some((b) => b.blockType === 'site_footer')
  const bi = ((site as { brand_identity?: Record<string, unknown> | null }).brand_identity || {}) as Record<string, unknown>
  const globalNav = bi.site_nav as Block | undefined
  const globalFooter = bi.site_footer as Block | undefined
  const blocksWithChrome: Block[] = [
    ...(!hasNav && globalNav && (globalNav as Block).blockType === 'nav_header'
      ? [{ ...(globalNav as Block), id: (globalNav as Block).id || 'site-nav' }]
      : []),
    ...pageBlocks,
    ...(!hasFooter && globalFooter && (globalFooter as Block).blockType === 'site_footer'
      ? [{ ...(globalFooter as Block), id: (globalFooter as Block).id || 'site-footer' }]
      : []),
  ]

  const renderedBlocks = deepRenderTemplateVars(blocksWithChrome, site)
  const tc = await loadTrackingConfig(site.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <SiteScripts tc={tc} hasForm={hasLeadFormBlock(renderedBlocks)} />
      {page.schema_json ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(page.schema_json) }}
        />
      ) : null}
      <BlockRenderer
        blocks={renderedBlocks}
        blockMeta={page.block_meta ?? undefined}
        ctx={{
          site: site as SiteForRender,
          phone: { display: phone.display, tel: phone.tel },
        }}
      />
    </div>
  )
}

/**
 * Render a shared legal template inside the Site's brand chrome.
 * We re-use the home page's nav_header + site_footer blocks so the legal page
 * does not appear as a naked Markdown document.
 */
async function SharedTemplatePage({
  title,
  markdown,
  site,
  path,
}: {
  title: string
  markdown: string
  site: SiteForTemplate & { id: string | number }
  path: string
}) {
  const phone = await resolvePhoneForPath(path, site.id)
  const payload = await getPayload({ config })
  const home = await payload.find({
    collection: 'pages',
    where: { and: [{ site: { equals: site.id } }, { slug: { in: ['/', ''] } }] },
    limit: 1,
    overrideAccess: true,
  })
  const homeBlocks = (home.docs[0]?.body_blocks ?? []) as Block[]
  const homeBlocksRendered = deepRenderTemplateVars(homeBlocks, site)
  const navHeader = homeBlocksRendered.find((b) => (b as Block).blockType === 'nav_header')
  const siteFooter = homeBlocksRendered.find((b) => (b as Block).blockType === 'site_footer')
  const ctx = {
    site: site as SiteForRender,
    phone: { display: phone.display, tel: phone.tel },
  }
  const tc = await loadTrackingConfig(site.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <SiteScripts tc={tc} hasForm={false} />
      {navHeader ? <BlockRenderer blocks={[navHeader as Block]} ctx={ctx} /> : null}
      <main style={{ flex: 1, padding: '64px 0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, color: 'var(--site-ink)', margin: 0 }}>{title}</h1>
          <article
            style={{ marginTop: 32, color: 'var(--site-ink)', lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
          />
        </div>
      </main>
      {siteFooter ? <BlockRenderer blocks={[siteFooter as Block]} ctx={ctx} /> : null}
    </div>
  )
}

function markdownToHtml(md: string): string {
  // Block-level: headings, paragraphs, simple lists. Avoids a Markdown library dependency.
  const blocks = md.trim().split(/\n{2,}/)
  return blocks
    .map((block) => {
      const trimmed = block.trim()
      const h = trimmed.match(/^(#{1,6})\s+(.+)$/)
      if (h) {
        const level = h[1].length
        return `<h${level} style="font-weight:800;color:var(--site-ink);margin-top:32px;font-size:${Math.max(16, 32 - level * 4)}px;">${escapeHtml(h[2])}</h${level}>`
      }
      // Unordered list
      if (/^[-*]\s+/.test(trimmed)) {
        const items = trimmed.split(/\n/).map((line) => {
          const m = line.match(/^[-*]\s+(.+)$/)
          return m ? `<li>${inlineMd(m[1])}</li>` : ''
        }).join('')
        return `<ul style="padding-left:22px;margin:12px 0;">${items}</ul>`
      }
      // Ordered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = trimmed.split(/\n/).map((line) => {
          const m = line.match(/^\d+\.\s+(.+)$/)
          return m ? `<li>${inlineMd(m[1])}</li>` : ''
        }).join('')
        return `<ol style="padding-left:22px;margin:12px 0;">${items}</ol>`
      }
      return `<p style="margin:12px 0;">${inlineMd(trimmed.replace(/\n/g, '<br />'))}</p>`
    })
    .join('')
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--site-primary);">$1</a>')
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

type RenderLPDoc = {
  name: string
  hero?: { eyebrow?: string | null; heading?: string; sub?: string | null } | null
  body_sections?: Array<{ heading?: string | null; body_markdown?: string | null }> | null
}

async function RenderLandingPage({
  lp,
  site,
  path,
}: {
  lp: RenderLPDoc
  site: SiteForTemplate & { id: string | number }
  path: string
}) {
  const phone = await resolvePhoneForPath(path, site.id)
  return (
    <article style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px' }}>
      {lp.hero?.eyebrow ? <p style={{ color: 'var(--site-accent)', fontWeight: 600 }}>{lp.hero.eyebrow}</p> : null}
      <h1>{lp.hero?.heading ?? lp.name}</h1>
      {lp.hero?.sub ? <p style={{ fontSize: 18, color: 'var(--site-muted)' }}>{lp.hero.sub}</p> : null}
      {(lp.body_sections ?? []).map((s, i) => (
        <section key={i} style={{ marginTop: 32 }}>
          {s.heading ? <h2>{s.heading}</h2> : null}
          {s.body_markdown ? <pre style={{ whiteSpace: 'pre-wrap' }}>{s.body_markdown}</pre> : null}
        </section>
      ))}
      {phone.display ? (
        <p style={{ marginTop: 32, color: 'var(--site-muted)' }}>
          Speak with us at <a href={`tel:${phone.tel}`}>{phone.display}</a>
        </p>
      ) : null}
    </article>
  )
}

/**
 * Render a funnel quiz deployment as a standalone public page.
 *
 * TrustedForm and Jornaya are requested with `hasForm` — a quiz collects
 * contact details exactly like a lead form does, and the pipeline claims the
 * cert on submit, so the scripts have to be on the page from the start rather
 * than injected at the last step.
 */
function RenderQuizDeployment({
  resolved,
  tc,
  embed,
  site,
}: {
  resolved: ResolvedQuizDeployment
  tc: TrackingConfigShape | null
  embed: boolean
  site: SiteForTemplate & { id: string | number; name?: string | null }
}) {
  const siteSlug = (site as { slug?: string }).slug ?? resolved.siteSlug
  return (
    <>
      <SiteScripts tc={tc} hasForm />
      <QuizRuntime
        quiz={resolved.quiz}
        brand={resolved.brand}
        deployment={resolved.deployment}
        site={{ slug: siteSlug, name: site.name ?? null }}
        embed={embed || resolved.deployment.renderMode === 'embed'}
      />
    </>
  )
}

/**
 * Render a funnel landing page as a public page.
 *
 * The sections come from the same renderer the builder uses, with `editable`
 * off so the click-to-edit affordances and preview framing are gone. The hero's
 * quiz is the REAL quiz deployment - `preview: false` is what switches it from
 * "click through safely" to "this writes a lead" - and it is themed by its own
 * deployment while deriving its text colours against the landing page's
 * surface, so it reads as part of the page rather than pasted onto it.
 */
function RenderLpDeployment({
  resolved,
  tc,
  site,
}: {
  resolved: ResolvedLpDeployment
  tc: TrackingConfigShape | null
  site: SiteForTemplate & { id: string | number; name?: string | null }
}) {
  const siteSlug = (site as { slug?: string }).slug ?? resolved.siteSlug
  const quizCtx = resolved.quiz
    ? {
        deployment: resolved.quiz.deployment,
        brand: resolved.quiz.brand,
        site: { slug: siteSlug, name: site.name ?? null },
        preview: false,
      }
    : null

  return (
    <>
      <SiteScripts tc={tc} hasForm={Boolean(resolved.quiz)} />
      <LandingPageSections
        landingPage={resolved.landingPage}
        brand={resolved.brand}
        quiz={resolved.quiz?.quiz ?? null}
        quizDepLabel={resolved.quiz?.deployment?.name ?? undefined}
        // The single difference between this and the builder. With it false no
        // click handler is attached, no hover affordance is drawn, and unfilled
        // nodes are dropped rather than shown as placeholders.
        editable={false}
        // The template's own copy with THIS deployment's copy on top. Overrides
        // only: a slot with no entry in either renders the stock template's
        // wording, which is what lets one template run under three brands saying
        // three different things without a copy of the markup per deployment.
        // Merged in the resolver so the metadata pass and the render agree.
        slotOverrides={resolved.composedOverrides}
        // The landing-page renderer is a ported artifact carrying @ts-nocheck, so
        // its prop types are inferred from default values rather than declared:
        // `quizCtx = null` infers as `null`. The cast documents that the shape is
        // enforced by the resolver above, not by this component's signature.
        quizCtx={quizCtx as never}
      />
    </>
  )
}

function PausedSite({ name }: { name: string }) {
  return (
    <main style={{ maxWidth: 600, margin: '120px auto', padding: '0 24px', textAlign: 'center' }}>
      <h1>{name} is temporarily unavailable</h1>
      <p style={{ color: 'var(--site-muted)' }}>We will be back shortly. Thanks for your patience.</p>
    </main>
  )
}
