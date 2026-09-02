import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { runLeadPipeline } from '@/lib/lead-pipeline/run'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const Body = z.object({
  site_slug: z.string(),
  funnel_type: z.enum(['quiz', 'landing-page', 'contact-form', 'page', 'advertorial']).default('contact-form'),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  contact: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
    })
    .optional(),
})

const defaultTestContact = () => ({
  first_name: 'Test',
  last_name: 'Lead',
  email: `test+${Date.now()}@legenex.com`,
  phone: '+15555550100',
  state: 'CA',
  zip: '90210',
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
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: data.site_slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]
  if (!site) return NextResponse.json({ ok: false, error: 'site not found' }, { status: 404 })

  // Only run a test capture against a Site the caller is actually bound to,
  // otherwise an editor of one tenant could inject test leads (firing CAPI /
  // webhooks, polluting data) into any other tenant.
  if (!isBoundToSite(user, site.id)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const primaryRes = await payload.find({
    collection: 'domains',
    where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
  })

  const result = await runLeadPipeline({
    siteId: Number(site.id),
    siteSlug: site.slug,
    siteName: site.name,
    primaryHost: primaryRes.docs[0]?.host ?? null,
    funnel_type: data.funnel_type,
    funnel_path: '/test-capture',
    test_capture: true,
    contact: { ...defaultTestContact(), ...(data.contact ?? {}) },
    attribution: {
      utm_source: data.utm_source ?? 'test',
      utm_medium: data.utm_medium ?? 'admin',
      utm_campaign: data.utm_campaign ?? 'test-capture',
      session_id: `test-${Date.now()}`,
    },
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
