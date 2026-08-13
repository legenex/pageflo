import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * A landing-page deployment gets its own copy.
 *
 * Until now the twelve ported templates were a single HTML string each, so two
 * deployments of one template under two brands said exactly the same words and
 * "reskin a deployment" could only mean "change its colours". The slot contract
 * (`src/lib/lp-slots/`) cuts named holes in that markup; this column is where a
 * deployment's own wording for those holes lives.
 *
 * OVERRIDES ONLY, never a copy of the template. A slot with no entry here
 * renders the stock template's own words, which means a correction to a template
 * reaches every deployment of it at once and nothing has to be migrated when the
 * design changes. It also means this column is usually small: a deployment that
 * changes a headline and a CTA stores two strings.
 *
 * Nullable jsonb, so every existing row is already correct and renders exactly
 * as it does today. Guarded on the table existing, in the house style, because
 * `funnel_lp_deployments` is created by `20260729_140000_funnel_lp_public_render`
 * and an unguarded ALTER would fail a chain this migration does not own.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'funnel_lp_deployments'
      ) THEN
        ALTER TABLE "funnel_lp_deployments" ADD COLUMN IF NOT EXISTS "content_overrides" jsonb;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'funnel_lp_deployments'
      ) THEN
        ALTER TABLE "funnel_lp_deployments" DROP COLUMN IF EXISTS "content_overrides";
      END IF;
    END $$;
  `)
}
