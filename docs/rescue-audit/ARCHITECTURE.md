# PageFlo architecture, as the code actually is

Rescue audit. Archie. 2026-09-23.

This document describes the **running architecture**, not the intended one.
Runtime and collection code win over `docs/STATE.md`, W60 PASS markers, and
the V1-complete claim. Product intent is cited only to name the gap.

Nothing here is a patch. Repair recommendations are architectural, not
implementation.

---

## 1. Verdict

PageFlo is not one commercial funnel platform. It is **two stacked products**
sharing a Next.js process and a `Sites` row:

1. A **site CMS**: tenant `Pages`, site-scoped `Quizzes`, site-scoped
   `LandingPages`, `BlogPosts`, SharedLegalTemplates, Plesk domains.
2. A **ported funnel builder**: brandless `FunnelQuizzes` /
   `FunnelLandingPages` / `FunnelAdvertorials`, bound to Brands through three
   deployment collections.

The operator shell (`/admin`) presents the second product as the product:
Brands, Quizzes, Landing Pages, Advertorials, Deployments, Domains. The public
router still serves the first product **first**. A seeded site-scoped page at
`/lp` or `/quiz` silently beats a funnel deployment on the same path.

The locked V1 model in `forge-pack/01-product/DECISIONS.md` is internally
coherent:

- Brand is the tenant.
- Masters are brand-neutral.
- Deployments bind master + Brand + domain + path.
- No deployment copy overrides.
- Master changes require explicit republish before live changes.
- Bulk multi-brand deploy is in V1.
- Canonical preview is `*.preview.pageflo.io`.

The code implements fragments of that model, then keeps the older model next
to them. The result is that operators cannot tell which object they are
editing, which URL a visitor will hit, or whether Save, Publish, Pause, and
Unpublish are the same act.

That is the architectural reason Domains, preview domains, Deployments, LP,
Advertorial, Quiz, settings, and builder/preview/live consistency all feel
broken at once. They are not independent bugs. They are one model with three
incomplete replacements.

---

## 2. Intended domain model vs actual objects

### Intended (forge-pack)

```text
User / role
    |
    v
Brand  (tenant, identity, legal, website, domains)
    |
    +-- Brand Website (pages, drafts, published snapshot)
    +-- Domains (preview + custom)
    +-- Deployments
            |
            +-- Master Landing Page  (copy + structure)
            +-- Master Advertorial   (copy + structure)
            +-- Master Quiz          (logic + graph)
                    |
                    +-- Quiz visual template (selected at deployment)
```

### Actual collections

| Operator noun | Payload slug | Tenant field | Notes |
|---|---|---|---|
| Brand | `sites` | self | Also called Site in code, URLs, cascade, access |
| Brand website page | `pages` | required `site` | Block builder. Dual body: `body_blocks` + `published_blocks` |
| Site-scoped quiz | `quizzes` | required `site` | Seeded on Brand create. Still routed publicly |
| Site-scoped landing page | `landing-pages` | required `site` | Seeded on Brand create. Still routed publicly |
| Master Quiz | `funnel-quizzes` | none | Brandless. `is_published` + `is_archived` |
| Master LP (called "template") | `funnel-landing-pages` | none | Brandless. `is_published` + `is_enabled` |
| Master Advertorial | `funnel-advertorials` | none | Brandless. `status` draft/published/archived |
| Quiz visual template | `funnel-quiz-templates` | none | Identity + `renderer_key` |
| Quiz deployment | `funnel-quiz-deployments` | nullable `site` | Access: `isAuthenticated` |
| LP deployment | `funnel-lp-deployments` | nullable `site` | Access: `isAuthenticated`. Has publish fingerprint |
| Advertorial deployment | `funnel-advertorial-deployments` | nullable `site` | Access: `isAuthenticated`. No preflight |
| Domain | `domains` | nullable `site` | Preview auto-issued; custom via Plesk |
| Lead | `leads` | required `site` | Out of this audit's surface except as cascade risk |

Nav label "Brands" points at `/admin/sites`. Payload group is still
`PRODUCT_NAME`. Collection comments still say Site. Operators and agents
cannot share a noun.

---

## 3. Brand / Site

### What a Brand is

`Sites` (`src/collections/Sites.ts`) is the tenant root. Access, cascade, and
the public host map all key off it. That part of the model is sound and should
be kept.

A Brand owns, in principle: identity, niche, legal entity, phone, domains,
website pages, tracking, numbers, leads, and the `site` pointer on funnel
deployments.

Status on the Brand itself (`draft | active | paused | archived`) is a
**traffic valve**, not a content version:

- `draft`: public router 404s unless the caller is bound to the Brand.
- `active`: public serve.
- `paused`: public `PausedSite` page, not 404.
- `archived`: 404, hidden from some listings. Terminal from
  `SitePublishControl`. Restore is a different decision.

`createSite` (`src/app/(app)/admin/(top)/sites/actions.ts`) always creates
`status: 'draft'`, issues preview domain(s), seeds published website pages,
seeds site-scoped quiz + LP, and tries to seed funnel deployments. A new Brand
is therefore **content-full and traffic-closed**. That is correct. The trap is
that the preview host still 404s for anonymous visitors until the Brand is
published. The handbook records this; the UI still offers the preview URL as
if it works.

### Identity: three writable stores

`src/lib/brand-map.ts` states the merge rule:

1. `Site.brand.*` is canonical for colours, fonts, logos, display name.
2. `Site.brand_identity` JSON fills funnel-only extensions (chrome, TCPA,
   voice, default sections).
3. `Site.legal.*` and `default_disclaimer_md` also hold legal copy.

`resolveBrandLegal` then reads **four physical locations** for disclaimer /
TCPA: `legal` group, `legal_*` flat SQL keys, `brand_identity.legal.*`, and
bare `brand_identity.*` scalars.

Two operator editors write different stores:

| Surface | Writes | Route |
|---|---|---|
| Brand list + general settings | `Site.name`, `Site.brand`, `legal` group, phone | `/admin/sites`, `/admin/sites/[slug]/settings/general` |
| Brand Identities builder | `Site.brand_identity` JSON, and a sync onto `Site.brand` | `/admin/brands/brand-identities` (not in primary nav) |
| BrandQuickEdit in funnel builders | Brand Identities save path | modal from LP/quiz editors |

`brand-map.ts` says Site.brand always wins. The Brand Identities editor is
the funnel-facing identity UI. General Settings is the Site-facing one. An
operator who changes a colour in one place and a disclaimer in the other has
not edited "the Brand". They have edited two documents that happen to share an
id.

Phone is a fifth store: `Numbers` + `resolvePhoneForPath`. Pages must not
denormalize it (`AGENTS.md` invariant 4). Funnel chrome still dials
`brand.contact.callNumber`, which is mapped from Site fields and identity JSON.

### Brand change on a live funnel

There is no "Brand change" transition on a deployment beyond writing
`site` / `brandId`. Render always calls `siteToBrand` against the current Site
row. Changing identity **immediately reskins every live URL**. That matches
Decision 8 ("Brand identity reskins automatically") and contradicts any
operator expectation of a staged preview of the reskin.

Changing the **deployment's Brand** (re-point `site`) is a tenancy move.
`enforceDeploymentTenancy` requires the caller to be bound to both ends and
refuses a domain that belongs to the old Brand. The LP editor clears `domain`
when Brand changes. Quiz and advertorial editors are less strict in the UI.

---

## 4. Brand website

### Intended

A first-class editable website, separate from funnel masters. Draft vs
published versions. AI and section editing against draft. Publish is the only
live mutation.

### Actual

The website **is** the `pages` collection, listed at `/admin/websites` as a
count table that links into `/admin/sites/[slug]/pages`.

There is no website manifest object. There is no website version table.
`Pages` has:

- `status`: draft / published / scheduled / archived
- `body_blocks`: builder working copy
- `published_blocks`: claimed snapshot of last publish
- `uses_shared_template` + `template_key`: can ignore blocks entirely and
  render a SharedLegalTemplate
- `hidden_blocks`, `block_meta`, `slug_redirects`

`resolvePublicBlocks` (`src/lib/site-builder/sections.ts`) serves
`published_blocks` when it is an array, else `body_blocks`.

`savePageBodyBlocks` (`src/app/(app)/admin/sites/[slug]/pages/[id]/blocks-actions.ts`)
debounces every builder edit into `body_blocks`. **If `status === 'published'`
it also writes `published_blocks` on that same save.** The file header still
says `body_blocks` is what the public renderer reads. The public renderer does
not. The Websites index subtitle says "Section edits autosave as draft.
Publish is the only way a live page changes." That sentence is false for any
page already in `published`.

New Brands seed every default page as `status: 'published'`
(`createSite`, lines 257-270). The first builder open of a live Brand website
therefore autosaves straight to the public snapshot.

Scheduled pages exist in the schema (`publish_at`). The website builder save
can set `publish_at`. There is no worker that flips scheduled to published;
the public router treats `scheduled` + `publish_at <= now` as live. That is a
read-time promotion, not a transition.

Privacy and Terms: `createSite` seeds hosted Pages at `/privacy` and `/terms`
and writes relative URLs via `hostedLegalUrls()`. The public router also
serves SharedLegalTemplates for those paths **if no Page wins**, and for
`check-my-claim` it still has hardcoded React pages (`CMC_PAGES` in
`src/app/(public)/[[...slug]]/page.tsx`). Three implementations of legal
pages.

---

## 5. Master assets

### Quiz master (`funnel-quizzes`)

Owns graph: `tiers`, `steps`, `nodes`, `custom_fields`. Flags:
`is_published`, `is_archived`, `archived_at`.

`setQuizArchived` always unpublishes in the same write. Restore does not
re-publish. That pair is coherent.

`saveQuiz` writes the graph with no version pin. A live deployment's public
resolver (`hydrateQuizDeployment` in `src/lib/quiz-deployment.ts`) loads the
current master by id. **Editing a published master changes every live URL
immediately.** Decision 9 is not implemented.

The gated master-publish action `setQuizPublished` in
`src/app/(app)/admin/(top)/publish-actions.ts` runs preflight against every
**live** deployment of that quiz before flipping `is_published`. The Quiz
builder never calls it. The Publish button calls
`saveQuiz({ patch: { is_published } })`. The preflight door is dead code.

Client undo in `QuizBuilderApp` is session-local. There is no server history.

### Landing Page master (`funnel-landing-pages`)

The collection labels are "Landing Page Template(s)". The operator nav is
"Landing Pages". The row is both:

- a selectable template (`template_id` names a code renderer, `stock_key`
  for the twelve ported ones)
- a copy document (`sections` for four identity templates, `slot_overrides`
  for ported templates)

`is_published` gates public serve of deployments. `is_enabled` gates **new**
selection. Disabling does not unpublish. That split is correct.

`setLandingPagePublished` exists and does **no** deployment preflight (unlike
the unused `setQuizPublished`). Unpublishing the master 404s every deployment
of it at read time (`resolveLpDeployment` checks `lpDoc.is_published`).

Deployment copy overrides are forbidden on write
(`refuseDeploymentCopyOverride` in `src/lib/master-safety.ts`) and ignored on
read (`composedOverrides` is master `slot_overrides` only). The column
`content_overrides` still exists. The LP editor still hydrates it. Collection
admin copy still describes it as "this deployment's own copy". Operators can
still type into a field that will not appear live.

### Advertorial master (`funnel-advertorials`)

`status`: draft / published / archived. Public resolver refuses a non-published
master unless `includeUnpublished`. Save is a generic `saveAdvertorial` that
writes `status` as a field. No preflight, no fingerprint, no archive flag
separate from status.

Delete is blocked while deployments exist (`masterHasDeploymentsMessage`).
The UI confirm on archive/delete still says "Any deployments using it are
removed too", which the action refuses to do.

### Site-scoped twins

`quizzes` and `landing-pages` remain live, seeded, and routed. They are not
the funnel builder. They are not masters. They occupy public paths with
**higher precedence** than funnel deployments (`CLAIM_PRECEDENCE` in
`src/lib/path-claims.ts`: page=0, landing-page=1, shared-legal=2,
quiz-deployment=3, lp-deployment=4, advertorial-deployment=5).

`createSite` publishes a site-scoped quiz at `/quiz` and LP at `/lp`. Those
claims win forever against funnel deployments on those paths unless someone
unpublishes the site-scoped rows. The funnel builder does not show them.

---

## 6. Deployment architecture

A deployment is the binding the product is supposed to be. The three
collections almost match:

| Field | Quiz | LP | Advertorial |
|---|---|---|---|
| master relation | `quiz` | `landing_page` | `advertorial` |
| Brand | `site` | `site` | `site` |
| domain | optional | optional | optional |
| path | yes | yes | yes |
| visual template | `template_id` | on the master, not the deployment | `template_id` on master |
| embedded quiz | n/a | `quiz` + `embedded_quiz_template_id`, fallback `quiz_deployment_id` | `quiz_deployment_id` text |
| tracking | `utm`, `pixels` | `utm`, `pixels` | `utm`, `pixels` |
| destinations | `destination_overrides` | `destination_overrides` | none |
| status | draft/live/paused | draft/live/paused | draft/live/paused |
| publish fingerprint | **no** | `last_published_at` + `published_fingerprint` | **no** |
| preflight on go-live | yes (`setQuizDeploymentStatus`) | yes (`setLpDeploymentStatus`) | **no** |
| copy overrides | deprecated chrome columns, unread | `content_overrides` unread on public | none |

### What a deployment is allowed to store

Locked rule: no public copy overrides, no quiz-logic overrides.

Enforced on some writes:

- `saveQuizDeployment` refuses `nodes`/`steps`/`tiers` via
  `deploymentCarriesQuizLogic`.
- `saveDeployment` (LP) refuses non-empty `contentOverrides`.
- `writeOverrides` in `content-actions.ts` refuses any non-empty next map,
  then still has a code path that would write `content_overrides` if that
  guard were removed.

Not enforced:

- Advertorial body is only on the master, so there is no override field, but
  the master save **is** live the moment `status=published` and a live
  deployment exists.
- Quiz master save is live immediately, as above.
- Brand chrome deprecated columns remain on quiz deployments and are not
  cleared.

### Optional domain

A deployment with `domain: null` is reachable on **every host the Brand
owns**. That is the resolver's real behaviour
(`resolveQuizDeploymentUncached` matches site+path, then prefers a domain
match). `effectiveDeploymentUrl` prints the primary eligible host, else
preview. The Deployments index `hostOf` prints `"no domain bound"` for the
same row. Three answers to one URL.

### Embedded quiz: two bindings

LP deployments prefer `quiz` (master flow id) + `embedded_quiz_template_id`.
Legacy `quiz_deployment_id` is a bare text id with no FK. The public resolver
and the preflight both prefer own flow, then legacy. Preflight requires the
borrowed quiz **deployment** to be `live` and same-Brand. If an LP template
has a quiz mount and no quiz resolves, public serve is 404, not an empty card.

Advertorials still only link a quiz **deployment** by text id. Embed vs button
is `cta_mode`. There is no direct flow binding. Unpublishing the linked quiz
deployment does not 404 the advertorial; CTAs fall back toward phone.

### Access

All three deployment collections are `isAuthenticated` on every verb. Writes
are additionally gated by `enforceDeploymentTenancy`. Reads are not
site-scoped. Any logged-in user can list every Brand's deployments. That is
an explicit comment in `deployment-tenancy.ts`, not an accident. It is still
a tenancy hole for a multi-operator console.

---

## 7. Public routing, previews, domains

### Request path

1. Plesk nginx terminates TLS, proxies to Next on 127.0.0.1:3000.
2. `src/middleware.ts` stamps `x-pageflo-host` / `x-legalos-host`, preview
   intent headers, host role. CSRF origin must be allowlisted or server
   actions look unauthenticated.
3. `classifyHost` (`src/lib/pageflo/hosts.ts`) decides marketing / app /
   legacy-app / tenant **before** any Domain lookup. Reserved hosts cannot be
   stolen by a Domains row.
4. Tenant hosts call `resolveSiteByHost` (`src/lib/site-resolver.ts`).
5. `src/app/(public)/[[...slug]]/page.tsx` resolves the path.

### Host to Brand

`resolveSiteByHost`:

- Normalizes host.
- Matches `domains.host`, plus the other preview suffix via
  `previewAliasHosts` so `{slug}.preview.pageflo.io` can resolve a row stored
  as `{slug}.preview.legenex.com`.
- Admits via `domainEligibility` when `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY` is
  on (production comment says it is on).
- Preview hosts do not 307 to an ineligible custom primary
  (`previewToPreview` short-circuit). An ineligible primary is not used as
  canonical.
- 60s in-memory cache. Mutations call `invalidateHostCache`.
- Unassigned pool rows (`site: null`) 404.

Provisioning uses a **second** resolver, `resolveDomainForProvisioning`,
deliberately ungated so the SSL poller can open `ssl_status=active`. Public
traffic must never call it.

### Domain eligibility (one contract, incomplete wiring)

`src/lib/domain-eligibility.ts`:

- Custom: `status=active` AND `ssl_status=active`.
- Preview: `status=active` only, because `PREVIEW_REQUIRES_SSL = false`.
  Preview rows are created without a certificate. `previewUnverified` is the
  honest flag.

Wired into: resolver, publish preflight, LP deployment picker,
`effectiveDeploymentUrl`, `mayBecomePrimary`.

**Not wired into:** quiz builder domain picker, advertorial builder domain
picker, `brand-map` link host. The module's own header says so. Operators can
still bind a quiz or advertorial to a domain the router will refuse.

### Preview hosts

`createSite` issues:

1. `{slug}.{PAGEFLO_PREVIEW_DOMAIN}` as **primary** (fallback
   `preview.pageflo.io`).
2. The other root (`preview.legenex.com` by default) as non-primary preview.

Existing production rows are on `preview.legenex.com`. Application aliasing
makes the new suffix resolve without a data rewrite. DNS for
`*.preview.pageflo.io` is a human gate. Until that cutover, the canonical
code default and the live wildcard disagree.

Preview rows: `kind: 'preview'`, `status: 'active'`, `ssl_status` left at
default `unknown`. They cannot be deleted from the UI (invariant 9). Custom
domains stay non-primary until verified and promoted.

Two Domain UIs:

- `/admin/brands/domains`: platform pool, DNS, verify, primary.
- `/admin/sites/[slug]/settings/domains`: attach-from-pool only, defers
  configuration to Brands → Domains.

### Public path order (serve)

From `page.tsx`:

1. Authored `Pages` (published, or scheduled whose time has come; admin
   preview relaxes to non-archived).
2. Hardcoded CMC components for `check-my-claim`, skipped in admin preview.
3. Page slug redirects.
4. SharedLegalTemplates for a fixed path set.
5. Site-scoped `landing-pages` (published only).
6. Funnel quiz deployment.
7. Funnel LP deployment.
8. Funnel advertorial deployment.
9. Blog `/blog/:slug`.
10. 404.

`generateMetadata` uses the same order for Pages then quiz → LP → advertorial.
Shared legal / CMC / site-scoped LP are thinner in metadata than in the body.
A path served as a SharedLegalTemplate can still emit a Brand-name title from
the "nothing authored" branch if metadata did not also run the shared-template
lookup. Funnel resolvers call `isClaimedByAuthoredContent` so metadata and
body cannot split on Page vs deployment. They can still split on CMC vs
shared legal.

### Preview of unpublished funnel content

`includeUnpublished` is the authenticated-admin flag. The catch-all sets it
from `isAdminPreview` = bound to this Brand AND (`?preview=1` OR
`?site=<slug>`). Middleware only forwards intent. The route re-checks auth.

A draft Brand is visible to bound users on its own host without a query
string (`maySeeUnpublished`). Anonymous visitors 404. That is why "open the
preview domain after creating a Brand" fails.

Builder Preview buttons do not all open the public URL. Quiz list Preview
opens the in-app `QuizPreviewView`. Advertorial list Preview is in-app.
Printed URLs on quiz and advertorial lists are often not real routes (see
lifecycle file).

---

## 8. Version history

There is none that the product can name.

| Layer | What exists | What is missing |
|---|---|---|
| Website page | `published_blocks` snapshot, overwritten on every save while status=published | Draft/published pair that survives; restore; history list |
| LP deployment | SHA-256 fingerprint of **binding** fields, not master copy | Master version id; rollback |
| Quiz deployment | status only | fingerprint, master version |
| Advertorial | status only | everything else |
| Quiz/LP/advertorial masters | `updatedAt` | versions, drafts, republish pointer |
| Brand identity | last write wins across two editors | snapshot, preview of reskin |
| Payload `versions` | not enabled on these collections | — |

Client undo in the quiz builder is not history. It dies with the tab.

Without a published master version id on the deployment, "republish" cannot
mean "push this master revision live". Today it can only mean "set status to
live again" or "re-run preflight". Live already reads HEAD of the master.

---

## 9. Builder vs runtime

### Landing pages

Public LP render uses `resolveLpDeployment` then `LivePreview as
LandingPageSections` from `src/components/builder/lp/render`. That is the
right shape: one composition module. Remaining risk is template identity
(code registry vs `funnel-landing-pages` records vs cloned ids) and the
ignored `content_overrides`.

### Quizzes

Public runtime is `src/components/public/quiz/QuizRuntime.tsx`. Builder
preview is `QuizPreviewView` / `QuizStill`. Template resolution for render
goes through records then code registry. Preflight uses the same record
lookup after a historical bug where it did not. Cloned templates are
renderable. Disabled templates still serve if already live. Unknown template
ids 404 rather than falling back. That refusal is correct.

Quiz chrome (header/footer) is Brand-level (`resolveDefaultChrome`).
Deployment chrome columns are unread. A deployment that "looks branded" in an
old screenshot and unbranded after a rebuild is this move, not a random CSS
bug.

### Advertorials

`AdvertorialRuntime` on the public path. Builder has its own preview. Domain
picker and URL printer are the old artifact, not `effectiveDeploymentUrl`.

### Website pages

Builder canvas vs live: `bespoke-css.ts` must dual-scope
`html.site-shell` and `.legalos-builder-canvas` (plus `.pageflo-builder-canvas`
per `docs/ARCHITECTURE.md`). Shipping one selector is a known class of
divergence. `uses_shared_template` can make the builder show blocks while live
still renders the shared markdown, until the first builder save forces
`uses_shared_template: false`.

### Autosave vs publish, by surface

| Surface | Autosave | What live does |
|---|---|---|
| Website page builder | yes, `savePageBodyBlocks` | If page is published, live snapshot updates |
| Quiz master | yes, `saveQuiz` | Live deployments serve new graph immediately |
| LP master slots | template save path | Live deployments serve new slots immediately |
| Advertorial master | save / mutate | If master is published, live immediately |
| LP deployment | Save button | Binding changes go live if status already live; copy overrides refused |
| Quiz deployment | Save button | Same; going live is diverted through preflight |
| Advertorial deployment | Save button | `status: 'live'` is written directly |

The product line "editing is not publishing" is true only for LP/quiz
**deployment status**, and only on the way up. It is false for master content
and for published website pages.

---

## 10. Settings: duplicate configuration

Operator-facing settings are split across Brand-scoped and platform-scoped
screens, then split again by which Brand editor you opened.

| Concern | Where it lives | Also lives |
|---|---|---|
| Brand name, palette, phone | General Settings (`Site.brand`) | Brand Identities (`brand_identity`) |
| Disclaimer / TCPA | `Site.legal`, `default_disclaimer_md`, `brand_identity.legal` | publish preflight reads `resolveBrandLegal` |
| Domains | `/admin/brands/domains` | `/admin/sites/[slug]/settings/domains` (attach only) |
| Paths / redirects | `/admin/sites/[slug]/settings/paths` (Pages only) | deployment `path` on three collections; `path-claims` is the real map |
| Tracking | `tracking-configs` per Site | deployment `utm` / `pixels` |
| Users | Site settings users + platform `/admin/settings/users` | `Users.siteBindings` |
| Integrations | platform `integration-config` global | Site tracking |
| Danger zone | pause / archive / delete Brand | `SitePublishControl` on the Brand dashboard |

The Paths screen does not list funnel deployments. An operator debugging a
404 is looking at the wrong map.

---

## 11. Bulk deploy

`planBulkDeploy` / `bulkDeployMaster`:

- One master, many Brands, one path.
- Creates **drafts only**. Copy on the form is honest about that.
- Isolates failures per Brand (`isPartialBulkSuccess`).
- Preview URL uses `previewHostForSlug` (canonical preview root), which is
  better than the quiz list's fake `/q/{id}`.
- Does not bind a domain.
- Quiz always gets `sq_quiz_first` unless that record is missing.
- Path check is run with `live: false`, so it cannot collide. Publish later
  can still fail the path.
- No preflight, by design (drafts).
- Does not publish, does not resume, does not update existing rows on the
  same path. A second bulk to the same Brand+path creates another draft.
  Two drafts on one path are allowed; two **live** rows are not.

Partial success is a first-class result. The UI must show per-Brand errors.
If it only toasts "ok", that is a product defect on top of a correct planner.

---

## 12. Seed and sample gravity

`createSite` and `seedStarterFunnelsForBrand` / `funnel-samples.ts` create
**live** quiz, LP, and advertorial deployments with `overrideAccess: true`,
which bypasses userful tenancy and the preflight hook (`publishRequiresPreflight`
only fires when `req.user` is set). New Brands can therefore be born with
live funnel URLs that never passed the publish gate the UI now requires.

Sample paths (`/s/mva`, `/a/{slug}`, stock LP paths) plus site-scoped `/quiz`
and `/lp` are how a "blank" Brand is already a maze of claims.

---

## 13. Issue register (architecture)

### P0

**ARCH-P0-001 — Live funnels serve master HEAD. Republish is not a thing.**
`saveQuiz`, LP slot saves, and published advertorial saves mutate the document
the public resolver reads. Decision 9 required a published master version
pinned on the deployment. There is no version column. LP fingerprint hashes
deployment bindings, not master copy, so master edits do not even show
"unverified changes".

**ARCH-P0-002 — Website publish snapshot is overwritten by autosave.**
`savePageBodyBlocks` writes `published_blocks` whenever `status ===
'published'`. `createSite` seeds pages as published. The Websites page
promises draft autosave. Live website and builder are the same buffer.

**ARCH-P0-003 — Two content systems share one public router.**
Site-scoped `Pages` / `landing-pages` / `quizzes` / SharedLegalTemplates /
CMC hardcoded pages win over funnel deployments. Starter content publishes
the older objects onto paths the funnel product also uses. Operators deploying
a master onto `/lp` or `/privacy` lose silently (`isClaimedByAuthoredContent`
returns null from the funnel resolver).

**ARCH-P0-004 — Advertorial go-live is an unauthenticated-shaped save of a
status string.**
`saveAdvertorialDeployment` writes `status` including `live`. Collection hook
sets `publishRequiresPreflight: false`. No `setAdvertorialDeploymentStatus`.
No fingerprint. Path check only. Master publish is the same pattern.

**ARCH-P0-005 — Quiz and advertorial UIs still invent URLs that are not
routes.**
`QuizBuilderApp` list: `https://preview.legenex.com/q/${id}`.
`AdvertorialBuilderApp` list: `https://preview.legenex.com/a/${id}`.
`deployment-url.ts` exists specifically because those strings 404. LP was
migrated. The other two were not. Preview and Live buttons that open those
strings cannot match production.

**ARCH-P0-006 — Brand identity is not a single document.**
`Site.brand`, `Site.brand_identity`, `Site.legal`, `default_disclaimer_md`,
and `Numbers` all author "the Brand". Two UIs. Render merge is documented in
`brand-map.ts` and still surprises anyone who edited the other screen.

**ARCH-P0-007 — Quiz master Publish bypasses the gated action.**
`setQuizPublished` is the only function that preflights live deployments
before flipping `is_published`. Zero UI callers. Builder writes the checkbox
through `saveQuiz`.

### P1

**ARCH-P1-001 — Three deployment types, three lifecycles.**
LP: preflight + fingerprint + list toggle via `setLpDeploymentStatus`.
Quiz: preflight on deployment status, no fingerprint, list toggle via
`saveQuizDeployment` (which internally diverts go-live). Advertorial: raw
status write. Operators learn one of these and assume the others.

**ARCH-P1-002 — UI verbs do not match stored states.**
See `DEPLOYMENT-LIFECYCLE.md`. Pause vs Unpublish vs Draft vs Live vs
Published vs Active are used interchangeably. List toggles Pause while the
aria-label says Unpublish.

**ARCH-P1-003 — Domain eligibility is optional in two of three builders.**
Documented in `domain-eligibility.ts`. Quiz and advertorial can still select
an ineligible host. Publish preflight then blocks quiz/LP; advertorial does
not even preflight eligibility.

**ARCH-P1-004 — Preview architecture is dual-root and dual-UI.**
Code canonical `preview.pageflo.io`, live wildcard `preview.legenex.com`,
rows on the old suffix, new Brands get both, SSL unverified by policy,
`PREVIEW_REQUIRES_SSL=false`. Two admin surfaces for one table.

**ARCH-P1-005 — Path, domain, Brand, and template changes on a live row are
edits, not publishes.**
A live LP/quiz deployment stays live through content/binding edits
(`enforceDeploymentTenancy` only blocks non-live → live without the
preflight marker). Changing path or template on a live row is immediately
public. Path check runs on save if the incoming status is live, but a live
row whose path is changed in the same save that keeps status live is an edit,
not a gated republish. LP fingerprint can mark unverified after the fact;
quiz cannot.

**ARCH-P1-006 — Funnel collections are not site-scoped on read.**
Cross-Brand builder is the reason. It also means the Deployments page and
every builder list are global. Combined with `isAuthenticated` writes
historically being open, the hook is the only remaining fence.

**ARCH-P1-007 — Seed writes live deployments without preflight.**
`funnel-samples.ts` `status: 'live'` with no user. New Brands inherit live
sample URLs.

**ARCH-P1-008 — Forbidden copy overrides remain in schema and UI.**
Column, admin description, page loader, `content-actions.ts` still structured
as a writer. Public render ignores the bag. Builder and live diverge if any
legacy row still has overrides (legacy data) or if an operator believes the
tab.

**ARCH-P1-009 — No version history anywhere operators can restore.**
Cannot answer "what was live yesterday".

**ARCH-P1-010 — Settings → Paths is not the path map.**
Only published Pages. Deployments, site-scoped LPs, shared legal, CMC are
invisible.

**ARCH-P1-011 — Deployments index is a report, not a workflow.**
No links into the owning builder. `hostOf` vs `previewOf` vs router disagree.
Bulk form sits above a list that cannot publish what bulk just created.

**ARCH-P1-012 — Draft Brand + preview host = anonymous 404.**
Correct given Site status, but the preview domain is issued as `active` and
handed back as `preview_host` from `createSite`. The object looks live.

### P2

**ARCH-P2-001 — CMC hardcoded public pages.** One tenant's content in source.
Wins when no Page exists. Skipped in admin preview, so builder/live diverge
for that Brand.

**ARCH-P2-002 — SharedLegalTemplates vs hosted Pages vs Brand legal URLs.**
Three privacy/terms implementations.

**ARCH-P2-003 — Publish and funnel actions are `@ts-nocheck`.**
`publish-actions.ts`, all three builder action files. The preflight that
guards money and consent is in an unchecked module.

**ARCH-P2-004 — Brand Identities is a hidden primary surface.**
Linked from General Settings and handbook, absent from `NAV`.

**ARCH-P2-005 — Site-scoped `quizzes` / `landing-pages` have no funnel UI
and still occupy the router.**

**ARCH-P2-006 — LP fingerprint omits master fields.**
Unverified-changes badge cannot see the failure in ARCH-P0-001.

**ARCH-P2-007 — `DEPLOYMENT_TRANSITIONS` allows `live → draft`.**
UI almost always uses `paused`. True unpublish exists in the schema and in
the status dropdown.

**ARCH-P2-008 — Advertorial delete copy lies.** Action refuses; dialog says
deployments are removed.

**ARCH-P2-009 — Bulk deploy hardcodes quiz skin and never updates in place.**

**ARCH-P2-010 — Host cache TTL 60s.** Domain promote/delete can serve the
wrong Brand for a minute if `invalidateHostCache` is missed on a new door.

### P3

**ARCH-P3-001 — Handbook still teaches `slug.preview.legenex.com` as the
preview host.**

**ARCH-P3-002 — Stale comments** (`savePageBodyBlocks` header vs
`published_blocks`; `FunnelLandingPages` still describing deployment
`content_overrides` as the layering model).

**ARCH-P3-003 — Collection labels "Landing Page Templates" vs nav "Landing
Pages" vs deployments "Landing Page".**

---

## 14. Root causes, ranked

1. **The V1 model was layered onto LegalOS instead of replacing its content
   types.** Funnel masters and deployments were added. Site-scoped quizzes,
   landing pages, Pages, SharedLegalTemplates, and CMC components were not
   retired from the public router or from Brand creation. Every path has more
   than one possible owner.

2. **Publish was defined as a status string, then partially replaced by a
   preflight verb, then not used everywhere.** LP is closest to the new verb.
   Quiz deployments use it on the way up. Quiz masters, advertorials, website
   pages, and seed paths do not. The operator-facing words Publish / Pause /
   Unpublish were never mapped onto one state machine.

3. **There is no published revision.** Without a master version id on the
   deployment, live is always HEAD. Fingerprints, drafts, and "republish"
   cannot do the job Decision 9 described. Website `published_blocks` is the
   only snapshot attempt, and autosave destroys it.

4. **Brand identity was allowed to accumulate stores.** Site columns, identity
   JSON, legal group, and the ported Brand Identities app all survived. The
   merge function is a symptom of not choosing.

5. **URL construction was fixed in a library and not adopted.**
   `effectiveDeploymentUrl` is the one correct answer. Quiz and advertorial
   lists still print artifact URLs. Preview domains have two suffixes. The
   Deployments page prints a third.

6. **Eligibility, tenancy, and path claims were centralized in libraries and
   then left optional at call sites.** `domainEligibility`,
   `checkPathAvailable`, `enforceDeploymentTenancy`, `master-safety` are the
   right seams. Advertorial publish, quiz/advertorial pickers, seed, and
   master save do not use them.

These six are why a W60 matrix of page-level PASS could still leave the
product unusable. Each surface can be made to "work" in isolation while the
operator journey crosses two models.

---

## 15. Conflicting sources of truth

| Question | Sources that disagree |
|---|---|
| What is a Brand? | `Sites` collection, nav "Brands", Brand Identities JSON, `siteToBrand` artifact |
| What colour is the Brand? | `Site.brand.*` vs `brand_identity.colors` (Site.brand wins at render) |
| What is the disclaimer? | `legal.default_disclaimer`, `default_disclaimer_md`, `brand_identity.legal.defaultDisclaimer` |
| What is a Landing Page? | `landing-pages` (site-scoped) vs `funnel-landing-pages` (master/template) vs a deployment of the latter |
| What is a Quiz? | `quizzes` vs `funnel-quizzes` vs a deployment vs an embedded flow on an LP |
| Who owns a URL? | Pages, site-scoped LP, SharedLegal, CMC, three deployment collections. `path-claims.ts` vs router vs Settings → Paths vs builder URL printer |
| What URL should we print? | `effectiveDeploymentUrl`, quiz `/q/{id}`, advertorial `/a/{id}`, Deployments `hostOf` / `previewOf`, bulk `previewHostForSlug` |
| Is this live? | `status`, parent `is_published`, Brand `status`, domain eligibility, path claim winner, template resolvability |
| Did publish succeed? | Dropdown value, optimistic pill, `PublishResult.status`, fingerprint `unverifiedChanges` (LP only) |
| Preview host | `PAGEFLO_PREVIEW_DOMAIN` (`preview.pageflo.io`), `LEGALOS_PREVIEW_DOMAIN` (`preview.legenex.com`), row `host`, alias resolver |
| May this domain serve? | `domainEligibility` vs quiz picker vs advertorial picker vs `brand-map` |
| Copy on an LP | master `slot_overrides` (live) vs deployment `content_overrides` (stored, ignored) vs template defaults |
| Quiz skin | deployment `template_id` vs record `renderer_key` vs code registry vs LP `embedded_quiz_template_id` vs recommended skin |
| Chrome | Brand `defaultHeader`/`defaultFooter` (live) vs leftover deployment `header_config` (stored, unread) |

---

## 16. Recommended architectural repairs (no code yet)

Order is dependency, not ticket size. Do not start by polishing builders.

### R1. One public content taxonomy

Pick funnel deployments + Brand website `Pages` as the only public authors.

- Stop seeding site-scoped `quizzes` and `landing-pages`.
- Stop routing them, or freeze them as a read-only legacy fallback behind a
  flag.
- Move CMC hardcoded pages into `Pages` or SharedLegalTemplates, then delete
  `CMC_PAGES`.
- Make Settings → Paths call `collectSiteClaims` so the screen is the same
  map as save and serve.

Until this lands, every other funnel fix can still 404 behind a seeded Page.

### R2. One publish verb per kind, used by every door

- Deployment: `draft | live | paused` only. Going live always
  `decideTransition` + preflight. Going down never gated.
- Master: `draft | published | archived` (quiz already has archive as a
  separate flag; advertorial should match quiz, not a third enum).
- Website page: working copy vs published snapshot. Autosave never writes
  the snapshot.
- Advertorial must gain `setAdvertorialDeploymentStatus` and
  `publishRequiresPreflight: true`.
- Quiz builder Publish must call `setQuizPublished`.
- Seed and bulk must create `draft` unless an explicit, logged publish runs.

UI labels must be a table, not synonyms. Proposed:

| Stored | Button to leave it | Button to enter it |
|---|---|---|
| draft | — | Publish |
| live | Unpublish (→ paused) | — |
| paused | Resume (preflight) or Revert to draft | — |
| published master | Unpublish master | Publish master |
| archived master | Restore (stays unpublished) | Archive |

Delete the word Pause from list aria-labels or use it only for Brand traffic.

### R3. Pin a published master revision on the deployment

Minimum viable:

- On master publish, snapshot the graph/slots/sections (or a content hash +
  row copy) and give it a `published_revision`.
- Deployment stores `master_revision` (the one live serves) and
  `draft_revision` (HEAD).
- Public resolvers load the pinned revision, not the master row.
- Republish is the act that advances `master_revision` after preflight.
- LP fingerprint must include that revision id.

Without this, "saved vs published" on the deployment row is theatre.

### R4. One Brand identity document

Keep `Sites` as tenant. Collapse authoring:

- One editor.
- One writable JSON or column group, with the other filled by a single
  sync in one direction.
- `resolveBrandLegal` / `resolveBrandTokens` remain the only readers.
- General Settings either becomes that editor or becomes non-visual
  fields (legal entity, vertical) only.

### R5. One URL function on every surface

`effectiveDeploymentUrl` (or a successor that also understands draft Brand
and ineligible preview) is mandatory in:

- quiz list and editor
- advertorial list and editor
- Deployments index
- bulk results (already close)
- preview buttons that claim to open the public page

Delete `/q/{id}`, `/a/{id}`, `/lp/{id}` from UI. They are not routes.

Preview: keep serving `preview.legenex.com` until DNS cutover. Do not tell
operators the canonical host is live if the row and the wildcard are still
the old suffix. Show the host that `resolveSiteByHost` would actually match.

### R6. Eligibility and claims on every picker and every save

Quiz and advertorial pickers must use `isDomainSelectable` / `domainOptionLabel`.
Advertorial save must run `domainAndPathChecks`. Bulk should still create
drafts, but the review screen should show eligibility, not a URL that 404s.

### R7. Website draft is a real buffer

- Autosave writes `body_blocks` only.
- Publish copies to `published_blocks` and sets `published_at`.
- Public always reads `published_blocks` when status is published; if the
  column is null (legacy), one backfill, then stop falling through to
  `body_blocks`.
- Opening the builder on a shared-template page must not flip
  `uses_shared_template` until the operator publishes that choice.

### R8. Do not build ClickFunnels

A coherent PageFlo funnel is:

- Brand (identity + website + domains)
- Masters (quiz logic, LP/advertorial copy, visual templates)
- Deployments (binding + tracking + destinations + pinned revision)
- Leads

It is not: per-deployment copy, per-deployment chrome, site-scoped duplicate
quizzes, a second landing-page collection, or a visual page builder for the
acquisition masters. Repair means deleting extra objects from the operator
journey, not adding a third "website vs funnel vs campaign" layer.

---

## 17. What is already in the right direction

Keep these; do not rewrite them while repairing:

- `Sites` as tenant + `cascadeDeleteSiteChildren`
- `classifyHost` before Domain lookup
- `domainEligibility` as the servability contract
- `checkPathAvailable` / `collectSiteClaims` as the one path map
- `decideTransition` + preflight grouping
- `enforceDeploymentTenancy` + `pagefloPreflighted`
- `effectiveDeploymentUrl`
- `master-safety` refusals (once every writer actually calls them)
- Public LP/quiz refusal on unknown templates instead of silent fallback
- Embedded quiz hydration through the same `hydrateQuizDeployment`
- Bulk planner isolation and draft-only creates
- Preview alias hosts so a suffix cutover does not require a data rewrite
- `resolveDomainForProvisioning` split from public resolve

The platform does not need a new architecture story. It needs the story it
already wrote in libraries to be the only story the collections, seeds, and
three builders tell.
