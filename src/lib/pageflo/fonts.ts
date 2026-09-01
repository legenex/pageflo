/**
 * PageFlo interface fonts.
 *
 * Inter for interface text, JetBrains Mono for identifiers, timestamps, domains,
 * counts and paths. Loaded as a stylesheet link rather than through
 * `next/font/google` because `next/font` fetches at build time, and this
 * application is built on the production host during a release window where a
 * font CDN outage must not be able to fail the build.
 *
 * The public tenant layout loads its own identity faces separately; this
 * constant is PageFlo chrome only and is never applied to a tenant page.
 */
export const PAGEFLO_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'

/** Preconnect targets that must accompany the stylesheet link. */
export const FONT_PRECONNECT = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'] as const
