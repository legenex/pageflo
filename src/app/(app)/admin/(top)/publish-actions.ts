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
import type { PreflightResult } from '@/lib/publish-preflight'

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

export type PublishResult =
  | { ok: true; status: DeploymentStatus; preflight: PreflightResult }
  | { ok: false; error: string; preflight?: PreflightResult }

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

  const preflight = await quizDeploymentPreflight(
    { payload, user, siteId },
    { deployment, quiz, site, domain },
  )

  // A preflight is only REQUIRED to go live, but it is always RUN: an operator
  // pausing something wants to know why, and the checks are the answer.
  const verdict: PublishOutcome = decideTransition(statusOf(deployment), args.to, preflight)
  if (!verdict.ok) return { ok: false, error: verdict.error, preflight }

  await payload.update({
    collection: 'funnel-quiz-deployments',
    id: deployment.id,
    data: { status: verdict.status },
    user,
    overrideAccess: false,
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
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  const quiz = await load(payload, 'funnel-quizzes', args.id)
  if (!quiz) return { ok: false, error: 'quiz not found' }

  if (args.published && quiz.is_archived) {
    return { ok: false, error: 'this quiz is archived; restore it before publishing' }
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
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  const deployment = await load(payload, 'funnel-lp-deployments', args.id)
  if (!deployment) return { ok: false, error: 'deployment not found' }

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

  const verdict = decideTransition(statusOf(deployment), args.to, preflight)
  if (!verdict.ok) return { ok: false, error: verdict.error, preflight }

  await payload.update({
    collection: 'funnel-lp-deployments',
    id: deployment.id,
    data: { status: verdict.status },
    user,
    overrideAccess: false,
  })
  revalidatePath(LP_PATH)
  return { ok: true, status: verdict.status, preflight }
}

export async function setLandingPagePublished(args: { id: string; published: boolean }): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  const lp = await load(payload, 'funnel-landing-pages', args.id)
  if (!lp) return { ok: false, error: 'landing page not found' }

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
export async function previewQuizDeploymentPublish(args: { id: string }): Promise<
  { ok: true; preflight: PreflightResult } | { ok: false; error: string }
> {
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
  return { ok: true, preflight: await quizDeploymentPreflight({ payload, user, siteId }, { deployment, quiz, site, domain }) }
}

export async function previewLpDeploymentPublish(args: { id: string }): Promise<
  { ok: true; preflight: PreflightResult } | { ok: false; error: string }
> {
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
  return {
    ok: true,
    preflight: await lpDeploymentPreflight({ payload, user, siteId }, { deployment, landingPage, site, domain, quizDeployment, quiz }),
  }
}
