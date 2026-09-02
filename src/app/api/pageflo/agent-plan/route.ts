import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readAllStatus, writeAgentStatus, type AgentState } from '@/lib/agent-plan/store'
import { AGENT_NAMES } from '@/lib/agent-plan/plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'no-store' } as const
const VALID_STATES: AgentState[] = ['idle', 'running', 'done', 'error']

/**
 * Live status feed + ingest for the Agent Plan board (/admin/plan).
 *
 * GET  — the board's client poller reads this every few seconds. Super-admin
 *        session only (it exposes internal dev/ops state, nothing tenant-facing).
 * POST — agents (and the orchestrator) push status updates here as they work.
 *        Authorized either by a super-admin session OR by the shared
 *        `AGENT_PLAN_TOKEN` secret (so an out-of-band agent runner can report in).
 *        If the token is unset, token auth is disabled entirely — code branches on
 *        emptiness, never on a placeholder.
 */
export async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  if (!me.super_admin)
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403, headers: NO_STORE })

  const status = await readAllStatus()
  return NextResponse.json({ ok: true, status, syncedAt: new Date().toISOString() }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  // Auth: super-admin session OR the shared ingest token.
  const token = req.headers.get('x-agent-token')
  const secret = process.env.AGENT_PLAN_TOKEN
  const tokenOk = Boolean(secret) && token === secret

  if (!tokenOk) {
    const me = await getCurrentUser()
    if (!me?.super_admin)
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403, headers: NO_STORE })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400, headers: NO_STORE })
  }

  const agent = typeof body.agent === 'string' ? body.agent : ''
  if (!AGENT_NAMES.includes(agent))
    return NextResponse.json({ ok: false, error: 'unknown agent' }, { status: 400, headers: NO_STORE })

  if (body.state !== undefined && !VALID_STATES.includes(body.state as AgentState))
    return NextResponse.json({ ok: false, error: 'invalid state' }, { status: 400, headers: NO_STORE })

  const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const completed = Array.isArray(body.completed)
    ? (body.completed.filter((x) => typeof x === 'string') as string[])
    : undefined

  try {
    const updated = await writeAgentStatus(agent, {
      state: body.state as AgentState | undefined,
      currentFindingId: body.currentFindingId === null ? null : asStr(body.currentFindingId),
      currentTask: body.currentTask === null ? null : asStr(body.currentTask),
      message: body.message === null ? null : asStr(body.message),
      completed,
      completedFindingId: asStr(body.completedFindingId),
    })
    return NextResponse.json({ ok: true, status: updated }, { headers: NO_STORE })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'write failed' },
      { status: 500, headers: NO_STORE },
    )
  }
}
