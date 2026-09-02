'use client'

/**
 * The browser half of error reporting.
 *
 * The reporter itself, with its redaction, its transports and its SSRF-guarded
 * webhook, is server-side and stays there. This is the one line between an
 * error boundary and it: a bounded POST to `/api/pageflo/client-error`.
 *
 * Two boundaries call it, `src/app/global-error.tsx` and
 * `src/app/(app)/admin/error.tsx`, which is why it is a module rather than a
 * copied `fetch`. It never throws and never returns a rejected promise: a
 * failure to report an error must not replace the error the user is looking at.
 */

export type ClientErrorSurface = 'admin' | 'public' | 'root'

export async function reportClientError(
  error: Error & { digest?: string },
  { surface }: { surface: ClientErrorSurface },
): Promise<void> {
  try {
    await fetch('/api/pageflo/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Bounded here as well as on the server. The route caps it at 1000
        // characters and drops the whole report if it is longer, so trimming
        // client-side is what keeps a long message reported rather than lost.
        message: `[${surface}] ${error.message}`.slice(0, 1000),
        digest: error.digest ?? null,
        route: typeof window === 'undefined' ? null : window.location.pathname,
      }),
      // Survives the navigation an operator makes as soon as they see the page.
      keepalive: true,
    })
  } catch {
    // Reporting is best effort by design.
  }
}
