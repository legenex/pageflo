import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { siteToBrand, type DomainLite } from './brand-map'
import { resolveForRender, reportTemplateFallback } from './template-registry'
import { normalizeDeploymentPath } from './quiz-deployment-path'
import { normalizeDestinations, type DestinationMap } from './quiz-destinations'
import { isClaimedByAuthoredContent, pathVariantsFor } from './public-path-claims'

export { normalizeDeploymentPath }

/**
 * Server-side resolution of a public quiz-deployment page.
 *
 * A deployment is what makes a brandless quiz appear as a real, separate page:
 * its own host + path, its own brand, its own theme, its own crawlable
 * metadata. This module is the single place that maps an incoming request onto
 * one, so the metadata pass and the render pass can never disagree about which
 * deployment is being served (they call the same cached function).
 *
 * Matching is on (site, path), not (domain, path). The public router already
 * resolves host -> Site as the one trusted host mapping, and reusing it means a
 * deployment is reachable on every domain the Site owns - the preview domain as
 * well as the custom domain - without a second host-parsing implementation that
 * could drift from the first. When several deployments share a path, the one
 * whose own domain matches the request host wins, so an explicit binding still
 * beats the general case.
 */

export type PublicQuizDeployment = {
  id: string
  name: string
  path: string
  renderMode: 'standalone' | 'embed'
  /** Canonical: aliases already resolved, never a raw stored value. */
  templateId: string
  /**
   * True when the stored id named no template and a stand-in was drawn. Carried
   * on the resolved object rather than only logged, so the publish preflight can
   * refuse it and the builder can badge it.
   */
  templateFellBack: boolean
  /** The id that was stored, when it differs from what rendered. */
  requestedTemplateId: string
  status: string
  embedPreviewBg: string
  headerConfig: Record<string, unknown> | null
  footerConfig: Record<string, unknown> | null
  bodySectionOverrides: unknown[] | null
  destinationOverrides: DestinationMap
  utm: Record<string, unknown>
  pixels: Record<string, unknown>
}

export type PublicQuiz = {
  id: string
  name: string
  slug: string
  tiers: unknown[]
  steps: unknown[]
  nodes: unknown[]
  customFields: unknown[]
}

export type ResolvedQuizDeployment = {
  deployment: PublicQuizDeployment
  quiz: PublicQuiz
  /** The brand, exactly as the brand record defines it. Ready to render. */
  brand: ReturnType<typeof siteToBrand>
  siteId: number
  siteSlug: string
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const relId = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? String((v as { id: unknown }).id ?? '') : String(v)

/**
 * Find the live deployment for this Site + path, if any.
 *
 * `includeUnpublished` is the authenticated-admin preview path: it allows a
 * draft or paused deployment, and a quiz whose parent is unpublished, to
 * render. It must only ever be passed `true` by a caller that has already
 * verified the request is authenticated - this function does not re-check.
 */
const resolveQuizDeploymentUncached = async (
  siteId: number,
  host: string,
  path: string,
  includeUnpublished: boolean,
): Promise<ResolvedQuizDeployment | null> => {
  const normalized = normalizeDeploymentPath(path)
  // Root is never a quiz deployment: the Site's home Page owns '/'. Bailing
  // here keeps the extra query off the single hottest public path.
  if (normalized === '/') return null

  const payload = await getPayload({ config })

  // Path variants so an author who typed '/S/MVA' or 's/mva' still resolves.
  const pathVariants = pathVariantsFor(normalized)

  let deps
  try {
    deps = await payload.find({
      collection: 'funnel-quiz-deployments',
      where: {
        and: [
          { site: { equals: siteId } },
          { path: { in: pathVariants } },
          ...(includeUnpublished ? [] : [{ status: { equals: 'live' } }]),
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    // The funnel_* tables are the open F001 drift: on a database where the
    // migration has not run they do not exist, and a missing table would
    // otherwise turn every unmatched public path into a 500 instead of a 404.
    // Treating it as "no deployment here" keeps the rest of the site serving.
    return null
  }

  if (deps.docs.length === 0) return null

  // Authored content always wins the path. Shared with the landing-page
  // resolver so both refuse the same set; see public-path-claims.ts for why
  // this check cannot live in the router.
  if (await isClaimedByAuthoredContent(payload, siteId, normalized)) return null

  // An explicit domain binding wins over a Site-wide match.
  const domainIds = Array.from(new Set(deps.docs.map((d) => relId(d.domain)).filter(Boolean)))
  let hostByDomainId = new Map<string, string>()
  if (domainIds.length > 0) {
    const domRes = await payload.find({
      collection: 'domains',
      where: { id: { in: domainIds } },
      limit: domainIds.length,
      depth: 0,
      overrideAccess: true,
    })
    hostByDomainId = new Map(domRes.docs.map((d) => [String(d.id), String(d.host ?? '').toLowerCase()]))
  }
  const reqHost = (host ?? '').toLowerCase().split(':')[0]
  const doc =
    deps.docs.find((d) => {
      const h = hostByDomainId.get(relId(d.domain))
      return h && h === reqHost
    }) ?? deps.docs[0]

  return hydrateQuizDeployment(payload, doc as unknown as Record<string, unknown>, siteId, includeUnpublished)
}

/**
 * Turn a raw deployment row into everything a renderer needs: its quiz, its
 * brand with the theme applied, and its destination overrides.
 *
 * Split out from path resolution because a landing page reaches a quiz
 * deployment by ID rather than by path, and both routes must produce an
 * identical object. A second hydration path is how a quiz would end up themed
 * one way on its own page and another way inside a landing page.
 */
const hydrateQuizDeployment = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  doc: Record<string, unknown>,
  siteId: number,
  includeUnpublished: boolean,
): Promise<ResolvedQuizDeployment | null> => {
  const quizId = relId(doc.quiz)
  if (!quizId) return null

  const quizDoc = await payload
    .findByID({ collection: 'funnel-quizzes', id: quizId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!quizDoc) return null

  // The parent quiz gates every deployment of it. An archived or unpublished
  // quiz must not serve traffic from a deployment that happens to still say
  // 'live' - the archive action unpublishes for exactly this reason, and this
  // is the second half of that guarantee, enforced at read time.
  if (!includeUnpublished && (!quizDoc.is_published || quizDoc.is_archived)) return null

  const siteDoc = await payload
    .findByID({ collection: 'sites', id: siteId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!siteDoc) return null

  const domRes = await payload.find({
    collection: 'domains',
    where: { site: { equals: siteId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const domainList: DomainLite[] = domRes.docs.map((d) => ({
    id: String(d.id ?? ''),
    host: String(d.host ?? ''),
    primary: Boolean(d.primary),
    status: typeof d.status === 'string' ? d.status : 'pending',
    sslStatus: typeof d.ssl_status === 'string' ? d.ssl_status : 'pending',
    kind: typeof d.kind === 'string' ? d.kind : undefined,
  }))

  // One resolution for the whole hydration, reported once. `resolveQuizTemplateId`
  // below used to be the only thing that looked at this id, and it answered
  // silently, so a deployment stored under a typo rendered as the neutral skin
  // with nothing anywhere recording that a choice had been discarded.
  const templateRes = reportTemplateFallback(
    `quiz deployment ${doc.id}`,
    resolveForRender('quiz', doc.template_id ?? 'default'),
  )

  const deployment: PublicQuizDeployment = {
    id: String(doc.id),
    name: String(doc.name ?? ''),
    path: normalizeDeploymentPath(String(doc.path ?? '')),
    renderMode: doc.render_mode === 'embed' ? 'embed' : 'standalone',
    templateId: templateRes.template.id,
    templateFellBack: templateRes.usedFallback,
    requestedTemplateId: templateRes.requestedId,
    status: String(doc.status ?? 'draft'),
    embedPreviewBg: String(doc.embed_preview_bg ?? ''),
    headerConfig: (doc.header_config ?? null) as Record<string, unknown> | null,
    footerConfig: (doc.footer_config ?? null) as Record<string, unknown> | null,
    bodySectionOverrides: Array.isArray(doc.body_section_overrides)
      ? (doc.body_section_overrides as unknown[])
      : null,
    destinationOverrides: normalizeDestinations(doc.destination_overrides),
    utm: (doc.utm ?? {}) as Record<string, unknown>,
    pixels: (doc.pixels ?? {}) as Record<string, unknown>,
  }

  const baseBrand = siteToBrand(siteDoc as unknown as Record<string, unknown>, domainList)

  return {
    // `deployment.templateId` is already canonical — resolved once above — so
    // there is no second resolution here to disagree with the first.
    deployment,
    quiz: {
      id: String(quizDoc.id),
      name: String(quizDoc.name ?? ''),
      slug: String(quizDoc.slug ?? ''),
      tiers: asArray(quizDoc.tiers),
      steps: asArray(quizDoc.steps),
      nodes: asArray(quizDoc.nodes),
      customFields: asArray(quizDoc.custom_fields),
    },
    brand: baseBrand,
    siteId,
    siteSlug: String(siteDoc.slug ?? ''),
  }
}

/**
 * A quiz embedded in a landing page, built from the LANDING PAGE'S OWN binding.
 *
 * The composition the product is made of is LP template x brand x FLOW x quiz
 * skin, and until now the only way to express it was to point at a standalone
 * quiz DEPLOYMENT — so embedding a quiz first required publishing a separate
 * public quiz page, at its own path, competing for a URL and needing to be kept
 * in step with the page that borrowed it.
 *
 * This synthesises the same `ResolvedQuizDeployment` the standalone path
 * produces, through the SAME `hydrateQuizDeployment`, so the embedded quiz is
 * themed, routed and delivered identically. There is one hydration path and one
 * composed object; a second one is how a quiz ends up behaving differently
 * inside a landing page than on its own.
 *
 * The synthetic row carries no path and no domain because it has none: it is not
 * separately reachable, which is the point.
 */
export const resolveEmbeddedQuiz = cache(async (
  args: {
    lpDeploymentId: string
    quizId: string
    siteId: number
    templateId: string
    progressForm: string | null
    includeUnpublished: boolean
  },
): Promise<ResolvedQuizDeployment | null> => {
  if (!args.quizId) return null
  const payload = await getPayload({ config })
  return hydrateQuizDeployment(
    payload,
    {
      // Namespaced so it can never collide with a real deployment id in a log,
      // a pixel payload or a lead row.
      id: `lp:${args.lpDeploymentId}`,
      name: '',
      quiz: args.quizId,
      site: args.siteId,
      domain: null,
      path: '',
      render_mode: 'embed',
      template_id: args.templateId,
      progress_form: args.progressForm,
      status: 'live',
      destination_overrides: null,
      header_config: {},
      footer_config: {},
      body_section_overrides: null,
      utm: {},
      pixels: {},
    },
    args.siteId,
    args.includeUnpublished,
  )
})

/**
 * Resolve a quiz deployment by its id, for a landing page that embeds one.
 *
 * The quiz deployment must belong to the SAME Site as the landing page. The
 * link is stored as a bare text id (the artifact's cross-reference style, with
 * no foreign key behind it), so nothing at the database level stops a landing
 * page for brand A pointing at a quiz deployment for brand B. Checking here is
 * what prevents one brand's page from running another brand's quiz - and, with
 * destinations now resolved from the deployment, sending its leads there too.
 */
export const resolveQuizDeploymentById = cache(async (
  deploymentId: string,
  siteId: number,
  includeUnpublished: boolean,
): Promise<ResolvedQuizDeployment | null> => {
  if (!deploymentId) return null
  const payload = await getPayload({ config })

  const doc = await payload
    .findByID({ collection: 'funnel-quiz-deployments', id: deploymentId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return null
  if (Number(relId(doc.site)) !== Number(siteId)) return null
  if (!includeUnpublished && doc.status !== 'live') return null

  return hydrateQuizDeployment(payload, doc as unknown as Record<string, unknown>, siteId, includeUnpublished)
})

/**
 * Request-scoped memo. generateMetadata and the page body both need the
 * deployment; React's cache() collapses that into one database round trip and
 * guarantees the crawler's <title> describes the same document the visitor
 * actually gets.
 */
export const resolveQuizDeployment = cache(resolveQuizDeploymentUncached)

/** Absolute URL of a deployment, used for canonical + og:url. */
export const deploymentUrl = (host: string, path: string): string =>
  `https://${(host ?? '').split(':')[0]}${normalizeDeploymentPath(path)}`

/**
 * Crawler-facing description of a deployment.
 *
 * This is the whole point of a deployment being a real page rather than a
 * preview: Facebook's scraper, Google, and a pasted link in a message all read
 * these tags, and two deployments of one quiz must describe themselves
 * differently or they collapse into the same link preview.
 *
 * The copy is derived from content the author already wrote - the deployment
 * name, the first question, the brand tagline - so there is nothing extra to
 * fill in for a deployment to be shareable.
 */
export const quizDeploymentMeta = (
  resolved: ResolvedQuizDeployment,
): { title: string; description: string; image: string | null } => {
  const { deployment, quiz, brand } = resolved

  const firstNode = (quiz.nodes as Array<Record<string, unknown>>).find(
    (n) => n && (n.type === 'question' || n.type === 'form'),
  )
  const fromNode = (key: string): string => {
    const v = firstNode?.[key]
    return typeof v === 'string' ? v.trim() : ''
  }

  const brandName = brand.displayName || brand.name || ''
  const headline = fromNode('headline') || fromNode('question') || quiz.name
  const title = [deployment.name || headline, brandName].filter(Boolean).join(' | ')

  const description =
    fromNode('subheadline') ||
    fromNode('tagline') ||
    brand.tagline ||
    `Answer a few quick questions to see if you qualify${brandName ? ` with ${brandName}` : ''}.`

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    image: brand.logoUrl || null,
  }
}
