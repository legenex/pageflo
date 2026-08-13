import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { invokeLLM } from '@/lib/ai/invoke'
import { reportError } from '@/lib/observability/report'

export const dynamic = 'force-dynamic'

/**
 * Runs one AI-enabled quiz node for a public visitor.
 *
 * The security shape matters more than the feature here. A quiz node can carry
 * an AI prompt, and the public runtime needs that prompt executed mid-flow -
 * but the runtime is anonymous, so the endpoint must not become "post any
 * prompt to our Anthropic key".
 *
 *  - The PROMPT is never accepted from the client. It is read out of the
 *    node stored on the quiz, addressed only by deployment id + node id.
 *  - Only the answer VALUES come from the client, and they are only ever
 *    substituted into {{placeholders}} the prompt author already wrote. A key
 *    the prompt does not reference cannot inject anything.
 *  - A draft or paused deployment, an unpublished or archived quiz, and a node
 *    with AI disabled are all refused, so unpublished work cannot be used to
 *    spend credits.
 *  - Per-IP rate limiting caps the blast radius of a scripted caller.
 */

const Body = z.object({
  deployment_id: z.string().min(1).max(32),
  node_id: z.string().min(1).max(64),
  values: z.record(z.unknown()).optional(),
})

// In-process rate limiter. The app runs as a single `next start` process per
// host (see the deploy model), so a module-level map is the honest scope for
// this: it is not distributed, and it is not claimed to be.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 12
const hits = new Map<string, { count: number; resetAt: number }>()

const rateLimited = (key: string): boolean => {
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    // Opportunistic sweep so the map cannot grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
    }
    return false
  }
  cur.count += 1
  return cur.count > RATE_LIMIT_MAX
}

/** Substitute {{key}} with the visitor's answer, trimmed and length-capped. */
const interpolate = (prompt: string, values: Record<string, unknown>): string =>
  prompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = values[key]
    if (v == null) return ''
    return String(v).slice(0, 500)
  })

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
  const { deployment_id, node_id, values } = parsed.data

  const payload = await getPayload({ config })

  let dep: Record<string, unknown> | null = null
  try {
    dep = (await payload.findByID({
      collection: 'funnel-quiz-deployments',
      id: deployment_id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    dep = null
  }
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

  const nodes = Array.isArray(quiz.nodes) ? (quiz.nodes as Array<Record<string, unknown>>) : []
  const node = nodes.find((n) => String(n.id) === node_id)
  const ai = node?.ai as { enabled?: boolean; prompt?: string; model?: string; outputField?: string } | undefined
  if (!node || !ai?.enabled || !ai.prompt || !ai.outputField) {
    return NextResponse.json({ ok: false, error: 'node is not AI enabled' }, { status: 400 })
  }

  const prompt = interpolate(ai.prompt, (values ?? {}) as Record<string, unknown>)

  try {
    const out = await invokeLLM({
      system:
        'You process quiz answer data for a lead funnel. Follow the instruction exactly and return only the result string. Do not use em dashes.',
      user: prompt,
      schema: z.object({ result: z.string() }),
      schemaName: 'ai_result',
      // The stored model is not trusted verbatim: the union is closed on
      // purpose, so an unexpected value falls back rather than throwing.
      model: ai.model === 'claude-opus-4-7' || ai.model === 'claude-haiku-4-5-20251001' ? ai.model : 'claude-sonnet-4-6',
      maxTokens: 1000,
      enforceNoBannedVocab: true,
    })
    return NextResponse.json({ ok: true, text: out.result })
  } catch (err) {
    // The visitor is mid-funnel. Surfacing the provider error would leak
    // internals and help nobody, so the runtime just continues without the
    // enrichment.
    // eslint-disable-next-line no-console
    reportError('integration', err, { route: 'POST /api/legalos/quiz-ai', operation: 'quiz-ai' })
    return NextResponse.json({ ok: false, error: 'ai unavailable' }, { status: 502 })
  }
}
