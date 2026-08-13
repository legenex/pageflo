# SCOUT 1 — Branch and Migration Truth

Worktrees: RELEASE = /home/user/wt-release (`origin/claude/legalos-release-work-ea1y9i`, 8 commits over main), UI/MODEL = /home/user/wt-uimodel (`origin/claude/landing-pages-ui-model-fix-aqwwoy`, 12 commits over main). Common base main = 3b4748d. All refs below verified by reading the files in the worktrees and `git -C /home/user/legalos show main:...`.

---

## 1. Migration inventory

**Main's chain**: 25 migration modules, ending at `20260813_180000_lp_deployment_embedded_quiz`. (`src/migrations/` also holds 3 `.json` drizzle snapshots for the first three migrations; those are not executed.) `src/migrations/index.ts` on main lists exactly those 25, ending at line ~155 with the `20260813_180000` entry.

**RELEASE adds 2 files + edits 2** (all in commit 097768a "release: a fresh database did not produce a working app, and three docs disagreed"):
- NEW `src/migrations/20260813_210000_locked_documents_funnel_rels.ts` (81 lines)
- NEW `src/migrations/20260813_213000_integration_config_sample_markers.ts` (40 lines)
- EDIT `src/migrations/20260518_134859_site_status_draft.ts` — **down() only**: the old down set the column type while the enum-typed DEFAULT still stood, so postgres 42804 aborted every `migrate:down` that reached it. New order: DROP DEFAULT → widen to text → `UPDATE sites SET status='paused' WHERE status='draft'` → rebuild enum → cast back → restore default (lines 39–70). up() untouched. **Merge-safe: ui/model does not touch this file — take release's version.**
- EDIT `src/migrations/index.ts` — adds a 16-line header (lines 1–16) stating Payload does NOT read this file (see §5), plus imports/entries for its two migrations.

**UI/MODEL adds 1 file** (commit 14ffa52 "templates become records", the only ui/model commit touching `src/migrations/`):
- NEW `src/migrations/20260813_210000_template_records.ts` (196 lines)
- EDIT `src/migrations/index.ts` — appends its one import + entry after `20260813_180000`.

Merged chain = 28 migration modules.

---

## 2. THE COLLISION — full DDL, overlap, idempotency, order

### 2a. Release `20260813_210000_locked_documents_funnel_rels.ts`
For each of 6 tables (`funnel_landing_pages`, `funnel_lp_deployments`, `funnel_quizzes`, `funnel_quiz_deployments`, `funnel_advertorials`, `funnel_advertorial_deployments`; TABLES const lines 38–45), in a loop (up() lines 47–68):
1. `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "<t>_id" integer` (L52–53)
2. `ADD CONSTRAINT "payload_locked_documents_rels_<t>_fk" FOREIGN KEY ("<t>_id") REFERENCES "public"."<t>"("id") ON DELETE cascade` inside `DO $$ ... EXCEPTION WHEN duplicate_object THEN null` (L55–62)
3. `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_<t>_id_idx"` (L64–65)

down() (L70–80): DROP INDEX IF EXISTS / DROP CONSTRAINT IF EXISTS / DROP COLUMN IF EXISTS, reversed.
**Idempotent: yes, fully** (explicitly designed to no-op on prod where dev auto-push already created the columns; header L28–32). **Dependencies**: `payload_locked_documents_rels` (init migration) and the 6 funnel tables — all created on main by `20260728_180000_funnel_quiz_public_render.ts` L51/L90, `20260729_140000_funnel_lp_public_render.ts` L32/L61, `20260730_120000_funnel_advertorial_tables.ts` L41/L71. Satisfied by any chain position after those.

### 2b. Release `20260813_213000_integration_config_sample_markers.ts`
up() (L25–31): one statement — `ALTER TABLE "integration_config" ADD COLUMN IF NOT EXISTS "funnel_samples_seeded" boolean DEFAULT false, ADD COLUMN IF NOT EXISTS "funnel_advertorial_samples_seeded" boolean DEFAULT false`. down() (L33–39): DROP COLUMN IF EXISTS ×2.
**Idempotent: yes.** **Dependency**: `integration_config` (init migration L794). **Still required post-merge**: both branches' `src/lib/funnel-samples.ts` read/write both markers (release L207–223; ui/model L205–221), and neither branch touches `src/globals/IntegrationConfig.ts` (neither branch diffs `src/globals/` at all).

### 2c. UI/model `20260813_210000_template_records.ts`
up() (L42–160), in order:
1. Two enums, each duplicate_object-guarded (L44–52): `enum_funnel_landing_pages_origin` = ('stock','clone','blank','ai','legacy'); `enum_funnel_quiz_templates_origin` = ('stock','clone','blank').
2. `funnel_landing_pages` (guarded by `information_schema.tables` existence, L56–73): `ADD COLUMN IF NOT EXISTS` `is_enabled boolean DEFAULT true`, `origin <enum> DEFAULT 'blank'`, `stock_key varchar`, `archived_at timestamp(3) with time zone`, `slot_overrides jsonb`; `CREATE INDEX IF NOT EXISTS` on `stock_key` and `is_enabled`.
3. Backfill (guarded by column existence, L84–94): `UPDATE funnel_landing_pages SET is_enabled = true WHERE is_enabled IS NULL` (pre-existing rows stay selectable).
4. `funnel_lp_deployments` (table-existence-guarded, L97–109): `ADD COLUMN IF NOT EXISTS` `destination_overrides jsonb`, `utm jsonb`, `pixels jsonb`. (Verified no collision with main: the table's committed columns are name/landing_page_id/site_id/domain_id/path/quiz_deployment_id/status + later quiz_id/embedded_quiz_template_id/content_overrides — none named utm/pixels/destination_overrides, so IF NOT EXISTS cannot silently keep a wrong type.)
5. `CREATE TABLE IF NOT EXISTS "funnel_quiz_templates"` (L112–128): id serial PK, name varchar NOT NULL, template_id varchar NOT NULL, renderer_key varchar NOT NULL, code, blurb, is_enabled boolean DEFAULT true, origin enum DEFAULT 'blank', stock_key, archived_at timestamptz(3), config_overrides jsonb, updated_at/created_at defaults.
6. Indexes (L136–143): `CREATE UNIQUE INDEX IF NOT EXISTS funnel_quiz_templates_template_id_idx` (matches Payload's naming for the collection's `unique: true` field, so `migrate:create` won't re-propose it), + `stock_key`, `is_enabled` indexes.
7. `payload_locked_documents_rels` (L146–159): `ADD COLUMN IF NOT EXISTS "funnel_quiz_templates_id" integer`; FK `payload_locked_documents_rels_funnel_quiz_templates_fk` (duplicate_object-guarded) ON DELETE cascade; `CREATE INDEX IF NOT EXISTS ..._funnel_quiz_templates_id_idx`.

down() (L169–195): drops everything it added **including the `funnel_quiz_templates` TABLE** (operator-edited template rows die on rollback; the header only preserves the landing-page side, L162–168).
**Idempotent: yes, fully** — and over-defensive: the table-existence guards on steps 2/4 can never be false on a chain-built DB (tables created by `20260729_140000`), they exist for dev-push-shaped DBs.

### 2d. Overlap analysis
- The ONLY shared object is `payload_locked_documents_rels`, and the column sets are **disjoint**: release adds the six `<existing-funnel-collection>_id` columns; ui/model adds only `funnel_quiz_templates_id` (for its new collection). No shared columns, constraints, indexes, enums, or tables. **Zero same-object-same-name DDL.**
- No data dependency in either direction: neither migration reads or requires anything the other creates.
- Consequence: **every pairwise execution order is safe**, and re-running either against a DB shaped by the other is a no-op by construction.
- The "collision" is purely (i) an identical 15-char timestamp prefix `20260813_210000` on two differently-named files, and (ii) a textual three-way conflict in `src/migrations/index.ts` (both branches append at the same spot).

### 2e. Deterministic order + rename plan — **KEEP ALL THREE NAMES UNCHANGED**
Execution order is dictated by Payload itself, not by us: Payload's `readMigrationFiles` reads the migration **directory sorted by full filename** and skips `index.ts` (release proved this empirically; see §5). Full-string sort of the three (verified with an actual sort):
1. `20260813_210000_locked_documents_funnel_rels`  ('l' 0x6C < 't' 0x74)
2. `20260813_210000_template_records`  ('210000' < '213000')
3. `20260813_213000_integration_config_sample_markers`

This is total and deterministic despite the shared prefix — filenames differ, so the sort never ties. **Do not rename**, because:
- Renaming buys nothing (order is already deterministic; ledger names are already unique) and creates a real hazard: any DB that already ran a migration under its old name (a staging/scratch DB migrated on either branch, or prod if a branch was ever manually released) keeps the old name in `payload_migrations`. The renamed file re-runs (harmless — idempotent) **but the old row becomes an orphan**: `payload migrate:down` resolves recorded names back to files, so a rollback that reaches the orphaned batch fails with "migration not found", and the recovery temptation is hand-editing `payload_migrations` — the exact practice `scripts/release.sh` exists to end (release.sh L27, L89–90, L106).
- A rename also forces edits to `scripts/test-release-ordering.mts` `RELEASE_MIGRATIONS` and re-checks of docs; keeping names needs only the one deliberate edit described in §5.
- (Rejected cosmetic option: rename to `20260813_212000_template_records` to de-duplicate timestamps. Same sort position, all the ledger risk, zero functional gain.)

### 2f. Scenario verification
**(a) Fresh DB, full merged chain (28 files, filename order):** init creates `payload_locked_documents_rels` + `integration_config`; `20260728_180000`/`20260729_140000`/`20260730_120000` create the six funnel tables; then `..._locked_documents_funnel_rels` (all FK targets exist), then `..._template_records` (alters existing funnel_landing_pages/funnel_lp_deployments; creates funnel_quiz_templates before referencing it at L153), then `..._integration_config_sample_markers`. All dependencies satisfied. `pnpm test:bootstrap` then reads every declared collection generically (scripts/test-fresh-bootstrap.mts L64–79), which now includes `funnel-quiz-templates` with no script edit, and its cleanup `payload.delete` calls (L279–281) exercise the full rels-column WHERE clause — the exact failure mode both `210000` migrations exist to prevent.
**(b) DB already ran release's two, then merged deploys:** ledger holds `..._locked_documents_funnel_rels` + `..._integration_config_sample_markers`; pending = `..._template_records` only. It has no dependency on the other two and applies clean as its own batch. `verify:schema` passes (funnel-quiz-templates table now exists for the newly-registered collection). A later `migrate:down` reverses only that one-migration batch — correct.
**(c) DB already ran ui/model's, then merged deploys (production-upgrade compatibility):** ledger holds `..._template_records`; pending = release's two, executed in filename order (locked_rels then markers). On a chain-built DB the six rels columns are genuinely added; on real production (which grew most objects via historical dev auto-push) every statement no-ops — the release migration's header states this is its designed case (L28–32). No name ever changes, so `payload_migrations` stays consistent in every scenario; nothing is ever re-run *except* by explicit design of the idempotent DDL.
**Actual production (os.legenex.com, on main):** all three are pending and apply as ONE batch. One `migrate:down` therefore reverses all three — including `template_records.down`, which **drops `funnel_quiz_templates`** and any operator edits made after the release. release.sh's size-checked pre-DDL backup (L135–152) is the stated fallback; the runbook owner should flag this in the release notes.

---

## 3. Collection/global schema changes vs migrations; F001

### Release
`git diff main --stat -- src/collections src/globals` is **empty**. Release changes zero collection/global definitions; its two migrations backfill drift for collections/globals already declared on main (`payload-locked-documents` rels for the six funnel collections; `IntegrationConfig`'s two marker checkboxes). **No new drift possible from release.**

### UI/model — 4 collection files, every field-to-column mapping covered by its migration
- `src/collections/FunnelQuizTemplates.ts` (NEW, 128 lines, slug `funnel-quiz-templates`, access plain `isAuthenticated` like the other funnel authoring collections, hooks: guardStockQuizTemplateIdentity/guardQuizTemplateDelete/audit): fields name, template_id (required, `unique: true`, validated by `QUIZ_TEMPLATE_ID_PATTERN`), renderer_key (validated against the code registry), code, blurb, is_enabled (checkbox default true), origin (select stock/clone/blank), stock_key, archived_at (date), config_overrides (json) — **exact match** to the migration's table incl. enum name `enum_funnel_quiz_templates_origin` and the unique-index name.
- `src/collections/FunnelLandingPages.ts`: +5 fields — is_enabled, origin (select with 5 options = the migration's 5-value enum), stock_key, archived_at, slot_overrides — all in the migration.
- `src/collections/FunnelLpDeployments.ts`: +3 json fields — destination_overrides, utm, pixels — all in the migration. Validator swapped from code-registry existence to shape-only (`validateStoredQuizTemplateId` from `src/lib/template-records/id.ts`).
- `src/collections/FunnelQuizDeployments.ts`: **zero schema change** — only hides three existing deprecated json columns (header_config, footer_config, body_section_overrides, kept so data isn't destroyed) and swaps the same validator.
- `src/payload.config.ts`: registers FunnelQuizTemplates (see §6). No globals change on either branch (`globals: [IntegrationConfig]` on both).
**UI/model complies with the no-new-drift rule** — schema + migration in the same commit (14ffa52), including its own locked-docs rels column (migration L146–159 + header note 3, L31–35): it independently guarded against the same defect class release was fixing.

### F001 status — the truth vs three stale documents
- **Main already fixed most of F001**: `20260729_090000_destinations_and_brand_drift.ts` L45–56 adds `brand_identity` jsonb + `brand_display_name`/`brand_short_name`/`brand_logo_url_dark`/`brand_tagline_brand` + `legal_*` + `typography_*`; the six `funnel_*` tables are created by the three 202607xx migrations. Main's CLAUDE.md:286 "F001, still open" was already stale at the branch point. The true residual drift on main: the six locked-docs rels columns + two integration_config markers.
- **Release closes the residual and proves it**: the two new migrations; `scripts/test-fresh-bootstrap.mts` (F001 field round-trips at L106–178, funnel tables at L138–151, the previously-fatal `funnel_lp_deployments.quiz_id` at L257); `scripts/verify-schema.mts`; `scripts/test-release-ordering.mts`. Release CLAUDE.md:292 flips to "**F001 is CLOSED, and `pnpm test:bootstrap` is what keeps it closed**" (preserving the historical text for auditability); docs/production-readiness.md:411 records exit criterion 2 FAIL→PASS and names both drifts as "neither was in F001's list".
- **UI/model**: inherits the stale "F001 still open" CLAUDE.md text unchanged (its CLAUDE.md:286); does NOT fix the rels/markers residual; adds no drift of its own.
- **Merged**: F001 fully closed only with BOTH branches' migrations present — which the union chain provides. Merged CLAUDE.md must take **release's** F001 + deploy sections (see risks below).

---

## 4. Generated types / @ts-nocheck

`src/payload-types.ts` remains generated + gitignored on both branches; typecheck still server-only.
- **@ts-nocheck file counts** (grep -rl over src): main **38**, release **38 (identical set, zero net change)**, ui/model **49**. CLAUDE.md's "25 files" figure is stale on all three versions.
- ui/model delta: −1 (deletes `src/components/builder/templates/TemplateLibrary.tsx`), +12 new @ts-nocheck files, each citing the missing `funnel-quiz-templates` slug in generated types: `src/app/(app)/admin/(top)/template-actions.ts`, `src/components/builder/lp/{LPDeploymentEditor,SectionHeading,SlotEditor,TemplateListView}.tsx`, `src/components/builder/quiz/{QuizTemplatesPanel,section}.tsx`, `src/components/builder/templates/TemplateGallery.tsx`, `src/hooks/template-guards.ts`, `src/lib/template-records/{index,samples,select}.ts`. Expected merged count: **49**.
- Files mentioning `payload-types`: release 13, ui/model 18 (the 5 additions are template-guards.ts, template-actions.ts, and the three template-records modules). Post-merge, `pnpm generate:types` on the server (live DB) will finally include the `funnel-*` + `funnel-quiz-templates` slugs; that is the gate for burning down the 49.

---

## 5. Release-ordering scripts: assumptions and rename sensitivity

- **`scripts/release.sh`** (215 lines): fetch/deploy → stop → install/importmap/build → **`pnpm payload migrate` while down** (L175–183) → **`pnpm verify:schema`** (L185–190) → start → HTTP health check. Migration-name **agnostic**: progress measured by counting `migrate:status` "Yes" rows (migration_count, L87–91); rollback guidance is "one `migrate:down` reverses the batch" (L98–107). **Unaffected by the merge; renaming would not break it.**
- **`scripts/verify-schema.mts` + `src/lib/schema-verify.ts`**: reads 1 row from every collection and global **enumerated from the live payload.config** (schema-verify.ts L64–80). Auto-covers `funnel-quiz-templates` once registered. No name pins. Unaffected.
- **`scripts/test-fresh-bootstrap.mts`**: generic read loop over `payload.collections` (L64–79) + globals (L83–91) + explicit F001 field round-trips + funnel CRUD. No migration-name pins; the `slugs.length >= 20` assertion (L65) holds at 22 collections. Post-merge caveat (for the funnel scout, not a migration issue): its `funnel-landing-pages` create at L227–232 now passes through ui/model's new guard hooks/validators.
- **`scripts/test-release-ordering.mts`** — **the single name-pinned artifact in either branch** (verified by grep: no other script or doc pins the names except prose in docs/production-readiness.md:411):
  - `RELEASE_MIGRATIONS` (L63–66) hardcodes release's two names and defines "the previous production schema" = full directory minus those files (L135–139). **Merged branch MUST add `'20260813_210000_template_records'` to this list** (sorted position: between the two). Without the edit the suite still passes mechanically — the cut chain stays valid and verify:schema still fails on the missing rels/markers — but the "previous schema" would wrongly contain ui/model's migration, so claims 1–3 and the ledger check (L233–243) would never cover it, and the file-count assertion (L140–143) would count 1 instead of 3.
  - **Assertion 0 (L110–122) compares `src/migrations/index.ts`'s array, in order, against `readdirSync(dir).sort()`** — this is what makes the union index.ts order in §6 mandatory and would FAIL a naive merge that appends ui/model's entry after release's two.
  - Renaming ui/model's migration would not break the script *provided* RELEASE_MIGRATIONS and index.ts track the rename — but see §2e for why the ledger makes renaming a bad trade anyway.
  - Batch semantics (L210–231): asserts one `migrate:down` reverses the whole release batch. On the merged branch that batch is all three; the down path includes dropping `funnel_quiz_templates` (§2f).
- **Payload-reads-the-directory claim**: asserted in release's index.ts header (L1–16), payload.config.ts comment (release L92–93), docs/release-runbook.md:94–100, and exercised by the suite spawning the real `payload migrate` CLI against a real scratch DB. Structurally consistent with both branches: nothing imports `src/migrations/index.ts` except test-release-ordering.mts (L37), and neither branch passes `prodMigrations` to the adapter — release adds only `migrationDir: process.env.LEGALOS_MIGRATION_DIR || undefined` (payload.config.ts L94) so the suite can point the CLI at a truncated copy of the chain. Main's CLAUDE.md sentence "that array is what runs, not the directory listing" is **wrong** and is corrected on release; the merged CLAUDE.md must keep the correction.

---

## 6. Exact merged content

### `src/payload.config.ts` (both branch edits are in disjoint hunks; git should auto-merge — verify BOTH survive)
Collections registered on merged (22 — main's 21 + ui/model's 1, in this order):
`Users, Sites, Domains, Pages, SharedLegalTemplates, Quizzes, LandingPages, FunnelLandingPages, FunnelLpDeployments, FunnelQuizzes, FunnelQuizDeployments, FunnelQuizTemplates, FunnelAdvertorials, FunnelAdvertorialDeployments, Leads, BlogPosts, Numbers, TrackingConfigs, Media, AuditLog, BuildLogComments`
Globals (all three versions identical): `globals: [IntegrationConfig]`.
Take from ui/model: the import `import { FunnelQuizTemplates } from './collections/FunnelQuizTemplates'` (after the FunnelQuizDeployments import) and the `FunnelQuizTemplates,` entry (after FunnelQuizDeployments in the array).
Take from release: the whole db-adapter hunk — the rewritten comment block plus, immediately after the `pool: {...},` entry:
```ts
    migrationDir: process.env.LEGALOS_MIGRATION_DIR || undefined,
```

### `src/migrations/index.ts` (true three-way conflict; hand-merge)
Base = **release's version** (keep its L1–16 header comment — it documents the directory-read truth that assertion 0 enforces). Insert ui/model's import and entry **between** release's two, matching filename sort. Exact tail:

```ts
import * as migration_20260813_180000_lp_deployment_embedded_quiz from './20260813_180000_lp_deployment_embedded_quiz'
import * as migration_20260813_210000_locked_documents_funnel_rels from './20260813_210000_locked_documents_funnel_rels'
import * as migration_20260813_210000_template_records from './20260813_210000_template_records'
import * as migration_20260813_213000_integration_config_sample_markers from './20260813_213000_integration_config_sample_markers'
```
…and the array ends:
```ts
  {
    up: migration_20260813_210000_locked_documents_funnel_rels.up,
    down: migration_20260813_210000_locked_documents_funnel_rels.down,
    name: '20260813_210000_locked_documents_funnel_rels',
  },
  {
    up: migration_20260813_210000_template_records.up,
    down: migration_20260813_210000_template_records.down,
    name: '20260813_210000_template_records',
  },
  {
    up: migration_20260813_213000_integration_config_sample_markers.up,
    down: migration_20260813_213000_integration_config_sample_markers.down,
    name: '20260813_213000_integration_config_sample_markers',
  },
];
```
28 entries total, matching the 28 on-disk `.ts` modules exactly — this is what test-release-ordering assertion 0 checks.

### `scripts/test-release-ordering.mts` (one deliberate edit)
```ts
const RELEASE_MIGRATIONS = [
  '20260813_210000_locked_documents_funnel_rels',
  '20260813_210000_template_records',
  '20260813_213000_integration_config_sample_markers',
]
```
(Optionally extend the post-migrate `hasColumn` checks with `funnel_quiz_templates` presence; not required for the suite to be meaningful.)

### `package.json` (both edit `test`/`test:all` — textual conflict; union)
- scripts union — from release: `test:webhook`, `test:observability`, `test:bootstrap`, `test:release`, `test:e2e`, `verify:schema`, `reconcile:lp-quiz`; from ui/model: `test:records`, `test:identity`, `test:ui`.
- `"test"`: `pnpm test:brand && pnpm test:authz && pnpm test:registry && pnpm test:records && pnpm test:slots && pnpm test:publish && pnpm test:ai && pnpm test:flow && pnpm test:webhook && pnpm test:observability && pnpm test:brand-identity`
- `"test:all"`: `pnpm test && pnpm test:isolation && pnpm test:identity && pnpm test:bootstrap`
- devDependencies from release: `@types/pg: 8.20.0`, `pg: 8.20.0` (`cross-env` already present on main).

---

## Risks / missing coverage / ownership

| Item | Risk | Owner |
|---|---|---|
| index.ts naive append (ui/model entry after release's two) | test-release-ordering assertion 0 fails; worse, readers believe a wrong order | integrator (this guidance) |
| RELEASE_MIGRATIONS not extended | release-ordering suite silently stops covering template_records | integrator |
| Merged CLAUDE.md keeps ui/model's (=main's) manual 8-line deploy block without a migrate step | first merged deploy boots code declaring `funnel-quiz-templates` against a schema without the table → **process throws at boot**; must take release's CLAUDE.md (release.sh flow) + F001-CLOSED text | CLAUDE.md/docs scout |
| `migrate:down` of the merged release batch drops `funnel_quiz_templates` incl. operator edits | data loss on rollback; release.sh backup is the fallback — flag in runbook | docs/release scout |
| docs/production-readiness.md:411 says "`20260813_210000`, `20260813_213000`" | prefix now ambiguous (two files share `20260813_210000`); use full names | docs scout |
| 11 other both-touched files (`publish-lifecycle.ts`, `lp-deployment.ts`, `funnel-samples.ts`, landing-pages `actions/content-actions/page`, `LandingPagesApp.tsx`, `QuizRuntime.tsx`, `quiz/preview.tsx`, `scripts/test-publish.mts`, package.json) | semantic conflicts outside my mandate | other scouts |
| No runtime test in this codespace (no node_modules/DB) | everything above is static analysis + release's own recorded runs; run `pnpm test:release && pnpm test:bootstrap` on the server post-merge as the real gate | integrator |

Existing tests that gate this area post-merge: `test:release` (ordering + rollback + ledger), `test:bootstrap` (fresh-DB truth incl. new collection via generic loop), `verify:schema` (inside release.sh). Missing: a bootstrap-suite explicit CRUD walk for `funnel-quiz-templates` (only the generic read covers it) — cheap add, not blocking.

---

## MERGE GUIDANCE

**Order (deterministic, = Payload's filename sort; do NOT rename any file):**
1. `20260813_210000_locked_documents_funnel_rels` (release, keep name)
2. `20260813_210000_template_records` (ui/model, keep name)
3. `20260813_213000_integration_config_sample_markers` (release, keep name)

All three are fully idempotent (IF NOT EXISTS / duplicate_object guards throughout) and mutually independent — the only shared object, `payload_locked_documents_rels`, gets disjoint column sets — so fresh-DB, release-first-then-uimodel, and uimodel-first-then-release ledgers all converge with no name ever changing in `payload_migrations`. Renaming is the only way to *create* an upgrade trap (orphaned ledger rows that break `migrate:down`); keeping names has none.

**src/migrations/index.ts**: release's file (with its header) + ui/model's import/entry inserted between release's two → 28 entries matching the directory sort exactly (verbatim tail in §6).
**src/payload.config.ts**: union — ui/model's FunnelQuizTemplates import + registration (22 collections), release's comment + `migrationDir: process.env.LEGALOS_MIGRATION_DIR || undefined`; globals `[IntegrationConfig]` unchanged.
**scripts/test-release-ordering.mts**: extend `RELEASE_MIGRATIONS` to all three names, sorted.
**Keep** release's `20260518_134859_site_status_draft.ts` (down() fix), release's index header, release's CLAUDE.md deploy/F001 sections.
**Server, post-merge**: deploy via `scripts/release.sh` (it migrates while down and verify:schema-gates the start); then `pnpm generate:types` and begin removing the 49 `@ts-nocheck` headers from touched files.
