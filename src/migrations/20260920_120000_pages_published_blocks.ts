import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Separate draft body_blocks from the public website snapshot.
 *
 * Brand website pages were auto-saving body_blocks, and the public renderer
 * read that same column, so every builder keystroke could go live.
 * published_blocks is a JSON snapshot of the last explicit publish.
 *
 * Nullable, no SQL backfill: body_blocks is a Payload blocks field stored
 * across child tables, not a jsonb column that can be copied in SQL. Null
 * means the public renderer keeps serving body_blocks, which is today's
 * behaviour. The first Publish after this lands fills the snapshot.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'pages'
      ) THEN
        ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "published_blocks" jsonb;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'pages'
      ) THEN
        ALTER TABLE "pages" DROP COLUMN IF EXISTS "published_blocks";
      END IF;
    END $$;
  `)
}
