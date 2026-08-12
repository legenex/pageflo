/**
 * The authorization seam for server actions.
 *
 * Payload's collection access rules protect the DATABASE. They do not protect an
 * action, because an action can read with `overrideAccess: true`, branch on what
 * it read, and launch background work — all before any access-checked write is
 * reached. Several actions in this repo did exactly that, so the write threw
 * while the damage was already done.
 *
 * Two rules make that class of bug unreachable rather than merely absent:
 *
 *  1. DERIVE, NEVER ACCEPT. The Site a record belongs to is read off the record.
 *     An action must not take `siteId` from its caller and trust it. Every helper
 *     here returns the id it derived, so the caller has no reason to keep the one
 *     it was handed. `setPrimary` demoted every primary domain on a
 *     caller-supplied `siteId` with `overrideAccess: true`; there was no bug in
 *     the check, there was no check, because the shape invited none.
 *
 *  2. AUTHORIZE BEFORE SIDE EFFECTS, NOT BEFORE THE WRITE. The gate goes above
 *     any fetch, any Plesk call, any detached promise. `recheckDomainDns`
 *     launched the SSL poller — which runs wholly under `overrideAccess: true`
 *     and can publish a Site — and only then performed its scoped write.
 *
 * `isBoundToSite` in `auth.ts` answers "is this user attached to that Site". It
 * is the primitive. These helpers are the thing actions should call, because
 * they also resolve WHICH Site is at stake, which is the half that was missing.
 */
import type { Payload } from 'payload'

import type { AuthedUser } from '@/lib/auth'
import { isBoundToSite } from '@/lib/auth'
import type { Domain } from '@/payload-types'

/**
 * Deliberately shaped like the actions' own return type so a denial can be
 * returned directly rather than translated, which is where codes get softened.
 */
export type AuthzFailure = { ok: false; error: string }

export type SiteAuthz = { ok: true; siteId: number }

/**
 * A domain, plus the Site id derived from it. Never the caller's.
 *
 * The domain is the generated `Domain` type rather than a loose record, so a
 * caller that reaches for a field keeps its real type instead of `unknown` and
 * cannot quietly widen one back out.
 */
export type DomainAuthz = { ok: true; siteId: number; domain: Domain }

/**
 * The id of a Payload relationship field, whether populated or raw.
 * Returns null for an unset relationship, which callers must treat as "no Site",
 * never as "any Site".
 */
export const relationId = (rel: unknown): number | null => {
  if (rel === null || rel === undefined) return null
  // Both branches go through the same finite check. The object branch used to
  // skip it, so `{ id: 'abc' }` returned NaN and `''`/`false`/`{ id: [] }`
  // returned 0 — neither of which is an id, and both of which contradict this
  // function's own contract. NaN never authorizes (NaN === NaN is false), but 0
  // is a real comparison: `Number(null)` is also 0, so a binding row with a null
  // site would have matched a caller who sent an empty form field.
  const raw = typeof rel === 'object' ? (rel as { id?: unknown }).id : rel
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') return null
  // Trimmed, not just compared to '': `Number('   ')` is 0 too, and so is
  // `Number(null)`, so a whitespace-only form field would have matched a binding
  // row whose site was null.
  if (typeof raw === 'string' && raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Gate an action on the caller administering `siteId`.
 *
 * Use this only where the Site is genuinely the subject of the action (creating
 * a deployment on a Site the operator picked). Where the Site can be read off an
 * existing record, use the helpers below instead: a check on a caller-supplied
 * id proves the caller can administer SOME site, not that this record is theirs.
 */
export const requireSiteAdmin = (user: AuthedUser | null, siteId: unknown): SiteAuthz | AuthzFailure => {
  if (!user) return { ok: false, error: 'unauthenticated' }
  const id = relationId(siteId)
  if (id === null) return { ok: false, error: 'no site specified' }
  if (!isBoundToSite(user, id)) return { ok: false, error: 'not authorized for this brand' }
  return { ok: true, siteId: id }
}

/**
 * Load a Domain and authorize the caller against the Site the domain itself
 * names. An unattached pool domain has no Site to authorize against, so it is
 * refused here and handled by `requirePoolDomain`.
 */
export const requireDomainSiteAdmin = async (
  payload: Payload,
  user: AuthedUser | null,
  domainId: unknown,
): Promise<DomainAuthz | AuthzFailure> => {
  if (!user) return { ok: false, error: 'unauthenticated' }
  const id = relationId(domainId)
  if (id === null) return { ok: false, error: 'invalid domain' }

  let domain: Domain | null = null
  try {
    domain = await payload.findByID({ collection: 'domains', id, overrideAccess: true })
  } catch {
    domain = null
  }
  // Same message for absent and forbidden. A distinguishable "not found" turns
  // this into an oracle for which domain ids exist on other tenants.
  if (!domain) return { ok: false, error: 'domain not found' }

  const siteId = relationId(domain.site)
  if (siteId === null) return { ok: false, error: 'domain is not attached to a brand' }
  if (!isBoundToSite(user, siteId)) return { ok: false, error: 'domain not found' }

  return { ok: true, siteId, domain }
}

/**
 * Load a Domain that must still be unattached, for the attach flow.
 *
 * Attaching is the one case where the Site legitimately comes from the caller,
 * because the record does not name one yet. The caller's id is therefore checked
 * against the caller's own bindings, which is what `attachDomainToSite` never
 * did: it wrote `site: args.siteId` with `overrideAccess: false`, and Payload
 * evaluated access against the row's CURRENT (site-less) state, so the incoming
 * value went unchecked by construction.
 */
export const requirePoolDomain = async (
  payload: Payload,
  user: AuthedUser | null,
  domainId: unknown,
  targetSiteId: unknown,
): Promise<DomainAuthz | AuthzFailure> => {
  const gate = requireSiteAdmin(user, targetSiteId)
  if (!gate.ok) return gate

  const id = relationId(domainId)
  if (id === null) return { ok: false, error: 'invalid domain' }

  let domain: Domain | null = null
  try {
    domain = await payload.findByID({ collection: 'domains', id, overrideAccess: true })
  } catch {
    domain = null
  }
  if (!domain) return { ok: false, error: 'domain not found' }

  // "Already attached" must not be said about a domain the caller cannot see.
  // Returning it unconditionally made this an oracle over the whole domain id
  // space: probe an id with your own siteId, and the message told you whether
  // that id existed and was somebody's. It is only said when the caller is bound
  // to the Site that holds it, which is the case where it is also useful.
  const attachedTo = relationId(domain.site)
  if (attachedTo !== null) {
    return isBoundToSite(user, attachedTo)
      ? { ok: false, error: 'domain is already attached to a brand' }
      : { ok: false, error: 'domain not found' }
  }

  return { ok: true, siteId: gate.siteId, domain }
}

/**
 * Authorize a deployment write.
 *
 * The three funnel deployment collections are `isAuthenticated` on every verb,
 * so `overrideAccess: false` buys nothing there — any logged-in user passed
 * Payload's gate. Both the Site being written AND, for an update, the Site
 * currently on the row must belong to the caller; checking only the incoming one
 * would let a deployment be moved OFF a tenant, and checking only the existing
 * one would let it be moved ON to a tenant.
 */
export const requireDeploymentSiteAdmin = async (
  payload: Payload,
  user: AuthedUser | null,
  args: { collection: string; existingId?: unknown; incomingSiteId: unknown },
): Promise<SiteAuthz | AuthzFailure> => {
  const incoming = requireSiteAdmin(user, args.incomingSiteId)
  if (!incoming.ok) return incoming

  const existingId = relationId(args.existingId)
  if (existingId === null) return incoming

  let existing: Record<string, unknown> | null = null
  try {
    existing = (await payload.findByID({
      collection: args.collection as never,
      id: existingId,
      overrideAccess: true,
    })) as Record<string, unknown> | null
  } catch {
    existing = null
  }
  if (!existing) return { ok: false, error: 'deployment not found' }

  const currentSiteId = relationId(existing.site)
  if (currentSiteId !== null && !isBoundToSite(user, currentSiteId)) {
    return { ok: false, error: 'deployment not found' }
  }
  return incoming
}
