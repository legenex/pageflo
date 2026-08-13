import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

// Minimal structural type for the pg.Pool we reach into via payload.db.pool.
// Avoids depending on `pg` types directly (it's a transitive dep, not a
// direct package.json entry).
type PgClient = { query: (sql: string) => Promise<unknown>; release: () => void }
type Pool = { connect: () => Promise<PgClient> }

/**
 * Adds the 'draft' value to enum_sites_status.
 *
 * Postgres forbids ALTER TYPE ... ADD VALUE inside a transaction, and
 * Payload v3 unconditionally wraps every migration up() in a transaction
 * (see @payloadcms/drizzle/dist/migrate.js). Splitting into multiple
 * migration files does not help — each file gets its own transaction
 * wrapper, and the wrapper is what Postgres rejects.
 *
 * The fix is to bypass the migration's transactional connection entirely
 * and run the DDL on a fresh autocommit connection from the underlying
 * pg pool. Each statement then commits independently before the next runs,
 * so the new enum value is visible by the time SET DEFAULT references it.
 *
 * The sibling migration 20260518_134900_site_status_draft_default is
 * idempotent and can run in a normal transaction.
 *
 * ALTER TYPE ... ADD VALUE IF NOT EXISTS makes this safe to retry against
 * environments (eg dev) where the value was already pushed by schema sync.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  try {
    await client.query(`ALTER TYPE "public"."enum_sites_status" ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';`)
  } finally {
    client.release()
  }
}

/**
 * Postgres has no DROP VALUE for an enum, so the type is rebuilt without
 * 'draft'. Same pool-bypass reason as up().
 *
 * THIS DID NOT WORK, and a rollback is the worst time to discover that. It set
 * the column to `text` while the DEFAULT was still `'active'::enum_sites_status`,
 * and postgres refuses with 42804 - "default for column cannot be cast
 * automatically". So `payload migrate:down` failed on this migration and took
 * every rollback that reached it with it. Measured by running the real command
 * against a scratch database built from the committed chain.
 *
 * The order below is the one postgres accepts: drop the default, widen to text,
 * land the rows that hold a value the narrower type does not have, rebuild the
 * type, cast back, restore the default.
 *
 * A DRAFT SITE BECOMES PAUSED, NOT ACTIVE. It has to become something - the
 * narrower type cannot hold 'draft' and the cast fails otherwise - and 'active'
 * would PUBLISH every unfinished brand on the way down. Paused serves nothing,
 * which is what a draft was already doing, and an operator can move it back.
 */
export async function down({ payload }: MigrateDownArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  try {
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "status" DROP DEFAULT;`)
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "status" SET DATA TYPE text;`)
    await client.query(`UPDATE "sites" SET "status" = 'paused' WHERE "status" = 'draft';`)
    await client.query(`DROP TYPE "public"."enum_sites_status";`)
    await client.query(`CREATE TYPE "public"."enum_sites_status" AS ENUM('active', 'paused', 'archived');`)
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "status" SET DATA TYPE "public"."enum_sites_status" USING "status"::"public"."enum_sites_status";`)
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "status" SET DEFAULT 'active';`)
  } finally {
    client.release()
  }
}
