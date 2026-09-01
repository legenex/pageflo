import { headers } from 'next/headers'
import { resolveSiteByHost } from '@/lib/site-resolver'
import { classifyHost, marketingOrigin } from '@/lib/pageflo/hosts'

export const dynamic = 'force-dynamic'

const plain = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } })

export async function GET() {
  const h = await headers()
  const host = h.get('x-pageflo-host') ?? h.get('x-legalos-host') ?? h.get('host') ?? ''
  const role = classifyHost(host)

  // The marketing site is the only PageFlo-owned surface that should be
  // indexed. It advertises its own sitemap at its canonical origin so a
  // crawler that arrived on www. is pointed at the apex.
  if (role === 'marketing') {
    const origin = marketingOrigin() || `https://${host}`
    return plain(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`)
  }

  // The operator console is an authenticated application. Nothing about it
  // belongs in a search index, including the sign-in page.
  if (role === 'app' || role === 'legacy-app') return plain(`User-agent: *\nDisallow: /\n`)

  if (!host) return plain(`User-agent: *\nDisallow: /\n`)

  const resolved = await resolveSiteByHost(host)
  if (!resolved) return plain(`User-agent: *\nDisallow: /\n`)

  return plain(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`)
}
