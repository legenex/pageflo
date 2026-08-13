import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * The column defaults named templates that do not exist.
 *
 * `funnel_landing_pages.template_id` defaulted to `'bold_modern'` and
 * `funnel_quiz_deployments.template_id` to `'default'`. Neither is a template
 * id. Every landing page created without an explicit choice was therefore born
 * naming nothing, and the old resolver answered by returning the first template
 * in the list without a word, so the accident was invisible: the page rendered,
 * it just rendered as something nobody picked.
 *
 * Both are now explicit aliases in `src/lib/template-registry.ts`, so existing
 * rows keep resolving to exactly what they already render as, and the save paths
 * canonicalise on write. This migration finishes the job at the other end: a row
 * created from now on — including one created straight in `/cms`, which never
 * touches a server action — carries a real id rather than relying on the alias.
 *
 * The values are the ones the aliases already map to, so nothing changes
 * appearance anywhere:
 *
 *   bold_modern -> editorial_investigation_v2   (what TEMPLATES[0] already was)
 *   default     -> sq_quiz_first                (LEGACY_TEMPLATE_IDS, unchanged)
 *
 * EXISTING ROWS ARE NOT REWRITTEN. A default applies to inserts only, and
 * rewriting stored ids would be a content change dressed up as a schema change:
 * an operator who deliberately set `bold_modern` and an operator who never chose
 * are indistinguishable in the data, so the alias stays and does that work.
 *
 * Guarded on the tables existing, in the house style, because the six `funnel_*`
 * tables are created by `20260728_*`/`20260729_*` and an unguarded ALTER here
 * would fail a chain this migration is not responsible for.
 */
const setDefault = (table: string, value: string): string => `
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = '${table}'
        AND column_name = 'template_id'
    ) THEN
      ALTER TABLE "${table}" ALTER COLUMN "template_id" SET DEFAULT '${value}';
    END IF;
  END $$;
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setDefault('funnel_landing_pages', 'editorial_investigation_v2'))
  await db.execute(setDefault('funnel_quiz_deployments', 'sq_quiz_first'))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(setDefault('funnel_landing_pages', 'bold_modern'))
  await db.execute(setDefault('funnel_quiz_deployments', 'default'))
}
