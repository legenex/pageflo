import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveSiteByHost, resolveDomainForProvisioning } from '@/lib/site-resolver'
import { trustedHost } from '@/lib/trusted-host'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_MARKER = 'legalos'

/**
 * Self-identifying endpoint used by the domain provisioning poller.
 *
 * The verifier hits `https://<connected-host>/api/legalos/self-check` — the
 * legacy alias, deliberately, because the tenant host it connects to may still
 * be serving a build from before the PageFlo rename — and checks that the JSON
 * response carries `app: "legalos"` and the expected `site_id`.
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
 * for its purpose and wrong for "is the app up"; `/api/pageflo/health` answers
 * that one.
 */
export async function GET(req: NextRequest) {
  // The host comes from the connection, not from a header the caller sets. This
  // endpoint is unauthenticated and its whole job is to say WHICH tenant a host
  // reaches, so an accepted `x-legalos-host` made it a free host-to-site oracle
  // — and the poller that reads it never sends one anyway (it opens a real
  // HTTPS connection to the host it is verifying). See src/lib/trusted-host.ts.
  const host = trustedHost(req)

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
    // The operator running a provisioning check needs the reason; the public
    // caller does not get it. Logged here so the sentence below is true —
    // an earlier version of this comment described a log that did not exist.
    // eslint-disable-next-line no-console
    console.warn(`[self-check] ${host} maps to site ${probe.siteId} but is not eligible yet: ${probe.reason}`)
    return NextResponse.json(
      {
        ok: true,
        app: APP_MARKER,
        host,
        site_id: String(probe.siteId),
        primary_host: null,
        // `eligible` is the whole answer. The REASON is internal provisioning
        // state and this route is public, so it goes to the log (above) rather
        // than to whoever asked. ssl-poll.ts reads only `app`, `ok` and
        // `site_id`, so nothing downstream needs it.
        eligible: false,
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
