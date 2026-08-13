// Server-side TrustedForm cert claim. Called from /api/leads after a Lead is written.
// Never exposes account credentials to the client.

import { safePost } from '@/lib/net/ssrf'

/**
 * The claim POST carries `Authorization: Basic <accountId:apiKey>`, and the URL
 * it goes to arrives in the body of an UNAUTHENTICATED public lead submission
 * (`trustedform_cert_url`, validated upstream only as `z.string()`).
 *
 * Posting those credentials to whatever address a visitor supplies is a
 * credential leak, not merely an SSRF: a hostile submission naming its own
 * server is handed the account's TrustedForm API key on the first lead.
 *
 * So the host is pinned. A cert lives on TrustedForm's own domain and nowhere
 * else, and an allowlist is the only form of this check that cannot be talked
 * around by a redirect, a userinfo prefix, or a lookalike domain. `safePost`
 * then covers the private-network half of the problem and refuses redirects,
 * so the credentials cannot be bounced onward either.
 */
const TRUSTEDFORM_CERT_HOST = 'trustedform.com'

const isTrustedFormHost = (host: string): boolean =>
  host === TRUSTEDFORM_CERT_HOST || host.endsWith(`.${TRUSTEDFORM_CERT_HOST}`)

export type TrustedFormClaimArgs = {
  certUrl: string
  accountId: string
  apiKey: string
  reference?: string
  vendor?: string
  retainCert?: boolean
}

export type TrustedFormClaimResult = {
  ok: boolean
  cert_id?: string
  raw?: unknown
  error?: string
}

export const claimTrustedFormCert = async (args: TrustedFormClaimArgs): Promise<TrustedFormClaimResult> => {
  const { certUrl, accountId, apiKey, reference, vendor, retainCert } = args
  if (!certUrl) return { ok: false, error: 'missing certUrl' }
  if (!accountId || !apiKey) return { ok: false, error: 'missing trustedform credentials' }

  const body = new URLSearchParams()
  if (reference) body.set('reference', reference)
  if (vendor) body.set('vendor', vendor)
  if (retainCert) body.set('retain', 'true')

  // Parsed and host-checked BEFORE the credentials are assembled, so no request
  // carrying the API key is ever issued to an address that failed the check.
  // (The key is in lexical scope from the destructure above; what matters is
  // that nothing sends it.)
  let parsed: URL
  try {
    parsed = new URL(certUrl)
  } catch {
    return { ok: false, error: 'certUrl is not a readable URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'certUrl must be https' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'certUrl carries credentials' }
  }
  if (!isTrustedFormHost(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `certUrl host "${parsed.hostname}" is not TrustedForm; refusing to send credentials to it` }
  }

  const auth = Buffer.from(`${accountId}:${apiKey}`).toString('base64')
  const resp = await safePost(parsed.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!resp.ok) return { ok: false, error: resp.reason }

  let raw: unknown = {}
  try {
    raw = JSON.parse(resp.body)
  } catch {
    raw = {}
  }
  if (resp.status < 200 || resp.status >= 300) {
    return { ok: false, raw, error: `trustedform returned ${resp.status}` }
  }
  return { ok: true, cert_id: (raw as { cert_id?: string }).cert_id, raw }
}
