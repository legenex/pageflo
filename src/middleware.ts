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
    // `hostname`, not `host`: assigning `host` also clears the port, which
    // rewrote `example.test:3000` to `example.test:80` on any deployment not
    // sitting behind a proxy on the default port.
    target.hostname = canonical

    /*
     * The scheme comes from the proxy, not from a constant.
     *
     * In production nginx terminates TLS and proxies plain HTTP to
     * 127.0.0.1:3000, so `url.protocol` is always `http:` and a redirect that
     * echoed it would bounce the visitor through an extra insecure hop.
     * `X-Forwarded-Proto` is what nginx sets to say what the VISITOR used, and
     * it is the only value that is true about the outside of the connection.
     *
     * Hardcoding `https:` was correct in production and made the redirect
     * impossible to exercise anywhere else: a local or CI run over plain HTTP
     * was sent to `https://host` with the port stripped, which refuses the
     * connection. So the port is kept exactly when there is no proxy in front,
     * which is the same condition.
     *
     * The header cannot be forged in the deployment that matters: nginx sets it
     * itself on every proxied request, overwriting whatever the client sent,
     * and nothing else can reach the loopback port.
     */
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    if (forwardedProto === 'http' || forwardedProto === 'https') {
      target.protocol = `${forwardedProto}:`
      target.port = ''
    } else if (host.includes(':')) {
      // No proxy in front, and the visitor named a port. Carry it across.
      target.port = host.split(':')[1]
    }

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
