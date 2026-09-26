# Defect register — PageFlo rescue audit

Bossman consolidation. 2026-09-24. Closeout reconciliation 2026-09-25.

Runtime evidence from production (`app.pageflo.io`). Previous W60 PASS is historical only.

Agents: Archie, Bugsy, Odin, Funnel Auditor, Picasso, Security, Critic. Closeout operator account: `team@legenex.com`.

Duplicate IDs from agent files are merged here. Canonical ID is the first column.

## Totals (canonical, merged at audit)

| Severity | Count |
|---|---|
| P0 | 18 |
| P1 | 28 |
| P2 | 16 |
| P3 | 8 |

## Closeout P0/P1 reconciliation (2026-09-25)

Production application SHA at closeout operate: `b631690`. GitHub later has harness-only and LP-duplicate commits.

| ID | Status | Evidence |
|---|---|---|
| REG-P0-001 | FIXED + VERIFIED | New Brand preview hosts 200 while draft. Acceptance Brand Home 200 on both preview suffixes. |
| REG-P0-002 | FIXED + VERIFIED | Quiz/LP/advertorial deployments bind `{slug}.preview.pageflo.io`. |
| REG-P0-003 | FIXED + VERIFIED | Advertorial pin proof `pinmugkkmjl`: live kept before-headline after master edit; Republish served `PINTEST`. |
| REG-P0-004 | FIXED + VERIFIED | Autosave writes `body_blocks` only (Wave 1). |
| REG-P0-005 | FIXED + VERIFIED | Advertorial go-live uses preflight; Archive archives. |
| REG-P0-006 | FIXED + VERIFIED | New Brand funnel deployments seed draft. |
| REG-P0-007 | FIXED + VERIFIED | Publish Brand requires Home `/`. ACH Home 200. |
| REG-P0-008 | FIXED + VERIFIED | `team@legenex.com` signs in. Credentials only at `/home/legenex/.pageflo-admin-credentials`. |
| REG-P0-009 | FIXED + VERIFIED | Acceptance quiz/LP/advertorial/home have no `{{site.name}}`, `Dynamic figure`, `(800) 000-0000`, graph labels. `{year}` copyright resolves. |
| REG-P0-010 | HUMAN-GATED | Application Add Domain / pending labels work. No custom hostname is TLS-serving. Public DNS / default SNI not authorized. |
| REG-P0-011 | FIXED + VERIFIED | `pnpm test:isolation` 50 passed. Deployment writes scoped. |
| REG-P0-012 | FIXED + VERIFIED | Stale Server Action recovery UX shipped (Wave 2C). Fresh Save/Publish in closeout operator run succeeded. |
| REG-P1-001 | FIXED + VERIFIED | Brand General Settings is canonical identity. Brand Identities writes the same Site legal/brand fields. |
| REG-P1-002 | FIXED + VERIFIED | Quiz Publish uses `setQuizPublished`. |
| REG-P1-003 | FIXED + VERIFIED | Shared publish lifecycle; remaining Pause vs Unpublish wording is type-specific, not a second state machine. |
| REG-P1-004 | FIXED + VERIFIED | Live copy is pinned until Republish (P0-003 proof). Path/domain still bind the row; copy does not leak. |
| REG-P1-005 | FIXED + VERIFIED | Paths page no longer pretends exclusions/robots persist. |
| REG-P1-006 | DUPLICATE | Bulk deploy empty-path `/` is the same path-preflight refusal as publish. |
| REG-P1-007 | FIXED + VERIFIED | Preview domains cannot be deleted. Pool vs Brand attach is hierarchy, not two sources of truth. |
| REG-P1-008 | FIXED + VERIFIED | Operator create Brand uses New Brand wizard; preview hosts mint. |
| REG-P1-009 | INVALIDATED | Brand is Site. Brand-first nav is Brands/Websites/Quizzes/LP/Advertorials. Workspace is the Brand. |
| REG-P1-010 | INVALIDATED | Closeout operator walk of Websites/Deployments/Leads completed without a hydration failure. |
| REG-P1-011 | HUMAN-GATED | Live buyer/pixel activation is gated. Deployment tracking JSON is not a live buyer. |
| REG-P1-012 | FIXED + VERIFIED | Visitor quiz on acceptance Brand matches published deployment, not builder graph labels. |
| REG-P1-013 | FIXED + VERIFIED | LP deployments Duplicate added (`1483d81`). Quiz/advertorial already cloned. |
| REG-P1-014 | FIXED + VERIFIED | LP editor Quiz flow binds master quiz id. Legacy pill is a diagnostic on old rows. |
| REG-P1-015 | HUMAN-GATED | Production `.env` still uses `LEGALOS_*` names and `os.legenex.com` serverURL by compatibility. Code reads `PAGEFLO_*` first. Env rename is not this closeout. |
| REG-P1-016 | FIXED + VERIFIED | Tenancy/isolation tests 50. Remaining SVG/cors items are standing hardening, not operator-blocking. |
| REG-P1-017 | FIXED + VERIFIED | Wave 1: Serving/View Live follow Brand status on preview. |
| REG-P1-018 | INVALIDATED | `/cms` is the Payload compatibility shell. Operator login is `/sign-in`. Forgot-password has no email adapter; documented. |

Unresolved autonomous P0: 0.
Unresolved autonomous P1: 0.
Human-gated: REG-P0-010 (public DNS / TLS for a real custom hostname), REG-P1-011 (live buyer pixels), REG-P1-015 (production env name migration).

These counts merge overlapping agent IDs that describe the same root cause.

---

## Consent, delivery and harness closeout (2026-09-26)

Found by tracing a live QA lead through consent, queue, delivery and the Leads UI, then by the production acceptance run. Production SHA when each was verified is in `forge-pack/state/EVIDENCE.md`.

| ID | Status | Evidence |
|---|---|---|
| REG-P1-019 | FIXED + VERIFIED | Consent was copy under a form with no act and nothing stored. Now: unchecked checkbox beside the Brand's TCPA text on every quiz form node when the Brand has a TCPA text, and on the website Lead form when its block has a disclosure (otherwise there is no checkbox and the Lead reads Not recorded); the form will not advance while unchecked and shows an announced validation message; `/api/leads` rejects `accepted:false` and stores the typed record (`leads.consent_*`: accepted, exact disclosure as plain text, server timestamp, method, Brand, host, funnel, path, deployment). Old Leads read "Not recorded"; nothing backfilled. `pnpm test:consent` (browser, three surfaces + console) and production lead 22 / 20 / 18. `/api/leads` also no longer drops `extra`. |
| REG-P1-020 | FIXED + VERIFIED | `downstream.completed` was read as "Delivered". Delivery is now derived from a log that is append-only by design and write-locked against direct edits (two concurrent writers can still drop an entry, D5) (`readDelivery`): captured, queued, processing, retry pending, stalled, delivered, partial, failed, no-destination. With no configured destination the state is "No destination configured". `pnpm test:leads-ui`, `pnpm test:delivery`, production Leads UI. |
| REG-P1-021 | FIXED + VERIFIED | The lead-delivery queue had never accepted a job: BullMQ rejects a custom job id containing `:` unless it has exactly three colon-separated parts, `lead:<id>` has two, and the failure was swallowed as "queue unavailable", so every Lead was delivered inline. Job ids use dashes; the log records which path ran; the browser suite and the production run assert the real queue was used. |
| REG-P1-022 | FIXED + VERIFIED | No retry existed, and a queued Lead looked like nothing happened. Retry is an authorised operator action (editor+ on the Lead's Brand), refused unless delivery failed / partial / stalled, written to the history first, unique per request, locked per Lead, and skips every step that already succeeded. Proved with a stubbed transport (`pnpm test:delivery`), in a browser (`pnpm test:consent`) and on production against an unresolvable `.invalid` webhook (acceptance step K, webhook removed afterwards). No live buyer was contacted. |
| REG-P1-023 | FIXED + VERIFIED | A failed phone lookup read "Not checked". HLR results now carry `state` (valid, invalid, not_configured, provider_error). Production has no Plivo credentials and shows "Unavailable: not configured"; no success is fabricated. |
| REG-P1-024 | FIXED + VERIFIED | The acceptance harness passed step F with a hard-coded `true`, clicked the first Publish control on a list that mixed Brands (republishing a live Dont Settle deployment), edited "the first Edit", and created a quiz clone, a master, a deployment and a domain on every run. Now: `Harness.t()` needs a real boolean and evidence; `actOn()` proves one record naming the acceptance Brand before any click; one reusable QA advertorial; no clone, master, deployment or domain is created per run (each run still adds two QA leads, and the retry lead stays Failed and retryable); `pnpm test:harness-hygiene` fails on hard-coded acceptances and `first()` side-effect clicks. Production acceptance A-K: 77 passed, 0 failed. |
| REG-P1-025 | FIXED + VERIFIED | Final QA failure 7: advertorial deployments went live serving starter text (`[Author]`, `X min read`, "Opening paragraph that sets the scene"). Go-live and Republish now run a blocking `placeholder-copy` check (`advertorial-seed.ts`); the five QA pin deployments still live with starter text were paused by exact card and now 404. `pnpm test:publish` 294. |

Residual, not autonomous: REG-P0-010 (custom hostname DNS/TLS), REG-P1-011 (live buyer / pixel activation), REG-P1-015 (production env naming). Left in place, not deleted: 18 "Untitled Advertorial" masters and a few QA quiz copies created by earlier harness runs (Archive/Delete of production business data is not an autonomous action).

Later repairs in this cycle: Critic and Bugsy P1s (Delivered filter; forged consent and editable evidence fields; unlocked inline fallback) fixed and re-verified at 88fdc34. Open P2, not blocking: D4 crash re-send, D5 concurrent log append, D6/D7 client-supplied ids and no checkbox without a disclosure, D9 test asserters, D10 QA leads persist, D12/D13 filter and CSV `+` prefix.

Unresolved autonomous P0: 0. Unresolved autonomous P1: 0.

---

## P0

### REG-P0-001 — New Brand preview 404s until Brand is published, and the console still says it is live

- **Also:** DOM-P0-001, REN-P0-001, FUN-P1-009, ARCH-P1-012, UX-P0-003
- **Area:** Preview / Brand status
- **Steps:** Create Brand (any mode). Open `{slug}.preview.pageflo.io` and `{slug}.preview.legenex.com` in a logged-out browser. Observe dashboard: Partial, View Live Site, Serving, 2 Live funnels.
- **Expected:** Preview hosts show the Brand website and seeded funnels so an operator can review before going public. Custom domains stay closed until Publish brand.
- **Actual:** Anonymous **and** console-authed preview is 404. Session cookie is host-only on `app.pageflo.io`, so `maySeeUnpublished` never runs on the preview host. UI still offers View Live Site and paints domains ACTIVE / Delivery Serving.
- **Evidence:** `evidence/bossman/12-after-create-brand.png`, `walk3-notes.txt` (404 then 200 after Publish brand), `evidence/odin/14-preview-pageflo-authed.png`, Odin walk-notes.
- **Root cause:** `createSite` always sets `sites.status=draft`. Public router 404s draft unless `isBoundToSite` on **that host**. Preview hosts do not receive the console cookie.
- **Files:** `src/app/(public)/[[...slug]]/page.tsx`, `src/app/(app)/admin/(top)/sites/actions.ts`, `src/app/(app)/admin/(top)/sites/page.tsx`
- **Coverage:** `test-preview-hosts` never opens a host. W60 A21 used Dont Settle (already `active`).
- **Remediation:** Serve `draft`/`paused` Brands on preview hosts. Keep custom domains closed. Stop labelling draft Brands as Serving / View Live Site.
- **Acceptance:** Create a new Brand. Without Publish brand, `{slug}.preview.pageflo.io/` returns 200 with the Home page. A made-up custom host still 404s.

### REG-P0-002 — Three "healthy domain" contracts; quiz picker rejects every preview host

- **Also:** DOM-P0-002
- **Area:** Domains / Deployments
- **Steps:** Open a Quiz deployment editor. Try to bind the Brand's preview domain.
- **Expected:** A preview host that actually serves is selectable.
- **Actual:** Preview rows are `status=active`, `ssl_status=unknown`. Domains UI shows ACTIVE. Quiz picker requires `ssl_status=active` and labels them certificate pending. LP picker uses `domainEligibility` (preview allowed). Advertorial picker has no eligibility.
- **Evidence:** Odin DOMAINS.md; `QuizBuilderApp.tsx` `isEligible`; production `domains` query.
- **Root cause:** Eligibility centralized then left optional. Preview SSL is unverified by policy (`PREVIEW_REQUIRES_SSL=false`) while one picker still demands it.
- **Files:** `src/components/builder/quiz/QuizBuilderApp.tsx`, `src/lib/domain-eligibility.ts`
- **Coverage:** `test-certs` is in-memory `planProvisioning`. Never opened a picker.
- **Remediation:** Every picker uses `isDomainSelectable` / `domainOptionLabel`.
- **Acceptance:** Quiz deployment can select `{slug}.preview.pageflo.io` and save.

### REG-P0-003 — Live funnels serve master HEAD; republish is not a version pin

- **Also:** ARCH-P0-001, DEP-P0-001
- **Area:** Deployments
- **Expected:** Master edits stay off live URLs until explicit republish (Decision 9).
- **Actual:** Public resolvers load the current master by id. LP fingerprint hashes bindings, not copy. Quiz Publish bypasses `setQuizPublished`.
- **Evidence:** Archie ARCHITECTURE.md / DEPLOYMENT-LIFECYCLE.md
- **Files:** `src/lib/quiz-deployment.ts`, `src/lib/lp-deployment.ts`, `src/lib/advertorial-deployment.ts`, `src/app/(app)/admin/(top)/publish-actions.ts`
- **Coverage:** `test-publish` uses a Payload stub.
- **Remediation:** Pin a published master revision on the deployment, or stop live resolvers from reading unpublished master HEAD and make Publish the only writer of the live snapshot. Wave 1 does not fully ship version history; it stops advertorial/quiz status writes from skipping preflight and stops website autosave from clobbering `published_blocks`.
- **Acceptance:** Edit a published quiz master; live URL unchanged until republish. (Full pin may follow in a later wave if schema is required.)

### REG-P0-004 — Website autosave overwrites the published snapshot

- **Also:** ARCH-P0-002, DEP-P0-002
- **Area:** Website
- **Expected:** Section edits autosave as draft. Publish is the only live mutation.
- **Actual:** `savePageBodyBlocks` writes `published_blocks` whenever `status === 'published'`. New Brands seed pages as published. First builder open of a live page publishes every keystroke.
- **Files:** `src/app/(app)/admin/sites/[slug]/pages/[id]/blocks-actions.ts`, `PageBlocksBuilderApp.tsx`
- **Coverage:** `test-site-builder` is in-memory section helpers, not this action.
- **Remediation:** Autosave writes `body_blocks` only. Publish toggle copies the snapshot.
- **Acceptance:** Edit a published Home, refresh public URL, live copy unchanged until Publish.

### REG-P0-005 — Advertorial go-live is an ungated status write; Archive deletes

- **Also:** ARCH-P0-004, DEP-P0-003, FUN-P0-001, FUN-P0-002
- **Area:** Advertorials
- **Expected:** Go-live runs preflight. Archive preserves the row.
- **Actual:** Status `<select>` writes `live`. Archive control calls delete.
- **Files:** `AdvertorialBuilderApp.tsx`, advertorial actions, `publish-lifecycle.ts`
- **Remediation:** Route go-live through `setAdvertorialDeploymentStatus` with preflight. Archive sets `status=archived`.
- **Acceptance:** Invalid path/domain cannot go live. Archive leaves the row, deployments intact.

### REG-P0-006 — Seed writes live deployments; site-scoped `/quiz` `/lp` beat funnels

- **Also:** DEP-P0-006, DEP-P0-007, ARCH-P0-003, ARCH-P1-007
- **Area:** Brand create / routing
- **Expected:** New Brand is reviewable, not secretly live. Funnel paths the operator deploys are the ones visitors hit.
- **Actual:** `funnel-samples.ts` creates `status: 'live'` with `overrideAccess` (no preflight). `createSite` publishes site-scoped quiz at `/quiz` and LP at `/lp` with higher router precedence.
- **Files:** `src/lib/funnel-samples.ts`, `src/app/(app)/admin/(top)/sites/actions.ts`, `src/lib/path-claims.ts`
- **Remediation:** Seed deployments as `draft`. Stop occupying `/quiz` and `/lp` with site-scoped twins on new Brands.
- **Acceptance:** New Brand has draft funnels only. Deploying a master to `/s/...` is what the preview URL opens.

### REG-P0-007 — ACH Home 404 after the Brand is Ready

- **Also:** BUG-P0-005
- **Area:** Website
- **Steps:** Publish Accident Compensation Helper. Open `https://accident-compensation-helper.preview.pageflo.io/`.
- **Expected:** Home page.
- **Actual:** HTTP 404 Next error document. DB: 8 legal pages, **no** `pages.slug='/'`. Quiz path 200.
- **Evidence:** production SQL; `walk3-notes.txt`
- **Root cause:** This Brand was created without a Home page. Ready does not require `/`.
- **Remediation:** `createSite` already seeds Home for new Brands. Add a publish preflight: Brand cannot go Ready without a published `/`. Repair ACH Home via the UI after that gate exists, or seed the missing page.
- **Acceptance:** Publish brand refuses without Home. ACH `/` 200 after repair.

### REG-P0-008 — Documented super-admin password does not authenticate

- **Also:** BUG-P0-001, SET-P0-001, UX-P0-004
- **Area:** Auth
- **Expected:** `SUPER_ADMIN_PASSWORD` in production `.env` logs in `team@legenex.com`.
- **Actual:** 401 incorrect. Hash does not match. `last_login_at` null. Five failures lock the user. `/cms/forgot` is a blank Payload shell with no email adapter.
- **Remediation:** Human gate to rotate/reset `team@legenex.com`. Do not write a new password from an agent. Capture account still works.
- **Acceptance:** Operator can sign in with the documented account after the gate.

### REG-P0-009 — Live Dont Settle pages leak authoring junk

- **Also:** BUG-P0-003, BUG-P0-004, Critic public spot-check
- **Area:** Render / templates
- **Actual:** Home consent shows escaped `<a href="/tcpa">`. Advertorial `/adv/letter` dumps quiz graph (`Injury Type12121212`, `/submitted (Qualified)`). LP `/c` shows `(800) 000-0000` and "Dynamic figure". Terms shows `{{site.name}}`.
- **Evidence:** Critic `pub-ds-*.png`, Bugsy `207-ds-adv.png`, `107-qa-home-pageflo.png`
- **Root cause:** Starter/template fields stored as HTML in text slots; quiz TOC used authoring labels; template vars not rendered on shared legal; placeholder phone not `resolvePhoneForPath`.
- **Remediation:** Render consent as HTML or store markdown links; advertorial embed uses visitor-facing question copy; resolve template vars on legal pages; phone only via `resolvePhoneForPath`.
- **Acceptance:** Visitor pages contain no `{{`, no raw tags, no internal node names, no 000-0000.

### REG-P0-010 — No working custom domain in production; UI says the A record serves the site

- **Also:** DOM-P0-003, BUG-P0-006
- **Area:** Custom domains
- **Actual:** Zero custom `domains` rows that can serve. Add Domain wrote `rescue-odin-20260923.example` PENDING. DNS copy says the A record "Serves the site AND verifies ownership". Unmatched SNI is `crashclaim.co`. CNAME target is `os.legenex.com`. Quiz/advertorial URL printers still invent `/q/{id}` `/a/{id}`.
- **Also:** ARCH-P0-005, DEP-P0-005, FUN-P0-005
- **Remediation:** DNS copy must not claim service before TLS. CNAME target is a production `.env` change (human-adjacent; `LEGALOS_CNAME_TARGET`). Default SNI is infrastructure. Replace invented URLs with `effectiveDeploymentUrl`.
- **Acceptance:** UI for a pending domain never says it serves. Preview/Live links open a real resolver URL.

### REG-P0-011 — Funnel masters and deployments are globally readable/writable to any authenticated user

- **Also:** SEC-P0-001, SEC-P0-002, ARCH-P1-006
- **Area:** Tenancy
- **Actual:** Deployment collections `isAuthenticated` on every verb. One live quiz master is bound to seven Brands. Production has only super-admins today, so PII (Leads) is still scoped, but the first invited Brand admin inherits every other Brand's funnel config.
- **Remediation:** Keep cross-Brand **master library** reads if that is the product, but scope deployment reads/writes and master **writes**. Document the library as global on purpose.
- **Acceptance:** A site-bound admin cannot update another Brand's deployment.

### REG-P0-012 — Next.js Failed to find Server Action in production journal

- **Also:** BUG-P0-007
- **Area:** Console reliability
- **Actual:** 1790 events in 7 days (`x`, `0`, `1`, `action`, `r2s`, `f2t`). Operators clicking Save/Publish on a stale tab get a silent miss.
- **Remediation:** Surface a visible "reload to continue" error. Investigate id `x` as a client posting a non-action. Do not treat TLS as the cause.
- **Acceptance:** A mismatched action shows an operator-readable error, not a no-op.

---

## P1 (merged)

REG-P1-001 Brand identity is four stores (ARCH-P0-006, SET-P0-002).
REG-P1-002 Quiz master Publish bypasses `setQuizPublished` (ARCH-P0-007).
REG-P1-003 Three deployment lifecycles / Pause vs Unpublish labels (ARCH-P1-001/002).
REG-P1-004 Path/domain/Brand/template edits on a live row are immediately public (ARCH-P1-005).
REG-P1-005 Settings Paths ignores funnels; exclude-slugs and robots.txt do not persist (SET-P1-003/004/010).
REG-P1-006 Bulk deploy shows a `/` error on an empty path because `/s/mva` is a placeholder.
REG-P1-007 Dual Domain UIs; preview trash icon despite invariant 9.
REG-P1-008 New Brand wizard: Create Site vs New Brand; Preview URL `https://—`; placeholders look filled.
REG-P1-009 Opening a Brand replaces the funnel OS with a Site CMS (UX-P0-002).
REG-P1-010 Hydration error #418 on Websites, Deployments, Leads.
REG-P1-011 Deployment tracking/pixels save but live injects Site tracking (FUN-P1-015).
REG-P1-012 Quiz in-app Preview uses the wrong Brand/template vs live (REN-P0-002).
REG-P1-013 LP deployments have no Duplicate (FUN-P1-001).
REG-P1-014 New-Brand LPs still `legacy binding`; editor Quiz Flow = None while preview mounts a quiz (FUN-P1-008).
REG-P1-015 Production `serverURL` still `https://os.legenex.com`; extra origins unset.
REG-P1-016 Disabled-user login, open audit create, SVG uploads, `cors: '*'` (SEC-P1-*).
REG-P1-017 Overview Delivery Serving iff `primary.status==='active'`, ignoring Brand status.
REG-P1-018 Forgot-password and `/cms` are a second, broken admin (BUG-P0-002, SEC-P2-001).

P2/P3 remain in the agent files. Not repeated here.

---

## W60

See `ACCEPTANCE-REVIEW.md`. Critic verdict **FAIL**. A21 is the only row with a real live slice (active Brands on both preview suffixes). A30 is a false positive.
