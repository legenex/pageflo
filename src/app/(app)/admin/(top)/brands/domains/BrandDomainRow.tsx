'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, ChevronDown, ChevronUp, Trash2, Star, RefreshCw, Unlink, Link2 } from 'lucide-react'
import {
  attachDomainToSite,
  detachDomainFromSite,
  deletePoolDomain,
  verifyAttachedDomain,
  makeDomainPrimary,
} from './actions'
import type { DnsRecord } from '@/lib/dns-records'
import { useConfirm } from '@/components/pageflo/interactive'

type SiteOption = { id: number; name: string; slug: string }

type Domain = {
  id: number
  host: string
  kind: 'preview' | 'custom'
  status: string
  primary: boolean
  siteId: number | null
  siteSlug: string | null
  verificationToken: string | null
  dnsRecords: DnsRecord[]
  lastCheckedAt: string | null
}

export function BrandDomainRow({ domain, sites }: { domain: Domain; sites: SiteOption[] }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [attachTarget, setAttachTarget] = useState<string>('')
  const [confirm, confirmDialog] = useConfirm()

  const refresh = (): void => router.refresh()

  const onDelete = async (): Promise<void> => {
    if (domain.kind === 'preview') return
    const ok = await confirm({
      title: 'Delete this domain?',
      message: `${domain.host} is removed from PageFlo and its vhost is deleted. Any visitor still reaching it stops being served.`,
      confirmLabel: 'Delete domain',
      tone: 'danger',
      typeToConfirm: domain.host,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await deletePoolDomain({ domainId: domain.id })
      if (!result.ok) setError(result.error ?? 'failed to delete')
      else refresh()
    })
  }

  const onAttach = (): void => {
    if (!attachTarget) return
    const target = sites.find((s) => String(s.id) === attachTarget)
    if (!target) return
    setError(null)
    startTransition(async () => {
      const result = await attachDomainToSite({ domainId: domain.id, siteId: target.id, siteSlug: target.slug })
      if (!result.ok) setError(result.error)
      else {
        setAttachTarget('')
        refresh()
      }
    })
  }

  const onDetach = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Detach this domain?',
      message: `${domain.host} returns to the unassigned pool and stops resolving to its current Site. The domain itself is kept and can be attached again.`,
      confirmLabel: 'Detach',
      tone: 'danger',
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await detachDomainFromSite({ domainId: domain.id, siteSlug: domain.siteSlug ?? undefined })
      if (!result.ok) setError(result.error ?? 'failed to detach')
      else refresh()
    })
  }

  const onVerify = (): void => {
    setError(null)
    startTransition(async () => {
      const result = await verifyAttachedDomain({ domainId: domain.id })
      if (!result.ok) setError(result.error)
      else refresh()
    })
  }

  const onMakePrimary = (): void => {
    setError(null)
    startTransition(async () => {
      const result = await makeDomainPrimary({ domainId: domain.id })
      if (!result.ok) setError(result.error ?? 'failed')
      else refresh()
    })
  }

  const canVerify = domain.kind === 'custom' && (domain.status === 'pending' || domain.status === 'error') && domain.siteId != null
  const canMakePrimary =
    domain.siteId != null && !domain.primary && (domain.status === 'active' || domain.status === 'verified' || domain.kind === 'preview')

  return (
    <div id={`domain-${domain.id}`} className="rounded-app border border-border bg-surface-1 overflow-hidden">
      {confirmDialog}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Globe className="w-4 h-4 text-[var(--color-ink-muted)] shrink-0" />
        <span className="text-[14px] font-mono text-white flex-1 truncate">{domain.host}</span>
        <button
          onClick={onMakePrimary}
          disabled={pending || domain.primary || !canMakePrimary}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
            domain.primary
              ? 'text-[var(--color-brand-from)]'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-brand-from)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--color-ink-muted)]'
          }`}
          aria-label={domain.primary ? 'Primary' : 'Set as primary'}
          title={
            domain.primary
              ? 'Primary host for this brand'
              : domain.siteId == null
              ? 'Attach to a brand before setting as primary'
              : !canMakePrimary
              ? 'Verify the domain first'
              : 'Set as primary host for this brand'
          }
        >
          <Star className={`w-4 h-4 ${domain.primary ? 'fill-[var(--color-brand-from)]' : ''}`} />
        </button>
        <StatusBadge status={domain.status} />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[var(--color-ink-muted)] hover:text-white inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--color-surface-2)] transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          onClick={onDelete}
          disabled={pending || domain.kind === 'preview'}
          className="text-[var(--color-neg)] hover:text-white hover:bg-[var(--color-neg)] inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--color-neg)]"
          aria-label="Delete"
          title={domain.kind === 'preview' ? 'Preview domains cannot be deleted' : 'Delete domain'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-4 space-y-4">
          {/* Attach / Detach */}
          {domain.siteId == null ? (
            <Section title="Attach to a brand" hint="Choose which brand this domain should serve.">
              <div className="flex gap-2">
                <select
                  value={attachTarget}
                  onChange={(e) => setAttachTarget(e.target.value)}
                  className="flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[var(--color-brand-from)]"
                >
                  <option value="">Select a brand…</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={onAttach}
                  disabled={!attachTarget || pending}
                  className="brand-gradient text-white text-[12px] font-semibold px-4 py-2 rounded-md inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Attach
                </button>
              </div>
            </Section>
          ) : (
            <Section title="Brand" hint={domain.siteSlug ? `Currently serving brand "${domain.siteSlug}"` : null}>
              <div className="flex gap-2 items-center">
                <span className="text-[13px] text-white flex-1">
                  Attached. Detaching returns this domain to the unassigned pool.
                </span>
                {domain.kind === 'custom' ? (
                  <button
                    onClick={onDetach}
                    disabled={pending}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:text-white hover:border-[var(--color-border-strong)] inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Detach
                  </button>
                ) : null}
              </div>
            </Section>
          )}

          {canVerify ? (
            <Section title="Actions">
              <button
                onClick={onVerify}
                disabled={pending}
                className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:text-white hover:border-[var(--color-border-strong)] inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} />
                Verify DNS
              </button>
            </Section>
          ) : null}

          {/* DNS records */}
          {domain.kind === 'custom' && domain.dnsRecords.length > 0 ? (
            <Section title="DNS records" hint="Add the required record at your DNS provider, then click Verify DNS. Any one required record is enough.">
              <div className="rounded-md border border-[var(--color-border)] overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Value</th>
                      <th className="text-left px-3 py-2 font-semibold">Need</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {domain.dnsRecords.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--color-border)] align-top">
                        <td className="px-3 py-2 text-[var(--color-ink-muted)]">{r.type}</td>
                        <td className="px-3 py-2 text-white break-all">{r.name}</td>
                        <td className="px-3 py-2 text-white break-all">
                          {r.value}
                          {r.note ? (
                            <span className="block mt-1 font-sans text-[11px] leading-snug text-[var(--color-ink-dim)]">{r.note}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge tone={r.required ? 'warn' : 'neutral'}>{r.required ? 'Required' : 'Optional'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {error ? <p className="text-[12px] text-[var(--color-neg)]">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">{title}</h4>
        {hint ? <span className="text-[11px] text-[var(--color-ink-dim)]">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'brand' | 'pos' | 'warn' | 'neg' | 'neutral' }) {
  const styles: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    brand: { bg: 'rgba(255,92,117,0.10)', fg: '#FF8FA3', border: 'rgba(255,92,117,0.30)' },
    pos: { bg: 'rgba(45,190,108,0.10)', fg: '#7FE3A8', border: 'rgba(45,190,108,0.30)' },
    warn: { bg: 'rgba(232,177,75,0.10)', fg: '#F4C97F', border: 'rgba(232,177,75,0.30)' },
    neg: { bg: 'rgba(225,91,79,0.10)', fg: '#F09080', border: 'rgba(225,91,79,0.30)' },
    neutral: { bg: 'rgba(140,148,166,0.10)', fg: '#A8AFC0', border: 'rgba(140,148,166,0.30)' },
  }
  const s = styles[tone]
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      {children}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'pos' | 'warn' | 'neg' | 'neutral'; label: string }> = {
    active: { tone: 'pos', label: 'Active' },
    verified: { tone: 'pos', label: 'Verified' },
    provisioning: { tone: 'warn', label: 'Provisioning' },
    pending: { tone: 'warn', label: 'Pending' },
    error: { tone: 'neg', label: 'Error' },
  }
  const v = map[status] ?? { tone: 'neutral' as const, label: status }
  return <Badge tone={v.tone}>{v.label}</Badge>
}
