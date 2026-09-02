import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { checkDomainDns } from '@/lib/dns-check'
import { env } from '@/lib/pageflo/env'

export const dynamic = 'force-dynamic'

const Body = z.object({
  host: z.string().min(3),
  verification_token: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const result = await checkDomainDns({
    host: parsed.data.host,
    cnameTarget: env('cnameTarget') || null,
    aTarget: env('aTarget') || null,
    verificationToken: parsed.data.verification_token ?? null,
  })

  return NextResponse.json(result)
}
