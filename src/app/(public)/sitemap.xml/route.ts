import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { resolveSiteByHost } from '@/lib/site-resolver'
import { classifyHost, marketingOrigin } from '@/lib/pageflo/hosts'
import { marketingSitemapEntries } from '@/lib/pageflo/marketing-routes'

export const dynamic = 'force-dynamic'

const escapeXml = (s: string): string => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!))

export async function GET() {
  const h = await headers()
  const host = h.get('x-pageflo-host') ?? h.get('x-legalos-host') ?? h.get('host') ?? ''
  const role = classifyHost(host)

  // The marketing site has a small, fixed sitemap of its own public pages.
  if (role === 'marketing') {
    const origin = marketingOrigin() || `https://${host}`
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${marketingSitemapEntries()
  .map((e) => `  <url><loc>${escapeXml(origin + e.path)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`)
  .join('\n')}
</urlset>`
    return new Response(body, { headers: { 'content-type': 'application/xml' } })
  }

  // The console publishes nothing. An empty urlset is a valid answer and avoids
  // a crawler treating a 404 here as a site-wide fault.
  if (!host || role === 'app' || role === 'legacy-app') {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      headers: { 'content-type': 'application/xml' },
    })
  }

  const resolved = await resolveSiteByHost(host)
  if (!resolved) return new Response('not found', { status: 404 })

  const payload = await getPayload({ config })
  const [pages, lps, posts] = await Promise.all([
    payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: resolved.siteId } }, { status: { equals: 'published' } }] },
      limit: 1000,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'landing-pages',
      where: { and: [{ site: { equals: resolved.siteId } }, { status: { equals: 'published' } }] },
      limit: 1000,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'blog-posts',
      where: { and: [{ site: { equals: resolved.siteId } }, { status: { equals: 'published' } }] },
      limit: 5000,
      overrideAccess: true,
    }),
  ])

  const origin = `https://${resolved.primaryHost ?? host}`
  const urls: Array<{ loc: string; lastmod?: string }> = []

  for (const p of pages.docs) {
    const slug = p.slug.startsWith('/') ? p.slug : `/${p.slug}`
    urls.push({ loc: `${origin}${slug}`, lastmod: p.updatedAt })
  }
  for (const l of lps.docs) {
    const slug = l.slug.startsWith('/') ? l.slug : `/${l.slug}`
    urls.push({ loc: `${origin}${slug}`, lastmod: l.updatedAt })
  }
  for (const post of posts.docs) {
    urls.push({ loc: `${origin}/blog/${post.slug}`, lastmod: post.updatedAt })
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>`

  return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
