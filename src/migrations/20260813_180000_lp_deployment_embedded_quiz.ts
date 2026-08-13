import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * A landing page can embed a quiz FLOW, not only a standalone deployment.
 *
 * Until now `funnel_lp_deployments.quiz_deployment_id` pointed at a quiz
 * DEPLOYMENT, so putting a quiz inside a landing page first required creating a
 * separate standalone quiz page — which then existed at its own path, was
 * crawlable, competed for a URL, and had to be kept in step with the landing
 * page that borrowed it. Two records for one decision.
 *
 * `quiz` names the flow directly and `embedded_quiz_template_id` chooses the
 * skin, which is the composition the product is actually made of: LP template ×
 * brand × flow × quiz skin × content × config.
 *
 * MIGRATION IS BY FALLBACK, NOT BY BACKFILL. Existing rows keep
 * `quiz_deployment_id` and the resolver reads it whenever `quiz` is null, so
 * nothing changes for a live page and nothing has to be rewritten. Copying the
 * deployment's quiz into the new column would look tidier and would silently
 * drop the deployment's OWN template, progress form and destination overrides,
 * which are the reason somebody pointed at a deployment rather than a flow.
 *
 * Guarded on the table existing, in the house style.
 */
const guard = (sql: string): string => `
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'funnel_lp_deployments'
    ) THEN
      ${sql}
    END IF;
  END $$;
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(guard(`
    ALTER TABLE "funnel_lp_deployments"
      ADD COLUMN IF NOT EXISTS "quiz_id" integer,
      ADD COLUMN IF NOT EXISTS "embedded_quiz_template_id" varchar,
      ADD COLUMN IF NOT EXISTS "embedded_progress_form" varchar;
  `))
  // The FK is added separately and tolerantly: on a database where
  // funnel_quizzes is absent the column is still useful and the constraint is
  // the part that cannot be created.
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'funnel_quizzes')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'funnel_lp_deployments' AND column_name = 'quiz_id')
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnel_lp_deployments_quiz_id_funnel_quizzes_id_fk')
      THEN
        ALTER TABLE "funnel_lp_deployments"
          ADD CONSTRAINT "funnel_lp_deployments_quiz_id_funnel_quizzes_id_fk"
          FOREIGN KEY ("quiz_id") REFERENCES "funnel_quizzes"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `)
  await db.execute(guard(`
    CREATE INDEX IF NOT EXISTS "funnel_lp_deployments_quiz_idx" ON "funnel_lp_deployments" ("quiz_id");
  `))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(guard(`
    ALTER TABLE "funnel_lp_deployments"
      DROP COLUMN IF EXISTS "quiz_id",
      DROP COLUMN IF EXISTS "embedded_quiz_template_id",
      DROP COLUMN IF EXISTS "embedded_progress_form";
  `))
}
