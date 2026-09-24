# Settings inventory

Rescue audit. Funnel Auditor. 2026-09-24.

Every operator-facing settings surface under `/admin`, including Brand-scoped
rails and routes that are not in `NAV`. Runtime evidence from
`https://app.pageflo.io` against Brand `rescue-funnel-20260923` plus workspace
screens. Confirms `ARCHITECTURE.md` §10 (duplicate configuration) in the UI.

No application code was changed. Passwords are not recorded here.

---

## Auth note (how this walk signed in)

`SUPER_ADMIN_EMAIL` in production `.env` is `team@legenex.com`.
`payload.login` with `SUPER_ADMIN_PASSWORD` from that file returns Payload's
"The email or password provided is incorrect." Seed `ensureSuperAdmin` is
create-if-missing only, so the hash has drifted from `.env`.

`team@legenex.com` was also lockout-hot (`login_attempts=5`) from other
agents using local `.env` (`preview@localhost`). Attempts were cleared to
re-probe; the password still failed.

The walk used production super-admin `capture@legenex.com`
(`BUILDLOG_CAPTURE_*` in the same production `.env`), which signed in to
`/admin/overview`.

**SET-P0-001 — Production `SUPER_ADMIN_PASSWORD` does not log `team@legenex.com` into the console.** The documented seed contract is not the live login.

---

## Map of settings surfaces

| Surface | Route | In primary NAV? | Scope |
|---|---|---|---|
| Settings index | `/admin/settings` | via Settings children | Workspace |
| Integrations | `/admin/settings/integrations` | yes (twice: Integrations group + Settings) | Workspace global |
| Users (workspace) | `/admin/settings/users` | yes | Workspace |
| System health | `/admin/settings/system` | yes | Workspace |
| System (duplicate) | `/admin/system` | yes (Integrations → System) | Workspace |
| Profile | `/admin/profile` | yes | User |
| Legacy users | `/admin/users` | no | 308 → `/admin/settings/users` |
| Brand Identities | `/admin/brands/brand-identities` | **no** | Brand (`brand_identity` JSON + sync to `Site.brand`) |
| Domains pool | `/admin/brands/domains` | yes | Platform + Brand attach |
| Brand general | `/admin/sites/[slug]/settings/general` | Brand rail | Brand (`Site` columns) |
| Brand domains | `/admin/sites/[slug]/settings/domains` | Brand rail | Brand attach-from-pool |
| Brand paths | `/admin/sites/[slug]/settings/paths` | Brand rail | Pages only |
| Brand SEO | `/admin/sites/[slug]/settings/seo` | Brand rail | Coming Soon |
| Brand tracking | `/admin/sites/[slug]/settings/tracking` | Brand rail | Site `tracking-configs` |
| Brand users | `/admin/sites/[slug]/settings/users` | Brand rail | Coming Soon |
| Danger zone | `/admin/sites/[slug]/settings/danger-zone` | Brand rail | Brand status / delete |
| Numbers | `/admin/sites/[slug]/numbers` | Brand rail | `numbers` → Payload `/cms` |
| Blog | `/admin/sites/[slug]/blog` | Brand rail | `blog-posts` + dead SEO builder |
| Page editor | `/admin/sites/[slug]/pages/[id]` | via Pages | Page SEO + blocks |
| Analytics | `/admin/analytics` | yes, badge Soon | Coming Soon |
| Campaign Integrity | `/admin/integrity` | yes, badge Soon | Coming Soon |
| Handbook | `/admin/handbook` | Integrations child | Mix of live + Coming Soon |
| Agent Plan | `/admin/plan` | Integrations child | Internal |
| Build log | `/admin/buildlog` | Integrations child | Internal |
| Funnel deployment Tracking | LP/Quiz/Advertorial editors | no | Deployment JSON, **not injected live** |

---

## Workspace

### Integrations — `/admin/settings/integrations`

Evidence: `41-settings-integrations.png`. Save button present ("Changes are not saved until you click Save.").

| Field | Works? | Save/refresh | Consumed by | Dup / conflict / dead | Scope |
|---|---|---|---|---|---|
| SMTP host/port/user/pass | Form posts `saveIntegrationConfig` | Not refresh-probed (would write production SMTP) | Outbound mail. Production has **no email adapter** (handbook/memory); `/cms/forgot` is a dead hope | Leftover: From name **Legenex LegalOS**, from email `noreply@legenex.com` | Global |
| SMTP from name / from email | Same | — | Same | LegalOS leftover copy | Global |
| Slack webhooks (label, url, events) | Add webhook works in UI | Persist via JSON blob on global | Lead notifications if URL set | None configured | Global |
| GitHub repos (site, url) | Add repo | Same | Claimed "CI/CD and content sync" — no consumer verified in this walk | Dead-ish | Global, per-Site pointer |
| Search Console method/token | Fields exist | Same | Not observed on public pages | Unclear | Global |
| Billing plan / notes | Fields exist | Same | **Not connected to a billing provider** (on-screen). Saves notes only | Dead control | Global |

**SET-P2-001 — Billing is documentation pretending to be a setting.**
**SET-P2-002 — Integrations From name still says Legenex LegalOS.**

Nav lists Integrations under both **Integrations** and **Settings**. Same href.

### Users — `/admin/settings/users`

Live roster. Role bindings are `Users.siteBindings`. This is the only working user editor.

`/admin/users` 308s here (`52-legacy-users.png`). That redirect is honest.

### System health — `/admin/settings/system` and `/admin/system`

Two routes, one `SystemHealthReport`. Duplicate, not conflicting.
Evidence: `43-settings-system.png`, `44-system-duplicate.png`.

### Profile — `/admin/profile`

Fields: avatar_url, name, email, title, timezone, bio, password.
Save exists. Not mutated (would change the capture account).
Evidence: `45-profile.png`.

---

## Brand-scoped — `/admin/sites/rescue-funnel-20260923/...`

### General — `settings/general`

Evidence: `20-site-general.png`, `21-site-general-after-refresh.png`.

| Field | Works? | Save/refresh | Consumed by | Dup / conflict / dead | Scope |
|---|---|---|---|---|---|
| Name | yes | yes | Brand chrome, titles | Also Brand Identities display/internal name | Brand / Site |
| Slug | yes | not mutated | Admin URLs, preview host | Changing slug is a tenancy move | Brand |
| Tagline | yes | **SET-OK-TAGLINE** retained `audit-tagline-*` after save+reload | Funnel tokens / derived SEO | Brand Identities has its own tagline; schema also `brand.tagline_brand` | Brand |
| Vertical | yes | select | Filtering, seed flavour | — | Brand |
| Logo URL | URL field yes | — | Public chrome | Brand Identities logo light/dark | Brand |
| Logo Upload | **DEAD CONTROL** | n/a | nowhere | `type=button`, no handler. `SET-P1-001` | Brand |
| Favicon URL | URL field yes | — | `<link rel=icon>` | Brand Identities favicon | Brand |
| Favicon Upload | **DEAD CONTROL** | n/a | nowhere | Same as logo upload | Brand |
| Primary / Accent / Surface / Ink / Muted | yes | colour inputs | `Site.brand` → `siteToBrand` (Site.brand **wins**) | Brand Identities Colors tab writes `brand_identity` then syncs; extra schema tokens not in this form | Brand |
| Heading / Body font | yes | selects (5 fonts) | Public + builders | Brand Identities Typography; also `Site.typography` group | Brand |
| Org name / address / support email | yes | — | Unclear on funnel chrome | LegalOS-ish org fields | Brand |
| Default phone | yes | displays Tel: | Funnel call CTA via brand-map / Numbers | Fifth phone store (`Numbers`, identity `callNumber`) | Brand |
| Default disclaimer markdown | yes | textarea | `resolveBrandLegal` is one of four readers | Also `legal.default_disclaimer`, `brand_identity.legal` | Brand |

**Schema fields with no General UI** (`SET-P1-002`):
`cta`, `bg`, `primary_ink`, `cta_ink`, `surface_2`, `ink_muted`, `border`, `radius`, `radius_lg`, `shadow`, `display_name`, `short_name`, `logo_url_dark`, `tagline_brand`, plus `legal.*` group and `typography.*` group.

General copy claims "This Site's brand is the single source of truth" and then links to Brand Identities "for the full set". That sentence is how an operator edits two documents.

### Brand Identities — `/admin/brands/brand-identities` (hidden)

Not in `NAV`. Linked from General and the handbook. Evidence: `50-brand-identities.png`.

Editor tabs (source `BrandModule.tsx`): Identity, Colors, Typography, Contact, Domains (read-only list), Legal, URLs, Default Header & Footer, Default Body Sections.

| Field | Store | Consumed by live? | Conflict |
|---|---|---|---|
| Internal name / display name / tagline | `brand_identity` + sync | Display name on funnels | General `Site.name` / `tagline` |
| Logo light/dark, favicon, bg pattern | identity JSON | Logo/favicon yes; bg pattern funnel-only | General logo/favicon URLs |
| Colors including success/warning/danger | identity JSON; Site.brand wins at render for the canonical tokens | Yes, via merge | General 5-colour subset; schema marks success/warning/danger deprecated |
| Headline/body font, base size | identity + `Site.typography` | Yes | General font selects |
| Call number, CTA text/style | identity `contact` | Funnel chrome | General `default_phone`, `Numbers` |
| Copyright, TCPA, disclaimer, privacy/terms URLs | identity `legal` | Funnel footer / preflight | General `default_disclaimer_md`, `Site.legal` |
| Domains tab | read-only `__domains` | — | Real writes are Brands → Domains |
| Default header/footer/sections | identity chrome | Quiz/LP chrome `resolveDefaultChrome` | Deployment chrome columns unread |

**SET-P0-002 — Brand identity is two (really four) writable stores.** Confirmed in UI: General + Brand Identities + legal group + Numbers. ARCH-P0-006.

### Domains — Brand rail vs pool

Brand rail `settings/domains` (`27-site-domains.png`): Attach from pool, Detach, link "Brands → Domains". Audit Brand had both
`rescue-funnel-20260923.preview.pageflo.io` and `.preview.legenex.com`.

Pool `/admin/brands/domains` is the real provision/verify/primary UI.

**SET-P1-009 — Two Domain UIs.** Attach-only vs full pool. Confirms ARCH-P1-004.

### Paths — `settings/paths`

Evidence: `22-site-paths.png`, `23-site-paths-after-exclude.png`.

| Control | Works? | Save/refresh | Consumed? |
|---|---|---|---|
| Slug redirects list | Read-only, honest | n/a | Page slug changes | Pages only |
| Published pages list | Read-only | n/a | Sitemap of **Pages** | Does not list `/c/{slug}`, `/s/{slug}`, `/quiz`, `/lp` |
| Excluded slugs + Add | **DEAD CONTROL** | typed `audit-exclude`, Add, reload → gone | nowhere | `SET-P1-003` |
| robots.txt textarea | **DEAD CONTROL** | no save | Public robots may ignore this | `SET-P1-004` |
| Reset to default | **DEAD CONTROL** | `<button>` no handler | — | `SET-P1-004` |

**SET-P1-010 — Paths is not the path map.** Funnel deployments, site-scoped `/lp` `/quiz`, SharedLegal, CMC are invisible. Confirms ARCH-P1-010. An operator debugging a 404 is on the wrong screen.

### SEO — `settings/seo`

Coming Soon, on purpose, with a link to per-page SEO. `24-site-seo.png`.
**SET-P1-005.** Funnel deployments have no per-page SEO either (`FUN-P1-002`).

### Tracking — `settings/tracking`

Evidence: `26-site-tracking.png`, `26b-site-tracking-after-save.png`.
Save All with no edits showed a Saved toast (`SET-OBS-TRACKING-SAVE`).

Cards: Meta Pixel + CAPI, Google Ads, GA4, TikTok + Events API, GTM, TrustedForm, TrueCall, Jornaya, Custom Webhooks.

| Group | Saved on | Injected live? |
|---|---|---|
| Meta / Ads / GA4 / TikTok / GTM public IDs | `tracking-configs` per Site | **Yes** — `SiteScripts` on website **and** funnel public pages |
| CAPI / Events API tokens | same, server-only | Lead pipeline, not the client |
| TrustedForm / Jornaya | same | Script inject when enabled and `hasForm` |
| TrueCall | same | Call routing? Unverified in this walk |
| Custom webhooks | same | Lead pipeline if wired |

This is the tracking that actually fires. Funnel deployment Tracking tabs are a second, unread store (`FUN-P1-015`).

**SET-P1-011 — Tracking is configured in two places; only Site tracking is injected.**

### Users — Brand rail

Coming Soon. Bindings are real on workspace Users. `25-site-users.png`.
**SET-P1-006.**

### Danger zone

Evidence: `28-site-danger.png`. Honest copy: Pause / Archive / Delete (slug confirm). Current status **draft**. Pause disabled because unpublished. Delete warns leads are destroyed (correct; older copy lied).

Brand overview **Publish brand** is the inverse of this Pause. Two doors for Site status.

### Numbers

`29-site-numbers.png`. **New Number** → `/cms/collections/numbers/create`.
**SET-P1-007 — Operator is dumped into Payload admin.** LegalOS leftover.

Phone numbers used by funnels also live on General + Brand Identities. Three stores.

### Blog

`30-site-blog.png`. New Post → `/cms/collections/blog-posts/create`.
**SEO Builder** → `/admin/blog/seo-builder` **404** (`31-blog-seo-builder.png`, `53-hidden-seo-builder.png`).
Search input has no handler. Site filter is a display-only `<select>`.
**SET-P1-008.**

### Pages / page editor

List: 12 pages, all Published, including legal templates. `32-site-pages.png`.

Home editor (`33b-home-page-editor.png`): LIVE pill, Unpublish, section canvas, Page settings → Title/Slug/Status/SEO (Meta title, description, OG image + SERP/OG mocks in source). Autosave of blocks.

Websites index subtitle: "Section edits autosave as draft. Publish is the only way a live page changes." **False** for status=published pages (`ARCHITECTURE.md` ARCH-P0-002). All 12 seed published.

**SET-P1-012 — Website "draft autosave" copy is false on the pages this Brand actually has.**

---

## Funnel-local settings (not in Settings nav)

Covered in `FUNNEL-PARITY.md`. Short consumption table:

| Setting | Where edited | Saved? | Live consumer |
|---|---|---|---|
| LP/Quiz UTM + PIXEL_PROVIDERS | Deployment Tracking tab | yes, on deployment | **No** public inject |
| Advertorial flat pixels | Deployment editor | yes | **No** |
| Quiz Node Scripts | Flow Settings | yes, on master | **No** |
| Quiz Integrations (HLR, Maps, reCAPTCHA, email verify) | Flow Settings | yes | **No** public runtime |
| Quiz spam / honeypot defaults | Flow Settings | yes | Partial at best; not verified live |
| LP/Quiz destination overrides | Deployment Destinations | yes | **Yes** — `resolveDestination` |
| Quiz template / render mode | Deployment General | yes | **Yes** — public QuizRuntime |
| Advertorial CTA mode + quiz deployment id | Deployment editor | yes | **Yes** — AdvertorialRuntime |
| Brand chrome on quiz deployment | deprecated columns | leftover | **Unread**; Brand defaults win |

---

## Coming Soon / hidden / leftover

| Route | Status | Notes |
|---|---|---|
| `/admin/analytics` | Coming Soon | Badge Soon in NAV. Honest empty. `46-analytics.png` |
| `/admin/integrity` | Coming Soon | Honest empty. `47-integrity.png` |
| `/admin/sites/.../settings/seo` | Coming Soon | Per-page SEO exists |
| `/admin/sites/.../settings/users` | Coming Soon | Workspace Users exist |
| `/admin/blog/seo-builder` | **404** | Linked from Blog. Dead link, not Coming Soon |
| `/admin/brands/brand-identities` | Live, hidden | Primary Brand editor |
| `/admin/users` | 308 | Good |
| `/admin/system` vs `/admin/settings/system` | Duplicate live | Same report |
| `/cms/collections/numbers/create` | Payload | LegalOS leftover |
| `/cms/collections/blog-posts/create` | Payload | LegalOS leftover |
| `/cms/forgot` | Payload forgot | No production email adapter |
| Integrations From name | Live | "Legenex LegalOS" |
| Handbook | Live + Coming Soon count | Still teaches `slug.preview.legenex.com` (ARCH-P3-001) |

---

## Defect register (SET-)

### P0

**SET-P0-001 — `SUPER_ADMIN_PASSWORD` in production `.env` does not authenticate `team@legenex.com`.**
Create-if-missing seed never rotated the hash. Capture account still works.

**SET-P0-002 — Brand is not one document.**
General Settings, Brand Identities, `Site.legal`, `default_disclaimer_md`, and Numbers all author identity. Render merge is `brand-map.ts`. Confirmed both screens exist and both claim to be the source of truth.

### P1

**SET-P1-001 — Logo/Favicon Upload buttons are type=button with no handler.**
**SET-P1-002 — Canonical Brand token fields (cta, bg, display_name, …) absent from General.**
**SET-P1-003 — Paths excluded-slugs Add does not persist.**
**SET-P1-004 — robots.txt textarea / Reset have no save.**
**SET-P1-005 — Site-wide SEO Coming Soon; funnels have no per-URL SEO either.**
**SET-P1-006 — Site-scoped Users Coming Soon.**
**SET-P1-007 — Numbers "New Number" opens Payload `/cms`.**
**SET-P1-008 — Blog "SEO Builder" 404s; New Post opens `/cms`.**
**SET-P1-009 — Two Domain UIs (attach-only vs pool).**
**SET-P1-010 — Paths lists Pages only; funnel claims invisible.**
**SET-P1-011 — Site tracking is live; deployment pixels are not.**
**SET-P1-012 — Websites index promises draft autosave; seeded pages are published so autosave is live.**

### P2

**SET-P2-001 — Billing fields are notes.**
**SET-P2-002 — SMTP From name is Legenex LegalOS.**
**SET-P2-003 — Integrations appears twice in NAV.**
**SET-P2-004 — Analytics / Integrity Coming Soon (honest, still occupy operator attention).**
**SET-P2-005 — View Live Site on a draft Brand is an `https://{slug}.preview.pageflo.io` link that 404s for anonymous visitors.** Danger Zone even prints that host next to status=draft.

---

## Global vs Brand vs master vs deployment

| Concern | Global | Brand | Master | Deployment |
|---|---|---|---|---|
| Colours / fonts / logo | — | General + Identities (conflict) | — | Quick-edit writes Brand |
| Phone | — | General + Identities + Numbers | — | Reads Brand |
| Legal / TCPA / disclaimer | — | Four stores | Advertorial disclaimer section | Tokens |
| Tracking pixels | — | Site tracking (**live**) | Quiz nodeScripts (**dead**) | Deployment pixels (**dead**) |
| UTM | — | — | — | Stored; query string wins |
| SEO | Site SEO Coming Soon | — | — | Derived; no fields |
| Domain | Pool | Attach rail + Identities read-only | — | Picker (LP eligibility-aware; others not) |
| Path | — | Paths screen (Pages) | Advertorial slug (not the live path) | Real public path |
| Users | Workspace Users | Coming Soon | — | — |
| SMTP / Slack | Integrations | — | — | — |

---

## Evidence index

`20`–`33` Brand rail, `40`–`56` workspace + hidden routes, `50-brand-identities.png`, `findings.json` (`SET-OK-TAGLINE`, `SET-P1-001`…`SET-P1-008`).
