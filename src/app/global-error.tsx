'use client'

/**
 * The last boundary. Nothing catches what reaches here.
 *
 * `global-error.tsx` replaces the root layout, which is why it has to render its
 * own `<html>` and `<body>` and cannot use any of the app's styling or brand
 * resolution — by the time it runs, the render that would have produced those is
 * the thing that failed.
 *
 * There was no error boundary anywhere in this app, so a render that threw gave
 * a visitor Next's default page and gave the operator nothing: exit criterion 6
 * in `docs/production-readiness.md` — "when something breaks at 3am, there is a
 * way to find out what" — with no way.
 *
 * WHAT A VISITOR IS TOLD. That something went wrong, and nothing else. This is a
 * legal-advertising funnel: a stack trace on it is an information leak and a
 * credibility problem in equal measure. The digest is shown because it is the
 * one string that lets somebody on the phone and somebody in the logs be sure
 * they are talking about the same failure.
 */

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // POSTed rather than reported directly: this is the client, and the reporter
    // — with its redaction, its transports and its SSRF-guarded webhook — is
    // server-side and stays there.
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
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', background: '#0e1116', color: '#e8eaed' }}>
        <main style={{ maxWidth: 560, margin: '15vh auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Something went wrong</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#9aa3ad', margin: '0 0 24px' }}>
            The page could not be shown. It has been reported. Trying again often works.
          </p>
          <button
            onClick={reset}
            style={{
              appearance: 'none', border: '1px solid #2a313a', background: '#161b22', color: '#e8eaed',
              borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, color: '#5c6470', marginTop: 28, fontFamily: 'ui-monospace, monospace' }}>
              reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
