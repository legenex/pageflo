'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { CodeBlock, Eyebrow, Mono, StatusPill } from '@/components/pageflo/primitives'
import { setLeadStatus } from './actions'
import {
  DELIVERY_LABEL,
  DELIVERY_TONE,
  LEAD_STATUSES,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  consentState,
  deliveryState,
  fullName,
  isConversionStep,
  isDeliveryStep,
  phoneState,
  ts,
  type LeadStatus,
} from './model'
import type { LeadRow } from './types'

const TABS = ['summary', 'response', 'hlr', 'capi', 'delivery'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  summary: 'Summary',
  response: 'System Response',
  hlr: 'HLR Trace',
  capi: 'CAPI Log',
  delivery: 'Delivery Log',
}

function Field({ k, v, mono = true, tone }: { k: string; v: React.ReactNode; mono?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{k}</Eyebrow>
      <div className={`mt-1 break-words text-[13px] font-medium ${mono ? 'font-mono' : ''} ${tone ?? 'text-ink'}`}>
        {v === '' || v == null ? <span className="text-ink-dim">Not set</span> : v}
      </div>
    </div>
  )
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        } catch {
          /* clipboard blocked; the value is already on screen to select */
        }
      }}
      className="inline-flex h-[30px] items-center gap-2 rounded-app-sm px-2.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5 text-pos" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : label}
    </button>
  )
}

/**
 * Lead detail.
 *
 * Five tabs over one record. Every tab renders stored data: Summary the lead's
 * own fields, System Response its captured answers and attribution, HLR Trace
 * the stored phone-validation result, and the two log tabs the `delivery_log`
 * rows split by step. Nothing is synthesised, and a tab with no data says so
 * rather than showing an empty shell that reads as a failure.
 */
export function LeadDetailModal({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('summary')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      // Focus trap. A modal that lets Tab walk out into the page behind it is a
      // keyboard user's dead end, because nothing brings focus back.
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const delivery = deliveryState(lead.delivery_log)
  const consent = consentState(lead)
  const phone = phoneState(lead.hlr_result)
  const conversionRows = (lead.delivery_log ?? []).filter((e) => isConversionStep(e.step))
  const deliveryRows = (lead.delivery_log ?? []).filter((e) => isDeliveryStep(e.step))

  const payloadJson = JSON.stringify(
    { id: lead.id, status: lead.status, contact: lead.contact, quiz_answers: lead.quiz_answers, attribution: lead.attribution },
    null,
    2,
  )

  const changeStatus = (next: LeadStatus) => {
    setError(null)
    start(async () => {
      const res = await setLeadStatus(lead.id, next)
      if (!res.ok) setError(res.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Lead ${lead.id}`}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[85vh] max-h-[860px] w-full max-w-[780px] flex-col overflow-hidden rounded-app-lg border border-border-strong bg-surface-2 shadow-[var(--shadow-modal)]"
      >
        <div className="shrink-0 px-5 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Mono className="text-[14px] text-ink">{lead.id}</Mono>
            <StatusPill label={STATUS_LABEL[lead.status]} tone={STATUS_TONE[lead.status]} />
            {lead.test_capture ? <StatusPill label="Test capture" tone="neutral" dot={false} /> : null}
            <span className="flex-1" />
            <span className="text-[12.5px] text-ink-muted">
              Delivery:{' '}
              <Mono
                className={`font-semibold ${
                  DELIVERY_TONE[delivery] === 'pos'
                    ? 'text-pos'
                    : DELIVERY_TONE[delivery] === 'neg'
                      ? 'text-neg'
                      : DELIVERY_TONE[delivery] === 'warn'
                        ? 'text-warn'
                        : 'text-ink-muted'
                }`}
              >
                {DELIVERY_LABEL[delivery]}
              </Mono>
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close lead detail"
              className="flex h-7 w-7 items-center justify-center rounded-app-sm text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {lead.siteName ?? 'Unassigned site'} &middot; {ts(lead.createdAt)}
          </p>

          <div className="mt-4 inline-flex gap-0.5 rounded-app-lg border border-border bg-surface-1 p-[3px]">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'true' : undefined}
                className={`h-7 rounded-app-sm px-3 text-[12.5px] transition-colors ${
                  tab === t ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'summary' ? (
            <>
              <Eyebrow className="mb-3 block">Lead details</Eyebrow>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field k="Created" v={ts(lead.createdAt)} />
                <Field k="Last updated" v={ts(lead.updatedAt)} />
                <Field k="Name" v={fullName(lead.contact) || null} mono={false} />
                <Field k="Email" v={lead.contact?.email} />
                <Field k="Phone" v={lead.contact?.phone} />
                <Field k="State / ZIP" v={[lead.contact?.state, lead.contact?.zip].filter(Boolean).join(' / ')} />
                <Field k="Source" v={SOURCE_LABEL[lead.source_entity_type] ?? lead.source_entity_type} mono={false} />
                <Field k="Source id" v={lead.source_entity_id} />
                <Field k="Site" v={lead.siteName} mono={false} />
                <Field k="Consent" v={consent.label} mono={false} tone={consent.tone === 'pos' ? 'text-pos' : 'text-warn'} />
                <Field k="Phone validation" v={phone.label} mono={false} tone={phone.tone === 'pos' ? 'text-pos' : phone.tone === 'neg' ? 'text-neg' : 'text-ink-muted'} />
                <Field k="Idempotency key" v={lead.client_submission_id} />
                <Field k="TrustedForm certificate" v={lead.trustedform_cert_url} />
                <Field k="Jornaya lead id" v={lead.jornaya_lead_id} />
                {lead.buyer_id ? <Field k="Buyer" v={lead.buyer_id} /> : null}
                {lead.sold_at ? <Field k="Sold at" v={ts(lead.sold_at)} /> : null}
              </div>

              <div className="mt-6 border-t border-border pt-4">
                <Eyebrow className="mb-2.5 block">Status history</Eyebrow>
                {(lead.status_history ?? []).length === 0 ? (
                  <p className="text-[12.5px] text-ink-dim">No status changes recorded since capture.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(lead.status_history ?? []).map((h, i) => (
                      <li key={`${h.changed_at}-${i}`} className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-brand" />
                        <span className="flex-1 text-[12.5px] text-ink-secondary">
                          {STATUS_LABEL[(h.status ?? '') as LeadStatus] ?? h.status}
                          {h.note ? <span className="text-ink-muted"> &middot; {h.note}</span> : null}
                        </span>
                        <Mono className="text-[11px] text-ink-dim">{ts(h.changed_at)}</Mono>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}

          {tab === 'response' ? (
            <div className="space-y-4">
              <CodeBlock label="Captured answers">
                {lead.quiz_answers ? JSON.stringify(lead.quiz_answers, null, 2) : 'No answers stored for this lead.'}
              </CodeBlock>
              <CodeBlock label="Attribution">
                {lead.attribution ? JSON.stringify(lead.attribution, null, 2) : 'No attribution stored for this lead.'}
              </CodeBlock>
            </div>
          ) : null}

          {tab === 'hlr' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field k="Result" v={phone.label} mono={false} tone={phone.tone === 'pos' ? 'text-pos' : phone.tone === 'neg' ? 'text-neg' : 'text-ink-muted'} />
                <Field k="Number" v={lead.contact?.phone} />
              </div>
              <CodeBlock label="Stored HLR response">
                {lead.hlr_result
                  ? JSON.stringify(lead.hlr_result, null, 2)
                  : 'No phone validation was recorded for this lead. Enrichment runs only when an HLR provider is configured and the lead carries a phone number.'}
              </CodeBlock>
            </div>
          ) : null}

          {tab === 'capi' || tab === 'delivery' ? (
            <LogTable
              rows={tab === 'capi' ? conversionRows : deliveryRows}
              empty={
                tab === 'capi'
                  ? 'No conversion events were recorded for this lead. Events are written when a tracking configuration with a Conversions API destination is active for the Site.'
                  : 'No delivery attempts were recorded for this lead. A disqualified lead is never dispatched, which is the expected state rather than a failure.'
              }
            />
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          {error ? (
            <p role="alert" className="mb-2 text-[12px] text-neg">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-muted">
              Set status
              <select
                defaultValue={lead.status}
                disabled={pending}
                onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                className="h-[30px] rounded-app-sm border border-border bg-surface-deep px-2 text-[12.5px] text-ink outline-none focus-visible:border-brand disabled:opacity-50"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : null}
            <span className="flex-1" />
            <CopyButton label="Copy payload" value={payloadJson} />
            <CopyButton label="Copy lead id" value={lead.id} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LogTable({ rows, empty }: { rows: Array<{ at?: string | null; step?: string | null; ok?: boolean | null; detail?: string | null }>; empty: string }) {
  if (rows.length === 0) {
    return <p className="max-w-[520px] text-[12.5px] leading-[1.6] text-ink-muted">{empty}</p>
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.at}-${i}`} className="rounded-app border border-border bg-surface-deep px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={`h-[6px] w-[6px] shrink-0 rounded-full ${r.ok ? 'bg-pos' : 'bg-neg'}`}
            />
            <span className="flex-1 truncate text-[12.5px] font-medium text-ink">{r.step}</span>
            <StatusPill label={r.ok ? 'ok' : 'failed'} tone={r.ok ? 'pos' : 'neg'} dot={false} />
            <Mono className="text-[11px] text-ink-dim">{ts(r.at)}</Mono>
          </div>
          {r.detail ? <p className="mt-1.5 break-words font-mono text-[11px] text-ink-muted">{r.detail}</p> : null}
        </li>
      ))}
    </ul>
  )
}
