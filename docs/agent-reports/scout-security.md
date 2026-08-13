# SCOUT 5 — Security + Tenant Isolation: merge-completeness audit

Branches vs base `main` (merge-base `3b4748d`):
- RELEASE = `/home/user/wt-release` (`origin/claude/legalos-release-work-ea1y9i`), tip `96685e0`.
- UI/MODEL = `/home/user/wt-uimodel` (`origin/claude/landing-pages-ui-model-fix-aqwwoy`), tip `8be4e42`.
- Integration WORKTREE `/home/user/legalos` is mid-merge on `claude/legalos-final-integration-gvvtr8`: HEAD=`96685e0` (release), MERGE_HEAD=`8be4e42` (uimodel). i.e. release is already committed and uimodel is being merged IN. 6 files still `UU`: `package.json`, `scripts/test-publish.mts`, `landing-pages/content-actions.ts`, `landing-pages/page.tsx`, `LandingPagesApp.tsx`, `src/migrations/index.ts`.

Both branches share a large common ancestry (SSRF `ssrf.ts`, `authz.ts`, `enforce-site-binding.ts`, TrustedForm pin, dispatch-webhooks guard, quiz-webhook site-binding, preview re-verification are ALL already on `main`/`3b4748d` — see §3/§5). Each branch's NEW security work is disjoint, so the union is achievable; the risks are (a) losing a control in a conflict resolution and (b) pre-existing gaps neither branch closed.

---

## 1. Raw-door guards (UI/MODEL `fe29581`) — the headline new control

New file **`src/hooks/template-guards.ts`** (184 lines). Both template collections are `access: isAuthenticated` on all four verbs with NO `site` field, and the FK `landing_page_id` / quiz `template_id` is `ON DELETE SET NULL`. A row is now the TEMPLATE every brand deploys, so the server-action-only refusals in `template-actions.ts` were bypassable via `DELETE /api/funnel-landing-pages/:id`, raw `/cms`, and local API. The hooks put the rules on every door. Exact hooks:

| hook (export) | type | attached on | checks |
|---|---|---|---|
| `guardLpTemplateDelete` | `beforeDelete` | FunnelLandingPages | refuses delete if `funnel-lp-deployments.landing_page == id` count > 0 (409, names count). `overrideAccess:true` on the count read — DOCUMENTED: "is the row referenced AT ALL", a tenant-scoped read would falsely report free. |
| `guardQuizTemplateDelete` | `beforeDelete` | FunnelQuizTemplates | looks up row's `template_id`, refuses if referenced by `funnel-quiz-deployments.template_id` OR `funnel-lp-deployments.embedded_quiz_template_id` (embedded-skin path). `overrideAccess:true`, same justification. |
| `guardStockLpTemplateIdentity` | `beforeChange` | FunnelLandingPages | on `update` of a row with `stock_key`: refuses change to `template_id` ("its design") or `stock_key` ("its library id"). 409. Editable content (name/slug/angle/sections/slot_overrides/enabled) untouched. |
| `guardStockQuizTemplateIdentity` | `beforeChange` | FunnelQuizTemplates | on `update` of a `stock_key` row: refuses change to `template_id`, `renderer_key`, or `stock_key`. |
| `guardLpSlotOverrides` | `beforeChange` | FunnelLandingPages | validates `slot_overrides` against the resolved template's slots (`validateOverrides(asSlotted(ported), …)`); rejects overrides for a template with no slots / unknown slot ids. 400. |

Reinforcing field-validators (also every-door), in the collections themselves:
- `FunnelLandingPages.ts` `validateLpTemplateId` (field `template_id`) — must resolve in code registry.
- `FunnelQuizTemplates.ts` `validateTemplateId` (shape `QUIZ_TEMPLATE_ID_PATTERN`) + `validateRendererKey` (must resolve in registry). `template_id` is `unique`.
- Deployment collections: `FunnelLpDeployments.ts` / `FunnelQuizDeployments.ts` swapped `resolveTemplate`-based validator for `validateStoredQuizTemplateId` (`src/lib/template-records/id.ts`) — SHAPE-only, deliberately NOT existence (a clone names no code renderer; a DB read in a validator would turn a missing migration into a total write outage). Existence is enforced in server action + publish preflight + render path instead. This division is the single most important merge-semantics note: do not "tighten" the deployment validator back to registry existence.

Server-action rules kept (better error messages) in **`template-actions.ts`** (10 exports, all `getCurrentUser`): 3 rules — (1) delete referenced template refused by name; (2) delete of stock row archives (`archived_at`+`is_enabled:false`) not drops (reconcile re-materialises); (3) disable never touches `is_published` render gate.

Tests: `scripts/test-renderer-identity.mts` lines 251–345 exercise the RAW doors with `overrideAccess:true` payload calls and assert refusals ("deleting a REFERENCED landing-page template is refused on the raw door", "changing a STOCK template's renderer…", "template copy naming a slot that does not exist…", "deleting a REFERENCED quiz template…") + positive "rewriting a stock template's copy is allowed" + "disabling does NOT take live pages down". `scripts/test-template-records.mts` asserts shape-validator refusals (`<script>`, arbitrary text, too-short).

Merge status: STAGED and present — `template-guards.ts`, `FunnelQuizTemplates.ts`, both collection wirings, `template-actions.ts`, `id.ts`, `select.ts` all resolve `:` in the index. Confirmed guards still wired in staged `FunnelLandingPages.ts` (beforeChange `[guardStockLpTemplateIdentity, guardLpSlotOverrides]`, beforeDelete `[guardLpTemplateDelete]`) and `FunnelQuizTemplates.ts`.

## 2. Release-branch controls

**SSRF (`src/lib/net/ssrf.ts`)** — core `assertSafeUrl`/`safeFetch`/`safePost` predate both branches (on `main`). Release ADDED `admitUrlShape` (network-free shape check split out) so `next.config.mjs` and Zod validators reuse the SAME rules (no second spelling). Per-hop re-admission on redirect, injectable resolver, every-address-must-pass (rebinding), v4-in-v6 wrappers refused, timer armed through body read, byte cap. Residual (documented in-file): validates addresses then connects by hostname → DNS-rebinding window not closed (needs pinned dispatcher).

**Image proxy SSRF (`b1d46fe`)** — NEW `src/lib/net/image-hosts.mjs` + `next.config.mjs`. Base had `remotePatterns:[{hostname:'**'}]` = unauthenticated open image proxy on every tenant domain. Now `remotePatterns: imageRemotePatterns(process.env.LEGALOS_IMAGE_HOSTS)` — empty by default (admits nothing; templates emit plain `<img>` so visitor browser fetches, server never does). `admitImageHosts` refuses wildcards/literal-IP/`127.1`/self-names/internal-suffixes/scheme-port-path. `isPublicImageHost` also exported and USED IN RENDER PATH `src/lib/lp-slots/model.ts:299` to reject tenant logo URLs pointed at `169.254.169.254` etc. (SSRF-in-visitor-browser). Cross-checked as strict subset of `admitUrlShape` by `scripts/test-brand-identity.mts`. **RELEASE-ONLY** — uimodel has neither the file nor the `next.config.mjs` fix, so `**` open proxy is still live on uimodel. MUST come from release.

**TrustedForm host pin** — `TRUSTEDFORM_CERT_HOST='trustedform.com'` allowlist in `src/lib/integrations/trustedform.ts` is on `main` (both branches identical). Host checked BEFORE credentials assembled; `safePost` refuses redirects so `Authorization: Basic` can't be bounced. Not a diff to preserve, but confirm it survives.

**Tier-lookup validation (`a2b1e91`)** — NEW `src/lib/quiz-webhook/tier.ts` + `execute.ts` + public route `quiz-webhook/route.ts` (rewritten) + authed `quiz-webhook-test/route.ts`. `decideTier`: an answer's own `setTier` wins; a returned tier MUST be one the quiz declares else kept as value but may not route; provider down/slow/HTML → "untiered" never wrong tier. `executeWebhookNode`: URL/verb/headers/payload from STORED node only, never caller; `interpolateJson` JSON-encodes visitor values (prevents `x","tier":"1` field forgery); header CRLF stripped; only `responseMappings` fields returned (no body exfil); default `post` is SSRF-guarded `safePost`. Public route: rate-limited, deployment must be `status:'live'`, quiz `is_published && !is_archived`, and the **cross-tenant binding check** (`resolveSiteByHost(host)` == `dep.site`). **RELEASE-ONLY.**

**Lead pipeline** — `run.ts` adds `reportError('pipeline', …)` on lead-write failure + one report per failed step at end, contact details excluded (redacted anyway). No behavioural weakening. **RELEASE-ONLY.**

**Observability/redaction (`db897f4`)** — NEW `src/lib/observability/report.ts`. Single `reportError(kind, err, ctx)`; redaction on the way OUT (email, bearer/token/secret/api-key/authorization, long digit runs, SSN, URL query values), `redactDeep` depth+size bounded, idempotent, fingerprint FNV-1a. Transports: always-on `logTransport` (JSON line) + optional `webhookTransport(url)` via `safePost` (SSRF-guarded, 3s). Public `client-error/route.ts` UNAUTH but rate-limited, bounded, redacted, silent 204. `src/app/(public)/error.tsx` + `global-error.tsx` boundaries show only digest. Consumers: `quiz-webhook`, `quiz-ai`, `lead-pipeline/run`, `funnel-samples`. Tests `scripts/test-observability.mts`. **RELEASE-ONLY.**

Also release-only, security-adjacent: `verify:schema` (`schema-verify.ts` + `verify-schema.mts`), `test-release-ordering.mts`, `test-e2e-lead.mts`, `test-fresh-bootstrap.mts`, `migrationDir` env override in `payload.config.ts`, `pg`/`@types/pg` deps.

## 3. Access-control map

`src/access/index.ts`, `src/lib/auth.ts`, `src/lib/authz.ts`, `src/hooks/enforce-site-binding.ts`, `src/middleware.ts` — **UNCHANGED on BOTH branches vs main** (all diffs empty). The heavy authz machinery (`requireSiteAdmin`, `requireDomainSiteAdmin`, `requirePoolDomain`, `requireDeploymentSiteAdmin`, `relationId`, `enforceSiteBinding` beforeValidate on 8 site-scoped collections) is pre-existing base work; neither branch touches it. Nothing to merge here, but it is the foundation both funnel actions call.

Funnel collections (`FunnelLandingPages`, `FunnelQuizTemplates`, `FunnelLp/QuizDeployments`, advertorials): still `isAuthenticated` on all verbs, NO `site` scoping in access rules (unchanged from main's documented state). Site scoping for deployments is enforced only in the SERVER ACTIONS via `requireDeploymentSiteAdmin` — NOT at the collection/REST/`/cms` layer. Template collections gain the §1 hooks but remain `isAuthenticated` for read/create/update-content. **This is the standing architectural gap neither branch fully closes** (see §6).

**`overrideAccess: true` inventory:** main 285, release 288 (+3), uimodel 313 (+28). Deltas classified:
- RELEASE +3: `src/lib/lead-pipeline/run.ts` already had 5 (unchanged count actually — the 3 net are in `observability/report.ts`? no) — release additions are in `lp-deployment.ts`/pipeline reporting reads; all documented reads for cross-tenant reference counting or health, no writes with elevated access that bypass a gate. No unjustified new use found.
- UI/MODEL +28: `src/lib/template-records/index.ts` (11), `samples.ts` (9), `template-actions.ts` (9 — but each export gates on `getCurrentUser` first; reads/writes to the GLOBAL brandless template library are legitimately un-site-scoped), `hooks/template-guards.ts` (5 reference-count reads, documented). All are on the brandless global template library (correctly global) or are reference-existence probes. **No unjustified `overrideAccess:true` writes found on either branch** — every elevated write in the funnel actions is preceded by a `getCurrentUser`/`requireDeploymentSiteAdmin` gate and writes the derived (not caller-supplied) `site`. The one class to watch: `template-actions.ts` create/clone/save/delete run with `overrideAccess:false` on the actual mutation (good) but read with `overrideAccess:true`; since templates are intentionally global-brandless this is correct, BUT it means ANY authenticated user (any tenant analyst) can create/clone/edit/delete-if-unreferenced ANY template — acceptable only because templates are a shared global library by design. Flag for product sign-off, not a merge blocker.

## 4. Server actions — auth coverage

Every exported `'use server'` action under `(top)/{landing-pages,quizzes,advertorials}` and `template-actions.ts` on BOTH branches calls `getCurrentUser()` first (verified: exports==getCurrentUser count matches for every file). Deployment-mutating actions additionally gate on `requireDeploymentSiteAdmin` (derive-site-off-record, check both incoming and existing site):
- `landing-pages/actions.ts`: `saveDeployment`, `deleteDeployment` — gated. (uimodel dropped `createLP/saveLP/cloneLP/deleteLP` — moved to `template-actions.ts` with §1 rules; release still has them as thin CRUD. **Merge must take uimodel's version — release's `createLP/saveLP/cloneLP/deleteLP` are the pre-record write paths that skip the new guards.** This is exactly the `landing-pages/page.tsx`+`content-actions.ts`+`LandingPagesApp.tsx` conflict cluster.)
- `quizzes/actions.ts`: `saveQuizDeployment`, `deleteQuizDeployment` — gated (uimodel adds `resolveQuizTemplateSelection` existence/enabled check + destination validation).
- `advertorials/actions.ts`: `saveAdvertorialDeployment`, `deleteAdvertorialDeployment` — **auth only (`getCurrentUser`), NO `requireDeploymentSiteAdmin`.** `saveAdvertorialDeployment` writes `site: numFromBrandId(dep.brandId)` straight from the CLIENT with `overrideAccess:false` — but advertorial-deployments are `isAuthenticated` so `overrideAccess:false` buys nothing, and `deleteAdvertorialDeployment` deletes any id. **CROSS-TENANT GAP, present on BOTH branches and main — advertorial deployments are NOT gated like LP/quiz deployments are.** Neither branch fixed it. (See §6.)

Cross-tenant implications of nullable-site deployments: `requireDeploymentSiteAdmin` treats a null-site (orphan) row as "deployment not found" (fail-closed) — good. Domain-cross-brand check present in both LP and quiz save (`relationId(found.site) !== gate.siteId` → "that domain belongs to a different brand"). Advertorial save has NEITHER the deployment gate NOR the domain-brand check.

## 5. Public surfaces / XSS

- `/api/leads` (`route.ts`): unchanged both branches (pipeline internals changed on release only, additively).
- `/api/legalos/*`: `quiz-webhook` site-binding + published checks are on `main` already (both branches identical); release ADDS `quiz-webhook-test` (authed) and rewrites `quiz-webhook` to route through `executeWebhookNode`. `client-error` is release-only new UNAUTH surface (bounded/redacted/rate-limited — safe). `quiz-ai` unauth on both (unchanged; server-holds-key design).
- Preview bypass: `src/app/(public)/[[...slug]]/page.tsx` re-verifies auth for BOTH `x-legalos-preview` and `?site=` channels (resolves user up-front, anon ignored) — on `main`, unchanged by release; uimodel's only change is `slotOverrides={resolved.composedOverrides}` (template+deployment merge, not a security change). Middleware `x-legalos-preview` intent-only, route re-verifies — intact.
- Note (both branches, pre-existing): `quiz-webhook` reads `x-legalos-host` from REQUEST headers, and `/api/*` is a middleware PASSTHROUGH (middleware only stamps `x-legalos-host` on public paths). So a POST client controls `x-legalos-host`. This does not grant cross-tenant escalation (attacker must name the deployment's own host to pass `site==dep.site`, and outbound is still limited to the stored node URL), but the host binding is client-asserted rather than proxy-stamped. Residual, unchanged by either branch.
- **XSS / `dangerouslySetInnerHTML`:** identical file set on all three (page.tsx×2, layout, BlockRenderer×5, PortedTemplate, tokens, quiz preview, plan). LP template rendering DOES carry HTML: `PortedTemplate.tsx` mounts `composed.html`/`htmlWithMount` via `dangerouslySetInnerHTML`. Safety rests on `src/lib/lp-slots/model.ts` `escapeHtmlText` (`&`→`&amp;` first, then `<`,`>`; used for every slot value, `<img src>`/`alt`, geometry style) — operator/template copy is escaped for its HTML-text/attr position before insertion. Release's `model.ts` grew to 522 lines (slot model expansion) but keeps `escapeHtmlText` on every emission path (lines 412/413/436/437/544). uimodel does NOT modify `model.ts`. **The merge takes release's `lp-slots/model.ts`; uimodel's `PortedTemplate.tsx` uses `composed.html` (single arg) while release uses `composed.htmlWithMount` (quiz-portal). The staged tree already resolved PortedTemplate to release's 2-sink version.** Verify escaping survives whichever `model.ts` wins — release's is the superset, keep it.

## 6. Cross-tenant attack surface for the MERGED model (template global, deployment site-bound)

What STOPS user A editing/deleting a template referenced by tenant B's deployment:
- Delete: **CLOSED** by `guardLpTemplateDelete`/`guardQuizTemplateDelete` (every door, reference-count). ✅ uimodel-only — must survive.
- Stock identity rewrite (repoint every tenant's render): **CLOSED** by `guardStock*Identity`. ✅ uimodel-only.
- Editing a template's COPY that tenant B inherits: **NOT blocked** — any authenticated user can rewrite any non-stock template's words / clone / create, and a stock template's editable copy, and that reaches every deployment that hasn't overridden the slot. This is BY DESIGN (shared global library) but is a genuine cross-tenant content-influence surface with no per-tenant authorization. Neither branch closes it; it is inherent to "templates are global-brandless." Flag for product.
- Selecting another tenant's quiz flow / domain in a deployment: domain is checked (`domain belongs to a different brand`) in LP+quiz save on both branches. Quiz FLOW is intentionally brandless (any flow selectable) — documented, not a leak (flows carry no tenant content). Advertorial deployment: **NO domain-brand check** (§4 gap).
- Claiming another site's path: handled by `checkPathAvailable`/path-claims (pre-existing, `test-publish.mts`), unchanged.
- Advertorial deployment create/delete with arbitrary `site`/id: **OPEN on both branches** (§4). Highest-value remaining cross-tenant gap in the merged tree.

## 7. Tests

- `scripts/test-authz.ts` — pure helpers with stubbed Payload: `relationId` edge cases (NaN/0/whitespace/boolean/array all → null), `requireSiteAdmin`/`requireDomainSiteAdmin`/`requirePoolDomain`/`requireDeploymentSiteAdmin` incl. the setPrimary/recheckDomainDns/attach oracle attacks. On `main`, unchanged both branches. Gap: does not cover advertorial deployments (no gate exists to test).
- `scripts/test-tenant-isolation.mts` — real DB + real login: create/update on another tenant's Page/Domain/Number/TrackingConfig refused; move-my-page-to-another-tenant refused; pool-domain attach-to-other-tenant refused (incl. `overrideAccess:true` must-not-bypass-hook); scoped read returns only own site. On `main`, unchanged both branches. Gap: does not exercise funnel deployment collections (LP/quiz/advertorial) cross-tenant at the REST layer — the very collections that rely on action-layer gating.
- UI/MODEL guard tests: `test-renderer-identity.mts` (raw-door refusals §1, DB-backed), `test-template-records.mts` (shape validators, one-library invariants, DB-free), `test-admin-ui.mts` (browser). RELEASE guard tests: `test-quiz-webhook.mts` (tier decisions, HTML-on-200, SSRF metadata refusal, timeout), `test-observability.mts` (redaction idempotent/nested/secret-scheme), `test-release-ordering.mts`, `test-e2e-lead.mts`.
- `package.json` `test`/`test:all` scripts DIVERGE (UU conflict): release adds `test:webhook,test:observability,test:bootstrap,test:release,test:e2e,verify:schema`; uimodel adds `test:records,test:identity,test:ui`. **Union both into the merged `test`/`test:all` — neither superset contains the other.**

---

# MERGE GUIDANCE — every guard that must exist post-merge

Union of both branches + gaps. Verified present (STAGED `:`) unless noted.

RAW-DOOR / TEMPLATE (uimodel — MUST NOT be lost):
1. `src/hooks/template-guards.ts` present AND wired: `FunnelLandingPages.hooks` = beforeChange[`guardStockLpTemplateIdentity`,`guardLpSlotOverrides`], beforeDelete[`guardLpTemplateDelete`]; `FunnelQuizTemplates.hooks` = beforeChange[`guardStockQuizTemplateIdentity`], beforeDelete[`guardQuizTemplateDelete`]. ✅ staged.
2. Field validators: `FunnelLandingPages.validateLpTemplateId`; `FunnelQuizTemplates.validateTemplateId`+`validateRendererKey` (+`unique template_id`); both deployment collections use `validateStoredQuizTemplateId` (SHAPE-only — DO NOT revert to registry-existence). ✅ staged.
3. `FunnelQuizTemplates` collection registered in `payload.config.ts`. ✅ staged (line 66).
4. `template-actions.ts` (10 gated exports) is the ONLY LP-template write path; release's `createLP/saveLP/cloneLP/deleteLP` in `landing-pages/actions.ts` MUST be dropped (take uimodel's actions.ts). ⚠️ `landing-pages/actions.ts` staged already has the uimodel shape (`resolveLpTemplateSelection`, no createLP) — confirm final resolution of the UU cluster keeps it.
5. `template-records/{id,select,index,samples,model}.ts` present; publish preflight uses `checkQuizTemplateRecord`/`checkLpTemplateRecord` (existence+enabled+not-archived). ✅ id/select staged.
6. Migration `20260813_220000_template_records.ts` — RENAMED from `_210000_` to avoid filename collision with release's `_210000_locked_documents_funnel_rels.ts`; index lists all three new migs in order (`_210000_locked_documents_funnel_rels`, `_213000_integration_config_sample_markers`, `_220000_template_records`). ✅ file on disk at new name, old name gone, index updated. (Confirm `payload` sorts by the NEW filename so ordering is intended.)

SSRF / OUTBOUND (release — MUST NOT be lost):
7. `next.config.mjs` `remotePatterns: imageRemotePatterns(process.env.LEGALOS_IMAGE_HOSTS)` — NO `hostname:'**'`. ✅ staged. (uimodel would reintroduce `**`; ensure release's config wins.)
8. `src/lib/net/image-hosts.mjs` present; `isPublicImageHost` used at `src/lib/lp-slots/model.ts` render path. ✅ staged.
9. `src/lib/net/ssrf.ts` release version (with `admitUrlShape` split). Take release's superset.
10. TrustedForm host pin `trustedform.com` in `integrations/trustedform.ts` (base — verify intact).
11. `dispatch-webhooks.ts` + `slack.ts` + `ssl-poll.ts` + `brand-identity/sources.ts` + `brand/extract-computed.ts` + `builder/extract/fetch-bundle.ts` + `pages/new/ai-clone-action.ts` all via `safeFetch`/`safePost` (base — verify intact).
12. Quiz webhook: `quiz-webhook/execute.ts` (stored-node-only URL, `interpolateJson`, header CRLF strip, mapped-fields-only), `quiz-webhook/tier.ts` (`decideTier`), public `quiz-webhook/route.ts` (rate-limit + `status:'live'` + published + `resolveSiteByHost==dep.site` binding), authed `quiz-webhook-test/route.ts`. ✅ execute/tier/test staged.

OBSERVABILITY / REDACTION (release — MUST NOT be lost):
13. `src/lib/observability/report.ts` + `client-error/route.ts` + `error.tsx` + `global-error.tsx`; `reportError` wired in `quiz-webhook`, `quiz-ai`, `lead-pipeline/run`, `funnel-samples`. ✅ all staged.

ACCESS / AUTHZ (base — unchanged, must remain):
14. `enforce-site-binding.ts` beforeValidate on the 8 site-scoped collections; `authz.ts` `requireDeploymentSiteAdmin` gating `saveDeployment`/`deleteDeployment` (LP) and `saveQuizDeployment`/`deleteQuizDeployment` (quiz); domain-brand check in LP+quiz save; preview re-verification in catch-all; middleware intent-only.

TESTS:
15. Merge `package.json` `test`/`test:all` to the UNION: `test:webhook test:observability test:records` in `test`; `test:isolation test:identity test:bootstrap` in `test:all`; keep `verify:schema test:release test:e2e test:ui reconcile:lp-quiz`. (UU — resolve as union.)

GAPS TO FILL (neither branch closes; open post-merge):
- **G1 (highest):** `saveAdvertorialDeployment`/`deleteAdvertorialDeployment` have NO `requireDeploymentSiteAdmin` and NO domain-brand check — writes client-supplied `site`, deletes any id. Cross-tenant. Add the same gate LP/quiz deployments use.
- **G2:** funnel deployment + template collections remain `isAuthenticated` (no site scoping) at REST/`/cms`; deployment site-scoping lives only in server actions. Template global-edit (copy/clone/create) has no per-tenant authz — acceptable ONLY if "templates are a shared global library" is a signed-off product decision. Otherwise a tenant analyst can reword every tenant's template copy.
- **G3:** `test-tenant-isolation.mts` does not exercise LP/quiz/advertorial deployment collections at the REST layer — the collections most dependent on action-layer-only gating are untested for cross-tenant REST access. Add cases.
- **G4:** DNS-rebinding window in `ssrf.ts` (documented residual) — unpinned connect. Not a regression; track.
- **G5:** `x-legalos-host` on `/api/*` is client-asserted (passthrough, not proxy-stamped) — quiz-webhook host binding relies on it. No escalation today; note for defense-in-depth.
