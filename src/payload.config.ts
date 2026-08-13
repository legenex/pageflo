import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

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

export default buildConfig({
  // Raw Payload admin lives at /cms. The custom branded dashboard owns /admin.
  routes: {
    admin: '/cms',
  },
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' — Legenex LegalOS',
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
    // Production uses real migration files in src/migrations/. They're applied by
    // scripts/deploy.sh + scripts/first-time-setup.sh via `pnpm payload migrate`.
    // Dev still auto-pushes the schema (Payload's default when NODE_ENV !== production).
    // To regenerate after schema changes: pnpm payload migrate:create <name>
  }),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  sharp,
  cors: '*',
  // CSRF allowlist: server actions send an Origin header that must match one of these,
  // or Payload's cookie auth strategy returns user=null (manifests as "unauthenticated"
  // errors on server actions). Always include localhost dev origins; include the
  // configured server URL in every env. LEGALOS_EXTRA_ORIGINS lets prod add aliases
  // (e.g., apex + www) without code changes.
  csrf: [
    ...(process.env.NEXT_PUBLIC_SERVER_URL ? [process.env.NEXT_PUBLIC_SERVER_URL] : []),
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : []),
    ...(process.env.LEGALOS_EXTRA_ORIGINS
      ? process.env.LEGALOS_EXTRA_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : []),
  ],
  upload: {
    limits: { fileSize: 10 * 1024 * 1024 },
  },
  graphQL: {
    disable: false,
  },
})
