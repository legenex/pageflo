# Reviewer E — Runtime / QuizRuntime / lead / webhook (adversarial, read-only)

Branch `claude/legalos-final-integration-gvvtr8`. Production build on http://localhost:3000.
Live funnels driven in a real Chromium (logged in as admin, `?site=check-a-case` preview channel):
- **Standalone quiz**: `/s/mva?site=check-a-case` → deployment 9 → quiz 6 ("MVA Tiered Quiz", the real 18-step flow w/ webhook tier-lookup).
- **LP-embedded quiz**: `/c/check-a-case?site=check-a-case` → LP deployment 18 → embeds quiz deployment 12 → quiz 6.

Lead table started at 0 and was returned to 0. Every created lead id is recorded and was deleted.

## EXACTLY-ONE-LEAD PROOF (items 13 & 14) — hard evidence

| Path | leads before | POST /api/leads (browser net log) | leads after | row created | event_id |
|---|---|---|---|---|---|
| Standalone `/s/mva` | 0 | **1** | 1 | id 12, src=quiz dep 9, email+phone captured | d224270f… |
| LP-embedded `/c/check-a-case` | 0 | **1** | 1 | id 13, src=quiz dep 12 | 5b604baa… |

`data-quiz-root` count = **1** on both pages (one live runtime, no double-mount). Each path independently => exactly +1 row and exactly 1 POST. Rows deleted after.

## Per-item verdict

1. **Advance + capture answers — CORRECT (both).** Both funnels advanced through welcome→state→date→(webhook)→details→injury→…→lead form→endpoint. Lead row's `quiz_answers` held the chosen answers (accident_type, incident_date, injury_type, treatment_type, fault, attorney, insurance, accident_details) and contact split into contact_* columns.
2. **Conditional routing — CORRECT.** Live quiz has `dq_decision` (routes dq_lead=yes→dq_form) + welcome idx3→`branch` (non-sequential). Proven at model level by `pnpm test:flow` (3564 paths, dangling-fallthrough, decision default/empty-conditions) and behaviorally by `pnpm test:e2e` (answer A→ALPHA / answer B→BRAVO, deliberately non-sequential steps).
3. **Backtracking — abandoned branch does NOT persist — CORRECT (decisive empirical proof).** On live `/s/mva`: filled `accident_details="ABANDONMARK-should-not-persist"`, advanced 2 steps deeper, clicked Back to the details step → **textarea value after Back was `""` (wiped)**; refilled `"FINALMARK…"`, completed. Final lead: `accident_details="FINALMARK-only-this-should-persist"`; **ABANDONMARK present in 0 lead rows**. Mechanism: `QuizRuntime.goBack` restores the full pre-answer value snapshot pushed in `handleAnswer` (`QuizRuntime.tsx:344-359`).
4. **Stale downstream cleanup — CORRECT.** Same test: the deeper answers set before backtracking (injury/treatment) were wiped by the snapshot restore and re-answered on the retaken path; no duplicate/stale keys in the final `quiz_answers`. Structurally guaranteed by full-snapshot restore.
5. **Progress indicator — CORRECT.** `data-quiz-progress` = round(stepIdx/(totalSteps-1)*100) and the bar width = (stepIdx+1)/steps*100 both advance per step (`templates.tsx:157`, `QuizRuntime.tsx:451`). e2e asserts it strictly increases.
6. **Tier t1–t4 at executor boundary — CORRECT (code + test:webhook 133/0).** `decideTier` (`quiz-webhook/tier.ts`): (1) `answerTier` (answer.setTier) wins first and is not "fromProvider"; (2) a returned tier routes ONLY if `declared.includes(returned)`; (3) undeclared/invalid/blank → tier left unchanged, value still carried onto the lead, rejection logged, never routed. Runtime wires it as `nextTier = answer.setTier || webhookTier || currentTier` and only takes `webhookTier` when `decision.fromProvider` (`QuizRuntime.tsx:291-309`).
7. **Webhook failure modes — CORRECT (code + test:webhook + REAL runtime).** `pnpm test:webhook` proves timeout→transport, non-JSON/HTML-shell→not_json, HTTP 400/401/403/404/405/429/5xx→http_status, and real SSRF guard refusals (169.254.169.254, 127.0.0.1, ::1, file://, gopher://) — each degrades with no throw. **Live runtime confirmation**: the shipped tier-lookup posts to `https://api.legenex.com/mva-tier-lookup`, which failed in this env; both funnels still completed and captured the lead **with no `tier`** in quiz_answers (untiered/degraded), never hung, never routed to a wrong tier.
8. **Double / rapid submit — CORRECT (1 lead).** 3 rapid clicks on the final submit → **exactly 1 POST, exactly 1 row** (id 14). Guard: `submittedRef` set synchronously at top of `submitOnce`, and the form is unmounted once the endpoint renders. (See finding F-E1 for the server-side idempotency gap.)
9. **Refresh mid-quiz — CORRECT (clean reset).** Answered 1 step (on "What State…"), reloaded → runtime reset to step 1 (progress=0), no pageerror, **0 leads** created from the partial. State is not persisted/restored across reload, but there is no crash and no duplicate/partial lead.
10. **Embed vs standalone isolation — CORRECT.** Exactly one `data-quiz-root` per page; embedded quiz state is component-local (`useState`), no shared globals; standalone and embedded each produced exactly one independent lead. e2e also asserts both mount React with identical markers.
11. **Consent / TCPA — OBSERVATION / GAP (F-E2).** There is **no consent checkbox** — `canSubmit` only requires the required contact fields (`preview.tsx:257`); the TCPA text (`brand.legal.tcpaText`) is display-only (`preview.tsx:350`). So a lead submits with consent *implied*, nothing to "bypass". The Leads collection has **no explicit consent/tcpa/agreed field** — the only machine-readable consent proof is `trustedform_cert_url`/`jornaya_lead_id`, and on these live deployments those vendor scripts aren't wired, so both were **null**. Net: a completed lead on these funnels carries zero affirmative consent artifact beyond the fact the TCPA text was rendered. Whether acceptable depends on compliance intent; flagged.
12. **Destination behavior — CORRECT.** `[data-quiz-endpoint]` rendered after submit on every run (no crash). Redirect URL resolves deployment→brand→site page; `test:flow` `destination_validity` rejects unsafe/js:/protocol-relative and falls back to the site's own page, so a missing/failed destination degrades to the endpoint's own thank-you card rather than a wrong-brand redirect.

## Independent test-suite re-run + assertion audit

- `pnpm test:flow` → **202 passed, 0 failed**. Model-level, no DB. Real (negative controls per check).
- `pnpm test:webhook` → **133 passed, 0 failed**. Executor + tier decision; SSRF case runs the real guard. Real.
- `pnpm test:e2e` → **34 passed, 0 failed** (own `next start`, real Chromium, real DB). Assertions are **real, not vacuous**: `leadPosts.length === 1` per path *after a 2s settle* (catches a late duplicate), and `leads.totalDocs === 2` (exactly one row per path — `=== 2`, not `> 0`), plus distinct event_ids. It uses a purpose-built 5-node fixture (not the shipped MVA quiz), so it proves the runtime, not the specific live deployment — which is why I additionally drove the live funnels above.

## FINDINGS

- **F-E1 (medium, code-level, not forceable in-browser here): no server-side lead idempotency; the client retry can double-submit.** The task premise ("event_id dedupe, `event-id.ts`") is inaccurate — `event-id.ts` mints a fresh random id **per request** for pixel/CAPI matching; it is **not** a dedupe key, and `runLeadPipeline` always `payload.create`s with no lookup (`run.ts:73-108`). The only dedupe is the client `submittedRef`. `submitOnce` retries once on `!result.ok` and **releases the ref on failure** (`QuizRuntime.tsx:205-221`); if attempt 1 reaches the server and creates the lead but the *response* is lost, attempt 2 creates a **second** lead (and fires CAPI/webhooks/Slack again to buyers). Documented trade-off ("a completed quiz is the most expensive thing to drop") but there is no idempotency key to make it safe. Recommend a client-minted idempotency token deduped server-side.
- **F-E2 (medium, compliance): implied-only consent with no explicit consent field.** See item 11. No checkbox gate; no consent column on `leads`; TrustedForm/Jornaya absent on the live preview deployments → consent captured only as displayed text.

## Untestable here / caveats
- Real webhook *success* tier-routing (t1/t2/t4) can't be exercised live — the configured endpoint fails in this env; covered by `test:webhook` with injected providers.
- F-E1's duplicate-on-lost-response requires network-fault injection (server processes request, client loses response); confirmed by code path only.
- TrustedForm/Jornaya consent capture requires the vendor scripts on the Site's TrackingConfig; not present on these deployments.

## Cleanup
Created leads: 12, 13, 14, 15 — all deleted. Final `select count(*) from leads` = **0**. Probe scripts (`scripts/.probe-runtime.mts`, `scripts/.probe-backtrack.mts`) removed. No committed source modified.
