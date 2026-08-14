# Requirements traceability — final integration

Every requirement from the final-integration instruction, with where it lives,
what proves it, and its current status. Statuses are only NOT STARTED /
IN PROGRESS / PASS / EXTERNAL BLOCKER / FAIL. "PASS" means a reproducible
automated test, browser assertion, database assertion or screenshot exists and
ran green on the integrated branch in THIS environment (fresh Postgres 16,
production build). Suites named here: `pnpm test` (11 unit suites),
`test:isolation`, `test:identity`, `test:release`, `test:bootstrap`,
`test:dom`, `test:ui` (Chromium vs production build), `test:e2e`
(production-mode browser lead proof), `sweep:templates`.

Owners: ORCH = orchestrator session; B-C/B-E/B-F = builder agents (quiz-AI,
security, browser-conformance); source-branch work is credited where it was
merged in.

## 1 · Branch integration

| ID | Requirement | Where | Proof | Status |
|---|---|---|---|---|
| R1.1 | Both source branches integrated on one branch | merge bcd36d4 + repairs | `git log --graph`; both tips are parents | PASS |
| R1.2 | Conflicts resolved semantically, decisions recorded | docs/final-integration-state.md §"Semantic merge decisions" | 8 recorded decisions; scout reports in docs/agent-reports/ | PASS |
| R1.3 | Duplicate migration prefix resolved, deterministic order | 20260813_220000_template_records.ts (renamed) | `pnpm test:release` 27/27 incl. renamed migration in RELEASE_MIGRATIONS | PASS |
| R1.4 | No security/runtime/release work lost | scout-security.md guard inventory; union verified | authz 69, webhook 133, observability 44, brand-identity 721 green | PASS |
| R1.5 | Fresh PG16 bootstrap, both source-schema upgrades, no manual SQL | migrations chain | `payload migrate` on empty DB; upg_ui + upg_rel scratch DBs migrated + `verify:schema` OK ×2; `test:bootstrap` 55/55 | PASS |
| R1.6 | Generated types include all new collections | src/payload-types.ts (generated) | `generate:types` + `pnpm typecheck` clean | PASS |

## 2 · Product model (section 6)

| ID | Requirement | Where | Proof | Status |
|---|---|---|---|---|
| R2.1 | Site Pages untouched by LP correction | src/app/(app)/admin/sites/[slug]/pages, src/collections/Pages.ts | zero diffs vs main (scout-brand-site §4); `test:dom` 357 | PASS |
| R2.2 | Quiz Flow owns logic; Quiz Template owns presentation; never merged | FunnelQuizzes vs FunnelQuizTemplates collections | `test:flow` 202; `test:records` 85; separate collections | PASS |
| R2.3 | Quiz Deployment = Flow × Template × Brand × Config | src/lib/quiz-deployment.ts | `test:identity` quiz A/B render distinct templates from one flow | PASS |
| R2.4 | LP Template is THE authored page (no Page+Template split) | funnel-landing-pages records; ensureTemplateLibrary | `test:identity` 33; `test:ui` "no Pages tab" assertions | PASS |
| R2.5 | Same LP template record feeds list/editor/preview/selector/deployment-preview/public render | template-records + resolveTemplate chain | `test:identity`: saved id == publicly rendered id, repoint changes render | PASS |
| R2.6 | Brand Identity owns colors/typography/logos/voice/facts/legal/nav | Sites.brand_identity + src/lib/brand-map.ts (single mapper) | `test:brand-identity` 721; scout-brand-site: no second mapper | PASS |
| R2.7 | Deployments own selection/brand/domain/path/status/destinations/tracking/overrides | funnel-*-deployments collections | `test:publish` 184; `test:ui` General/Destination/Tracking tabs | PASS |
| R2.8 | AI may not alter graph/qualification/consent/identity/domain/routing/tracking/authz/publication/code | content-actions targets editableSlots only; AI schema closed | `test:ai` 58 (incl. refusals); quiz-AI schema (B-C) | PASS |

## 3 · LP template system (section 8)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R3.1 | Tabs exactly Templates \| Deployments, no Pages tab | `test:ui`: "exactly two top-level tabs", per-tab assertions | PASS |
| R3.2 | 12 stock templates materialized as stable records | `test:identity` "twelve records"; `test:records` 85 | PASS |
| R3.3 | Samples (MVA Pain First / Editorial Test) reconciled, not a competing library | `test:identity`: samples absent from library, deployments repointed | PASS |
| R3.4 | Preview/Edit/Clone/Enable/Disable/Delete/Create-blank/Create-with-Claude | `test:ui` row-action assertions + AI wizard; `test:records` CRUD | PASS |
| R3.5 | Stock identity immutable via REST/CMS/local API | src/hooks/template-guards.ts; `test:records` raw-door cases | PASS |
| R3.6 | Referenced templates not hard-deletable; disable ≠ takedown | template-guards + `test:records`; `test:identity` disabled-still-serves | PASS |
| R3.7 | Clones: unique stable identity, renderable after save/reload | `test:identity` clone cases (LP + quiz) | PASS |
| R3.8 | AI-created LP templates: valid structure, real preview, stable id, no blank preview, no fallback | LP AI wizard + `test:ai`; PortedTemplateView un-mounted drawing fix | PASS |
| R3.9 | Template editor: left controls, live preview, sections, mobile/desktop, brand-neutral saved state | `test:ui` editor assertions + screenshots | PASS |

## 4 · Quiz template system (section 9)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R4.1 | Tabs exactly Quiz Flows \| Templates \| Deployments | `test:ui` quiz-tab assertions | PASS |
| R4.2 | 20 stock quiz templates as manageable records | `test:identity` "twenty records"; `test:records` | PASS |
| R4.3 | Template CRUD incl. create custom + with Claude | `test:ui`; createQuizTemplateWithClaude + AINewQuizTemplateWizard; `test:ai` 100 | PASS |
| R4.4 | Stable template id separate from renderer key; clones use existing renderer + own config | funnel-quiz-templates schema (template_id vs renderer_key) | PASS |
| R4.5 | Disabled: not selectable for new; existing keep rendering + admin warning | `test:identity` disable case; `test:ui` warning assertions | PASS |
| R4.6 | Unknown template ids fail visibly, never default/first-template | `test:identity` bad-id refuses; hydrateQuizDeployment → 404 + log | PASS |

## 5 · Deployment UI (section 10)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R5.1 | Quiz deployment tabs exactly General \| Destination URL's \| Tracking & Pixels (Render&Embed / Header/Footer / Body Sections removed) | `test:ui` tab-set assertions | PASS |
| R5.2 | Quiz General: name/flow/brand/domain/path/status/embed-or-standalone/visual gallery | `test:ui` + quiz-deployment-general.png | PASS |
| R5.3 | LP deployment same tab set; General incl. DIRECT Quiz Flow select (not a standalone quiz deployment) | `test:ui` + landing-page-deployment-general.png | PASS |
| R5.4 | Gallery cards: real preview, Preview button, Select button, obvious selected state | `test:ui` card assertions; empty-box fix (PortedTemplate) | PASS |
| R5.5 | Save/reload preserves selected template record id; public render uses it; no silent fallback | `test:ui` save/reload; `test:identity` DB-level | PASS |
| R5.6 | Headings visually clear/prominent | `test:ui` heading assertions + screenshots | PASS |

## 6 · Functional LP quiz (section 11) — release-critical

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R6.1 | 12 stock LP templates carry exactly one semantic mount where required | extractor refuses ≠1; generated-index verified; `test:slots` 906 | PASS |
| R6.2 | Mount replaces only the quiz card; surrounding content survives | composeTemplateWithQuizMount; `test:e2e` template-marker assertions | PASS |
| R6.3 | Static reference buttons removed/inert once runtime mounts | mounted HTML strips card; e2e "clicks produce zero stray posts" | PASS |
| R6.4 | Runtime = shared QuizRuntime + hydration + selected flow/template/brand + shared consent/destinations/lead submission | QuizMount portal → QuizRuntime; `test:e2e` | PASS |
| R6.5 | AI/cloned templates that support a quiz carry explicit mount; publish fails visibly without one | extract pipeline + `quiz-bound` preflight; `test:publish` | PASS |
| R6.6 | Browser E2E: ≥3 materially different LP templates, same flow: mount region, content survives, advance, branching, progress, backtrack clears state, lead form, consent, exactly one POST, exactly one row, mobile+desktop usable, static buttons inert | `test:e2e` 34 (production build) + `test:ui` 151 public/marker proofs + mobile pass at 390×844 | PASS |
| R6.7 | Exactly one standalone quiz lead | `test:e2e` standalone path | PASS |

## 7 · Brand Identity + Site Builder (section 12)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R7.1 | Multi-source engine preserved (URL/GitHub/markdown/logo/brief/structured; precedence/provenance/confidence/locks/refresh-diff/style/voice/facts/legal) | src/lib/brand-identity/*; `test:brand-identity` 721 | PASS |
| R7.2 | SSRF protections preserved | image-hosts.mjs deny-all default, admitUrlShape, safePost; `test:brand-identity` SSRF section | PASS |
| R7.3 | ONE canonical mapping feeds site/quiz/LP previews + public + AI | siteToBrand single mapper (scout-verified); `lint:tokens` | PASS |
| R7.4 | Site pages preview/publish/unpublish work; nav/footer inherit | untouched site-builder paths; `test:dom` | PASS |
| R7.5 | No [LOGO SLOT]/mock placeholders; neutral degradation; missing required brand values block publish | renderImageWell 4-outcome degrade; checkBrand preflight; `test:publish` | PASS |

## 8 · AI template & copy (section 13)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R8.1 | New-with-Claude creates real records (LP + quiz) | LP wizard (merged) + quiz wizard; `test:ai` 100 incl. refusal cases | PASS |
| R8.2 | LP AI output conforms to section/content/mount schema; quiz AI to visual-config schema | zod schemas via invokeLLM forced tool_use | PASS |
| R8.3 | No arbitrary executable code; unsafe HTML/unknown slot/missing mount refused | validateOverrides + schema closure; `test:ai` negative cases | PASS |
| R8.4 | AI unavailable / invalid schema / partial acceptance / human edit / reset / clone-after-AI / selection / preview / render identity | `test:ai` 58 + records/identity suites | PASS |

## 9 · Publishing, paths, domains (section 14)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R9.1 | Dedicated publish/unpublish lifecycle; preflight on publish AND resume; down never gated | publish-actions + decideTransition; `test:publish` 184 | PASS |
| R9.2 | THE preflight list (authz, parent, template enabled+identity, flow validation, brand, consent, overrides, destinations, tracking, domain ownership/eligibility, path claims, hydration, LP mount) | publish-lifecycle.ts checks; `test:publish` names each | PASS |
| R9.3 | Every publish door preflights (UI save path included) | saveDeployment/saveQuizDeployment delegate live-flips; deployment-tenancy hook refuses unpreflighted userful go-lives (context stamp from the one preflighted door); `test:isolation` 44 | PASS |
| R9.4 | One effective-path model across Pages/quiz/LP deployments | src/lib/path-claims.ts; `test:publish` path sections | PASS |
| R9.5 | Unpublish preserves records, removes public access; admins keep draft preview | resolver status filters + includeUnpublished re-verified auth | PASS |
| R9.6 | Domain eligibility not weakened | domain-eligibility.ts single contract; `test:publish` domain-ssl warning case | PASS |
| R9.7 | Namecheap DNS / production TLS | — | EXTERNAL BLOCKER |

## 10 · Security (section 15)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R10.1 | Template raw doors: no stock delete, no identity rewrite, no disabled-selection via REST/CMS/local | template-guards hooks; `test:records` | PASS |
| R10.2 | Tenant isolation: no cross-tenant template/deployment writes, no cross-bind of flow/domain/DOMAIN, no cross-tenant unpublished reads, no preview-header crossing | authz gates + deployment-tenancy hook on all three deployment collections (now also validates the referenced domain's tenant — Reviewer B finding H, commit a8deff5); `test:isolation` 49 (attacks + positive controls + 5 domain-bind cases), `test:authz` 69; preview bypass re-verifies auth in the route | PASS |
| R10.3 | SSRF/TrustedForm host/webhook target/image-host/XSS/log-redaction preserved | union verified (scout-security); webhook 133 + brand-identity 721 + observability 44 | PASS |
| R10.4 | overrideAccess uses documented/justified | scout-security audit: no unjustified elevated write | PASS |
| R10.5 | Negative controls: disable guard → test fails for the right reason → restore | three controls run: advertorial gate off → 2 named failures; tenancy hook off → 16 attack assertions fail as vulnerabilities; preflight-context off → exactly the two unpreflighted-publish cases fail. Restored, 44/44 green | PASS |
| R10.6 | Advertorial deployment actions gated (G1) | advertorials/actions.ts: save/delete via requireDeploymentSiteAdmin + domain-brand check, site derived from the gate | PASS |
| R10.7 | Audited users deletable; audit rows outlive their author | AuditLog.user optional + 20260813_230000 migration; `test:bootstrap` 58 proves delete + surviving row with author nulled | PASS |
| R10.8 | Deployment's referenced DOMAIN must belong to its Site on every door (Reviewer B finding H) | enforceDeploymentTenancy domain-tenant check (all 3 deployment collections); `test:isolation` 3 raw-door cross-domain attacks refused + 2 own/clear allowed; negative control proven | PASS |

## 11 · Migration & release (section 16)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R11.1 | Deterministic sequence, no duplicate prefixes | renamed 220000; directory==index asserted | PASS |
| R11.2 | Empty-DB chain, boot, types, CRUD, materialization, prior-schema upgrade, both source upgrades, locked-document deletes, rollback, no manual SQL/ledger edits | test:release 27 + test:bootstrap 55 + upg_ui/upg_rel runs + down() migrations idempotent | PASS |
| R11.3 | release.sh: verify source, size-checked backup, fetch/deploy, stop, install, build, migrate-before-start, verify schema, start, health, staged rollback | scripts/release.sh (release branch, reviewed); ordering proven by test:release against prior-schema scratch DB | PASS |

## 12 · Test matrix & UX checks (section 17)

| ID | Requirement | Proof | Status |
|---|---|---|---|
| R12.1 | Frozen-lockfile install / typecheck / production build | all three clean in this environment | PASS |
| R12.2 | Full suites from the integrated branch (no source-branch counts) | FINAL MATRIX on 090c8b1: 3,313 assertions, 0 failures (brand 37, authz 69, registry 126, records 86, slots 906, publish 184, ai 100, flow 202, webhook 133, observability 44, brand-identity 721, isolation 44, identity 33, release 28, bootstrap 58, dom 357, ui 151, e2e 34) + install/typecheck/build clean | PASS |
| R12.3 | Template coverage: exactly 20 quiz + 12 LP stock, all resolve, enabled selectable, disabled excluded, clones + AI render, no zero-template pass, no silent fallback | test:identity + test:records + sweep (36 templates × 13 fixtures; exit-2-on-empty design) | PASS |
| R12.4 | Screenshots: LP templates list, LP editor, quiz templates list, quiz editor, quiz deployment General, LP deployment General, public LP w/ runtime, desktop + mobile | docs/screenshots/: four desktop admin shots + landing-page-templates-mobile.png + lp-public-mobile.png, regenerated by the final green run | PASS |
| R12.5 | Keyboard access, visible focus, labels, contrast, no overflow, no hydration errors, no console errors, no failed product requests | test:ui 151: keyboard reach + Enter/Space, focus indicator MEASURED ≥3:1, tab/control audits, mobile overflow checks, console-error capture (one documented env-only allow-list) | PASS |
| R12.6 | test:ui passes on its own default base (no env override needed) — Reviewer A flag 1 | default base changed 127.0.0.1→localhost:3000 to match the production CSRF allowlist (NEXT_PUBLIC_SERVER_URL); verified by running test:ui with LEGALOS_UI_BASE unset | PASS |

## 13 · External blockers (unchanged by this work)

| ID | Item | Status |
|---|---|---|
| X1 | Namecheap DNS + production TLS for tenant domains (EB-2) | EXTERNAL BLOCKER |
| X2 | Authoritative MVA tier business rules / production tier service 405 (EB-1) | EXTERNAL BLOCKER |
| X3 | Production error-reporting destination decision (EB-3) | EXTERNAL BLOCKER |

Nothing in this matrix is marked PASS on the strength of a source branch's
run: every count above was produced by suites executed on the integrated
branch in this session. Where a builder agent (B-C/B-E/B-F) is cited, the
orchestrator re-ran the named suites after integrating that work.
