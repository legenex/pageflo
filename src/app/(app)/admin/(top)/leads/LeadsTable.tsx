'use client'

import { useState, useTransition } from 'react'
import { Download, Inbox, Loader2 } from 'lucide-react'
import { EmptyState, Mono, StatusPill, TableWrap, Td, Th, Tr } from '@/components/pageflo/primitives'
import { exportLeadsCsv } from './actions'
import { LeadDetailModal } from './LeadDetailModal'
import {
  DELIVERY_LABEL,
  DELIVERY_TONE,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  consentState,
  deliveryState,
  fullName,
  phoneState,
  ts,
} from './model'
import type { LeadRow } from './types'

export function LeadsTable({ leads, search }: { leads: LeadRow[]; search: Record<string, string> }) {
  const [open, setOpen] = useState<LeadRow | null>(null)

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="No leads match these filters"
        message="Widen the date range, clear a filter, or check whether the capture you expected went to a different Site."
      />
    )
  }

  return (
    <>
      <TableWrap minWidth={1040}>
        <thead>
          <tr>
            <Th>Created</Th>
            <Th>Lead ID</Th>
            <Th>Name</Th>
            <Th>Source</Th>
            <Th>Site</Th>
            <Th>Status</Th>
            <Th>Consent</Th>
            <Th>Phone</Th>
            <Th>Delivery</Th>
            <Th width={40} />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const delivery = deliveryState(l.delivery_log)
            const consent = consentState(l)
            const phone = phoneState(l.hlr_result)
            return (
              <Tr key={l.id} className="cursor-pointer transition-colors hover:bg-surface-3/60">
                <Td className="whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setOpen(l)}
                    aria-label={`Open lead ${l.id}`}
                    className="rounded-app-sm text-left"
                  >
                    <Mono className="text-[11px] text-ink-muted">{ts(l.createdAt)}</Mono>
                  </button>
                </Td>
                <Td className="whitespace-nowrap">
                  <button type="button" onClick={() => setOpen(l)} className="rounded-app-sm text-left">
                    <Mono className="text-[11px] text-ink-secondary">{l.id}</Mono>
                  </button>
                </Td>
                <Td className="whitespace-nowrap text-ink">
                  {fullName(l.contact) || <span className="text-ink-dim">Not given</span>}
                  {l.test_capture ? <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-ink-dim">test</span> : null}
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="text-[12px]">{SOURCE_LABEL[l.source_entity_type] ?? l.source_entity_type}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    {l.brandColor ? (
                      <span
                        aria-hidden="true"
                        className="h-[9px] w-[9px] shrink-0 rounded-[2px] border border-white/15"
                        style={{ background: l.brandColor }}
                      />
                    ) : null}
                    <span className="text-[12px]">{l.siteName ?? 'Unassigned'}</span>
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <StatusPill label={STATUS_LABEL[l.status]} tone={STATUS_TONE[l.status]} dot={false} />
                </Td>
                <Td className={`whitespace-nowrap text-[11.5px] ${consent.tone === 'pos' ? 'text-pos' : 'text-warn'}`}>
                  {consent.label}
                </Td>
                <Td
                  className={`whitespace-nowrap text-[11.5px] ${
                    phone.tone === 'pos' ? 'text-pos' : phone.tone === 'neg' ? 'text-neg' : 'text-ink-muted'
                  }`}
                >
                  {phone.label}
                </Td>
                <Td className="whitespace-nowrap">
                  <StatusPill label={DELIVERY_LABEL[delivery]} tone={DELIVERY_TONE[delivery]} />
                </Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(l)}
                    aria-label={`Open lead ${l.id} detail`}
                    className="rounded-app-sm p-1 text-ink-dim transition-colors hover:text-ink"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </TableWrap>

      {open ? <LeadDetailModal lead={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

/**
 * CSV export.
 *
 * Runs the same filtered, access-controlled query the table ran, then hands the
 * result to the browser as a Blob. The download is client-side so the export
 * needs no new public endpoint, and it cannot return a row the table would not
 * have shown.
 */
export function ExportButton({ search }: { search: Record<string, string> }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNote(null)
            const res = await exportLeadsCsv(search)
            if (!res.ok) {
              setNote(res.error)
              return
            }
            const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `pageflo-leads-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            if (res.truncated) setNote(`Exported the first ${res.rows} rows. Narrow the filters to export the rest.`)
          })
        }
        className="inline-flex h-8 items-center gap-2 rounded-app border border-border bg-linear-to-b from-surface-2 to-surface-1 px-2.5 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Export CSV
      </button>
      {note ? (
        <span role="status" className="text-[11px] text-warn">
          {note}
        </span>
      ) : null}
    </>
  )
}
