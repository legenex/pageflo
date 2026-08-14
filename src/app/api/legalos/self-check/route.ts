import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveSiteByHost, resolveDomainForProvisioning } from '@/lib/site-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_MARKER = 'legalos'

/**
 * Self-identifying endpoint used by the domain provisioning poller.
 *
 * The verifier hits `https://<connected-host>/api/legalos/self-check` and checks
 * that the JSON response carries `app: "legalos"` and the expected `site_id`.
 * This proves that the request actually reached our Next.js app for the right
 * tenant — Plesk's default vhost, another server, or a misconfigured proxy will
 * all fail this check even if the TLS handshake succeeds.
 *
 * It answers for a domain that is not eligible yet, reporting `eligible: false`
 * and the reason rather than refusing. That is not a hole in the eligibility
 * rule — no content is served here — it is what stops the rule from strangling
 * its own precondition. See the comment on the fallback below.
 *
 * NOT a liveness probe. It 404s for a host with no Domain row, which is correct
 * for its purpose and wrong for "is the app up"; `/api/legalos/health` answers
 * that one.
 */
export async function GET(req: NextRequest) {
  const host = (req.headers.get('x-legalos-host') ?? req.headers.get('host') ?? '').toLowerCase()

  const resolved = await resolveSiteByHost(host)
  if (resolved) {
    return NextResponse.json(
      {
        ok: true,
        app: APP_MARKER,
        host,
        site_id: String(resolved.siteId),
        primary_host: resolved.primaryHost,
        eligible: true,
        time: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  // A domain that is not eligible YET still has to be able to identify itself,
  // or provisioning cannot finish: `ssl-poll.ts` promotes a domain only after
  // this endpoint confirms the host reaches LegalOS for the expected site, and
  // a CUSTOM domain is not eligible until that promotion has happened. Gating
  // this route on eligibility therefore closed a loop in which no custom domain
  // could ever be provisioned. See `resolveDomainForProvisioning`.
  //
  // `ok: true` is the honest answer to what this endpoint asks — the request
  // DID reach LegalOS and the host DOES map to this site. Whether it may serve
  // the public yet is reported separately, so nothing reads eligibility off the
  // wrong field.
  const probe = await resolveDomainForProvisioning(host)
  if (probe) {
    return NextResponse.json(
      {
        ok: true,
        app: APP_MARKER,
        host,
        site_id: String(probe.siteId),
        primary_host: null,
        eligible: false,
        eligibility: probe.reason,
        time: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  // No Domain row at all: this really is not our host, which is the answer that
  // tells a poller its request landed on the wrong server.
  return NextResponse.json(
    { ok: false, app: APP_MARKER, host, error: 'host not mapped to any site' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  )
}
