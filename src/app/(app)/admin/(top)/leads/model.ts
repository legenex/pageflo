import type { Tone } from '@/components/pageflo/primitives'
import { consentView } from '@/lib/lead-consent'
import {
  isDestinationStep,
  isLifecycleStep,
  readDelivery,
  type DeliveryEntry,
  type DeliveryState,
} from '@/lib/lead-pipeline/delivery-state'

/**
 * Lead presentation model.
 *
 * Everything here is derived from fields that actually exist on the `leads`
 * collection. There is no invented pipeline event, no fabricated delivery state
 * and no scan result: a lead's delivery state is read from `delivery_log`, its
 * consent from the `consent` record, and its phone validity from `hlr_result`.
 */

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'soft-dq', 'hard-dq', 'sold', 'archived'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  'soft-dq': 'Soft DQ',
  'hard-dq': 'Hard DQ',
  sold: 'Sold',
  archived: 'Archived',
}

export const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'info',
  contacted: 'purple',
  qualified: 'teal',
  'soft-dq': 'warn',
  'hard-dq': 'orange',
  sold: 'pos',
  archived: 'neutral',
}

export const SOURCE_LABEL: Record<string, string> = {
  quiz: 'Quiz',
  'landing-page': 'Landing Page',
  'contact-form': 'Contact Form',
  page: 'Page',
  advertorial: 'Advertorial',
}

export type { DeliveryEntry, DeliveryState } from '@/lib/lead-pipeline/delivery-state'
export { DELIVERY_LABEL, DELIVERY_TONE, DELIVERY_EXPLANATION } from '@/lib/lead-pipeline/delivery-state'

/**
 * A lead's delivery reading, from its log. `readDelivery` is the one
 * implementation; the persisted `delivery_state` column is only an index of it,
 * so the console always reads the log and cannot drift from the pipeline.
 */
export const deliveryState = (log: DeliveryEntry[] | null | undefined): DeliveryState => readDelivery(log).state

/** Entries a conversion-event view should show. */
export const isConversionStep = (step: string | null | undefined): boolean =>
  /capi|conversion|pixel|meta|event/i.test(step ?? '')

/**
 * Entries the delivery history shows: the lifecycle (captured, queued,
 * processing, retry requested, completed, failed) and everything that leaves the
 * system towards a destination or a notification.
 */
export const isDeliveryStep = (step: string | null | undefined): boolean =>
  isLifecycleStep(step) || isDestinationStep(step) || /webhook|deliver|dispatch|post|slack|notify|downstream|queued/i.test(step ?? '')

export type ConsentState = { label: string; tone: Tone; recorded: boolean }

/**
 * Consent, as recorded: an affirmative act with the disclosure the visitor
 * accepted. A Lead without one, every Lead written before consent was recorded
 * included, reads "Not recorded". A TrustedForm or Jornaya reference is a
 * separate piece of evidence (`certificateEvidence`) and never stands in for it.
 * See AGENTS.md invariant 6: nothing here mints or infers a certificate.
 */
export const consentState = (lead: { consent?: Parameters<typeof consentView>[0] }): ConsentState => {
  const v = consentView(lead.consent)
  return v.recorded ? { label: 'Accepted', tone: 'pos', recorded: true } : { label: 'Not recorded', tone: 'warn', recorded: false }
}

/** Third-party certificate references, shown apart from the consent record. */
export const certificateEvidence = (lead: { trustedform_cert_url?: string | null; jornaya_lead_id?: string | null }): string => {
  const tf = Boolean(lead.trustedform_cert_url)
  const jl = Boolean(lead.jornaya_lead_id)
  if (tf && jl) return 'TrustedForm + Jornaya'
  if (tf) return 'TrustedForm'
  if (jl) return 'Jornaya'
  return 'None'
}

export type PhoneKind = 'not-checked' | 'valid' | 'invalid' | 'not-configured' | 'provider-error'
export type PhoneReading = { kind: PhoneKind; label: string; tone: Tone; detail: string }

/**
 * Phone validation, read from the stored HLR result.
 *
 * Five outcomes, kept apart because they call for different action:
 *  - not checked: no lookup has been recorded for this lead
 *  - valid / invalid: the provider answered about the NUMBER
 *  - not configured: nobody could be asked (no credentials); fix the setup
 *  - provider error: the provider was asked and failed; the number is unknown
 *
 * A failed attempt is never "not checked": the result was stored precisely so
 * it can be told apart from a lead nobody tried to validate.
 */
export const phoneState = (hlr: unknown): PhoneReading => {
  if (!hlr || typeof hlr !== 'object') {
    return { kind: 'not-checked', label: 'Not checked', tone: 'neutral', detail: 'No phone validation has been recorded for this lead.' }
  }
  const r = hlr as { ok?: unknown; state?: unknown; error?: unknown; provider?: unknown }
  const error = typeof r.error === 'string' ? r.error : ''
  // Rows stored before `state` existed carry `ok` and `error` only.
  const state =
    typeof r.state === 'string'
      ? r.state
      : r.ok === true
        ? 'valid'
        : /missing .*credentials|unsupported hlr provider/i.test(error)
          ? 'not_configured'
          : r.ok === false
            ? 'provider_error'
            : ''
  switch (state) {
    case 'valid':
      return { kind: 'valid', label: 'Valid', tone: 'pos', detail: 'The provider resolved this number.' }
    case 'invalid':
      return { kind: 'invalid', label: 'Invalid', tone: 'neg', detail: 'The provider rejected this number.' }
    case 'not_configured':
      return {
        kind: 'not-configured',
        label: 'Unavailable: not configured',
        tone: 'warn',
        detail: `No lookup was made because the provider is not configured${error ? ` (${error})` : ''}. This says nothing about the number.`,
      }
    case 'provider_error':
      return {
        kind: 'provider-error',
        label: 'Unavailable: provider error',
        tone: 'warn',
        detail: `The provider was asked and failed${error ? ` (${error})` : ''}. This says nothing about the number.`,
      }
    default:
      return { kind: 'not-checked', label: 'Not checked', tone: 'neutral', detail: 'No phone validation has been recorded for this lead.' }
  }
}

export const fullName = (c: { first_name?: string | null; last_name?: string | null } | null | undefined): string =>
  [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim()

/** Short, sortable timestamp used across the leads surface. */
export const ts = (v: string | Date | null | undefined): string => {
  if (!v) return 'Not set'
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return 'Not set'
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
