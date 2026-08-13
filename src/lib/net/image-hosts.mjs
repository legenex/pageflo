/**
 * Which remote hosts `/_next/image` may fetch.
 *
 * THE HOLE THIS CLOSES. `next.config.mjs` carried
 * `remotePatterns: [{ protocol: 'https', hostname: '**' }]`, which makes
 * `/_next/image?url=https://<anything>` an UNAUTHENTICATED server-side fetch of
 * an attacker-chosen host, on every public tenant domain. Narrower than a raw
 * SSRF - https only, and Next refuses a response that is not an image - but the
 * same shape, and the one fetch path in the product that never went through the
 * admission control in `ssrf.ts`.
 *
 * THE DESIGN. Nothing remote is admitted by default. `LEGALOS_IMAGE_HOSTS` is a
 * comma-separated list of hostnames an operator has deliberately allowed. Each
 * must be a real, dotted, public hostname: no wildcards, no literal address, no
 * `localhost`, nothing ending in a suffix that only names a host inside a
 * network, no port, no path, no credentials.
 *
 * WHY AN ALLOWLIST AND NOT A PROXY. A brand's artwork does not need
 * `/_next/image` at all: the templates emit a plain `<img>` at the URL the brand
 * supplied, so the VISITOR's browser fetches it and this server never does. That
 * is the safest arrangement available - there is no server-side fetch to exploit
 * - and it is what ships with the variable unset. The allowlist exists for an
 * operator who genuinely wants Next's optimiser on a known CDN, and it makes
 * that a decision with a name attached rather than a default nobody chose.
 *
 * WHY THIS FILE IS PLAIN JAVASCRIPT WITH NO IMPORTS. `next.config.mjs` is
 * evaluated by Next's own config loader before anything in the app exists, and
 * a config that fails to load takes the build with it. So this depends on
 * nothing.
 *
 * That leaves it a SECOND spelling of rules `ssrf.ts` already has, which is the
 * failure mode this codebase has been bitten by before. It is not left on
 * trust: `scripts/test-brand-identity.mts` asserts that every host this admits
 * is also admitted by `admitUrlShape`, and that every address family the real
 * guard blocks is refused here too. The narrow rule is PROVEN to be a subset of
 * the real one rather than assumed to be.
 */

/** A dotted, public-looking hostname. No wildcards, no leading or trailing dot. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * Suffixes that only ever name a host inside a network.
 *
 * A superset of ssrf.ts's list, which the cross-check in the brand-identity
 * suite requires: this may refuse MORE than the real guard and must never
 * refuse less.
 */
const INTERNAL_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa', '.intranet', '.lan', '.localdomain', '.corp', '.private']

/** Names for this machine. Mirrors ssrf.ts. */
const SELF_NAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback'])

/**
 * True for anything that parses as a literal IPv4 or IPv6 address.
 *
 * Every label numeric, not four labels of three digits. `127.1` is a valid
 * spelling of 127.0.0.1 that a dotted-quad test waves straight through, and the
 * subset cross-check in the brand-identity suite caught exactly that: the real
 * guard refused it (the URL parser had already normalised it) and this did not.
 * `2130706433`, `0x7f000001` and `0177.0.0.1` are the same address again.
 */
const isLiteralAddress = (host) => {
  if (host.includes(':')) return true
  return host.split('.').every((label) => /^(?:\d+|0x[0-9a-f]+)$/i.test(label))
}

/**
 * Parse the operator's list.
 *
 * Deliberately total: a bad entry is DROPPED with a reason rather than throwing,
 * because a typo in an environment variable must not stop a production build -
 * it should cost the one image host that was misspelled and say so.
 */
export const admitImageHosts = (raw) => {
  const hosts = []
  const refused = []

  for (const part of String(raw ?? '').split(',')) {
    const entry = part.trim()
    if (!entry) continue
    const host = entry.toLowerCase()

    if (entry.includes('*')) {
      refused.push({ entry, reason: 'wildcards are not allowed: `**` here is what made /_next/image an open proxy' })
      continue
    }
    if (/[/?#@\s]/.test(entry) || entry.includes(':')) {
      refused.push({ entry, reason: 'this is a hostname list, so a scheme, port, path, query or credential is not accepted' })
      continue
    }
    if (isLiteralAddress(host)) {
      refused.push({ entry, reason: 'a literal IP address is not an image host anybody should be optimising through' })
      continue
    }
    if (SELF_NAMES.has(host)) {
      refused.push({ entry, reason: `"${host}" names this machine` })
      continue
    }
    if (INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) {
      refused.push({ entry, reason: `"${host}" ends in a suffix that only names a host inside a network` })
      continue
    }
    if (!HOSTNAME.test(host)) {
      refused.push({ entry, reason: `"${entry}" is not a hostname` })
      continue
    }
    if (host !== entry) {
      refused.push({ entry, reason: `normalises to "${host}"; write it that way` })
      continue
    }
    if (!hosts.includes(host)) hosts.push(host)
  }

  return { hosts, refused }
}

/** The `images.remotePatterns` value for a given environment. Empty admits nothing. */
export const imageRemotePatterns = (raw) =>
  admitImageHosts(raw).hosts.map((hostname) => ({ protocol: 'https', hostname }))

/**
 * Whether a hostname is a public name rather than an address, this machine, or
 * something that only resolves inside a network.
 *
 * Exported because the RENDER path needs the same answer. A brand's logo URL is
 * tenant input that becomes an `<img src>` on a public page: this server never
 * fetches it, but a tenant pointing every visitor's browser at
 * `http://169.254.169.254/` is an intranet probe running in somebody else's
 * browser, and there is no legitimate brand asset at an address like that.
 */
export const isPublicImageHost = (host) => {
  const h = String(host ?? '').replace(/\.$/, '').toLowerCase()
  if (!h) return false
  if (isLiteralAddress(h)) return false
  if (SELF_NAMES.has(h)) return false
  if (INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) return false
  return HOSTNAME.test(h)
}
