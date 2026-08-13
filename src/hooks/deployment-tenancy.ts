/**
 * Tenant scoping for the three funnel DEPLOYMENT collections, on every door.
 *
 * `funnel-lp-deployments`, `funnel-quiz-deployments` and
 * `funnel-advertorial-deployments` are `isAuthenticated` on every verb, so
 * `overrideAccess: false` buys nothing there: any logged-in user passes
 * Payload's gate. The server actions close that with
 * `requireDeploymentSiteAdmin`, but an action-only rule is a rule the other
 * doors do not have — raw REST (`PATCH /api/funnel-lp-deployments/:id`), the
 * raw `/cms` admin, and any local-API call that carries a user all walked
 * straight past it. A deployment BINDS a tenant (`site`), which made those
 * doors a cross-tenant write path. Same reasoning as `template-guards.ts` and
 * `enforce-site-binding.ts`: a hook is the only check that covers every writer.
 *
 * READ deliberately stays `isAuthenticated` at the collection layer. The funnel
 * builders are cross-brand screens today — one list, an operator picks a brand
 * per deployment — so scoping reads would blank the UIs without closing a write
 * path, and deployment rows carry config and copy, not lead PII. Revisit if the
 * builders ever grow per-tenant views.
 *
 * WHO IS EXEMPT, and why that is safe (the `enforce-site-binding.ts` rule):
 *  - a request with NO user is a system path — seeds, migrations,
 *    `ensureFunnelSamples`, the template-records reconciler, the resolvers.
 *    Those already run as trusted server code with `overrideAccess: true`, and
 *    constraining them to bindings nobody holds would break provisioning
 *    without closing anything. Gating ONLY `req.user` requests keeps them
 *    working by construction.
 *  - a super admin is bound to every Site (`isBoundToSite`), so the mirror of
 *    that rule here is a straight bypass.
 *
 * MUST AGREE WITH `requireDeploymentSiteAdmin` (src/lib/authz.ts): any-role
 * binding qualifies, BOTH ends of an update are checked (else a deployment can
 * be moved off of or onto a tenant), an orphan row (`site: null`) is nobody's,
 * and row-derived refusals reuse the same "deployment not found" wording so
 * neither layer is an oracle the other is not. The logic is restated rather
 * than imported because collection hooks must not import `lib/authz`: its
 * chain (`authz → auth → payload.config → collections → hooks`) closes the
 * circular import that took the production sign-in down. Only the LEAF,
 * `lib/relation-id`, is safe from here — see relation-id.ts for the incident.
 */
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

import { relationId } from '@/lib/relation-id'

type UserLike = {
  super_admin?: boolean | null
  siteBindings?: Array<{ site: unknown }> | null
}

/**
 * `isBoundToSite`, restated without the import that would close the ring.
 * Any binding role qualifies — deployment authorship is gated the same way the
 * server actions gate it, so this door can never refuse what an action allows.
 */
const isBound = (user: UserLike, siteId: number): boolean =>
  (user.siteBindings ?? []).some((b) => relationId(b.site) === siteId)

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * Create/update tenancy, plus (where the collection has a publish preflight)
 * the rule that going LIVE only happens through the door that ran it.
 *
 * @param publishRequiresPreflight `true` on `funnel-lp-deployments` and
 *   `funnel-quiz-deployments`, whose one gated publish door
 *   (`setLpDeploymentStatus` / `setQuizDeploymentStatus`) runs the full
 *   preflight and marks its write with `context: { legalosPreflighted: true }`.
 *   A userful write that flips a non-live row to `live` WITHOUT that marker is
 *   a raw REST/`/cms` publish skipping the preflight, and is refused. `false`
 *   on advertorial deployments, which have no preflight door — refusing there
 *   would make advertorials unpublishable rather than safer. Going DOWN
 *   (live → paused/draft) is never gated: taking a failing page offline must
 *   not be blocked, and a row already live stays live through content edits.
 */
export const enforceDeploymentTenancy =
  ({ publishRequiresPreflight }: { publishRequiresPreflight: boolean }): CollectionBeforeChangeHook =>
  ({ data, req, operation, originalDoc }) => {
    const user = req.user as UserLike | null | undefined
    if (!user) return data
    if (user.super_admin) return data

    const incomingData = asRecord(data)

    if (operation === 'create') {
      const incoming = relationId(incomingData.site)
      // A userful create with no Site would mint an orphan row, which every
      // gate then treats as nobody's. Refuse it here, where the writer can fix
      // it, rather than storing a row only a super admin can touch again.
      if (incoming === null) throw new APIError('no site specified', 400)
      if (!isBound(user, incoming)) throw new APIError('not authorized for this brand', 403)
    } else {
      // UPDATE: the row's CURRENT Site is the subject even when the write does
      // not touch `site` — editing another tenant's deployment in place is
      // exactly the write this hook exists to stop. An orphan row is nobody's,
      // and absent, orphaned and forbidden all share one message, mirroring
      // `requireDeploymentSiteAdmin`, so a probe learns nothing about which
      // ids exist on other tenants.
      const current = relationId(asRecord(originalDoc).site)
      if (current === null || !isBound(user, current)) throw new APIError('deployment not found', 404)

      if ('site' in incomingData) {
        const incoming = relationId(incomingData.site)
        // Detaching a deployment from its tenant is not an edit anyone's UI
        // performs; a null here is either a bug or an attempt to orphan.
        if (incoming === null) throw new APIError('no site specified', 400)
        // Moving BETWEEN tenants needs the binding on both ends — the current
        // Site was checked above, the destination is checked here.
        if (!isBound(user, incoming)) throw new APIError('not authorized for this brand', 403)
      }
    }

    if (publishRequiresPreflight) {
      const requested = incomingData.status
      const previous = operation === 'update' ? String(asRecord(originalDoc).status ?? 'draft') : 'draft'
      if (requested === 'live' && previous !== 'live' && req.context?.legalosPreflighted !== true) {
        throw new APIError(
          'going live runs the publish preflight; use the publish action rather than writing status directly',
          403,
        )
      }
    }

    return data
  }

/**
 * Delete tenancy: the row being deleted is the subject — a delete carries no
 * incoming Site, so the record's own is what the caller must administer.
 * Fails CLOSED: a row that cannot be loaded cannot be shown to be the
 * caller's, and a genuinely missing row was going to 404 anyway.
 */
export const enforceDeploymentTenancyOnDelete: CollectionBeforeDeleteHook = async ({ req, id, collection }) => {
  const user = req.user as UserLike | null | undefined
  if (!user) return
  if (user.super_admin) return

  const row = (await req.payload
    .findByID({ collection: collection.slug as never, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { site?: unknown } | null
  const owner = row ? relationId(row.site) : null
  if (owner === null || !isBound(user, owner)) throw new APIError('deployment not found', 404)
}
