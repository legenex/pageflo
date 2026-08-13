/**
 * Publishing as an ACT, not as a string somebody set.
 *
 * Before this, going live meant writing `status: 'live'` or `is_published: true`
 * through a generic save. Three consequences, all of which happened:
 *
 *  - nothing was checked. A deployment could go live pointing at a template that
 *    does not exist, on a path another deployment already serves, with a quiz
 *    whose graph dead-ends, under a Site with no brand.
 *  - nothing was authorized beyond "is logged in", because the funnel deployment
 *    collections are `isAuthenticated` on every verb.
 *  - unpublishing was indistinguishable from an accidental save, and there was
 *    no record that a human decided it.
 *
 * So publication is its own verb with its own gate, and the gate is a PREFLIGHT
 * that runs server-side every time — on publish, and again on resume, because a
 * paused deployment's world moves while it is paused: its template can be
 * removed, its domain can be detached, another deployment can take its path.
 *
 * Two rules that shape everything here:
 *
 *  1. UNPUBLISHING PRESERVES THE RECORD AND REMOVES ACCESS IMMEDIATELY. It is
 *     not a delete and it must not cascade: unpublishing a quiz stops its
 *     deployments serving (the resolvers check the parent) without destroying
 *     them, so republishing is one action and not a rebuild.
 *
 *  2. AN AUTHENTICATED SITE ADMIN KEEPS DRAFT PREVIEW. Taking something down
 *     must not take away the ability to look at it, or the only way to check a
 *     fix is to publish it.
 */
import type { Payload } from 'payload'

import type { AuthedUser } from '@/lib/auth'
import { requireSiteAdmin, relationId, type AuthzFailure } from '@/lib/authz'
import { checkPathAvailable, type ClaimKind } from '@/lib/path-claims'
import {
  checkTemplateResolves,
  fail,
  pass,
  summarize,
  type PreflightCheck,
  type PreflightResult,
} from '@/lib/publish-preflight'
import { canonicalTemplateId, resolveTemplate } from '@/lib/template-registry'
import { asSlotted } from '@/lib/lp-templates'
import { validateOverrides } from '@/lib/lp-slots/model'
import { domainEligibility } from '@/lib/domain-eligibility'

/* ------------------------------------------------------------------- states */

/**
 * The states a deployment can be in, and the only transitions between them.
 *
 * `archived` is deliberately absent: retiring something is a different decision
 * from pausing it and must not share a control. See `setQuizArchived`.
 */
export type DeploymentStatus = 'draft' | 'live' | 'paused'

export const DEPLOYMENT_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  draft: ['live'],
  live: ['paused', 'draft'],
  paused: ['live', 'draft'],
}

export const canTransition = (from: DeploymentStatus, to: DeploymentStatus): boolean =>
  DEPLOYMENT_TRANSITIONS[from]?.includes(to) ?? false

/** Transitions that make something publicly reachable, and so need a preflight. */
export const GOES_LIVE: ReadonlySet<DeploymentStatus> = new Set<DeploymentStatus>(['live'])

/* ---------------------------------------------------------------- preflight */

export type QuizDeploymentRow = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * Brand completeness, in the sense that matters for a live page.
 *
 * Not "has the operator filled in every field" — most are optional and a page
 * renders without them. These four are the ones whose absence is visible or
 * legally material: a page with no name says "Your Brand", one with no phone
 * renders a dead call button, and one with no disclaimer is an attorney
 * advertisement without the notice it needs.
 */
const checkBrand = (site: Record<string, unknown> | null): PreflightCheck => {
  if (!site) return fail('brand', 'Brand is complete enough to publish', 'the site could not be loaded')
  const identity = (site.brand_identity ?? {}) as Record<string, unknown>
  const missing: string[] = []
  const has = (...keys: string[]): boolean => keys.some((k) => str(site[k]).trim() !== '' || str(identity[k]).trim() !== '')

  if (!has('brand_display_name', 'name', 'displayName')) missing.push('a display name')
  if (!has('default_phone', 'callNumber')) missing.push('a phone number')
  if (!has('legal_default_disclaimer', 'defaultDisclaimer')) missing.push('a legal disclaimer')

  return missing.length === 0
    ? pass('brand', 'Brand is complete enough to publish')
    : fail('brand', 'Brand is complete enough to publish', `the brand has no ${missing.join(', no ')}`)
}

/**
 * The graph must be able to finish.
 *
 * A quiz whose first step resolves to nothing shows a visitor a blank card, and
 * one with no terminal collects answers and never delivers a lead. Both are
 * silent: the page renders, the visitor answers, and nothing arrives.
 */
const checkQuizGraph = (quiz: Record<string, unknown> | null): PreflightCheck[] => {
  if (!quiz) return [fail('graph', 'Quiz flow is valid', 'the quiz could not be loaded')]
  const steps = arr(quiz.steps)
  const nodes = arr(quiz.nodes)
  const out: PreflightCheck[] = []

  out.push(
    steps.length > 0 && nodes.length > 0
      ? pass('graph-nonempty', 'Quiz has steps and nodes')
      : fail('graph-nonempty', 'Quiz has steps and nodes', `${steps.length} steps, ${nodes.length} nodes`),
  )

  // Every route must name a step that exists. A dangling `nextStepKey` sends a
  // visitor to the sequential next question instead of where the author sent
  // them, which is a routing change nobody made and nobody can see.
  const stepKeys = new Set(steps.map((s) => str((s as Record<string, unknown>).key)))
  const dangling: string[] = []
  for (const n of nodes as Array<Record<string, unknown>>) {
    for (const a of arr(n.answers) as Array<Record<string, unknown>>) {
      const k = str(a.nextStepKey)
      if (k && !stepKeys.has(k)) dangling.push(`${str(n.id)} -> "${k}"`)
    }
    for (const c of arr(n.conditions) as Array<Record<string, unknown>>) {
      const k = str(c.nextStepKey)
      if (k && !stepKeys.has(k)) dangling.push(`${str(n.id)} -> "${k}"`)
    }
    const d = str(n.defaultNextStepKey)
    if (d && !stepKeys.has(d)) dangling.push(`${str(n.id)} -> "${d}"`)
  }
  out.push(
    dangling.length === 0
      ? pass('graph-references', 'Every route names a step that exists')
      : fail('graph-references', 'Every route names a step that exists', dangling.slice(0, 5).join(', ')),
  )

  // A terminal is where the lead is delivered. Without one the runtime falls off
  // the end of the step list, which does still submit, but nothing in the flow
  // says so and no destination is chosen.
  const hasTerminal = (nodes as Array<Record<string, unknown>>).some(
    (n) => n.type === 'endpoint' || n.type === 'form',
  )
  out.push(
    hasTerminal
      ? pass('graph-terminal', 'The flow reaches a form or endpoint')
      : fail('graph-terminal', 'The flow reaches a form or endpoint', 'no node in this quiz collects or delivers a lead'),
  )

  return out
}

/** Consent has to be reachable, or the lead cannot lawfully be contacted. */
const checkConsent = (quiz: Record<string, unknown> | null): PreflightCheck => {
  const nodes = arr(quiz?.nodes) as Array<Record<string, unknown>>
  const hasConsent = nodes.some((n) => {
    const blob = JSON.stringify(n).toLowerCase()
    return blob.includes('tcpa') || blob.includes('consent') || blob.includes('by clicking')
  })
  return hasConsent
    ? pass('consent', 'The flow carries consent language')
    : fail('consent', 'The flow carries consent language', 'no node in this quiz mentions consent or TCPA')
}

export type PreflightContext = {
  payload: Payload
  user: AuthedUser | null
  siteId: unknown
}

export type QuizPreflightInput = {
  deployment: QuizDeploymentRow
  quiz: Record<string, unknown> | null
  site: Record<string, unknown> | null
  domain: Record<string, unknown> | null
}

/**
 * Everything that must be true before a quiz deployment serves traffic.
 *
 * Returns every check, passed and failed, rather than the first failure: an
 * operator fixing four things one refusal at a time is how a preflight becomes
 * the thing people ask to have turned off.
 */
export const quizDeploymentPreflight = async (
  ctx: PreflightContext,
  input: QuizPreflightInput,
): Promise<PreflightResult> => {
  const checks: PreflightCheck[] = []
  const { deployment, quiz, site, domain } = input

  const gate = requireSiteAdmin(ctx.user, ctx.siteId)
  checks.push(gate.ok ? pass('authz', 'You administer this brand') : fail('authz', 'You administer this brand', gate.error))
  if (!gate.ok) return summarize(checks)

  // The parent gates every deployment of it. Publishing a deployment of an
  // unpublished quiz produces a live URL that 404s, which reads as a broken
  // deployment rather than as an unpublished quiz.
  checks.push(
    quiz && quiz.is_published && !quiz.is_archived
      ? pass('parent', 'The quiz itself is published')
      : fail('parent', 'The quiz itself is published', quiz?.is_archived ? 'the quiz is archived' : 'the quiz is not published'),
  )

  checks.push(checkBrand(site))
  checks.push(checkTemplateResolves('quiz', deployment.template_id))
  checks.push(...checkQuizGraph(quiz))
  checks.push(checkConsent(quiz))

  // Destinations: where a completed lead is sent. An override naming nothing is
  // a lead that finishes the funnel and goes nowhere.
  const destinations = deployment.destination_overrides
  checks.push(
    destinations == null || typeof destinations === 'object'
      ? pass('destinations', 'Destination overrides are well formed')
      : fail('destinations', 'Destination overrides are well formed', 'the stored value is not an object'),
  )

  // Tracking and pixels are optional; malformed ones are not.
  for (const [key, label] of [['utm', 'UTM configuration'], ['pixels', 'Pixel configuration']] as const) {
    const v = deployment[key]
    checks.push(
      v == null || (typeof v === 'object' && !Array.isArray(v))
        ? pass(key, `${label} is well formed`)
        : fail(key, `${label} is well formed`, 'the stored value is not an object'),
    )
  }

  checks.push(...(await domainAndPathChecks(ctx, {
    siteId: gate.siteId,
    domain,
    path: str(deployment.path),
    kind: 'quiz-deployment',
    excludeId: String(deployment.id ?? ''),
  })))

  return summarize(checks)
}

export type LpPreflightInput = {
  deployment: Record<string, unknown>
  landingPage: Record<string, unknown> | null
  site: Record<string, unknown> | null
  domain: Record<string, unknown> | null
  /** The embedded quiz deployment, when this LP runs one. */
  quizDeployment: Record<string, unknown> | null
  quiz: Record<string, unknown> | null
}

export const lpDeploymentPreflight = async (
  ctx: PreflightContext,
  input: LpPreflightInput,
): Promise<PreflightResult> => {
  const checks: PreflightCheck[] = []
  const { deployment, landingPage, site, domain, quizDeployment, quiz } = input

  const gate = requireSiteAdmin(ctx.user, ctx.siteId)
  checks.push(gate.ok ? pass('authz', 'You administer this brand') : fail('authz', 'You administer this brand', gate.error))
  if (!gate.ok) return summarize(checks)

  checks.push(
    landingPage?.is_published
      ? pass('parent', 'The landing page itself is published')
      : fail('parent', 'The landing page itself is published', 'the landing page is not published'),
  )

  checks.push(checkBrand(site))

  const templateCheck = checkTemplateResolves('lp', landingPage?.template_id, {
    label: 'Landing-page visual template resolves',
  })
  checks.push(templateCheck)

  // The deployment's own copy must still fit the template it deploys. A template
  // that changed under a saved deployment leaves overrides naming slots that no
  // longer exist — copy the operator wrote which will never appear.
  if (templateCheck.ok) {
    const canonical = canonicalTemplateId('lp', landingPage?.template_id)
    const entry = canonical.ok ? resolveTemplate('lp', canonical.id) : null
    const ported = entry?.ok && entry.template.kind === 'lp' ? entry.template.template : null
    const overrides = (deployment.content_overrides ?? {}) as Record<string, string>
    if (ported) {
      const v = validateOverrides(asSlotted(ported), overrides)
      checks.push(
        v.ok
          ? pass('overrides', "This deployment's copy fits its template")
          : fail('overrides', "This deployment's copy fits its template", v.problems.map((p) => p.detail).join('; ')),
      )
      // Renderer hydration: composing must actually produce a page.
      checks.push(
        ported.parts.length === ported.slotIds.length + 1 && ported.slots.length > 0
          ? pass('hydration', 'The template hydrates into a page')
          : fail('hydration', 'The template hydrates into a page', 'the template has no renderable slot stream'),
      )
    } else if (Object.keys(overrides).length > 0) {
      checks.push(fail('overrides', "This deployment's copy fits its template", 'this template has no content slots, so its overrides would do nothing'))
    } else {
      checks.push(pass('overrides', "This deployment's copy fits its template"))
    }
  }

  // An embedded quiz is optional. One that is NAMED and broken is not.
  if (str(deployment.quiz_deployment_id)) {
    checks.push(
      quizDeployment
        ? pass('embedded-quiz', 'The embedded quiz deployment exists')
        : fail('embedded-quiz', 'The embedded quiz deployment exists', `no quiz deployment "${str(deployment.quiz_deployment_id)}" on this brand`),
    )
    if (quizDeployment) {
      // Cross-tenant: the link is a bare text id with no foreign key behind it,
      // so nothing at the database level stops brand A embedding brand B's quiz
      // and sending its leads to brand B's destinations.
      checks.push(
        relationId(quizDeployment.site) === gate.siteId
          ? pass('embedded-quiz-tenant', 'The embedded quiz belongs to this brand')
          : fail('embedded-quiz-tenant', 'The embedded quiz belongs to this brand', 'it belongs to a different brand'),
      )
      checks.push(checkTemplateResolves('quiz', quizDeployment.template_id, {
        id: 'embedded-quiz-template',
        label: 'Embedded quiz visual template resolves',
      }))
      checks.push(...checkQuizGraph(quiz))
      checks.push(checkConsent(quiz))
    }
  }

  checks.push(...(await domainAndPathChecks(ctx, {
    siteId: gate.siteId,
    domain,
    path: str(deployment.path),
    kind: 'lp-deployment',
    excludeId: String(deployment.id ?? ''),
  })))

  return summarize(checks)
}

/* -------------------------------------------------- domain and path, shared */

const domainAndPathChecks = async (
  ctx: PreflightContext,
  args: { siteId: number; domain: Record<string, unknown> | null; path: string; kind: ClaimKind; excludeId: string },
): Promise<PreflightCheck[]> => {
  const checks: PreflightCheck[] = []

  if (args.domain) {
    // Ownership first: a deployment bound to a domain another Site holds would
    // publish this brand's page on that brand's host.
    checks.push(
      relationId(args.domain.site) === args.siteId
        ? pass('domain-ownership', 'The domain belongs to this brand')
        : fail('domain-ownership', 'The domain belongs to this brand', 'this domain is attached to a different brand'),
    )
    // The one contract for "may this domain serve", shared with the resolver and
    // the pickers. A second opinion here is how a deployment goes live on a host
    // the router will then refuse to answer for.
    const eligible = domainEligibility(args.domain as never)
    checks.push(
      eligible.eligible
        ? pass('domain-eligibility', 'The domain can serve public traffic')
        : fail('domain-eligibility', 'The domain can serve public traffic', eligible.reason),
    )
    if (eligible.eligible && eligible.previewUnverified) {
      // A preview host serves today without a verified certificate; that is a
      // deliberate switch (PREVIEW_REQUIRES_SSL) and not a reason to block, but
      // an operator publishing to one should be told rather than discover it.
      checks.push(fail('domain-ssl', 'The domain has a verified certificate', 'this preview host has no issued certificate yet', 'warn'))
    }
  } else {
    // No domain is legitimate: the deployment is reachable on every host the
    // Site owns. It is recorded as a passing check rather than skipped, so an
    // operator reading the list can see the decision was considered.
    checks.push(pass('domain-eligibility', 'Reachable on every domain this brand owns'))
  }

  const availability = await checkPathAvailable(ctx.payload, {
    siteId: args.siteId,
    domainId: args.domain ? relationId(args.domain.id) : null,
    path: args.path,
    kind: args.kind,
    excludeId: args.excludeId || undefined,
    live: true,
  })
  checks.push(
    availability.ok
      ? pass('path', `The path is free (${availability.effectivePath})`)
      : fail('path', 'The path is free', availability.error),
  )

  return checks
}

/* ------------------------------------------------------------- the verdict */

export type PublishOutcome =
  | { ok: true; status: DeploymentStatus; preflight: PreflightResult }
  | (AuthzFailure & { preflight?: PreflightResult })

/**
 * Decide a transition, given a preflight.
 *
 * Separated from the actions so the rule — a transition must be legal, and one
 * that goes live must pass — is stated once and testable without a database.
 * Unpublishing and pausing are never gated on a preflight: something already
 * live that fails a check is exactly what an operator most needs to take down.
 */
export const decideTransition = (
  from: DeploymentStatus,
  to: DeploymentStatus,
  preflight: PreflightResult | null,
): PublishOutcome => {
  if (from === to) return { ok: false, error: `already ${to}` }
  if (!canTransition(from, to)) return { ok: false, error: `cannot go from ${from} to ${to}` }

  if (!GOES_LIVE.has(to)) return { ok: true, status: to, preflight: preflight ?? { ok: true, checks: [], blocking: [], warnings: [] } }

  if (!preflight) return { ok: false, error: 'publishing requires a preflight' }
  if (!preflight.ok) {
    return {
      ok: false,
      error: preflight.blocking.map((c) => `${c.label}: ${c.detail}`).join('; '),
      preflight,
    }
  }
  return { ok: true, status: to, preflight }
}
