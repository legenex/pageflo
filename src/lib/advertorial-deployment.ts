import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { siteToBrand, type DomainLite } from './brand-map'
import { normalizeDeploymentPath } from './quiz-deployment-path'
import { isClaimedByAuthoredContent, pathVariantsFor } from './public-path-claims'
import { resolveQuizDeploymentById, type ResolvedQuizDeployment } from './quiz-deployment'
import { advertorialChrome, type AdvertorialTemplateId } from './advertorial-templates'

/**
 * Server-side resolution of a public funnel advertorial.
 *
 * Mirrors landing-page and quiz deployments: the authoring record is
 * brand-neutral, and the deployment binds it to a Site, a domain, a path, and
 * an optional quiz used for CTAs. generateMetadata and the page body call the
 * same cached function so a crawler cannot describe a different document than
 * the visitor is served.
 */

export type PublicAdvertorial = {
  id: string
  title: string
  slug: string
  templateId: AdvertorialTemplateId
  sections: unknown[]
}

export type PublicAdvertorialDeployment = {
  id: string
  name: string
  path: string
  status: string
  ctaMode: 'button' | 'embed'
  quizDeploymentId: string
}

export type ResolvedAdvertorialDeployment = {
  deployment: PublicAdvertorialDeployment
  advertorial: PublicAdvertorial
  brand: ReturnType<typeof siteToBrand>
  quiz: ResolvedQuizDeployment | null
  quizLink: { domain: string; path: string; name: string } | null
  siteId: number
  siteSlug: string
}

export const ADVERTORIAL_REFUSED = '[advertorial-deployment] refused'

const relId = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? String((v as { id: unknown }).id ?? '') : String(v)

const resolveAdvertorialDeploymentUncached = async (
  siteId: number,
  host: string,
  path: string,
  includeUnpublished: boolean,
): Promise<ResolvedAdvertorialDeployment | null> => {
  const normalized = normalizeDeploymentPath(path)
  if (normalized === '/') return null

  const payload = await getPayload({ config })
  const pathVariants = pathVariantsFor(normalized)

  let deps
  try {
    deps = await payload.find({
      collection: 'funnel-advertorial-deployments',
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
    // Missing funnel tables must 404, not 500, the same way LP/quiz resolvers do.
    return null
  }

  if (deps.docs.length === 0) return null

  if (await isClaimedByAuthoredContent(payload, siteId, normalized)) return null

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

  const advId = relId(doc.advertorial)
  if (!advId) return null

  const advDoc = await payload
    .findByID({ collection: 'funnel-advertorials', id: advId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!advDoc) return null

  if (!includeUnpublished && advDoc.status !== 'published') return null

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

  const quizHost =
    quiz?.brand.__domains.find((d) => d.primary)?.host ||
    quiz?.brand.primaryDomain ||
    reqHost
  const quizLink = quiz
    ? { domain: quizHost, path: quiz.deployment.path, name: quiz.quiz.name }
    : null

  const chrome = advertorialChrome(String(advDoc.template_id ?? ''))

  return {
    deployment: {
      id: String(doc.id),
      name: String(doc.name ?? ''),
      path: normalizeDeploymentPath(String(doc.path ?? '')),
      status: String(doc.status ?? 'draft'),
      ctaMode: doc.cta_mode === 'embed' ? 'embed' : 'button',
      quizDeploymentId,
    },
    advertorial: {
      id: String(advDoc.id),
      title: String(advDoc.title ?? ''),
      slug: String(advDoc.slug ?? ''),
      templateId: chrome.id,
      sections: Array.isArray(advDoc.sections) ? (advDoc.sections as unknown[]) : [],
    },
    brand: siteToBrand(siteDoc as unknown as Record<string, unknown>, domainList),
    quiz,
    quizLink,
    siteId,
    siteSlug: String(siteDoc.slug ?? ''),
  }
}

export const resolveAdvertorialDeployment = cache(resolveAdvertorialDeploymentUncached)

export const advertorialDeploymentMeta = (
  resolved: ResolvedAdvertorialDeployment,
): { title: string; description: string; image: string | null } => {
  const { advertorial, brand } = resolved
  const sections = advertorial.sections as Array<{ type?: string; content?: unknown }>
  const headline = sections.find((s) => s?.type === 'headline')
  const lede = sections.find((s) => s?.type === 'lede' || s?.type === 'paragraph')
  const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  const brandName = brand.displayName || brand.name || ''
  const title = [asText(headline?.content) || advertorial.title, brandName].filter(Boolean).join(' | ')
  const description =
    asText(lede?.content) ||
    brand.tagline ||
    `A report from ${brandName || 'this brand'}.`
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    image: brand.logoUrl || null,
  }
}
