import type { Access, AccessArgs, FieldAccess } from 'payload'

import { relationId } from '@/lib/authz'

type UserLike = {
  id: string | number
  super_admin?: boolean | null
  /**
   * `site` is a POPULATED OBJECT here, not an id.
   *
   * `Users.auth` sets no `depth`, so Payload applies `config.defaultDepth` (2)
   * when it reads the user onto the request. Every one of these rules therefore
   * receives `{ site: { id, name, slug, brand: {...}, ... } }`.
   */
  siteBindings?: Array<{ site: string | number | { id: string | number }; role: 'admin' | 'editor' | 'analyst' }> | null
}

const getUser = (args: AccessArgs): UserLike | null => (args.req?.user as UserLike) ?? null

export const isSuperAdmin: Access = (args) => Boolean(getUser(args)?.super_admin)

export const isSuperAdminField: FieldAccess = ({ req }) => Boolean((req?.user as UserLike)?.super_admin)

export const isAuthenticated: Access = (args) => Boolean(getUser(args))

/**
 * The Site ids a user holds at or above `minRole`.
 *
 * This mapped `b.site` straight through, which put a populated Site OBJECT into
 * the `{ site: { in: [...] } }` filter these rules return. The drizzle adapter
 * coerces a query value with `Number(...)`, so every entry became `NaN` and the
 * filter matched no rows at all.
 *
 * The effect was not a leak, it was the opposite and it was total: every
 * site-scoped read and write failed for every non-super-admin, on every scoped
 * collection. Verified against a real login on a scratch database — a user bound
 * `admin` to a Site could not update that Site ("You are not allowed to perform
 * this action"). It reads as a permissions bug in whatever feature you happen to
 * be using, which is why it survived: the rule was never wrong about who should
 * be allowed, only about what shape an id is.
 */
const siteIdsForUser = (user: UserLike | null, minRole?: 'admin' | 'editor' | 'analyst'): number[] => {
  if (!user?.siteBindings) return []
  const rank: Record<string, number> = { analyst: 1, editor: 2, admin: 3 }
  const min = rank[minRole ?? 'analyst']
  return user.siteBindings
    .filter((b) => rank[b.role] >= min)
    .map((b) => relationId(b.site))
    .filter((id): id is number => id !== null)
}

export const siteScopedRead: Access = (args) => {
  const user = getUser(args)
  if (!user) return false
  if (user.super_admin) return true
  const siteIds = siteIdsForUser(user, 'analyst')
  if (siteIds.length === 0) return false
  return { site: { in: siteIds } }
}

export const siteScopedWrite: Access = (args) => {
  const user = getUser(args)
  if (!user) return false
  if (user.super_admin) return true
  const siteIds = siteIdsForUser(user, 'editor')
  if (siteIds.length === 0) return false
  return { site: { in: siteIds } }
}

export const siteScopedAdmin: Access = (args) => {
  const user = getUser(args)
  if (!user) return false
  if (user.super_admin) return true
  const siteIds = siteIdsForUser(user, 'admin')
  if (siteIds.length === 0) return false
  return { site: { in: siteIds } }
}

export const anyAuthenticatedRead: Access = (args) => Boolean(getUser(args))
