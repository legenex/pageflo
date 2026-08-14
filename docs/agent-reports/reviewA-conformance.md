# Reviewer A — Original-Requirement Conformance Adversary

Branch `claude/legalos-final-integration-gvvtr8` @ 5203d7b. Server: prod build (`next start`) on :3000.
Method: real code read + drove the running admin via Playwright (localhost origin, see CRITICAL note) +
raw curl against public pages via `Host:` header + direct psql on the live `legalos` DB + ran the three
prescribed suites. All DB mutations I made were on reversible/throwaway rows and were restored; DB left
clean (12 LP stock, 20 quiz stock, no clone/blank residue). Probe scripts deleted.

## CRITICAL harness caveat (affects how these tests must be run — NOT a product defect)
The production CSRF allowlist (`src/payload.config.ts:108`) in `NODE_ENV=production` is ONLY
`NEXT_PUBLIC_SERVER_URL` (= `http://localhost:3000` in this env); `127.0.0.1` is NOT included.
Every mutating server action therefore returns `{"ok":false,"error":"unauthenticated"}` when the app is
driven via `http://127.0.0.1:3000`. `scripts/test-admin-ui.mts` DEFAULTS `BASE` to `http://127.0.0.1:3000`
(line 68), so **`pnpm test:ui` run without `LEGALOS_UI_BASE=http://localhost:3000` produces spurious
FAILs** (I first saw 3 fails: "Clone adds one template (12 -> 12)"). Re-run via `localhost` and clone
works (12→13, DB row created). This is the documented foot-gun, not a conformance break — flagging so the
orchestrator uses `LEGALOS_UI_BASE=http://localhost:3000` (as the task instructed).

## Verdict per claim — all 16 CONFORMANT
1. **CONFORMANT.** `/admin/landing-pages` `[data-lp-tab]` = exactly `["Templates","Deployments"]` (ids templates,deployments). No Pages tab. (src `LandingPagesApp.tsx:1187-1190`.)
2. **CONFORMANT.** No shadow Pages library: no `pages` tab/subview (only subviews lp_list/template_editor/lp_deployment_edit), `TemplateLibrary.tsx` deleted (only `TemplateGallery.tsx` remains), no separate lp-templates collection — `funnel-landing-pages` IS the library.
3. **CONFORMANT.** UI shows 12 `[data-lp-template]` rows; DB `funnel_landing_pages` = 12 rows, all `origin='stock'`, names match the real stock library (Editorial Investigation, Human Recovery Story, Authority Network, Case Value Dossier, Network Authority, Split-Screen Direct, Quiz First, Deadline Signal, Insurer vs Claimant, Case Type Router, 60-Second Check, Answer First). No samples ("MVA Pain First"/"Editorial Test" absent).
4. **CONFORMANT.** `/admin/quizzes` `[data-quiz-tab]` = exactly `["Quiz Flows","Templates","Deployments"]`.
5. **CONFORMANT.** Distinct collections. Flow `FunnelQuizzes` holds logic (`tiers/steps/nodes/custom_fields`); Template `FunnelQuizTemplates` holds presentation (`renderer_key/config_overrides/code/blurb`). No field bleed either way.
6. **CONFORMANT.** LP template row exposes real Preview/Edit/Enable-Disable/Clone/Delete buttons + "New blank template" + "Create with Claude". Exercised live: Clone → real DB row (origin='clone'); Blank create → real DB row (origin='blank', 0→1). Delete of stock warns "archived". (Not exercised end-to-end: the live LLM call behind Create-with-Claude — control present & wired to `createLpTemplate`+wizard; not a no-op.)
7. **CONFORMANT.** Quiz Templates tab: 20 rows, per-card Preview/Clone/Enable-Disable/Delete, "New with Claude" (`data-quiz-template-ai`) + blank create. Actions `createQuizTemplate`/`cloneQuizTemplate`/`createQuizTemplateWithClaude`(invokeLLM) all real. (LLM call itself not exercised.)
8. **CONFORMANT.** Quiz deployment editor `[data-deployment-tab]` = exactly `["General","Destination URL's","Tracking & Pixels"]`.
9. **CONFORMANT.** LP deployment editor tabs = exactly `["General","Destination URL's","Tracking & Pixels"]`.
10. **CONFORMANT.** `Render & Embed`/`Header / Footer`/`Body Sections` gone from BOTH editors. Tab arrays are exactly the 3 above; grep finds those strings only in explanatory comments and on the Brand Identity module ("Default Body Sections"), never as a deployment-editor tab/section.
11. **CONFORMANT.** Quiz Deployment General shows a real `[data-template-gallery="quiz"]` GALLERY with 20 cards; zero template `<select>` dropdown.
12. **CONFORMANT.** LP Deployment General shows `[data-template-gallery="lp"]` GALLERY with 12 cards.
13. **CONFORMANT.** Every card renders both Preview and Select (`TemplateGallery.tsx:298-309`; Select disabled+reasoned when blocked). Verified card0 on both galleries; test:ui audits all 12/20.
14. **CONFORMANT (both sides, DB-confirmed).** LP dep 18: selected card id 13 → Save → DB `landing_page_id`=13 → reload+reopen still selected → restored to 14. Quiz dep 12: selected `sq_editorial_inline` → Save → DB `template_id`=`sq_editorial_inline` → reload still selected → restored.
15. **CONFORMANT (HTTP).** Two live quiz pages on one site: `/s/mva` hydration carries `"templateId":"sq_quiz_first"`, `/s/check-a-case` carries `"templateId":"sq_authority_console"` — each matches its DB `template_id`, cross-exclusive (neither page contains the other's id).
16. **CONFORMANT — fails VISIBLY, no template[0] substitution.** Public resolvers (`lp-deployment.ts:199-206`, `quiz-deployment.ts:283-291`) resolve STRICTLY and return null→404; `resolveForRender`'s fallback is used only downstream of already-canonical ids. Live test: set dep9 `template_id='bogus_no_such_xyz'` → GET `/s/mva` = **HTTP 404** (page contains neither `sq_quiz_first` nor neutral `sq_editorial_inline`); log: `[quiz-deployment] refused: deployment 9 ... matches no quiz template. Not served.` Same for LP (lp row 2 bogus → 404, log `[lp-deployment] refused`). Both restored → 200.

## Suite review (vacuity check)
- **`pnpm test:records`** — 86/0 PASS. Non-vacuous for its scope but **does NOT prove claim 3's DB assertion**: it asserts the CODE registry counts (`listLpTemplates().length===12`, quiz===20) and pure mappings; it never reads `funnel_landing_pages`. Claim 3's "records shown in the tab / rows where origin='stock'" is proven by test:identity + my psql, not this suite. Not a defect, just a coverage boundary.
- **`pnpm test:identity`** — 33/0 PASS. Strong and NOT vacuous: creates real fixtures, asserts `origin='stock'` count ===12/===20 against the live DB (claim 3), A-renders-A / B≠A / repoint-changes-render (claims 14/15), and bad-id-REFUSES-not-substitutes for LP and quiz through the real public resolvers (claim 16), emitting the refusal logs. Would not pass on zero fixtures (it makes them).
- **`pnpm test:ui`** — **151 passed, 0 failed** when run with `LEGALOS_UI_BASE=http://localhost:3000` (full run: clone/delete, LP+quiz deployment tabs, galleries, save/reload, public render + mobile all clean). Its only issue is the **127.0.0.1 default BASE** (see CRITICAL note), which yields false FAILs on every mutating action (I saw 3 on the first run) — a harness default that disagrees with this server's prod CSRF origin. Run with the localhost base and it is fully green.

## Could-not-fully-verify
- Live "Create-with-Claude" LLM round-trip (claims 6/7): control present and wired to `invokeLLM`; I confirmed the non-LLM create paths (blank/clone) persist real rows but did not trigger a real Anthropic generation.
