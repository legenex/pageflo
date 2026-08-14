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
  type PreflightSeverity,
} from '@/lib/publish-preflight'
import { validateQuizFlow } from '@/lib/quiz-flow'
import { canonicalTemplateId, resolveTemplate } from '@/lib/template-registry'
import { asSlotted } from '@/lib/lp-templates'
import { validateOverrides } from '@/lib/lp-slots/model'
import { domainEligibility } from '@/lib/domain-eligibility'
import { getQuizTemplateRecordByTemplateId, getLpTemplateRecord } from '@/lib/template-records'
import { resolveBrandContact, resolveBrandDisplayName, resolveBrandLegal } from '@/lib/brand-map'

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
 * "a, b, or c", for a sentence an operator reads at the moment they are blocked.
 *
 * The previous `missing.join(', no ')` ran over items that already carried their
 * own article and produced "the brand has no a legal disclaimer". A refusal that
 * reads like a bug is a refusal people believe is one.
 */
const orList = (items: string[]): string => {
  if (items.length < 2) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`
}

/**
 * Brand completeness, in the sense that matters for a live page.
 *
 * Not "has the operator filled in every field" — most are optional and a page
 * renders without them. These three are the ones whose absence is visible or
 * legally material: a page with no name says "Your Brand", one with no phone
 * renders a dead call button, and one with no disclaimer is an attorney
 * advertisement without the notice it needs.
 *
 * Every value is read through the CANONICAL BRAND MAPPER, never off the row.
 * A brand's disclaimer physically lives in one of four places and the Brand
 * Identity editor writes it to the deepest of them
 * (`brand_identity.legal.defaultDisclaimer`); this check used to reach into the
 * jsonb itself and read `brand_identity.defaultDisclaimer`, one level too
 * shallow. Every brand in production had filled the field in and every one of
 * them reported "no legal disclaimer", so all eight live deployments failed
 * re-publish — and since `decideTransition` gates going live but never going
 * down, unpublishing any of them was a one-way door. Asking the same resolver
 * the renderer asks is what makes that class of divergence unreachable rather
 * than merely fixed.
 */
const checkBrand = (site: Record<string, unknown> | null): PreflightCheck => {
  const label = 'Brand is complete enough to publish'
  if (!site) return fail('brand', label, 'the site could not be loaded')

  const missing: string[] = []
  if (!resolveBrandDisplayName(site)) missing.push('display name')
  if (!resolveBrandContact(site).callNumber) missing.push('phone number')
  if (!resolveBrandLegal(site).defaultDisclaimer) missing.push('legal disclaimer')

  return missing.length === 0
    ? pass('brand', label)
    : fail('brand', label, `the brand has no ${orList(missing)}`)
}

/**
 * The graph must be able to finish, and the real validator decides that.
 *
 * `validateQuizFlow` walks the flow through `quiz-graph`'s own navigation
 * primitives in `QuizRuntime.advance()`'s exact order, so a verdict here cannot
 * disagree with what a visitor experiences. A shallower check written into this
 * file would be a second opinion about routing, which is the class of bug the
 * whole graph module exists to remove.
 *
 * Each of its ten checks becomes a named preflight line, so an operator sees
 * WHICH property failed rather than "the flow is invalid". Warnings are carried
 * through as warnings: a legitimate back-edge or a partial path table is worth
 * seeing and is not a reason to refuse.
 *
 * `path_table` truncation is deliberately NOT a blocker here. It means the flow
 * has more branches than the enumerator's safe limit, which is a fact about a
 * large quiz rather than a defect in it, and blocking on it would make the
 * biggest funnels the ones that cannot be published.
 */
const NON_BLOCKING_FLOW_CHECKS = new Set(['path_table'])

const checkQuizGraph = (quiz: Record<string, unknown> | null): PreflightCheck[] => {
  if (!quiz) return [fail('graph', 'Quiz flow is valid', 'the quiz could not be loaded')]

  const steps = arr(quiz.steps)
  const nodes = arr(quiz.nodes)
  if (steps.length === 0 || nodes.length === 0) {
    return [fail('graph-nonempty', 'Quiz has steps and nodes', `${steps.length} steps, ${nodes.length} nodes`)]
  }

  // The four graph columns are jsonb and nullable, so a row can reach here with
  // `tiers: null`. Normalising is the resolver's job rather than the caller's:
  // a preflight that throws on a real row is a preflight that gets bypassed.
  const normalized = {
    ...quiz,
    tiers: arr(quiz.tiers),
    steps,
    nodes,
    customFields: arr(quiz.custom_fields ?? quiz.customFields),
  }

  let validation
  try {
    validation = validateQuizFlow(normalized as never)
  } catch (err) {
    // A validator that throws must not make a quiz unpublishable on the basis of
    // its own bug, but it must not wave the quiz through either.
    return [fail('graph', 'Quiz flow is valid', `the flow validator could not run: ${err instanceof Error ? err.message : 'unknown'}`)]
  }

  return validation.checks.map((c) => {
    const severity: PreflightSeverity = NON_BLOCKING_FLOW_CHECKS.has(c.id) ? 'warn' : 'block'
    if (c.ok) return pass(`flow-${c.id}`, c.label, severity)
    return fail(
      `flow-${c.id}`,
      c.label,
      c.errors.slice(0, 4).map((e) => e.message).join('; ') || 'failed',
      severity,
    )
  })
}

/**
 * Consent has to be shown, or the lead cannot lawfully be contacted.
 *
 * The flow validator's own `reachable_consent` check is the authority on the
 * FLOW half — that every path submitting a lead passes through a form — and is
 * already included above. This adds the text-level question it cannot answer:
 * is there a consent line anywhere for that form to print.
 *
 * There are TWO places that line can come from, and the check must accept both
 * because a visitor cannot tell them apart:
 *
 *   - the quiz's own copy, which older flows carry per node, and
 *   - the BRAND's TCPA text. `PreviewQuestionCard` — the one card component the
 *     builder preview and the public runtime both render through — prints
 *     `brand.legal.tcpaText` on every form node, so a brand-supplied line is
 *     what the visitor reads even when the flow itself says nothing. The flow
 *     validator states this outright in `checkReachableConsent`.
 *
 * Scanning only the nodes therefore failed the platform's real configuration:
 * one brandless quiz runs under three brands, each supplying its own TCPA text,
 * and the quiz carries no consent wording of its own by design.
 *
 * NOT weakened to always-pass. With no node-level consent AND no brand TCPA
 * text there is nothing for the form to print, and that still blocks.
 */
const checkConsent = (
  quiz: Record<string, unknown> | null,
  site: Record<string, unknown> | null,
): PreflightCheck => {
  const id = 'consent'
  const label = 'The visitor is shown consent language'

  const nodes = arr(quiz?.nodes) as Array<Record<string, unknown>>
  const inFlow = nodes.some((n) => {
    const blob = JSON.stringify(n).toLowerCase()
    return blob.includes('tcpa') || blob.includes('consent') || blob.includes('by clicking')
  })
  if (inFlow) return pass(id, label)

  if (site && resolveBrandLegal(site).tcpaText) return pass(id, label)

  return fail(
    id,
    label,
    'no node in this quiz mentions consent or TCPA and this brand has no TCPA text of its own, so the form would collect a lead with nothing shown',
  )
}

/**
 * The template a deployment names must EXIST as a record and be ENABLED.
 *
 * `checkTemplateResolves` asks the code registry, which is the wrong question
 * twice over now. It cannot see a cloned template at all — a clone's id names no
 * code renderer by design — and it cannot see that a stock template has been
 * disabled or deleted, because a module export has no such state.
 *
 * Enabled is required HERE and nowhere in the render path, and the asymmetry is
 * the point: disabling a template stops new deployments choosing it and stops a
 * paused one being resumed onto it, while the pages already live on it keep
 * serving. Publishing is the moment that decision gets made, so it is the moment
 * to enforce it.
 */
const checkQuizTemplateRecord = async (
  payload: Payload,
  rawId: unknown,
): Promise<PreflightCheck> => {
  const id = 'quiz-template'
  const label = 'Quiz visual template is available'
  const stored = typeof rawId === 'string' ? rawId.trim() : ''
  if (!stored) return fail(id, label, 'no quiz template has been selected')

  // Resolve the alias FIRST, the way the renderer does. `template_id` on the
  // live rows is often a legacy alias — `default` is the stored value on two
  // production quiz deployments and maps to `sq_quiz_first` through
  // LEGACY_TEMPLATE_IDS, which `template-registry` owns and
  // `template-records/select.ts` already goes through.
  //
  // Looking the RAW value up meant preflight and render disagreed about the
  // same row: the page served fine while publishing it reported "matches no
  // quiz template", so a live deployment could be taken down and not put back.
  // That is the same shape as the brand-identity defect above — a check reading
  // a different source from the thing it is checking. The LP branch of this
  // file already canonicalises; the quiz branch did not.
  // Raw id FIRST. Records are the source of truth and their ids are not all
  // known to the code registry: a clone is `sq_case_dossier_copy_x1`, and an
  // AI-authored template has an id no module exports. Canonicalising first
  // would reject exactly those.
  let record = await getQuizTemplateRecordByTemplateId(payload, stored).catch(() => null)

  // Only then the legacy alias, the way the renderer resolves it.
  // `default` is the stored value on two live production quiz deployments and
  // maps to `sq_quiz_first` through LEGACY_TEMPLATE_IDS. Looking up only the
  // raw value meant preflight and render disagreed about the same row — the
  // page served fine while publishing it reported "matches no quiz template",
  // so a healthy live deployment could be taken down and not put back. Same
  // shape as the brand-identity defect: a check reading a different source from
  // the thing it checks. This ordering is additive — nothing that resolved
  // before can now fail.
  if (!record) {
    const canonical = canonicalTemplateId('quiz', stored)
    if (canonical.ok && canonical.id !== stored) {
      record = await getQuizTemplateRecordByTemplateId(payload, canonical.id).catch(() => null)
    }
  }
  if (!record) return fail(id, label, `template id "${stored}" matches no quiz template`)
  if (record.rendererError) return fail(id, label, record.rendererError)
  if (record.archivedAt) return fail(id, label, `"${record.name}" has been deleted`)
  if (!record.isEnabled) return fail(id, label, `"${record.name}" is disabled and cannot be published onto`)
  return pass(id, label)
}

const checkLpTemplateRecord = async (
  payload: Payload,
  landingPageId: unknown,
): Promise<PreflightCheck> => {
  const id = 'lp-template-record'
  const label = 'Landing-page template is available'
  const rowId = relationId(landingPageId)
  if (rowId === null) return fail(id, label, 'no landing-page template has been selected')

  const record = await getLpTemplateRecord(payload, String(rowId)).catch(() => null)
  if (!record) return fail(id, label, 'the selected landing-page template no longer exists')
  if (record.rendererError) return fail(id, label, record.rendererError)
  if (record.archivedAt) return fail(id, label, `"${record.name}" has been deleted`)
  if (!record.isEnabled) return fail(id, label, `"${record.name}" is disabled and cannot be published onto`)
  return pass(id, label)
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
  checks.push(await checkQuizTemplateRecord(ctx.payload, deployment.template_id))
  checks.push(...checkQuizGraph(quiz))
  checks.push(checkConsent(quiz, site))

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
  checks.push(await checkLpTemplateRecord(ctx.payload, deployment.landing_page))

  // The deployment's own copy must still fit the template it deploys. A template
  // that changed under a saved deployment leaves overrides naming slots that no
  // longer exist — copy the operator wrote which will never appear.
  if (templateCheck.ok) {
    const canonical = canonicalTemplateId('lp', landingPage?.template_id)
    const entry = canonical.ok ? resolveTemplate('lp', canonical.id) : null
    const ported = entry?.ok && entry.template.kind === 'lp' ? entry.template.template : null
    /*
     * The MERGED map, not the deployment's half.
     *
     * A template carries its own slot copy and a deployment layers its copy on
     * top; the renderer is handed the merge. Validating only the deployment's
     * half would let a template-level override naming a dead slot pass
     * preflight and land silently in `unknownOverrides` at render, where the
     * public path passes no diagnostics callback and nobody ever sees it.
     */
    const overrides = {
      ...((landingPage?.slot_overrides ?? {}) as Record<string, string>),
      ...((deployment.content_overrides ?? {}) as Record<string, string>),
    }
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

  /*
   * A LANDING PAGE WITH A QUIZ CARD MUST HAVE A QUIZ.
   *
   * The twelve ported templates all draw one, and the live render replaces that
   * drawing with the real runtime. With nothing bound, the visitor gets the
   * card's empty box where the funnel goes — which is a worse outcome than the
   * static card it replaced, and exactly the state three of four live rows were
   * in when their legacy pointers went stale.
   *
   * Checked against the TEMPLATE rather than assumed, so a future template with
   * no quiz mount is not held to a rule that does not apply to it.
   */
  if (templateCheck.ok) {
    const canonical = canonicalTemplateId('lp', landingPage?.template_id)
    const entry = canonical.ok ? resolveTemplate('lp', canonical.id) : null
    const ported = entry?.ok && entry.template.kind === 'lp' ? entry.template.template : null
    if (ported?.quizMount) {
      const bound = relationId(deployment.quiz) !== null || str(deployment.quiz_deployment_id) !== ''
      checks.push(
        bound
          ? pass('quiz-bound', 'This page runs a quiz')
          : fail(
              'quiz-bound',
              'This page runs a quiz',
              'this template has a quiz card and this deployment names no flow, so the card would render empty',
            ),
      )
    }
  }

  // The deployment's OWN flow, when it names one. Checked on the flow and its
  // chosen skin rather than on a standalone deployment it deliberately does not
  // have — requiring one was the thing gate 10 removed.
  if (relationId(deployment.quiz) !== null) {
    checks.push(
      quiz
        ? pass('embedded-flow', 'The embedded quiz flow exists')
        : fail('embedded-flow', 'The embedded quiz flow exists', 'the quiz flow this page names could not be loaded'),
    )
    checks.push(
      quiz?.is_published && !quiz.is_archived
        ? pass('embedded-flow-published', 'The embedded quiz flow is published')
        : fail('embedded-flow-published', 'The embedded quiz flow is published', quiz?.is_archived ? 'it is archived' : 'it is not published'),
    )
    // Through the RECORDS, like every other template check. Asking the code
    // registry here refused every cloned skin, which is the same defect the
    // landing-page save carried.
    const skin = str(deployment.embedded_quiz_template_id)
    if (skin) {
      const check = await checkQuizTemplateRecord(ctx.payload, skin)
      checks.push({ ...check, id: 'embedded-quiz-template', label: 'Embedded quiz visual template is available' })
    }
    checks.push(...checkQuizGraph(quiz))
    checks.push(checkConsent(quiz, site))
  } else if (str(deployment.quiz_deployment_id)) {
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
      /*
       * The borrowed quiz deployment must be LIVE, and this is the check that
       * earns its keep now.
       *
       * A landing page that binds a quiz it cannot resolve refuses to serve —
       * a live lead-generation page with no form on it captures nothing and
       * nothing in the funnel reports that as an error, so refusing is the
       * safer failure. But the coupling is invisible: pausing the quiz
       * deployment at `/s/<brand>` takes the brand's landing page at
       * `/c/<brand>` to a 404, and the only other evidence is a log line. Every
       * brand seeded by `seedStarterFunnelsForBrand` has exactly that pair.
       */
      checks.push(
        String(quizDeployment.status ?? '') === 'live'
          ? pass('embedded-quiz-live', 'The embedded quiz deployment is live')
          : fail(
              'embedded-quiz-live',
              'The embedded quiz deployment is live',
              `it is ${String(quizDeployment.status ?? 'draft')}, and this page does not serve without its form`,
            ),
      )
      const borrowed = await checkQuizTemplateRecord(ctx.payload, str(quizDeployment.template_id))
      checks.push({ ...borrowed, id: 'embedded-quiz-template', label: 'Embedded quiz visual template is available' })
      checks.push(...checkQuizGraph(quiz))
      checks.push(checkConsent(quiz, site))
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
