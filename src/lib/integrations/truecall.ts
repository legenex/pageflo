// TrueCall call-tracking integration. Resolves a campaign id from page path mapping
// and pushes lead-events server-side. Mirrors the Ringba-style API shape.

import { fetchWithTimeout } from '@/lib/net/outbound'

export type TrueCallResolveArgs = {
  path: string
  mapping: Array<{ path: string; campaign_id: string }>
}

export const resolveTrueCallCampaignId = (args: TrueCallResolveArgs): string | null => {
  const { path, mapping } = args
  const candidates = mapping
    .map((m) => {
      const p = m.path
      if (p === path) return { id: m.campaign_id, len: p.length, exact: true }
      if (p.endsWith('/*')) {
        const prefix = p.slice(0, -2)
        if (path === prefix || path.startsWith(`${prefix}/`)) return { id: m.campaign_id, len: prefix.length, exact: false }
      }
      return null
    })
    .filter((c): c is { id: string; len: number; exact: boolean } => c !== null)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.len - a.len)
  return candidates[0]?.id ?? null
}

export type TrueCallPushArgs = {
  apiKey: string
  accountId: string
  campaignId: string
  phone: string
  firstName?: string
  lastName?: string
  state?: string
  zip?: string
  customFields?: Record<string, string | number | boolean | null>
}

export type TrueCallPushResult = { ok: boolean; raw?: unknown; error?: string }

export const pushTrueCallLead = async (args: TrueCallPushArgs): Promise<TrueCallPushResult> => {
  const { apiKey, accountId, campaignId, phone, firstName, lastName, state, zip, customFields } = args
  if (!apiKey || !accountId || !campaignId) return { ok: false, error: 'missing truecall credentials' }
  const body = {
    account_id: accountId,
    campaign_id: campaignId,
    phone,
    first_name: firstName,
    last_name: lastName,
    state,
    zip,
    custom: customFields ?? {},
  }
  try {
    // Bounded: this runs inside the visitor's lead POST. See lib/net/outbound.
    const resp = await fetchWithTimeout('https://api.truecall.com/v1/leads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const raw = await resp.json().catch(() => ({}))
    if (!resp.ok) return { ok: false, raw, error: `truecall returned ${resp.status}` }
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }
}
