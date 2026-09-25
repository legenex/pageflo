'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { LEAD_STATUSES, type LeadStatus } from './model'
import { buildWhere, parseSearch } from './query'
import { appendDeliveryLog } from '@/lib/lead-pipeline/log'
import { DELIVERY_LABEL, DELIVERY_STEPS, readDelivery, type DeliveryEntry, type DeliveryState } from '@/lib/lead-pipeline/delivery-state'
import { enqueueLeadRetry, withLeadLock } from '@/queues/lead-delivery'

/**
 * Change a lead's status.
 *
 * This is the only mutation the Leads surface offers, because it is the only one
 * with a real backend. `Leads.access.delete` is `() => false`, so there is no
 * delete action and none is shown. Retrying a failed delivery is the other
 * mutation (`retryLeadDelivery`, below): it re-dispatches through the same
 * pipeline and is refused unless the delivery genuinely failed.
 *
 * Authorization is Payload's: the update runs with the real user and
 * `overrideAccess: false`, so `siteScopedWrite` decides. A server action does
 * not inherit access control on its own, which is why the user is passed
 * explicitly. See AGENTS.md invariant 1.
 */
export async function setLeadStatus(
  leadId: string,
  status: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Unknown status.' }
  }

  const payload = await getPayload({ config })
  try {
    const existing = await payload.findByID({
      collection: 'leads',
      id: leadId,
      depth: 0,
      user,
      overrideAccess: false,
    })

    const history = Array.isArray(existing.status_history) ? existing.status_history : []
    await payload.update({
      collection: 'leads',
      id: leadId,
      user,
      overrideAccess: false,
      data: {
        status: status as LeadStatus,
        status_history: [
          ...history,
          { status, changed_at: new Date().toISOString(), changed_by: Number(user.id), note: note ?? null },
        ],
      },
    })
    revalidatePath('/admin/leads')
    return { ok: true }
  } catch (err) {
    // Payload returns a Forbidden for an out-of-scope lead. Surface that as
    // "not allowed" rather than as a generic failure, so an operator knows to
    // ask for access instead of filing a bug.
    const message = err instanceof Error ? err.message : 'Update failed.'
    return { ok: false, error: /forbidden|not allowed/i.test(message) ? 'You do not have write access to this lead.' : message }
  }
}

export type RetryResult =
  | { ok: true; state: DeliveryState; label: string; message: string }
  | { ok: false; error: string }

/**
 * Retry a Lead's failed downstream delivery.
 *
 * SAFE BY CONSTRUCTION, not by care:
 *  - Authorised as the signed-in user: the log write runs with
 *    `overrideAccess: false`, so `siteScopedWrite` decides, and an out-of-scope
 *    Lead is refused before anything is sent.
 *  - Only a Lead whose delivery reads `failed`, `partial` or `stalled` can be
 *    retried. Delivered, queued, processing and retry-pending Leads are refused,
 *    so a double click or a stale tab cannot start a second pass.
 *  - The pass skips every step that already succeeded (`settledSteps`), so a
 *    buyer who has the lead does not get it again while a failed one is tried.
 *  - The request is written to the Lead's log BEFORE anything is enqueued, and
 *    the queue job id carries its sequence number, so a repeated request is the
 *    same job.
 *  - The request, and then the pass's own results, appear in the Lead's delivery
 *    history. Nothing is retried silently.
 *
 * Only destinations the Brand has configured are contacted. This action adds none.
 */
export async function retryLeadDelivery(leadId: string): Promise<RetryResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const payload = await getPayload({ config })
  let lead: { id: number | string; delivery_log?: DeliveryEntry[] | null }
  try {
    lead = (await payload.findByID({ collection: 'leads', id: leadId, depth: 0, user, overrideAccess: false })) as typeof lead
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    return { ok: false, error: /forbidden|not allowed|not found/i.test(message) ? 'You do not have access to this lead.' : 'Lead could not be loaded.' }
  }

  const before = readDelivery(lead.delivery_log)
  if (!before.retryable) {
    return { ok: false, error: `Delivery is "${DELIVERY_LABEL[before.state]}", so there is nothing to retry.` }
  }

  let after
  try {
    after = await appendDeliveryLog(lead.id, [
      { step: DELIVERY_STEPS.retryRequested, ok: true, detail: `requested by ${(user as { email?: string }).email ?? 'an operator'}` },
    ], { user, payload })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry could not be recorded.'
    return { ok: false, error: /forbidden|not allowed/i.test(message) ? 'You do not have write access to this lead.' : message }
  }

  const id = Number(lead.id)
  const queued = await enqueueLeadRetry(id, after.retryCount)
  if (queued === 'unavailable') {
    // No queue in this environment: run the pass now, under the same lock.
    try {
      const { deliverStoredLead } = await import('@/lib/lead-pipeline/run')
      await withLeadLock(id, () => deliverStoredLead(id, { trigger: 'retry' }))
    } catch (err) {
      await appendDeliveryLog(id, [
        { step: DELIVERY_STEPS.failed, ok: false, detail: `inline retry: ${err instanceof Error ? err.message : 'unknown error'}`.slice(0, 500) },
      ]).catch(() => null)
    }
  }

  const fresh = (await payload.findByID({ collection: 'leads', id, depth: 0, overrideAccess: true })) as { delivery_log?: DeliveryEntry[] | null }
  const now = readDelivery(fresh.delivery_log)
  revalidatePath('/admin/leads')
  return {
    ok: true,
    state: now.state,
    label: DELIVERY_LABEL[now.state],
    message:
      queued === 'queued'
        ? 'Retry queued. Steps that already succeeded will not be repeated.'
        : `Retry ran. Delivery is now "${DELIVERY_LABEL[now.state]}".`,
  }
}

const csvCell = (v: unknown): string => {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  // A leading =, +, - or @ is executed as a formula by spreadsheet software, so
  // an exported lead field could run in whoever opens the file. Prefix-escape it.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

const COLUMNS = [
  'id',
  'created_at',
  'status',
  'site',
  'source_type',
  'source_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'state',
  'zip',
  'trustedform_cert_url',
  'jornaya_lead_id',
  'consent_accepted',
  'consent_accepted_at',
  'consent_disclosure_text',
  'delivery_state',
  'test_capture',
] as const

/**
 * Export the current filter selection as CSV.
 *
 * Runs the same query the table ran, under the same access control, so an
 * operator can never export a row the table would not have shown them. Capped at
 * 5,000 rows: a server action returns through the RSC channel and an unbounded
 * export would be held in memory on both ends.
 */
export async function exportLeadsCsv(
  rawSearch: Record<string, string>,
): Promise<{ ok: true; csv: string; rows: number; truncated: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const LIMIT = 5000
  const search = parseSearch(rawSearch)
  const payload = await getPayload({ config })

  try {
    const res = await payload.find({
      collection: 'leads',
      where: buildWhere(search),
      sort: '-createdAt',
      limit: LIMIT,
      depth: 1,
      user,
      overrideAccess: false,
    })

    const lines = [COLUMNS.join(',')]
    for (const d of res.docs) {
      const lead = d as Record<string, any>
      const site = lead.site && typeof lead.site === 'object' ? lead.site.name : lead.site
      lines.push(
        [
          lead.id,
          lead.createdAt,
          lead.status,
          site,
          lead.source_entity_type,
          lead.source_entity_id,
          lead.contact?.first_name,
          lead.contact?.last_name,
          lead.contact?.email,
          lead.contact?.phone,
          lead.contact?.state,
          lead.contact?.zip,
          lead.trustedform_cert_url,
          lead.jornaya_lead_id,
          lead.consent?.accepted === true ? 'yes' : 'not recorded',
          lead.consent?.accepted_at,
          lead.consent?.disclosure_text,
          lead.delivery_state,
          lead.test_capture ? 'yes' : 'no',
        ]
          .map(csvCell)
          .join(','),
      )
    }

    return { ok: true, csv: lines.join('\n'), rows: res.docs.length, truncated: res.totalDocs > LIMIT }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Export failed.' }
  }
}
