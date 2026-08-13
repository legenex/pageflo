import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { siteToBrand, type DomainLite } from './brand-map'
import { normalizeDeploymentPath } from './quiz-deployment-path'
import { isClaimedByAuthoredContent, pathVariantsFor } from './public-path-claims'
import { resolveEmbeddedQuiz, resolveQuizDeploymentById, type ResolvedQuizDeployment } from './quiz-deployment'
import { recommendedQuizTemplateFor, resolveTemplate } from './template-registry'
import { asSlotted } from './lp-templates'

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
   * Always false on this side now: an unresolvable id refuses to serve instead
   * of drawing a stand-in. Kept because the shared publish preflight reads the
   * same field for both kinds of deployment.
   */
  templateFellBack: boolean
  /** The raw stored id, so a report can name what an operator actually wrote. */
  requestedTemplateId: string
  angle: string
  /** Node-renderer copy. Empty for the twelve ported templates, which use slots. */
  sections: unknown[]
  /** The TEMPLATE's own slot copy, before this deployment's overrides. */
  slotOverrides: Record<string, string>
}

export type PublicLpDeployment = {
  id: string
  name: string
  path: string
  status: string
  quizDeploymentId: string
  /**
   * The quiz FLOW this page runs, when it names one directly.
   *
   * Preferred over `quizDeploymentId`, which required a standalone quiz page to
   * exist before a landing page could embed anything.
   */
  quizId: string
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
  /**
   * The slot map the renderer must be given: template copy with the
   * deployment's copy layered on top. Precomputed so the two callers that
   * render a landing page cannot merge it two different ways.
   */
  composedOverrides: Record<string, string>
  brand: ReturnType<typeof siteToBrand>
  /** The quiz that runs in the hero, already themed. Null when none is linked. */
  quiz: ResolvedQuizDeployment | null
  siteId: number
  siteSlug: string
}

/**
 * One grep-able prefix for every reason a landing page declined to serve.
 *
 * These are refusals, not fallbacks. The old code drew SOMETHING for a bad
 * template id, so the only evidence was a page that looked wrong to whoever
 * happened to open it.
 */
export const LP_TEMPLATE_REFUSED = '[lp-deployment] refused'

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

  /*
   * The template is resolved BEFORE the content gate, because which content a
   * page needs depends on which renderer draws it.
   *
   * Strict, and no stand-in. `resolveForRender` used to hand back template zero
   * for an id that named nothing, which meant a landing page could serve a
   * different law firm's design than the one an operator chose and the only
   * evidence was that the page looked wrong. On a legal-advertising page,
   * serving nothing is the better side of that trade.
   */
  const templateRes = resolveTemplate('lp', lpDoc.template_id)
  if (!templateRes.ok || templateRes.template.kind !== 'lp') {
    console.warn(
      `${LP_TEMPLATE_REFUSED}: deployment ${doc.id} (page ${lpDoc.id}) stores template_id ` +
        `"${String(lpDoc.template_id ?? '')}" — ${templateRes.ok ? 'not a landing-page template' : templateRes.error}. Not served.`,
    )
    return null
  }
  const template = templateRes.template

  /*
   * Sections are required only by the renderer that reads them.
   *
   * The twelve ported templates are the handoff's own markup: `render.tsx`
   * returns the PortedTemplateView branch before it ever looks at
   * `toNodeSections(sections)`, and their editable copy lives in slot overrides
   * instead. A blanket "no sections, no page" gate therefore 404s every
   * deployment of a stock template — which is every deployment, once templates
   * are records. The four identity templates genuinely have nothing to draw
   * without sections, and still refuse.
   */
  const sections = Array.isArray(lpDoc.sections) ? (lpDoc.sections as unknown[]) : []
  if (template.renderer === 'identity' && sections.length === 0) return null

  /** The template's OWN copy. A deployment layers its copy over this. */
  const templateSlotOverrides = normalizeOverrides(lpDoc.slot_overrides)

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

  /*
   * The deployment's OWN quiz flow first; the legacy standalone-deployment
   * pointer only when it has none.
   *
   * Order matters and is not arbitrary. A row that has been moved to the new
   * binding may still carry the old `quiz_deployment_id`, and reading that first
   * would keep serving the standalone deployment's template and destinations
   * after somebody deliberately chose otherwise.
   */
  const ownQuizId = relId(doc.quiz)
  const quizDeploymentId = String(doc.quiz_deployment_id ?? '')

  const quiz = ownQuizId
    ? await resolveEmbeddedQuiz({
        lpDeploymentId: String(doc.id),
        quizId: ownQuizId,
        siteId,
        // The landing page's recommended skin when the deployment has not
        // chosen one, so an embed is never drawn in a template nobody picked.
        templateId: String(doc.embedded_quiz_template_id || '') || recommendedQuizTemplateFor(lpDoc.template_id),
        progressForm: typeof doc.embedded_progress_form === 'string' && doc.embedded_progress_form ? doc.embedded_progress_form : null,
        includeUnpublished,
      })
    : quizDeploymentId
      ? await resolveQuizDeploymentById(quizDeploymentId, siteId, includeUnpublished)
      : null

  /*
   * A page that was BUILT to run a quiz and cannot must not serve.
   *
   * The failure this closes is quieter than a 404 and worse: the renderer takes
   * `hasForm={Boolean(resolved.quiz)}`, so an unresolvable quiz produced a live
   * lead-generation page, at its real URL, under the brand, with no form on it.
   * Nothing in the funnel reports zero conversions as an error.
   *
   * Only when a quiz was BOUND. A landing page with no quiz at all is a
   * legitimate thing to publish and is untouched.
   */
  if ((ownQuizId || quizDeploymentId) && !quiz) {
    console.warn(
      `${LP_TEMPLATE_REFUSED}: deployment ${doc.id} binds a quiz ` +
        `(${ownQuizId ? `flow ${ownQuizId}` : `deployment ${quizDeploymentId}`}) that did not resolve. ` +
        'Not served, rather than served without its form.',
    )
    return null
  }

  /*
   * A LANDING PAGE WHOSE FUNNEL IS GONE IS NOT A LANDING PAGE.
   *
   * The twelve ported templates all have a quiz mount, and the live render puts
   * the real runtime in it. With nothing to mount, the visitor gets the card's
   * EMPTY BOX where the funnel goes — which is what an already-live deployment
   * degrades to the moment somebody unpublishes or archives its flow, long after
   * the publish preflight had its say.
   *
   * A 404 is the loud version of a failure that is otherwise silent: an empty
   * card converts at zero either way, and this one shows up in analytics, in the
   * logs, and to whoever is buying the traffic. Admin preview is exempt —
   * `includeUnpublished` means somebody is deliberately looking at unpublished
   * work and should see the page they are building.
   */
  const portedTemplate = templateRes.template.kind === 'lp' ? templateRes.template.template : null
  if (!includeUnpublished && portedTemplate?.quizMount && !quiz) {
    // eslint-disable-next-line no-console
    console.error(
      `[legalos] lp deployment ${doc.id} (${normalized}) is live and has no quiz to mount: ` +
        `${ownQuizId ? `flow ${ownQuizId} did not resolve` : quizDeploymentId ? `legacy pointer "${quizDeploymentId}" did not resolve` : 'no flow is bound'}. ` +
        'Serving 404 rather than an empty card. See pnpm reconcile:lp-quiz.',
    )
    return null
  }

  return {
    deployment: {
      id: String(doc.id),
      name: String(doc.name ?? ''),
      path: normalizeDeploymentPath(String(doc.path ?? '')),
      status: String(doc.status ?? 'draft'),
      quizDeploymentId,
      /** The flow this page runs directly, when it has one. */
      quizId: ownQuizId,
      contentOverrides: normalizeOverrides(doc.content_overrides),
    },
    landingPage: {
      id: String(lpDoc.id),
      name: String(lpDoc.name ?? ''),
      slug: String(lpDoc.slug ?? ''),
      templateId: template.id,
      // Resolution is strict now, so this can only be false. The field stays
      // because the shared publish preflight reads it for both kinds and the
      // quiz side is a different resolver.
      templateFellBack: false,
      requestedTemplateId: String(lpDoc.template_id ?? ''),
      angle: String(lpDoc.angle ?? 'pain'),
      sections,
      slotOverrides: templateSlotOverrides,
    },
    /**
     * What the renderer is actually given: the template's own copy with this
     * deployment's copy on top.
     *
     * Merged here rather than in the renderer because there is exactly one
     * right answer and more than one renderer entry point. A slot present in
     * neither map draws the reference's wording, so a corrected template still
     * reaches every deployment that has not overridden that slot.
     */
    composedOverrides: { ...templateSlotOverrides, ...normalizeOverrides(doc.content_overrides) },
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
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  /*
   * Where the copy is depends on which renderer draws the page.
   *
   * The four identity templates keep it in `sections[].copy`. The twelve ported
   * ones have no sections at all — their words are slots — so reading only the
   * hero section gave every stock-template page the same canned description and
   * a title made of the deployment's internal name. That is a real regression
   * in search and social, and it is invisible on the page itself.
   */
  const fromSlots = (): { headline: string; sub: string } => {
    const res = resolveTemplate('lp', landingPage.templateId)
    if (!res.ok || res.template.kind !== 'lp' || !res.template.template) {
      return { headline: '', sub: '' }
    }
    const slots = asSlotted(res.template.template).slots
    const pick = (role: string): string => {
      const slot = slots.find((s) => s.role === role)
      if (!slot) return ''
      return str(resolved.composedOverrides[slot.id] ?? slot.default)
    }
    return { headline: pick('headline'), sub: pick('subheadline') || pick('trust_line') }
  }

  const hero = (landingPage.sections as Array<Record<string, unknown>>).find(
    (s) => s && s.type === 'hero',
  )
  const copy = (hero?.copy ?? {}) as Record<string, unknown>
  const slotCopy = hero ? { headline: '', sub: '' } : fromSlots()

  const brandName = brand.displayName || brand.name || ''
  const headline = str(copy.headline) || slotCopy.headline || deployment.name || landingPage.name
  const title = [headline, brandName].filter(Boolean).join(' | ')
  const description =
    str(copy.subheadline) ||
    str(copy.sub) ||
    slotCopy.sub ||
    brand.tagline ||
    `Find out where you stand${brandName ? ` with ${brandName}` : ''}. Takes about a minute.`

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    image: brand.logoUrl || null,
  }
}
