import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Record WHEN a landing-page deployment last passed the publish gate, and WHAT
 * passed it.
 *
 * `status` says whether a deployment is serving. It cannot say whether the
 * content sitting in the row is the content that was checked, and both of the
 * states that matters for are real:
 *
 *   - a publish the preflight REFUSED still saved the operator's edits, so the
 *     row is a draft holding changes nobody approved. Without these columns the
 *     product could only say "draft", which is true and useless: it cannot say
 *     "your last publish was refused and the version that is genuinely live is
 *     the one from Tuesday";
 *   - a row that is already live keeps serving through content edits by design.
 *     Those edits reached the public page without passing a check, and nothing
 *     in the admin said so.
 *
 * `published_fingerprint` is a digest of the publish-relevant columns at the
 * moment the gate passed (see `src/lib/publish-state.ts`). It is a digest and
 * not a timestamp comparison because publishing is itself an UPDATE: `updatedAt`
 * and a `published_at` land microseconds apart, so comparing them needs a
 * tolerance that is wrong at both ends. Equality of digests has no clock in it.
 *
 * BOTH NULLABLE, so every existing row is already correct: a row with neither
 * set reads as "never published", which is the honest answer for a database
 * that has never recorded one. No backfill — inventing a publish moment for
 * eight live rows would assert that their current content passed a check it
 * never saw, which is the exact false confidence these columns exist to remove.
 * The first real publish of each row fills them in.
 *
 * Guarded on the table existing, in the house style: `funnel_lp_deployments` is
 * created by `20260729_140000_funnel_lp_public_render` and an unguarded ALTER
 * would fail a chain this migration does not own.
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
  await db.execute(
    guard(`
      ALTER TABLE "funnel_lp_deployments"
        ADD COLUMN IF NOT EXISTS "last_published_at" timestamp(3) with time zone,
        ADD COLUMN IF NOT EXISTS "published_fingerprint" varchar;
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    guard(`
      ALTER TABLE "funnel_lp_deployments"
        DROP COLUMN IF EXISTS "last_published_at",
        DROP COLUMN IF EXISTS "published_fingerprint";
    `),
  )
}
