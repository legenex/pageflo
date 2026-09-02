import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

// Minimal structural type for the pg.Pool reached through payload.db.pool.
// Same shape as 20260518_134859_site_status_draft, and for the same reason.
type PgResult = { rows: Array<Record<string, unknown>> }
type PgClient = { query: (sql: string) => Promise<PgResult>; release: () => void }
type Pool = { connect: () => Promise<PgClient> }

/**
 * Widen `enum_sites_vertical` with general, non-legal verticals.
 *
 * PageFlo is a vertical-agnostic acquisition platform, but until this migration
 * the only values a Site could carry were seven legal practice areas. The Site
 * form was therefore itself a claim that the product is a legal tool, which is
 * exactly the positioning the rebrand removes.
 *
 * ADDITIVE ONLY. Every existing value is kept and no row is rewritten, so a
 * live Site's vertical is untouched. `src/lib/verticals.ts` is the single list
 * the collection, the Sites filter and the label map all read; two lists of the
 * same enum is how a filter ends up offering a value the collection rejects.
 *
 * WHY THE POOL BYPASS. `ALTER TYPE ... ADD VALUE` is only permitted inside a
 * transaction from Postgres 12 onward, and only when the new value is not used
 * before the transaction commits. Payload v3 wraps every `up()` in a
 * transaction unconditionally, so rather than depend on the server version the
 * DDL runs on a fresh autocommit connection from the underlying pool. That is
 * the technique 20260518_134859 established here, it works on every supported
 * version, and each statement commits before the next runs. `IF NOT EXISTS`
 * makes every statement retry-safe, so a partially applied run converges.
 *
 * The DDL is deliberately NOT wrapped in a `DO $$` block: a DO block is itself
 * a transaction, which is the thing `ADD VALUE` is fussy about. Existence is
 * checked with a SELECT in JavaScript instead.
 */

const NEW_VALUES = [
  'financial-services',
  'insurance',
  'home-services',
  'health',
  'education',
  'automotive',
  'solar-energy',
  'b2b',
  'other',
] as const

/** The seven values that existed before this migration, in their original order. */
const LEGACY_VALUES = [
  'mass-tort',
  'mva',
  'workers-comp',
  'personal-injury',
  'medical-malpractice',
  'class-action',
  'multi',
] as const

const ENUM_NAME = 'enum_sites_vertical'

const enumExists = async (client: PgClient): Promise<boolean> => {
  const res = await client.query(`SELECT 1 FROM pg_type WHERE typname = '${ENUM_NAME}' LIMIT 1;`)
  return res.rows.length > 0
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  try {
    // A database built by a prefix of the chain that predates `sites.vertical`
    // has no type to widen. Guarding means this migration is safe against any
    // ancestor state rather than only against the newest one.
    if (!(await enumExists(client))) return
    for (const value of NEW_VALUES) {
      await client.query(`ALTER TYPE "public"."${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${value}';`)
    }
  } finally {
    client.release()
  }
}

/**
 * Postgres has no DROP VALUE, so the type is rebuilt without the new values.
 *
 * ROLLBACK IS LOSSY ONLY IF THE NEW VALUES WERE USED. Immediately after the
 * release that introduces them no row can hold one, because they did not exist,
 * so `down()` restores the previous state exactly. If an operator later assigns
 * a general vertical and then rolls back, that Site lands on `multi`: the
 * narrower type cannot hold the value, the cast fails otherwise, and `multi` is
 * the only value that asserts nothing about the brand. `vertical` is a label.
 * No access rule, route or renderer branches on it, so nothing serves
 * differently as a result.
 *
 * The statement order below is the one Postgres accepts, and it is the order
 * 20260518_134859's `down()` had to be repaired into: drop the default FIRST,
 * because a default still typed as the old enum makes the widening cast fail
 * with 42804, then widen to text, land the rows the narrower type cannot hold,
 * rebuild the type, cast back, restore the default.
 */
export async function down({ payload }: MigrateDownArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  const legacyList = LEGACY_VALUES.map((v) => `'${v}'`).join(', ')
  const newList = NEW_VALUES.map((v) => `'${v}'`).join(', ')
  try {
    if (!(await enumExists(client))) return
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" DROP DEFAULT;`)
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" SET DATA TYPE text;`)
    await client.query(`UPDATE "sites" SET "vertical" = 'multi' WHERE "vertical" IN (${newList});`)
    await client.query(`DROP TYPE "public"."${ENUM_NAME}";`)
    await client.query(`CREATE TYPE "public"."${ENUM_NAME}" AS ENUM(${legacyList});`)
    await client.query(
      `ALTER TABLE "sites" ALTER COLUMN "vertical" SET DATA TYPE "public"."${ENUM_NAME}" USING "vertical"::"public"."${ENUM_NAME}";`,
    )
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" SET DEFAULT 'multi';`)
  } finally {
    client.release()
  }
}
