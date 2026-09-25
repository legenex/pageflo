// HLR (Home Location Register) phone enrichment. Provider-agnostic interface so we can
// swap Plivo / Twilio Lookup / Trestle behind one shape.

import { fetchWithTimeout } from '@/lib/net/outbound'

/**
 * What the lookup established. Kept apart from `ok` because "the provider said
 * the number is bad" and "we could not ask the provider" are opposite findings
 * that both have `ok: false`, and a console that shows both as "not checked"
 * hides which one an operator has to act on.
 *
 *   valid           the provider resolved the number
 *   invalid         the provider rejected the number itself
 *   not_configured  no credentials / an unsupported provider: nothing was asked
 *   provider_error  the provider was asked and failed (auth, 5xx, timeout)
 */
export type HLRState = 'valid' | 'invalid' | 'not_configured' | 'provider_error'

export type HLRResult = {
  ok: boolean
  state: HLRState
  checked_at: string
  provider: string
  raw?: unknown
  error?: string
  phone_format?: {
    e164?: string
    national?: string
    country_code?: string
  }
  carrier?: {
    name?: string
    type?: 'mobile' | 'landline' | 'voip' | 'unknown'
    mnc?: string
    mcc?: string
  }
  is_ported?: boolean
  is_active?: boolean
}

const result = (r: Omit<HLRResult, 'checked_at'>): HLRResult => ({ ...r, checked_at: new Date().toISOString() })

const lookupPlivo = async (phone: string): Promise<HLRResult> => {
  const authId = process.env.PLIVO_AUTH_ID
  const authToken = process.env.PLIVO_AUTH_TOKEN
  if (!authId || !authToken) return result({ ok: false, state: 'not_configured', provider: 'plivo', error: 'missing plivo credentials' })
  const auth = Buffer.from(`${authId}:${authToken}`).toString('base64')
  try {
    // Bounded even though the caller is fire-and-forget: an unbounded lookup
    // does not block the response, but it does pin a socket and a pending
    // `payload.update` for ~300s per lead, which under any real volume is a
    // connection leak rather than a slow enrichment. See lib/net/outbound.
    const resp = await fetchWithTimeout(
      `https://api.plivo.com/v1/Account/${authId}/Lookup/Number/${encodeURIComponent(phone)}/?type=carrier`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
    )
    const raw = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      // 400/404 is the provider rejecting the number itself. 401/403 is our
      // credentials being refused, which says nothing about the number.
      const state: HLRState = resp.status === 400 || resp.status === 404 ? 'invalid' : 'provider_error'
      return result({ ok: false, state, provider: 'plivo', raw, error: `plivo returned ${resp.status}` })
    }
    const r = raw as {
      phone_number?: string
      format?: { e164?: string; national?: string }
      country?: { iso2?: string }
      carrier?: { name?: string; type?: string; mobile_network_code?: string; mobile_country_code?: string }
      ported?: boolean
    }
    return result({
      ok: true,
      state: 'valid',
      provider: 'plivo',
      raw,
      phone_format: {
        e164: r.format?.e164,
        national: r.format?.national,
        country_code: r.country?.iso2,
      },
      carrier: {
        name: r.carrier?.name,
        type: (r.carrier?.type as 'mobile' | 'landline' | 'voip' | 'unknown') ?? 'unknown',
        mnc: r.carrier?.mobile_network_code,
        mcc: r.carrier?.mobile_country_code,
      },
      is_ported: Boolean(r.ported),
    })
  } catch (err) {
    return result({ ok: false, state: 'provider_error', provider: 'plivo', error: err instanceof Error ? err.message : 'unknown error' })
  }
}

export const enrichPhone = async (phone: string): Promise<HLRResult> => {
  const provider = (process.env.HLR_PROVIDER ?? 'plivo').toLowerCase()
  if (provider === 'plivo') return lookupPlivo(phone)
  return result({ ok: false, state: 'not_configured', provider, error: `unsupported HLR provider: ${provider}` })
}
