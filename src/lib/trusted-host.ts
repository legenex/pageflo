/**
 * Which tenant is this request for? — the one answer public API routes may use.
 *
 * WHY THIS EXISTS. `src/middleware.ts` returns early for `/api/*` (it is
 * "Payload territory"), so it never stamps `x-legalos-host` on an API request.
 * Anything an API route reads out of a forwarding header on those paths
 * therefore came from the CALLER, not from our reverse proxy. Two public,
 * unauthenticated routes resolved the tenant from exactly that:
 *
 *   POST /api/leads                 ->  x-forwarded-host ?? host
 *   POST /api/legalos/quiz-webhook  ->  x-legalos-host   ?? host
 *
 * Measured through real nginx + TLS: a request to `os.legenex.com` carrying
 * `X-Legalos-Host: settlementassist-co.preview.legenex.com` was answered as
 * site 15. The tenant identity of an anonymous request was the caller's to
 * choose — which is the entire multi-tenancy model, decided by a header anyone
 * can type.
 *
 * THE CONTRACT. On a public route the tenant comes from the REAL request
 * `Host`, and from nothing else. `Host` is what the connection asked for: it is
 * what nginx matched its server block and its certificate against, and it is
 * the one header arriving from the proxy that a caller cannot make disagree
 * with the socket they actually opened.
 *
 * WHAT IS DELIBERATELY NOT TRUSTED — and why "it works today" is not a reason:
 *
 *  · `x-forwarded-host`. A spoofed value survives the proxy chain merged with
 *    the real one (`spoofed.com, real.com`), which resolves to no Site and so
 *    currently fails closed. That is a side effect of Apache's header merging,
 *    not a control: it is not configured here, not asserted anywhere, and it
 *    changes if the proxy chain changes. A control nobody wrote is a control
 *    nobody can keep.
 *  · `x-legalos-host`. Middleware really does stamp this — but only on public
 *    PAGE paths, never on `/api/*`. A copy of it on an API request is the
 *    caller's copy.
 *
 * NOT FOR PUBLIC PAGE ROUTES. `(public)/[[...slug]]`, the public layout,
 * `robots.txt` and `sitemap.xml` read `x-legalos-host ?? host` on purpose:
 * those paths DO pass through middleware, and the `?preview=1` channel depends
 * on the stamped value. They are intentionally unchanged by this module.
 */

/** The shape both `NextRequest` and a test stub satisfy. */
export type HostHeaderSource = { headers: { get: (name: string) => string | null } }

/**
 * A hostname and nothing else — no scheme, no path, no port, no trailing root
 * dot, lower-cased. `resolveSiteByHost` normalises again on its own; this
 * normalisation exists so the comparison below is between comparable things.
 */
const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')

/**
 * What a hostname may contain. Anything else — a space, a control character, a
 * comma that survived the split, an IPv6 bracket — is not a tenant host and is
 * refused rather than passed on to a database query.
 */
const HOSTNAME_RE = /^[a-z0-9][a-z0-9._-]*$/

/**
 * The host this request was really made to, or `''` when that cannot be known.
 *
 * A merged header (`a.com, b.com`) is what a proxy produces when the same
 * header arrived twice. Duplicates of the SAME host are unambiguous and are
 * collapsed; genuinely different values are REFUSED rather than picked, because
 * nothing here can tell which one the connection asked for, and guessing is the
 * exact mistake this module exists to prevent. Only that ambiguous case fails —
 * an ordinary submission carries one value and is unaffected.
 *
 * Callers treat `''` the way they already treat an unresolvable host: it fails
 * the Site lookup and the request is refused. No caller should fall back to a
 * forwarding header when this returns empty.
 */
export const resolveTrustedHost = (rawHost: string | null | undefined): string => {
  const raw = (rawHost ?? '').trim()
  if (!raw) return ''

  const distinct = new Set(
    raw
      .split(',')
      .map((part) => normalize(part))
      .filter((host) => host !== '' && HOSTNAME_RE.test(host)),
  )
  if (distinct.size !== 1) return ''
  return distinct.values().next().value as string
}

/**
 * The trusted host for a request. The only host-derivation a public API route
 * should perform.
 */
export const trustedHost = (req: HostHeaderSource): string => resolveTrustedHost(req.headers.get('host'))
