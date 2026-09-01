import { getPayload } from 'payload'

import { domainEligibility, type DomainLike } from './domain-eligibility'
import { isReservedHost } from './pageflo/hosts'

/*
 * `@payload-config` is imported lazily: `payload.config.ts` imports
 * `collections/Domains.ts`, which imports this module for
 * `invalidateHostCache`, so a static config import here is a circular ring
 * that the production chunker can evaluate in a crashing order. Deferring to
 * call time breaks the ring without changing behavior. Same incident as
 * `lib/auth.ts` — see the note there.
 */
const payloadClient = async () => {
  const { default: config } = await import('@payload-config')
  return getPayload({ config })
}

/**
 * Whether an ineligible host is REFUSED or merely reported.
 *
 * `domain-eligibility.ts` is the one contract for "may this domain serve", and
 * the resolver was the last of its four callers still not consulting it — so a
 * domain in `pending`, `provisioning` or `error` resolved and served exactly
 * like a live one.
 *
 * Enforcing it is the correct behaviour and it is what this switch turns on.
 * It defaults to OFF because turning it on changes which hosts a live system
 * answers for, and doing that on the strength of a row nobody has looked at is
 * the kind of confident change this codebase has been bitten by.
 *
 * THAT LIST HAS NOW BEEN READ. On 2026-08-13 every production domain row was
 * checked against real DNS, a real TLS handshake, the certificate the host
 * actually presents, and `/api/legalos/self-check`:
 *
 *   64/65/69  *.preview.legenex.com   DNS correct, app returns the right site,
 *                                     NO certificate has ever been issued.
 *                                     Eligible on `status` alone while
 *                                     PREVIEW_REQUIRES_SSL is false, so
 *                                     enforcement does not change them.
 *   67        getwhatyoureowed.co     Claimed status=active AND ssl_status=
 *                                     active. Both false: no Plesk vhost, no
 *                                     certificate, and DNS split between this
 *                                     server and a third party. Row corrected
 *                                     to error/error, so enforcement now
 *                                     refuses it - which is right, because a
 *                                     browser refuses it too.
 *
 * So exactly one host changes behaviour under enforcement, and it is the one
 * that provably cannot serve valid HTTPS. Set
 * `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY=true` (it is set in production).
 *
 * Off, every refusal is still LOGGED with its reason, so the same list can be
 * re-derived from the journal after any future domain change.
 */
const ENFORCE_DOMAIN_ELIGIBILITY = process.env.LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY === 'true'

export const RESOLVER_ELIGIBILITY_LOG_PREFIX = '[site-resolver] ineligible host'

type CacheEntry = { siteId: string | number; primaryHost: string | null; redirectTo: string | null; expiresAt: number }
const HOST_CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 1000

const normalizeHost = (host: string | null | undefined): string =>
  (host ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/$/, '')

export type ResolvedSite = {
  siteId: string | number
  primaryHost: string | null
  redirectTo: string | null
}

export const invalidateHostCache = (host?: string): void => {
  if (host) HOST_CACHE.delete(normalizeHost(host))
  else HOST_CACHE.clear()
}

/**
 * May this domain answer for `host`?
 *
 * Always LOGS an ineligible domain with the reason. Only REFUSES it when the
 * switch is on, so the list of what enforcement would change can be read out of
 * the journal before anybody flips it.
 *
 * This function is the enforcement. `domainEligibility` and the switch above
 * were imported and declared here for a while without either being called from
 * `resolveSiteByHost`, so a `pending`, `provisioning` or `error` domain resolved
 * exactly like a live one and turning the switch on changed nothing. A control
 * that is described in a comment and absent from the code path is the same bug
 * as no control.
 */
const admit = (domain: DomainLike, host: string): boolean => {
  const verdict = domainEligibility(domain)
  if (verdict.eligible) return true
  // eslint-disable-next-line no-console
  console.warn(
    `${RESOLVER_ELIGIBILITY_LOG_PREFIX} ${host}: ${verdict.reason}` +
      (ENFORCE_DOMAIN_ELIGIBILITY ? ' (refused)' : ' (served anyway: enforcement is off)'),
  )
  return !ENFORCE_DOMAIN_ELIGIBILITY
}

export const resolveSiteByHost = async (rawHost: string | null | undefined): Promise<ResolvedSite | null> => {
  const host = normalizeHost(rawHost)
  if (!host) return null
  const now = Date.now()
  const cached = HOST_CACHE.get(host)
  if (cached && cached.expiresAt > now) {
    return { siteId: cached.siteId, primaryHost: cached.primaryHost, redirectTo: cached.redirectTo }
  }

  const payload = await payloadClient()

  // 1. Direct host match on Domain.
  const direct = await payload.find({
    collection: 'domains',
    where: { host: { equals: host } },
    limit: 1,
    overrideAccess: true,
  })

  if (direct.docs.length > 0) {
    const domain = direct.docs[0]
    // Unassigned domain in the pool: do not resolve (treat as 404).
    if (!domain.site) return null
    if (!admit(domain as DomainLike, host)) return null
    const siteId = typeof domain.site === 'object' ? domain.site.id : domain.site
    // Look up the primary host for this site (for canonical redirect / link emission).
    const primaryRow = await payload.find({
      collection: 'domains',
      where: { and: [{ site: { equals: siteId } }, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    })
    // The canonical target has to be servable too, and gating only the host in
    // hand is not enough. Site 13 proved it in production the moment
    // enforcement went on: its preview host was eligible, its primary
    // (getwhatyoureowed.co) was not, and the resolver kept 307-ing every
    // visitor onto the refused domain - which then fell through to the
    // marketing site. The site was reachable on neither host, off two rows that
    // were each individually handled "correctly".
    //
    // So an ineligible primary is not a redirect target and is not the
    // canonical host. The host being served takes both jobs, which keeps the
    // brand reachable on the domain that actually works.
    const primaryDoc = primaryRow.docs[0]
    const primaryUsable = Boolean(primaryDoc) && admit(primaryDoc as DomainLike, String(primaryDoc?.host ?? ''))
    const primaryHost = primaryUsable ? (primaryDoc?.host ?? null) : host
    const redirectTo = primaryUsable && !domain.primary && primaryHost && primaryHost !== host ? primaryHost : null
    const entry: CacheEntry = { siteId, primaryHost, redirectTo, expiresAt: now + CACHE_TTL_MS }
    HOST_CACHE.set(host, entry)
    return entry
  }

  // 2. Check if any Domain lists this host in `redirects_from[]`.
  const redirectRow = await payload.find({
    collection: 'domains',
    where: { 'redirects_from.host': { equals: host } },
    limit: 1,
    overrideAccess: true,
  })

  if (redirectRow.docs.length > 0) {
    const target = redirectRow.docs[0]
    if (!target.site) return null
    // The host being resolved is an alias FOR this domain, so the domain it
    // redirects to is the one that has to be servable. Sending a visitor to a
    // host that cannot serve is worse than not resolving the alias at all.
    if (!admit(target as DomainLike, host)) return null
    const siteId = typeof target.site === 'object' ? target.site.id : target.site
    const entry: CacheEntry = { siteId, primaryHost: target.host, redirectTo: target.host, expiresAt: now + CACHE_TTL_MS }
    HOST_CACHE.set(host, entry)
    return entry
  }

  return null
}

export type ProvisioningProbe = {
  siteId: string | number
  host: string
  eligible: boolean
  reason: string | null
}

/**
 * Host -> Site for the PROVISIONING PROBE only. Deliberately ungated.
 *
 * `resolveSiteByHost` refuses an ineligible domain, which is right for public
 * traffic and fatal for provisioning, because it closed a loop:
 *
 *   verifyAndPromoteDomain writes a custom domain as provisioning/pending
 *     -> pollDomainSslStatus GETs /api/legalos/self-check
 *       -> self-check called resolveSiteByHost
 *         -> admit() refused it: a CUSTOM domain is eligible only at
 *            status=active AND ssl_status=active
 *           -> self-check answered ok:false
 *             -> the poller failed all 12 attempts and wrote error/error
 *
 * and `ssl-poll.ts` is the ONLY writer of `ssl_status='active'` in the
 * codebase. So the gate strangled the one probe that could open it, and NO
 * custom domain could ever be provisioned while enforcement was on. Production
 * row 67 (getwhatyoureowed.co) sat in error/error for exactly this reason.
 *
 * This lookup answers the question the probe actually asks — "does this host
 * reach LegalOS, and does it map to the site I expect?" — which is true or
 * false regardless of whether the row is servable yet. Eligibility is returned
 * alongside rather than applied, so the caller reports it instead of being
 * silently refused.
 *
 * It is NOT a way around the eligibility rule for public traffic: nothing that
 * serves content calls this, and the promotion it enables still requires a real
 * validated HTTPS handshake, because the poller reaches it over `safeFetch`.
 *
 * Uncached on purpose. HOST_CACHE holds entries for 60s, and a probe that may
 * be reading a row written seconds ago must see the row, not a stale verdict.
 * Direct host match only: an alias is not the thing being provisioned.
 */
export const resolveDomainForProvisioning = async (
  rawHost: string | null | undefined,
): Promise<ProvisioningProbe | null> => {
  const host = normalizeHost(rawHost)
  if (!host) return null

  const payload = await payloadClient()
  const direct = await payload.find({
    collection: 'domains',
    where: { host: { equals: host } },
    limit: 1,
    overrideAccess: true,
  })

  const domain = direct.docs[0]
  // No row, or a pool row with no Site, is a genuine "this is not our host" —
  // the answer that tells a poller it reached the wrong server.
  if (!domain || !domain.site) return null

  const siteId = typeof domain.site === 'object' ? domain.site.id : domain.site
  const verdict = domainEligibility(domain as DomainLike)
  return {
    siteId,
    host,
    eligible: verdict.eligible,
    reason: verdict.eligible ? null : verdict.reason,
  }
}

/**
 * True when this host belongs to PageFlo itself (marketing site, operator
 * console, or a legacy console host kept alive during the domain migration) and
 * must therefore never be resolved against the `Domains` table.
 *
 * Kept under its original name because five public surfaces call it and the
 * meaning is unchanged: "this is not a tenant host". The implementation moved to
 * `src/lib/pageflo/hosts.ts`, which understands three reserved hosts instead of
 * one and is where new host rules belong.
 */
export const isFallbackHost = (host: string | null | undefined): boolean => isReservedHost(host)
