import type { Where } from 'payload'
import { LEAD_STATUSES, type LeadStatus } from './model'

export type LeadsSearch = {
  status: LeadStatus | 'all'
  site: string
  source: string
  delivery: 'all' | 'failed' | 'delivered' | 'not-sent'
  q: string
  range: 'all' | '24h' | '7d' | '30d' | '90d'
  includeTest: boolean
  page: number
}

const RANGES: Record<Exclude<LeadsSearch['range'], 'all'>, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export const RANGE_LABEL: Record<LeadsSearch['range'], string> = {
  all: 'All time',
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

export const parseSearch = (raw: Record<string, string | string[] | undefined>): LeadsSearch => {
  const status = one(raw.status)
  const range = one(raw.range)
  const delivery = one(raw.delivery)
  const page = Number.parseInt(one(raw.page) || '1', 10)
  return {
    status: (LEAD_STATUSES as readonly string[]).includes(status) ? (status as LeadStatus) : 'all',
    site: one(raw.site),
    source: one(raw.source),
    delivery: delivery === 'failed' || delivery === 'delivered' || delivery === 'not-sent' ? delivery : 'all',
    q: one(raw.q).trim().slice(0, 120),
    range: range in RANGES || range === 'all' ? (range as LeadsSearch['range']) : 'all',
    includeTest: one(raw.test) === '1',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/**
 * Build the Payload `where` for a filter state.
 *
 * Deliberately does NOT encode tenancy. Site scoping is enforced by
 * `siteScopedRead` on the collection, which the page invokes by passing the real
 * `user` with `overrideAccess: false`. Adding a second scoping rule here would
 * create a place where the two could disagree, and the one in a component is
 * always the one that loses. See AGENTS.md invariant 1.
 */
export const buildWhere = (s: LeadsSearch): Where => {
  const and: Where[] = []

  if (s.status !== 'all') and.push({ status: { equals: s.status } })
  if (s.site) and.push({ site: { equals: s.site } })
  if (s.source) and.push({ source_entity_type: { equals: s.source } })

  // Synthetic leads written by Test Capture are excluded unless asked for. The
  // field's own description says to filter them out of real metrics.
  if (!s.includeTest) and.push({ test_capture: { not_equals: true } })

  if (s.range !== 'all') {
    const days = RANGES[s.range]
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    and.push({ createdAt: { greater_than_equal: since } })
  }

  // Delivery is derived from the delivery_log rows rather than stored on the
  // lead, so these filters query the log itself. "Not sent" means no dispatch
  // row exists at all, which is the correct state for a disqualified lead.
  if (s.delivery === 'failed') and.push({ 'delivery_log.ok': { equals: false } })
  if (s.delivery === 'delivered') and.push({ 'delivery_log.ok': { equals: true } })
  if (s.delivery === 'not-sent') and.push({ 'delivery_log.step': { exists: false } })

  if (s.q) {
    and.push({
      or: [
        { 'contact.email': { like: s.q } },
        { 'contact.phone': { like: s.q } },
        { 'contact.first_name': { like: s.q } },
        { 'contact.last_name': { like: s.q } },
        { 'contact.state': { like: s.q } },
        { 'contact.zip': { like: s.q } },
      ],
    })
  }

  return and.length ? { and } : {}
}

/** Serialise a filter state back to a query string, dropping defaults. */
export const toQuery = (s: Partial<LeadsSearch>): string => {
  const p = new URLSearchParams()
  if (s.status && s.status !== 'all') p.set('status', s.status)
  if (s.site) p.set('site', s.site)
  if (s.source) p.set('source', s.source)
  if (s.delivery && s.delivery !== 'all') p.set('delivery', s.delivery)
  if (s.q) p.set('q', s.q)
  if (s.range && s.range !== 'all') p.set('range', s.range)
  if (s.includeTest) p.set('test', '1')
  if (s.page && s.page > 1) p.set('page', String(s.page))
  const str = p.toString()
  return str ? `?${str}` : ''
}
