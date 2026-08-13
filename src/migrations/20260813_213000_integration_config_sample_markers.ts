import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the two sample-seeding markers to `integration_config`.
 *
 * `IntegrationConfig` declares `funnel_samples_seeded` and
 * `funnel_advertorial_samples_seeded`; no committed migration creates either.
 * They exist wherever a dev auto-push has run and nowhere else — the same drift
 * as the funnel rels columns and, like those, absent from F001's list because
 * nobody had read the global against a migration-only database.
 *
 * The blast radius is a boot, not a feature. A global's SELECT enumerates every
 * declared column, so reading `integration-config` throws outright — and it is
 * read by the admin shell and by `ensureFunnelSamples`, which runs on every
 * landing-page and quiz builder page load. A fresh deploy therefore has an admin
 * that 500s rather than an admin missing two checkboxes.
 *
 * `NOT NULL DEFAULT false` is safe on an existing row here in a way it usually
 * is not: the global has at most one row, the column is new, and the default
 * fills it in the same statement. `false` is also the correct value for an
 * install that has already seeded — the marker means "do not seed again", and
 * the seeder is idempotent, so the worst case of a wrong `false` is one no-op
 * pass rather than duplicate content.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "integration_config"
      ADD COLUMN IF NOT EXISTS "funnel_samples_seeded" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "funnel_advertorial_samples_seeded" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "integration_config"
      DROP COLUMN IF EXISTS "funnel_samples_seeded",
      DROP COLUMN IF EXISTS "funnel_advertorial_samples_seeded";
  `)
}
