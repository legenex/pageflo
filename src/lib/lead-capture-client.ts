/**
 * Browser-side half of the lead-capture contract.
 *
 * Everything a public surface must do when it submits a lead lives here once:
 * read attribution off the URL and cookies, read the TrustedForm cert and the
 * Jornaya id out of the hidden inputs those vendors inject, POST to /api/leads,
 * then fire the client pixels with the SERVER-issued event_id.
 *
 * Why it is shared rather than copied: the Meta dedupe contract only holds if
 * the browser event and the CAPI event carry the same event_id, and that id is
 * minted server-side inside the pipeline. A second hand-rolled submit path that
 * forgets to echo it back produces double-counted conversions that look fine on
 * both ends. There is one implementation, so the block lead form and the quiz
 * runtime cannot drift apart on it.
 *
 * Client-only: every function no-ops safely if called where there is no window.
 */

/** Field names that map into the canonical `contact` object the pipeline expects. */
export const CONTACT_KEYS = new Set(['first_name', 'last_name', 'email', 'phone', 'state', 'zip'])

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    ttq?: { track?: (event: string, params: Record<string, unknown>, options?: Record<string, unknown>) => void }
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export const captureAttribution = (): Record<string, string> => {
  if (typeof window === 'undefined') return {}
  const out: Record<string, string> = {}
  const params = new URLSearchParams(window.location.search)
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ttclid']) {
    const v = params.get(k)
    if (v) out[k] = v
  }
  if (document.referrer) out.referrer = document.referrer
  out.landing_path = window.location.pathname

  // Session id: stable per tab.
  try {
    let sid = sessionStorage.getItem('legalos_session_id')
    if (!sid) {
      sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem('legalos_session_id', sid)
    }
    out.session_id = sid
  } catch {
    // Private-mode Safari throws on sessionStorage. Attribution without a
    // session id is still worth sending, so this is not fatal.
  }

  // Meta cookies
  const fbc = document.cookie.split('; ').find((c) => c.startsWith('_fbc='))?.split('=')[1]
  const fbp = document.cookie.split('; ').find((c) => c.startsWith('_fbp='))?.split('=')[1]
  if (fbc) out.fbc = fbc
  if (fbp) out.fbp = fbp
  return out
}

/** Read the latest TrustedForm cert URL from the auto-injected hidden input. */
export const readTrustedFormCert = (): string => {
  if (typeof document === 'undefined') return ''
  const el = document.querySelector<HTMLInputElement>('input[name="xxTrustedFormCertUrl"]')
  return el?.value ?? ''
}

export const readJornayaLeadId = (): string => {
  if (typeof document === 'undefined') return ''
  const el = document.querySelector<HTMLInputElement>('input[name="universal_leadid"]')
  return el?.value ?? ''
}

/**
 * Fire the client-side conversion pixels with the server-issued event_id.
 *
 * Each call is individually wrapped: a blocked or missing pixel must not stop
 * the others, and must never throw into the submit path after the lead has
 * already been persisted.
 */
export const firePixelEvents = (eventId: string, contentName: string): void => {
  if (!eventId || typeof window === 'undefined') return
  try {
    window.fbq?.('track', 'Lead', { content_name: contentName }, { eventID: eventId })
  } catch {}
  try {
    window.ttq?.track?.('SubmitForm', { content_name: contentName }, { event_id: eventId })
  } catch {}
  try {
    window.gtag?.('event', 'generate_lead', { transaction_id: eventId, value: 1, currency: 'USD' })
  } catch {}
}

export type LeadSubmitPayload = {
  site_slug?: string
  funnel_type: 'quiz' | 'landing-page' | 'contact-form' | 'page' | 'advertorial'
  funnel_id?: string
  funnel_path?: string
  source_entity_id?: string
  /** Idempotency key, minted once per submission and resent on every retry. */
  client_submission_id?: string
  contact: Record<string, string>
  extra?: Record<string, unknown>
  quiz_answers?: Record<string, unknown>
  attribution?: Record<string, string>
  trustedform_cert_url?: string
  jornaya_lead_id?: string
}

export type LeadSubmitResult = {
  ok: boolean
  lead_id?: number
  event_id?: string
  error?: string
}

/**
 * POST a lead and return the parsed result.
 *
 * Never throws: a network failure comes back as `{ ok: false, error }` so the
 * caller can decide whether to retry or degrade, rather than losing the
 * visitor to an unhandled rejection at the end of a completed funnel.
 */
export const submitLead = async (payload: LeadSubmitPayload): Promise<LeadSubmitResult> => {
  try {
    const resp = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = (await resp.json()) as LeadSubmitResult
    if (!resp.ok || !result.ok) {
      return { ok: false, error: result.error ?? 'Submission failed. Please try again.' }
    }
    return result
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
