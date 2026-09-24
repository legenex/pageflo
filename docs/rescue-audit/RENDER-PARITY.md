# Render parity — Builder vs Preview vs Live

Rescue audit. Funnel Auditor. 2026-09-24.

Compares what the operator sees in the builder canvas, the in-app Preview
control, and the public host. Four surfaces: Brand website, Quiz, Landing
Page, Advertorial.

Runtime: Playwright against `https://app.pageflo.io` and tenant preview hosts.
Audit Brand `rescue-funnel-20260923` is **draft** (anonymous 404 on every
path). Active-Brand live used **Dont Settle**. Screenshots under
`docs/rescue-audit/evidence/funnel/`.

Confirms `ARCHITECTURE.md` §7–§9 in the UI. No application code was changed.

---

## How "live" was measured

| Host | Brand status | Result |
|---|---|---|
| `rescue-funnel-20260923.preview.pageflo.io` `/`, `/c/…`, `/s/…`, `/lp`, `/quiz`, `/privacy`, `/terms` | draft | **404** every path. `93-pageflo_*.png` |
| Same paths on `*.preview.legenex.com` | draft | **404**. `93-legenex_*.png` |
| `https://app.pageflo.io/?site=rescue-funnel-20260923&preview=1` | draft, signed in | Stayed on **PageFlo Console**, title `PageFlo Console`. Not a tenant preview. `98-app-host-site-preview.png` |
| `dont-settle.preview.pageflo.io` `/`, `/s/dont-settle`, `/c/dont-settle`, `/adv/letter` | active | **200**. Dual suffix `preview.legenex.com` also 200, same titles. `99-dont_settle_*` |

The Brand overview **View Live Site** button for the audit Brand points at
`https://rescue-funnel-20260923.preview.pageflo.io` (`REN-P1-LIVE-BTN` info,
href is the canonical preview host). Anonymous GET is 404 because Site status
is draft. That is the architecture (`maySeeUnpublished` / ARCH-P1-012) and it
is also a product lie: the button, the issued preview domain (`status=active`),
and "2 Live funnels serving this Site now" all read as live.

**REN-P0-001 — View Live Site / printed funnel URLs 404 while the Brand is draft, even though deployments are LIVE and the preview host exists.**

---

## Website

### Builder

Home editor `33b-home-page-editor.png`:

- Pill **LIVE** + **Unpublish** on a Brand that Danger Zone calls **draft**.
- Canvas: Navigation Header, Hero "Were you in an accident? See if you qualify.", Lead Form, Trust Strip, Services Grid, How It Works, Recent Wins, FAQ, Final CTA, Site Footer.
- URL chip: `https://rescue-funnel-20260923.preview.pageflo.io/` with **PUBLISHED**.
- Page settings (source): Title, Slug, Status, Meta title/description, OG image, SERP/OG mocks.
- Section autosave. All 12 pages seeded `published` (`32-site-pages.png`). Websites index (`49-websites.png`) still says "Section edits autosave as draft. Publish is the only way a live page changes."

### Preview

Header **Preview** on the page editor. Not separately captured as a public tab;
the canvas **is** the working copy. Device toggles Desktop/Tablet/Mobile exist.

### Live

Audit Brand: 404.

Dont Settle `/` (`99-dont_settle_preview_pageflo_io_.png`):

- Title `Home | Dont Settle`
- H1 `See if you may qualify for a mass tort claim.`
- Nav: How it works / Our partners / FAQ / Check my case
- Lead form present, phone present, privacy link present
- Same on `preview.legenex.com`

Audit Brand builder H1 (`Were you in an accident? See if you qualify.`) is a
**different page** than Dont Settle live H1 — expected, different Brands.
Within one Brand we could not compare builder vs live because draft 404s.

| Check | Builder | Preview | Live (draft Brand) | Live (Dont Settle) |
|---|---|---|---|---|
| Hero copy | Audit Brand home | canvas | 404 | Dont Settle home |
| Status words | LIVE / PUBLISHED | — | 404 | 200 |
| Legal pages | listed Published | — | 404 `/privacy` `/terms` | privacy link present |
| Favicon | Brand | — | `/icon.png` on 404 page | Brand |
| Autosave vs publish | autosave to published_blocks if status=published | — | n/a | live is the snapshot that autosave overwrites |

**REN-P1-001 — Website builder says LIVE on a draft Brand whose public host 404s.**
**REN-P1-003 — Websites index copy about draft autosave is false for every page this Brand has.**
**REN-P1-004 — `?site=&preview=1` on the app host does not render the Brand website.**

Confirms ARCH-P0-002 (autosave overwrites published snapshot) and ARCH-P1-012
(draft Brand + preview host = anonymous 404).

---

## Landing Page

### Builder (template)

`61-lp-template-editor.png` — 60-Second Check:

- Canvas is a real render: "Was your accident worth more than they told you?" + quiz card "How Were You Injured?"
- Preview as: No brand (design's own colour) → cream/black, "Your Brand"
- Slots editable. No SEO.

### Builder (deployment)

`63-lp-deployment-editor-general.png` — Rescue Funnel · Human Recovery Story:

- Printed host `rescue-funnel-20260923.preview.pageflo.io/c/rescue-funnel-20260923`
- Status LIVE, CERTIFICATE UNVERIFIED, "no publish check has ever been recorded"
- Quiz Flow = None + legacy pointer warning
- Template gallery under the fold is a live render in Brand colours

### Preview (in-app)

Template preview `90-lp-template-preview-0.png`: cream, no Brand, "Not deployed — this template has no URL until you place it." Honest.

Deployment preview `66-lp-deployment-preview.png`:

- URL chrome matches `effectiveDeploymentUrl`
- Brand chip "Rescue Funnel 20260923", phone `(833) 555-0422`
- H1 **Healing should be your only job right now. The claim shouldn't become a second injury.**
- Quiz card "How Were You Injured?" / Continue gently
- Navy/gold chrome (that Brand)

### Live

Audit Brand `/c/rescue-funnel-20260923`: 404.

Dont Settle `/c/dont-settle` (`99-dont_settle_preview_pageflo_io_c_dont_settle.png`):

- Title starts with the **same H1** as the Human Recovery Story preview
- Teal Dont Settle chrome, phone `(833) 555-0444`
- Embedded quiz in the hero (same questions)
- Footer legal links
- Both preview suffixes 200, same title

| Check | Template builder | Deployment preview | Live audit Brand | Live Dont Settle |
|---|---|---|---|---|
| H1 (Human Recovery Story) | n/a (different template) | Healing should be your only job… | 404 | Healing should be your only job… |
| Brand chrome | "Your Brand" / no brand | Rescue Funnel navy/gold | 404 | Dont Settle teal |
| Phone | none | (833) 555-0422 | 404 | (833) 555-0444 |
| Quiz mount | yes (stock) | yes (despite Quiz Flow=None) | 404 | yes |
| URL printed | "Not deployed" | correct | 404 | serves |

**LP builder preview vs live copy is CONSISTENT** when the Brand is active.
Brand reskin is CONSISTENT (Decision 8).

**REN-P1-005 — LP deployment editor can say Quiz Flow = None while preview/live still mount a quiz via legacy `quiz_deployment_id`.** The list `legacy binding` badge is the only honest signal.

Template thumbs are structurally distinct (20-ish LP designs; quiz template gallery even more so). Walk1's `uniqueH1=1` was the chrome `<h1>Landing Pages</h1>`, not the canvas. Not a sameness bug.

---

## Quiz

### Builder

Flow editor `70c-quiz-flow-editor.png`: graph, not a visitor page. Empty "New Quiz" is a 6-error draft.

Deployment editor `73-quiz-deployment-editor.png`:

- Printed URL `…preview.pageflo.io/s/rescue-funnel-20260923`
- Render mode Standalone vs Embed
- **Quiz First** selected among 20 real thumbs
- Certificate-pending helper text

Templates tab `71-quiz-templates.png`: 20 stock skins, each a real render of "How were you injured?" in a different layout. Distinct.

### Preview (in-app)

`76-quiz-inapp-preview.png` (clicked Preview on the flows list, third Preview — MVA T4 region):

- Brand picker defaulted to **Accident Compensation Helper**
- DEPLOY: **none**
- Template chrome: **Editorial Inline**
- Header "CLICK HERE TO CALL"
- Question card, 1/14, "Get The Maximum Cash Payout For Your Accident Injury!!!"

This is a **composition playground**, not a preview of a deployment.

### Live

Dont Settle `/s/dont-settle` (`99-dont_settle_preview_pageflo_io_s_dont_settle.png`):

- Title `Dont Settle · MVA Tiered Quiz | Dont Settle`
- Brand wordmark Dont Settle + CLICK HERE TO CALL
- **Timeline Journey** skin (left rail of step names)
- Same first question
- Step list leaks internal labels: `Injury Type12121212`, `/submitted (Qualified)`, `/thanks (DQ)`
- Copyright footer
- Both preview suffixes 200

| Check | Flow builder | In-app Preview | Deployment editor | Live Dont Settle |
|---|---|---|---|---|
| Skin | n/a | Editorial Inline | Quiz First (Rescue Funnel) / Timeline Journey (Dont Settle) | Timeline Journey |
| Brand | n/a | Accident Compensation Helper | Rescue Funnel / Dont Settle | Dont Settle |
| First question | on the graph | How Were You Injured? | thumbs show it | How Were You Injured? |
| Phone chrome | n/a | ACH | — | Dont Settle |
| Internal step ids | visible in graph | hidden | — | **leaked in Timeline Journey rail** |

**REN-P0-002 — Quiz in-app Preview is not the live composition.** Wrong Brand, wrong template, DEPLOY=none. Operators cannot accept a quiz by pressing Preview.

**REN-P1-006 — Live Timeline Journey renders internal node names and path tokens in the step rail** (`Injury Type12121212`, `/submitted (Qualified)`). Builder graph shows those names; a visitor should not.

**REN-P1-007 — Quiz list Preview and deployment Preview are different products.** LP deployment Preview is a framed public composition. Quiz flow Preview is a sandbox.

Confirms ARCH-P0-005 only in the **empty-domain** URL printer; bound rows now print real hosts. The remaining preview lie is the in-app Preview Brand/template default, not the `/q/{id}` string on these rows.

---

## Advertorial

### Builder

List `80-advertorials.png`: article cards, DRAFT/PUBLISHED, Preview/Edit/Copy/Archive.

Deployments tab `82c-advertorial-builder-deployments.png`: one LIVE Dont Settle row, Duplicate/Unpublish/Delete, badge **Domain missing, falling back to preview URL**, printed `https://dont-settle.preview.legenex.com/adv/letter`.

Master editor walk timed out after the deployments tab (sidebar collision leftover). Settings/preview chrome exist in source (Publish/Unpublish/Save/Settings/Preview; Article Settings invent `/a/{slug}`).

### Preview

Not captured this session (walk3 crashed before master Preview). Source preview uses `AdvertorialRuntime` with a default Brand — same class of sandbox as quiz Preview.

### Live

Dont Settle `/adv/letter` (`99-dont_settle_preview_pageflo_io_adv_letter.png`):

- Title `The Settlement Letter That Sat on Their Fridge for Three Weeks | Dont Settle`
- H1 matches the list title
- Brand header DONT SETTLE, phone, CLICK HERE TO CALL
- Article body, pull quote, CTA card "Check My Case"
- **Embedded quiz** (Timeline Journey) under the article — `ctaMode=embed`
- Footer copyright + disclaimer
- Both preview suffixes 200

| Check | List | Deployment row | Live |
|---|---|---|---|
| Headline | The Settlement Letter… | same | same |
| URL | — | preview.legenex.com/adv/letter + "domain missing" | serves on pageflo.io **and** legenex.com |
| Quiz | — | quiz: dont-settle…/s/dont-settle | inlined Timeline Journey |
| Brand | — | Dont Settle | Dont Settle |

**REN-P1-008 — Advertorial deployment "Domain missing" while live serves.** Builder and live agree on the article; they disagree on whether a domain is bound.

**REN-P1-009 — Advertorial in-app Preview was not independently captured; source still uses artifact URL copy in settings.** Treat Preview URL as untrusted until it uses `effectiveDeploymentUrl`.

---

## Cross-cutting

### Dual preview suffixes

Dont Settle live is **the same document** on `*.preview.pageflo.io` and `*.preview.legenex.com` (identical titles/H1s). Alias resolver works.

Printed URLs in the console mix both suffixes (Dont Settle rows still show `preview.legenex.com` in the path column and `preview.pageflo.io` in the Preview column on `/admin/deployments`). `48-deployments.png`.

**REN-P1-010 — Deployments index Preview column and Path column can name different preview roots for one row.** Confirms ARCH-P1-004 / "three answers to one URL".

### Brand reskin

Live LP/Quiz/Advertorial on Dont Settle share teal/cream, phone `(833) 555-0444`, name Dont Settle. Rescue Funnel in-app LP preview used navy/gold and `(833) 555-0422`. Reskin is immediate and Brand-wide. No staged preview of a reskin (ARCH-P0-006).

### Tracking / pixels

Live pages inject `SiteScripts` from **Site** tracking, not deployment pixels. Builder Tracking tabs do not change the public `<script>` set. See `FUN-P1-015` / `SET-P1-011`.

### Hydration

Walk console: two `Minified React error #418` (hydration). Not attributed to a single route.

### Seeded site-scoped twins

`createSite` still publishes site-scoped `/lp` and `/quiz`. On a draft Brand they 404 with everything else. On an active Brand they **win** over funnel deployments on those paths (`CLAIM_PRECEDENCE`). Not re-hit on Dont Settle (those paths were not in the live sample). Architecture still applies: ARCH-P0-003.

---

## Defect register (REN-)

### P0

**REN-P0-001 — Printed live/preview URLs 404 for a draft Brand whose deployments are LIVE.**
View Live Site, LP Final URL, Quiz printed URL, Brand overview "2 Live funnels". Public GET is 404. Confirms ARCH-P1-012 in the button the operator actually clicks.

**REN-P0-002 — Quiz in-app Preview does not render the live deployment's Brand or template.**
`76-quiz-inapp-preview.png` vs `99-dont_settle_preview_pageflo_io_s_dont_settle.png`.

### P1

**REN-P1-001 — Website builder LIVE pill on a draft Brand.**
**REN-P1-002 — Paths lists `/privacy` and `/terms` as published Pages; anonymous GET on the preview host 404s while the Brand is draft.**
**REN-P1-003 — Websites index "autosave as draft / Publish is the only live mutation" is false.**
**REN-P1-004 — App-host `?site=&preview=1` is not a tenant preview.**
**REN-P1-005 — LP Quiz Flow=None still previews a quiz (legacy binding).**
**REN-P1-006 — Live quiz Timeline Journey leaks internal step names and path tokens.**
**REN-P1-007 — Quiz Preview ≠ deployment Preview.**
**REN-P1-008 — Advertorial "Domain missing" on a 200 URL.**
**REN-P1-009 — Advertorial settings/preview URL still the artifact `/a/{slug}` shape.**
**REN-P1-010 — Deployments index Path vs Preview columns disagree on preview root.**
**REN-P1-011 — Dual-suffix live is CONSISTENT for Dont Settle; new Brands print `preview.pageflo.io` while older rows still show `preview.legenex.com`.** Operators cannot tell which is canonical.

### P2

**REN-P2-001 — React #418 hydration errors during the console walk.**
**REN-P2-002 — 404 page still loads `/icon.png` from the preview host** (audit Brand 404s). Minor.

---

## What already matches

- LP **deployment** in-app preview headline = live Human Recovery Story headline (Dont Settle).
- LP template preview honestly refuses to invent a URL.
- Quiz template gallery thumbs are real, distinct renders (not one screenshot reused).
- Dont Settle live LP / Quiz / Advertorial all reskin to the same Brand tokens.
- Both preview DNS suffixes serve the same active Brand without a data rewrite.
- Advertorial live embed mode really inlines the quiz.

---

## Evidence index

| Shot | Surface |
|---|---|
| `33b-home-page-editor.png` | Website builder LIVE |
| `49-websites.png` | False draft-autosave subtitle |
| `61` / `90-lp-template-preview-*` | LP template canvas / preview |
| `63` / `66` | LP deployment editor / preview |
| `71` / `73` / `76` | Quiz templates / deployment / in-app preview |
| `82c` | Advertorial deployments |
| `93-pageflo_*` / `93-legenex_*` | Audit Brand anonymous 404 |
| `98-app-host-site-preview.png` | `?site=` is the console |
| `99-dont_settle_preview_pageflo_io_.png` | Website live |
| `99-dont_settle_preview_pageflo_io_c_dont_settle.png` | LP live = preview H1 |
| `99-dont_settle_preview_pageflo_io_s_dont_settle.png` | Quiz live ≠ in-app preview |
| `99-dont_settle_preview_pageflo_io_adv_letter.png` | Advertorial live + embedded quiz |
| `99-dont_settle_preview_legenex_com_*` | Dual-suffix parity |
