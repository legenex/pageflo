# PageFlo console UX audit

Picasso. Rescue audit. 24 September 2026.

Runtime evidence from `https://app.pageflo.io`, not from docs, W60 PASS markers, or unit tests.

This is a product usability review against a mature commercial funnel SaaS bar. Visual polish is not acceptance.

---

## 1. Verdict

The console looks like a product. It does not yet behave like one.

A media buyer who already understands Brands, masters, deployments, preview, and publish still cannot hold a single model of what is live. Overview, Brands, Deployments, the Brand workspace, and Danger zone all disagree about status. Preview hosts disagree with each other. "View Live Site" is the loudest button on unpublished Brands. Create often means "persist a draft named Untitled and put Publish in the primary slot."

The operator shell is two products sharing a login:

1. A workspace funnel OS: Quizzes, Landing Pages, Advertorials, Deployments, Leads.
2. A per-Brand website CMS: Pages, Blog, Numbers, Site settings.

Entering a Brand throws the operator out of the first product. The back link is labelled "Back to PageFlo", as if the Brand they came to operate is not PageFlo.

That split, plus Site/Brand/Brand Kit/LegalOS/Payload leakage, is why Domains, preview, Deployments, LP, Advertorial, Quiz, settings, and builder/preview/live all feel broken at once. They are not independent visual bugs.

**Not production-usable as a commercial funnel OS.** Dark chrome, honest "coming soon" pages, and a few well-labelled lists are not enough.

---

## 2. Method

| Item | Value |
|---|---|
| Host | `https://app.pageflo.io` |
| Tool | Playwright Chromium, `docs/rescue-audit/evidence/picasso/_walk.mts` |
| Viewports | Desktop 1440x900, tablet 768x1024, mobile 375x812 |
| Login | Production super-admin. Owner `team@legenex.com` is locked. Session used the existing capture super-admin. Password not written here. Local `PAGEFLO_REPO/.env` (`preview@localhost`) was not used. |
| Writes | Clicking **New Quiz Flow** and **New Advertorial** persisted drafts (the product does that with no confirm). Those rows were not deleted. No Brand, Lead, or domain was deleted. Bulk deploy was not submitted. |
| Evidence | `docs/rescue-audit/evidence/picasso/*.png` plus `_notes.json` |

HTTP 200 was treated as a starting point. Routes were opened, create/edit surfaces were clicked, Brand context was entered, and the same jobs were repeated at tablet and mobile.

---

## 3. What already meets the bar

These are real, and they should be kept:

- Sign-in chrome, console density, and type hierarchy are in the same family as the redesign pack. (`01-signin-desktop.png`, `02-overview-desktop.png`)
- Analytics, Campaign Integrity, and Brand SEO are honest empty states. They say what is missing and do not invent charts. (`12-analytics.png`, `13-integrity.png`, `33-brand-seo.png`)
- Danger zone delete copy tells the truth about leads and consent records. (`36-brand-danger.png`)
- Quiz deployment editor has a visible selected template, Preview/Select on each card, and a certificate warning instead of a silent picker. (`43-quiz-new-deployment.png`)
- Console mobile drawer exists, has an accessible name, and lists the workspace. (`71-nav-drawer-mobile.png`)
- Bulk deploy copy states that drafts are not live. (`08-deployments.png`)

The problem is not "it looks unfinished". The problem is that the jobs around those surfaces contradict each other.

---

## 4. The job the IA does not support

Intended operator loop (product brief / forge-pack):

1. Create or select a Brand.
2. Set identity, Privacy, Terms.
3. Author or pick a master Quiz / Landing Page / Advertorial.
4. Bind it with a Deployment (Brand + domain + path).
5. Preview, then publish.
6. Read Leads.

What production actually offers:

- Nav says **Brands**. URL is `/admin/sites`. Table column is **SITE**. Search placeholder is **Search Sites**. Settings copy says **Open a Site from Sites**. Sign-in subtitle still says **Sites** and **Brand Kits**.
- Brand identity, the thing that reskins every deployment, is a hidden route (`/admin/brands/brand-identities`) with no nav item.
- Landing Pages open on a stock template catalogue with renderer keys, not on "what is live where".
- Deployments exist in four places (workspace Deployments, Quiz tab, LP tab, Advertorial tab) and they do not show the same state.
- Publish, Unpublish, Pause, Save, View Live, and Serving are different verbs for overlapping ideas.
- Payload is one click from every screen.

A competent operator cannot answer "what URL is live for Dont Settle right now?" from one screen without reconciling three statuses and two preview hosts.

---

## 5. Defects

### P0. Blocks the core job or causes a live/data mistake

#### UX-P0-001. Live state is not one state

The same objects report Draft, Live, Partial, Ready, Active, Serving, Published, and "certificate unknown" depending on the screen.

| Surface | What it said, same session |
|---|---|
| Overview deployment map | Every row **Draft**, including MVA Tiered Quiz T4 and Human Recovery Story |
| Workspace Deployments | The same rows **Live** |
| Quiz Deployments tab | Those quiz rows **LIVE** |
| Brands list | Accident Compensation Helper **Serving** and **Draft** on one row. Dont Settle **Serving** and **Active** |
| Brand header | Rescue QA **Partial**, then later **Ready**, with **Publish brand** then **Pause brand** |
| Danger zone | Rescue QA **draft**, "has not been published yet" |
| Overview attention | Preview hosts **Certificate state unknown** |
| Domains | Those same hosts **ACTIVE** |

Evidence: `02-overview-desktop.png`, `03-brands.png`, `08-deployments.png`, `09-domains.png`, `25-brand-overview.png`, `36-brand-danger.png`, `40-quiz-deployments.png`, `70-overview-mobile.png`.

An operator who trusts Overview will not publish. An operator who trusts Deployments will think traffic is live. Both cannot be right. This is the defect behind the operator complaints on deployments, preview, and publish.

#### UX-P0-002. Entering a Brand leaves the product

Clicking a Brand replaces the console sidebar with a Site CMS rail: Overview, Pages, Blog, Numbers, then Settings (General, Domains, Paths, SEO, Tracking, Users, Danger Zone).

Quizzes, Landing Pages, Advertorials, Deployments, and Leads disappear. The escape hatch is **Back to PageFlo**. The Brand header still offers **View Live Site** twice.

There is no Brand-scoped view of that Brand's funnels as the primary workspace. "Live funnels on this Site" is a small table with a link out to the other product.

Evidence: `25-brand-overview.png`, `26-brand-pages.png`, `78-brand-mobile.png`.

This is not a nav preference. It is why Brand-first and master-based deploy cannot be operated as one loop.

#### UX-P0-003. Preview and live are not distinguishable, and hosts disagree

- Brand chrome primary CTA is **View Live Site** on a Brand whose Danger zone says it is still **draft**.
- Each Brand has two preview hosts, both **ACTIVE**: `*.preview.pageflo.io` and `*.preview.legenex.com`. Dont Settle's Brands-list primary is the legenex host. Rescue QA and ACH primaries are pageflo.io. Deployments table PATH column uses one host and PREVIEW column uses the other for the same row.
- Overview Needs attention: "A domain does not go live until a real HTTPS handshake succeeds" for hosts Domains already marks ACTIVE.
- Quiz new-deployment editor: "This brand has no domain with an active certificate" for Accident Compensation Helper, whose Domains row is ACTIVE.

Evidence: `02-overview-desktop.png`, `03-brands.png`, `08-deployments.png`, `09-domains.png`, `25-brand-overview.png`, `43-quiz-new-deployment.png`.

The operator cannot tell preview from live, or which hostname to put in ads.

#### UX-P0-004. Owner sign-in recovery is a dead end

Production owner `team@legenex.com` is locked: "This user is locked due to having too many failed login attempts."

The only recovery control on the PageFlo sign-in form is **Forgot password?**, which goes to `/cms/forgot`. That page is unstyled Payload (white page, default serif, raw Submit / Back to login). It promises "You will receive an email message with instructions". This host has no email adapter. Back to login returns to CMS login, not `/sign-in`.

Users admin still shows that account as **LegalOS Super Admin**, **Active**, last login blank. Locked at the login layer is not visible in the roster.

Evidence: `01-signin-desktop.png`, `01d-forgot-password.png`, `01e-super-admin-locked.png`, `17-users.png`.

A commercial SaaS does not lock the owner into a CMS password form that cannot send mail.

#### UX-P0-005. Create persists immediately; Publish is the primary action on an invalid draft

**New Quiz Flow** does not open a naming wizard. It writes a row called **New Quiz**, marks it **DRAFT** and **SAVED**, and puts **Publish** in the primary slot next to a red **Flow check: 6 errors, 2 warnings**. The first step is **Welcome / empty**. Help text is engineer's graph theory: "Rows are steps in execution order - columns are tiers - a SHARED variant covers every tier - webhook, decision and verification nodes are hidden from the live quiz and auto-fire".

**New Advertorial** writes **Untitled Advertorial** / `untitled-advertorial`, already **DRAFT**, with **Publish** as the green primary. The canvas exposes `{{brandName}}` tokens as the authoring model.

The list already contained Untitled Advertorial drafts before this walk. The walk's own clicks created another quiz draft and another advertorial draft. That is the product, not the auditor.

Evidence: `05-quizzes.png`, `07-advertorials.png`, `41-quiz-create.png`, `49-advertorial-create.png`.

A funnel OS must not make "new" mean "already in the database, one mis-click from Publish".

---

### P1. Serious IA, terminology, flow, and leakage

#### UX-P1-001. Brand Identity is a core object with no navigation

`/admin/brands/brand-identities` is a real app: logos, palette, phone, TCPA, Edit, delete. It is not in the console nav. Brands copy says identity is "edited on the Brand, not as a separate Brand Kit", then the Brand workspace has **Edit Brand** plus **General Settings** plus this hidden third surface. Sign-in still advertises **Brand Kits**.

Evidence: `10-brand-identities.png`, `03-brands.png`, `01-signin-desktop.png`, `25-brand-overview.png`.

Without this in the IA, multi-brand reskin is tribal knowledge.

#### UX-P1-002. Nouns are not stable

Observed in one session:

- Brands / Sites / Site / SITE / Search Sites / Create Site / Pause Site / Delete Site / Open a Site from Sites
- Brand Kits on sign-in, Brand Identities as a page, "not as a separate Brand Kit" as Brands subtitle
- LegalOS Super Admin, SMTP from name **Legenex LegalOS**, Motor Vehicle Accident as the default new-Brand vertical, quiz templates all "How were you injured?"
- Open raw Payload admin on every console page
- Recent activity: `create sites`, `create funnel-advertorial-deployments`, `update funnel-lp-deployments`, `update tracking-configs`
- Page builder breadcrumb `ADMIN / SITES / RESCUE-QA-20260923 / PAGES`
- Footer pill **dev** on the production console
- Landing Page rows: `/sixty_second_check · sixty_second_check · slot copy`, **STOCK**, **LP09**, **Pain First** on every template

Evidence: `01-signin-desktop.png`, `02-overview-desktop.png`, `03-brands.png`, `06-landing-pages.png`, `15-settings-index.png`, `16-integrations.png`, `17-users.png`, `23-payload-cms.png`, `37-page-editor.png`, `73-new-brand-mobile.png`.

This is not copy drift. It is two domain models on screen at once.

#### UX-P1-003. Landing Pages open on engineering templates, not on live pages

Default tab is Templates. Primary CTAs are **New template with Claude** and **New blank template**. Rows lead with renderer ids, stock flags, and "slot copy". Deployments are a secondary tab with a count.

An operator who wants "put this LP on this Brand" has to know to leave the catalogue. Disable / clone / delete icon buttons sit on stock templates.

Evidence: `06-landing-pages.png`, `44-lp-templates.png`, `75-lp-mobile.png`.

#### UX-P1-004. Workspace Deployments is a bulk tool sitting on a read-only table

The page leads with Bulk deploy (Kind, Master, Path, Brands). The list under it has no Edit, Pause, or Publish. Path and Preview columns wrap raw URLs and disagree on host. One Live row is **no domain bound**. Master select lists duplicate "MVA Tiered Quiz 2 Tier" copies. Red validation "a deployment needs a path; "/" belongs to the Brand website" can show while Path is filled.

Quiz/LP/Advertorial each have their own Deployments tab with different chrome. Four lists, one noun.

Evidence: `08-deployments.png`, `40-quiz-deployments.png`, `51-bulk-deploy.png`.

#### UX-P1-005. Settings are duplicated and mixed with internals

Nav group **Integrations** and nav group **Settings** both contain Integrations. **System** (`/admin/system`) and **System health** (`/admin/settings/system`) are the same job. Settings index still says Site. Profile uses the Users icon.

Also in the operator nav: Agent Plan, Build log, Handbook, and **Open raw Payload admin**. Payload itself is an unstyled dump of Sites + Funnel Builder collections + Shared Legal Templates (`23-payload-cms.png`).

Integrations includes **Billing** (Starter/Growth) on an internal V1 with no billing provider, and a sticky Save bar that covers the Search Console heading.

Evidence: `15-settings-index.png`, `16-integrations.png`, `18-system-health.png`, `20-agent-plan.png`, `21-buildlog.png`, `54-nav-expanded.png`, `23-payload-cms.png`.

#### UX-P1-006. New Brand still creates a Site, with a broken preview and legal defaults

Dialog title **New Brand**. Modes: **Empty Site with default legal pages**, **Clone all pages from an existing Site**, **AI Template**. Primary button **Create Site**. Default vertical **Motor Vehicle Accident**. On-create preview URL renders `https://` with no host. Copy promises "9 default (Home + 8 shared legal templates)" and "default Legenex palette".

Evidence: `73-new-brand-mobile.png`. Desktop wizard click in this walk did not always mount (see UX-P1-010); mobile did.

#### UX-P1-007. Brand workspace is unusable on mobile, and console lists truncate

At 375x812 the Brand shell keeps the 250px Site sidebar. Content is crushed to a ribbon. **View Live Site** appears twice. Status controls stack off the card. (`78-brand-mobile.png`, `79-danger-mobile.png`)

Console routes do hide the sidebar behind a hamburger, which is the right idea. Lists still fail the job:

- Overview deployment map: `MVA Tiere…` / `Rescu…` / Draft
- Brands cards clip domains
- Leads table overflows; DELIVERY is clipped
- LP template keys wrap into noise

Tablet 768px keeps the desktop sidebar and is workable. Mobile Brand context is not.

Evidence: `70-overview-mobile.png`, `71-nav-drawer-mobile.png`, `72-brands-mobile.png`, `75-lp-mobile.png`, `76-leads-mobile.png`, `78-brand-mobile.png`.

#### UX-P1-008. Dangerous and unnamed icon actions

Quiz, LP, and Advertorial rows put clone / archive / pause / delete in icon-only buttons beside Edit. Brand Identities puts a trash can next to Edit on the Brand card. Domains puts a trash can on preview hosts (some disabled, no explanation on the button).

Danger zone **Pause Site** remains visible while the body says there is nothing to pause. **Archive Site** tells the operator that restore happens "from the raw admin".

Evidence: `05-quizzes.png`, `06-landing-pages.png`, `07-advertorials.png`, `09-domains.png`, `10-brand-identities.png`, `36-brand-danger.png`.

#### UX-P1-009. Quiz / LP / Advertorial editors leak the builder, not the job

- New deployment title is `/new-mufymr37` with **NEW · NOT SAVED**. Two Back buttons. Tab label **Destination URL's**. Cost/offer leftovers: `MVA · pain angle · paid social`. (`43-quiz-new-deployment.png`)
- Page editor: Unpublish vs LIVE vs PUBLISHED on one header, white empty-looking canvas, SITE DEFAULT, three rails of chrome. (`37-page-editor.png`)
- Advertorial: token chips as the first authoring surface. (`49-advertorial-create.png`)
- Websites, Deployments, Leads throw React minified error #418 (hydration) in production.

Evidence as named, plus `_notes.json` `OBS-console-errors`.

#### UX-P1-010. Empty, loading, save, and error are inconsistent

- Overview first paint included **Loading** in the account card and a **dev** pill. (`02-overview-desktop.png`)
- Super-admin lockout does eventually render an alert (good) but the message is Payload's, not PageFlo's, and there is no next step except the dead forgot-password link. (`01e-super-admin-locked.png`)
- Integrations always shows "Changes are not saved until you click Save" with no dirty state. (`16-integrations.png`)
- Quiz editor shows **SAVED** and **DRAFT** together, plus a blocking flow-check banner, plus **Publish**. (`41-quiz-create.png`)
- Coming-soon Brand Users and Brand SEO are real nav items that cannot complete the job they name. (`33-brand-seo.png`, `35-brand-users.png`)
- New Brand wizard did not reliably open from the desktop Brands CTA in this walk (`24-new-brand-wizard.png` is still the list). It did open on mobile. A primary CTA that misses is itself a defect.

#### UX-P1-011. Leads do not yet read as a working intake desk

One lead: Ada Lovelace, Quiz, Dont Settle, New, **None recorded** consent, **Not checked** phone, delivery clipped. Filter labelled **All sites**. Telemetry: **SITES IN SCOPE**. No click-through in this walk opened a durable detail (row click did not change the page). Export CSV is present.

For a lead OS this is the money screen. It currently looks like an admin table of a fixture.

Evidence: `11-leads.png`, `52-lead-detail.png`, `76-leads-mobile.png`.

---

### P2. Polish that still fails a commercial bar

#### UX-P2-001. Sign-in subtitle is a noun dump

"Sites · Landing Pages · Advertorials · Quizzes · Brand Kits · Domains · Deployments · Leads" is not a reason to sign in, and two of the nouns are wrong. (`01-signin-desktop.png`)

#### UX-P2-002. Overview "Live" badge

A green **Live** chip on the Overview title reads as environment or publish state for the whole workspace. (`02-overview-desktop.png`)

#### UX-P2-003. Duplicate View Live Site

Brand sidebar button and header button are the same action. (`25-brand-overview.png`)

#### UX-P2-004. Sidebar clock, Expand all, capture identity

A GMT+2 clock, Expand all, and a capture-bot account named "capture" are intern-tool chrome on an operator OS. (`02-overview-desktop.png`, `71-nav-drawer-mobile.png`)

#### UX-P2-005. Advertorial positioning is still Facebook/legal

Subtitle: "Native-style story pages that warm cold Facebook traffic before the quiz." Fine as an example, wrong as the definition of the object. (`07-advertorials.png`)

#### UX-P2-006. Vertical picker is a legal catalogue with other verticals bolted on

Mass Tort, Motor Vehicle Accident, Workers Comp, Personal Injury, Medical Malpractice, Class Action sit next to Solar and B2B. Default is MVA. (`03-brands.png`, `73-new-brand-mobile.png`)

---

## 6. Viewport notes

| Viewport | Console shell | Brand shell | Lists / builders |
|---|---|---|---|
| 1440x900 | Sidebar usable. Payload link and SOON badges still present. | Two-product split. | Builders are dense but clickable. |
| 768x1024 | Desktop sidebar at the md breakpoint. Workable. | Same split, tighter. | Tables start wrapping hosts. |
| 375x812 | Hamburger + drawer works. Overview metrics stack. | **Fail.** 250px rail stays. | Deployment map, leads table, LP keys, new-Brand preview URL all fail the job. |

Sign-in itself is fine at all three widths (`01-signin-desktop.png`, `01b-signin-tablet.png`, `01c-signin-mobile.png`).

---

## 7. Suggested repair order (UX only)

No code in this audit. If Bossman sequences work, the usability order is:

1. One status vocabulary, one place that tells the truth about live vs draft vs preview. Kill Overview-vs-Deployments contradiction first.
2. One shell. Brand context must keep funnel nav or the Brand page must *be* the funnel OS for that Brand. Stop saying "Back to PageFlo".
3. One preview host in the UI. Label preview as preview. Never use View Live as the primary on a draft Brand.
4. Put Brand Identity on Brands. Remove Brand Kits from sign-in.
5. Create flows: name, Brand, then persist. Publish is not the first button on an invalid graph.
6. Landing Pages default to deployments of templates, not the stock catalogue.
7. Hide Payload, LegalOS, collection slugs, `dev`, and agent boards from the operator nav. Keep Handbook if it is written for operators, not agents.
8. Collapse Brand chrome on mobile the same way the console already does.
9. Replace `/cms/forgot` with a PageFlo recovery path that does not lie about email, and surface lockout as an operator-recoverable state.

---

## 8. Evidence index

All under `docs/rescue-audit/evidence/picasso/`.

| File | What it shows |
|---|---|
| `01-signin-desktop.png` | Sites / Brand Kits subtitle |
| `01b-signin-tablet.png` | Sign-in at 768 |
| `01c-signin-mobile.png` | Sign-in at 375 |
| `01d-forgot-password.png` | Unstyled Payload forgot-password |
| `01e-super-admin-locked.png` | Owner lockout alert |
| `02-overview-desktop.png` | Draft map, unverified certs, collection activity, Live badge, dev pill |
| `03-brands.png` | SITE column, Search Sites, Serving+Draft |
| `04-websites.png` | Website inventory vs Brands |
| `05-quizzes.png` | New Quiz draft, icon danger actions |
| `06-landing-pages.png` | Stock catalogue, renderer keys |
| `07-advertorials.png` | Untitled drafts, Bulk Simplify |
| `08-deployments.png` | Live table vs Overview Draft, dual hosts, bulk form |
| `09-domains.png` | Dual ACTIVE preview hosts |
| `10-brand-identities.png` | Orphan identity app |
| `11-leads.png` | Sites filter, clipped table, no consent |
| `12-analytics.png` | Honest coming soon |
| `13-integrity.png` | Honest coming soon |
| `14-system.png` | System health |
| `15-settings-index.png` | Site copy, duplicate destinations |
| `16-integrations.png` | LegalOS from-name, Billing, sticky save |
| `17-users.png` | LegalOS Super Admin, Active, no last login |
| `18-system-health.png` | Duplicate of System |
| `19-profile.png` | Profile |
| `20-agent-plan.png` | Agent board in operator nav |
| `21-buildlog.png` | Build log |
| `22-handbook.png` | Handbook |
| `23-payload-cms.png` | Raw CMS, two product models |
| `24-new-brand-wizard.png` | Desktop New Brand miss |
| `25-brand-overview.png` | Second shell, View Live, Partial |
| `26-brand-pages.png` | Pages CMS |
| `27-brand-new-page.png` | New Page modes |
| `28-brand-blog.png` | Blog manager |
| `29-brand-numbers.png` | Call tracking |
| `30-brand-general.png` | General settings |
| `31-brand-domains.png` | Per-Brand domains (third domains UI) |
| `32-brand-paths.png` | Paths |
| `33-brand-seo.png` | Coming soon SEO |
| `34-brand-tracking.png` | Tracking (duplicate of deployment pixels) |
| `35-brand-users.png` | Coming soon users |
| `36-brand-danger.png` | Pause/Archive/Delete Site, draft vs View Live |
| `37-page-editor.png` | Breadcrumb leakage, Unpublish/Live/Published |
| `38-quiz-flows.png` | Quiz flows tab |
| `39-quiz-templates.png` | Quiz templates tab |
| `40-quiz-deployments.png` | LIVE quiz deployments |
| `41-quiz-create.png` | Immediate draft, 6 errors, Publish primary |
| `43-quiz-new-deployment.png` | `/new-mufymr37`, Destination URL's, cert warning |
| `44-lp-templates.png` | LP templates |
| `45-lp-create.png` | LP create |
| `46-lp-deployments.png` | LP deployments |
| `47-lp-new-deployment.png` | LP new deployment |
| `49-advertorial-create.png` | Untitled + tokens + Publish |
| `51-bulk-deploy.png` | Bulk deploy |
| `52-lead-detail.png` | Lead click did not open a distinct detail |
| `53-add-domain.png` | Domains add |
| `54-nav-expanded.png` | Duplicate Integrations/Settings |
| `60-65-*-tablet.png` | Tablet pass |
| `70-overview-mobile.png` | Truncated map, 9 unverified |
| `71-nav-drawer-mobile.png` | Drawer |
| `72-brands-mobile.png` | Brands cards |
| `73-new-brand-mobile.png` | Create Site, legal defaults, empty preview host |
| `74-quizzes-mobile.png` | Quizzes |
| `75-lp-mobile.png` | LP keys on a phone |
| `76-leads-mobile.png` | Leads |
| `77-deployments-mobile.png` | Deployments |
| `78-brand-mobile.png` | Brand shell failure |
| `79-danger-mobile.png` | Danger zone on a phone |
| `80-integrations-mobile.png` | Integrations |
| `_notes.json` | Structured copy, overflow, console errors |
| `_walk.mts` | Replay script. Does not contain passwords. |

---

## 9. Out of scope / not claimed

- Public funnel conversion UX (Funnel Auditor).
- Domain provisioning correctness (Odin). Certificate UI contradiction is in scope; DNS/TLS truth is not certified here.
- Accessibility beyond what blocked the jobs (focus, overflow, unlabeled icon actions).
- Whether the capture account should remain a super-admin. It was the only unlocked production super-admin this session could use without rotating secrets.
