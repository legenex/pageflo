/**
 * URL admission control for anything this server fetches on a user's behalf.
 *
 * A brand-extraction URL, a page-clone URL, an outbound lead webhook, a quiz
 * flow's webhook node: each is an address supplied by a user that the SERVER
 * then fetches. That is a confused-deputy: the server can reach the metadata
 * endpoint, the database, Redis, and every other service on the private
 * network, and the user cannot. Nothing in this repo guarded that before this
 * file existed.
 *
 * Every such path in the codebase goes through `safeFetch` (GET/HEAD) or
 * `safePost` (bodies). A raw `fetch()` of a user-supplied address is a bug -
 * the guard existing is not the control, the guard being ON THE PATH is.
 *
 * The two rules that make the guard real rather than decorative:
 *
 *  1. THE HOST IS RE-VALIDATED ON EVERY REDIRECT HOP. A URL that resolves to a
 *     public address and then 302s to 127.0.0.1 defeats a check that only ran
 *     once, and that is the most common way this control is written wrong.
 *
 *  2. THE RESOLVER IS INJECTABLE. Admission is decided from resolved addresses,
 *     so the decision has to be testable without a network. Passing the
 *     resolver in is what makes every blocked range assertable offline.
 *
 * Known residual risk, stated rather than hidden: this validates the addresses
 * a hostname resolves to and then connects BY HOSTNAME, so a DNS entry that
 * changes between the two (rebinding) is not covered. Closing it needs the
 * connection pinned to the validated address - an undici dispatcher with a
 * custom `connect.lookup` - which is a runtime change that has to be verified
 * on the server. `assertSafeUrl` returns the validated addresses so that
 * pinning has what it needs when it lands.
 */

import { lookup as dnsLookup } from 'node:dns/promises'

/** Resolve a hostname to its addresses. Injected so admission is unit-testable. */
export type DnsResolver = (hostname: string) => Promise<string[]>

export const nodeDnsResolver: DnsResolver = async (hostname) => {
  // `verbatim` keeps the resolver's own ordering, so we validate the addresses
  // the connection would actually be offered rather than a re-sorted subset.
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map((r) => r.address)
}

export type UrlRejectionCode =
  | 'malformed'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'hostname'
  | 'dns'
  | 'blocked_address'

export type UrlAdmission =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; code: UrlRejectionCode; reason: string }

/**
 * Ports a brand page is actually served on.
 *
 * Strict by default because the interesting SSRF targets inside a network
 * listen on everything BUT 80 and 443 - 6379, 5432, 9200, 8500. A brand site on
 * a nonstandard port is vanishingly rare, and a caller that genuinely needs one
 * can widen the list explicitly rather than the default being wide for everyone.
 */
export const DEFAULT_ALLOWED_PORTS: readonly number[] = [80, 443]

/**
 * Host suffixes that only ever name something inside a network.
 *
 * A single-label hostname ("intranet", "grafana") is refused too: it can only
 * resolve through a local search domain, and no brand's public site is one.
 */
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa', '.intranet', '.lan'] as const
const BLOCKED_HOST_EXACT = new Set(['localhost', 'ip6-localhost', 'ip6-loopback'])

/* -------------------------------------------------------------------------- */
/*                              Address parsing                                */
/* -------------------------------------------------------------------------- */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export const parseIPv4 = (value: string): number[] | null => {
  const m = IPV4_RE.exec(value.trim())
  if (!m) return null
  const octets = m.slice(1, 5).map((n) => Number(n))
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? octets : null
}

/** Expand any IPv6 text form to eight 16-bit groups, or null. */
export const parseIPv6 = (value: string): number[] | null => {
  let text = value.trim().toLowerCase()
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  // A zone id ("fe80::1%eth0") names a local interface by definition.
  const zoneAt = text.indexOf('%')
  if (zoneAt !== -1) text = text.slice(0, zoneAt)
  if (text === '') return null

  // A trailing dotted-quad ("::ffff:127.0.0.1") becomes two groups.
  const lastColon = text.lastIndexOf(':')
  const tail = lastColon === -1 ? '' : text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail)
    if (!v4) return null
    text = `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }

  const doubleColon = text.indexOf('::')
  if (doubleColon !== -1 && text.indexOf('::', doubleColon + 1) !== -1) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    for (const chunk of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(chunk)) return null
      out.push(parseInt(chunk, 16))
    }
    return out
  }

  if (doubleColon === -1) {
    const groups = toGroups(text)
    return groups && groups.length === 8 ? groups : null
  }
  const head = toGroups(text.slice(0, doubleColon))
  const tailGroups = toGroups(text.slice(doubleColon + 2))
  if (!head || !tailGroups) return null
  const fill = 8 - head.length - tailGroups.length
  if (fill < 0) return null
  return [...head, ...Array<number>(fill).fill(0), ...tailGroups]
}

export type AddressVerdict = { allowed: true } | { allowed: false; reason: string }

/**
 * Classify an IPv4 address. Every refusal names the range, because "blocked"
 * on its own tells an operator nothing they can act on.
 */
export const classifyIPv4 = (octets: number[]): AddressVerdict => {
  const [a, b, c] = octets
  if (a === 0) return { allowed: false, reason: '0.0.0.0/8 (this network)' }
  if (a === 10) return { allowed: false, reason: '10.0.0.0/8 (private)' }
  if (a === 127) return { allowed: false, reason: '127.0.0.0/8 (loopback)' }
  if (a === 169 && b === 254) return { allowed: false, reason: '169.254.0.0/16 (link-local, cloud metadata)' }
  if (a === 172 && b >= 16 && b <= 31) return { allowed: false, reason: '172.16.0.0/12 (private)' }
  if (a === 192 && b === 168) return { allowed: false, reason: '192.168.0.0/16 (private)' }
  if (a === 100 && b >= 64 && b <= 127) return { allowed: false, reason: '100.64.0.0/10 (carrier-grade NAT)' }
  if (a === 192 && b === 0 && c === 0) return { allowed: false, reason: '192.0.0.0/24 (IETF protocol assignments)' }
  if (a === 192 && b === 0 && c === 2) return { allowed: false, reason: '192.0.2.0/24 (documentation)' }
  if (a === 198 && (b === 18 || b === 19)) return { allowed: false, reason: '198.18.0.0/15 (benchmarking)' }
  if (a === 198 && b === 51 && c === 100) return { allowed: false, reason: '198.51.100.0/24 (documentation)' }
  if (a === 203 && b === 0 && c === 113) return { allowed: false, reason: '203.0.113.0/24 (documentation)' }
  if (a >= 224 && a <= 239) return { allowed: false, reason: '224.0.0.0/4 (multicast)' }
  if (a >= 240) return { allowed: false, reason: '240.0.0.0/4 (reserved, includes broadcast)' }
  return { allowed: true }
}

export const classifyIPv6 = (groups: number[]): AddressVerdict => {
  const isZero = (upTo: number): boolean => groups.slice(0, upTo).every((g) => g === 0)

  if (groups.every((g) => g === 0)) return { allowed: false, reason: ':: (unspecified)' }
  if (isZero(7) && groups[7] === 1) return { allowed: false, reason: '::1 (loopback)' }
  // IPv4-mapped and IPv4-compatible both carry a v4 address that must be judged
  // as a v4 address. Skipping this is how ::ffff:127.0.0.1 gets through.
  if (isZero(5) && groups[5] === 0xffff) {
    return withEmbeddedV4(groups, 'IPv4-mapped ::ffff:0:0/96')
  }
  if (isZero(6) && (groups[6] !== 0 || groups[7] !== 0)) {
    return withEmbeddedV4(groups, 'IPv4-compatible ::/96')
  }
  // NAT64 well-known prefix carries a v4 address in the last two groups.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0) {
    return withEmbeddedV4(groups, 'NAT64 64:ff9b::/96')
  }
  // 6to4 embeds the v4 address in groups 1 and 2.
  if (groups[0] === 0x2002) {
    const embedded = [groups[1] >> 8, groups[1] & 0xff, groups[2] >> 8, groups[2] & 0xff]
    const verdict = classifyIPv4(embedded)
    if (!verdict.allowed) return { allowed: false, reason: `6to4 2002::/16 wrapping ${verdict.reason}` }
    return { allowed: true }
  }
  if ((groups[0] & 0xffc0) === 0xfe80) return { allowed: false, reason: 'fe80::/10 (link-local)' }
  if ((groups[0] & 0xfe00) === 0xfc00) return { allowed: false, reason: 'fc00::/7 (unique local)' }
  if ((groups[0] & 0xff00) === 0xff00) return { allowed: false, reason: 'ff00::/8 (multicast)' }
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return { allowed: false, reason: '2001:db8::/32 (documentation)' }
  return { allowed: true }
}

const withEmbeddedV4 = (groups: number[], label: string): AddressVerdict => {
  const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
  const verdict = classifyIPv4(embedded)
  if (!verdict.allowed) return { allowed: false, reason: `${label} wrapping ${verdict.reason}` }
  // A mapped PUBLIC v4 address is still refused: nothing legitimate asks this
  // server to reach a public host through a v4-in-v6 wrapper, and allowing the
  // wrapper widens the surface for no benefit.
  return { allowed: false, reason: `${label} (v4-in-v6 wrappers are not accepted)` }
}

/** Judge one resolved address string. Unparseable is refused, not ignored. */
export const classifyAddress = (address: string): AddressVerdict => {
  const v4 = parseIPv4(address)
  if (v4) return classifyIPv4(v4)
  const v6 = parseIPv6(address)
  if (v6) return classifyIPv6(v6)
  return { allowed: false, reason: `"${address}" is not an address this guard can classify` }
}

/* -------------------------------------------------------------------------- */
/*                              Admission control                              */
/* -------------------------------------------------------------------------- */

export type AssertSafeUrlOptions = {
  resolver?: DnsResolver
  allowedPorts?: readonly number[]
}

/**
 * Decide whether this server may fetch `raw`.
 *
 * Never throws: a resolver that fails is a refusal with a reason, because a
 * thrown error here would be caught somewhere generic and turn into "extraction
 * failed" with nothing an operator can act on.
 */
export const assertSafeUrl = async (raw: string, options: AssertSafeUrlOptions = {}): Promise<UrlAdmission> => {
  const resolver = options.resolver ?? nodeDnsResolver
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS

  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, code: 'malformed', reason: 'No address was given.' }
  // Embedded whitespace or a control character is how a second request gets
  // smuggled into an address. Refused rather than stripped.
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    return { ok: false, code: 'malformed', reason: 'The address contains whitespace or control characters.' }
  }

  // A bare domain is accepted and read as https. Anything that already names a
  // scheme must name http or https WITH an authority - no guessing at what
  // "localhost:8080" or "file:/etc/passwd" was meant to be.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return {
      ok: false,
      code: 'scheme',
      reason: 'Only http and https addresses can be read. Write the address with https:// in front of it.',
    }
  }
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, code: 'malformed', reason: 'That is not a readable web address.' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'scheme', reason: 'Only http and https addresses can be read.' }
  }
  if (url.username !== '' || url.password !== '') {
    return {
      ok: false,
      code: 'credentials',
      reason: 'The address carries a username or password. Remove them before reading it.',
    }
  }

  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port)
  if (!Number.isInteger(port) || !allowedPorts.includes(port)) {
    return {
      ok: false,
      code: 'port',
      reason: `Port ${port} is not read. Allowed ports: ${allowedPorts.join(', ')}.`,
    }
  }

  // `hostname` keeps IPv6 brackets and may keep a trailing root dot.
  const bracketed = url.hostname.startsWith('[') && url.hostname.endsWith(']')
  const host = (bracketed ? url.hostname.slice(1, -1) : url.hostname).replace(/\.$/, '').toLowerCase()
  if (!host) return { ok: false, code: 'hostname', reason: 'The address has no host.' }

  // Literal addresses are judged directly. The URL parser has already
  // normalised the decimal, octal and hex spellings of an IPv4 address, so
  // http://2130706433/ arrives here as 127.0.0.1.
  const literalV4 = parseIPv4(host)
  const literalV6 = bracketed ? parseIPv6(host) : null
  if (literalV4 || literalV6) {
    const verdict = literalV4 ? classifyIPv4(literalV4) : classifyIPv6(literalV6 as number[])
    if (!verdict.allowed) {
      return { ok: false, code: 'blocked_address', reason: `${host} is in ${verdict.reason}.` }
    }
    return { ok: true, url, addresses: [host] }
  }

  if (BLOCKED_HOST_EXACT.has(host)) {
    return { ok: false, code: 'hostname', reason: `"${host}" names this machine.` }
  }
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) {
      return { ok: false, code: 'hostname', reason: `"${host}" ends in "${suffix}", which only names a host inside a network.` }
    }
  }
  if (!host.includes('.')) {
    return {
      ok: false,
      code: 'hostname',
      reason: `"${host}" has no domain, so it can only resolve inside this network.`,
    }
  }

  let addresses: string[]
  try {
    addresses = await resolver(host)
  } catch (err) {
    return {
      ok: false,
      code: 'dns',
      reason: `"${host}" could not be resolved: ${err instanceof Error ? err.message : 'unknown DNS error'}.`,
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { ok: false, code: 'dns', reason: `"${host}" resolved to no addresses.` }
  }

  // EVERY address must pass. A hostname with one public and one private record
  // is a rebinding attempt, and picking the address we like would be choosing
  // to be fooled.
  for (const address of addresses) {
    const verdict = classifyAddress(address)
    if (!verdict.allowed) {
      return {
        ok: false,
        code: 'blocked_address',
        reason: `"${host}" resolves to ${address}, which is in ${verdict.reason}.`,
      }
    }
  }

  return { ok: true, url, addresses }
}

/* -------------------------------------------------------------------------- */
/*                                 safeFetch                                   */
/* -------------------------------------------------------------------------- */

export type SafeFetchResponse = {
  status: number
  headers: { get: (name: string) => string | null }
  body?: ReadableStream<Uint8Array> | null
  text: () => Promise<string>
}

export type FetchLike = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    redirect: 'manual'
    signal: AbortSignal
    /** Present only for the POST path; GET/HEAD never carry one. */
    body?: string
  },
) => Promise<SafeFetchResponse>

export type SafeFetchRejectionCode =
  | UrlRejectionCode
  | 'timeout'
  | 'too_many_redirects'
  | 'redirect_without_location'
  | 'too_large'
  | 'http_error'
  | 'network'

export type SafeFetchResult =
  | {
      ok: true
      status: number
      finalUrl: string
      contentType: string
      body: string
      bytes: number
      /** Every URL in the chain, first to last. Evidence for a source record. */
      hops: string[]
    }
  | { ok: false; code: SafeFetchRejectionCode; reason: string; hops: string[] }

export type SafeFetchOptions = AssertSafeUrlOptions & {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
  /** Hard ceiling on the response body. Exceeding it is a refusal, not a truncation. */
  maxBytes?: number
  /**
   * Return as soon as the headers are in, without reading the body - what HEAD
   * does, but for callers that must send GET because the host refuses HEAD and
   * still only want the content type. Without this a ranged GET whose server
   * ignores `Range` would buffer a whole asset just to read one header.
   */
  headersOnly?: boolean
  maxRedirects?: number
  /** Budget for the WHOLE chain, not per hop. */
  timeoutMs?: number
  fetchImpl?: FetchLike
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 8000

/** Identifies the crawler honestly; some brand sites refuse an empty agent. */
const USER_AGENT = 'LegalOS-BrandIdentity/1 (+https://os.legenex.com)'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * `cache: 'no-store'` is not optional here. Next patches the global fetch with
 * its own caching, and every caller of this module is reading LIVE external
 * state - a brand page being extracted, a domain being verified, a webhook
 * receiver's answer. A cached response would make a re-check silently return
 * the previous run's result, which is the opposite of what all of them want.
 */
const defaultFetchImpl: FetchLike = (url, init) => fetch(url, { ...init, cache: 'no-store' })

/**
 * Fetch a URL that has been admitted, re-admitting the host on every hop.
 *
 * Redirects are followed MANUALLY for exactly one reason: `redirect: 'follow'`
 * hands the decision to the runtime, which will happily land on 127.0.0.1
 * without telling anyone. Following them here means every hop goes back through
 * `assertSafeUrl` before a connection is opened.
 */
export const safeFetch = async (raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> => {
  const method = options.method ?? 'GET'
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? defaultFetchImpl
  const deadline = Date.now() + timeoutMs
  const hops: string[] = []

  let target = raw
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const admission = await assertSafeUrl(target, options)
    if (!admission.ok) {
      return {
        ok: false,
        code: admission.code,
        reason: hop === 0 ? admission.reason : `Redirect ${hop} was refused: ${admission.reason}`,
        hops,
      }
    }
    const current = admission.url.toString()
    hops.push(current)

    const remaining = deadline - Date.now()
    if (remaining <= 0) return { ok: false, code: 'timeout', reason: `Timed out after ${timeoutMs}ms.`, hops }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), remaining)
    let res: SafeFetchResponse
    try {
      res = await fetchImpl(current, {
        method,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers ?? {}) },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        return { ok: false, code: 'timeout', reason: `Timed out after ${timeoutMs}ms.`, hops }
      }
      return {
        ok: false,
        code: 'network',
        reason: `Could not reach ${current}: ${err instanceof Error ? err.message : 'unknown network error'}.`,
        hops,
      }
    }

    // The timer stays ARMED through the body read. Clearing it here - which is
    // where it used to be cleared - disarms the deadline the moment the headers
    // land, so a server that answers 200 and then dribbles bytes under the size
    // cap holds the read open forever. "Budget for the WHOLE chain" has to
    // include the part where the bytes arrive, or it is not a budget.
    try {
      if (REDIRECT_STATUSES.has(res.status)) {
        await discard(res)
        const location = res.headers.get('location')
        if (!location) {
          return { ok: false, code: 'redirect_without_location', reason: `${current} redirected with no destination.`, hops }
        }
        if (hop === maxRedirects) {
          return { ok: false, code: 'too_many_redirects', reason: `More than ${maxRedirects} redirects.`, hops }
        }
        // Relative destinations are resolved against the hop we are on, then go
        // back through admission like any other address.
        try {
          target = new URL(location, current).toString()
        } catch {
          return { ok: false, code: 'malformed', reason: `${current} redirected to an unreadable address.`, hops }
        }
        continue
      }

      if (res.status < 200 || res.status >= 300) {
        await discard(res)
        return { ok: false, code: 'http_error', reason: `${current} answered ${res.status}.`, hops }
      }

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
      const declared = Number(res.headers.get('content-length') ?? '')
      if (Number.isFinite(declared) && declared > maxBytes) {
        await discard(res)
        return {
          ok: false,
          code: 'too_large',
          reason: `${current} declares ${declared} bytes, over the ${maxBytes}-byte ceiling.`,
          hops,
        }
      }
      if (method === 'HEAD' || options.headersOnly) {
        await discard(res)
        return { ok: true, status: res.status, finalUrl: current, contentType, body: '', bytes: 0, hops }
      }

      const read = await readCapped(res, maxBytes)
      if (!read.ok) {
        const timedOut = controller.signal.aborted
        return {
          ok: false,
          code: timedOut ? 'timeout' : read.code,
          reason: timedOut ? `Timed out after ${timeoutMs}ms.` : `${current}: ${read.reason}`,
          hops,
        }
      }
      return { ok: true, status: res.status, finalUrl: current, contentType, body: read.text, bytes: read.bytes, hops }
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false, code: 'too_many_redirects', reason: `More than ${maxRedirects} redirects.`, hops }
}

/* -------------------------------------------------------------------------- */
/*                                  safePost                                   */
/* -------------------------------------------------------------------------- */

export type SafePostRejectionCode = SafeFetchRejectionCode | 'redirect_refused'

export type SafePostResult =
  | { ok: true; status: number; url: string; contentType: string; body: string; bytes: number }
  | { ok: false; code: SafePostRejectionCode; reason: string; status?: number }

/** The verbs a caller can send a body with. GET is here so a caller that lets an
 *  author choose the method does not have to fall back to POST and send a body
 *  the author never asked for. */
export type SafePostMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET'

export type SafePostOptions = AssertSafeUrlOptions & {
  method?: SafePostMethod
  headers?: Record<string, string>
  body?: string
  maxBytes?: number
  timeoutMs?: number
  fetchImpl?: FetchLike
}

/**
 * POST to a URL the server was told to call by a user - an outbound lead
 * webhook, a Slack hook, a quiz flow's webhook node.
 *
 * These are the same confused-deputy shape as `safeFetch`, with one difference
 * that changes the design: they carry a body.
 *
 * REDIRECTS ARE REFUSED RATHER THAN FOLLOWED, and that is deliberate. Following
 * a 301/302/303 turns a POST into a GET per the HTTP spec, which silently drops
 * the payload - a webhook that reports "delivered" and delivered nothing is
 * worse than one that reports a failure. 307/308 do preserve the body, but the
 * destination is chosen by the receiver rather than by the operator, and
 * forwarding a signed lead payload to an address nobody configured is not a
 * thing to do quietly. A receiver that redirects is misconfigured; saying so is
 * the useful behaviour.
 */
export const safePost = async (raw: string, options: SafePostOptions = {}): Promise<SafePostResult> => {
  const method = options.method ?? 'POST'
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? defaultFetchImpl

  const admission = await assertSafeUrl(raw, options)
  if (!admission.ok) return { ok: false, code: admission.code, reason: admission.reason }

  const url = admission.url.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: SafeFetchResponse
  try {
    res = await fetchImpl(url, {
      method,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers ?? {}) },
      redirect: 'manual',
      signal: controller.signal,
      // A GET carries no body. Sending one where the author chose GET is how a
      // verification node ends up with a 405 and a flow that routes on nothing.
      ...(method === 'GET' ? {} : { body: options.body ?? '' }),
    })
  } catch (err) {
    clearTimeout(timer)
    if (controller.signal.aborted) return { ok: false, code: 'timeout', reason: `Timed out after ${timeoutMs}ms.` }
    return {
      ok: false,
      code: 'network',
      reason: `Could not reach ${url}: ${err instanceof Error ? err.message : 'unknown network error'}.`,
    }
  }

  // Armed through the read, as in `safeFetch`, and it matters more here: this
  // runs inside the SYNCHRONOUS lead pipeline, so a receiver that answers 200
  // and then trickles bytes would hold a visitor's lead submission open.
  try {
    if (REDIRECT_STATUSES.has(res.status)) {
      await discard(res)
      return {
        ok: false,
        code: 'redirect_refused',
        reason: `${url} answered ${res.status} (a redirect). A POST is not redirected, because that would drop the payload or send it somewhere nobody configured.`,
        status: res.status,
      }
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    // The status is reported rather than judged: a caller dispatching a webhook
    // wants the receiver's 4xx, not a generic failure.
    const read = await readCapped(res, maxBytes)
    if (!read.ok) {
      const timedOut = controller.signal.aborted
      return {
        ok: false,
        code: timedOut ? 'timeout' : read.code,
        reason: timedOut ? `Timed out after ${timeoutMs}ms.` : `${url}: ${read.reason}`,
        status: res.status,
      }
    }
    return { ok: true, status: res.status, url, contentType, body: read.text, bytes: read.bytes }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Let go of a response body we are not going to read.
 *
 * An unconsumed body pins its socket in undici until GC. `headOk` fans out
 * across ~20 candidate asset URLs per brand extraction and never reads one of
 * them, so "never" is a real number of sockets.
 */
const discard = async (res: SafeFetchResponse): Promise<void> => {
  const stream = res.body
  if (!stream || typeof stream.cancel !== 'function') return
  await stream.cancel().catch(() => undefined)
}

/**
 * Read a body with a hard byte ceiling.
 *
 * Streams when the response exposes one, so an oversized body is abandoned
 * mid-flight rather than buffered in full and then measured. A response without
 * a stream is still capped, just after the fact - which is the best a
 * `text()`-only implementation allows, and worth having rather than skipping.
 */
const readCapped = async (
  res: SafeFetchResponse,
  maxBytes: number,
): Promise<{ ok: true; text: string; bytes: number } | { ok: false; code: 'too_large' | 'network'; reason: string }> => {
  const stream = res.body
  if (!stream || typeof stream.getReader !== 'function') {
    try {
      const text = await res.text()
      const bytes = Buffer.byteLength(text, 'utf8')
      if (bytes > maxBytes) return { ok: false, code: 'too_large', reason: `body is ${bytes} bytes, over the ${maxBytes}-byte ceiling` }
      return { ok: true, text, bytes }
    } catch (err) {
      return { ok: false, code: 'network', reason: err instanceof Error ? err.message : 'the body could not be read' }
    }
  }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, code: 'too_large', reason: `body exceeds the ${maxBytes}-byte ceiling` }
      }
      chunks.push(value)
    }
  } catch (err) {
    await reader.cancel().catch(() => undefined)
    return { ok: false, code: 'network', reason: err instanceof Error ? err.message : 'the body could not be read' }
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder('utf-8').decode(joined), bytes: total }
}
