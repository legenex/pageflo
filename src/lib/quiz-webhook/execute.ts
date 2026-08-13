/**
 * Running one webhook / verification node of a quiz flow.
 *
 * Split out of `app/api/legalos/quiz-webhook/route.ts` so the thing that
 * decides what a provider's answer MEANS can be exercised without a database, a
 * host header, a Site or a network. That mattered immediately: the shipped MVA
 * flow assigns tiers 1, 2 and 4 only from this node's response mapping, so every
 * behaviour below — a good tier, an unknown one, a timeout, HTML instead of JSON
 * — decides whether a real visitor is qualified, and none of it was covered by
 * anything.
 *
 * THE RULES, all of which are refusals rather than repairs:
 *
 *  - The URL, verb, headers and payload template come from the STORED NODE and
 *    never from the caller. Only answer values do, and only into placeholders
 *    the flow author already wrote. The URL is deliberately not interpolated:
 *    substituting visitor input into the destination would hand the visitor the
 *    request.
 *  - Only the fields named in `responseMappings` come back. A provider's
 *    response body never leaves this function, so this cannot be turned into a
 *    reader for an endpoint's output even if one were reachable.
 *  - Every failure returns `ok: false` with a REASON and no fields. Nothing
 *    throws. A visitor mid-funnel must never be dead-ended by a buyer's endpoint
 *    being down: a lead with no tier is worth more than no lead.
 *
 * The network call is injected. `safePost` is the default and is what runs in
 * production — it is the SSRF guard, and a caller that supplied its own would be
 * removing it — but a test that had to reach a real host to prove "a provider
 * returned HTML" would be testing the host.
 */

import { safePost, type SafePostMethod, type SafePostResult } from '@/lib/net/ssrf'

export type WebhookNode = {
  id?: unknown
  type?: unknown
  webhookUrl?: unknown
  webhookMethod?: unknown
  webhookPayload?: unknown
  webhookHeaders?: Array<{ key?: unknown; value?: unknown }>
  responseMappings?: Array<{ jsonPath?: unknown; fieldKey?: unknown }>
}

/** Node types that make a call. Both carry the identical shape; only the builder's labelling differs. */
export const EXECUTABLE_NODE_TYPES: ReadonlySet<string> = new Set(['webhook', 'verification'])

export type WebhookOutcome =
  | { ok: true; fields: Record<string, string>; called: boolean }
  | {
      ok: false
      /** Which stage refused, for the log and for a test to assert on. */
      code:
        | 'not_executable'
        | 'nothing_to_do'
        | 'transport'
        | 'http_status'
        | 'not_json'
      reason: string
      /** The provider's HTTP status, when there was one. */
      status?: number
    }

export type ExecuteDeps = {
  /** Defaults to the real SSRF-guarded poster. */
  post?: (url: string, options: Parameters<typeof safePost>[1]) => Promise<SafePostResult>
  /** Wall-clock budget for the provider. A visitor is on a spinner. */
  timeoutMs?: number
  maxBytes?: number
}

/** A visitor's answer, flattened to the scalar a template can carry. */
export const scalar = (v: unknown): string => {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(scalar).join(',')
  if (typeof v === 'object') return ''
  return String(v)
}

/** Substitute `{{key}}` from the visitor's answers, length-capped. */
export const interpolate = (template: string, values: Record<string, unknown>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => scalar(values[key]).slice(0, 500))

/**
 * Substitute into a JSON template WITHOUT letting an answer end the string it
 * is being placed in.
 *
 * The template is JSON the author wrote (`{"mobile": "{{mobile}}"}`) and the
 * values are typed by a visitor. Plain textual substitution lets an answer of
 * `x","tier":"1` close the string and forge sibling fields, so the buyer
 * receives invented data attributed to the brand. Each value is JSON-encoded and
 * the author's own surrounding quotes are consumed, which leaves the template's
 * shape intact and the value inert.
 */
export const interpolateJson = (template: string, values: Record<string, unknown>): string =>
  template.replace(/"?\{\{(\w+)\}\}"?/g, (_m, key: string) => JSON.stringify(scalar(values[key]).slice(0, 500)))

/**
 * Header values get the same substitution, then lose anything that could start
 * a second header. A newline in a header value is request splitting, and
 * refusing to carry one costs nothing legitimate.
 */
export const headerValue = (template: string, values: Record<string, unknown>): string =>
  interpolate(template, values)
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\x00-\x1f\x7f]/g, '')
    .slice(0, 1000)

/**
 * Read `a.b[0].c` out of a parsed JSON body.
 *
 * Missing yields undefined rather than a throw: a buyer changing their response
 * shape must degrade to "no tier" and not to a 500.
 */
export const readJsonPath = (root: unknown, path: string): unknown => {
  const trimmed = path.trim()
  if (!trimmed) return undefined
  const parts = trimmed.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: unknown = root
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** The verb the author chose, or POST. The builder offers five. */
export const methodOf = (node: WebhookNode): SafePostMethod => {
  const chosen = String(node.webhookMethod ?? 'POST').toUpperCase()
  return chosen === 'GET' || chosen === 'PUT' || chosen === 'PATCH' || chosen === 'DELETE' ? chosen : 'POST'
}

export const executeWebhookNode = async (
  node: WebhookNode,
  values: Record<string, unknown>,
  deps: ExecuteDeps = {},
): Promise<WebhookOutcome> => {
  if (!EXECUTABLE_NODE_TYPES.has(String(node.type))) {
    return { ok: false, code: 'not_executable', reason: 'node is not a webhook or verification node' }
  }

  const url = typeof node.webhookUrl === 'string' ? node.webhookUrl.trim() : ''
  const mappings = (Array.isArray(node.responseMappings) ? node.responseMappings : [])
    .map((m) => ({ jsonPath: String(m?.jsonPath ?? '').trim(), fieldKey: String(m?.fieldKey ?? '').trim() }))
    .filter((m) => m.jsonPath && m.fieldKey)

  // Nothing to call, or nothing to do with the answer. Not an error: a node the
  // flow can walk straight through.
  if (!url || mappings.length === 0) return { ok: true, fields: {}, called: false }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  for (const h of Array.isArray(node.webhookHeaders) ? node.webhookHeaders : []) {
    const key = String(h?.key ?? '').trim()
    // A header name is a token. Anything else is somebody trying to write a
    // request rather than a header.
    if (!key || !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) continue
    headers[key] = headerValue(String(h?.value ?? ''), values)
  }

  const post = deps.post ?? safePost
  const res = await post(url, {
    method: methodOf(node),
    headers,
    body: interpolateJson(typeof node.webhookPayload === 'string' ? node.webhookPayload : '', values),
    timeoutMs: deps.timeoutMs ?? 6000,
    maxBytes: deps.maxBytes ?? 256 * 1024,
  })

  if (!res.ok) return { ok: false, code: 'transport', reason: res.reason, status: res.status }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, code: 'http_status', reason: `provider answered ${res.status}`, status: res.status }
  }

  let body: unknown
  try {
    body = JSON.parse(res.body)
  } catch {
    // The measured production failure: the configured endpoint is a web app, so
    // a GET returns an HTML shell. Refusing it by SHAPE rather than by content
    // type means a provider that serves JSON with the wrong header still works
    // and one that serves a login page never becomes a tier.
    return { ok: false, code: 'not_json', reason: 'provider did not return JSON', status: res.status }
  }

  const fields: Record<string, string> = {}
  for (const m of mappings) {
    const value = readJsonPath(body, m.jsonPath)
    // Objects and arrays are dropped rather than stringified: `[object Object]`
    // as a tier is a value that looks like an answer.
    if (value == null || typeof value === 'object') continue
    fields[m.fieldKey] = String(value).slice(0, 500)
  }

  return { ok: true, fields, called: true }
}
