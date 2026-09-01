import { NextResponse, type NextRequest } from 'next/server'
import { canonicalHostRedirect, classifyHost } from '@/lib/pageflo/hosts'

// Pass through anything Payload owns, the custom admin shell, all _next assets, and our integration endpoints.
// Custom admin is at /admin/*, raw Payload admin at /cms/*, Payload API at /api/*.
const PASSTHROUGH_PREFIXES = ['/admin', '/cms', '/api']
const SYSTEM_PREFIXES = ['/_next', '/favicon.ico']

const isPassthrough = (pathname: string): boolean => PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
const isSystemPath = (pathname: string): boolean => SYSTEM_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * Stamp the resolved host and its PageFlo role onto the request.
 *
 * `x-pageflo-host` is the canonical header. `x-legalos-host` is still written
 * because the security contract asserted by `scripts/test-trusted-host.mts`
 * names it, and because a request can be in flight across a rolling deploy. Both
 * carry the same value; readers accept either and prefer the PageFlo name.
 *
 * Neither header is trusted on `/api/*`. See `src/lib/trusted-host.ts` for why:
 * a client that can set `x-pageflo-host` on an API route could otherwise use it
 * as a host-to-Site oracle across tenants.
 */
const stampHost = (res: NextResponse, host: string): NextResponse => {
  res.headers.set('x-pageflo-host', host)
  res.headers.set('x-legalos-host', host)
  res.headers.set('x-pageflo-host-role', classifyHost(host))
  return res
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname
  const host = req.headers.get('host') ?? ''

  // Canonical host redirects run before everything, including the admin and API
  // passthroughs, so `www.pageflo.io/admin` lands on `app.pageflo.io/admin`
  // rather than serving the console from a second origin. A second origin would
  // silently fail every server action: Payload's CSRF allowlist rejects an
  // Origin it does not know and returns `user = null`, which reads as
  // "unauthenticated" rather than as a misconfiguration.
  const canonical = canonicalHostRedirect(host)
  if (canonical) {
    const target = new URL(url.toString())
    target.host = canonical
    target.protocol = 'https:'
    target.port = ''
    return NextResponse.redirect(target, 308)
  }

  if (isPassthrough(pathname) || isSystemPath(pathname)) return NextResponse.next()

  // Preview override: ?site=<slug> bypasses host lookup.
  const previewSiteSlug = url.searchParams.get('site')
  // ?preview=1 asks the public route to bypass the status='published' filter
  // so an admin previewing draft / scheduled content sees the unpublished
  // version. The route re-verifies the request is authenticated before
  // actually honouring the bypass — middleware only forwards the intent.
  const previewMode = url.searchParams.get('preview')
  if (previewSiteSlug) {
    const res = stampHost(NextResponse.next(), host)
    res.headers.set('x-pageflo-preview-site', previewSiteSlug)
    res.headers.set('x-legalos-preview-site', previewSiteSlug)
    if (previewMode === '1') {
      res.headers.set('x-pageflo-preview', '1')
      res.headers.set('x-legalos-preview', '1')
    }
    return res
  }
  if (previewMode === '1') {
    const res = stampHost(NextResponse.next(), host)
    res.headers.set('x-pageflo-preview', '1')
    res.headers.set('x-legalos-preview', '1')
    return res
  }

  return stampHost(NextResponse.next(), host)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
