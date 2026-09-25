import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Lead consent evidence and a persisted delivery state.
 *
 * `leads.consent_*` records the affirmative consent a visitor gave: the exact
 * disclosure text they saw, that they accepted it, when, and which Brand,
 * funnel and deployment collected it. Until now consent copy was printed under
 * the form with no act attached and nothing about it reached the Lead.
 *
 * `leads.delivery_state` is a reading of `delivery_log` (queued, processing,
 * delivered, failed, no-destination and so on), stored so the console can
 * filter on it. The log stays the record; this is an index over it.
 *
 * Additive and nullable on purpose. Every existing Lead keeps NULL in every
 * new column and is displayed as "consent not recorded" / "delivery state
 * derived from its log". Nothing is backfilled: inventing consent for a row
 * that never captured it would be false evidence. Retry-safe DDL.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_accepted" boolean;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_disclosure_text" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_accepted_at" timestamp(3) with time zone;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_client_accepted_at" timestamp(3) with time zone;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_method" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_site_slug" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_site_name" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_host" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_funnel_type" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_funnel_id" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_funnel_path" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_source_deployment_id" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "delivery_state" varchar;
    CREATE INDEX IF NOT EXISTS "leads_delivery_state_idx" ON "leads" USING btree ("delivery_state");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "leads_delivery_state_idx";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "delivery_state";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_deployment_id";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_funnel_path";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_funnel_id";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_funnel_type";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_host";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_site_name";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_source_site_slug";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_method";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_client_accepted_at";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_accepted_at";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_disclosure_text";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "consent_accepted";
  `)
}
