'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Globe, Star, Unlink } from 'lucide-react'
import { detachDomainFromSite } from '@/app/(app)/admin/(top)/brands/domains/actions'
import { useConfirm } from '@/components/pageflo/interactive'

type Domain = {
  id: number
  host: string
  kind: 'preview' | 'custom'
  status: string
  primary: boolean
}

export function AttachedDomainRow({
  domain,
  siteSlug,
}: {
  domain: Domain
  siteSlug: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  const onDetach = async (): Promise<void> => {
    if (domain.kind === 'preview') return
    const ok = await confirm({
      title: 'Detach this domain?',
      message: `${domain.host} returns to the unassigned pool and stops resolving to this Site. The domain is kept and can be attached again.`,
      confirmLabel: 'Detach',
      tone: 'danger',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await detachDomainFromSite({ domainId: domain.id, siteSlug })
      if (!result.ok) {
        window.alert(result.error ?? 'failed to detach')
        return
      }
      router.refresh()
    })
  }

  const statusTone: Record<string, { fg: string; bg: string; border: string }> = {
    active: { fg: '#7FE3A8', bg: 'rgba(45,190,108,0.10)', border: 'rgba(45,190,108,0.30)' },
    verified: { fg: '#7FE3A8', bg: 'rgba(45,190,108,0.10)', border: 'rgba(45,190,108,0.30)' },
    provisioning: { fg: '#F4C97F', bg: 'rgba(232,177,75,0.10)', border: 'rgba(232,177,75,0.30)' },
    pending: { fg: '#F4C97F', bg: 'rgba(232,177,75,0.10)', border: 'rgba(232,177,75,0.30)' },
    error: { fg: '#F09080', bg: 'rgba(225,91,79,0.10)', border: 'rgba(225,91,79,0.30)' },
  }
  const tone = statusTone[domain.status] ?? statusTone.pending

  return (
    <div className="flex items-center gap-3 rounded-app border border-border bg-surface-1 px-3.5 py-2.5">
      {confirmDialog}
      <Globe className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <Link
        href={`/admin/brands/domains#domain-${domain.id}`}
        className="text-[14px] font-mono text-white flex-1 truncate hover:text-[var(--color-info)]"
      >
        {domain.host}
      </Link>
      {domain.primary ? (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
          style={{ background: 'rgba(255,92,117,0.10)', color: '#FF8FA3', border: '1px solid rgba(255,92,117,0.30)' }}
        >
          <Star className="w-3 h-3" /> Primary
        </span>
      ) : null}
      <span
        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
        style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
      >
        {domain.status}
      </span>
      <button
        onClick={onDetach}
        disabled={pending || domain.kind === 'preview'}
        className="text-[var(--color-ink-muted)] hover:text-white inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Detach"
        title={domain.kind === 'preview' ? 'Preview domain — cannot detach' : 'Detach from this brand'}
      >
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
