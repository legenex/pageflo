import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `leads.client_submission_id` — a client-minted idempotency key.
 *
 * The lead form retries a failed submit, and releases its in-memory guard on
 * total failure so a later endpoint in the flow can try again. Neither is
 * wrong on its own, but the server had no idempotency: `runLeadPipeline`
 * always INSERTs, and `event_id` is minted fresh per request (it is the
 * Meta/TikTok pixel-CAPI dedup id, not a submission key). So a submit whose
 * WRITE committed but whose RESPONSE was lost — a mobile network blip at the
 * worst moment — came back as a failure, retried, and created a SECOND lead:
 * a duplicate row, a second CAPI conversion, and a second webhook delivered to
 * a buyer. Reviewer E's F-E1.
 *
 * The fix is a stable key the client mints once per completed quiz and sends
 * on every attempt; the pipeline returns the existing lead for a key it has
 * already seen instead of creating another. This column stores it. The partial
 * unique index makes the guarantee the database's rather than the read's, so
 * two genuinely concurrent retries cannot both insert — the loser gets a
 * unique violation the pipeline turns back into the existing lead.
 *
 * Nullable and unenforced when NULL: every existing row, and every caller that
 * does not send a key (the test-capture harness, any legacy hardcoded form),
 * is untouched — they simply do not participate in dedupe, exactly as before.
 * Retry-safe DDL so a dev auto-push that already added the column converges.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "client_submission_id" varchar;

    CREATE UNIQUE INDEX IF NOT EXISTS "leads_client_submission_id_site_key"
      ON "leads" ("site_id", "client_submission_id")
      WHERE "client_submission_id" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "leads_client_submission_id_site_key";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "client_submission_id";
  `)
}
