import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getCurrentUser } from '@/lib/auth'
import { executeWebhookNode, methodOf, interpolateJson, type WebhookNode } from '@/lib/quiz-webhook/execute'
import { decideTier } from '@/lib/quiz-webhook/tier'

export const dynamic = 'force-dynamic'

/**
 * "Run Test" in the webhook editor, executed the way PRODUCTION executes it.
 *
 * WHY THIS EXISTS. The builder's test button fetched the endpoint FROM THE
 * ADMIN'S BROWSER, and it interpolated the URL. Production does neither: the URL
 * is sent verbatim, the request leaves the server, and the response is read
 * through `responseMappings` and then through the tier rule. So a node could
 * test green and fail in production, and one did — the shipped MVA tier lookup
 * answers 405 to the server while a browser test against the same address
 * showed an app that loads.
 *
 * A test that runs a different code path from the thing it is testing is worse
 * than no test, because it is believed. This runs `executeWebhookNode`, the same
 * function the public endpoint calls, and reports what production would actually
 * have: the transport verdict, the mapped fields, and whether the tier that came
 * back would steer routing.
 *
 * SAFER THAN WHAT IT REPLACES, not more dangerous. The old path issued the
 * request from an operator's browser, inside whatever network that machine sits
 * on, with no guard at all. This one goes through `safePost`, so a URL naming a
 * private, loopback, link-local or metadata address is refused before a socket
 * is opened. It is authenticated, and it returns only the mapped fields — never
 * the provider's body — for the same reason the public endpoint does.
 */

const HeaderSchema = z.object({ key: z.string().max(120), value: z.string().max(2000) })

const Body = z.object({
  url: z.string().min(1).max(2000),
  method: z.string().max(10).optional(),
  payload: z.string().max(20_000).optional(),
  headers: z.array(HeaderSchema).max(30).optional(),
  responseMappings: z.array(z.object({ jsonPath: z.string().max(200), fieldKey: z.string().max(120) })).max(30).optional(),
  values: z.record(z.unknown()).optional(),
  /** The tier ids the quiz declares, so the answer can be judged as the runtime judges it. */
  tiers: z.array(z.string().max(40)).max(50).optional(),
})

// The same in-process shape as the public endpoint's, and the same honesty about
// it: one `next start` per host, so this is not distributed and is not claimed
// to be. It is here because an authenticated operator holding down a button is
// still an outbound request generator.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20
const hits = new Map<string, { count: number; resetAt: number }>()

const rateLimited = (key: string): boolean => {
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    if (hits.size > 2000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
    return false
  }
  cur.count += 1
  return cur.count > RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  if (rateLimited(String((user as { id?: unknown }).id ?? 'unknown'))) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const { url, method, payload, headers, responseMappings, values: rawValues, tiers } = parsed.data
  const values = (rawValues ?? {}) as Record<string, unknown>

  // Shaped as the stored node is, so the executor cannot tell a test from a
  // visitor. That is the entire point.
  const node: WebhookNode = {
    id: 'test',
    type: 'webhook',
    webhookUrl: url,
    webhookMethod: method,
    webhookPayload: payload ?? '',
    webhookHeaders: headers ?? [],
    responseMappings: responseMappings ?? [],
  }

  const started = Date.now()
  const outcome = await executeWebhookNode(node, values)
  const elapsedMs = Date.now() - started

  // What the request LOOKED like, so an operator can see the JSON-safe
  // substitution rather than assume the textual one they typed.
  const sent = {
    url,
    method: methodOf(node),
    body: interpolateJson(payload ?? '', values),
  }

  if (!outcome.ok) {
    return NextResponse.json({
      ok: false,
      elapsedMs,
      sent,
      code: outcome.code,
      reason: outcome.reason,
      status: outcome.status ?? null,
    })
  }

  // The same judgement the runtime makes. A provider can answer 200 with valid
  // JSON and still not move the visitor anywhere, which is the failure mode an
  // HTTP-status-only test cannot show.
  const decision = decideTier({
    returned: outcome.fields.tier,
    declared: (tiers ?? []).map((id) => ({ id })),
    current: '',
  })

  return NextResponse.json({
    ok: true,
    elapsedMs,
    sent,
    called: outcome.called,
    fields: outcome.fields,
    tier: {
      returned: outcome.fields.tier ?? null,
      routes: decision.fromProvider,
      declared: (tiers ?? []),
      rejected: decision.rejected,
    },
  })
}
