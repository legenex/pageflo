**VERDICT: FAIL**

Reviewed: production SHA 797d9c4 (verified by ssh; still 797d9c4 at the end). Repo HEAD moved to 38659bd during the review ("Lock consent and delivery evidence against direct edits; Delivered filter reads state only"); that fix is NOT deployed and was not tested here. Mutation runs used a worktree at 797d9c4.

## Run id and records
Run id `b0926a`. All writes on the acceptance Brand only.
- Lead 26: Bugsy / Consent b0926a, bugsy-b0926a@legenex.test, UTMs bugsy/qa/b0926a, visitor UI (standalone quiz, 390px).
- Lead 32: Bugsy / Consent b0926a-retry, bugsy-b0926a-retry@legenex.test, visitor UI, delivery-failure and retry lead.
- API leads (6 of max 10): 27 (B5), 28 (B6), 29 (B7), 30 (B8), 31 (CSV formula probe, email bugsy-b0926a-api-9@legenex.test). B1-B4 created nothing (400).
- Temporary webhook `bugsy-unreachable` (.invalid): added, removed, and verified 0 webhooks on two separate fresh loads (d-webhook-remove-final.png, d-webhook-check-final.png).

## Checks
| # | Check | Result | Evidence |
|---|---|---|---|
| A1 | Quiz form shows Brand TCPA beside UNCHECKED checkbox (standalone /s/ and embedded /c/, 390px) | PASS | a-quiz-form-390.png, _a3 output: "checkbox count 1 checked false" both surfaces |
| A2 | Unchecked submit blocked, visible message, role=alert, not colour-only, nothing sent | PASS | role="alert", text "Please check the box to agree before continuing." with warning glyph plus ring; POSTs to /api/leads = 0; a-s-probe-error-390.png |
| A3 | Keyboard operation; label click toggles | PASS | Tab reaches checkbox, Space toggles; clicking the text toggles (both surfaces). Note P2-2 on tab order |
| A4 | Back and re-entry | PASS with note | consent resets to unchecked on re-entry (safe), but typed contact fields are also cleared (P2-3) |
| A5 | Slow lead POST cannot show thank-you first; thank-you stable | PASS | POST held 6s: endpoint first visible at 7620ms, stable after 3s; a-s-final-thankyou-390.png, a-s-final-during-slow-post.png |
| A6 | Website Lead form block (home) | PASS (unchecked/blocked only) | a-home-leadform-error-390.png: unchecked, role=alert, 0 POSTs, label toggles. Successful submit not exercised (lead cap) |
| A7 | Embedded quiz identical behaviour | PASS for form/validation; final submit NOT done (one-lead rule) | a-c-probe-*.png |
| B | API consent attacks | PARTIAL FAIL | B1 accepted:false 400; B2 "true" 400; B3 missing text 400; B4 100KB 400 (max 8000); B5 other site_slug + forged x-forwarded-host: 200, filed under acceptance Brand (host wins), `extra` kept in quiz_answers (bugsy_extra_field); B6 script tag: 200, stored raw (see D-3); B7 no consent: 200, "Not recorded"; B8 forged text + 1999 client date: 200 accepted (D-1) |
| C | Lead console evidence for lead 26 | PASS | contact, Brand, source path /s/..., deployment 25, funnel mva, host, answers, UTMs (bugsy/qa/b0926a), exact disclosure, accepted_at 2026-09-26T00:32:22Z (server time), method checkbox_unchecked_default, phone "Unavailable: not configured" (stored HLR state not_configured), history lead.captured, delivery.queued, delivery.processing, downstream.completed, no queue_unavailable; c-lead-26-*.png |
| C2 | Old leads 12, 13, 14 | PASS | readable, Consent "Not recorded", Delivery "No destination configured" (history: only downstream.completed), phone "Unavailable: not configured" derived from old ok/error rows; c-lead-12/13/14-*.png |
| C3 | Delivery filter | FAIL | D-2 |
| C4 | CSV export | PASS | consent_accepted, consent_accepted_at, consent_disclosure_text, delivery_state columns; formula cells prefixed: `'=Bugsy1+1`, `'=HYPERLINK(...)`, `'+15550100888` (_export.csv) |
| D | Retry | PASS | webhook added; lead 32 = Failed ("0 of 1 destinations delivered"); Retry delivery control present; dblclick produced exactly ONE delivery.retry_requested and one extra processing pass; confirmation "Retry queued. Steps that already succeeded will not be repeated."; history shows retry_requested, "retry pass 2", second webhook.bugsy-unreachable attempt beside the first; state stays Failed (honest). Non-failed lead 26: no Retry control (0 occurrences in all delivery dumps). Server-side refusal of a non-failed lead NOT exercised directly. d-lead32-*.png |
| E | Harness review and mutation | see below | |
| F | Regression sweep | PASS with notes | /, /privacy, /terms, /adv/qa-acceptance 200 no junk; /nope 404; both health endpoints 200; visible text on quiz/LP has no `{{`. See P2-4, P2-5 |

## Defects
- **D-1 (P1) Forged consent accepted.** POST /api/leads with `consent:{accepted:true, disclosure_text:"Bugsy forged: visitor never saw this text.", client_accepted_at:"1999-..."}` returns 200; lead 30 stores it and the console shows "Yes, by checking an unchecked box" with the Brand, host and deployment attached. Same with a truncated real sentence (lead 27). The server never compares the text to the Brand's `tcpa_text` and cannot tell a checkbox click from a curl. Expected: reject or mark unverified any disclosure that is not the Brand's current text, or label the record as client-asserted. Actual: evidence looks server-verified.
- **D-2 (P1) "Delivered" filter contains leads that read "No destination configured".** /admin/leads?delivery=delivered lists legacy leads 12-16 (each modal says "No destination configured"); the "No destination configured" filter omits them (matches 11 others). Cause: legacy fallback `delivery_log.ok = true` in query.ts. Repro: filter Delivery = Delivered. Note: HEAD 38659bd claims to fix this; undeployed, unverified.
- **D-3 (P2) Disclosure sanitising not applied server-side.** Lead 28 stores `<script>alert('bugsy-xss')</script><img ... onerror=...>I agree` verbatim (also in CSV and in the webhook payload's consent). Console renders it escaped (no execution seen), so no XSS observed, but "plain text, sanitised" is only true for the browser path.
- **D-4 (P2, design) No consent enforcement downstream.** Lead 29 (no consent object) is captured and passes through delivery the same as a consented one. When a Brand has a webhook, an unconsented lead would be sent to it. Also, if a Brand has no TCPA text the quiz shows no checkbox and posts no consent.
- **D-5 (P2) React hydration error #418 on /admin/leads** (list) and on opening a lead modal (pageerror each load). Page still works.
- **P2-2** Consent sits after Back/Next in DOM, so Tab order is zip, Back, Next, checkbox; pressing Space on Next-then-Tab works but the checkbox is below the submit button.
- **P2-3** Back then re-entry wipes the typed contact fields.
- **P2-4** Quiz page source ships the webhook nodes (URL api.legenex.com/mva-tier-lookup, `Authorization: Bearer {{twilio_token}}` template) to every visitor as serialised flow JSON. Pre-existing, not from this cycle.
- **P2-5** Every quiz visit gets HTTP 502 from /api/pageflo/quiz-webhook (upstream node call fails; non-fatal by design, but noisy and untracked).
- **P2-6** Delivery log timestamps shown to the minute only; makes ordering of retry steps hard to read.

## Mutation results (worktree at 797d9c4, node_modules symlinked, suites test:leads-ui / test:delivery)
| Mutation | Caught? |
|---|---|
| M1 no-destination reads delivered | Caught (3 fails) |
| M2 provider error reads "Not checked" | Caught (2) |
| M3 TrustedForm URL counts as consent | Caught (1) |
| M4 retryable = true | Caught (3) |
| M5 settledSteps empty | Caught (1) |
| M6 passAlreadyCompleted false | Caught (1) |
| M10 consent keys left in answers | Caught (1) |
| M11 sanitiser disabled | Caught (2) |
| M12 pipeline ignores settled steps | Caught by test:delivery (1) |
| **M7 route accepts consent.accepted=false** | **NOT caught** (68 passed) |
| **M8 Delivered filter also matches no-destination** (the D-2 class) | **NOT caught** (68 passed) |
| **M9 BullMQ job id back to `lead:<id>`** (the exact queue defect fixed this cycle) | **NOT caught** (test:delivery 38 passed) |

Other harness observations: test-leads-ui.mts `t(cond: unknown, ...)` accepts any truthy value with no evidence string (the hygiene rule covers only production harnesses); production acceptance H asserts consent evidence with weak regexes (`/accepted/` and `/unchecked box/`) and answers with `!/No answers stored/`; acceptance run A rewrites the Brand TCPA to the same constant it later compares against (circular, though it does prove persistence).

## Not verified
- Successful embedded (/c/) and home Lead-form submit (one-lead limit); only their blocking behaviour.
- Server-side refusal of retry for a non-failed lead and for a viewer without edit rights (no second account, no direct action call).
- Direct Payload write to consent/delivery_log by a Brand editor (the P1 HEAD 38659bd addresses); no editor account.
- Advertorial starter-copy refusal (item 6) and the five paused pin deployments: not exercised (no publish allowed).
- Stalled and retry-pending states, and partial delivery, not observed live.
- test:consent, browser suites, production build: not run per instructions.
