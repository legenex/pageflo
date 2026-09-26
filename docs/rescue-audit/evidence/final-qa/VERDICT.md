# Final QA verdict

**VERDICT: FAIL**

Run: `finalqamugl3wah`
Operator: `team@legenex.com` (credentials from `/home/legenex/.pageflo-admin-credentials`; password not printed)
Brand: existing `pageflo-rescue-acceptance-944138` (PageFlo Rescue Acceptance 944138)
Date: 2026-09-25
Harness: Playwright `launchChromium` from `scripts/lib/browser.ts`, headed-equivalent clicks, screenshots under this folder.
New Lead id: **14**

This is not a PASS. The operator loop was clicked, not inferred from HTTP 200, and several visitor-facing and lead-presentation defects were observed on the live product.

## Journey steps observed

1. **Login** PASS. Opened https://app.pageflo.io/sign-in, filled email/password, clicked submit. Landed on `/admin/overview`. Shots: `01-sign-in.png`, `02-after-login.png`.
2. **Brand** PASS. Clicked Brands, typed `pageflo-rescue-acceptance` into Search Sites, clicked the visible row. Dashboard Ready, View Live Site, 12 published pages, 10 live funnels. Shot: `03-brands.png`, `03a-brands-searched.png`, `04-brand-dashboard.png`.
3. **Settings save/reload** PASS. Clicked Edit Brand, changed tagline to `FinalQA tagline finalqamugl3wah`, clicked Save Settings, saw `Saved 8:33:24 AM`, reloaded, tagline persisted. Shot: `05-settings-general.png`, `06-settings-saved.png`, `07-settings-reloaded.png`.
4. **Website preview** PASS via click. Clicked **View Live Site**; popup opened `https://pageflo-rescue-acceptance-944138.preview.pageflo.io/` with Home copy ("Were you in an accident? See if you qualify."). Shot: `08-website-preview-popup.png`.
5. **Website Pages list** PARTIAL. Clicked Websites then Pages for this brand. 12 published pages including Home, Privacy, Terms. Page options (`...`) click did not expose a usable **Preview page** link (menu missing or off-canvas). Shot: `09-websites.png`, `10-website-pages.png`, `10b-page-menu.png`.
6. **Quiz visitor, two branches** PASS. Public quiz mounted. Clicked Auto / Motorcycle Accident (branch A) then Back, then Commercial / Semi Accident (branch B). Restarted and completed the Auto path. Shots: `60-quiz-start.png` through `63-quiz-branch-b.png`.
7. **Quiz submit NEW FinalQA lead** PASS with defects. Reached the qualified form, filled FinalQA / Browser finalqamugl3wah / `finalqa-finalqamugl3wah@legenex.test` / 5125550199 / 78701, clicked Next. POST `/api/leads` 200, `lead_id=14`. Thank-you rendered. Shots: `66-quiz-form-filled.png`, `67-quiz-submitted.png`.
8. **Landing Page public URL** PASS. Clicked Deployments on Landing Pages, read the acceptance row URL, visited it as a visitor on both preview hosts. Embedded quiz visible. Shot: `31-lp-deployments.png`, `70-lp-public.png`, `72-lp-public-legenex.png`.
9. **Advertorial public URL** PASS for the Phone Call master. Visited `/adv/rescue-qamugk8e9r` on both preview hosts. Tagline from the settings save appeared as `FINALQA TAGLINE FINALQAMUGL3WAH`. Clicked through to the quiz. Shot: `80-adv-public.png`, `82-adv-public-legenex.png`.
10. **Preview hosts** PASS. Both `*.preview.pageflo.io` and `*.preview.legenex.com` served Home, quiz, LP, and advertorial for this brand. Clicked an in-page `#how-it-works` link on the legenex host.
11. **Deployment publish/live** PASS as observed. Acceptance quiz and LP rows already LIVE; did not toggle another brand. Advertorial Deployments tab: several LIVE rows; clicked Publish. Deployments index loaded. Shot: `21-quiz-deployments.png`, `32-lp-publish-clicked.png` / `33-lp-inapp-preview.png`, `41-adv-deployments.png`, `43-deployments-index.png`.
12. **Lead in Leads UI** PASS that the new lead is visible and openable. Searched `FinalQA`, opened lead 14, clicked Summary / System Response / HLR Trace / CAPI Log / Delivery Log. Shots: `90-leads-search.png`, `91-lead-detail-summary.png` through `95-lead-capi.png`.

## URLs

| Surface | URL |
|---|---|
| Sign-in | https://app.pageflo.io/sign-in |
| After login | https://app.pageflo.io/admin/overview |
| Brand dashboard | https://app.pageflo.io/admin/sites/pageflo-rescue-acceptance-944138 |
| Brand settings | https://app.pageflo.io/admin/sites/pageflo-rescue-acceptance-944138/settings/general |
| Website pages | https://app.pageflo.io/admin/sites/pageflo-rescue-acceptance-944138/pages |
| Website preview (clicked) | https://pageflo-rescue-acceptance-944138.preview.pageflo.io/ |
| Preview host pageflo | https://pageflo-rescue-acceptance-944138.preview.pageflo.io/ |
| Preview host legenex | https://pageflo-rescue-acceptance-944138.preview.legenex.com/ |
| Quiz public | https://pageflo-rescue-acceptance-944138.preview.pageflo.io/s/pageflo-rescue-acceptance-944138 |
| LP public | https://pageflo-rescue-acceptance-944138.preview.pageflo.io/c/pageflo-rescue-acceptance-944138 |
| LP public legenex | https://pageflo-rescue-acceptance-944138.preview.legenex.com/c/pageflo-rescue-acceptance-944138 |
| Advertorial public | https://pageflo-rescue-acceptance-944138.preview.pageflo.io/adv/rescue-qamugk8e9r |
| Advertorial legenex | https://pageflo-rescue-acceptance-944138.preview.legenex.com/adv/rescue-qamugk8e9r |
| Leads UI | https://app.pageflo.io/admin/leads?q=FinalQA&range=24h |

## New Lead id

**14**

- Name: FinalQA Browser finalqamugl3wah
- Email: finalqa-finalqamugl3wah@legenex.test
- Phone: 5125550199
- State / ZIP: TX / 78701
- Source: Quiz, source id 25
- Site: PageFlo Rescue Acceptance 944138
- Status: New
- test_capture: false
- Idempotency key: `81ee8eb2-a254-4dc9-be87-6f17657fbb9b`

### Consent (as stored)

UI Summary: **None recorded**. TrustedForm certificate: Not set. Jornaya lead id: Not set.

The visitor form showed TCPA copy ("By submitting this form you agree PageFlo QA may contact you...") with **no consent checkbox**. SQL: `trustedform_cert_url` and `jornaya_lead_id` are empty.

### Attribution (as stored)

System Response tab showed stored JSON, confirmed by SQL:

- utm_source: finalqa
- utm_medium: browser
- utm_campaign: finalqamugl3wah
- landing_path: `/s/pageflo-rescue-acceptance-944138`
- event_id: `7e29433ec4b414b645b20d97433f696e`
- session_id and ip present

Quiz answers stored: accident_type auto, incident_date 2024-03, injury_type fatality, treatment still_treating / surgery, attorney never, insurance both, accident_details the FinalQA sentence.

### Delivery (as stored vs as shown)

SQL `leads_delivery_log` for id 14:

- step `downstream.completed`, ok true, empty detail, at 2026-09-25 06:34:18.911+00

Leads UI header: **Delivery: Pending**.

Delivery Log tab: "No delivery attempts were recorded for this lead. A disqualified lead is never dispatched, which is the expected state rather than a failure."

That copy is wrong for this lead. The form said **GREAT NEWS!! You Qualify**. The row in SQL is `downstream.completed` ok=true. The UI both labels it Pending and then pretends there is no log and that DQ explains it.

HLR tab: UI "Not checked". SQL `hlr_result` is `{"ok": false, "error": "missing plivo credentials", "provider": "plivo"}`. The UI ignores a stored failure that has `error` instead of `status`.

CAPI tab: no conversion events. Matches pipeline skip for Meta/TikTok when no destination is configured.

## Failures

These were clicked and seen, not inferred.

1. **Public thank-you leaks authoring notes.** After submit the visitor sees "Thank You! An Attorney Will Reach Out Shortly." and immediately under it **"LeadByte + Meta/TikTok/Snap CAPI fire here"**. Shot: `67-quiz-submitted.png`. That is not a thank-you. It is a builder leftover on a live qualified endpoint.
2. **Live quiz shows a builder-only badge and a 502.** After the date step the visitor card showed "HIDDEN IN LIVE QUIZ - PREVIEW ONLY" and a spinner. Console: `Failed to load resource: 502`. The code comments say this badge is never drawn on a live page. It was. The flow recovered after the wait and continued. Shot: `64b-quiz-working-1.png`.
3. **Pages row "Preview page" was not clickable.** Page options opened; Playwright could not find Preview page. Shot: `10b-page-menu.png`. Website preview still worked from View Live Site.
4. **Delivery presentation does not match storage.** SQL has `downstream.completed` ok=true. UI says Pending and shows the DQ empty state.
5. **HLR presentation does not match storage.** Stored Plivo credential miss; UI says Not checked.
6. **Consent is none recorded** on a qualified live capture. TCPA is copy only; no checkbox and no certificate.
7. **Live PINTEST advertorials** remain published on this brand (`/adv/pinmugkkmjl` and siblings) with template leftovers (`[Author]`, `X min read`, "Opening paragraph that sets the scene"). Observed on the Advertorials Deployments tab and in an earlier visit. The Phone Call URL used for the required public check is real copy.

Walk-script failures array: `website.pagePreview`, `quiz.hiddenLiveBadge`.

## What is not a pass condition

- HTTP 200 on preview hosts, LP, advertorial, or quiz was not treated as success by itself.
- An older lead (id 12, PageFlo QA qamugk8e9r) exists; this run did not treat it as the FinalQA lead.
- No SQL inserts. SQL was read-only after the UI journey (`sql-lead-14.txt`).

## Evidence index

Walk: `_walk.mts`  
Machine report: `report.json`  
Notes: `notes.txt`  
SQL: `sql-lead-14.txt`  
Screenshots: `01-sign-in.png` through `95-lead-capi.png`
