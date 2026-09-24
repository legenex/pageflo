'use client'

import { useState, useTransition } from 'react'
import { Loader2, Home } from 'lucide-react'
import { ensurePublishedHomePage } from '@/app/(app)/admin/sites/[slug]/pages/actions'

export function EnsureHomeButton({ siteId, siteSlug }: { siteId: number | string; siteSlug: string }) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return <p className="text-[12px] text-[var(--color-success)]">Home page is published. Preview the Brand to review it.</p>
  }

  return (
    <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-3 flex flex-col gap-2 max-w-[420px]">
      <p className="text-[12px] text-ink leading-snug">
        This Brand has no published Home at <code>/</code>. Visitors hitting the preview host get a 404 until one exists.
      </p>
      {error ? <p className="text-[11px] text-[var(--color-danger)]">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await ensurePublishedHomePage({ siteId, siteSlug })
            if (!res.ok) setError(res.error)
            else setDone(true)
          })
        }}
        className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Home className="w-3.5 h-3.5" />}
        Create published Home
      </button>
    </div>
  )
}
