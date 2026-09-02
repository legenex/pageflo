import type { Tone } from '@/components/pageflo/primitives'

/**
 * Lead presentation model.
 *
 * Everything here is derived from fields that actually exist on the `leads`
 * collection. There is no invented pipeline event, no fabricated delivery state
 * and no scan result: a lead's delivery state is read from `delivery_log`, its
 * consent from `trustedform_cert_url` / `jornaya_lead_id`, and its phone
 * validity from `hlr_result`.
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

export type DeliveryEntry = { at?: string | null; step?: string | null; ok?: boolean | null; detail?: string | null }

export type DeliveryState = 'delivered' | 'failed' | 'pending' | 'not-attempted'

/**
 * A lead's delivery state, derived from its log rather than stored.
 *
 * "not attempted" and "pending" are different answers and are kept apart: a
 * disqualified lead is never dispatched at all, which is correct behaviour, and
 * showing that as "pending" would look like a stuck queue.
 */
export const deliveryState = (log: DeliveryEntry[] | null | undefined): DeliveryState => {
  const entries = log ?? []
  const dispatch = entries.filter((e) => /webhook|deliver|dispatch|post/i.test(e.step ?? ''))
  if (dispatch.length === 0) return entries.length === 0 ? 'not-attempted' : 'pending'
  if (dispatch.some((e) => e.ok === true)) return 'delivered'
  if (dispatch.every((e) => e.ok === false)) return 'failed'
  return 'pending'
}

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
  delivered: 'Delivered',
  failed: 'Failed',
  pending: 'Pending',
  'not-attempted': 'Not sent',
}

export const DELIVERY_TONE: Record<DeliveryState, Tone> = {
  delivered: 'pos',
  failed: 'neg',
  pending: 'warn',
  'not-attempted': 'neutral',
}

/** Entries a conversion-event view should show. */
export const isConversionStep = (step: string | null | undefined): boolean =>
  /capi|conversion|pixel|meta|event/i.test(step ?? '')

/** Entries a delivery view should show. */
export const isDeliveryStep = (step: string | null | undefined): boolean =>
  /webhook|deliver|dispatch|post|slack|notify/i.test(step ?? '')

export type ConsentState = { label: string; tone: Tone }

/**
 * Consent evidence. A lead either carries a certificate reference or it does
 * not; nothing here mints, substitutes or infers one. See AGENTS.md invariant 6.
 */
export const consentState = (lead: { trustedform_cert_url?: string | null; jornaya_lead_id?: string | null }): ConsentState => {
  const tf = Boolean(lead.trustedform_cert_url)
  const jl = Boolean(lead.jornaya_lead_id)
  if (tf && jl) return { label: 'TrustedForm + Jornaya', tone: 'pos' }
  if (tf) return { label: 'TrustedForm', tone: 'pos' }
  if (jl) return { label: 'Jornaya', tone: 'pos' }
  return { label: 'None recorded', tone: 'warn' }
}

/** Phone validation, read from the stored HLR result. */
export const phoneState = (hlr: unknown): { label: string; tone: Tone } => {
  if (!hlr || typeof hlr !== 'object') return { label: 'Not checked', tone: 'neutral' }
  const r = hlr as Record<string, unknown>
  const status = String(r.status ?? r.result ?? '').toLowerCase()
  if (!status) return { label: 'Not checked', tone: 'neutral' }
  if (/valid|reachable|ok|success/.test(status) && !/invalid/.test(status)) return { label: 'Valid', tone: 'pos' }
  if (/invalid|unreachable|fail/.test(status)) return { label: 'Invalid', tone: 'neg' }
  return { label: status, tone: 'neutral' }
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
