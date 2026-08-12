import { getPayload } from 'payload'
import config from '@payload-config'
import { invalidateHostCache } from './site-resolver'

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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const url = `https://${args.host}/api/legalos/self-check`
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!resp.ok) return { ok: false, error: `http ${resp.status} from ${args.host}` }
    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return { ok: false, error: `expected JSON, got ${contentType || 'unknown'} (likely default vhost / unconfigured server)` }
    }
    let body: SelfCheckBody
    try {
      body = (await resp.json()) as SelfCheckBody
    } catch (err) {
      return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}` }
    }
    if (body.app !== APP_MARKER) return { ok: false, error: `wrong app marker: ${body.app ?? '(none)'} — this host is not pointed at LegalOS` }
    if (!body.ok) return { ok: false, error: 'self-check returned ok:false (host not mapped to a site)' }
    if (String(body.site_id ?? '') !== String(args.expectedSiteId)) {
      return { ok: false, error: `wrong site: served ${body.site_id ?? '(none)'}, expected ${args.expectedSiteId}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown network error' }
  } finally {
    clearTimeout(timer)
  }
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
