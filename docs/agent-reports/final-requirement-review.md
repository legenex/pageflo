# Final Original-Requirement Review — LegalOS final integration

Branch `claude/legalos-final-integration-gvvtr8`, verified against the LIVE running
product on http://localhost:3000 + live Postgres + a throwaway PG16 migrate DB.
Adversarial stance: for each claim I tried to PROVE the defect.

**HEADLINE: No reproducible local defect found. All 15 claims are ABSENT (requirements met).**
DB left pristine (leads=0, 5 LP deployments, 12 LP + 20 quiz templates, 0 clones, 1 user);
`git status --porcelain` empty; all probe scripts removed; throwaway DB dropped.

---

## 1. Landing Pages Pages+Templates duplication — ABSENT
Live `/admin/landing-pages` renders exactly two tabs: `data-lp-tab="templates"` (badge 12)
and `data-lp-tab="deployments"` (badge 5). No "Pages" tab, no shadow library. Source
(`LandingPagesApp.tsx:1204`) hardcodes only those two tabs; grep for tab-shaped labels on
the page returned `[]`.

## 2. Sample rows acting as the LP library — ABSENT
Gallery + Templates tab show 12 rows, all `origin='stock'` (`editorial_investigation_v2 …
answer_first`). Page body text search for "MVA Pain First" / "Editorial Test" = false in
DOM; DB `funnel_landing_pages` has 12 stock rows, zero sample rows.

## 3. Quiz template selection wrong — ABSENT
Quiz tabs are `Quiz Flows | Templates | Deployments` (NOT merged). Templates tab shows
`data-template-count=20`; the quiz **deployment editor** selector gallery renders all 20
`data-template-card`s (`sq_editorial_inline … sq_evidence_checklist`), each with Preview+Select.

## 4. LP deployment template selection wrong — ABSENT
Opened a live LP deployment editor: the template selector is a `TemplateGallery` of 12
`data-template-card`s whose `data-template-renderer` = the 12 first-class LP records. The
deployment stores `landing_page` = the selected ROW id (verified via DB round-trip, claim 7).

## 5. Template choice is only a dropdown — ABSENT
The LP template choice is a visual card gallery (12 cards, each a real render), not a
dropdown. (The one `<select>` in the editor is the *embedded-quiz-template* secondary
picker — SQ-01..SQ-20 — which is legitimately separate; the LP template itself is the gallery.)

## 6. Preview / Select missing on cards — ABSENT
Every LP card (12/12) and every quiz card (20/20) exposes a `Preview` and a
`Select`/`Selected` button. Disabled cards keep Preview but disable Select (see claim 9).

## 7. Saved identity ≠ rendered identity — ABSENT
Created draft deployment 106 → `landing_page=8` (split_screen_direct). Gallery showed
`data-selected` card = **8**; public render at `/probe7?site=check-a-case&preview=1` =
"Hurt in a crash? Don't guess what your claim is worth…" (split_screen_direct). Then
`PATCH landing_page=8→6` via REST: gallery on reload showed `data-selected=6`, DB stored 6,
render changed to case_value_dossier ("What is your claim actually built on?…"). Stored id ==
selected == rendered, with no first-template substitution. Cleaned up.

## 8. Template clones fail — ABSENT
Created LP clone (row 62, `template_id=split_screen_direct`, `origin=clone`, `stock_key=null`).
It appeared in the gallery as a non-blocked card with Preview+Select (13 cards total). A
deployment bound to it rendered **byte-identical** to the source (same heads, `bodyLen=2177`,
HTTP 200) — clone is selectable, renderable, and deployable. Cleaned up.

## 9. Disabled templates remain selectable — ABSENT
`PATCH funnel-landing-pages/8 is_enabled=false`: the gallery card 8 became `data-blocked="true"`
and its Select button `disabled=true` (still shown, with the reason), so it cannot be chosen
for a new deployment. Restored `is_enabled=true`.

## 10. LP quizzes are static/fake — ABSENT
Drove THREE materially different live LP templates, all on Quiz Flow 6 (MVA Tiered):
human_recovery_story (`/c/pain`), answer_first (`/c/check-a-case`), authority_network
(`/truck` preview). Each: exactly ONE `data-quiz-root`, real `data-quiz-answer` buttons,
clicking the first answer ADVANCED the runtime (progress 0→12, question changed), the LP's
own headings survived, and the only buttons OUTSIDE the quiz root were CTAs ("Start the free
check", "Request callback", …) carrying no `data-quiz-answer` — i.e. no inert static quiz tiles.

## 11. LP quiz does not produce exactly one lead — ABSENT
Walked `/c/pain` (site check-a-case) end to end through all steps to the qualified lead form,
submitted. Result: **exactly 1** POST to `/api/leads` and **exactly +1** DB row
(leads 0→1, id 58). Deleted the probe lead; leads back to 0.

## 12. General Site Pages broken by the LP correction — ABSENT
Public Host-routed GETs on `check-a-case.preview.legenex.com`: `/` (Home), `/privacy`,
`/partners` all returned HTTP 200 with correct `<title>` and real hero/legal content. The
only "error" grep hit was Next's always-bundled "This page could not be found" 404 string, not
a rendered error.

## 13. Raw REST / /cms bypass — ABSENT
All invariant-violating writes are refused by collection `beforeChange`/`beforeDelete` hooks
that cover every door (not just server actions):
- DELETE referenced stock LP template (id 2) as super_admin → **409** "cannot be deleted: 3 deployments still use it".
- PATCH stock template identity (`template_id`/`stock_key`) as super_admin → **409** "part of the shipped library".
- As a scoped site-8 editor: PATCH a site-9 deployment → **404** "deployment not found"; CREATE a site-9 deployment → **403** "not authorized for this brand"; flip a site-8 draft to `status=live` via REST → **403** "going live runs the publish preflight; use the publish action". DB unchanged in every case.

## 14. Migration needs manual intervention — ABSENT
Fresh PG16 DB + `DATABASE_URI=… NODE_ENV=production pnpm payload migrate`: all 30 migrations
applied, ended `Done.`, no hand SQL, no `payload_migrations` edits. `pnpm verify:schema`
against the migration-only DB: "schema OK: 25 collections and 1 globals read cleanly". 87
tables — identical count to live. Drift-prone columns present (sites.brand_identity,
funnel_quiz_templates, funnel_landing_pages.stock_key, locked-rels funnel_quiz_templates_id,
leads.client_submission_id).

## 15. Tests skip / silently pass on empty fixtures — ABSENT
`test:identity` asserts exact counts (`=== 12`, `=== 20`) unconditionally; ran it against the
empty migrate-only DB → self-seeded to 12/20 and ran **33 real assertions, 0 failed**.
`test:e2e` asserts `leads.totalDocs === 2` plus a `if (pass===0) exit(2)` zero-assertion guard.
`test:ui` asserts `≥20` cards, a live deployment exists, and marker-includes, exiting non-zero
on any failure. Forced-fail proof: dropped `funnel_quiz_templates` in a throwaway DB and ran
`test:identity` → **"FAIL suite threw", 0 passed, 1 failed, exit 1** — it fails loudly, does
not skip.

---

### Method notes
- Public LP render + runtime verified with Playwright (Chromium `/opt/pw-browsers/chromium`)
  using the authenticated `?site=<slug>&preview=1` channel and raw Host-header curl.
- REST bypass probes used real `payload-token` cookies for both a super_admin and a
  purpose-created scoped editor (deleted after).
- Every mutation (2 deployments, 1 clone, 1 disabled toggle, 1 template repoint, 1 lead,
  1 draft deployment, 1 scoped user) was reverted; final DB state re-verified pristine.
