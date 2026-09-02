import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { PRODUCT_NAME } from './lib/pageflo/product'
import { env, envList } from './lib/pageflo/env'
import { appHost, legacyAppHosts, marketingHost } from './lib/pageflo/hosts'
import { Users } from './collections/Users'
import { Sites } from './collections/Sites'
import { Domains } from './collections/Domains'
import { Pages } from './collections/Pages'
import { SharedLegalTemplates } from './collections/SharedLegalTemplates'
import { Quizzes } from './collections/Quizzes'
import { LandingPages } from './collections/LandingPages'
import { FunnelLandingPages } from './collections/FunnelLandingPages'
import { FunnelLpDeployments } from './collections/FunnelLpDeployments'
import { FunnelQuizzes } from './collections/FunnelQuizzes'
import { FunnelQuizDeployments } from './collections/FunnelQuizDeployments'
import { FunnelQuizTemplates } from './collections/FunnelQuizTemplates'
import { FunnelAdvertorials } from './collections/FunnelAdvertorials'
import { FunnelAdvertorialDeployments } from './collections/FunnelAdvertorialDeployments'
import { Leads } from './collections/Leads'
import { BlogPosts } from './collections/BlogPosts'
import { Numbers } from './collections/Numbers'
import { TrackingConfigs } from './collections/TrackingConfigs'
import { Media } from './collections/Media'
import { AuditLog } from './collections/AuditLog'
import { BuildLogComments } from './collections/BuildLogComments'
import { IntegrationConfig } from './globals/IntegrationConfig'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * The CSRF allowlist.
 *
 * Server actions send an `Origin` header that has to match one of these, or
 * Payload's cookie auth strategy returns `user = null` and every action fails
 * as "unauthenticated" with no CSRF-shaped error anywhere to explain it. That
 * failure mode is silent, total, and exactly what a domain cutover produces if
 * this list is not moved with it.
 *
 * So the PageFlo hosts are derived rather than typed twice. `PAGEFLO_APP_HOST`,
 * `PAGEFLO_MARKETING_HOST` and every entry in `PAGEFLO_LEGACY_APP_HOSTS` are
 * turned into https origins automatically, alongside the explicitly configured
 * server URL. An operator who sets the host variables the router already needs
 * does not then have to remember a second, differently-shaped variable for the
 * same hosts.
 *
 * `PAGEFLO_EXTRA_ORIGINS` (legacy `LEGALOS_EXTRA_ORIGINS`) remains for anything
 * the host variables do not cover, such as a bare-IP staging origin.
 *
 * Deduplicated because Payload compares the list literally and a duplicated
 * origin in a header-matching allowlist is noise a reader has to rule out.
 */
const csrfOrigins = (): string[] => {
  const origins = new Set<string>()

  const add = (value: string): void => {
    const trimmed = value.trim().replace(/\/$/, '')
    if (trimmed) origins.add(trimmed)
  }

  const configured = env('serverUrl')
  if (configured) add(configured)

  // Hosts, as https origins. `www.` of a PageFlo host 308s to the apex before
  // any action runs, but it is included so the redirect itself is same-origin.
  for (const host of [appHost(), marketingHost(), ...legacyAppHosts()]) {
    if (!host) continue
    add(`https://${host}`)
    if (!host.startsWith('www.')) add(`https://www.${host}`)
  }

  for (const extra of envList('extraOrigins')) add(extra)

  if (process.env.NODE_ENV !== 'production') {
    add('http://localhost:3000')
    add('http://127.0.0.1:3000')
  }

  return [...origins]
}

export default buildConfig({
  // Raw Payload admin lives at /cms. The custom branded dashboard owns /admin.
  routes: {
    admin: '/cms',
  },
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ` · ${PRODUCT_NAME}`,
      icons: [{ rel: 'icon', url: '/favicon.ico' }],
    },
    components: {
      // Custom views/components can be wired here in later phases:
      // - Sites list overview
      // - SharedLegalTemplate affected-sites confirm modal
      // - Per-Site sidebar swap
    },
  },
  editor: lexicalEditor(),
  collections: [
    Users,
    Sites,
    Domains,
    Pages,
    SharedLegalTemplates,
    Quizzes,
    LandingPages,
    FunnelLandingPages,
    FunnelLpDeployments,
    FunnelQuizzes,
    FunnelQuizDeployments,
    FunnelQuizTemplates,
    FunnelAdvertorials,
    FunnelAdvertorialDeployments,
    Leads,
    BlogPosts,
    Numbers,
    TrackingConfigs,
    Media,
    AuditLog,
    BuildLogComments,
  ],
  globals: [IntegrationConfig],
  secret: process.env.PAYLOAD_SECRET ?? 'dev-secret-change-me',
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI ?? 'postgres://legalos:legalos@localhost:5432/legalos',
    },
    // Production uses the real migration files in src/migrations/, applied by
    // `scripts/release.sh` via `pnpm payload migrate` WHILE THE SERVICE IS DOWN
    // and verified with `pnpm verify:schema` before it starts. Dev still
    // auto-pushes the schema (Payload's default when NODE_ENV !== production),
    // which is what let three columns ship without migrations.
    // To add one after a schema change: pnpm payload migrate:create <name>
    //
    // The directory is overridable so a release can be STAGED - applied as far
    // as a known point rather than all at once - and so
    // `scripts/test-release-ordering.mts` can build the schema the previous
    // release produced, exactly, from this repository alone. Payload discovers
    // migrations by reading this directory and sorting by filename; it does NOT
    // read src/migrations/index.ts.
    migrationDir: env('migrationDir') || undefined,
  }),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  sharp,
  cors: '*',
  // CSRF allowlist. See csrfOrigins() above.
  csrf: csrfOrigins(),
  upload: {
    limits: { fileSize: 10 * 1024 * 1024 },
  },
  graphQL: {
    /**
     * Disabled deliberately, and it was already effectively off.
     *
     * The schema could not build: Payload derives GraphQL enum members from
     * select option VALUES, and `Pages.blocks.video.aspect_ratio` offers
     * '16:9' — a colon is not legal in a GraphQL name. Every POST to
     * /api/graphql therefore answered 500 with an empty body, logging
     * `Names must only contain [_a-zA-Z0-9] but "_16:9" does not`.
     *
     * Nothing in this application uses GraphQL: the admin runs on the local
     * API and the public surface on REST. What the endpoint DID offer was an
     * unauthenticated door onto collections whose create access is `() => true`
     * — `createLead` among them — behind `cors: '*'`.
     *
     * So this is not a workaround for the enum bug. An unauthenticated API
     * nobody uses is surface, and the fix for surface is to remove it. If
     * GraphQL is ever wanted, rename that option value (with a migration for
     * the existing enum) and flip this back in the same change.
     */
    disable: true,
  },
})
