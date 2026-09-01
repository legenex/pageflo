/**
 * PageFlo product identity.
 *
 * One place for the product name, tagline and positioning. Every user-facing
 * surface reads from here rather than repeating a literal, so the name is a
 * value the application holds rather than 36 strings scattered across
 * components.
 *
 * This module is deliberately free of environment reads and imports. It is safe
 * in a client component, a server component, a route handler and a build script.
 */

/** The product name, as users see it. */
export const PRODUCT_NAME = 'PageFlo'

/** The operating company. Distinct from the product. */
export const COMPANY_NAME = 'Legenex'

/** Short tagline. Used in metadata and the marketing hero. */
export const PRODUCT_TAGLINE = 'Build every page. Control every path.'

/**
 * One-sentence positioning. Vertical agnostic on purpose: PageFlo grew out of a
 * legal-vertical product but the platform is not legal-specific, and no shared
 * surface should say otherwise. Legal-specific templates and fields still exist
 * for the sites that depend on them; they are content, not positioning.
 */
export const PRODUCT_POSITIONING =
  'Dynamic acquisition infrastructure for lead generators, performance marketers, affiliates, agencies, media buyers and growth teams.'

/** Longer description, used for meta descriptions and the marketing hero body. */
export const PRODUCT_DESCRIPTION =
  'PageFlo is the dynamic site, landing page and quiz platform built for lead generators and performance marketers. Build connected acquisition experiences, route visitors intelligently and deploy across domains from one system.'

/** Metadata title for the operator application. */
export const APP_TITLE = `${PRODUCT_NAME} Console`

/** Metadata description for the operator application. */
export const APP_DESCRIPTION = `The ${PRODUCT_NAME} operator console: sites, landing pages, advertorials, quizzes, brands, domains, deployments and leads.`

/**
 * The core product nouns, in the order the product introduces them. Used by the
 * marketing site and the handbook so the two cannot drift.
 */
export const PRODUCT_CONCEPTS = [
  'Sites',
  'Landing Pages',
  'Advertorials',
  'Quizzes',
  'Brand Kits',
  'Domains',
  'Deployments',
  'Leads',
] as const

/**
 * Surfaces that are designed but not built. Anything listed here must render as
 * an explicit "coming soon" and must never show fabricated data. Removing an
 * entry is a claim that the surface is real, backed by working code.
 */
export const COMING_SOON_SURFACES = ['Analytics', 'Campaign Integrity'] as const
