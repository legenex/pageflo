import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { siteToBrand, type DomainLite } from './brand-map'
import { normalizeDeploymentPath } from './quiz-deployment-path'
import { isClaimedByAuthoredContent, pathVariantsFor } from './public-path-claims'
import { resolveQuizDeploymentById, type ResolvedQuizDeployment } from './quiz-deployment'
import { resolveForRender, reportTemplateFallback } from './template-registry'

/**
 * Server-side resolution of a public funnel landing page.
 *
 * The shape mirrors quiz deployments exactly, and for the same reason: the
 * authoring record is brandless (sections and copy only) and the deployment
 * binds it to a Site, a domain, a path, and the quiz it runs. One landing page
 * can therefore run under several brands, each with its own quiz.
 *
 * The quiz embedded in the hero is resolved through the SAME code path a
 * standalone quiz deployment uses, so the quiz a visitor answers inside a
 * landing page is the real deployment - its theme, its destinations, its lead
 * delivery - and not a second, parallel implementation that could drift.
 */

export type PublicLandingPage = {
  id: string
  name: string
  slug: string
  /** Canonical: aliases already resolved, never a raw stored value. */
  templateId: string
  /**
   * True when the stored id named no template and a stand-in was drawn. Carried
   * on the resolved object rather than only logged, so a preflight can refuse to
   * publish a page whose template does not exist and the builder can badge it.
   */
  templateFellBack: boolean
  /** The id that was stored, when it differs from what rendered. */
  requestedTemplateId: string
  angle: string
  sections: unknown[]
}

export type PublicLpDeployment = {
  id: string
  name: string
  path: string
  status: string
  quizDeploymentId: string
  /**
   * This deployment's own copy, keyed by the template's slot ids.
   *
   * Overrides only. A slot with no entry renders the stock template's wording,
   * so one landing page under three brands can say three different things
   * without three copies of the markup existing anywhere.
   */
  contentOverrides: Record<string, string>
}

export type ResolvedLpDeployment = {
  deployment: PublicLpDeployment
  landingPage: PublicLandingPage
  brand: ReturnType<typeof siteToBrand>
  /** The quiz that runs in the hero, already themed. Null when none is linked. */
  quiz: ResolvedQuizDeployment | null
  siteId: number
  siteSlug: string
}

const relId = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? String((v as { id: unknown }).id ?? '') : String(v)

/**
 * Coerce a stored jsonb override bag into the string map the composer takes.
 *
 * Non-string values are DROPPED rather than stringified. A number that reached
 * this column is a bug upstream, and `String(123)` on a page is that bug going
 * unnoticed; `composeTemplate` then falls back to the template's own copy, which
 * is the safe reading of "we do not have a value for this".
 */
const normalizeOverrides = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

const resolveLpDeploymentUncached = async (
  siteId: number,
  host: string,
  path: string,
  includeUnpublished: boolean,
): Promise<ResolvedLpDeployment | null> => {
  const normalized = normalizeDeploymentPath(path)
  // Root belongs to the Site's home Page. Bailing here keeps the extra query
  // off the hottest public path.
  if (normalized === '/') return null

  const payload = await getPayload({ config })
  const pathVariants = pathVariantsFor(normalized)

  let deps
  try {
    deps = await payload.find({
      collection: 'funnel-lp-deployments',
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
    // The funnel_* tables are the open F001 drift. On a database where the
    // migration has not run they do not exist, and a missing table would turn
    // every unmatched public path into a 500 rather than a 404.
    return null
  }

  if (deps.docs.length === 0) return null

  // Authored content always wins the path, and the check has to happen in the
  // resolver so generateMetadata and the render agree. See public-path-claims.
  if (await isClaimedByAuthoredContent(payload, siteId, normalized)) return null

  // An explicit domain binding beats a Site-wide match, same rule as quizzes.
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

  const lpId = relId(doc.landing_page)
  if (!lpId) return null

  const lpDoc = await payload
    .findByID({ collection: 'funnel-landing-pages', id: lpId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!lpDoc) return null

  // The parent landing page gates every deployment of it, exactly as a quiz
  // gates its own deployments: unpublishing the page must stop traffic
  // everywhere, not only where someone remembered to pause a deployment.
  if (!includeUnpublished && !lpDoc.is_published) return null

  const sections = Array.isArray(lpDoc.sections) ? (lpDoc.sections as unknown[]) : []
  if (sections.length === 0) return null

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

  const quizDeploymentId = String(doc.quiz_deployment_id ?? '')
  const quiz = quizDeploymentId
    ? await resolveQuizDeploymentById(quizDeploymentId, siteId, includeUnpublished)
    : null

  // Resolved here, once, rather than by whichever renderer reads the row. The
  // template id travels canonical from this point, so the metadata pass, the
  // render and any preflight all agree, and a stored id that names nothing is
  // written to the log instead of quietly becoming template zero.
  const templateRes = reportTemplateFallback(
    `lp deployment ${doc.id}`,
    resolveForRender('lp', lpDoc.template_id),
  )

  return {
    deployment: {
      id: String(doc.id),
      name: String(doc.name ?? ''),
      path: normalizeDeploymentPath(String(doc.path ?? '')),
      status: String(doc.status ?? 'draft'),
      quizDeploymentId,
      contentOverrides: normalizeOverrides(doc.content_overrides),
    },
    landingPage: {
      id: String(lpDoc.id),
      name: String(lpDoc.name ?? ''),
      slug: String(lpDoc.slug ?? ''),
      templateId: templateRes.template.id,
      templateFellBack: templateRes.usedFallback,
      requestedTemplateId: templateRes.requestedId,
      angle: String(lpDoc.angle ?? 'pain'),
      sections,
    },
    brand: siteToBrand(siteDoc as unknown as Record<string, unknown>, domainList),
    quiz,
    siteId,
    siteSlug: String(siteDoc.slug ?? ''),
  }
}

/**
 * Request-scoped memo, so generateMetadata and the page body resolve once and
 * cannot describe two different documents.
 */
export const resolveLpDeployment = cache(resolveLpDeploymentUncached)

/**
 * Crawler-facing description of a landing page.
 *
 * Copy is taken from what the author already wrote in the hero, so a landing
 * page is shareable without a separate SEO step. Two deployments of one page
 * under different brands still differ, because the brand name is part of it.
 */
export const lpDeploymentMeta = (
  resolved: ResolvedLpDeployment,
): { title: string; description: string; image: string | null } => {
  const { landingPage, brand, deployment } = resolved

  const hero = (landingPage.sections as Array<Record<string, unknown>>).find(
    (s) => s && s.type === 'hero',
  )
  const copy = (hero?.copy ?? {}) as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const brandName = brand.displayName || brand.name || ''
  const headline = str(copy.headline) || deployment.name || landingPage.name
  const title = [headline, brandName].filter(Boolean).join(' | ')
  const description =
    str(copy.subheadline) ||
    str(copy.sub) ||
    brand.tagline ||
    `Find out where you stand${brandName ? ` with ${brandName}` : ''}. Takes about a minute.`

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    image: brand.logoUrl || null,
  }
}
