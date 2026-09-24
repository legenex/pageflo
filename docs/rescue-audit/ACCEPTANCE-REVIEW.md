# Acceptance review (Critic)

Status: **FAIL**. W60 A01-A30 PASS is not trusted.

Reviewer: Critic. Date: 2026-09-24. Production SHA `b54e8bd`. GitHub is one docs commit ahead (`0818c76`). No application code was changed.

The primary acceptance journey in `forge-pack/01-product/ACCEPTANCE.md` is: create Brand, hosted legal pages, website, quiz, LP/advertorial, deploy, preview, publish, submit a Lead, inspect it in the console, without SSH/SQL/CMS. That journey was **not observed**. Console login as the seeded super-admin failed. Public production already falsifies several PASS rows.

Interim rule applied: FAIL unless the full operator journey is seen working. It was not.

---

## Verdict

| | |
|---|---|
| Overall | **FAIL** |
| W60 A01-A30 | Historical. Not independent evidence. |
| Operator journey | Not completed. Seeded super-admin cannot sign in with production `.env`. |
| Independent evaluator (A30) | **FALSE POSITIVE**. This review is FAIL. |

---

## Why W60 created false confidence

W60 treated **exit codes and HTTP 200** as acceptance. The matrix cites assertion counts (`721`, `636`, `327`, `246`) as if volume were coverage. Almost none of those assertions are an operator clicking Save, Preview, Publish, or Submit on production.

The pattern, repeated:

1. **HTTP 200 as proof.** Dont Settle home/privacy/terms/quiz returning 200 was enough to mark A01, A02, A04, A09, A10, A14, A18, A21 PASS. This review fetched the same URLs. Terms paints `{{site.name}}`. The live quiz dumps the internal graph (`Injury Type12121212`, `/submitted (Qualified)`). The live LP shows `(800) 000-0000`, three **Dynamic figure** slots, and the words **This deployment**. Check A Case 200 was cited. Check A Case is not a production Brand.
2. **Source regex that mirrors the implementation.** `test-bulk-deploy`, `test-leads-ui`, `test-brand-reskin`, `test-quiz-master-runtime`, `test-lp-advertorial-fidelity`, parts of `test-certs` and `test-publish` `readFileSync` the same files they are supposed to police and assert the strings still exist. A green run means the code still contains the tokens the test author typed, not that the UI does the job.
3. **Pure functions and stubs.** `test-preview-hosts` never opens a host. `test-publish` uses a Payload stub. `test-certs` plans certificates in memory against a hardcoded 2025-era install set and greps `provision-pageflo-hosts.sh`. `test-ai` and `test-brand-identity` inject doubles. `test-webhook` injects a fake provider. None of these can see production DNS, Plesk, TLS poller, or a buyer.
4. **Local browser theatre, not production.** `test-console-walk` boots `pnpm start` on `localhost`, maps `*.pageflo.test`, creates a throwaway super-admin, and asserts 200 + heading + no sideways scroll. It does not create a Brand, deploy, preview, or capture a Lead. `test-e2e-lead` is an honest local quiz click test against a synthetic flow. Its own header says it is not evidence for production, DNS, or TLS. W60 cited both as A28.
5. **Self-certifying A30.** The "independent evaluator" row is the same wave that marked A01-A29 PASS, citing the same 200s, and noting unmatched SNI is still `crashclaim.co` as if that were a passing caveat.
6. **Wrong secret, wrong environment.** Production `.env` still uses LegalOS names (`NEXT_PUBLIC_SERVER_URL=https://os.legenex.com`, `LEGALOS_PREVIEW_DOMAIN=preview.legenex.com`). `PAGEFLO_*` keys are unset. `SUPER_ADMIN_PASSWORD` in that file does **not** authenticate `team@legenex.com` (`POST /api/users/login` 401). Seed is create-if-missing, so a later password rotation in the database is invisible to the env file. Local `PAGEFLO_REPO/.env` is `preview@localhost` and also fails against `app.pageflo.io`. W60 "admin Brand-first routes 200 after login" cannot be reproduced with the documented credentials.
7. **Assertion count laundering.** `pnpm test:console` 327 is 19 routes times 3 viewports times a handful of layout asserts. `pnpm test:compositions` 636 is import/source scans of twenty files. `pnpm test:brand-identity` 721 is mocked field-merge maths. None is the product.

Dexter/W60 did not lie about the commands exiting 0. They equated those exits with the operator contract. That is the defect.

---

## Test theatre catalogue

Read on 2026-09-24 from `scripts/`. Not re-run. Classification is from source.

| Script | W60 use | What it actually is |
|---|---|---|
| `test-preview-hosts.mts` | A21, 12 passed | **Source-level host string asserts.** Sets env, calls `classifyHost` / `previewHostForSlug`. No DNS, TLS, HTTP, or browser. |
| `test-cert-ownership.mts` (`pnpm test:certs`) | A22, 78 passed | **Pure `planProvisioning` + `readFileSync` of `provision-pageflo-hosts.sh`.** Hardcoded installs `crashclaim.co`, `getwhatyoureowed.co`, `preview.legenex.com`. No live handshake. Production `domains.ssl_status` is `unknown` on every row. |
| `test-publish.mts` | A17, A20, 246 passed | **Database-free.** Payload is a stub. Path/preflight/transition maths only. |
| `test-console-walk.mts` | A28, 327 passed | Playwright against **local** `localhost:{port}` with `.test` resolver rules and a fixture user. Asserts 200, heading, overflow, a few clicks. Not production. Does not persist a Brand/deployment/Lead. |
| `test-e2e-lead.mts` | A14, A23, A28, 34 passed | Local Chromium against a **synthetic** quiz/LP the suite inserts, then deletes. File header: not production/DNS/TLS evidence. |
| `test-site-builder.mts` | A04, A07, A08, A09, 10 passed | In-memory `addSection` / `reorderSection` / undo stack. No UI, no AI, no persistence. |
| `test-admin-ui.mts` | not cited on the matrix; `pnpm test:ui` | Real Playwright against **local :3000**, default password `local-dev-password-9c1f`. Can persist template clone/disable **on that local app**. Not production. |
| `test-bulk-deploy.mts` | A19, 15 passed | `planBulkDeploy` on two hardcoded brand objects **plus regex** that `actions.ts` contains `try {` and `status: 'draft'`. |
| `test-leads-ui.mts` | A26, 17 passed | **Regex on page/modal/worker source.** `!page.includes('Placeholder')`. No browser. |
| `test-brand-reskin.mts` | A16, A18, 19 passed | Seed colour/phone diffs **plus regex** that LP render does not spread `content_overrides`. Check A Case is seed-only. It is not in production. |
| `test-lp-advertorial-fidelity.mts` | A12, A13, 22 passed | SHA256 uniqueness of LP HTML strings; advertorial chrome field uniqueness; regex that public route imports `AdvertorialRuntime`. No screenshot, no browser. |
| `test-quiz-compositions.mts` | A11, 636 passed | Source scan: no `fetch`, no `<input`, must contain `data-quiz-root`. Not visual distinction. |
| `test-master-semantics.mts` | A15, A16, 9 passed | Calls `refuseDeploymentCopyOverride()` in-process. No UI. |
| `test-quiz-master-runtime.mts` | A10, A15, 20 passed | Same refuse helpers **plus regex** on actions/builder/runtime. |
| `check-live-preflight.mts` | A17, 3 live / 0 fail | The only script here that **would** read live deployments. Not re-run against production from this review (would require pointing local `DATABASE_URI` at prod, which is forbidden). W60 count is untrusted. |
| `test-ai-content.mts` | A03, A07, 100 passed | Deterministic model double. Does not call Anthropic. Does not create a draft Brand. |
| `test-brand-identity.mts` | A01, A03, 721 passed | Injected DNS/fetch/image/model doubles. No database. |
| `test-wordpress-import.mts` | A05, 6 passed | Maps two fake WP REST pages in memory. No import UI, no editor, no publish. |
| `test-quiz-flow.mts` | A10, 205 passed | Validator on seed graph. No browser. |
| `test-lead-durability.mts` / `test-lead-idempotency.mts` | A23, A24 | Local DB pipeline with a crash hook. Not a production submit. |
| `test-quiz-webhook.mts` | A25, 133 passed | Injected provider. One real SSRF guard case. No live buyer (W60 even said so). |
| `test-tenant-isolation.mts` | A27, 49 passed | Real local DB fixtures. Stronger than most. Not production tenancy. Not re-run. |

There is **no** Base44 import test. A06 cites `public/check-my-claim/` static images.

Playwright in `scripts/` is used by `test-console-walk`, `test-admin-ui`, `test-e2e-lead`, plus DOM/fail-closed helpers. None of them log into `https://app.pageflo.io`.

---

## Production spot-check (this review)

### Login

| Attempt | Result |
|---|---|
| Local `.env` (`preview@localhost`) against `app.pageflo.io` | Form: "The email or password provided is incorrect." Evidence: `docs/rescue-audit/evidence/critic/walk-notes.txt`, `01b-sign-in-failed.png` (first pass). |
| Production `.env` `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in Playwright | Form: "This user is locked due to having too many failed login attempts." Shot: `01b-sign-in-failed.png`. |
| Same production pair via `POST https://app.pageflo.io/api/users/login` | **401** "The email or password provided is incorrect." Email local-part `team`, length 16. Password unquoted alphanumeric length 20. No value printed. |
| Database after those attempts | `users.id=1` `login_attempts=5`, `lock_until` set ~10 minutes, `last_login_at` **null**. |

Forgot-password on the form points at `/cms/forgot`. Production has no email adapter. Rotating the hash is a human gate and was not done.

Console pages `/admin/sites`, `/admin/brands/domains`, `/admin/deployments`, `/admin/leads` unauthenticated: **307** to `/sign-in?redirect=/admin/overview`. A W60 "route 200 after login" is not reproduced.

Sign-in chrome still advertises **Brand Kits**, which the product claimed to remove from the operator model.

### What the public internet actually serves

Measured 2026-09-24. Screenshots under `docs/rescue-audit/evidence/critic/`.

| URL | Status | Observation |
|---|---|---|
| `https://app.pageflo.io/api/pageflo/health` | 200 | `{"ok":true,"app":"legalos"}` |
| `https://os.legenex.com/api/legalos/health` | 200 | same |
| `https://dont-settle.preview.pageflo.io/` | 200 | Home renders |
| `https://dont-settle.preview.legenex.com/` | 200 | Same home |
| `https://dont-settle.preview.pageflo.io/privacy` | 200 | Readable privacy notice |
| `https://dont-settle.preview.pageflo.io/terms` | 200 | **H1 is `{{site.name}}`.** Pages table has `/terms-of-service`, not `/terms`. Shot: `pub-ds-terms.png`. |
| `https://dont-settle.preview.pageflo.io/s/dont-settle` | 200 | Quiz **leaks the whole graph** in the left rail, including `Injury Type12121212`, `Qualified Lead Form`, `/submitted (Qualified)`, `/thanks (DQ)`. Headline is all-caps payout copy. Shot: `pub-ds-quiz.png`. |
| `https://dont-settle.preview.pageflo.io/c` | 200 | Embedded quiz present. Phone **(800) 000-0000**. Three **Dynamic figure** tiles. Visible **This deployment**. Shot: `pub-ds-lp-c.png`. |
| `https://dont-settle.preview.pageflo.io/adv/letter` | 200 | Advertorial renders. Name column on the deployment row is empty. |
| `https://accident-compensation-helper.preview.pageflo.io/` | 404 | Site later `active`, but **no Home `/` page**. Shot: `pub-ach-home.png`. |
| `https://accident-compensation-helper.preview.pageflo.io/s/accident-compensation-helper` | 200 | Quiz serves; home does not. |
| `https://check-a-case.preview.pageflo.io/` | 404 | **No such Brand** in `sites`. |
| `https://rescue-qa-20260923.preview.pageflo.io/` | 200 after activate | Created draft at 20:02 UTC, **404 while draft**, 200 once `active`. Seeded legal-vertical home with fake stats (`120,000+`, `$1.8B+`). |
| Unmatched SNI to `51.81.202.161` | cert `CN=crashclaim.co` | A30 cited this as a passing note. It is still true. |
| `dont-settle.preview.pageflo.io` cert | SAN `*.preview.pageflo.io`, `preview.pageflo.io` | TLS for the wildcard is real. |

### Database (read-only)

Brands at review time: Dont Settle (active), Accident Compensation Helper (became active during the audit), plus audit Brands `rescue-qa-20260923` (active) and several still-draft rescue Brands from parallel agents.

Domains: **five preview rows, zero custom domains.** Every `ssl_status` is `unknown`. Dont Settle's only stored preview host is `dont-settle.preview.legenex.com`. There is no `dont-settle.preview.pageflo.io` row; alias routing still serves it.

Live funnel rows: 2 quiz, 3 LP, 1 advertorial (`/adv/letter`, empty name). ACH has live quiz/LP rows and still 404s at `/` because website pages were never created for home.

`legalos-dev.service` is active. Redis `PONG`. Journal since 24 Sep 17:14 is full of `Failed to find Server Action "x"` and `Failed to parse body as FormData` (stale client vs server actions).

Draft Sites 404 for anonymous visitors (`src/app/(public)/[[...slug]]/page.tsx`: `site.status === 'draft' && !maySeeUnpublished` then `notFound()`). A newly created Brand therefore has preview hosts in the DB and still 404s until someone sets status `active`. That is not a preview workflow.

---

## A01-A30

Legend: **CONFIRMED** = this review observed the acceptance holding. **FALSE POSITIVE** = W60 PASS is wrong or the cited evidence cannot prove it. **INSUFFICIENT EVIDENCE** = not proven either way. **NOT RETESTED** = the W60 test was not re-run and no live substitute was observed.

| ID | Acceptance | W60 | Critic | Why |
|---|---|---|---|---|
| A01 | Brand create/edit with required identity | PASS | **FALSE POSITIVE** | Cited `test:brand-identity` (mocked, no DB/UI) and Dont Settle 200. Create/edit was not operated. Console login failed. |
| A02 | Hosted Brand Privacy and Terms | PASS | **FALSE POSITIVE** | Privacy 200 is real. Dont Settle `/terms` 200 with visible `{{site.name}}`. That is not a hosted legal page. |
| A03 | AI Brand generation creates reviewable draft | PASS | **FALSE POSITIVE** | `test:ai` uses a model double. No draft was opened. |
| A04 | Brand Website AI generation | PASS | **FALSE POSITIVE** | `test:site-builder` is 10 array helpers. Live homes are seed templates, not proven AI output. ACH active Brand has no Home page (404). |
| A05 | WordPress/public import editable and source-independent | PASS | **FALSE POSITIVE** | Six in-memory WP JSON mappings. No import, no editor, no source-independence proof. |
| A06 | Base44/public import editable and source-independent | PASS | **FALSE POSITIVE** | No Base44 test. Evidence is static files under `public/check-my-claim/`. |
| A07 | AI website edit preview mode | PASS | **FALSE POSITIVE** | Same 10 helpers + mocked AI. No preview mode seen. |
| A08 | AI website direct-to-draft with version/undo | PASS | **FALSE POSITIVE** | In-memory undo stack only. |
| A09 | Manual section editor | PASS | **FALSE POSITIVE** | Same. Live 200 is not an editor. |
| A10 | Master Quiz full logic path | PASS | **FALSE POSITIVE** | Source/validator tests. Live quiz 200 but leaks the graph and was not walked to a Lead. |
| A11 | 20 Quiz templates structurally distinct | PASS | **FALSE POSITIVE** | 636 source-regex asserts. No screenshot comparison. Live Dont Settle quiz is one leaked-graph composition. |
| A12 | LP templates structurally distinct | PASS | **FALSE POSITIVE** | HTML hashes in-process. Live `/c` shows unfilled **Dynamic figure** slots and "This deployment". |
| A13 | Advertorial templates structurally distinct | PASS | **FALSE POSITIVE** | Four chrome field diffs + regex. One live advertorial renders; distinction across four was not seen. |
| A14 | Embedded Quiz recommended skin + override | PASS | **INSUFFICIENT EVIDENCE** | `/c` does embed a quiz. Skin/override not exercised. Local e2e is not this. |
| A15 | No deployment Quiz logic override | PASS | **INSUFFICIENT EVIDENCE** | In-process refuse helper + source regex. UI not opened. |
| A16 | No deployment public-copy override in new workflow | PASS | **INSUFFICIENT EVIDENCE** | Same pattern. |
| A17 | Master edits require explicit republish | PASS | **INSUFFICIENT EVIDENCE** | Stub publish suite. Live-preflight not re-run. Republish not performed. |
| A18 | Check A Case versus Don't Settle auto-reskin | PASS | **FALSE POSITIVE** | Check A Case **does not exist** in production `sites`. Seed file comparison only. `check-a-case.preview.pageflo.io` is 404. |
| A19 | Bulk multi-brand deploy | PASS | **FALSE POSITIVE** | Planner unit + regex that the page mounts `BulkDeployForm`. `/admin/deployments` 307s to sign-in. No bulk run. |
| A20 | Path collision fail closed | PASS | **NOT RETESTED** | Stub `checkPathAvailable`. Production `check:paths` not re-run. Few live rows, no collision observed, also not proven fail-closed. |
| A21 | `*.preview.pageflo.io` app routing | PASS | **CONFIRMED** (narrow) / W60 evidence **FALSE POSITIVE** | Active Brands Dont Settle and Rescue QA serve on both preview suffixes. Wildcard SAN is real. `test-preview-hosts` still never hits a network. Check A Case citation is false. Draft Brands 404. ACH `/` 404s with no home page. Routing works; W60's proof did not. |
| A22 | Custom domain/SSL workflow healthy | PASS | **FALSE POSITIVE** | Zero custom domains. All `ssl_status=unknown`. Cert tests are in-memory + script grep. Unmatched SNI is still crashclaim. |
| A23 | Lead persists before downstream | PASS | **INSUFFICIENT EVIDENCE** | Local pipeline tests. No production submit. One lead row exists; provenance not inspected. |
| A24 | Queue retry/idempotency | PASS | **INSUFFICIENT EVIDENCE** | Redis PONG. No worker log hit in a 7-day journal grep. Local tests only. |
| A25 | Generic webhook / LeadDistro-compatible delivery | PASS | **INSUFFICIENT EVIDENCE** | Mocked execute layer. W60 already said no live buyer. |
| A26 | Leads UI detail/consent/validation/delivery | PASS | **INSUFFICIENT EVIDENCE** | Source regex. Console not opened. |
| A27 | Tenant isolation after new collections/jobs | PASS | **NOT RETESTED** | Local isolation suite is the least theatrical test. Not re-run. Production tenancy not probed. |
| A28 | Full internal E2E without SSH/SQL/raw CMS | PASS | **FALSE POSITIVE** | This review needed SSH to read `.env`, SQL to see Brands, and still could not complete the console journey. Local e2e/console are not that journey. |
| A29 | Production release healthy | PASS | **FALSE POSITIVE** | Process is up, health 200, SHA `b54e8bd`. Product is not healthy: lock/wrong password, Server Action mismatches, placeholders, 404 homes, crashclaim default SNI. |
| A30 | Final independent evaluator PASS | PASS | **FALSE POSITIVE** | W60 marked its own work PASS. Independent re-measure is FAIL. |

---

## What was not observed (and is required)

- Signing in as an operator and staying in `/admin/*`
- Brands / Domains / Deployments console pages as a logged-in user
- Creating a Brand from the UI, editing identity, saving, reopening
- AI generation of a Brand or website
- WordPress or Base44 import
- Manual section editor, preview mode, version/undo
- Selecting a quiz/LP/advertorial template and seeing a distinct preview
- Bulk deploy
- Custom domain add, DNS instructions, SSL becoming `active` after a real handshake
- Submitting a Lead on a live funnel and seeing it in Leads UI
- Master edit that does not change live until republish

Parallel audit agents created Brands via some other session (`capture@legenex.com` sessions exist). Those sessions were not used. Hijacking them would not be an operator proof.

---

## Evidence index

| File | What |
|---|---|
| [docs/rescue-audit/evidence/critic/walk-notes.txt](docs/rescue-audit/evidence/critic/walk-notes.txt) | Playwright login failure |
| [docs/rescue-audit/evidence/critic/pub-notes.txt](docs/rescue-audit/evidence/critic/pub-notes.txt) | Anonymous public capture log |
| [docs/rescue-audit/evidence/critic/01-sign-in.png](docs/rescue-audit/evidence/critic/01-sign-in.png) | Sign-in |
| [docs/rescue-audit/evidence/critic/01b-sign-in-failed.png](docs/rescue-audit/evidence/critic/01b-sign-in-failed.png) | Locked / failed login |
| [docs/rescue-audit/evidence/critic/pub-ds-terms.png](docs/rescue-audit/evidence/critic/pub-ds-terms.png) | `{{site.name}}` |
| [docs/rescue-audit/evidence/critic/pub-ds-quiz.png](docs/rescue-audit/evidence/critic/pub-ds-quiz.png) | Graph leak |
| [docs/rescue-audit/evidence/critic/pub-ds-lp-c.png](docs/rescue-audit/evidence/critic/pub-ds-lp-c.png) | Dynamic figure / 000-0000 |
| [docs/rescue-audit/evidence/critic/pub-ach-home.png](docs/rescue-audit/evidence/critic/pub-ach-home.png) | ACH home 404 |
| [docs/rescue-audit/evidence/critic/pub-cac-home.png](docs/rescue-audit/evidence/critic/pub-cac-home.png) | Check A Case 404 |
| [docs/rescue-audit/evidence/critic/pub-newbrand-home.png](docs/rescue-audit/evidence/critic/pub-newbrand-home.png) | Rescue QA home after activate |

Passwords are not recorded here.

---

## Bottom line

W60 PASS is a **count of green harnesses plus a handful of 200s on one seeded Brand**. The harnesses mostly grep themselves. The 200s hide unreplaced tokens, leaked builder chrome, fake metrics, missing homes, and a Check A Case Brand that is not there.

PageFlo is not accepted. A30 is FAIL.
