/**
 * Enforce that a document's `site` is one the writer actually holds.
 *
 * Payload's `create` operation does NOT apply a returned `Where`. It calls
 * `executeAccess` and only tests the result for truthiness
 * (`payload/dist/auth/executeAccess.js`), so a rule returning
 * `{ site: { in: [1] } }` reads as "allowed" and the constraint is discarded.
 * `updateByID` and `deleteByID` do the opposite — they `combineQueries` the
 * constraint against the existing row — which is why this only bites on create
 * and why it looked like the scoping worked.
 *
 * Eight collections use a `siteScoped*` helper as their `create` rule, so on all
 * eight any authenticated user holding one binding could create a document on
 * ANY tenant's Site. On `Domains` that is the sharpest: a row with
 * `primary: true` on a victim's Site is picked up by the host resolver, which
 * takes `limit: 1` on the primary flag and drives that tenant's canonical host
 * and its 301s.
 *
 * The fix has to be a hook rather than a better access rule, because no access
 * rule can express it — the operation never consults the filter. `beforeValidate`
 * runs before the row exists and sees the incoming `data`, which is the only
 * place the incoming `site` can be compared to anything.
 *
 * Update is covered too, and deliberately: `combineQueries` constrains which ROW
 * may be updated, not what it may be changed TO, so without this a scoped update
 * could still move a document onto another tenant's Site.
 */
import type { CollectionBeforeValidateHook } from 'payload'

import { relationId } from '@/lib/authz'

type Role = 'admin' | 'editor' | 'analyst'

type UserLike = {
  super_admin?: boolean | null
  siteBindings?: Array<{ site: unknown; role: Role }> | null
}

const RANK: Record<Role, number> = { analyst: 1, editor: 2, admin: 3 }

const heldSiteIds = (user: UserLike, minRole: Role): number[] =>
  (user.siteBindings ?? [])
    .filter((b) => (RANK[b.role] ?? 0) >= RANK[minRole])
    .map((b) => relationId(b.site))
    .filter((id): id is number => id !== null)

/**
 * @param minRole the binding role required to place a document on a Site.
 *
 * Runs only for a request that carries a user and is not a super admin. A
 * request with no user is a system path — seeds, migrations, the starter-content
 * writer — which already has to pass `overrideAccess: true` to get here at all,
 * and constraining those to bindings nobody holds would break them without
 * closing anything: they are already trusted server code.
 */
export const enforceSiteBinding =
  (minRole: Role = 'editor'): CollectionBeforeValidateHook =>
  ({ data, req, operation, originalDoc }) => {
    const user = req?.user as UserLike | null | undefined
    if (!user) return data
    if (user.super_admin) return data
    if (operation !== 'create' && operation !== 'update') return data

    // An update that does not touch `site` keeps whatever the row already had;
    // the row itself was already constrained by the access filter.
    const incoming = data && 'site' in data ? relationId((data as { site?: unknown }).site) : null
    if (incoming === null) {
      if (operation === 'create') {
        // A scoped collection with no site on create would land NOT NULL-less or
        // unscoped depending on the column. Either way it is not this user's to
        // create, and silently allowing it is how an orphan row appears.
        const held = heldSiteIds(user, minRole)
        if (held.length === 0) throw new Error('You are not allowed to create records for this brand.')
      }
      return data
    }

    const held = heldSiteIds(user, minRole)
    if (!held.includes(incoming)) {
      // Deliberately the same wording Payload uses for a denied access rule, so
      // a probe cannot tell a rejected site id from a rejected operation.
      throw new Error('You are not allowed to perform this action.')
    }

    // Moving an existing document BETWEEN sites needs the binding on both ends.
    if (operation === 'update' && originalDoc) {
      const current = relationId((originalDoc as { site?: unknown }).site)
      if (current !== null && current !== incoming && !held.includes(current)) {
        throw new Error('You are not allowed to perform this action.')
      }
    }

    return data
  }
