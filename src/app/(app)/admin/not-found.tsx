import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * A 404 inside the console.
 *
 * Reached when a route pattern matches but the record does not: a Site slug
 * that was renamed, a Page id that was deleted, a bookmark from before a move.
 * It says which of those it probably is rather than only "not found", because
 * the operator usually arrived from a link they still have.
 */
export default function AdminNotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[440px] rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-app border border-border bg-surface-1 text-ink-dim"
        >
          <Compass className="h-[19px] w-[19px]" />
        </span>
        <p className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-dim">404</p>
        <h1 className="mt-1.5 text-[18px] font-bold tracking-[-0.02em] text-ink">There is nothing at this address</h1>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-[1.6] text-ink-muted">
          The record was deleted, its slug was changed, or the link predates a move. Nothing is broken and nothing was
          lost.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/admin/overview"
            className="inline-flex items-center rounded-app bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Overview
          </Link>
          <Link
            href="/admin/sites"
            className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            All Sites
          </Link>
        </div>
      </div>
    </main>
  )
}
