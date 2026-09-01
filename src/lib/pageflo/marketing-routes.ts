/**
 * The public marketing site's route table.
 *
 * One list, consumed by the sitemap, the footer and the marketing navigation,
 * so a link and its sitemap entry cannot disagree and no link can point at a
 * route that does not publish.
 */

import { legalPagesPublishable } from './legal'

export type MarketingRoute = {
  path: string
  label: string
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: string
  /** False when the route depends on configuration that is not present. */
  published: boolean
}

export const marketingRoutes = (): MarketingRoute[] => {
  const legal = legalPagesPublishable()
  return [
    { path: '/', label: 'Home', changefreq: 'weekly', priority: '1.0', published: true },
    { path: '/privacy', label: 'Privacy Policy', changefreq: 'yearly', priority: '0.3', published: legal },
    // No /terms route. A terms of service is a contract: liability, warranty,
    // payment, acceptable use, termination and governing law are commercial
    // decisions the operating business makes, none of which is derivable from
    // this repository. Drafting one here would publish invented contractual
    // commitments under the operator's name. It is listed as an open item in
    // docs/HUMAN-GATES.md and gets a route when the business supplies the text.
  ]
}

/** Only the routes that actually publish, for the sitemap. */
export const marketingSitemapEntries = (): MarketingRoute[] =>
  marketingRoutes().filter((r) => r.published)

/** Legal footer links, empty until the legal facts are configured. */
export const marketingLegalLinks = (): MarketingRoute[] =>
  marketingRoutes().filter((r) => r.published && r.path !== '/')
