import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { reportError } from '@/lib/observability/report'

export const dynamic = 'force-dynamic'

/**
 * Where a browser reports a render that threw.
 *
 * The error boundaries are client components; the reporter — with its redaction,
 * its transports and its SSRF-guarded webhook — is server-side and stays there.
 * This is the one line between them.
 *
 * IT IS PUBLIC AND UNAUTHENTICATED, because the thing it reports is a public
 * page failing to render for somebody who was never logged in. So it is treated
 * as hostile input throughout: the body is bounded and shape-checked, the
 * message is redacted like any other, and it is rate-limited per address —
 * otherwise it is a free way to write arbitrary lines into an operator's log,
 * and eventually into whatever those logs are forwarded to.
 *
 * Nothing it accepts is trusted as a stack trace: browsers do not give one to an
 * error boundary anyway. What is useful, and what this exists for, is the DIGEST
 * — the hash Next also wrote into the server log for the same failure — which is
 * what lets somebody on the phone and somebody in the logs be sure they are
 * talking about the same event.
 */

const Body = z.object({
  message: z.string().max(1000),
  digest: z.string().max(120).nullable().optional(),
  route: z.string().max(500).nullable().optional(),
})

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const hits = new Map<string, { count: number; resetAt: number }>()

const rateLimited = (key: string): boolean => {
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
    return false
  }
  cur.count += 1
  return cur.count > RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  // A silent 204 rather than a 429: a browser reporting an error has nothing to
  // do with the answer, and telling a flooder they have been noticed is free
  // information.
  if (rateLimited(ip)) return new NextResponse(null, { status: 204 })

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const parsed = Body.safeParse(json)
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  reportError('render', parsed.data.message, {
    route: parsed.data.route ?? req.headers.get('referer'),
    operation: 'client-error-boundary',
    extra: {
      digest: parsed.data.digest ?? null,
      host: req.headers.get('x-legalos-host') ?? req.headers.get('host'),
    },
  })

  return new NextResponse(null, { status: 204 })
}
