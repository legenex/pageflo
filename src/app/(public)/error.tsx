'use client'

/**
 * A public page that threw.
 *
 * Scoped to the `(public)` group on purpose: a visitor on a tenant's landing
 * page gets a neutral, brandless apology and no detail. This is a legal-
 * advertising funnel — a stack trace on one is an information leak and a
 * credibility problem at the same time — and the boundary cannot resolve the
 * brand anyway, because resolving the brand is one of the things that may have
 * failed.
 *
 * The one thing it does show is the digest, so somebody on the phone and
 * somebody in the logs can be sure they are talking about the same failure.
 */

import { useEffect } from 'react'

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void fetch('/api/legalos/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest ?? null,
        route: typeof window === 'undefined' ? null : window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [error])

  return (
    <main style={{ maxWidth: 560, margin: '15vh auto', padding: '0 24px', textAlign: 'center', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>This page could not be shown</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--site-muted, #5c6470)', margin: '0 0 24px' }}>
        Something went wrong on our side. It has been reported. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        style={{ appearance: 'none', border: '1px solid currentColor', background: 'transparent', color: 'inherit', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}
      >
        Try again
      </button>
      {error.digest ? (
        <p style={{ fontSize: 11, color: 'var(--site-muted, #5c6470)', marginTop: 28, fontFamily: 'ui-monospace, monospace' }}>
          reference {error.digest}
        </p>
      ) : null}
    </main>
  )
}
