import { getPayload } from 'payload'
import config from '@payload-config'

import { domainEligibility, type DomainLike } from './domain-eligibility'

/**
 * Whether an ineligible host is REFUSED or merely reported.
 *
 * `domain-eligibility.ts` is the one contract for "may this domain serve", and
 * the resolver was the last of its four callers still not consulting it — so a
 * domain in `pending`, `provisioning` or `error` resolved and served exactly
 * like a live one.
 *
 * Enforcing it is the correct behaviour and it is what this switch turns on.
 * It defaults to OFF, and that is a rollout decision rather than an unfinished
 * one: turning it on changes which hosts a live system answers for, the
 * production `domains` rows cannot be read from this checkout, and
 * `docs/production-readiness.md` records that at least one live host's
 * `ssl_status` was set without anything verifying it. Flipping a switch that
 * 404s real traffic on the strength of a row nobody has looked at is the kind
 * of confident change this codebase has been bitten by.
 *
 * Off, every refusal is still LOGGED with its reason, so the list of what would
 * change is available before anybody decides. Set
 * `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY=true` once that list has been read.
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

export const resolveSiteByHost = async (rawHost: string | null | undefined): Promise<ResolvedSite | null> => {
  const host = normalizeHost(rawHost)
  if (!host) return null
  const now = Date.now()
  const cached = HOST_CACHE.get(host)
  if (cached && cached.expiresAt > now) {
    return { siteId: cached.siteId, primaryHost: cached.primaryHost, redirectTo: cached.redirectTo }
  }

  const payload = await getPayload({ config })

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
    const siteId = typeof domain.site === 'object' ? domain.site.id : domain.site
    // Look up the primary host for this site (for canonical redirect / link emission).
    const primaryRow = await payload.find({
      collection: 'domains',
      where: { and: [{ site: { equals: siteId } }, { primary: { equals: true } }] },
      limit: 1,
      overrideAccess: true,
    })
    const primaryHost = primaryRow.docs[0]?.host ?? null
    const redirectTo = !domain.primary && primaryHost && primaryHost !== host ? primaryHost : null
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
    const siteId = typeof target.site === 'object' ? target.site.id : target.site
    const entry: CacheEntry = { siteId, primaryHost: target.host, redirectTo: target.host, expiresAt: now + CACHE_TTL_MS }
    HOST_CACHE.set(host, entry)
    return entry
  }

  return null
}

export const isFallbackHost = (host: string | null | undefined): boolean => {
  const normalized = normalizeHost(host)
  const fallback = normalizeHost(process.env.LEGALOS_FALLBACK_HOST)
  return Boolean(fallback) && normalized === fallback
}
