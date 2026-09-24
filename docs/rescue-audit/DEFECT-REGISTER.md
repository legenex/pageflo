# Defect register — PageFlo rescue audit

Bossman consolidation. 2026-09-24.

Runtime evidence from production (`app.pageflo.io`, SHA `b54e8bd`) plus independent agent reports. Previous W60 PASS is historical only.

Agents: Archie, Bugsy, Odin, Funnel Auditor, Picasso, Security, Critic. Bossman production Playwright walk used `capture@legenex.com`.

Duplicate IDs from agent files are merged here. Canonical ID is the first column.

## Totals (canonical, merged)

| Severity | Count |
|---|---|
| P0 | 18 |
| P1 | 28 |
| P2 | 16 |
| P3 | 8 |

These counts merge overlapping agent IDs that describe the same root cause.

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
