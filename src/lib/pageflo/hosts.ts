/**
 * PageFlo host classification.
 *
 * One Next.js application serves three different kinds of host:
 *
 *   marketing   pageflo.io          the public product site
 *   app         app.pageflo.io      the operator console and authentication
 *   tenant      claim.example.com   a customer's published Site
 *
 * Plus one transitional kind:
 *
 *   legacy-app  os.legenex.com      served the console before the rebrand and
 *                                   must keep working until the new domain is
 *                                   verified, then redirects to the app host
 *
 * Getting this wrong in either direction is a real failure: a reserved host
 * resolved as a tenant would let a `Domains` row hijack the console or the
 * marketing site, and a tenant host classified as reserved would take a
 * customer's site offline. So classification is explicit and reserved hosts are
 * checked BEFORE any database lookup, exactly as `isFallbackHost` was.
 *
 * Everything is driven by configuration. Nothing here hardcodes a Legenex or a
 * PageFlo hostname, so a second deployment of this code configures its own.
 */

import { env, envFlag, envList } from './env'

export type HostRole = 'marketing' | 'app' | 'legacy-app' | 'tenant'

/**
 * Lowercase, strip scheme, port and trailing slash. Matches the normalization
 * `src/lib/site-resolver.ts` applies before a `Domains` lookup, so a host
 * cannot be reserved here and a tenant there.
 */
export const normalizeHost = (host: string | null | undefined): string =>
  (host ?? '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')

const withoutWww = (host: string): string => (host.startsWith('www.') ? host.slice(4) : host)

/** The configured marketing host, normalized. Empty when unconfigured. */
export const marketingHost = (): string => normalizeHost(env('marketingHost'))

/** The configured application host, normalized. Empty when unconfigured. */
export const appHost = (): string => normalizeHost(env('appHost'))

/**
 * Hosts that served the console before the rebrand. Comma separated in config.
 * These behave exactly as the pre-rebrand fallback host did until
 * PAGEFLO_LEGACY_HOST_REDIRECT is set to 'true'.
 */
export const legacyAppHosts = (): string[] =>
  envList('legacyAppHosts').map(normalizeHost).filter(Boolean)

/** True once the operator has verified the new domain and flipped the switch. */
export const legacyHostsRedirect = (): boolean => envFlag('legacyHostRedirect')

/**
 * Classify a request host.
 *
 * `www.` is stripped before comparison so that `www.pageflo.io` is recognised as
 * the marketing host rather than falling through to a tenant lookup. The caller
 * is still responsible for issuing the canonical redirect; see
 * `wwwRedirectTarget`.
 */
export const classifyHost = (rawHost: string | null | undefined): HostRole => {
  const host = normalizeHost(rawHost)
  if (!host) return 'tenant'
  const bare = withoutWww(host)

  const app = appHost()
  if (app && bare === app) return 'app'

  const marketing = marketingHost()
  if (marketing && bare === marketing) return 'marketing'

  if (legacyAppHosts().includes(bare)) return 'legacy-app'

  return 'tenant'
}

/**
 * True when this host belongs to PageFlo itself and must never be resolved
 * against the `Domains` table. Checked before every host lookup on the four
 * public surfaces.
 */
export const isReservedHost = (host: string | null | undefined): boolean =>
  classifyHost(host) !== 'tenant'

/** True when this host should render the public marketing site at `/`. */
export const isMarketingHost = (host: string | null | undefined): boolean => {
  const role = classifyHost(host)
  if (role === 'marketing') return true
  // A legacy console host served the marketing page at `/` before the rebrand.
  // It keeps doing so until the redirect switch is flipped, so nothing a
  // visitor reaches today starts 404ing mid-migration.
  return role === 'legacy-app' && !legacyHostsRedirect()
}

/** True when this host serves the operator console and authentication. */
export const isAppHost = (host: string | null | undefined): boolean => {
  const role = classifyHost(host)
  if (role === 'app') return true
  return role === 'legacy-app' && !legacyHostsRedirect()
}

/**
 * The canonical host to permanently redirect to, or null to serve this request.
 *
 * Two cases produce a redirect:
 *   www.pageflo.io   -> pageflo.io       (canonical apex, always)
 *   os.legenex.com   -> app.pageflo.io   (only once the switch is flipped)
 */
export const canonicalHostRedirect = (rawHost: string | null | undefined): string | null => {
  const host = normalizeHost(rawHost)
  if (!host) return null
  const bare = withoutWww(host)
  const role = classifyHost(host)

  if (role === 'legacy-app' && legacyHostsRedirect()) {
    const target = appHost()
    return target && target !== host ? target : null
  }

  // Only redirect `www.` for hosts PageFlo owns. A tenant may legitimately
  // serve `www.` as its own primary host, and that is the `Domains` table's
  // decision, not this module's.
  if (host !== bare && (role === 'marketing' || role === 'app')) return bare

  return null
}

/**
 * The absolute origin of the operator console, for links that must leave the
 * current host: transactional email, an admin deep link in a notification, a
 * canonical sign-in URL. Falls back to the configured server URL and finally to
 * localhost so a development environment is never handed an empty string.
 */
export const appOrigin = (): string => {
  const configured = env('serverUrl').trim().replace(/\/$/, '')
  if (configured) return configured
  const host = appHost()
  if (host) return `https://${host}`
  return 'http://localhost:3000'
}

/** The absolute origin of the public marketing site, or '' when unconfigured. */
export const marketingOrigin = (): string => {
  const host = marketingHost()
  return host ? `https://${host}` : ''
}
