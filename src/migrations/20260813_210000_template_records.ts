import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Templates become records.
 *
 * Landing-page "Pages" and landing-page "Templates" were two systems: rows in
 * `funnel_landing_pages` on one tab, a code catalogue on another, and a
 * deployment picker that only ever saw the rows. Quiz templates were code-only
 * with no record at all. Neither set could be disabled, cloned or deleted,
 * because you cannot act on a module export.
 *
 * This migration adds the columns those two libraries need in order to be one
 * manageable set each. It creates no data — the twelve landing-page templates
 * and twenty quiz templates are materialised by `ensureTemplateRecords` in
 * src/lib/template-records/, which derives them from the code registry and is
 * idempotent, so a template added to the library later appears without another
 * migration.
 *
 * Three things worth reading before changing this file:
 *
 * 1. `funnel_landing_pages` is REUSED rather than replaced. Every
 *    `funnel_lp_deployments.landing_page_id` already points at it, so a new
 *    collection would have orphaned the lot and been a third landing-page
 *    template system while the migration ran.
 *
 * 2. `is_enabled` is not `is_published`. Enabled means selectable for NEW
 *    deployments; published is the render gate at lp-deployment.ts. Disabling a
 *    template must not take an existing live page down, so they are separate
 *    columns and disable never touches the second one.
 *
 * 3. `funnel_quiz_templates` needs its `payload_locked_documents_rels` column
 *    in the SAME migration. Payload's lock-clearing query enumerates every
 *    collection's FK column on that table in one WHERE clause, so a missing
 *    column breaks deletes for EVERY collection, not just the new one — see
 *    20260803_120000_locked_documents_buildlog_comments_rel for the incident.
 *
 * DDL is retry-safe throughout (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT
 * EXISTS, duplicate_object guards) because these tables may already exist from
 * a dev auto-push. Every added column is nullable or defaulted, so no existing
 * row needs a backfill.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ---------------------------------------------------------------- enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_funnel_landing_pages_origin" AS ENUM('stock','clone','blank','ai','legacy');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_funnel_quiz_templates_origin" AS ENUM('stock','clone','blank');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `)

  // ------------------------------------------- landing pages become templates
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'funnel_landing_pages'
      ) THEN
        ALTER TABLE "funnel_landing_pages"
          ADD COLUMN IF NOT EXISTS "is_enabled" boolean DEFAULT true,
          ADD COLUMN IF NOT EXISTS "origin" "public"."enum_funnel_landing_pages_origin" DEFAULT 'blank',
          ADD COLUMN IF NOT EXISTS "stock_key" varchar,
          ADD COLUMN IF NOT EXISTS "archived_at" timestamp(3) with time zone,
          ADD COLUMN IF NOT EXISTS "slot_overrides" jsonb;

        CREATE INDEX IF NOT EXISTS "funnel_landing_pages_stock_key_idx"
          ON "funnel_landing_pages" ("stock_key");
        CREATE INDEX IF NOT EXISTS "funnel_landing_pages_is_enabled_idx"
          ON "funnel_landing_pages" ("is_enabled");
      END IF;
    END $$;
  `)

  /*
   * Rows that predate this migration were created before `is_enabled` existed,
   * so ADD COLUMN's default only applies to rows inserted afterwards — an
   * existing row gets the column with NULL. NULL is not false here, it is
   * "never asked", and every one of those rows was selectable yesterday. Making
   * them selectable today is the change that keeps the product working rather
   * than the one that alters it.
   */
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'funnel_landing_pages' AND column_name = 'is_enabled'
      ) THEN
        UPDATE "funnel_landing_pages" SET "is_enabled" = true WHERE "is_enabled" IS NULL;
      END IF;
    END $$;
  `)

  // ------------------------------------- LP deployments gain the two new tabs
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'funnel_lp_deployments'
      ) THEN
        ALTER TABLE "funnel_lp_deployments"
          ADD COLUMN IF NOT EXISTS "destination_overrides" jsonb,
          ADD COLUMN IF NOT EXISTS "utm" jsonb,
          ADD COLUMN IF NOT EXISTS "pixels" jsonb;
      END IF;
    END $$;
  `)

  // ------------------------------------------------ the quiz template records
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "funnel_quiz_templates" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "template_id" varchar NOT NULL,
      "renderer_key" varchar NOT NULL,
      "code" varchar,
      "blurb" varchar,
      "is_enabled" boolean DEFAULT true,
      "origin" "public"."enum_funnel_quiz_templates_origin" DEFAULT 'blank',
      "stock_key" varchar,
      "archived_at" timestamp(3) with time zone,
      "config_overrides" jsonb,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)

  /*
   * `template_id` is what a deployment stores, so two rows sharing one would
   * make the deployment's choice ambiguous and the resolver's answer an
   * ordering accident. The database is the only place that can refuse it for
   * every writer, including /cms and the REST API.
   */
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "funnel_quiz_templates_template_id_idx"
      ON "funnel_quiz_templates" ("template_id");
    CREATE INDEX IF NOT EXISTS "funnel_quiz_templates_stock_key_idx"
      ON "funnel_quiz_templates" ("stock_key");
    CREATE INDEX IF NOT EXISTS "funnel_quiz_templates_is_enabled_idx"
      ON "funnel_quiz_templates" ("is_enabled");
  `)

  // --------------------------------------------- document locking (see above)
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "funnel_quiz_templates_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_funnel_quiz_templates_fk"
        FOREIGN KEY ("funnel_quiz_templates_id") REFERENCES "public"."funnel_quiz_templates"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_funnel_quiz_templates_id_idx"
      ON "payload_locked_documents_rels" USING btree ("funnel_quiz_templates_id");
  `)
}

/**
 * The down drops only what the up created, and deliberately does NOT drop
 * `funnel_landing_pages.slot_overrides`' sibling data or the landing-page rows
 * themselves: `ensureTemplateRecords` materialises template rows that operators
 * then edit, and a down that removed them would destroy authored content to
 * undo a schema change.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_funnel_quiz_templates_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_funnel_quiz_templates_fk";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "funnel_quiz_templates_id";

    DROP TABLE IF EXISTS "funnel_quiz_templates";
    DROP TYPE IF EXISTS "public"."enum_funnel_quiz_templates_origin";

    ALTER TABLE "funnel_lp_deployments"
      DROP COLUMN IF EXISTS "destination_overrides",
      DROP COLUMN IF EXISTS "utm",
      DROP COLUMN IF EXISTS "pixels";

    DROP INDEX IF EXISTS "funnel_landing_pages_stock_key_idx";
    DROP INDEX IF EXISTS "funnel_landing_pages_is_enabled_idx";
    ALTER TABLE "funnel_landing_pages"
      DROP COLUMN IF EXISTS "is_enabled",
      DROP COLUMN IF EXISTS "origin",
      DROP COLUMN IF EXISTS "stock_key",
      DROP COLUMN IF EXISTS "archived_at",
      DROP COLUMN IF EXISTS "slot_overrides";
    DROP TYPE IF EXISTS "public"."enum_funnel_landing_pages_origin";
  `)
}
