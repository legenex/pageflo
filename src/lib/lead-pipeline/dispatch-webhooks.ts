import crypto from 'crypto'

import { safePost } from '@/lib/net/ssrf'

export type WebhookConfig = {
  name: string
  url: string
  enabled: boolean
  event_filter?: string | null
  hmac_secret?: string | null
}

export type WebhookDispatchResult = {
  webhook: string
  url: string
  ok: boolean
  status?: number
  error?: string
  duration_ms?: number
}

const signBody = (body: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

const matchesEvent = (filter: string | null | undefined, event: string): boolean => {
  if (!filter) return true
  const list = filter.split(',').map((s) => s.trim()).filter(Boolean)
  if (list.length === 0) return true
  return list.includes(event)
}

export const dispatchWebhooks = async (args: {
  webhooks: WebhookConfig[]
  event: string
  payload: Record<string, unknown>
  testCapture?: boolean
}): Promise<WebhookDispatchResult[]> => {
  const { webhooks, event, payload, testCapture } = args
  const enabled = webhooks.filter((w) => w.enabled && matchesEvent(w.event_filter, event))
  if (enabled.length === 0) return []

  const body = JSON.stringify({ event, test_capture: Boolean(testCapture), ...payload })
  const results = await Promise.all(
    enabled.map(async (w): Promise<WebhookDispatchResult> => {
      const started = Date.now()
      try {
        // Both spellings, same values. A receiver on the other end of this
        // POST is a third party's endpoint that already switches on
        // `X-LegalOS-Event` and verifies `X-LegalOS-Signature`; renaming the
        // header would silently drop their leads on the floor. Send the
        // PageFlo names alongside so receivers can migrate on their own
        // schedule, and remove the LegalOS pair only once they have.
        const signature = w.hmac_secret ? `sha256=${signBody(body, w.hmac_secret)}` : null
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-LegalOS-Event': event,
          'X-PageFlo-Event': event,
        }
        if (signature) {
          headers['X-LegalOS-Signature'] = signature
          headers['X-PageFlo-Signature'] = signature
        }
        // An outbound webhook URL is typed by a tenant admin, so it is a
        // user-supplied address the server posts a LEAD to. Unguarded, it
        // doubles as a port scanner and a way to POST a signed payload at
        // anything on the private network. See lib/net/ssrf.
        const resp = await safePost(w.url, { headers, body })
        if (!resp.ok) {
          return {
            webhook: w.name,
            url: w.url,
            ok: false,
            status: resp.status,
            error: resp.reason,
            duration_ms: Date.now() - started,
          }
        }
        return {
          webhook: w.name,
          url: w.url,
          ok: resp.status >= 200 && resp.status < 300,
          status: resp.status,
          duration_ms: Date.now() - started,
        }
      } catch (err) {
        return {
          webhook: w.name,
          url: w.url,
          ok: false,
          error: err instanceof Error ? err.message : 'unknown error',
          duration_ms: Date.now() - started,
        }
      }
    }),
  )
  return results
}
