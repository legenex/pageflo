# Funnel parity — Landing Page / Advertorial / Quiz

Rescue audit. Funnel Auditor. 2026-09-24.

Runtime evidence from Playwright against `https://app.pageflo.io`, plus the
collections and builders that screen actually mounts. Confirms
`ARCHITECTURE.md` dual-model issues in the operator UI. No application code
was changed.

---

## Method

- Console login: production super-admin `capture@legenex.com` (see
  `SETTINGS-INVENTORY.md` §Auth). Walk scripts:
  `docs/rescue-audit/evidence/funnel/_walk.mjs`, `_walk2.mjs`, `_walk3.mjs`.
- Audit Brand **Rescue Funnel 20260923**
  (`/admin/sites/rescue-funnel-20260923`) was created this session and left
  **draft**. Seed still wrote **live** LP + Quiz deployments on it.
- Live render of an **active** Brand used Dont Settle
  (`dont-settle.preview.pageflo.io` and `dont-settle.preview.legenex.com`).
- Shared stock masters were not renamed or deleted.

Cell values:

| Value | Meaning |
|---|---|
| CONSISTENT | Same operator meaning and a working control on this surface |
| INTENTIONAL DIFFERENCE | Different on purpose and the UI says so |
| BUG | Control exists and does the wrong thing, or two surfaces disagree |
| MISSING | Operator would look for it; it is not there |
| DEAD CONTROL | Visible, clickable, does not persist or is not consumed |
| UNCLEAR UX | Works or half-works, but the words/state lie |

Each row is scored for the **operator surface** (list + editor + deployment
editor). Where master and deployment disagree, the cell says so.

---

## Verdict

The three builders are not one product with three content types. They are
three ports of the same artifact, patched unevenly.

Landing Pages is closest to the V1 model (templates vs deployments, eligibility
picker, `effectiveDeploymentUrl`, publish preflight, in-app preview that
matches live copy). Quiz copied the three-tab shell and the destination/pixel
panels, then kept session-local preview and a `/q/{id}` URL fallback.
Advertorial still treats go-live as a `<select>` of status strings, labels
Delete as Archive, and invents `/a/{slug}` in settings copy.

Operators cannot learn one verb table and apply it. That is FUN-P0/P1 below,
not three independent UI nits.

---

## Matrix

| Concern | Landing Page | Advertorial | Quiz |
|---|---|---|---|
| **Name** | CONSISTENT. Template **Name** and deployment **Deployment name** ("an internal label so you can tell deployments apart"). Click-to-rename on both lists. Evidence: `61-lp-template-editor.png`, `63-lp-deployment-editor-general.png`. | CONSISTENT. Master **Title**; list click-to-rename. Deployment has no separate name field — the row title is `{article} · {brand}`. | CONSISTENT. Flow **Quiz Name** in Settings → Basics; deployment **Deployment name** ("visitors never see it"). Click-to-rename on lists. |
| **Internal title** | INTENTIONAL DIFFERENCE. Deployment name is explicitly internal. Template name is the library name, not a second field. No `internal_title` column. | MISSING as a distinct field. Title is both library name and article H1 source. Settings "Title" is the master title. | INTENTIONAL DIFFERENCE. Deployment name is internal. Flow name is the master name (also used in derived SEO title). |
| **Description** | MISSING. Template editor has Name, Slug, Angle, Design. No description. List shows origin/angle/code only. | INTENTIONAL DIFFERENCE. Template type has a `desc` on the four article structures (Personal Story, News Authority, …). The master itself has no description field. | MISSING. Flow Settings → Basics is Name + Slug only. Template cards have a one-line renderer blurb. |
| **Status** | BUG. Template: ENABLED/DISABLED + NOT PUBLISHED pill (`is_enabled` / `is_published`). Deployment: draft/live/paused. Seed writes **live** on a **draft Brand**. Overview shows Brand `Partial` + "2 Live funnels" while Danger Zone says `draft` and every public path 404s. `10-brand-overview.png`, `62-lp-deployments.png`, `28-site-danger.png`. | BUG. Master: DRAFT/PUBLISHED (and schema `archived`, unused by the Archive button). Deployment: LIVE pill. Seed does not create an advertorial for a new Brand (audit Brand has none). Existing Dont Settle row is LIVE with "Domain missing" while the printed URL works. `80-advertorials.png`, `82c-advertorial-builder-deployments.png`. | BUG. Flow: LIVE/DRAFT + Archived scope. Deployment: LIVE/STANDALONE + template name. Same seed-live-on-draft-Brand trap. `70-quizzes.png`, `72b-quiz-deployments.png`. |
| **Brand** | CONSISTENT on deployments. Required Brand select; Brand colours quick-edit. Templates are brandless ("Preview as: No brand (the design's own colour)"). | CONSISTENT on deployments (Brand select). Master has "Default brand (for preview)" only. Brands tab was removed from the advertorial tab bar (source still has a local Brand editor and a client-only delete). | CONSISTENT on deployments. Flows are brandless. In-app **Preview** of a flow defaults to the first Brand in the picker, not the deployment's Brand — see Preview URL / Brand reskin. |
| **Master** | CONSISTENT as a concept. Templates tab is `funnel-landing-pages`. Deployments bind `landing_page`. | CONSISTENT as a concept. Advertorials tab is `funnel-advertorials`. | CONSISTENT as a concept. Quiz Flows tab is `funnel-quizzes`. |
| **Template** | CONSISTENT. Design picker on the master (`templateId` / stock renderer). Deployment picks a master, not a second renderer. | INTENTIONAL DIFFERENCE. Four article structures (`personal_story`, `news_authority`, `whistleblower`, `investigative`) live on the master, not a visual template library. | CONSISTENT and richer. 20 visual templates (`funnel-quiz-templates`), selectable **on the deployment**. Library: Preview / Edit / Clone / Disable / Delete. `71-quiz-templates.png`. |
| **Design** | CONSISTENT. Slot copy editor + live canvas in the template editor. Deployment shows a real render of the bound template in Brand colours. | CONSISTENT. Section types + token insert. No separate "design" object. | CONSISTENT. Template gallery on the deployment editor with live thumbs. `73-quiz-deployment-editor.png`. |
| **Domain** | CONSISTENT. Eligibility-aware picker (`isDomainSelectable`). Unverified preview hosts are labelled "(primary) (preview, certificate unverified)". `63-lp-deployment-editor-general.png`. | BUG. Picker is a raw host list, including other Brands' domains. List badge "Domain missing, falling back to preview URL" on a row whose URL is `dont-settle.preview.legenex.com/adv/letter` and **serves**. `82c-advertorial-builder-deployments.png`, `99-dont_settle_preview_pageflo_io_adv_letter.png`. | UNCLEAR UX. Picker exists; helper text says a greyed-out domain "is not ready to serve traffic. Publishing to it is blocked until its status and certificate are both active." The audit Brand's preview host is selectable and the deployment is already LIVE. `73-quiz-deployment-editor.png`. |
| **Path** | CONSISTENT. `/c/{slug}` starter. Editable. Final URL uses `effectiveDeploymentUrl`. | UNCLEAR UX. Suggested `/a/{slug}` in settings; live Dont Settle path is `/adv/letter`. Starter for new Brands does not create an advertorial path. | CONSISTENT. `/s/{slug}` starter. Editable. Printed URL uses the bound host when present. |
| **Preview URL** | CONSISTENT. List + editor + preview chrome all print `https://{preview-host}{path}`. Template-only preview honestly says "Not deployed — this template has no URL until you place it". `90-lp-template-preview-0.png`, `66-lp-deployment-preview.png`. | BUG. List prints a real host+path when a domain string exists, else source falls back to `https://preview.legenex.com/a/{id}` (not a route). Settings copy: `Live URL: [domain]/a/{slug}`. | BUG in the empty-domain branch (`https://preview.legenex.com/q/{id}` in `QuizBuilderApp`). Bound rows print the real URL. Flow Preview is in-app, not a public URL. |
| **Live URL** | BUG vs Brand status. Editor Final URL and list URL are the public path. Anonymous GET of that URL 404s while Brand is draft. Same URL on Dont Settle (active) 200s and matches builder preview headline. `REN-P0-001`. | Same Brand-status gate. Dont Settle `/adv/letter` 200s. | Same. Dont Settle `/s/dont-settle` 200s. |
| **Draft** | CONSISTENT on deployments (status=draft). Template has no draft/published working copy — save is live for any published master. | CONSISTENT on masters (status=draft). Deployment draft exists. | CONSISTENT on flows (`is_published=false`) and deployments. |
| **Published** | UNCLEAR UX. Template `is_published` is a pill, not a header verb. Deployment LIVE is a status. Brand Publish is a third verb that actually opens traffic. | CONSISTENT on masters (Publish/Unpublish in the editor chrome). Deployment LIVE is a select option. | CONSISTENT on flows (header Publish → `saveQuiz({ is_published })`, **not** `setQuizPublished`). Deployment LIVE via list toggle / editor. |
| **Publish** | INTENTIONAL DIFFERENCE vs Quiz/Advertorial, and closer to V1. Deployment editor: Save Deployment + **Publish checks**. Going live runs `setLpDeploymentStatus` + preflight. List power icon aria-label is **Pause deployment** / **Publish deployment**. Seed bypasses this (`overrideAccess`, `status: 'live'`). | BUG. Master Publish toggles `status`. Deployment go-live is `saveAdvertorialDeployment` writing `status: 'live'` with `publishRequiresPreflight: false`. No `setAdvertorialDeploymentStatus`. `FUN-P0-002`. | BUG. Flow Publish calls `saveQuiz`, not gated `setQuizPublished` (ARCH-P0-007, confirmed: zero UI callers). Deployment go-live is diverted through preflight inside `saveQuizDeployment`. List aria-label is **Unpublish deployment** / **Publish deployment**. |
| **Unpublish** | UNCLEAR UX. List Pause ≠ Advertorial/Quiz "Unpublish". Schema allows live→draft; UI uses paused. | CONSISTENT as a word on the master (Unpublish). Deployment list power icon uses Unpublish aria-label. | CONSISTENT as a word on the flow and the deployment list. Archiving a flow also unpublishes it. |
| **Republish** | MISSING. Fingerprint is of **binding** fields, not master copy. Master slot edits go live immediately; the unverified-changes badge cannot see them (ARCH-P0-001 / ARCH-P2-006). Editor copy: "Saving always stores your changes. Setting this to Live also asks to publish, which the server checks first." | MISSING. No fingerprint. Published master save is live immediately. | MISSING. No fingerprint. Published flow save is live immediately. Client undo is tab-local. |
| **Clone** | CONSISTENT on **templates** (Clone template). | CONSISTENT on masters (Duplicate advertorial aria-label, Copy icon) and deployments. | CONSISTENT on flows (title=Clone) and templates (Clone). |
| **Duplicate** | MISSING on **deployments**. Quiz=7 duplicate buttons, Advertorial deployments have Copy, LP deployments=0. `FUN-P1-001`. `62-lp-deployments.png`. | CONSISTENT (Copy icon, Duplicate deployment). | CONSISTENT on deployments (Duplicate deployment) and on flow nodes/steps/fields. |
| **Archive** | MISSING on templates and deployments (Delete only). No Archived tab. | BUG. List Archive icon calls `deleteAdvertorial`. Schema `archived` is unused. Confirm copy in source still claims deployments are removed; the action refuses while deployments exist. `FUN-P0-001`. `80-advertorials.png` (9 Archive controls, 0 Delete labels). | CONSISTENT. Active/Archived scopes. Archive unpublishes; Restore does not re-publish. `70-quizzes.png`. |
| **Delete** | CONSISTENT. Templates and deployments have Delete. Blocked while in use (master-safety). | BUG. The destructive control is labelled Archive. Real delete path exists in actions. | CONSISTENT. Delete confirm tells the operator to Archive instead if they only want it out of the way. |
| **Version history** | MISSING. `updatedAt` only. Client undo is not history. | MISSING. | MISSING. Undo/Redo in the flow editor is session-local. |
| **SEO title/description** | MISSING on template and deployment. Live `<title>` is derived (`lpDeploymentMeta`: hero/slots + Brand name). Website Pages **do** have Meta title / description. | MISSING. Live title = headline section + Brand (`advertorialDeploymentMeta`). | MISSING. Live title = first question/headline + Brand (`quizDeploymentMeta`). |
| **Open Graph** | MISSING. Image falls back to Brand logo. | MISSING. Same. | MISSING. Same. |
| **Tracking** | UNCLEAR UX. Deployment tab **Tracking & Pixels** (UTM source/medium/campaign + PIXEL_PROVIDERS). Saves on the deployment row. Public page injects **Site** `tracking-configs` via `SiteScripts`, not `deployment.pixels`. `FUN-P1-015`. | Same split, worse shape (flat keys). | Same split as LP (nested PIXEL_PROVIDERS). Flow Settings also has Integrations + Node Scripts that the public runtime does not read. |
| **Pixels** | DEAD CONTROL for live injection. Editor presents Meta CAPI / TikTok CAPI / Snap CAPI as "configured per placement". `SiteScripts` reads Site tracking. Conversion `firePixelEvents` calls `window.fbq` / `ttq` / `gtag` if those snippets ran. | DEAD CONTROL. Flat `metaPixelId` / `tiktokPixelId` / `ga4MeasurementId` — not even the same JSON shape as Quiz/LP, so a shared reader could not consume both. | DEAD CONTROL for live injection. Same nested shape as LP. |
| **UTMs** | UNCLEAR UX. Deployment UTM defaults are stored. Visitor query params win (copy is honest). Whether the stored defaults are applied on outbound links was not fired in this walk; they are not a public `<meta>` tag. | Same three fields, labelled "Applied to outbound quiz links if no UTM is on the inbound URL." | Same as LP. |
| **Scripts** | MISSING on LP. Site Tracking + GTM cover website/funnel hosts together. | MISSING. | DEAD CONTROL. Flow Settings → Node Scripts (TrustedForm, Clarity, Hotjar, Jornaya, Custom). `nodeScripts` is only referenced in `editors.tsx`. Public quiz does not inject them. Site Tracking TrustedForm/Jornaya do inject when enabled. |
| **Consent** | MISSING as a funnel field. TCPA/disclaimer come from Brand legal. Website lead form has consent checkboxes. Publish preflight reads `resolveBrandLegal`. | CONSISTENT as tokens (`{{brand}}` disclaimer section type). Live advertorial footer showed "Attorney advertising. Not a law firm." + TCPA-ish submit copy on the embedded quiz. | DEAD CONTROL on the flow (Spam / honeypot / AI last-node check in Settings). Real consent capture is Brand legal + Site TrustedForm/Jornaya. |
| **Phone** | CONSISTENT. Brand `default_phone` / identity `callNumber`. LP preview and Dont Settle live both show "Talk to someone · (833) 555-…". Audit Brand seeded `(833) 555-0422`. | CONSISTENT. Header click-to-call on live advertorial. | CONSISTENT. "CLICK HERE TO CALL" chrome from Brand. Flow Preview used Accident Compensation Helper's number, not the selected deployment's Brand (`FUN-P1-014`). |
| **CTA** | CONSISTENT. Template slots + Brand CTA. Deployment destinations override quiz routing by name. | CONSISTENT. CTA Mode: Button to Quiz vs Embedded Quiz. Live Dont Settle advertorial is embed mode (quiz inlined under the article). | CONSISTENT. Destination URL's panel (thank-you, DQ, etc.) with inherit-from-Brand. Render mode Embed vs Standalone Page. |
| **Quiz binding** | BUG. Editor Quiz Flow showed **None (page with no form)** plus a yellow warning: "This deployment still points at standalone quiz deployment 21… the old pointer is kept until you do." List shows `legacy binding` on every new-Brand Human Recovery Story row except Dont Settle. Preview still mounted a quiz. `FUN-P1-008`. `63-lp-deployment-editor-general.png`, `62-lp-deployments.png`. | INTENTIONAL DIFFERENCE. Binds a **quiz deployment** by text id, not a flow. Unpublishing that quiz does not 404 the advertorial (ARCHITECTURE). | N/A (it is the quiz). |
| **Embedded Quiz** | CONSISTENT as a mount. Ported LP templates include a quiz card. Live Dont Settle `/c/dont-settle` embeds the quiz in the hero. | CONSISTENT. `ctaMode=embed` inlines `QuizRuntime`. Live `/adv/letter` did this. | INTENTIONAL DIFFERENCE. Render mode Embed vs Standalone on the deployment. |
| **Quiz template** | MISSING on the LP deployment (no `embedded_quiz_template_id` picker visible in the General tab we opened; field exists on the collection). Skin follows the bound quiz deployment. | MISSING. Embed uses the linked quiz deployment's template. | CONSISTENT. Gallery on the deployment. Rescue Funnel starter selected **Quiz First**. Dont Settle selected **Timeline Journey** — live matched that, not the in-app flow Preview. |
| **Quiz skin override** | MISSING in the LP UI we opened. Collection has `embedded_quiz_template_id`. | MISSING. | CONSISTENT. Deployment `templateId` is the skin. Changing it on a LIVE row is immediately public (ARCH-P1-005). |
| **Brand reskin** | CONSISTENT with Decision 8 and the dual-store trap. Brand colours quick-edit in the LP editor. Live Dont Settle LP used Dont Settle teal/cream; in-app LP preview for Rescue Funnel used that Brand's navy/gold and name chip. Identity edits reskin live immediately. | CONSISTENT. Live advertorial header "DONT SETTLE", phone, disclaimer. | BUG vs Preview. Live Dont Settle quiz chrome is Dont Settle + Timeline Journey. In-app Preview of MVA T4 defaulted to Accident Compensation Helper + Editorial Inline. `76-quiz-inapp-preview.png` vs `99-dont_settle_preview_pageflo_io_s_dont_settle.png`. |
| **Legal links** | CONSISTENT on live LP footer (Privacy Policy, Terms of Service, Do Not Sell, TCPA Disclosure on Dont Settle). Audit Brand Paths lists `/privacy` and `/terms` as Pages; public GET 404s while Brand is draft. | UNCLEAR UX. Live advertorial footer had copyright + disclaimer, not the same legal link row as the LP. | MISSING on the standalone quiz chrome we captured (header + copyright only). |
| **Favicon** | CONSISTENT as Brand `favicon_url`. General Settings has a URL field + dead Upload. Live Dont Settle used Brand favicon. | Same Brand store. | Same Brand store. |
| **Logo** | CONSISTENT as Brand logo URL / slot. Template has a logo slot; empty shows "Your Brand". | CONSISTENT. Live advertorial used a "D" mark + DONT SETTLE. | CONSISTENT. Wordmark in quiz chrome. |
| **Typography** | CONSISTENT via Brand fonts. LP live and preview used the serif headline of Human Recovery Story + Brand. | CONSISTENT. Article serif vs quiz sans on the same live URL (embed). | CONSISTENT per template. Timeline Journey ≠ Editorial Inline (confirmed live vs in-app preview). |
| **Colours** | CONSISTENT with the merge rule (Site.brand wins). Rescue Funnel preview used navy/gold; Dont Settle live used teal. General Settings exposes 5 colours; Brand Identities exposes more, including deprecated success/warning/danger. | CONSISTENT on live. | CONSISTENT on live; Preview can show a different Brand's palette. |
| **Validation** | CONSISTENT. Publish checks + eligibility + path claims. Editor shows "CERTIFICATE UNVERIFIED" and "no publish check has ever been recorded" on the seed-live row. | MISSING on go-live. Path check only. Domain eligibility not in the picker. | CONSISTENT on deployment go-live (preflight). Flow editor has **Flow check: 6 errors, 2 warnings** on empty "New Quiz" (`70c-quiz-flow-editor.png`). Flow Publish does not run deployment preflight. |
| **Errors** | CONSISTENT. Publish refused panel, legacy-binding warning, missing template pills. | UNCLEAR UX. "Domain missing" on a working URL. Archive confirm copy vs refuse-delete. | CONSISTENT. Flow check, unknown-template pill, orphaned Brand pill. |
| **Created** | CONSISTENT. Payload `createdAt` (not shown in the builder chrome). Seed creates deployments at Brand create. | CONSISTENT. | CONSISTENT. |
| **Updated** | CONSISTENT. `updatedAt` only. No history. Autosave on template slots. | CONSISTENT. Explicit Save on the master. | CONSISTENT. Autosave indicator Saved/Unsaved/Saving on the flow. |

---

## Defect register (FUN-)

### P0

**FUN-P0-001 — Advertorial "Archive" deletes the master.**
List control `aria-label="Archive advertorial"` calls `onDelete` → `deleteAdvertorial`. Schema status `archived` is unused. Quiz has a real Archive/Restore. LP has neither, only Delete.
Evidence: `80-advertorials.png`; `AdvertorialBuilderApp.tsx` list handlers; `findings.json` `archiveAria=9 deleteAria=0`.

**FUN-P0-002 — Advertorial deployment go-live is a status `<select>`.**
`draft | live | paused` saved through `saveAdvertorialDeployment`. Collection hook `publishRequiresPreflight: false`. No fingerprint. Confirmed in source; the in-builder deployment editor was opened (`82c`) and the select exists in `AdvDeploymentEditor`.
Confirms ARCH-P0-004.

**FUN-P0-005 — Advertorial settings invent `Live URL: [domain]/a/{slug}`.**
Not a public route. Live Dont Settle advertorial is `/adv/letter`. Source: `AdvertorialSettingsPanel`.

### P1

**FUN-P1-001 — LP deployments cannot be duplicated.**
Quiz deployments: 7 Duplicate controls. Advertorial deployments: Copy icon. LP deployments: Preview / Edit / Pause / Delete only.
Evidence: `62-lp-deployments.png`, walk2 `cloneDep=0 pausePublish=8 delete=8`.

**FUN-P1-002 / FUN-P1-004 / FUN-P1-007 — No SEO/OG fields on any funnel deployment.**
Website Pages have Meta title, Meta description, OG image + SERP/OG mocks. Funnel live titles are derived. Site-wide SEO is Coming Soon (`24-site-seo.png`).

**FUN-P1-006 — Advertorial pixels are a different JSON shape.**
Flat `metaPixelId` vs Quiz/LP `PIXEL_PROVIDERS` (`metaCapi.pixelId`, …). Even if a live reader were wired, Advertorial would miss it.

**FUN-P1-008 — LP starter still on legacy quiz-deployment pointer.**
Every new-Brand Human Recovery Story row is badged `legacy binding`. Editor Quiz Flow = None, with a warning that deployment 21 is still pointed at. Preview and live (when Brand is active) still mount a quiz.
Evidence: `62-lp-deployments.png`, `63-lp-deployment-editor-general.png`.

**FUN-P1-009 — New Brand is born with LIVE funnel deployments and a draft Brand.**
Overview: "2 Live funnels serving this Site now" + Publish brand. Public preview host 404s. Seed: `funnel-samples.ts` `status: 'live'` with `overrideAccess`.
Evidence: `10-brand-overview.png`, `93-pageflo_.png`.

**FUN-P1-010 — Pause vs Unpublish vs Publish brand.**
LP list: Pause deployment. Quiz/Advertorial lists: Unpublish. Brand: Publish brand / Pause Site. Same operator, three dictionaries. Confirms ARCH-P1-002.

**FUN-P1-011 — No version history, no Republish.**
Confirmed in UI (no History, no Republish control) and collections (no versions). Confirms ARCH-P0-001 / ARCH-P1-009.

**FUN-P1-013 — Advertorial "Domain missing" on a serving URL.**
`82c-advertorial-builder-deployments.png` vs `99-dont_settle_preview_pageflo_io_adv_letter.png` (200).

**FUN-P1-014 — Quiz flow Preview is not the deployment.**
In-app Preview: Brand = Accident Compensation Helper, template = Editorial Inline, DEPLOY = none.
Live Dont Settle: Brand = Dont Settle, template = Timeline Journey.
Evidence: `76-quiz-inapp-preview.png`, `72b-quiz-deployments.png`, `99-dont_settle_preview_pageflo_io_s_dont_settle.png`.

**FUN-P1-015 — Deployment Tracking & Pixels are not what live injects.**
Public `[[...slug]]/page.tsx` always `<SiteScripts tc={site tracking-configs} />`. `deployment.pixels` is hydrated and ignored. `firePixelEvents` only calls globals those site scripts would have created.

**FUN-P1-016 — Quiz Node Scripts are editor-only.**
`nodeScripts` referenced solely in `editors.tsx`.

**FUN-P1-017 — Quiz Settings → Integrations (email/HLR/Maps/reCAPTCHA) are not the public runtime.**
No matches under `src/components/public/quiz`.

**FUN-P1-018 — Clone vs Duplicate vs Archive are not one verb table.**
Template Clone (LP, Quiz). Deployment Duplicate (Quiz, Advertorial). LP deployments: neither. Advertorial Archive = delete.

**FUN-P1-019 — Quiz/Advertorial empty-domain URL fallbacks are still the artifact strings.**
`preview.legenex.com/q/{id}` and `/a/{id}`. LP was migrated to `effectiveDeploymentUrl`. Production rows with a host hide this; a hostless row (Dont Settle Authority Network "PREVIEW URL") still depends on the fallback.

**FUN-P1-020 — Flow Publish bypasses `setQuizPublished`.**
Header Publish on `70c-quiz-flow-editor.png` is the builder `onPublish` → `saveQuiz`. Confirms ARCH-P0-007 in the UI.

### P2

**FUN-P2-001 — Advertorial Brands tab is gone from the tab bar; Brand editor code remains.**
Tab bar is Advertorials | Deployments only. `AdvBrandEditor` and client-side `setBrands(filter)` delete are still in the module. Not reachable from the tab bar. Brand Identities is the real editor.

**FUN-P2-002 — "New Quiz" empty flows sit above the live MVA master.**
Two DRAFT "New Quiz" rows with 1 empty step and a 6-error flow check. Noise on the primary list.

**FUN-P2-003 — LP template list includes "Untitled template" BLANK clone.**
`60-lp-templates.png` last row.

---

## What is already aligned

Keep these; they are the intended product:

- LP Templates vs Deployments split, slot copy on the master, eligibility-aware domain picker, `effectiveDeploymentUrl` in list/editor/preview chrome, Publish checks, in-app LP preview matching live headline on Dont Settle.
- Quiz Flows vs Templates vs Deployments split, real template thumbs, Archive/Restore on flows, Duplicate on deployments, destination inherit pills.
- Advertorial CTA Mode embed vs button, and live embed actually inlining the quiz.
- Brandless masters + Brand on the deployment (when the picker is used).

---

## Evidence index

| Shot | What it shows |
|---|---|
| `10-brand-overview.png` | Draft Brand, Partial, 2 Live funnels, View Live Site → preview.pageflo.io |
| `60-lp-templates.png` | 13 templates, Preview/Edit/Disable/Clone/Delete |
| `61-lp-template-editor.png` | Name/Slug/Angle/Design, no SEO, live canvas |
| `62-lp-deployments.png` | LIVE rows, legacy binding, no Duplicate |
| `63-lp-deployment-editor-general.png` | Brand/domain/path/status, Quiz Flow None + legacy warning |
| `64` / `65` | Destinations + UTM/Pixels tabs |
| `66-lp-deployment-preview.png` | Rescue Funnel LP preview, phone, quiz card, correct URL |
| `70-quizzes.png` | Active/Archived, Clone/Publish/Archive/Delete |
| `70c-quiz-flow-editor.png` | Publish/Settings/Preview/Save, flow check errors |
| `71-quiz-templates.png` | 20 distinct templates |
| `72b-quiz-deployments.png` | Real preview.pageflo.io URLs, Duplicate present |
| `73-quiz-deployment-editor.png` | Skin gallery, Embed vs Standalone, certificate pending copy |
| `76-quiz-inapp-preview.png` | Wrong Brand/template vs live |
| `80-advertorials.png` | Archive-as-delete, Preview/Edit/Copy |
| `82c-advertorial-builder-deployments.png` | Domain missing badge, Duplicate/Unpublish/Delete |
| `99-dont_settle_preview_pageflo_io_{_,s,c,adv}_*` | Active Brand live Website / Quiz / LP / Advertorial |
