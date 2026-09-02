'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { LEAD_STATUSES, type LeadStatus } from './model'
import { buildWhere, parseSearch } from './query'

/**
 * Change a lead's status.
 *
 * This is the only mutation the Leads surface offers, because it is the only one
 * with a real backend. `Leads.access.delete` is `() => false`, so there is no
 * delete action and none is shown. There is no resend action either: nothing in
 * the pipeline can currently re-dispatch a committed lead, and a button that
 * appears to retry a failed delivery while doing nothing is worse than its
 * absence. Both are recorded as PLANNED in docs/REQUIREMENTS.md.
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
