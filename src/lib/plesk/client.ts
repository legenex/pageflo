/**
 * Minimal Plesk REST API client.
 *
 * Plesk exposes its admin API on port 8443 (or whatever PLESK_API_URL points at).
 * Auth is via the `X-API-Key` header issued from Plesk: Tools & Settings → API Keys.
 *
 * We only call a small set of endpoints:
 *   - POST /api/v2/domains            (create a domain)
 *   - PUT  /api/v2/domains/{id}/nginx (reverse-proxy directives)
 *   - POST /api/v2/cli/extension/call (run the Let's Encrypt extension CLI)
 *
 * Plesk REST is finicky across versions. Calls return structured failure rather
 * than throwing, so the caller can degrade gracefully (mark the domain as
 * "verified but provisioning failed — needs manual setup") instead of losing it.
 *
 * TLS note: when the app container talks to Plesk on the same host via the
 * server's public IP (e.g. https://51.81.202.161:8443), Plesk presents a cert
 * issued for its primary hostname (os.legenex.com), not the IP — Node's fetch
 * rejects the connection with a generic "fetch failed" wrapping a TLS hostname
 * mismatch. Setting PLESK_INSECURE_SKIP_TLS_VERIFY=true loosens verification
 * for Plesk calls only. Acceptable because the traffic never leaves the host
 * (container → docker bridge → host → loopback to :8443).
 */
import { Agent } from 'undici'

export type PleskCallResult<T> = { ok: true; data: T } | { ok: false; status?: number; error: string }

const envOrThrow = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`PLESK env missing: ${name}`)
  return v
}

const baseUrl = (): string => envOrThrow('PLESK_API_URL').replace(/\/$/, '')
const apiKey = (): string => envOrThrow('PLESK_API_KEY')

let insecureAgent: Agent | null = null
const dispatcher = (): Agent | undefined => {
  const skip = (process.env.PLESK_INSECURE_SKIP_TLS_VERIFY ?? 'false').toLowerCase() === 'true'
  if (!skip) return undefined
  if (!insecureAgent) insecureAgent = new Agent({ connect: { rejectUnauthorized: false } })
  return insecureAgent
}

/**
 * Flatten Node fetch's nested error chain into a single readable string.
 */
const describeError = (err: unknown): string => {
  const parts: string[] = []
  let current: unknown = err
  let depth = 0
  while (current && depth < 5) {
    if (current instanceof Error) {
      const tag = 'code' in current && current.code ? `[${String((current as { code: unknown }).code)}] ` : ''
      parts.push(`${tag}${current.message}`)
      current = (current as Error & { cause?: unknown }).cause
    } else {
      parts.push(String(current))
      current = null
    }
    depth++
  }
  return parts.join(' → ') || 'plesk request failed'
}

/**
 * Build a useful error message from Plesk's response body. Plesk returns:
 *   { code: N, message: "Validation error", errors: [{property, message}] }
 * The top-level message is generic; the diagnostic is in `errors[]`. We surface
 * both so the operator sees the actual reason ("hosting_settings: required",
 * "license: no available domain slots", etc.) instead of a useless "Validation
 * error".
 */
const formatPleskError = (data: unknown, status: number): string => {
  if (typeof data !== 'object' || data === null) return `plesk ${status}`
  const d = data as { message?: unknown; errors?: Array<{ property?: unknown; message?: unknown }>; code?: unknown }
  const baseMsg = d.message ? String(d.message) : `plesk ${status}`
  if (Array.isArray(d.errors) && d.errors.length > 0) {
    const detail = d.errors
      .map((e) => {
        const prop = e.property ? String(e.property) : ''
        const msg = e.message ? String(e.message) : ''
        return prop && msg ? `${prop}: ${msg}` : (msg || prop)
      })
      .filter(Boolean)
      .join('; ')
    return detail ? `${baseMsg} (${detail})` : baseMsg
  }
  return baseMsg
}

const fetchPlesk = async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<PleskCallResult<T>> => {
  const url = `${baseUrl()}${path}`
  const method = init.method ?? 'GET'
  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'X-API-Key': apiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      // @ts-expect-error — undici's `dispatcher` option is supported at runtime
      // by Node's global fetch but isn't in the lib.dom RequestInit type.
      dispatcher: dispatcher(),
    })
    const text = await resp.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: formatPleskError(data, resp.status) }
    }
    return { ok: true, data: data as T }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

/**
 * Some Plesk operations are easier (and more stable across versions) to invoke
 * through the CLI extension API than through typed REST routes. This wraps the
 * `POST /api/v2/cli/{utility}/call` shape.
 */
export const pleskCli = async (utility: string, params: string[]): Promise<PleskCallResult<unknown>> => {
  return fetchPlesk(`/api/v2/cli/${utility}/call`, {
    method: 'POST',
    body: { params, env: {} },
  })
}

export const pleskGet = <T>(path: string) => fetchPlesk<T>(path)
export const pleskPost = <T>(path: string, body: unknown) => fetchPlesk<T>(path, { method: 'POST', body })
export const pleskPut = <T>(path: string, body: unknown) => fetchPlesk<T>(path, { method: 'PUT', body })
export const pleskDelete = <T>(path: string) => fetchPlesk<T>(path, { method: 'DELETE' })

export const pleskIsConfigured = (): boolean =>
  Boolean(process.env.PLESK_API_URL && process.env.PLESK_API_KEY)
