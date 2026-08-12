import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import '../globals.css'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'
import { resolveSiteByHost, isFallbackHost } from '@/lib/site-resolver'
import { resolveBrandTokens } from '@/lib/brand/resolve-tokens'
import { IDENTITY_FONTS_HREF } from '@/lib/lp-identities'

export const dynamic = 'force-dynamic'

type Site = {
  id: string | number
  name?: string | null
  brand?: {
    logo_url?: string | null
    favicon_url?: string | null
    primary?: string | null
    accent?: string | null
    surface?: string | null
    ink?: string | null
    muted?: string | null
    success?: string | null
    warning?: string | null
    danger?: string | null
    font_heading?: string | null
    font_body?: string | null
  } | null
}

// Per-Site brand tokens use distinct names (--site-*) so they don't collide with the
// dark-theme app tokens (--color-*) defined in globals.css. When no Site is matched
// (the LegalOS marketing fallback), no site tokens are emitted — the dark @theme wins.
//
// Every value comes from resolveBrandTokens. This function used to carry its own
// `?? '#0B1F3A'` fallback on each variable, which meant a brand with no data
// rendered as a plausible navy site rather than visibly failing — and a wrong
// palette that looks deliberate is how wrong colours reach production.
//
// If the brand cannot resolve, we emit NOTHING and let the page render unstyled.
// That is deliberate: unstyled is obviously broken, an invented palette is not.
// The publish gate is what stops a site reaching that state in the first place.
const siteStyleVars = (site: Site): string => {
  let resolved
  try {
    resolved = resolveBrandTokens(site?.brand as Parameters<typeof resolveBrandTokens>[0])
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[legalos] brand tokens unresolvable for site ${site?.id}:`,
      err instanceof Error ? err.message : err,
    )
    return ''
  }

  // The page background comes from --site-bg. It used to come from
  // --site-surface, which is why the migration copies surface into bg: the
  // rendered background is unchanged, and surface goes back to meaning the card.
  return `:root{${resolved.css}}
  html.site-shell,html.site-shell body{background:var(--site-bg);color:var(--site-ink);font-family:var(--site-font-body);margin:0;}
  html.site-shell h1,html.site-shell h2,html.site-shell h3,html.site-shell h4,html.site-shell h5{font-family:var(--site-font-heading);color:var(--site-ink);}
  html.site-shell a{color:var(--site-primary);}
  `
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const h = await headers()
  const previewSiteSlug = h.get('x-legalos-preview-site')
  const host = h.get('x-legalos-host') ?? h.get('host')
  let site: Site | null = null

  // Preview mode (?site=<slug>) — middleware stamps x-legalos-preview-site.
  // This must take precedence over host resolution because the host here
  // is always the admin host, which would otherwise resolve to no site and the
  // brand CSS variables would never be emitted.
  //
  // The header is request INTENT, forwarded by middleware, which performs no
  // auth. This layout honoured it with no check of any kind, so an anonymous
  // caller could name any tenant by slug and be served that brand's colours,
  // fonts, logo and favicon. The route re-verifies the session for the body;
  // the same verification has to happen here, or the chrome leaks what the body
  // refuses. A binding to THIS Site is required, not merely a session.
  if (previewSiteSlug) {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'sites',
      where: { slug: { equals: previewSiteSlug } },
      limit: 1,
      overrideAccess: true,
    })
    const candidate = (res.docs[0] as Site) ?? null
    const user = candidate ? await getCurrentUser() : null
    site = candidate && isBoundToSite(user, (candidate as { id: string | number }).id) ? candidate : null
  } else if (host && !isFallbackHost(host)) {
    const resolved = await resolveSiteByHost(host)
    if (resolved) {
      const payload = await getPayload({ config })
      site = (await payload.findByID({
        collection: 'sites',
        id: resolved.siteId,
        overrideAccess: true,
      })) as Site
    }
  }

  return (
    <html lang="en" className={site ? 'site-shell' : ''}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The four landing-page identities are distinguished as much by their
            faces as their palettes, so a missing face is a changed identity
            rather than a cosmetic loss. Preconnected because this sits on the
            critical path of a tenant page. */}
        <link rel="stylesheet" href={IDENTITY_FONTS_HREF} />
        {site ? <style dangerouslySetInnerHTML={{ __html: siteStyleVars(site) }} /> : null}
        {site?.brand?.favicon_url ? <link rel="icon" href={site.brand.favicon_url} /> : null}
      </head>
      <body>{children}</body>
    </html>
  )
}
