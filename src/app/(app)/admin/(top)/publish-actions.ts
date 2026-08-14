// @ts-nocheck -- the funnel-* collection slugs are not in the committed
// payload-types; run `pnpm generate:types` against a live database to restore
// typing. Everything this file delegates to is fully typed and checked.
'use server'

/**
 * Publishing and unpublishing, as dedicated authenticated actions.
 *
 * These replace writing a status string through a generic save. The difference
 * is not ceremony: a generic save ran no preflight, and the funnel deployment
 * collections are `isAuthenticated` on every verb, so any logged-in user could
 * put any tenant's deployment live on any path with any template.
 *
 * Every publish and every RESUME runs the full server-side preflight. Resume
 * matters as much as publish and is the one people leave out: a paused
 * deployment's world moves while it is paused — its template can be removed,
 * its domain detached, its path taken by something else — so "unpause" is a
 * fresh decision to serve traffic and is checked like one.
 *
 * Going DOWN is never gated. Something live that fails a check is exactly what
 * an operator most urgently needs to take offline, and a preflight standing
 * between them and that would be the worst possible time to be right.
 */

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'

import { getCurrentUser } from '@/lib/auth'
import { relationId } from '@/lib/authz'
import {
  decideTransition,
  lpDeploymentPreflight,
  quizDeploymentPreflight,
  type DeploymentStatus,
  type PublishOutcome,
} from '@/lib/publish-lifecycle'
import {
  groupPreflight,
  preflightSummary,
  type PreflightGroupResult,
  type PreflightResult,
} from '@/lib/publish-preflight'
import { lpDeploymentFingerprint, lpPublishState, type PublishState } from '@/lib/publish-state'

const QUIZ_PATH = '/admin/quizzes'
const LP_PATH = '/admin/landing-pages'

const load = async (payload, collection: string, id: unknown) => {
  const n = relationId(id)
  if (n === null) return null
  return payload.findByID({ collection, id: n, depth: 0, overrideAccess: true }).catch(() => null)
}

const statusOf = (row): DeploymentStatus => {
  const s = typeof row?.status === 'string' ? row.status : 'draft'
  return s === 'live' || s === 'paused' ? s : 'draft'
}

/**
 * What a publish attempt hands back.
 *
 * A refusal carries FOUR things and they are not interchangeable:
 *
 *   `groups`   the operator's answer — failed checks filed under the area and
 *              the editor tab that fixes each one. A UI must lead with this.
 *   `summary`  one line, for a toast or a log prefix.
 *   `error`    the flat join. Engineer-facing and the fallback for callers that
 *              predate the structure; never the primary thing on screen.
 *   `status`   what the row ACTUALLY holds now, which is the state it was in
 *              before the attempt. Without it a client that optimistically
 *              showed LIVE has nothing truthful to snap back to, which is how a
 *              rejected publish leaves a screen reading LIVE.
 */
export type PublishRefusalResult = {
  ok: false
  error: string
  summary: string
  groups: PreflightGroupResult[]
  preflight?: PreflightResult
  status?: DeploymentStatus
}

export type PublishResult =
  | { ok: true; status: DeploymentStatus; preflight: PreflightResult; publishState?: PublishState }
  | PublishRefusalResult

/**
 * A refusal that never reached a preflight — unauthenticated, missing row.
 *
 * Spelled out rather than left to callers so no door can return a bare
 * `{ ok: false, error }` that a grouped UI then has to special-case.
 */
const refusal = (error: string, status?: DeploymentStatus): PublishRefusalResult => ({
  ok: false,
  error,
  summary: error,
  groups: [],
  status,
})

/* ------------------------------------------------------------------- quizzes */

/**
 * Move a quiz deployment between draft, live and paused.
 *
 * The CURRENT status is read from the row rather than taken from the caller.
 * A caller-supplied `from` would let a stale browser tab drive an illegal
 * transition, and the row is the only thing that knows what is actually true.
 */
export async function setQuizDeploymentStatus(args: {
  id: string
  to: DeploymentStatus
}): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return refusal('unauthenticated')
  const payload = await getPayload({ config })

  const deployment = await load(payload, 'funnel-quiz-deployments', args.id)
  if (!deployment) return refusal('deployment not found')

  const siteId = relationId(deployment.site)
  const [quiz, site, domain] = await Promise.all([
    load(payload, 'funnel-quizzes', deployment.quiz),
    load(payload, 'sites', siteId),
    deployment.domain ? load(payload, 'domains', deployment.domain) : Promise.resolve(null),
  ])

  const preflight = await quizDeploymentPreflight(
    { payload, user, siteId },
    { deployment, quiz, site, domain },
  )

  // A preflight is only REQUIRED to go live, but it is always RUN: an operator
  // pausing something wants to know why, and the checks are the answer.
  const current = statusOf(deployment)
  const verdict: PublishOutcome = decideTransition(current, args.to, preflight)
  // `status: current` is the load-bearing part of a refusal: the row did not
  // move, and a caller that showed the hoped-for state needs the real one to
  // put back rather than a guess.
  if (!verdict.ok) return { ...verdict, preflight, status: current }

  await payload.update({
    collection: 'funnel-quiz-deployments',
    id: deployment.id,
    data: { status: verdict.status },
    user,
    overrideAccess: false,
    // The deployment-tenancy hook refuses a userful go-live that skipped the
    // preflight. This is the one door that just RAN it, so the write says so.
    context: { legalosPreflighted: true },
  })
  revalidatePath(QUIZ_PATH)
  return { ok: true, status: verdict.status, preflight }
}

/**
 * Publish or unpublish the brandless quiz itself.
 *
 * Unpublishing a quiz stops every deployment of it serving, because the public
 * resolvers check the parent at read time. It does NOT touch those deployments'
 * own status and it does not delete anything: republishing the quiz brings them
 * all back exactly as they were, which is the difference between taking
 * something down and dismantling it.
 */
export async function setQuizPublished(args: { id: string; published: boolean }): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return refusal('unauthenticated')
  const payload = await getPayload({ config })

  const quiz = await load(payload, 'funnel-quizzes', args.id)
  if (!quiz) return refusal('quiz not found')

  if (args.published && quiz.is_archived) {
    return refusal('this quiz is archived; restore it before publishing')
  }

  // A brandless quiz has no Site of its own, so the gate is its deployments':
  // publishing it makes every live deployment of it serve, and the caller must
  // administer each of those brands. A quiz with no deployments is authoring
  // work and anyone authenticated may publish it.
  const deps = await payload
    .find({ collection: 'funnel-quiz-deployments', where: { quiz: { equals: quiz.id } }, limit: 200, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] }))

  const empty: PreflightResult = { ok: true, checks: [], blocking: [], warnings: [] }
  if (args.published && deps.docs.length > 0) {
    const merged: PreflightResult = { ok: true, checks: [], blocking: [], warnings: [] }
    for (const d of deps.docs) {
      if (statusOf(d) !== 'live') continue
      const siteId = relationId(d.site)
      const [site, domain] = await Promise.all([
        load(payload, 'sites', siteId),
        d.domain ? load(payload, 'domains', d.domain) : Promise.resolve(null),
      ])
      const r = await quizDeploymentPreflight(
        { payload, user, siteId },
        // `is_published: true` is what we are ASKING for, so the parent check is
        // run against the intended state rather than the current one. Otherwise
        // publishing a quiz always fails on "the quiz is not published".
        { deployment: d, quiz: { ...quiz, is_published: true }, site, domain },
      )
      merged.checks.push(...r.checks)
      merged.blocking.push(...r.blocking)
      merged.warnings.push(...r.warnings)
    }
    merged.ok = merged.blocking.length === 0
    if (!merged.ok) {
      return {
        ok: false,
        error: `publishing this quiz would put ${merged.blocking.length} failing check(s) live: ${merged.blocking.map((c) => `${c.label}: ${c.detail}`).join('; ')}`,
        summary: `Publishing this quiz would put failing deployments live. ${preflightSummary(merged)}`,
        groups: groupPreflight(merged),
        preflight: merged,
      }
    }
  }

  await payload.update({
    collection: 'funnel-quizzes',
    id: quiz.id,
    data: { is_published: args.published },
    user,
    overrideAccess: false,
  })
  revalidatePath(QUIZ_PATH)
  return { ok: true, status: args.published ? 'live' : 'draft', preflight: empty }
}

/* ------------------------------------------------------------- landing pages */

export async function setLpDeploymentStatus(args: {
  id: string
  to: DeploymentStatus
}): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return refusal('unauthenticated')
  const payload = await getPayload({ config })

  const deployment = await load(payload, 'funnel-lp-deployments', args.id)
  if (!deployment) return refusal('deployment not found')

  const siteId = relationId(deployment.site)
  const [landingPage, site, domain] = await Promise.all([
    load(payload, 'funnel-landing-pages', deployment.landing_page),
    load(payload, 'sites', siteId),
    deployment.domain ? load(payload, 'domains', deployment.domain) : Promise.resolve(null),
  ])

  // The deployment's OWN flow first, the legacy standalone pointer only when
  // it has none — the resolver's order, because a preflight that reads the
  // legacy pointer alone reports "flow could not be loaded" for every
  // deployment bound the way the product now prefers.
  const quizDeploymentId = typeof deployment.quiz_deployment_id === 'string' ? deployment.quiz_deployment_id : ''
  const quizDeployment = quizDeploymentId ? await load(payload, 'funnel-quiz-deployments', quizDeploymentId) : null
  const ownQuizId = relationId(deployment.quiz)
  const quiz = ownQuizId !== null
    ? await load(payload, 'funnel-quizzes', ownQuizId)
    : quizDeployment
      ? await load(payload, 'funnel-quizzes', quizDeployment.quiz)
      : null

  const preflight = await lpDeploymentPreflight(
    { payload, user, siteId },
    { deployment, landingPage, site, domain, quizDeployment, quiz },
  )

  const current = statusOf(deployment)
  const verdict = decideTransition(current, args.to, preflight)
  if (!verdict.ok) return { ...verdict, preflight, status: current }

  /*
   * A GENUINE PUBLISH IS STAMPED; going down is not.
   *
   * The stamp is the digest of the row AS IT IS NOW — the state that just
   * passed the checks — so a later edit is detectable as unverified rather than
   * quietly inheriting this verdict. Pausing and unpublishing leave both columns
   * alone on purpose: they preserve the last state that genuinely passed, which
   * is what lets a paused row say "last published Tuesday" instead of losing
   * the fact that it ever was.
   */
  const data: Record<string, unknown> = { status: verdict.status }
  if (verdict.status === 'live') {
    data.last_published_at = new Date().toISOString()
    data.published_fingerprint = lpDeploymentFingerprint(deployment)
  }

  await payload.update({
    collection: 'funnel-lp-deployments',
    id: deployment.id,
    data,
    user,
    overrideAccess: false,
    // The deployment-tenancy hook refuses a userful go-live that skipped the
    // preflight. This is the one door that just RAN it, so the write says so.
    context: { legalosPreflighted: true },
  })
  revalidatePath(LP_PATH)
  return {
    ok: true,
    status: verdict.status,
    preflight,
    publishState: lpPublishState({ ...deployment, ...data }),
  }
}

export async function setLandingPagePublished(args: { id: string; published: boolean }): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return refusal('unauthenticated')
  const payload = await getPayload({ config })

  const lp = await load(payload, 'funnel-landing-pages', args.id)
  if (!lp) return refusal('landing page not found')

  const empty: PreflightResult = { ok: true, checks: [], blocking: [], warnings: [] }
  await payload.update({
    collection: 'funnel-landing-pages',
    id: lp.id,
    data: { is_published: args.published },
    user,
    overrideAccess: false,
  })
  revalidatePath(LP_PATH)
  return { ok: true, status: args.published ? 'live' : 'draft', preflight: empty }
}

/* ---------------------------------------------------------------- dry run */

/**
 * Run the preflight WITHOUT changing anything.
 *
 * So the deployment editor can show what would happen before an operator
 * commits, and so "why can I not publish this" has an answer that does not
 * require attempting it. The same function the real transition uses, because a
 * dry run that ran different checks would be a different question.
 */
export type PreflightPreview =
  | {
      ok: true
      preflight: PreflightResult
      /** The same failures, filed under the area and tab that fixes each. */
      groups: PreflightGroupResult[]
      summary: string
    }
  | { ok: false; error: string }

export async function previewQuizDeploymentPublish(args: { id: string }): Promise<PreflightPreview> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const deployment = await load(payload, 'funnel-quiz-deployments', args.id)
  if (!deployment) return { ok: false, error: 'deployment not found' }
  const siteId = relationId(deployment.site)
  const [quiz, site, domain] = await Promise.all([
    load(payload, 'funnel-quizzes', deployment.quiz),
    load(payload, 'sites', siteId),
    deployment.domain ? load(payload, 'domains', deployment.domain) : Promise.resolve(null),
  ])
  const preflight = await quizDeploymentPreflight({ payload, user, siteId }, { deployment, quiz, site, domain })
  return { ok: true, preflight, groups: groupPreflight(preflight), summary: preflightSummary(preflight) }
}

export async function previewLpDeploymentPublish(args: { id: string }): Promise<PreflightPreview> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const deployment = await load(payload, 'funnel-lp-deployments', args.id)
  if (!deployment) return { ok: false, error: 'deployment not found' }
  const siteId = relationId(deployment.site)
  const quizDeploymentId = typeof deployment.quiz_deployment_id === 'string' ? deployment.quiz_deployment_id : ''
  const [landingPage, site, domain, quizDeployment] = await Promise.all([
    load(payload, 'funnel-landing-pages', deployment.landing_page),
    load(payload, 'sites', siteId),
    deployment.domain ? load(payload, 'domains', deployment.domain) : Promise.resolve(null),
    quizDeploymentId ? load(payload, 'funnel-quiz-deployments', quizDeploymentId) : Promise.resolve(null),
  ])
  // Own flow first, legacy pointer second — the resolver's order.
  const ownQuizId = relationId(deployment.quiz)
  const quiz = ownQuizId !== null
    ? await load(payload, 'funnel-quizzes', ownQuizId)
    : quizDeployment
      ? await load(payload, 'funnel-quizzes', quizDeployment.quiz)
      : null
  const preflight = await lpDeploymentPreflight(
    { payload, user, siteId },
    { deployment, landingPage, site, domain, quizDeployment, quiz },
  )
  return { ok: true, preflight, groups: groupPreflight(preflight), summary: preflightSummary(preflight) }
}
