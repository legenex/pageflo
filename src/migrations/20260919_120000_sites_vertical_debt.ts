import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

type PgResult = { rows: Array<Record<string, unknown>> }
type PgClient = { query: (sql: string) => Promise<PgResult>; release: () => void }
type Pool = { connect: () => Promise<PgClient> }

/**
 * Add `debt` to `enum_sites_vertical`.
 *
 * Discovery 2.2 requires Personal Injury (MVA, Workers' Compensation),
 * insurance, finance, debt, home services, and Other. `debt` was the missing
 * required value. Additive only. Existing rows are untouched.
 *
 * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` runs on a fresh autocommit
 * connection because Payload wraps `up()` in a transaction. Same technique as
 * 20260901_233000_sites_vertical_general.
 */

const ENUM_NAME = 'enum_sites_vertical'
const VALUE = 'debt'

const RESTORED_VALUES = [
  'mass-tort',
  'mva',
  'workers-comp',
  'personal-injury',
  'medical-malpractice',
  'class-action',
  'multi',
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

const enumExists = async (client: PgClient): Promise<boolean> => {
  const res = await client.query(`SELECT 1 FROM pg_type WHERE typname = '${ENUM_NAME}' LIMIT 1;`)
  return res.rows.length > 0
}

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  try {
    if (!(await enumExists(client))) return
    await client.query(`ALTER TYPE "public"."${ENUM_NAME}" ADD VALUE IF NOT EXISTS '${VALUE}';`)
  } finally {
    client.release()
  }
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  const restored = RESTORED_VALUES.map((v) => `'${v}'`).join(', ')
  try {
    if (!(await enumExists(client))) return
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" DROP DEFAULT;`)
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" SET DATA TYPE text;`)
    await client.query(`UPDATE "sites" SET "vertical" = 'other' WHERE "vertical" = '${VALUE}';`)
    await client.query(`DROP TYPE "public"."${ENUM_NAME}";`)
    await client.query(`CREATE TYPE "public"."${ENUM_NAME}" AS ENUM(${restored});`)
    await client.query(
      `ALTER TABLE "sites" ALTER COLUMN "vertical" SET DATA TYPE "public"."${ENUM_NAME}" USING "vertical"::"public"."${ENUM_NAME}";`,
    )
    await client.query(`ALTER TABLE "sites" ALTER COLUMN "vertical" SET DEFAULT 'multi';`)
  } finally {
    client.release()
  }
}
