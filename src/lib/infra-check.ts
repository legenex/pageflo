/**
 * Production readiness check for the PageFlo infrastructure that tenant domains
 * rely on. Surfaces a banner in the admin if the operator hasn't finished setting up:
 *   - PAGEFLO_CNAME_TARGET (e.g. cname.legenex.com) — what tenant CNAMEs point at
 *   - {anything}.PAGEFLO_PREVIEW_DOMAIN wildcard DNS — what /admin auto-issues per Site
 *
 * Without these resolving, the verifier will still mark domains "verified" because
 * the chain technically matches, but the page won't load because the chain
 * dead-ends at a nonexistent hostname.
 *
 * Result is cached in-process for 5 minutes so we don't hit DoH on every page render.
 */

import { env } from '@/lib/pageflo/env'

const CLOUDFLARE_DOH = 'https://cloudflare-dns.com/dns-query'
const TTL_MS = 5 * 60 * 1000

type CachedResult = { value: InfraCheck; expiresAt: number } | null
let cache: CachedResult = null

export type InfraCheck = {
  ok: boolean
  cname_target: { host: string | null; resolves: boolean; error?: string }
  preview_wildcard: { sample_host: string | null; resolves: boolean; error?: string }
}

const queryAOrCname = async (name: string): Promise<{ resolves: boolean; error?: string }> => {
  try {
    const url = `${CLOUDFLARE_DOH}?name=${encodeURIComponent(name)}&type=A`
    const resp = await fetch(url, { headers: { Accept: 'application/dns-json' }, cache: 'no-store' })
    if (!resp.ok) return { resolves: false, error: `doh ${resp.status}` }
    const json = (await resp.json()) as { Status: number; Answer?: Array<{ data: string }> }
    if (json.Status !== 0) return { resolves: false, error: `dns status ${json.Status}` }
    return { resolves: Array.isArray(json.Answer) && json.Answer.length > 0 }
  } catch (err) {
    return { resolves: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export const checkInfra = async (force = false): Promise<InfraCheck> => {
  const now = Date.now()
  if (!force && cache && cache.expiresAt > now) return cache.value

  const cnameTarget = env('cnameTarget') || null
  const previewDomain = env('previewDomain') || null
  // Probe with a stable sample subdomain so we're actually exercising the wildcard.
  const sampleHost = previewDomain ? `wildcard-probe.${previewDomain}` : null

  const [cnameResult, previewResult] = await Promise.all([
    cnameTarget ? queryAOrCname(cnameTarget) : Promise.resolve({ resolves: false, error: 'LEGALOS_CNAME_TARGET not set' }),
    sampleHost ? queryAOrCname(sampleHost) : Promise.resolve({ resolves: false, error: 'LEGALOS_PREVIEW_DOMAIN not set' }),
  ])

  const value: InfraCheck = {
    ok: cnameResult.resolves && previewResult.resolves,
    cname_target: { host: cnameTarget, resolves: cnameResult.resolves, error: cnameResult.error },
    preview_wildcard: { sample_host: sampleHost, resolves: previewResult.resolves, error: previewResult.error },
  }
  cache = { value, expiresAt: now + TTL_MS }
  return value
}
