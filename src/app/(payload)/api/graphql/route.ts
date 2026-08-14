import { NextResponse } from 'next/server'

/**
 * GraphQL is disabled in `payload.config.ts` — see the comment there for why.
 *
 * The route stays mounted so the answer is a stated refusal rather than
 * whatever a disabled GraphQL handler happens to do. It previously returned a
 * 500 with an empty body, which reads as broken rather than closed.
 */
export const dynamic = 'force-dynamic'

const gone = () =>
  NextResponse.json(
    { ok: false, error: 'GraphQL is disabled on this deployment; use the REST API at /api/<collection>.' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  )

export const POST = gone
export const GET = gone
export const OPTIONS = gone
