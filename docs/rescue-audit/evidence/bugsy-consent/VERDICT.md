**VERDICT: PASS**

Round 2. Round 1 (FAIL, production 797d9c4) is kept as round1-VERDICT-FAIL.md. Live checks ran against production 01a08b7 (it advanced to 88fdc34, a run.ts-only change, at the end; the visitor and console behaviour below was observed on 01a08b7 and 88fdc34 differs only by the inline-delivery lock in run.ts, which I did not re-exercise). Mutations ran on a worktree at repo HEAD e27d641. PASS means zero P0 and zero P1 found; the P2 items below are real.

## Records (run b0926a, acceptance Brand only)
- Round 1: leads 26, 32 (visitor), 27-31 (API); webhook added and removed.
- Round 2: API leads 35 (B5), 36 (B6), 37 (B7), 38 (B8), emails bugsy-b0926a-r2-{5..8}@legenex.test; lead 39 = embedded quiz (/c/) visitor lead, Bugsy / Consent b0926a-emb, bugsy-b0926a-emb@legenex.test. (Leads 33, 34 are not mine.) No webhook was added in round 2; round 1 removal was verified twice.

## Round 2 results
| Check | Result | Evidence |
|---|---|---|
| D-1 forged consent (B8: forged text + 1999 clock) | FIXED, with caveat | 200, lead 38 stored with method `checkbox_disclosure_unverified`; console: "Yes, by checking an unchecked box; the text could NOT be verified against this Brand's TCPA text". Real Brand text (leads 35, 39) shows method `checkbox_unchecked_default` and "the text matches this Brand's TCPA text". Caveat P2-A |
| B5 other site_slug + forged forwarded host + extra | PASS | lead 35 filed under acceptance Brand, host = preview host, `extra` stored |
| B6 script tag | PASS (mostly) | lead 36: `<script>` removed, method unverified. Caveat P2-B |
| B7 no consent | PASS | lead 37 "Not recorded" |
| D-2 Delivered filter | FIXED | ?delivery=delivered now returns 0 leads; legacy 12-16 no longer listed. Caveat P2-C |
| Embedded quiz successful submit (lead 39) | PASS | POST source_entity_id `lp:28`, funnel_path /c/..., thank-you first visible at 7109ms with POST held 6s, stable; console shows accepted, matching text, delivery "No destination configured", phone "Unavailable: not configured" |
| Earlier passes re-run (standalone quiz, 390px): unchecked block, role=alert, 0 POSTs, keyboard Space, label click, Back/re-entry, slow-POST thank-you | PASS | _a3 output, round2/ and a-s-probe-*.png |
| CSV export | PASS | formula-safe (round 1), consent and delivery_state columns present; no consent-method column (P2-A) |
| Health endpoints | 200, 200 | |
| Advertorial starter-copy refusal | NOT VERIFIED | optional, would need a publish |

## Mutations at HEAD e27d641
| Mutation | Result |
|---|---|
| M9 job id back to `lead:<id>` | CAUGHT by new `pnpm test:queue` (2 fails; needs REDIS_URL, which is not set by default: without it the test exits 2 with "cannot exercise the queue", so it is skipped in any environment without Redis) |
| M8 Delivered filter also matches no-destination | NOT CAUGHT: test:leads-ui 75 pass, test:delivery 42 pass. The new filter test only asserts the generated where-clause does not contain the string "delivery_log", so widening the state set passes |
| M7 route accepts consent.accepted=false | NOT CAUGHT by test:leads-ui (75) or test:delivery (42); only the browser suite test:consent could cover it and I was told not to run it |
Baseline: test:leads-ui 75 passed; test:queue 6 passed.

## Remaining defects (all P2)
- P2-A: an unverified (forged-text) consent still reads "Accepted" in the list column and Summary field and `consent_accepted=yes` in CSV; only the evidence block and the method field say unverified, and CSV has no method column. Delivery is not gated on consent either (unconsented lead 37 passes through delivery like the others).
- P2-B: server strips `<script>` but stores a leftover `<img src=x onerror=alert(1)>I agree` as text (lead 36). Rendered escaped, no execution.
- P2-C: legacy leads 12-16 read "No destination configured" in the row and modal but appear under no Delivery filter except Any (no persisted state, so not in No destination; they have log rows so not in No delivery record).
- P2-D: tests M7 and M8 above; test:queue silently unavailable without REDIS_URL.
- P2-E: React hydration error #418 still thrown on /admin/leads and the lead modal.
- P2-F (unchanged from round 1): checkbox is after Back/Next in tab order; Back clears typed contact fields; quiz page source ships webhook node config (incl. `Authorization: Bearer {{twilio_token}}` template); every quiz visit gets a 502 from /api/pageflo/quiz-webhook; delivery log times shown to the minute.

## Not verified
- Advertorial starter-copy refusal and the paused pin deployments.
- The direct-edit lock on consent/delivery fields (needs a Brand editor account).
- Retry after this round's changes (retry passed in round 1 on 797d9c4; not re-run, and 88fdc34 changed the inline-delivery lock).
- Server-side retry refusal for a non-failed lead; stalled, retry-pending and partial states.
- test:consent and browser suites (instructed not to run).
