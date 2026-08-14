import { getPayload } from 'payload'
import config from '@payload-config'
import { invalidateHostCache } from './site-resolver'
import { safeFetch } from './net/ssrf'

/**
 * Post-provision verifier. After a Domain is DNS-verified AND Plesk has
 * (allegedly) provisioned the vhost + cert, this confirms that the host
 * actually serves our app for the right tenant by GETting a self-identifying
 * endpoint:
 *
 *   GET https://<host>/api/legalos/self-check
 *   →  { ok: true, app: "legalos", site_id: "<expected>" }
 *
 * Only when that round-trip succeeds do we flip status to 'active' and
 * ssl_status to 'active'. A successful TLS handshake alone is NOT enough —
 * Plesk's default vhost, a wrong proxy target, or any other server would all
 * pass a HEAD check.
 *
 * The handshake is still REQUIRED, though: `safeFetch` is an ordinary `fetch`
 * with no TLS relaxation, so a host without a publicly-trusted certificate
 * cannot reach the body at all. That is what keeps the CLAUDE.md hard rule —
 * `ssl_status='active'` only after a real HTTPS handshake — true here.
 *
 * NOTE ON WHAT A NON-2xx MEANS. `safeFetch` collapses any non-2xx into
 * `{ ok:false, code:'http_error' }` and discards the body, so a 404 from
 * self-check is indistinguishable here from landing on somebody else's server.
 * That is why self-check answers 200 for a domain that is merely not eligible
 * YET, reporting `eligible:false` in the body instead: for most of this
 * poller's life the row it is polling is `provisioning/pending`, which is by
 * definition not servable, and refusing to identify it made this promotion
 * unreachable — the loop that left production row 67 in error/error.
 *
 * On timeout we set status='error' so the operator sees that connection has
 * not yet succeeded, with the last failure reason recorded in provisioning_error.
 */

const ATTEMPTS = 12
const INTERVAL_MS = 30_000 // 30s between attempts; 12 * 30s = 6 minutes total budget
const FETCH_TIMEOUT_MS = 8_000

const APP_MARKER = 'legalos'

type SelfCheckBody = {
  ok?: boolean
  app?: string
  host?: string
  site_id?: string
  primary_host?: string | null
}

type ReachResult = { ok: true } | { ok: false; error: string }

const tryReach = async (args: { host: string; expectedSiteId: string }): Promise<ReachResult> => {
  // The host comes off a Domain row an operator typed, so this GET is the
  // server fetching a user-supplied address. `safeFetch` also re-admits every
  // redirect hop, which matters more here than usual: this probe is what
  // authorises `ssl_status='active'`, and a host that 302s somewhere else must
  // not be able to answer for itself. See lib/net/ssrf.
  const res = await safeFetch(`https://${args.host}/api/legalos/self-check`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeoutMs: FETCH_TIMEOUT_MS,
  })
  if (!res.ok) {
    return { ok: false, error: res.code === 'http_error' ? `${res.reason} (from ${args.host})` : res.reason }
  }
  if (!res.contentType.includes('application/json')) {
    return {
      ok: false,
      error: `expected JSON, got ${res.contentType || 'unknown'} (likely default vhost / unconfigured server)`,
    }
  }
  let body: SelfCheckBody
  try {
    body = JSON.parse(res.body) as SelfCheckBody
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}` }
  }
  if (body.app !== APP_MARKER) return { ok: false, error: `wrong app marker: ${body.app ?? '(none)'} — this host is not pointed at LegalOS` }
  if (!body.ok) return { ok: false, error: 'self-check returned ok:false (host not mapped to a site)' }
  if (String(body.site_id ?? '') !== String(args.expectedSiteId)) {
    return { ok: false, error: `wrong site: served ${body.site_id ?? '(none)'}, expected ${args.expectedSiteId}` }
  }
  return { ok: true }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const pollDomainSslStatus = async (args: {
  domainId: number
  host: string
  siteId: string | number
}): Promise<void> => {
  const payload = await getPayload({ config })
  const expectedSiteId = String(args.siteId)

  let lastError = 'never reached'
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await tryReach({ host: args.host, expectedSiteId })
    if (result.ok) {
      try {
        // Only NOW do we flip primary + demote others. The previous primary
        // (typically the preview subdomain) stayed live throughout provisioning;
        // we cut over only after the new domain actually serves our app for the
        // right site. This is the moment the public switchover happens.
        const otherPrimaries = await payload.find({
          collection: 'domains',
          where: {
            and: [
              { site: { equals: args.siteId } },
              { primary: { equals: true } },
              { id: { not_equals: args.domainId } },
            ],
          },
          overrideAccess: true,
        })
        for (const d of otherPrimaries.docs) {
          await payload.update({
            collection: 'domains',
            id: d.id,
            data: { primary: false } as never,
            overrideAccess: true,
          })
        }
        await payload.update({
          collection: 'domains',
          id: args.domainId,
          data: {
            status: 'active',
            ssl_status: 'active',
            primary: true,
            last_checked_at: new Date().toISOString(),
            provisioning_error: null,
          } as never,
          overrideAccess: true,
        })

        // Deliberately NOT promoting the Site out of 'draft' here.
        //
        // A certificate becoming valid is a statement about transport. It is not
        // a decision to publish a brand, and this is a background promise nobody
        // is watching, so the promotion happened with no operator present and no
        // record of who chose it. Publication is an explicit act: the publish
        // flow may OFFER to activate a draft Site, showing what will happen.
        invalidateHostCache()
      } catch {
        // best effort — the row may have been deleted while we were polling
      }
      return
    }
    lastError = result.error
    if (attempt < ATTEMPTS) await sleep(INTERVAL_MS)
  }

  try {
    await payload.update({
      collection: 'domains',
      id: args.domainId,
      data: {
        status: 'error',
        ssl_status: 'error',
        last_checked_at: new Date().toISOString(),
        provisioning_error: `self-check failed after ${ATTEMPTS} attempts: ${lastError}`,
      } as never,
      overrideAccess: true,
    })
  } catch {
    // swallow
  }
}
