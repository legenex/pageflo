import crypto from 'crypto'

import { fetchWithTimeout } from '@/lib/net/outbound'

const sha256 = (input: string): string => crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex')

export type MetaUserData = {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  state?: string
  zip?: string
  client_ip_address?: string
  client_user_agent?: string
  fbc?: string
  fbp?: string
}

export type MetaCAPIEvent = {
  event_name: string
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url?: string
  user_data: MetaUserData
  custom_data?: Record<string, unknown>
}

export type MetaCAPIArgs = {
  pixelId: string
  accessToken: string
  testEventCode?: string
  event: MetaCAPIEvent
}

export const sendMetaCAPIEvent = async (args: MetaCAPIArgs): Promise<{ ok: boolean; raw?: unknown; error?: string }> => {
  const { pixelId, accessToken, testEventCode, event } = args
  if (!pixelId || !accessToken) return { ok: false, error: 'missing meta credentials' }

  const ud = event.user_data
  const hashedUserData = {
    em: ud.email ? [sha256(ud.email)] : undefined,
    ph: ud.phone ? [sha256(ud.phone.replace(/\D/g, ''))] : undefined,
    fn: ud.first_name ? [sha256(ud.first_name)] : undefined,
    ln: ud.last_name ? [sha256(ud.last_name)] : undefined,
    st: ud.state ? [sha256(ud.state)] : undefined,
    zp: ud.zip ? [sha256(ud.zip)] : undefined,
    client_ip_address: ud.client_ip_address,
    client_user_agent: ud.client_user_agent,
    fbc: ud.fbc,
    fbp: ud.fbp,
  }

  const payload = {
    data: [
      {
        event_name: event.event_name,
        event_time: event.event_time,
        event_id: event.event_id,
        action_source: event.action_source,
        event_source_url: event.event_source_url,
        user_data: hashedUserData,
        custom_data: event.custom_data,
      },
    ],
    test_event_code: testEventCode,
    access_token: accessToken,
  }

  try {
    // Bounded: this runs inside the visitor's lead POST. A Graph API that stops
    // answering must cost the submission six seconds and a failed step, not the
    // ~300s undici would otherwise wait. See lib/net/outbound.
    const resp = await fetchWithTimeout(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const raw = await resp.json().catch(() => ({}))
    if (!resp.ok) return { ok: false, raw, error: `meta capi returned ${resp.status}` }
    return { ok: true, raw }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }
}
