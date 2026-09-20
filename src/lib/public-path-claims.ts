import type { Payload } from 'payload'

/**
 * Does authored content already own this public path?
 *
 * Funnel deployments (quizzes, landing pages, advertorials) are resolved late
 * in the public router, after Pages, shared legal templates and site-scoped
 * Landing Pages. A deployment must therefore refuse any path one of those
 * already serves.
 *
 * The check lives here, shared by every deployment resolver, for a reason that
 * is not obvious: the router is not the only caller. `generateMetadata` runs
 * BEFORE the router's earlier steps have executed, so if a deployment resolver
 * claimed a path a Page owns, the visitor would get the Page while the crawler
 * got the deployment's title and Open Graph tags. Refusing the path inside the
 * resolver makes the page and its metadata agree by construction rather than by
 * two call sites remembering to check the same things in the same order.
 */

/** Paths the router serves from SharedLegalTemplates before it looks at a deployment. */
export const SHARED_TEMPLATE_PATHS = new Set([
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-of-service',
  '/partners',
  '/submitted',
  '/thanks',
  '/tcpa',
  '/disclosures',
])

/**
 * Slug variants to match against. Pages store a slug with or without the
 * leading slash depending on how it was authored, so both are checked.
 */
export const pathVariantsFor = (normalizedPath: string): string[] =>
  Array.from(new Set([normalizedPath, normalizedPath.toLowerCase(), normalizedPath.replace(/^\//, '')]))

export const isClaimedByAuthoredContent = async (
  payload: Payload,
  siteId: number,
  normalizedPath: string,
): Promise<boolean> => {
  if (SHARED_TEMPLATE_PATHS.has(normalizedPath.toLowerCase())) return true

  const variants = pathVariantsFor(normalizedPath)

  // Mirrors the router's own visibility rule exactly: only content the router
  // would actually SERVE claims the path. A draft Page sitting at the same slug
  // does not block a live deployment, because the router would not have served
  // that Page either.
  const nowIso = new Date().toISOString()
  const [pageHit, lpHit] = await Promise.all([
    payload.find({
      collection: 'pages',
      where: {
        and: [
          { site: { equals: siteId } },
          { slug: { in: variants } },
          {
            or: [
              { status: { equals: 'published' } },
              { and: [{ status: { equals: 'scheduled' } }, { publish_at: { less_than_equal: nowIso } }] },
            ],
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'landing-pages',
      where: {
        and: [
          { site: { equals: siteId } },
          { slug: { in: variants } },
          { status: { equals: 'published' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  return pageHit.docs.length > 0 || lpHit.docs.length > 0
}
