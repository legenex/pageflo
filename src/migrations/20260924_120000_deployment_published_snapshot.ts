import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * Pin live funnel deployments to the master content that passed publish.
 *
 * Before this, public resolvers loaded the current master by id, so a quiz
 * graph edit, an LP slot edit, or a published advertorial save mutated every
 * live URL immediately. Decision 9 requires master edits to stay off live
 * until explicit republish.
 *
 * `published_snapshot` is the captured master (and, for LP, the bound quiz
 * graph) at the last successful go-live or republish. Resume of a paused
 * deployment keeps the pin. Nullable so drafts are honest, and live rows are
 * backfilled from current HEAD so the first request after migrate does not
 * change what visitors already see — it only stops the NEXT master edit from
 * leaking.
 *
 * Quiz and advertorial deployments also gain `last_published_at` and
 * `published_fingerprint`, matching the LP columns from
 * `20260814_160000_lp_deployment_publish_state`.
 */

const guard = (table: string, sql: string): string => `
  DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = '${table}'
    ) THEN
      ${sql}
    END IF;
  END $$;
`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    guard(
      'funnel_quiz_deployments',
      `
      ALTER TABLE "funnel_quiz_deployments"
        ADD COLUMN IF NOT EXISTS "published_snapshot" jsonb,
        ADD COLUMN IF NOT EXISTS "last_published_at" timestamp(3) with time zone,
        ADD COLUMN IF NOT EXISTS "published_fingerprint" varchar;
    `,
    ),
  )
  await db.execute(
    guard(
      'funnel_lp_deployments',
      `
      ALTER TABLE "funnel_lp_deployments"
        ADD COLUMN IF NOT EXISTS "published_snapshot" jsonb;
    `,
    ),
  )
  await db.execute(
    guard(
      'funnel_advertorial_deployments',
      `
      ALTER TABLE "funnel_advertorial_deployments"
        ADD COLUMN IF NOT EXISTS "published_snapshot" jsonb,
        ADD COLUMN IF NOT EXISTS "last_published_at" timestamp(3) with time zone,
        ADD COLUMN IF NOT EXISTS "published_fingerprint" varchar;
    `,
    ),
  )

  // Pin currently-live rows to HEAD so existing URLs do not change at migrate.
  // Each backfill is its own exception block: a missing optional column must
  // not roll back the ALTER. Rows left without a pin fall through to HEAD
  // until the next explicit publish.
  const backfill = (sql: string): string => `
    DO $$ BEGIN
      BEGIN
        ${sql}
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'published_snapshot backfill skipped: %', SQLERRM;
      END;
    END $$;
  `

  await db.execute(
    backfill(`
      UPDATE "funnel_quiz_deployments" AS d
      SET "published_snapshot" = jsonb_build_object(
        'kind', 'quiz',
        'capturedAt', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text,
        'master', jsonb_build_object(
          'id', q.id::text,
          'name', COALESCE(q.name, ''),
          'slug', COALESCE(q.slug, ''),
          'tiers', COALESCE(q.tiers, '[]'::jsonb),
          'steps', COALESCE(q.steps, '[]'::jsonb),
          'nodes', COALESCE(q.nodes, '[]'::jsonb),
          'customFields', COALESCE(q.custom_fields, '[]'::jsonb)
        ),
        'templateId', COALESCE(d.template_id, ''),
        'progressForm', d.progress_form
      )
      FROM "funnel_quizzes" AS q
      WHERE d.quiz_id = q.id
        AND d.status::text = 'live'
        AND d.published_snapshot IS NULL;
    `),
  )

  await db.execute(
    backfill(`
      UPDATE "funnel_lp_deployments" AS d
      SET "published_snapshot" = jsonb_build_object(
        'kind', 'lp',
        'capturedAt', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text,
        'master', jsonb_build_object(
          'id', lp.id::text,
          'name', COALESCE(lp.name, ''),
          'slug', COALESCE(lp.slug, ''),
          'templateId', COALESCE(lp.template_id, ''),
          'angle', COALESCE(lp.angle::text, 'pain'),
          'sections', COALESCE(lp.sections, '[]'::jsonb),
          'slotOverrides', COALESCE(lp.slot_overrides, '{}'::jsonb)
        ),
        'quizId', COALESCE(d.quiz_id::text, ''),
        'embeddedQuizTemplateId', COALESCE(d.embedded_quiz_template_id, ''),
        'embeddedProgressForm', d.embedded_progress_form,
        'quizDeploymentId', COALESCE(d.quiz_deployment_id, ''),
        'quizMaster', CASE
          WHEN q.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', q.id::text,
            'name', COALESCE(q.name, ''),
            'slug', COALESCE(q.slug, ''),
            'tiers', COALESCE(q.tiers, '[]'::jsonb),
            'steps', COALESCE(q.steps, '[]'::jsonb),
            'nodes', COALESCE(q.nodes, '[]'::jsonb),
            'customFields', COALESCE(q.custom_fields, '[]'::jsonb)
          )
        END
      )
      FROM "funnel_landing_pages" AS lp
      LEFT JOIN "funnel_quizzes" AS q ON q.id = d.quiz_id
      WHERE d.landing_page_id = lp.id
        AND d.status::text = 'live'
        AND d.published_snapshot IS NULL;
    `),
  )

  await db.execute(
    backfill(`
      UPDATE "funnel_advertorial_deployments" AS d
      SET "published_snapshot" = jsonb_build_object(
        'kind', 'advertorial',
        'capturedAt', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text,
        'master', jsonb_build_object(
          'id', a.id::text,
          'title', COALESCE(a.title, ''),
          'slug', COALESCE(a.slug, ''),
          'templateId', COALESCE(a.template_id, 'personal_story'),
          'sections', COALESCE(a.sections, '[]'::jsonb)
        ),
        'ctaMode', COALESCE(d.cta_mode::text, 'button'),
        'quizDeploymentId', COALESCE(d.quiz_deployment_id, '')
      )
      FROM "funnel_advertorials" AS a
      WHERE d.advertorial_id = a.id
        AND d.status::text = 'live'
        AND d.published_snapshot IS NULL;
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    guard(
      'funnel_quiz_deployments',
      `
      ALTER TABLE "funnel_quiz_deployments"
        DROP COLUMN IF EXISTS "published_snapshot",
        DROP COLUMN IF EXISTS "last_published_at",
        DROP COLUMN IF EXISTS "published_fingerprint";
    `,
    ),
  )
  await db.execute(
    guard(
      'funnel_lp_deployments',
      `
      ALTER TABLE "funnel_lp_deployments"
        DROP COLUMN IF EXISTS "published_snapshot";
    `,
    ),
  )
  await db.execute(
    guard(
      'funnel_advertorial_deployments',
      `
      ALTER TABLE "funnel_advertorial_deployments"
        DROP COLUMN IF EXISTS "published_snapshot",
        DROP COLUMN IF EXISTS "last_published_at",
        DROP COLUMN IF EXISTS "published_fingerprint";
    `,
    ),
  )
}
