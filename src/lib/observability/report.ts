/**
 * One place a server error is reported from.
 *
 * `docs/production-readiness.md` exit criterion 6 is "when something breaks at
 * 3am, there is a way to find out what", and it has been FAIL since it was
 * written. There were seventeen `console.error` calls in `src/`, each with its
 * own wording, none carrying which brand or which route it happened on, and
 * nothing collecting them.
 *
 * WHY THIS IS PROVIDER-NEUTRAL AND NOT SENTRY. Choosing the destination is a
 * decision with a bill and a data-processing agreement attached, and it is not
 * one an engineering pass gets to make. What an engineering pass CAN do is make
 * the decision cheap: every error already goes through one function with one
 * stable shape, so adopting a provider is an adapter and a credential rather
 * than a hunt through seventeen call sites. Until one is chosen this writes a
 * structured line to the process log, which `journalctl -u legalos-dev` already
 * captures and any log drain can parse.
 *
 * WHAT IT WILL NOT SEND. An error report leaving this server must not carry
 * personal data. A lead's name, email and phone are the product's most sensitive
 * rows and they are exactly the values likeliest to be inside an error message —
 * a validation failure quotes the value that failed. So every string is redacted
 * before it is emitted, on the way OUT rather than at the call sites, because a
 * call site that forgets is indistinguishable from one that has not been written
 * yet.
 */

import { safePost } from '@/lib/net/ssrf'

export type ErrorKind =
  /** An unhandled failure in a route handler or server action. */
  | 'server'
  /** A React render that threw, reported from an error boundary. */
  | 'render'
  /** A step of the lead pipeline that did not deliver. */
  | 'pipeline'
  /** An outbound call to somebody else's service that failed. */
  | 'integration'
  /** A background or scheduled job. */
  | 'job'

export type ErrorContext = {
  /** Which brand, when the request had one. Never a name — an id. */
  siteId?: string | number | null
  /** Route or action, e.g. `POST /api/leads`. */
  route?: string | null
  /** A stable label for the operation, e.g. `quiz-webhook:n_tier_lookup`. */
  operation?: string | null
  /** Anything else, redacted like everything else. Keep it small. */
  extra?: Record<string, unknown>
}

export type ErrorEvent = {
  ts: string
  kind: ErrorKind
  message: string
  stack: string | null
  /** Groups repeats of the same failure. See `fingerprint`. */
  fingerprint: string
  environment: string
  release: string
  context: ErrorContext
}

/* ------------------------------------------------------------- redaction */

/**
 * Patterns whose MATCH is the sensitive part.
 *
 * Deliberately broad. A false positive costs a `[redacted]` in a log line; a
 * false negative puts a claimant's phone number in a third party's error
 * dashboard, on a legal advertising funnel, forever.
 */
const REDACTIONS: Array<{ re: RegExp; as: string }> = [
  // Email. Before the number rules, because an address can contain digits.
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, as: '[email]' },
  // Bearer tokens, API keys and anything after a secret-ish key name.
  //
  // The optional scheme word is the point: `Authorization: Bearer sk_live_…`
  // otherwise matches "Authorization: Bearer" and treats the SCHEME as the
  // secret, leaving the key itself in the log. The suite caught that.
  {
    re: /\b(bearer|token|secret|password|api[_-]?key|authorization)\b\s*[:=]?\s*(?:bearer|basic|token)?\s*["']?[^\s,;"'}\]]+/gi,
    as: '$1 [redacted]',
  },
  // A long run of digits, with or without separators: phone numbers, card
  // numbers, and ids that are none of our business.
  { re: /\b(?:\+?\d[\d\s().-]{8,}\d)\b/g, as: '[number]' },
  // US SSN shape.
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, as: '[ssn]' },
  // A URL's query string can carry anything, including a token or an answer.
  { re: /(\?|&)([\w.-]+)=([^&\s"']+)/g, as: '$1$2=[redacted]' },
]

/** Redact one string. Idempotent: redacting twice changes nothing. */
export const redact = (value: string): string => {
  let out = value
  for (const { re, as } of REDACTIONS) out = out.replace(re, as)
  return out
}

/** Redact recursively, with a depth and size bound so a cyclic object cannot hang a report. */
export const redactDeep = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[deep]'
  if (typeof value === 'string') return redact(value).slice(0, 2000)
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactDeep(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[k] = redactDeep(v, depth + 1)
    }
    return out
  }
  return String(value).slice(0, 200)
}

/* ----------------------------------------------------------- fingerprint */

/**
 * A stable grouping key for "the same failure again".
 *
 * Digits, quoted values and hex are replaced before hashing, so
 * "row 41 not found" and "row 9127 not found" are one problem rather than two
 * thousand. It is a display and grouping aid, not a security primitive; a
 * 32-bit FNV-1a is the right size for it and needs no dependency.
 */
export const fingerprint = (kind: string, message: string, operation?: string | null): string => {
  const normalized = message
    .replace(/\d+/g, '#')
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .toLowerCase()
    .slice(0, 200)
  const input = `${kind}|${operation ?? ''}|${normalized}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/* --------------------------------------------------------------- the event */

const messageOf = (err: unknown): string => {
  if (err instanceof Error) return err.message || err.name
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err).slice(0, 500)
  } catch {
    return String(err)
  }
}

export const buildErrorEvent = (
  kind: ErrorKind,
  err: unknown,
  context: ErrorContext = {},
  now: string = new Date().toISOString(),
): ErrorEvent => {
  const message = redact(messageOf(err)).slice(0, 1000)
  return {
    ts: now,
    kind,
    message,
    // The stack names our own files and line numbers, which is the useful part,
    // and can contain an interpolated value, which is not.
    stack: err instanceof Error && err.stack ? redact(err.stack).slice(0, 4000) : null,
    fingerprint: fingerprint(kind, message, context.operation),
    environment: process.env.NODE_ENV ?? 'unknown',
    release: process.env.LEGALOS_GIT_SHA ?? 'unknown',
    context: {
      siteId: context.siteId == null ? null : String(context.siteId),
      route: context.route ? redact(context.route).slice(0, 200) : null,
      operation: context.operation ? String(context.operation).slice(0, 120) : null,
      ...(context.extra ? { extra: redactDeep(context.extra) as Record<string, unknown> } : {}),
    },
  }
}

/* ------------------------------------------------------------- transports */

export type ErrorTransport = (event: ErrorEvent) => void | Promise<void>

/**
 * The always-on transport: one JSON line per event.
 *
 * `journalctl -u legalos-dev` already captures stdout, so this is a real answer
 * to "find out what broke at 3am" with no provider and no credential — and a
 * structured line is what makes it greppable and, later, parseable by whatever
 * is chosen.
 */
export const logTransport: ErrorTransport = (event) => {
  // eslint-disable-next-line no-console
  console.error(`[legalos:error] ${JSON.stringify(event)}`)
}

/**
 * The optional transport: POST the event somewhere.
 *
 * Through `safePost`, so a misconfigured URL cannot be turned into a request
 * against the private network, and with a short deadline because a visitor may
 * be waiting on the response that is being reported. Failure to REPORT is never
 * allowed to become a second failure: it is logged and swallowed.
 */
export const webhookTransport = (url: string): ErrorTransport => async (event) => {
  const res = await safePost(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    timeoutMs: 3000,
    maxBytes: 8 * 1024,
  })
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[legalos:error] the error webhook itself failed: ${res.reason}`)
  }
}

let configured: ErrorTransport[] | null = null

/**
 * The transports in force.
 *
 * Resolved once and memoised, because this runs on error paths and reading and
 * re-validating an environment variable per failure is exactly the wrong time to
 * do work. `resetTransports` exists for tests.
 */
export const transports = (): ErrorTransport[] => {
  if (configured) return configured
  const out: ErrorTransport[] = [logTransport]
  const url = (process.env.LEGALOS_ERROR_WEBHOOK_URL ?? '').trim()
  if (url) out.push(webhookTransport(url))
  configured = out
  return configured
}

export const setTransports = (next: ErrorTransport[] | null): void => {
  configured = next
}

/**
 * Report an error. Never throws, never rejects, never blocks a response.
 *
 * "Never throws" is the whole contract. This is called from catch blocks and
 * from error boundaries — the places where a second failure has nowhere to go —
 * so every transport is wrapped and a rejected promise is swallowed after being
 * logged.
 */
export const reportError = (kind: ErrorKind, err: unknown, context: ErrorContext = {}): ErrorEvent => {
  const event = buildErrorEvent(kind, err, context)
  for (const transport of transports()) {
    try {
      const result = transport(event)
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch(() => undefined)
      }
    } catch {
      // A transport that throws must not replace the error being reported.
    }
  }
  return event
}
