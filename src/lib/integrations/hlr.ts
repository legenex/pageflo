// HLR (Home Location Register) phone enrichment. Provider-agnostic interface so we can
// swap Plivo / Twilio Lookup / Trestle behind one shape.

import { fetchWithTimeout } from '@/lib/net/outbound'

export type HLRResult = {
  ok: boolean
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

const lookupPlivo = async (phone: string): Promise<HLRResult> => {
  const authId = process.env.PLIVO_AUTH_ID
  const authToken = process.env.PLIVO_AUTH_TOKEN
  if (!authId || !authToken) return { ok: false, provider: 'plivo', error: 'missing plivo credentials' }
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
    if (!resp.ok) return { ok: false, provider: 'plivo', raw, error: `plivo returned ${resp.status}` }
    const r = raw as {
      phone_number?: string
      format?: { e164?: string; national?: string }
      country?: { iso2?: string }
      carrier?: { name?: string; type?: string; mobile_network_code?: string; mobile_country_code?: string }
      ported?: boolean
    }
    return {
      ok: true,
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
    }
  } catch (err) {
    return { ok: false, provider: 'plivo', error: err instanceof Error ? err.message : 'unknown error' }
  }
}

export const enrichPhone = async (phone: string): Promise<HLRResult> => {
  const provider = (process.env.HLR_PROVIDER ?? 'plivo').toLowerCase()
  if (provider === 'plivo') return lookupPlivo(phone)
  return { ok: false, provider, error: `unsupported HLR provider: ${provider}` }
}
