// Jornaya LeadiD verification. Captured client-side as `universal_leadid` hidden input,
// verified server-side.

import { fetchWithTimeout } from '@/lib/net/outbound'

export type JornayaVerifyArgs = {
  accountId: string
  campaignId?: string
  leadId: string
}

export type JornayaVerifyResult = {
  ok: boolean
  audit_token?: string
  raw?: unknown
  error?: string
}

export const verifyJornayaLead = async (args: JornayaVerifyArgs): Promise<JornayaVerifyResult> => {
  const { accountId, campaignId, leadId } = args
  if (!accountId || !leadId) return { ok: false, error: 'missing jornaya inputs' }
  const url = new URL('https://api.leadid.com/api/auth/lookup')
  url.searchParams.set('account_id', accountId)
  url.searchParams.set('lead_id', leadId)
  if (campaignId) url.searchParams.set('campaign_id', campaignId)
  try {
    // Bounded, and uncached: this runs inside the visitor's lead POST, and a
    // per-lead verification must never be answered from a previous lead's
    // response. See lib/net/outbound.
    const resp = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } })
    const raw = await resp.json().catch(() => ({}))
    if (!resp.ok) return { ok: false, raw, error: `jornaya returned ${resp.status}` }
    return { ok: true, audit_token: (raw as { audit_token?: string }).audit_token, raw }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }
}
