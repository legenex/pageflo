import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { safePost } from '@/lib/net/ssrf'

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

/** A visitor's answer, flattened to the scalar a template can carry. */
const scalar = (v: unknown): string => {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(scalar).join(',')
  if (typeof v === 'object') return ''
  return String(v)
}

/** Substitute {{key}} from the visitor's answers, trimmed and length-capped. */
const interpolate = (template: string, values: Record<string, unknown>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => scalar(values[key]).slice(0, 500))

/**
 * Header values get the same substitution, then have anything that could start
 * a second header stripped. A newline in a header value is request splitting;
 * refusing to carry one costs nothing legitimate.
 */
const headerValue = (template: string, values: Record<string, unknown>): string =>
  interpolate(template, values)
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\x00-\x1f\x7f]/g, '')
    .slice(0, 1000)

/**
 * Read `a.b[0].c` out of a parsed JSON body.
 *
 * Returns undefined for anything missing rather than throwing, because a buyer
 * changing their response shape must degrade to "no tier" and not to a 500.
 */
const readJsonPath = (root: unknown, path: string): unknown => {
  const trimmed = path.trim()
  if (!trimmed) return undefined
  const parts = trimmed
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur: unknown = root
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

type NodeShape = {
  id?: unknown
  type?: unknown
  webhookUrl?: unknown
  webhookMethod?: unknown
  webhookPayload?: unknown
  webhookHeaders?: Array<{ key?: unknown; value?: unknown }>
  responseMappings?: Array<{ jsonPath?: unknown; fieldKey?: unknown }>
}

const EXECUTABLE_TYPES = new Set(['webhook', 'verification'])

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

  const dep = (await payload
    .findByID({ collection: 'funnel-quiz-deployments', id: deployment_id, depth: 0, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null
  if (!dep || dep.status !== 'live') {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const quizId = dep.quiz == null ? '' : typeof dep.quiz === 'object' ? String((dep.quiz as { id: unknown }).id) : String(dep.quiz)
  if (!quizId) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const quiz = (await payload
    .findByID({ collection: 'funnel-quizzes', id: quizId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null
  if (!quiz || !quiz.is_published || quiz.is_archived) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const nodes = Array.isArray(quiz.nodes) ? (quiz.nodes as NodeShape[]) : []
  const node = nodes.find((n) => String(n.id) === node_id)
  if (!node || !EXECUTABLE_TYPES.has(String(node.type))) {
    return NextResponse.json({ ok: false, error: 'node is not a webhook or verification node' }, { status: 400 })
  }

  const url = typeof node.webhookUrl === 'string' ? node.webhookUrl.trim() : ''
  const mappings = (Array.isArray(node.responseMappings) ? node.responseMappings : [])
    .map((m) => ({ jsonPath: String(m?.jsonPath ?? '').trim(), fieldKey: String(m?.fieldKey ?? '').trim() }))
    .filter((m) => m.jsonPath && m.fieldKey)

  // Nothing to call, or nothing to do with the answer: not an error, just a
  // node the flow can walk straight through.
  if (!url || mappings.length === 0) {
    return NextResponse.json({ ok: true, fields: {} })
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  for (const h of Array.isArray(node.webhookHeaders) ? node.webhookHeaders : []) {
    const key = String(h?.key ?? '').trim()
    if (!key || !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) continue
    headers[key] = headerValue(String(h?.value ?? ''), values)
  }

  const bodyText = interpolate(typeof node.webhookPayload === 'string' ? node.webhookPayload : '', values)

  // GET is honoured if the author chose it, but there is no body to send then.
  const method = String(node.webhookMethod ?? 'POST').toUpperCase()

  const res = await safePost(url, {
    headers,
    body: method === 'GET' ? '' : bodyText,
    // A visitor is on a spinner. A buyer's slow endpoint must not hold the
    // funnel open longer than a person will wait.
    timeoutMs: 6000,
    maxBytes: 256 * 1024,
  })

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[legalos] quiz-webhook ${node_id} failed: ${res.reason}`)
    return NextResponse.json({ ok: false, error: 'webhook unavailable' }, { status: 502 })
  }
  if (res.status < 200 || res.status >= 300) {
    // eslint-disable-next-line no-console
    console.error(`[legalos] quiz-webhook ${node_id} answered ${res.status}`)
    return NextResponse.json({ ok: false, error: 'webhook error' }, { status: 502 })
  }

  let body: unknown
  try {
    body = JSON.parse(res.body)
  } catch {
    return NextResponse.json({ ok: false, error: 'webhook did not return JSON' }, { status: 502 })
  }

  // ONLY the mapped fields. The response body never leaves this handler.
  const fields: Record<string, string> = {}
  for (const m of mappings) {
    const value = readJsonPath(body, m.jsonPath)
    if (value == null || typeof value === 'object') continue
    fields[m.fieldKey] = String(value).slice(0, 500)
  }

  return NextResponse.json({ ok: true, fields })
}
