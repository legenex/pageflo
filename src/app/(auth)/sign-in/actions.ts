'use server'

import { cookies, headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

export type SignInResult = { ok: true; redirect: string } | { ok: false; error: string }

export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const requestedRedirect = String(formData.get('redirect') ?? '/admin/overview')

  if (!email || !password) {
    return { ok: false, error: 'Enter your email and password.' }
  }

  // Only allow internal redirects to prevent open-redirect abuse.
  const safeRedirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//') ? requestedRedirect : '/admin/overview'

  let token: string | undefined
  let exp: number | undefined
  try {
    const payload = await getPayload({ config })
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    token = result.token
    exp = result.exp
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid credentials'
    return { ok: false, error: /credentials|invalid/i.test(msg) ? 'Invalid email or password.' : msg }
  }

  if (!token) return { ok: false, error: 'Login failed — no token returned.' }

  // Match Payload's session cookie shape exactly so middleware/auth on the next
  // request picks it up without having to re-implement Payload's cookie format.
  const cookiePrefix = (await getPayload({ config })).config.cookiePrefix ?? 'payload'
  const maxAge = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 60 * 60 * 24 * 7

  /*
   * `Secure` describes the CONNECTION, not the build mode.
   *
   * It was `NODE_ENV === 'production'`, which is right in production and wrong
   * everywhere else that runs a production build: the cookie is marked Secure,
   * the browser refuses to store it over plain HTTP, and the session silently
   * never exists. That is indistinguishable from a wrong password, which is
   * what it looked like.
   *
   * `X-Forwarded-Proto` is what the reverse proxy sets to say what the VISITOR
   * used, and it is the only value that is true about the outside of the
   * connection. Production behind nginx always carries `https`, so nothing
   * changes there. With no proxy at all the header is absent and the previous
   * rule applies unchanged, so a production deployment that somehow lost its
   * proxy still gets a Secure cookie rather than silently downgrading.
   */
  const requestHeaders = await headers()
  const forwardedProto = requestHeaders.get('x-forwarded-proto')?.split(',')[0].trim()
  const secure =
    forwardedProto === 'https' ||
    (forwardedProto === undefined && process.env.NODE_ENV === 'production')

  const cookieStore = await cookies()
  cookieStore.set({
    name: `${cookiePrefix}-token`,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })

  return { ok: true, redirect: safeRedirect }
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies()
  const payload = await getPayload({ config })
  const cookiePrefix = payload.config.cookiePrefix ?? 'payload'
  cookieStore.delete({ name: `${cookiePrefix}-token`, path: '/' })
}
