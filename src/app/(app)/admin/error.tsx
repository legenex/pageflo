'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { reportClientError } from '@/lib/observability/client'

/**
 * The console's error boundary.
 *
 * It sits at `/admin` rather than at `/admin/(top)` so it also catches a
 * failure inside a Site workspace, which has its own layout and its own
 * sidebar. Both sidebars stay mounted underneath, so an operator who hits this
 * can navigate away without a full reload.
 *
 * The message shown is deliberately generic and the digest is shown verbatim.
 * `error.message` from a server component is replaced by a generic string in
 * production anyway, and the digest is the only value that ties what the
 * operator is looking at to a line in the server log. Printing a stack here
 * would leak internals to an editor-role account for no operational gain.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Fire and forget. A reporting failure must never replace the error the
    // operator is already looking at.
    void reportClientError(error, { surface: 'admin' })
  }, [error])

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[440px] rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-app border border-neg/30 bg-neg/10 text-neg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 4l9 16H3zM12 10v5M12 17.5v.5" />
          </svg>
        </span>
        <h1 className="mt-4 text-[18px] font-bold tracking-[-0.02em] text-ink">This screen failed to load</h1>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-[1.6] text-ink-muted">
          Nothing was saved and no data was changed. Try again, and if it keeps failing send the reference below to
          whoever runs this workspace.
        </p>
        {error.digest ? (
          <p className="mt-3.5 inline-block rounded-app border border-border bg-surface-deep px-2.5 py-1 font-mono text-[11px] text-ink-secondary">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-app bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/admin/overview"
            className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            Back to Overview
          </Link>
        </div>
      </div>
    </main>
  )
}
