'use client'

/**
 * The explicit publish / pause control for a Site.
 *
 * This replaces two side effects that used to publish a brand with nobody
 * asking: the SSL poller promoting 'draft' on a background promise, and this
 * very dashboard doing it during a GET render. Both are gone, so publication now
 * needs a button, and the button has to say what it will do before it does it.
 *
 * The confirmation step is not ceremony. Publishing is the moment a brand
 * becomes reachable by the public, and the previous behaviour meant an operator
 * could not tell whether they had done it or the system had.
 */

import { useState, useTransition } from 'react'
import { Globe, Loader2, PauseCircle, PlayCircle } from 'lucide-react'

import { setSiteStatus, type SiteStatus } from '@/app/(app)/admin/sites/[slug]/settings/general/actions'

type Props = {
  siteId: number | string
  status: SiteStatus
  /** The host the public will reach, so "publish" names a destination. */
  primaryHost: string | null
}

/** What each transition does, in the operator's terms rather than the schema's. */
const INTENT: Partial<Record<SiteStatus, { to: SiteStatus; label: string; explain: (host: string | null) => string }>> = {
  draft: {
    to: 'active',
    label: 'Publish brand',
    explain: (host) =>
      host
        ? `This brand will start serving to the public at ${host}. Its live deployments become reachable.`
        : 'This brand will start serving to the public. It has no primary domain yet, so nothing will be reachable until one is connected.',
  },
  active: {
    to: 'paused',
    label: 'Pause brand',
    explain: (host) =>
      host
        ? `${host} will stop serving to the public. Configuration and deployments are kept, and you can resume at any time.`
        : 'This brand will stop serving to the public. Configuration and deployments are kept.',
  },
  paused: {
    to: 'active',
    label: 'Resume brand',
    explain: (host) => (host ? `${host} will start serving to the public again.` : 'This brand will start serving to the public again.'),
  },
}

export function SitePublishControl({ siteId, status, primaryHost }: Props) {
  const [current, setCurrent] = useState<SiteStatus>(status)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const intent = INTENT[current]
  // Archived is terminal from here. Restoring a brand is a different decision
  // and must not share a button with "unpause".
  if (!intent) return null

  const run = () => {
    setError(null)
    startTransition(async () => {
      const res = await setSiteStatus({ siteId, from: current, to: intent.to })
      if (res.ok) {
        setCurrent(res.status)
        setConfirming(false)
      } else {
        setError(res.error)
      }
    })
  }

  const Icon = intent.to === 'active' ? (current === 'draft' ? Globe : PlayCircle) : PauseCircle

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => { setError(null); setConfirming(true) }}
          className="text-[13px] text-white font-medium px-4 py-2 rounded-lg border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] inline-flex items-center gap-1.5"
        >
          <Icon className="w-3.5 h-3.5" /> {intent.label}
        </button>
        {error ? <p className="text-[11px] text-[var(--color-danger)] max-w-[280px] text-right">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3 max-w-[340px]">
      <p className="text-[12px] text-white leading-snug mb-2">{intent.explain(primaryHost)}</p>
      {error ? <p className="text-[11px] text-[var(--color-danger)] mb-2">{error}</p> : null}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-[12px] text-[var(--color-ink-muted)] px-3 py-1.5 rounded-md hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="brand-gradient text-white font-semibold text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
          {intent.label}
        </button>
      </div>
    </div>
  )
}
