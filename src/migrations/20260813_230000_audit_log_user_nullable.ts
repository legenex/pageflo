import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `audit_log.user_id` becomes nullable, matching the FK it always had.
 *
 * The column was declared NOT NULL while its foreign key is
 * `ON DELETE SET NULL` - a contradiction the database enforces at the worst
 * moment: deleting ANY user with audit history aborts, because the SET NULL
 * the FK wants to perform violates the NOT NULL the column declares. Since
 * the audit hooks write a row for every authenticated mutation, that made
 * every user who had ever done anything undeletable. Found by the
 * tenant-isolation suite's teardown, which leaked its probe users on every
 * run.
 *
 * Attribution on this collection is best-effort by design (CLAUDE.md says so
 * of `site`; it is equally true of `user`): the audit ROW is the record, and
 * it must outlive its author.
 *
 * DROP NOT NULL is a no-op on an already-nullable column, so this is
 * retry-safe and converges on databases where a dev auto-push already fixed
 * it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "audit_log" ALTER COLUMN "user_id" DROP NOT NULL;
  `)
}

/**
 * The down restores NOT NULL only when no row would violate it. Rows whose
 * author has since been deleted carry NULL legitimately; a down that deleted
 * them to satisfy a constraint would destroy audit history to undo a schema
 * change, and a down that failed on them would strand the migration ledger.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM "audit_log" WHERE "user_id" IS NULL) THEN
        ALTER TABLE "audit_log" ALTER COLUMN "user_id" SET NOT NULL;
      ELSE
        RAISE NOTICE 'audit_log.user_id keeps NULL rows (deleted authors); NOT NULL not restored';
      END IF;
    END $$;
  `)
}
