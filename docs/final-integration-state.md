# Final integration — state of the work

Living checkpoint for the integration of `claude/legalos-release-work-ea1y9i`
(release/security/runtime work, tip 96685e0) and
`claude/landing-pages-ui-model-fix-aqwwoy` (template-records product model,
tip 8be4e42) into `claude/legalos-final-integration-gvvtr8`. Both diverged
from main at 3b4748d. Updated as gates close; if a session dies, resume from
here.

## Where things stand

- **Merge: DONE** (commit `bcd36d4` + repair commits after it). Six textual
  conflicts resolved semantically; the auto-merged overlap files were reviewed
  by scouts (docs/agent-reports/) and by test.
- **Environment: UP.** Local Postgres 16 (`legalos` db, trust auth on
  127.0.0.1:5432, running as user `pguser`, PGDATA /home/user/pgdata), Redis 7
  on :6379, `.env` with real local values, `pnpm install --frozen-lockfile`
  clean, `payload-types.ts` generated against the migrated local DB.
- **Fresh bootstrap: PROVEN.** All 30 migrations apply to an empty PG16
  database; `pnpm test:release` (27 checks) proves prior-schema upgrade and
  ordering, including the renamed migration.
- **Typecheck: PASS. Production build: PASS. Unit matrix: 2,565 assertions
  green** (`pnpm test` = brand 37, authz 69, registry 126, records 85,
  slots 906, publish 184, ai 58, flow 202, webhook 133, observability 44,
  brand-identity 721). `test:isolation` 12 green, `test:identity` 33 green.

## Semantic merge decisions (the ones that were not mechanical)

1. **Migration collision** — ui/model's `20260813_210000_template_records`
   RENAMED to `20260813_220000_template_records` (owner requirement: no two
   migrations share an ordering prefix). Deterministic order:
   `210000_locked_documents_funnel_rels` → `213000_integration_config_sample_markers`
   → `220000_template_records`. All three idempotent, disjoint DDL (the two
   locked-documents changes touch different columns). A dev DB that recorded
   the old name re-runs the renamed file and converges; production never
   recorded the old name. `RELEASE_MIGRATIONS` in test-release-ordering.mts
   gained the new name so the previous-schema upgrade actually proves it.
2. **content-actions.ts** — BOTH invariants kept: release's
   `isInsideQuizMount` refusal AND ui/model's inherited-copy comparison; AI
   targets = `editableSlots` (quiz-owned slots excluded) mapped onto inherited
   copy.
3. **LandingPagesApp.tsx** — ui/model's two-tab structure + extracted
   `LPDeploymentEditor` win; release's resolver-order quiz resolution and
   dangling-legacy-pointer detection kept in the deployment list
   (`quizDeployments` wired back through page.tsx).
4. **test-publish.mts** — union: release's lp-quiz-binding classifier section
   AND ui/model's template-availability section. Release's legacy fixture
   gained `status: 'live'` because the merged preflight (correctly) mirrors
   the renderer's refusal of non-live borrowed quiz deployments.
5. **validateOverrides completeness split** — the "every placeholder filled"
   rule is now an option (`requireComplete`, default strict). Publish
   preflight keeps it strict over the MERGED template+deployment copy; the
   library record hook, template editor save, deployment save and copy writes
   pass `requireComplete: false` so designs with placeholders can exist as
   records and work-in-progress is saveable. Without this split,
   `ensureTemplateLibrary` could not materialise 10 of the 12 stock LP
   templates (400 on `mustSupply` slots) and quiz records never materialised.
6. **Publish door unified** — `saveDeployment` (LP) and `saveQuizDeployment`
   wrote `status: 'live'` directly with NO preflight, and the UI used exactly
   that path (`setLpDeploymentStatus`/`setQuizDeploymentStatus` had zero
   callers). Now: content saves at the row's current status; a non-live→live
   transition goes through the set*DeploymentStatus door, which runs the full
   preflight; refusal keeps the edits and reports blocking checks. Going down
   stays ungated. QuizBuilderApp's toggle now rolls back its optimistic flip
   and surfaces refusals.
7. **publish-actions.ts LP quiz resolution** — was legacy-pointer-only, so a
   directly-bound deployment would always fail `embedded-flow`. Now own flow
   first, legacy pointer second (the resolver's order), in both
   `setLpDeploymentStatus` and `previewLpDeploymentPublish`.
8. **test-renderer-identity fixtures** bind `quiz` on LP deployments: the
   merged rule (a ported LP whose funnel cannot mount is not served) is the
   product behavior, and identity fixtures must be servable to test identity.

## Progress since the first checkpoint (2026-08-13, later)

- **Production-only sign-in crash FOUND AND FIXED.** The merged module set
  made the long-standing `access → authz → auth → payload.config →
  collections → access` import ring evaluate in a crashing order in the
  production chunker only (`Cannot access before initialization`; dev was
  fine, which is why every dev-mode browser proof missed it). Fixed
  structurally: `relationId` extracted to leaf `lib/relation-id.ts`;
  `lib/auth.ts` + `lib/site-resolver.ts` import `@payload-config` lazily.
  Sign-in verified in a production build.
- **Gallery empty-box (R1) fixed**: `PortedTemplateView` renders the
  mount-holed HTML only when a runtime will fill it; quiz-less admin contexts
  get the reference's inert card drawing.
- **Sample seeding defect fixed**: seedBase created live LP deployments
  before the flow existed (no binding → correctly refused → live 404s).
  Flow now seeds first and is bound directly; `healUnboundSampleLps` runs
  before the seeded-marker early-return and heals recognized sample rows only.
- **Suites on the integrated branch**: unit 2,565 (11 suites) · isolation 12 ·
  identity 33 · release 27 · bootstrap 55 · dom 357 · **ui 85/85 (production
  build, real login)** · **e2e 34/34 (production, exactly-one-lead)** ·
  sweep runs 36×13 with the documented baseline (200/25/24 — see
  docs/template-sweep-baseline.md; 25 ≤ the 27 first cut).
- **Docs amended**: template-model-correction.md carries a dated RESOLVED
  section; sweep baseline re-measured; requirements-traceability.md drafted.
- **In flight (builder agents)**: quiz "Create with Claude" (B-C),
  requirement-H browser checks incl. mobile/keyboard/console (B-F),
  security G1/G2/G3 + raw-door publish context gate + negative controls (B-E).

## FINAL MATRIX — 090c8b1, then e34adc0 (2026-08-14)

One fresh production build (install --frozen-lockfile → typecheck → build),
then every suite against that bundle: **3,313 assertions, 0 failures.**
brand 37 · authz 69 · registry 126 · records 86 · slots 906 · publish 184 ·
ai 100 · flow 202 · webhook 133 · observability 44 · brand-identity 721 ·
isolation 44 · identity 33 · release 28 · bootstrap 58 · dom 357 · ui 151 ·
e2e 34. Sweep: 36 templates × 13 fixtures at its documented baseline
(200 ui-kind 3:1 violations, 25 fixture, 24 dead vars, 0 import breaches —
zero TEXT-contrast failures; see docs/template-sweep-baseline.md).

All three builder streams merged and re-verified by the orchestrator:
quiz "Create with Claude" (closed schema), deployment-tenancy hooks on all
three deployment collections with negative controls, requirement-H browser
conformance (151, incl. mobile + keyboard + measured focus contrast).

Two more production-only defects found and fixed after the first checkpoint:
the sign-in circular import (see above) and **audited users were
undeletable** — audit_log.user_id was NOT NULL over an ON DELETE SET NULL
FK, so deleting any user with history aborted; field made optional +
migration 20260813_230000, proven by test:bootstrap (58).

## Final adversarial phase — CORRECTED STATUS (resumed 2026-08-14)

The prior session launched five reviewers in one batch and was interrupted;
its background tasks were **stopped before any produced output** (no
`docs/agent-reports/review*.md` existed on resume). The earlier claim that
they were "running" is stale and void — **none of those five reviews may be
treated as completed.**

Resume plan (per owner): run reviewers in CONTROLLED WAVES to avoid another
simultaneous-background-task failure.
- WAVE 1: Reviewer A (requirement/conformance) + Reviewer B (security) →
  reproduce, classify, fix, regress, checkpoint.
- WAVE 2: Reviewer C (browser/UX/rendering) + Reviewer D (migration/release).
- WAVE 3: Reviewer E (runtime/QuizRuntime/lead/webhook), then a single
  FINAL requirement reviewer.
After all repairs: a fresh full matrix (new assertion count, not the 3,313
reused), then the final report.

Environment on resume: container restarted; Postgres 16 `legalos` DB
survived intact (20 quiz templates, 12 LP records, migrations current incl.
audit_log_user_nullable), Redis up, `.env` + admin password intact, build
present from 090c8b1 (5203d7b/e34adc0 are docs+screenshots only).

## Known open work (gates not yet run)

- **Gallery empty-box regression (R1, scouts 2+6):** release's
  `PortedTemplateView` renders `htmlWithMount` unconditionally; ui/model's
  gallery/preview passes no quiz → empty hole where the quiz card belongs in
  admin previews/thumbnails. Fix direction: neutral placeholder or unmounted
  html in admin contexts (`quiz ? htmlWithMount : html`).
- **Security gate backlog (scout 5):** G1 advertorial deployment save/delete
  has no site gate; G2 funnel collections are plain `isAuthenticated` at
  REST/cms (server actions carry the gates); G3 isolation tests don't cover
  funnel REST doors. Plus: raw-door direct `status: 'live'` writes via
  REST/cms bypass preflight (actions now gate it; collection-level gate to be
  considered).
- **Quiz "Create with Claude"** — LP has it; quiz templates only have
  create-blank + clone. Section-13 tests expect AI creation for both kinds.
- **UI verification half of requirement H** — mobile viewport, keyboard/focus,
  overflow-x, console-error capture in the browser suite.
- **test-admin-ui fixtures** — needs one brand with two live deployments on
  different templates for the public-render proof; must keep failing loudly on
  zero templates.
- **Docs to amend at the end:** `docs/template-model-correction.md` says the
  LP runtime mount is NOT done (now false post-merge);
  `docs/template-system-implementation-state.md` predates the record model;
  CLAUDE.md's migration prose ("that array is what runs") is wrong per
  release's finding — Payload runs the DIRECTORY, index.ts is a cross-checked
  mirror.
- **E2E/browser matrix, sweep, screenshots** — not yet run on the integrated
  branch. `test:e2e` and `test:ui`/`test:dom` need the production build + a
  running server (build already passes).

## External blockers (unchanged, not resolvable here)

- Namecheap DNS / production TLS (EB-2), production tier-service 405 (EB-1),
  error-reporting destination decision (EB-3). See docs/external-blockers.md.

## How to run things here

- DB: `su pguser -c 'PATH=/usr/lib/postgresql/16/bin:$PATH pg_ctl -D /home/user/pgdata -l /home/user/pglog/pg.log -o "-p 5432 -k /tmp" start'`
- Suites: `pnpm test`, `pnpm test:isolation`, `pnpm test:identity`,
  `pnpm test:release`, `pnpm test:bootstrap` (NODE_ENV=production),
  browser: `pnpm test:ui`, `pnpm test:dom`, `pnpm test:e2e` (prod build).
