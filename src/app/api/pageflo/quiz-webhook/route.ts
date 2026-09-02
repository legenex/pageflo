import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { executeWebhookNode, EXECUTABLE_NODE_TYPES, type WebhookNode } from '@/lib/quiz-webhook/execute'
import { resolveSiteByHost } from '@/lib/site-resolver'
import { trustedHost } from '@/lib/trusted-host'
import { reportError } from '@/lib/observability/report'

export const dynamic = 'force-dynamic'

/**
 * Runs one webhook / verification node of a quiz flow for a public visitor.
 *
 * WHY THIS EXISTS. The public runtime treated `webhook` and `verification`
 * nodes as invisible and advanced straight past them without calling anything.
 * That is not a cosmetic gap: in the shipped MVA flow the ONLY thing that
 * assigns tiers 1, 2 and 4 is this node's response mapping (`tier`), so every
 * visitor walked the flow with no tier, every tier-scoped question variant was
 * dead, and the quiz silently qualified nobody above the single tier one answer
 * happens to set by hand. The flow validator was reporting exactly this as
 * `route_depends_on_unapplied_response`.
 *
 * WHY SERVER-SIDE. The same shape as `quiz-ai`, for the same reasons:
 *
 *  - The URL, method, headers and payload template are NEVER accepted from the
 *    client. They are read out of the node stored on the quiz, addressed only
 *    by deployment id + node id. A visitor cannot aim this at an address of
 *    their choosing, which is what makes it a feature and not an open proxy.
 *  - Only answer VALUES come from the client, and only into `{{placeholders}}`
 *    the flow author already wrote. The URL is deliberately NOT interpolated:
 *    substituting visitor input into the destination would hand the visitor the
 *    request, which is the whole thing this design refuses.
 *  - `safePost` guards the private network, so an author who types
 *    `http://169.254.169.254/` in the builder gets a refusal rather than the
 *    cloud metadata service. It also refuses redirects, so the payload cannot
 *    be bounced somewhere nobody configured.
 *  - ONLY the fields named in `responseMappings` come back. The response body
 *    is never returned wholesale, so this cannot be used to read an internal
 *    endpoint's output even if one were somehow reachable.
 *  - A draft/paused deployment and an unpublished/archived quiz are refused.
 *
 * FAILURE IS NOT FATAL. Every error path returns `ok: false` and the runtime
 * continues the flow unrouted. A visitor mid-funnel must never be dead-ended by
 * a buyer's endpoint being down; a lead with no tier is worth more than no lead.
 *
 * KNOWN LIMIT, stated rather than hidden: header templates interpolate from the
 * same visitor value bag as the payload (the seeded HLR node ships an
 * `Authorization: Bearer {{twilio_token}}` header). No quiz answer writes such
 * a key, so it resolves empty today. Real per-brand secrets need a credential
 * store the author references by name; until that exists, do not put a secret
 * in a header template and expect the runtime to supply it.
 */

const Body = z.object({
  deployment_id: z.string().min(1).max(32),
  node_id: z.string().min(1).max(64),
  values: z.record(z.unknown()).optional(),
})

// In-process rate limiter, same scope and honesty as quiz-ai's: one `next start`
// process per host, so this is not distributed and is not claimed to be.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30
const hits = new Map<string, { count: number; resetAt: number }>()

const rateLimited = (key: string): boolean => {
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
    }
    return false
  }
  cur.count += 1
  return cur.count > RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  const { deployment_id, node_id } = parsed.data
  const values = (parsed.data.values ?? {}) as Record<string, unknown>

  const payload = await getPayload({ config })

  // A quiz embedded in a landing page has no row of its own: `resolveEmbeddedQuiz`
  // synthesises the id `lp:<lpDeploymentId>` so it cannot collide with a real
  // deployment. Looking that up as an integer fails, which is how the first cut
  // of this endpoint left every LP-embedded quiz exactly as broken as before -
  // and the LP embed is the binding the product now prefers.
  const embeddedLpId = deployment_id.startsWith('lp:') ? deployment_id.slice(3) : ''

  const dep = (await payload
    .findByID({
      collection: embeddedLpId ? 'funnel-lp-deployments' : 'funnel-quiz-deployments',
      id: embeddedLpId || deployment_id,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as Record<string, unknown> | null
  if (!dep || dep.status !== 'live') {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  // The deployment must belong to the Site whose host is serving this request.
  // Without it, a deployment id is a bearer token for somebody else's funnel:
  // anyone could walk the integers and make this server POST to another
  // tenant's buyer endpoint, carrying that tenant's configured headers, with a
  // body of the caller's choosing.
  //
  // That binding is only worth anything if the host cannot be asserted by the
  // caller, and it used to be: this route read `x-legalos-host`, which
  // middleware never stamps on `/api/*`, so the value was whatever the POST
  // carried. Now the host comes from the connection. See src/lib/trusted-host.ts.
  const host = trustedHost(req)
  const site = await resolveSiteByHost(host)
  const depSite = dep.site == null ? '' : typeof dep.site === 'object' ? String((dep.site as { id: unknown }).id) : String(dep.site)
  if (!site || !depSite || String(site.siteId) !== depSite) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  // Both collections name the flow in `quiz`; on an LP deployment that is the
  // embedded-flow binding the runtime is actually walking.
  const quizId = dep.quiz == null ? '' : typeof dep.quiz === 'object' ? String((dep.quiz as { id: unknown }).id) : String(dep.quiz)
  if (!quizId) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const quiz = (await payload
    .findByID({ collection: 'funnel-quizzes', id: quizId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null
  if (!quiz || !quiz.is_published || quiz.is_archived) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const nodes = Array.isArray(quiz.nodes) ? (quiz.nodes as WebhookNode[]) : []
  const node = nodes.find((n) => String(n.id) === node_id)
  if (!node || !EXECUTABLE_NODE_TYPES.has(String(node.type))) {
    return NextResponse.json({ ok: false, error: 'node is not a webhook or verification node' }, { status: 400 })
  }

  // Everything that decides what a provider's answer MEANS lives in
  // `lib/quiz-webhook/execute`, where it can be exercised against a timeout, an
  // HTML response, a 500 and an unknown tier without a database or a network.
  // This handler's job is the parts that need a request: who is asking, whose
  // deployment it is, and how loudly to fail.
  const outcome = await executeWebhookNode(node, values)

  if (!outcome.ok) {
    if (outcome.code === 'not_executable') {
      return NextResponse.json({ ok: false, error: 'node is not a webhook or verification node' }, { status: 400 })
    }
    // Through the one reporter, so this is greppable, groupable and - once a
    // destination is chosen - forwarded, rather than being a line in a log
    // whose wording is unique to this file.
    reportError('integration', `quiz-webhook ${outcome.code}: ${outcome.reason}`, {
      siteId: site.siteId,
      route: 'POST /api/pageflo/quiz-webhook',
      operation: `quiz-webhook:${node_id}`,
      extra: { status: outcome.status ?? null, deployment: deployment_id },
    })
    return NextResponse.json({ ok: false, error: 'webhook unavailable' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, fields: outcome.fields })
}
