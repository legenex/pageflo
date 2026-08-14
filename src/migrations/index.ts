/**
 * The migration chain, as a list.
 *
 * PAYLOAD DOES NOT READ THIS FILE. `readMigrationFiles` reads the migration
 * DIRECTORY, sorted by filename, and explicitly skips `index.ts` - so a file
 * dropped into `src/migrations/` runs whether or not it appears below, and a
 * file removed from below still runs. `CLAUDE.md` says the opposite ("that array
 * is what runs, not the directory listing"), and following that would let
 * somebody "disable" a migration by deleting three lines here and be wrong.
 *
 * It is kept, and it is not decoration: it is the one place the intended chain
 * is written down in order, and `scripts/test-release-ordering.mts` asserts that
 * it matches the directory exactly. A list that agrees with reality is a
 * cross-check; a list that is merely believed to be authoritative is a trap.
 */

import * as migration_20260513_221103_init from './20260513_221103_init';
import * as migration_20260518_134859_site_status_draft from './20260518_134859_site_status_draft';
import * as migration_20260518_134900_site_status_draft_default from './20260518_134900_site_status_draft_default';
import * as migration_20260525_214717_domains_pool_and_funnel_domain from './20260525_214717_domains_pool_and_funnel_domain';
import * as migration_20260528_180000_add_media_collection from './20260528_180000_add_media_collection';
import * as migration_20260528_200000_lead_form_form_fields from './20260528_200000_lead_form_form_fields';
import * as migration_20260528_220000_pages_hidden_blocks from './20260528_220000_pages_hidden_blocks';
import * as migration_20260529_000000_pages_block_meta from './20260529_000000_pages_block_meta';
import * as migration_20260529_020000_pages_scheduled_publish from './20260529_020000_pages_scheduled_publish';
import * as migration_20260529_040000_new_block_types from './20260529_040000_new_block_types';
import * as migration_20260529_060000_sites_global_blocks from './20260529_060000_sites_global_blocks';
import * as migration_20260530_000000_locked_documents_media_rel from './20260530_000000_locked_documents_media_rel';
import * as migration_20260728_120000_funnel_quizzes_archive from './20260728_120000_funnel_quizzes_archive';
import * as migration_20260728_180000_funnel_quiz_public_render from './20260728_180000_funnel_quiz_public_render';
import * as migration_20260729_090000_destinations_and_brand_drift from './20260729_090000_destinations_and_brand_drift';
import * as migration_20260729_140000_funnel_lp_public_render from './20260729_140000_funnel_lp_public_render';
import * as migration_20260729_170000_brand_token_contract from './20260729_170000_brand_token_contract';
import * as migration_20260729_200000_drop_deployment_theme from './20260729_200000_drop_deployment_theme';
import * as migration_20260729_230000_buildlog_comments from './20260729_230000_buildlog_comments';
import * as migration_20260730_120000_funnel_advertorial_tables from './20260730_120000_funnel_advertorial_tables';
import * as migration_20260803_120000_locked_documents_buildlog_comments_rel from './20260803_120000_locked_documents_buildlog_comments_rel';
import * as migration_20260806_120000_quiz_deployment_progress_form from './20260806_120000_quiz_deployment_progress_form'
import * as migration_20260813_090000_canonical_template_defaults from './20260813_090000_canonical_template_defaults'
import * as migration_20260813_120000_lp_deployment_content_overrides from './20260813_120000_lp_deployment_content_overrides'
import * as migration_20260813_180000_lp_deployment_embedded_quiz from './20260813_180000_lp_deployment_embedded_quiz'
import * as migration_20260813_210000_locked_documents_funnel_rels from './20260813_210000_locked_documents_funnel_rels'
import * as migration_20260813_213000_integration_config_sample_markers from './20260813_213000_integration_config_sample_markers'
import * as migration_20260813_220000_template_records from './20260813_220000_template_records'
import * as migration_20260813_230000_audit_log_user_nullable from './20260813_230000_audit_log_user_nullable'
import * as migration_20260814_120000_leads_idempotency_key from './20260814_120000_leads_idempotency_key'
import * as migration_20260814_160000_lp_deployment_publish_state from './20260814_160000_lp_deployment_publish_state'

export const migrations = [
  {
    up: migration_20260513_221103_init.up,
    down: migration_20260513_221103_init.down,
    name: '20260513_221103_init',
  },
  {
    up: migration_20260518_134859_site_status_draft.up,
    down: migration_20260518_134859_site_status_draft.down,
    name: '20260518_134859_site_status_draft',
  },
  {
    up: migration_20260518_134900_site_status_draft_default.up,
    down: migration_20260518_134900_site_status_draft_default.down,
    name: '20260518_134900_site_status_draft_default',
  },
  {
    up: migration_20260525_214717_domains_pool_and_funnel_domain.up,
    down: migration_20260525_214717_domains_pool_and_funnel_domain.down,
    name: '20260525_214717_domains_pool_and_funnel_domain'
  },
  {
    up: migration_20260528_180000_add_media_collection.up,
    down: migration_20260528_180000_add_media_collection.down,
    name: '20260528_180000_add_media_collection',
  },
  {
    up: migration_20260528_200000_lead_form_form_fields.up,
    down: migration_20260528_200000_lead_form_form_fields.down,
    name: '20260528_200000_lead_form_form_fields',
  },
  {
    up: migration_20260528_220000_pages_hidden_blocks.up,
    down: migration_20260528_220000_pages_hidden_blocks.down,
    name: '20260528_220000_pages_hidden_blocks',
  },
  {
    up: migration_20260529_000000_pages_block_meta.up,
    down: migration_20260529_000000_pages_block_meta.down,
    name: '20260529_000000_pages_block_meta',
  },
  {
    up: migration_20260529_020000_pages_scheduled_publish.up,
    down: migration_20260529_020000_pages_scheduled_publish.down,
    name: '20260529_020000_pages_scheduled_publish',
  },
  {
    up: migration_20260529_040000_new_block_types.up,
    down: migration_20260529_040000_new_block_types.down,
    name: '20260529_040000_new_block_types',
  },
  {
    up: migration_20260529_060000_sites_global_blocks.up,
    down: migration_20260529_060000_sites_global_blocks.down,
    name: '20260529_060000_sites_global_blocks',
  },
  {
    up: migration_20260530_000000_locked_documents_media_rel.up,
    down: migration_20260530_000000_locked_documents_media_rel.down,
    name: '20260530_000000_locked_documents_media_rel',
  },
  {
    up: migration_20260728_120000_funnel_quizzes_archive.up,
    down: migration_20260728_120000_funnel_quizzes_archive.down,
    name: '20260728_120000_funnel_quizzes_archive',
  },
  {
    up: migration_20260728_180000_funnel_quiz_public_render.up,
    down: migration_20260728_180000_funnel_quiz_public_render.down,
    name: '20260728_180000_funnel_quiz_public_render',
  },
  {
    up: migration_20260729_090000_destinations_and_brand_drift.up,
    down: migration_20260729_090000_destinations_and_brand_drift.down,
    name: '20260729_090000_destinations_and_brand_drift',
  },
  {
    up: migration_20260729_140000_funnel_lp_public_render.up,
    down: migration_20260729_140000_funnel_lp_public_render.down,
    name: '20260729_140000_funnel_lp_public_render',
  },
  {
    up: migration_20260729_170000_brand_token_contract.up,
    down: migration_20260729_170000_brand_token_contract.down,
    name: '20260729_170000_brand_token_contract',
  },
  {
    up: migration_20260729_200000_drop_deployment_theme.up,
    down: migration_20260729_200000_drop_deployment_theme.down,
    name: '20260729_200000_drop_deployment_theme',
  },
  {
    up: migration_20260729_230000_buildlog_comments.up,
    down: migration_20260729_230000_buildlog_comments.down,
    name: '20260729_230000_buildlog_comments',
  },
  {
    up: migration_20260730_120000_funnel_advertorial_tables.up,
    down: migration_20260730_120000_funnel_advertorial_tables.down,
    name: '20260730_120000_funnel_advertorial_tables',
  },
  {
    up: migration_20260803_120000_locked_documents_buildlog_comments_rel.up,
    down: migration_20260803_120000_locked_documents_buildlog_comments_rel.down,
    name: '20260803_120000_locked_documents_buildlog_comments_rel',
  },
  {
    up: migration_20260806_120000_quiz_deployment_progress_form.up,
    down: migration_20260806_120000_quiz_deployment_progress_form.down,
    name: '20260806_120000_quiz_deployment_progress_form',
  },
  {
    up: migration_20260813_090000_canonical_template_defaults.up,
    down: migration_20260813_090000_canonical_template_defaults.down,
    name: '20260813_090000_canonical_template_defaults',
  },
  {
    up: migration_20260813_120000_lp_deployment_content_overrides.up,
    down: migration_20260813_120000_lp_deployment_content_overrides.down,
    name: '20260813_120000_lp_deployment_content_overrides',
  },
  {
    up: migration_20260813_180000_lp_deployment_embedded_quiz.up,
    down: migration_20260813_180000_lp_deployment_embedded_quiz.down,
    name: '20260813_180000_lp_deployment_embedded_quiz',
  },
  {
    up: migration_20260813_210000_locked_documents_funnel_rels.up,
    down: migration_20260813_210000_locked_documents_funnel_rels.down,
    name: '20260813_210000_locked_documents_funnel_rels',
  },
  {
    up: migration_20260813_213000_integration_config_sample_markers.up,
    down: migration_20260813_213000_integration_config_sample_markers.down,
    name: '20260813_213000_integration_config_sample_markers',
  },
  {
    /*
     * Renamed from 20260813_210000_template_records at integration time: the
     * release branch already used the 210000 prefix, and two files sharing an
     * ordering prefix would make the directory sort (which IS the run order)
     * an alphabetical accident. The migration is idempotent throughout, so a
     * database that already recorded it under the old name converges cleanly
     * when the renamed file re-runs.
     */
    up: migration_20260813_220000_template_records.up,
    down: migration_20260813_220000_template_records.down,
    name: '20260813_220000_template_records',
  },
  {
    up: migration_20260813_230000_audit_log_user_nullable.up,
    down: migration_20260813_230000_audit_log_user_nullable.down,
    name: '20260813_230000_audit_log_user_nullable',
  },
  {
    up: migration_20260814_120000_leads_idempotency_key.up,
    down: migration_20260814_120000_leads_idempotency_key.down,
    name: '20260814_120000_leads_idempotency_key',
  },
  {
    up: migration_20260814_160000_lp_deployment_publish_state.up,
    down: migration_20260814_160000_lp_deployment_publish_state.down,
    name: '20260814_160000_lp_deployment_publish_state',
  },
];
