import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'

/*
 * `@payload-config` is imported LAZILY, inside the one function that needs it.
 * This module is imported (via `lib/authz`) by collection hooks that
 * `payload.config.ts` itself imports, so a static import here closes the
 * circle `auth → config → collections → hooks → auth`. The dev bundler
 * tolerates that; the production chunker evaluates the ring in an order that
 * throws `Cannot access before initialization` from the sign-in action. A
 * dynamic import defers config resolution to call time, when the ring has
 * long finished evaluating.
 */
const payloadClient = async () => {
  const { default: config } = await import('@payload-config')
  return getPayload({ config })
}

export type AuthedUser = {
  id: string | number
  email: string
  name?: string | null
  super_admin?: boolean | null
  siteBindings?: Array<{ site: { id: string | number; name: string; slug: string } | string | number; role: 'admin' | 'editor' | 'analyst' }> | null
}

export const getCurrentUser = async (): Promise<AuthedUser | null> => {
  const headers = await nextHeaders()
  const payload = await payloadClient()
  const { user } = await payload.auth({ headers })
  return (user ?? null) as AuthedUser | null
}

/**
 * True if the user may act on the given Site: super admins always, otherwise
 * the user must have a siteBindings entry for that Site. Handles bindings whose
 * `site` is either a populated object or a raw id.
 */
export const isBoundToSite = (user: AuthedUser | null, siteId: string | number): boolean => {
  if (!user) return false
  if (user.super_admin) return true
  return (user.siteBindings ?? []).some((b) => {
    const bound = typeof b.site === 'object' && b.site ? b.site.id : b.site
    return Number(bound) === Number(siteId)
  })
}
