import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Point the outbound-email sender-name DEFAULT at the product's current name.
 *
 * `IntegrationConfig.smtp.from_name` shipped with the column default
 * `'Legenex LegalOS'`, written by `20260513_221103_init`. The collection config
 * now declares `PageFlo`, so without this the committed schema and the database
 * disagree, and `pnpm test:release` exists to catch exactly that.
 *
 * DEFAULT ONLY. No UPDATE. The existing global row holds whatever the operator
 * configured, and a migration that rewrote it would silently change the From
 * name on every outbound email in production, which is a production data change
 * and a human gate. If that row still holds the old default, an operator changes
 * it in Settings, Integrations, where it is an editable field. This migration
 * only decides what a NEW installation starts with.
 *
 * Guarded on the table and column existing so it is safe on a database built by
 * any prefix of the chain, and idempotent because setting a default twice is a
 * no-op.
 */
const setDefault = (value: string): string => `
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'integration_config' AND column_name = 'smtp_from_name'
    ) THEN
      ALTER TABLE "integration_config" ALTER COLUMN "smtp_from_name" SET DEFAULT '${value}';
    END IF;
  END $$;
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setDefault('PageFlo'))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(setDefault('Legenex LegalOS'))
}
