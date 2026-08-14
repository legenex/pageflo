import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { runLeadPipeline } from '@/lib/lead-pipeline/run'
import { resolveSiteByHost } from '@/lib/site-resolver'
import { pickAttributionFromObject } from '@/lib/lead-pipeline/attribution'
import { getCurrentUser } from '@/lib/auth'
import { trustedHost } from '@/lib/trusted-host'

export const dynamic = 'force-dynamic'

const ContactSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  // Loose-but-valid: an empty string is allowed (optional contact), but a
  // non-empty value must be a real email. The Leads collection's `email` field
  // format-validates on create, so a malformed value here would otherwise throw
  // inside payload.create and silently drop the whole lead.
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
})

const Body = z.object({
  // Server resolves site from host header by default. site_slug is allowed for preview/test.
  site_slug: z.string().optional(),
  funnel_type: z.enum(['quiz', 'landing-page', 'contact-form', 'page', 'advertorial']),
  // `.nullish()`, not `.optional()`. These arrive from Payload block fields, and
  // an unset optional text field in Payload is NULL, not undefined — which
  // `.optional()` rejects. The Site LeadForm block leaves `funnel_id` unset on
  // every seeded home page, so every submission from it answered
  //   400 invalid payload: funnel_id — Expected string, received null
  // and that surface had never captured a lead. Normalised to undefined below
  // so the pipeline still sees one shape.
  funnel_id: z.string().nullish(),
  funnel_path: z.string().nullish(),
  source_entity_id: z.string().nullish(),
  // Idempotency key the client mints once per submission and resends on retry.
  // Bounded so a hostile body cannot store an unbounded string.
  client_submission_id: z.string().max(128).optional(),
  test_capture: z.boolean().optional(),
  contact: ContactSchema,
  // Arbitrary key/value blob for custom lead_form fields the page author added
  // beyond the canonical contact set (case_type, accident_date, agreed_to_tcpa,
  // etc.). Stored as JSON on the lead row by the pipeline. Optional so legacy
  // hardcoded forms keep working unchanged.
  extra: z.record(z.unknown()).optional(),
  quiz_answers: z.record(z.unknown()).optional(),
  attribution: z.record(z.unknown()).optional(),
  trustedform_cert_url: z.string().optional(),
  jornaya_lead_id: z.string().optional(),
})

export async function POST(req: NextRequest) {
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

  // Resolve Site.
  //
  // The tenant comes from the host this request was actually made to, never
  // from a forwarding header. This route is public and unauthenticated, and
  // `/api/*` is a middleware passthrough, so `x-forwarded-host` /
  // `x-legalos-host` on this path are the CALLER's values — reading them let an
  // anonymous POST choose which brand its lead was filed under, fired CAPI for
  // and delivered to. See src/lib/trusted-host.ts.
  const host = trustedHost(req)
  const payload = await getPayload({ config })

  let siteId: number | null = null
  let siteSlug = ''
  let siteName = ''
  let primaryHost: string | null = null

  // Resolve by host first — that's the trustworthy signal for a public submit,
  // and the public form already renders on the resolved host. A body-supplied
  // `site_slug` is only honored as a fallback for AUTHENTICATED callers (admin
  // preview / test), so an anonymous request can't target an arbitrary tenant.
  const resolved = await resolveSiteByHost(host)
  if (resolved) {
    const s = await payload.findByID({ collection: 'sites', id: resolved.siteId, overrideAccess: true })
    siteId = Number(s.id)
    siteSlug = s.slug
    siteName = s.name
    primaryHost = resolved.primaryHost
  } else if (data.site_slug) {
    const user = await getCurrentUser()
    if (user) {
      const res = await payload.find({
        collection: 'sites',
        where: { slug: { equals: data.site_slug } },
        limit: 1,
        overrideAccess: true,
      })
      const s = res.docs[0]
      if (s) {
        siteId = Number(s.id)
        siteSlug = s.slug
        siteName = s.name
      }
    }
  }

  if (!siteId) {
    return NextResponse.json({ ok: false, error: 'could not resolve site' }, { status: 400 })
  }

  // Attribution: trust the client's UTM-style values but fill in server-side ip/user_agent.
  const attribution = pickAttributionFromObject(data.attribution ?? null)
  attribution.user_agent = req.headers.get('user-agent') ?? attribution.user_agent
  attribution.ip = (req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? attribution.ip) ?? undefined
  if (!attribution.landing_path && data.funnel_path) attribution.landing_path = data.funnel_path

  const result = await runLeadPipeline({
    siteId,
    siteSlug,
    siteName,
    primaryHost,
    funnel_type: data.funnel_type,
    funnel_id: data.funnel_id ?? undefined,
    funnel_path: data.funnel_path ?? undefined,
    source_entity_id: data.source_entity_id ?? undefined,
    client_submission_id: data.client_submission_id,
    test_capture: data.test_capture,
    contact: { ...data.contact, email: data.contact.email || undefined },
    quiz_answers: data.quiz_answers,
    attribution,
    trustedform_cert_url: data.trustedform_cert_url,
    jornaya_lead_id: data.jornaya_lead_id,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
}
