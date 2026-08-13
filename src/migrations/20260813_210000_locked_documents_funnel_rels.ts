import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the six `funnel_*_id` FK columns to `payload_locked_documents_rels`.
 *
 * THE THIRD TIME THIS EXACT OMISSION HAS SHIPPED. `20260530_000000` fixed it for
 * Media and `20260803_120000` for BuildLogComments, and both carry a comment
 * saying a new collection needs its rels column in the same migration. The six
 * funnel collections were added by `20260728_120000` through `20260730_120000`
 * and none of them did.
 *
 * WHY NOBODY NOTICED FOR THREE WEEKS. Payload's postgres adapter auto-pushes the
 * schema outside production, so a development database grows these columns the
 * moment the collections load. Production got them the same way, from the dev
 * push that predates the migration discipline. The columns are therefore present
 * everywhere anybody has looked and absent from every database the committed
 * migrations build, which is the definition of the drift F001 named — and this
 * part of it was never in F001's list.
 *
 * WHAT IT COSTS ON A FRESH DATABASE. Far more than the collections involved.
 * Payload clears a document's locks as part of DELETING it, and that query
 * enumerates EVERY collection's FK column on this table in one WHERE clause, so
 * one missing column makes a delete of ANY document in ANY collection fail —
 * and reading `payload-locked-documents` at all throws, which the admin does.
 * `scripts/test-fresh-bootstrap.mts` found it by reading every declared
 * collection against a migration-only database, which is what a boot does.
 *
 * DDL is idempotent throughout — `IF NOT EXISTS` on the columns and indexes, a
 * `duplicate_object` guard on each constraint — so it converges whether or not a
 * dev push already added them. That matters here specifically: this migration
 * will run against production databases that already have all six columns, and
 * it must be a no-op there rather than an error.
 *
 * `ON DELETE cascade` matches every other FK on this table: removing the
 * document removes any lock that referenced it.
 */

const TABLES = [
  'funnel_landing_pages',
  'funnel_lp_deployments',
  'funnel_quizzes',
  'funnel_quiz_deployments',
  'funnel_advertorials',
  'funnel_advertorial_deployments',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    // Constraint and index names follow the pattern Payload's own generator
    // uses, so a future `migrate:create` diff does not propose recreating them.
    await db.execute(sql.raw(`
      ALTER TABLE "payload_locked_documents_rels"
        ADD COLUMN IF NOT EXISTS "${table}_id" integer;

      DO $$ BEGIN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_${table}_fk"
          FOREIGN KEY ("${table}_id") REFERENCES "public"."${table}"("id")
          ON DELETE cascade ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_${table}_id_idx"
        ON "payload_locked_documents_rels" USING btree ("${table}_id");
    `))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const table of TABLES) {
    await db.execute(sql.raw(`
      DROP INDEX IF EXISTS "payload_locked_documents_rels_${table}_id_idx";
      ALTER TABLE "payload_locked_documents_rels"
        DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_${table}_fk";
      ALTER TABLE "payload_locked_documents_rels"
        DROP COLUMN IF EXISTS "${table}_id";
    `))
  }
}
