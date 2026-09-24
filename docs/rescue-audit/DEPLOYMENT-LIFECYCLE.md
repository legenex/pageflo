# Deployment lifecycle, as the code actually is

Rescue audit. Archie. 2026-09-24.

Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md). That document is the
running architecture. This one is the **state machine**: stored states, UI
verbs, allowed transitions, preflight, fingerprint, what live and preview
actually serve, and what happens when path / domain / Brand / template change.

Runtime and collection code win over handbook copy, W60 PASS markers, and
the V1-complete claim. Product intent is cited only to name the gap.

Nothing here is a patch.

---

## 1. How to read this

There is no single publish verb. There are five objects, each with its own
enum, its own writers, and its own public gate:

| Object | Collection | Stored serving axis | Gated go-live? |
|---|---|---|---|
| Quiz deployment | `funnel-quiz-deployments` | `status: draft \| live \| paused` | yes (`setQuizDeploymentStatus`) |
| LP deployment | `funnel-lp-deployments` | `status: draft \| live \| paused` | yes (`setLpDeploymentStatus`) |
| Advertorial deployment | `funnel-advertorial-deployments` | `status: draft \| live \| paused` | **no** |
| Quiz master | `funnel-quizzes` | `is_published` + `is_archived` | dead door (`setQuizPublished` unused) |
| LP master ("template") | `funnel-landing-pages` | `is_published` + `is_enabled` | unused (`setLandingPagePublished` unused) |
| Advertorial master | `funnel-advertorials` | `status: draft \| published \| archived` | **no** |
| Brand website page | `pages` | `status: draft \| scheduled \| published \| archived` + `published_blocks` | **no** (autosave writes the snapshot) |
| Brand itself | `sites` | `status: draft \| active \| paused \| archived` | explicit `setSiteStatus`, not a content preflight |

A visitor is served only if **all** of these are true at once:

1. Host resolves to a Brand (`resolveSiteByHost`).
2. Brand `status` is `active` (or the caller is bound and may see unpublished).
3. The path winner in the public router is this object.
4. The object's own serving flag is on (`live` / `published` / `is_published`).
5. The parent master is published (funnel deployments).
6. The template resolves (quiz/LP).
7. Domain eligibility, when a domain is bound, is true at **resolve** time for
   the host — but a bound-null deployment is reachable on every host the Brand
   owns.

"Is this live?" is therefore not a column. It is a conjunction. Operators
learn one of the five machines and assume the others.

---

## 2. Shared deployment machine (the intended one)

Stated once in `src/lib/publish-lifecycle.ts` and only **partially** used.

### Stored states

```ts
export type DeploymentStatus = 'draft' | 'live' | 'paused'
```

Collection labels (`FunnelQuizDeployments`, `FunnelLpDeployments`,
`FunnelAdvertorialDeployments`):

| Value | Collection label |
|---|---|
| `draft` | Draft |
| `live` | Live |
| `paused` | Paused |

`archived` is deliberately absent on deployments. Retiring is a different
decision (`setQuizArchived`, Brand archive, master delete).

### Documented transitions

```ts
DEPLOYMENT_TRANSITIONS = {
  draft:  ['live'],
  live:   ['paused', 'draft'],
  paused: ['live', 'draft'],
}
```

`GOES_LIVE = { live }`. `decideTransition` rules:

- Same-state is refused (`already live`).
- Illegal pair is refused (`cannot go from draft to paused`).
- Going **down** never requires a passing preflight.
- Going **up** requires a preflight object, and refuses if `preflight.ok`
  is false.

These rules are enforced **only** by `setQuizDeploymentStatus` and
`setLpDeploymentStatus` (`src/app/(app)/admin/(top)/publish-actions.ts`).
Generic saves, advertorials, seed, bulk, and super-admin `/cms` writes do
not call `decideTransition`.

### Actual transitions, all doors

| From | To | Quiz | LP | Advertorial |
|---|---|---|---|---|
| draft → live | gated preflight | gated preflight | raw status write |
| live → paused | ungated save or gated action | `setLpDeploymentStatus` | raw status write |
| live → draft | editor dropdown via save (ungated) | editor dropdown via save (ungated) | editor dropdown |
| paused → live | gated preflight | gated preflight | raw status write |
| paused → draft | editor dropdown via save | editor dropdown via save | editor dropdown |
| draft → paused | **allowed by save**, refused by `decideTransition` | same | allowed |

`enforceDeploymentTenancy` (`src/hooks/deployment-tenancy.ts`) additionally
refuses a **userful** write that flips non-live → live unless
`context.pagefloPreflighted === true`, on quiz and LP only
(`publishRequiresPreflight: true`). Super-admin and no-user (seed) skip the
hook entirely. Advertorials set `publishRequiresPreflight: false`.

### Going live is diverted on quiz/LP save

`saveQuizDeployment` and `saveDeployment` (LP) do this:

1. If the operator asked for `live` and the row is not already live, write
   the row at its **current** status.
2. Then call `setQuizDeploymentStatus` / `setLpDeploymentStatus` `{ to: 'live' }`.
3. If that refuses: the edits are kept, the status is not live, the result
   is `{ ok: false, saved: true, … }` (LP) or
   `{ ok: false, error: 'Saved, but not published: …' }` (quiz).

A row that is **already live** stays live through binding edits. That is
intentional in the comments ("editing is not publishing") and is the reason
live pages serve unchecked path / template / Brand changes. See DEP-P1-004.

### UI verbs vs stored states

The product does not have one word for one state.

| Stored | List toggle (live row) | List toggle (not live) | Editor dropdown | Header / master button |
|---|---|---|---|---|
| `draft` | — | **Publish** → `live` | Draft | — |
| `live` | Quiz/Adv: aria **Unpublish** → `paused`. LP: aria **Pause** → `paused` | — | Live | — |
| `paused` | — | **Publish** → `live` | Paused | — |
| master `is_published=true` | — | — | — | **Unpublish** |
| master `is_published=false` | — | — | — | **Publish** |
| Brand `draft` | — | — | — | **Publish brand** → `active` |
| Brand `active` | — | — | — | **Pause brand** → `paused` |
| Brand `paused` | — | — | — | **Resume brand** → `active` |

Pills: quiz master list shows `LIVE` / `DRAFT` for `is_published`.
Deployment lists show the raw `status` uppercased (`LIVE` / `DRAFT` /
`PAUSED`). Deployments index maps `live|published|active` → "Live".
Website builder TopBar: `LIVE` / `DRAFT` for page `published` / not.

The list toggle **never** writes `draft`. True unpublish (`live → draft`)
exists only in the editor Status `<select>`. See DEP-P1-002, DEP-P1-005.

---

## 3. Quiz

### 3.1 Master (`funnel-quizzes`)

**Stored**

- `is_published: boolean` (default false)
- `is_archived: boolean` (default false)
- `archived_at: date | null`
- Graph: `tiers`, `steps`, `nodes`, `custom_fields`

**UI labels** (`QuizBuilderApp`)

- Pill: `LIVE` if `isPublished`, else `DRAFT`. Archived has its own scope.
- Button: Publish / Unpublish.
- Archive confirm: "Quiz archived and unpublished." Restore: "It returns to
  the Active tab as a draft."

**Allowed transitions (actual)**

| Act | Writer | Effect |
|---|---|---|
| Create | `createQuiz` | `is_published` from client (`Boolean(q.isPublished)`), `is_archived: false` |
| Save graph | `saveQuiz({ patch })` | writes whatever is in the patch, including `is_published` |
| Publish / Unpublish | **builder calls `saveQuiz({ is_published })`** | no preflight |
| Gated publish | `setQuizPublished` | preflights every **live** deployment of this quiz; unused by any UI |
| Archive | `setQuizArchived({ archived: true })` | `is_archived: true`, `archived_at: now`, `is_published: false` |
| Restore | `setQuizArchived({ archived: false })` | `is_archived: false`, `archived_at: null`, **does not re-publish** |
| Clone | `cloneQuiz` | `is_published: false`, `is_archived: false` |
| Delete | `deleteQuiz` | refused while deployments exist (`masterHasDeploymentsMessage`) |

`setQuizPublished` is the only function that preflights live deployments
before flipping `is_published`. Zero UI callers. DEP-P0-004.

**Preflight (gated door only)**

`setQuizPublished` loads every deployment of the quiz, skips non-live ones,
runs `quizDeploymentPreflight` against `{ ...quiz, is_published: true }`.
If any live deployment would fail, the master is not published.

**Fingerprint:** none.

**What live serves:** `hydrateQuizDeployment` loads the current master by
id. Editing a published master changes every live URL immediately.
`includeUnpublished` is required to serve an unpublished or archived master.
DEP-P0-001.

**What preview serves:** builder Preview opens in-app `QuizPreviewView` /
`QuizStill`, not the public URL. Admin public preview
(`?preview=1` / `?site=`) with Brand binding sets `includeUnpublished` on
`resolveQuizDeployment`.

### 3.2 Deployment (`funnel-quiz-deployments`)

**Stored:** `status`, `quiz`, `site`, `domain` (optional), `path`,
`template_id`, `render_mode`, `progress_form`, `destination_overrides`,
`utm`, `pixels`. Deprecated unread: `header_config`, `footer_config`,
`body_section_overrides`.

**No** `last_published_at` / `published_fingerprint`.

**UI**

- List pill: raw status.
- Toggle aria: `Unpublish deployment` / `Publish deployment`.
- Toggle writes `paused` ↔ `live` via `saveQuizDeployment` (which diverts
  go-live).
- Editor Status: Draft / Live / Paused.
- Printed URL if no domain: `https://preview.legenex.com/q/${id}` —
  **not a route**. DEP-P0-005.

**Preflight (`quizDeploymentPreflight`)**

Always **run** on `setQuizDeploymentStatus` (including pause). Only
**required** when going live.

Checks: authz (`requireSiteAdmin`); parent published and not archived;
Brand complete (display name, phone, disclaimer via `resolveBrandLegal`);
quiz template record exists, not archived, **enabled**; graph via
`validateQuizFlow` (`path_table` is warn-only); consent (node text or
Brand TCPA); destinations/utm/pixels well-formed; domain ownership +
`domainEligibility`; path free with `checkPathAvailable({ live: true })`.

Template lookup: raw record id first, then `canonicalTemplateId` alias
(`default` → `sq_quiz_first`). Matches render. Enabled is required **here
only**; live pages keep serving a disabled template.

**Fingerprint:** none. Unchecked live edits are invisible in the admin.

**What live serves** (`resolveQuizDeployment` → `hydrateQuizDeployment`)

- Query: this Brand + path variants + `status = live` (unless
  `includeUnpublished`).
- Refuses if a Page / site-scoped LP / shared-legal already claimed the
  path (`isClaimedByAuthoredContent`).
- Domain-bound row matching the request host wins; else `docs[0]`.
- Parent must be `is_published && !is_archived`.
- Template must resolve as a record (or code-registry fallback during
  pre-reconcile). Unknown id → 404, no stand-in.
- Graph is **HEAD of the master**. Chrome is Brand
  (`resolveDefaultChrome` / `siteToBrand`), not deployment columns.
- Destinations: deployment overrides → Brand → site pages.

**What preview serves**

- Bound admin + (`?preview=1` or `?site=<slug>`): draft/paused deployments
  and unpublished parent.
- Bound admin on a **draft Brand**, even without a query string: Brand
  itself is visible (`maySeeUnpublished`). Funnel content still needs
  `isAdminPreview` for `includeUnpublished`.
- List Preview: in-app, not the public host.

**Path / domain / Brand / template change**

| Change on a **live** row | Behaviour |
|---|---|
| path | written immediately; public path moves; path check only if this save is also going live |
| domain | written if it belongs to the Brand; `null` = every Brand host; eligibility **not** re-checked until next go-live |
| Brand (`site`) | tenancy requires caller bound to both ends; domain must belong to the new Brand. **Editor does not clear domain** when Brand changes (unlike LP). |
| `template_id` | immediate public skin change. Save validates selectability only when the id **changes**; keeping a now-disabled template is allowed. |
| quiz (master) | immediate; live serves the new graph HEAD |
| destinations / utm / pixels | immediate |

Quiz domain picker eligibility is **not** `domainEligibility`. It requires
`status === 'active' && sslStatus === 'active'`, which **rejects preview
hosts** (`ssl_status: unknown`). LP picker uses `isDomainSelectable`.
Advertorial picker is unfiltered. DEP-P1-003.

Save does **not** call `checkPathAvailable`. Only preflight (go-live) and
advertorial save do.

---

## 4. Landing page

### 4.1 Master (`funnel-landing-pages`) — labelled "Landing Page Template"

**Stored**

- `is_published` — render gate. Unpublished master → every deployment 404s
  at read time (`resolveLpDeployment` checks `lpDoc.is_published`).
- `is_enabled` — selectability for **new** deployments. Disable does not
  unpublish.
- `archived_at` — stock delete is archive, not drop.
- `template_id` — code renderer.
- `sections` (identity templates) / `slot_overrides` (ported).

**UI**

- List: `NOT PUBLISHED` pill when `!isPublished`. Enable/Disable icon.
- Enable writes **both** `is_enabled` and `is_published`. Disable writes
  only `is_enabled` (`setLpTemplateEnabled`).
- Create/clone seed `is_published: true`, `is_enabled: true`
  (`createLpTemplate`, `cloneLpTemplate`). A blank template is born live
  as a parent even with no deployments.

**Allowed transitions**

| Act | Writer | Effect |
|---|---|---|
| Save copy / renderer | `saveLpTemplate` | writes HEAD; live deployments pick it up immediately |
| Enable | `setLpTemplateEnabled({ enabled: true })` | `is_enabled` + `is_published` |
| Disable | `setLpTemplateEnabled({ enabled: false })` | `is_enabled` only; live pages keep serving |
| Gated master publish | `setLandingPagePublished` | flips `is_published` with **empty** preflight; **no UI caller** |
| Delete | `deleteLpTemplate` | refused if deployments exist; stock rows archive (`archived_at`, `is_enabled: false`) |

**Fingerprint:** none on the master. LP deployment fingerprint does not
include master copy (DEP-P1-006), so a slot edit never shows
"unverified changes".

**What live serves:** current `slot_overrides` / `sections` and current
`template_id`. `composedOverrides` is master slots only.
`content_overrides` on the deployment is loaded into the public DTO and
**not applied**.

### 4.2 Deployment (`funnel-lp-deployments`)

**Stored:** `status`, `landing_page`, `site`, `domain`, `path`, `quiz`
(preferred flow), `embedded_quiz_template_id`, `embedded_progress_form`,
legacy `quiz_deployment_id`, unread `content_overrides`,
`destination_overrides`, `utm`, `pixels`, plus:

- `last_published_at`
- `published_fingerprint` — SHA-256 of **binding** fields only
  (`src/lib/publish-state.ts`): `landing_page`, `site`, `domain`, `path`,
  `quiz`, `quiz_deployment_id`, `embedded_quiz_template_id`,
  `embedded_progress_form`, `destination_overrides`, `utm`, `pixels`.
  Not master copy, not `status`, not `name`.

**UI**

- List pill: status + optional `UNCHECKED EDITS ARE LIVE` /
  `CHANGES NOT PUBLISHED` / `PUBLISH REFUSED`.
- Toggle aria: **Pause deployment** / **Publish deployment**.
- Toggle calls `setLpDeploymentStatus` directly (does not rewrite content).
- Editor: Status Draft / Live / Paused; "Publish checks" dry-run
  (`previewLpDeploymentPublish`); Brand change **clears domain**.
- URLs: `effectiveDeploymentUrl` on list and editor. This is the one
  builder that prints a real route.

**Preflight (`lpDeploymentPreflight`)**

Authz; parent `is_published`; Brand complete; code-registry template
resolves **and** LP template record exists/enabled/not archived; merged
master slot overrides fit the template; supply-group emptiness is **warn**;
if the ported template has `quizMount`, a quiz must be bound; own flow
exists + published + not archived + skin + graph + consent; **or** legacy
`quiz_deployment_id` exists, same Brand, **status live**, skin/graph/consent;
domain ownership + eligibility; path free (`live: true`).

**Fingerprint write:** only when `setLpDeploymentStatus` succeeds to
`live`. Pause / unpublish leave both columns alone so a paused row still
says "last published Tuesday". `lpPublishState.unverifiedChanges` is true
when the saved binding digest ≠ stored digest. Master edits never flip it.

**What live serves** (`resolveLpDeployment`)

- `status = live` (unless includeUnpublished).
- Authored content wins the path.
- Parent `is_published`.
- Unknown LP template → 404 (`LP_TEMPLATE_REFUSED`).
- Identity template with empty `sections` → 404.
- Ported template: slots from master only.
- Quiz: own `quiz` + `embedded_quiz_template_id` (fallback recommended
  skin) via `resolveEmbeddedQuiz` → same `hydrateQuizDeployment`. Else
  legacy `resolveQuizDeploymentById` (must be live, same Brand).
- If a quiz was bound and does not resolve → 404, not an empty card.
- If the template has `quizMount` and no quiz at all → 404 (admin preview
  exempt).

**What preview serves**

- In-app `LPPreviewModal` with master slots and optional Brand override.
- Public `includeUnpublished` same as quiz.
- Printed URL uses `effectiveDeploymentUrl` (bound host if eligible, else
  Brand primary, else preview host). Empty bound domain is **not**
  `preview.legenex.com/lp/{id}`.

**Path / domain / Brand / template change**

| Change on a **live** row | Behaviour |
|---|---|
| path | immediate; fingerprint becomes unverified; path check only on go-live |
| domain | immediate if owned by Brand; eligibility on next go-live |
| Brand | editor clears `domain`; tenancy both ends |
| landing_page (master) | immediate parent swap; live 404s if new parent unpublished |
| embedded quiz / skin | immediate; 404 if bound quiz will not hydrate |
| `content_overrides` | **refused** on save (`refuseDeploymentCopyOverride`). `writeOverrides` in `content-actions.ts` also refuses non-empty maps, then still has a write of `content_overrides` if the guard were removed. |
| template on the **master** | not a deployment field; changing it on the template row reskins every live URL now |

Going live stamps fingerprint of the row **as loaded before the status
write**, not after other fields in the same save. The save path writes
content first at current status, then flips. A go-live after a diverted
save fingerprints the just-written bindings. An already-live save does
**not** restamp, so unverifiedChanges becomes true. That is the honest
case the fingerprint exists for — and it cannot see master copy.

---

## 5. Advertorial

### 5.1 Master (`funnel-advertorials`)

**Stored:** `status: draft | published | archived` (collection labels
Draft / Published / Archived). `template_id`, `sections`,
`default_brand_id` (preview-only).

**UI**

- Pill: `PUBLISHED` / `DRAFT` / `ARCHIVED`.
- Header button: Publish / Unpublish. Unpublish writes **`draft`**, not
  `archived`.
- Archive icon on the list is **delete** (`deleteAdvertorial`). Confirm
  copy: "Any deployments using it are removed too." The action **refuses**
  while deployments exist. DEP-P1-009.
- Save is `saveAdvertorial` → `advData`, which writes `status` as a field.
  No preflight, no fingerprint.

**Allowed transitions (actual):** any status string the editor posts.
There is no `decideTransition`. Archive is a third value on the master
and is not wired to a dedicated action.

**What live serves:** current `sections` and `template_id` whenever
`status === 'published'` and a live deployment exists. Save of a published
master is live immediately. DEP-P0-001.

Public resolver: `if (!includeUnpublished && advDoc.status !== 'published')
return null`.

### 5.2 Deployment (`funnel-advertorial-deployments`)

**Stored:** `status`, `advertorial`, `site`, `domain`, `path`,
`quiz_deployment_id` (text, no FK), `cta_mode` (`button` | `embed`),
`utm`, `pixels`.

**No** preflight hook (`publishRequiresPreflight: false`). **No**
`setAdvertorialDeploymentStatus`. **No** fingerprint.

**UI**

- Toggle aria: Unpublish / Publish. Writes `paused` ↔ `live` through
  `saveAdvertorialDeployment`.
- Editor Status: "Draft (not live)" / "Live (publicly accessible)" /
  "Paused (off but preserved)".
- Printed URL if no domain: `https://preview.legenex.com/a/${id}` — not a
  route. DEP-P0-005.
- Preview: in-app advertorial preview, not the public URL.
- Brand change **clears `quizDeploymentId`**, not domain.
- Domain picker: Brand's domains **plus every other Brand's domains**.
  Save then refuses a domain that belongs to another Brand. DEP-P1-003.

**Preflight:** none. Save runs `checkPathAvailable` with
`live: status === 'live'` (so two live rows cannot share a path; two
drafts can). Domain ownership is checked. No Brand completeness, no
master-published check, no quiz-live check, no eligibility.

**What live serves** (`resolveAdvertorialDeployment`)

- `status = live`, parent `status === 'published'`, authored content does
  not claim the path.
- Quiz is optional. Linked quiz is `resolveQuizDeploymentById` (must be
  live, same Brand). If it fails, the advertorial **still serves**; CTAs
  fall back toward phone. Unpublishing the quiz deployment does not 404
  the advertorial.
- Brand chrome via `siteToBrand`. Template chrome via
  `advertorialChrome(template_id)`.

**Path / domain / Brand / template change**

All are immediate if the row is already `live`. Template lives on the
master, so a master `template_id` change reskins every live URL.
`cta_mode` and `quiz_deployment_id` changes are live on the next request.

There is no "saved, not published" structure. A refused path check
prevents the whole save (edits can be lost). A successful save of
`status: 'live'` is publish.

---

## 6. Brand website pages (`pages`)

Not a funnel deployment. Operators treat Publish the same way, so the
machine belongs here.

**Stored**

- `status: draft | scheduled | published | archived`
- `body_blocks` — builder working copy
- `published_blocks` — claimed snapshot of last publish
- `publish_at` — used when `status === 'scheduled'`
- `uses_shared_template` + `template_key`
- `hidden_blocks`, `block_meta`, `slug_redirects`

**UI** (`PageBlocksBuilderApp` + Websites index)

- TopBar: `LIVE` / `DRAFT`; button Publish / Unpublish.
- Unpublish writes `status: 'draft'` (not archived).
- Status `<select>` also offers Published / Scheduled / Archived.
- Websites subtitle: "Section edits autosave as draft. Publish is the
  only way a live page changes." That sentence is **false** for any page
  already `published`. DEP-P0-002.

**Autosave (`savePageBodyBlocks`)**

Debounced ~600ms. Writes `body_blocks` always. **If `status ===
'published'` it also writes `published_blocks` and `published_at`.**
Every builder keystroke on a live page is a live mutation.

Also forces `uses_shared_template: false` on first builder save, so a
page that was rendering SharedLegalTemplate starts rendering blocks
without an explicit publish of that choice.

Header comment in `blocks-actions.ts` still says `body_blocks` is what
the public renderer reads. `resolvePublicBlocks` does not.

**What live serves** (`RenderPage` in `src/app/(public)/[[...slug]]/page.tsx`)

```ts
resolvePublicBlocks(page) =
  Array.isArray(published_blocks) ? published_blocks : body_blocks
```

Then: if `uses_shared_template` and a matching SharedLegalTemplate exists,
that markdown wins over blocks.

Router visibility:

- Public: `status === 'published'` **or** (`scheduled` and
  `publish_at <= now`). That is **read-time promotion**. There is no
  worker that flips scheduled → published. DEP-P1-016.
- Admin preview (`isAdminPreview`): any non-archived status.

**What preview serves**

Builder canvas is the working `body_blocks` (and may disagree with live
when `uses_shared_template` is still true). Preview button opens:

```
{origin}{path}?site={slug}&preview=1&ts={now}
```

on the **admin origin**, not the Brand preview host. Public route then
resolves the Brand by slug for a bound user.

**Create / seed / duplicate**

- `createPage`: status from the form, default `draft`. No
  `published_blocks`.
- `duplicatePage`: always `draft`, copies `body_blocks` only.
- `createSite`: every default page is `status: 'published'` with
  `published_at` set and **no** `published_blocks`. Live therefore falls
  through to `body_blocks` until the first builder save, which then
  copies the working copy into the snapshot. The first open of a new
  Brand website is already a live edit surface.

**Path / slug change**

`savePageBodyBlocks` / `updatePage` write `slug` immediately. If the page
is published, the public path moves on the next request. `Pages` has
`captureSlugRedirect`; Brand slug changes also append `slug_redirects` on
the Site. Funnel deployments are not in Settings → Paths.

**Fingerprint:** none. `published_blocks` is the only snapshot, and
autosave destroys it.

---

## 7. Brand itself (`sites`)

Traffic valve, not a content version.

**Stored:** `status: draft | active | paused | archived` (required,
default `draft`).

Collection admin copy: "Paused = public router returns 404." The router
does **not** 404 a paused Brand. It renders `<PausedSite />`.
DEP-P1-011.

**Allowed transitions (`setSiteStatus`)**

```ts
draft:    ['active', 'archived']
active:   ['paused', 'archived']
paused:   ['active', 'archived']
archived: []   // terminal from this door
```

Stale `from` is refused (`site is now X, not Y — reload`). Host cache is
invalidated on success.

**UI**

- Dashboard `SitePublishControl`: Publish brand / Pause brand / Resume
  brand. Archived returns null (no button).
- Danger zone: Pause/Resume, Archive (terminal here), Delete (super-admin,
  type-to-confirm slug). Restore is "raw admin", not this screen.

**What live serves**

| Brand status | Anonymous | Bound operator |
|---|---|---|
| `draft` | 404 | Brand is visible (`maySeeUnpublished`). Funnel `includeUnpublished` still needs `?preview=1` or `?site=` |
| `active` | public content | public content |
| `paused` | `PausedSite` page (not 404) | full content |
| `archived` | 404 | 404 (`if (site.status === 'archived') notFound()`) |

`createSite` always writes `status: 'draft'`, issues preview domains as
`status: 'active'`, seeds published website pages, seeds site-scoped
`/quiz` + `/lp`, seeds **live** funnel deployments. The Brand is
content-full and traffic-closed. The preview URL is handed back as
`preview_host` and still 404s for anonymous visitors. DEP-P1-010.

**Brand identity change** is not a deployment transition. `siteToBrand`
reads the current Site row. Colours, legal, phone reskin **every live
URL immediately** (Decision 8). There is no staged preview of a reskin.

**Changing a deployment's Brand** is a tenancy move, not a reskin. See
sections 3–5.

---

## 8. What "live" and "preview" actually serve

### Public request (anonymous, Brand `active`)

Order in `src/app/(public)/[[...slug]]/page.tsx`:

1. `Pages` published, or scheduled whose time has come.
2. Hardcoded CMC components for `check-my-claim` (skipped in admin preview).
3. Page slug redirects.
4. SharedLegalTemplates for a fixed path set.
5. Site-scoped `landing-pages` with `status: published`.
6. Funnel quiz deployment (`status: live` + published master).
7. Funnel LP deployment (`status: live` + published master).
8. Funnel advertorial deployment (`status: live` + published master).
9. Blog `/blog/:slug`.
10. 404.

`CLAIM_PRECEDENCE` in `path-claims.ts` matches that order. Funnel
resolvers also call `isClaimedByAuthoredContent`, so a seeded Page or
site-scoped LP at `/lp` or `/quiz` **silently wins**. The funnel row can
read LIVE in the builder and 404 in production. DEP-P0-007.

Live funnel bodies are always **master HEAD** plus current Brand identity.
There is no pinned revision.

### Admin preview of unpublished funnel content

`includeUnpublished = isAdminPreview = bound to this Brand AND
(?preview=1 OR ?site=<slug>)`.

Middleware only forwards intent. The route re-checks auth.

That flag relaxes: deployment `status`, parent `is_published` /
advertorial master `status`, LP empty-quiz-mount 404, and quiz
`resolveQuizDeploymentById` live requirement.

It does **not** relax Brand `archived`. It does not make an ineligible
domain serve. It does not beat a Page that already claimed the path
(authored content still wins; CMC is skipped in preview, so CMC vs Page
can diverge).

### In-app builder Preview vs public URL

| Surface | Preview button |
|---|---|
| Quiz list / editor | in-app `QuizPreviewView` |
| Quiz deployment list | in-app, opens the quiz with that deployment's id in local state |
| LP template / deployment | in-app `LPPreviewModal` (master slots, Brand override) |
| Advertorial list / deployment | in-app advertorial preview |
| Website page | public route on **admin origin** with `?site=&preview=1` |
| Deployments index | prints `previewUrlForBrandPath` (canonical preview root) **and** `hostOf` ("no domain bound") — third answer |

`effectiveDeploymentUrl` is the one function that matches the resolver.
Only the LP builder uses it. Quiz and advertorial lists still invent
`/q/{id}` and `/a/{id}` under `preview.legenex.com`. DEP-P0-005.

### Optional domain

A deployment with `domain: null` matches on (Brand, path) and is
reachable on **every host the Brand owns**. `effectiveDeploymentUrl`
prints primary eligible, else preview. Deployments index `hostOf` prints
`"no domain bound"`. Three answers to one URL.

---

## 9. Path, domain, Brand, template — change behaviour

This is the same table for every funnel type because the code does the
same thing once a row is already `live`: **it is an edit, not a
republish.** `enforceDeploymentTenancy` only blocks non-live → live
without the preflight marker.

| Field | Quiz | LP | Advertorial |
|---|---|---|---|
| path | live immediately; check on next go-live (quiz/LP) or this save if status is live (adv) | same | `checkPathAvailable` on this save if `status==='live'` |
| domain | live immediately; quiz picker rejects preview SSL; not re-preflighted | live immediately; picker uses `isDomainSelectable` | live immediately; picker lists other Brands; save refuses cross-tenant |
| Brand | tenancy both ends; domain **not** cleared in UI | tenancy both ends; domain **cleared** in UI | tenancy both ends; quizDeploymentId cleared, domain kept |
| visual template | on the **deployment**; live immediately | on the **master**; live immediately for all deployments of it | on the **master**; live immediately |
| master copy / graph | live immediately | live immediately | live immediately if master `published` |
| Brand identity | live immediately (all types) | same | same |

Root `/` is never a funnel deployment. Resolvers bail. Bulk planner
refuses `/`. Website home Page owns it.

Two **live** rows on one (Brand, path, overlapping domain scope) are
refused by `checkPathAvailable({ live: true })`. Two **drafts** are
allowed. Bulk always plans with `live: false`, so it cannot collide;
publish later can still fail the path.

---

## 10. Bulk deploy

`planBulkDeploy` / `bulkDeployMaster`
(`src/lib/bulk-deploy.ts`, `src/app/(app)/admin/(top)/deployments/actions.ts`).

- One master, many Brands, one path.
- Creates **drafts only**. UI copy is honest.
- Isolates failures per Brand (`isPartialBulkSuccess`).
- Preview URL: `previewHostForSlug` (canonical preview root) — better than
  `/q/{id}`.
- Does not bind a domain (`domain: null` → every Brand host once live).
- Quiz always `template_id = sq_quiz_first` unless that record is missing
  (`resolveQuizTemplateSelection`). Hardcoded skin. DEP-P2-009 analogue:
  DEP-P1-008.
- LP: `landing_page` only. No quiz binding. A later publish of a ported
  template with `quizMount` will fail preflight / 404 live.
- Advertorial: `cta_mode: 'button'`, no quiz.
- Path check: `live: false`. Cannot collide with other drafts? It **can**
  collide with an existing draft on the same path — `checkPathAvailable`
  with `live: false` still sees live claims, but two drafts on one path
  are allowed. A second bulk to the same Brand+path creates **another
  draft**. It never updates in place.
- No preflight (drafts). Does not publish, resume, or stamp fingerprints.
- Bound-to-Brand + `requireDeploymentSiteAdmin` per item.
- Partial success is a first-class result. The form must show per-Brand
  errors.

The Deployments index above this form cannot publish what bulk just
created. DEP-P1-017.

---

## 11. Seed

Three writers, all `overrideAccess: true`, **no user**, so
`enforceDeploymentTenancy` is a no-op and `publishRequiresPreflight` never
fires.

### `createSite` (`src/app/(app)/admin/(top)/sites/actions.ts`)

1. Brand `status: 'draft'`.
2. Preview domain(s) `kind: preview`, `status: active`, SSL left unknown.
3. Website pages `status: 'published'` (no `published_blocks`).
4. Hosted Privacy / Terms pages published, `uses_shared_template: true`.
5. Site-scoped `quizzes` at `/quiz` **published**.
6. Site-scoped `landing-pages` at `/lp` **published**.
7. `seedStarterFunnelsForBrand`.

### `seedStarterFunnelsForBrand` (`src/lib/funnel-samples.ts`)

- Ensures MVA quiz master (`is_published: true` from `buildSeedQuiz`).
- Quiz deployment at `/s/{brandSlug}`, `status: 'live'`,
  `template_id: 'sq_quiz_first'`, bound to primary domain.
- LP deployment at `/c/{brandSlug}`, `status: 'live'`, stock
  `human_recovery_story`, **legacy** `quiz_deployment_id` (not `quiz`
  flow). A ported template with a quiz mount 404s until that legacy
  pointer hydrates.
- Idempotent on (site, path). Never throws.

`ensureStarterFunnelsForAllBrands` backfills every Site on builder load,
adding `/s/{slug}` + `/c/{slug}` **alongside** old shared paths like
`/s/mva`.

### `ensureFunnelSamples` / `pnpm seed` (`src/seed/index.ts`)

- Sample LP deployments: `/c/pain` **live**, `/truck` **draft**.
- Quiz deployment `/s/mva` **live**.
- Advertorials seeded `status: 'published'`; deployment `/a/{slug}`
  **live**.

New Brands therefore inherit live funnel URLs that never passed the
publish gate the UI now requires. DEP-P0-006.

Site-scoped `/quiz` and `/lp` occupy CLAIM_PRECEDENCE above those funnel
URLs. A Brand that also deploys a funnel onto `/lp` loses silently.

---

## 12. Failure states (what the operator actually sees)

### Publish refused (quiz/LP go-live)

- Row **saved** at previous status.
- LP returns structured `{ ok: false, saved: true, id, status, groups,
  summary, preflight }`. Editor snaps Status back and draws
  `PublishFailurePanel` by tab.
- Quiz save returns a single string `Saved, but not published: …`.
- List LP remembers `PUBLISH REFUSED` for the session; quiz list toasts
  and rolls the optimistic `LIVE` pill back.
- Going down is never this failure. A pause that fails is a write error;
  the optimistic `PAUSED` is rolled back (compliance-critical).

### Already live / illegal transition

`decideTransition`: `already live`, `cannot go from X to Y`. Only the
gated status actions. Editor dropdown draft→paused via generic save
bypasses this.

### Live row, public 404

Any of:

- Brand `draft` (anonymous) or `archived`.
- Brand `paused` → not 404, `PausedSite`.
- Parent master unpublished / archived / advertorial not `published`.
- Path claimed by Page, site-scoped LP, shared legal, or CMC.
- Unknown / unresolvable template.
- LP quiz bound but unhydratable, or quizMount with no quiz.
- Domain bound and ineligible **and** the request host is that domain.
  (A site-wide deployment still serves on other eligible hosts.)
- Host cache stale (60s) after domain/Brand moves.

The admin pill can still say LIVE. "Is this live?" has no single field.

### Unchecked live edits (LP only)

`publishState.unverifiedChanges` after a live binding save. Pill:
`UNCHECKED EDITS ARE LIVE`. Master copy edits do not set this.
Quiz/advertorial have no equivalent. Seeded live rows have
`everPublished: false` even while serving ("no publish check has ever
been recorded").

### Master unpublished while deployments stay `live`

Resolvers 404. Republishing the master brings every still-`live`
deployment back without touching their status. That is the intended
unpublish-preserves-record rule — and it is why `setQuizPublished` wanted
to preflight those live children, and why the builder bypass is
dangerous.

### Template disabled

New selection refused. Existing live pages keep serving. Resume / publish
onto it is blocked (quiz/LP preflight). Advertorial has no such check.

### Delete blocked

Masters with deployments: `masterHasDeploymentsMessage`. Stock LP
templates archive instead of drop. Website home page cannot be deleted.
Preview domains cannot be deleted from the UI (invariant 9, not this
file's machine).

### Advertorial path collision

The whole save is refused (unlike quiz/LP, which can save content and
fail only the flip).

### Optimistic UI

Quiz and advertorial builders copy props into state. Advertorial
explicitly has **no** `router.refresh` reconcile on publish. A failed
unpublish that somehow skipped rollback would show DRAFT over a live
article. Quiz/LP pause paths document this as the compliance risk they
fixed with rollback.

---

## 13. Verb cheat-sheet (stored → button)

What the UI should have been, versus what it is.

| Stored | Intended leave-button (ARCHITECTURE R2) | Actual leave-button |
|---|---|---|
| deployment `draft` | Publish (preflight) | Publish (quiz/LP preflight; advertorial raw write) |
| deployment `live` | Unpublish → `paused` | Quiz/Adv aria Unpublish → `paused`; LP aria **Pause** → `paused`; editor can also write `draft` |
| deployment `paused` | Resume (preflight) or Revert to draft | Publish → `live` |
| quiz master published | Unpublish master | Unpublish via `saveQuiz`, no preflight |
| quiz master archived | Restore (stays unpublished) | Restore via `setQuizArchived` (correct) |
| LP master unpublished | Publish master | Enable also publishes; dedicated publish action unused |
| advertorial master published | Unpublish master | Unpublish → `draft` via generic save |
| website `published` | Unpublish; autosave must not touch snapshot | Unpublish → `draft`; autosave **does** touch snapshot |
| Brand `draft` | Publish brand | Publish brand → `active` (correct) |
| Brand `active` | Pause brand | Pause brand → `paused` (correct) |
| Brand `paused` | Resume brand | Resume brand → `active` (correct) |
| Brand `archived` | Restore (other door) | no button; danger zone will not un-archive |

---

## 14. Defect register (lifecycle)

Cross-links to `ARCHITECTURE.md` where the same fact is an architecture
defect. IDs here are `DEP-*` so a repair ticket can name the machine
without implying a code patch in this file.

### P0

**DEP-P0-001 — Live funnels serve master HEAD. Republish is not a thing.**
`saveQuiz`, `saveLpTemplate` slot writes, and published advertorial saves
mutate the document the public resolver reads. No `master_revision` on
the deployment. LP fingerprint hashes bindings, not copy.
Same as ARCH-P0-001.

**DEP-P0-002 — Website publish snapshot is overwritten by autosave.**
`savePageBodyBlocks` writes `published_blocks` whenever
`status === 'published'`. `createSite` seeds pages published.
Websites index promises draft autosave. Same as ARCH-P0-002.

**DEP-P0-003 — Advertorial go-live is a status string.**
`saveAdvertorialDeployment` writes `status: 'live'`. Collection hook
`publishRequiresPreflight: false`. No fingerprint. Path check only.
Master publish is the same pattern. Same as ARCH-P0-004.

**DEP-P0-004 — Quiz master Publish bypasses the gated action.**
`setQuizPublished` preflights live deployments. Builder writes
`saveQuiz({ is_published })`. Same as ARCH-P0-007.

**DEP-P0-005 — Quiz and advertorial UIs invent URLs that are not routes.**
`https://preview.legenex.com/q/${id}` and `/a/${id}`.
`effectiveDeploymentUrl` exists; LP adopted it; the other two did not.
Same as ARCH-P0-005.

**DEP-P0-006 — Seed writes live deployments without preflight.**
`seedStarterFunnelsForBrand`, `ensureFunnelSamples`, `src/seed/index.ts`
create `status: 'live'` with `overrideAccess: true` and no user.
`publishRequiresPreflight` never runs. Same as ARCH-P1-007, raised: a
new Brand is born with live URLs the UI cannot reproduce without passing
the gate.

**DEP-P0-007 — Seeded site-scoped `/quiz` and `/lp` beat funnel deployments.**
`createSite` publishes older collections onto paths the funnel product
also uses. Resolver returns null (`isClaimedByAuthoredContent`). Admin
shows LIVE. Same as ARCH-P0-003 on the lifecycle axis.

### P1

**DEP-P1-001 — Three deployment types, three lifecycles.**
LP: preflight + fingerprint + list toggle via `setLpDeploymentStatus`.
Quiz: preflight on go-live, no fingerprint, list toggle via
`saveQuizDeployment` (diverts). Advertorial: raw status write.
Same as ARCH-P1-001.

**DEP-P1-002 — UI verbs do not match stored states.**
Pause vs Unpublish vs Draft vs Live vs Published vs Active. List toggles
write `paused` while aria-label says Unpublish (quiz/adv) or Pause (LP).
Same as ARCH-P1-002.

**DEP-P1-003 — Domain eligibility is a different function in each picker.**
LP: `isDomainSelectable` / `domainEligibility` (preview hosts allowed).
Quiz: `status==='active' && sslStatus==='active'` (preview hosts greyed /
absent). Advertorial: unfiltered, including other Brands' hosts.
Preflight then blocks quiz/LP; advertorial never asks.
Same as ARCH-P1-003, with the quiz SSL-vs-preview split made explicit.

**DEP-P1-004 — Path, domain, Brand, and template changes on a live row are edits.**
`enforceDeploymentTenancy` only gates non-live → live. A live LP/quiz
stays live through binding edits. Path check runs on save only if the
incoming status is live **and** the writer calls it (advertorial yes;
quiz/LP only on the diverted go-live). LP fingerprint can mark unverified
after the fact; quiz cannot.
Same as ARCH-P1-005.

**DEP-P1-005 — `DEPLOYMENT_TRANSITIONS` is not the actual machine.**
It allows `live → draft` and forbids `draft → paused`. The gated actions
obey it. Generic quiz/LP save will write `draft → paused`. List toggles
never write `draft`. Operators cannot learn the table from the UI.
Related to ARCH-P2-007.

**DEP-P1-006 — LP fingerprint omits master fields.**
Unverified-changes cannot see DEP-P0-001. Same as ARCH-P2-006.

**DEP-P1-007 — Quiz and advertorial deployments have no fingerprint.**
There is no "saved, not the thing that passed" bit except LP.

**DEP-P1-008 — Bulk deploy hardcodes quiz skin, never updates in place, never binds quiz on LP.**
Second bulk to the same Brand+path creates another draft. Two drafts
allowed; two live not. Same as ARCH-P2-009 plus the unbound LP quiz.

**DEP-P1-009 — Advertorial delete copy lies.**
Dialog: deployments are removed. Action: `masterHasDeploymentsMessage`.
Same as ARCH-P2-008.

**DEP-P1-010 — Draft Brand + preview host = anonymous 404.**
Correct given Site status; the issued preview domain is `active` and
returned as `preview_host`. Same as ARCH-P1-012.

**DEP-P1-011 — Sites collection says paused = 404; router serves `PausedSite`.**
Admin copy in `Sites.ts` vs `page.tsx`. Operators debugging a "paused
404" are looking at the wrong failure.

**DEP-P1-012 — `setLandingPagePublished` is dead and ungated.**
No UI caller. Empty preflight. Unpublishing the master still 404s every
deployment at read time, so the missing preflight is a foot-gun if anyone
wires the button.

**DEP-P1-013 — Advertorial Brand change does not clear domain; picker lists other Brands.**
LP editor clears domain. Quiz editor does not. Advertorial save will
refuse a foreign domain after the operator selected it.

**DEP-P1-014 — Scheduled website pages promote at read time.**
No worker. `publish_at` in the past + `status: scheduled` is live.
Builder can set `publish_at` without flipping status to published.

**DEP-P1-015 — Forbidden copy overrides remain a write-shaped path.**
`content_overrides` column, admin description, page loader,
`content-actions.ts` still loads the bag and would write it if
`refuseDeploymentCopyOverride` were removed. Public render ignores it.
Same as ARCH-P1-008.

**DEP-P1-016 — Deployments index is a report, not a workflow.**
No links into the owning builder. `hostOf` vs `previewOf` vs resolver
disagree. Bulk form sits above a list that cannot publish.
Same as ARCH-P1-011.

### P2

**DEP-P2-001 — Super-admin and no-user writes skip the preflight marker.**
`enforceDeploymentTenancy` returns early for `super_admin` and no user.
`/cms` as super-admin can set quiz/LP `status: 'live'` without
`pagefloPreflighted`. Seed relies on this.

**DEP-P2-002 — `createLpTemplate` / `cloneLpTemplate` seed `is_published: true`.**
A blank template is a live parent. Deployments of it serve as soon as
they are live, with empty slots.

**DEP-P2-003 — Quiz and advertorial Preview buttons are not the public page.**
In-app only. Website Preview is the public tree but on the admin host.
Operators cannot use Preview to answer "what will the visitor hit".

**DEP-P2-004 — Advertorial builder has no refetch reconcile.**
Documented in `togglePublishAdvertorial`. Other builders `router.refresh`.

**DEP-P2-005 — Quiz/LP save does not check path except on go-live.**
A live row can be moved onto a claimed path without `checkPathAvailable`.
The public router then returns whichever `docs[0]` or authored winner
applies. Advertorial save does check when `status === 'live'`.

**DEP-P2-006 — Collection admin copy on LP `content_overrides` still describes the forbidden layering model.**
Same as ARCH-P3-002.

**DEP-P2-007 — `setQuizDeploymentStatus` always runs preflight, including on pause, but the UI does not show those checks on the way down.**
The comments say an operator pausing something wants to know why. The
list toggle only toasts write errors.

---

## 15. Files (authority)

| Concern | File |
|---|---|
| Documented transitions, quiz/LP preflight, `decideTransition` | `src/lib/publish-lifecycle.ts` |
| LP fingerprint / `lpPublishState` | `src/lib/publish-state.ts` |
| Gated status + dead master publish | `src/app/(app)/admin/(top)/publish-actions.ts` |
| Quiz master + deployment writes | `src/app/(app)/admin/(top)/quizzes/actions.ts` |
| LP deployment writes | `src/app/(app)/admin/(top)/landing-pages/actions.ts` |
| LP/quiz template library writes | `src/app/(app)/admin/(top)/template-actions.ts` |
| Advertorial master + deployment writes | `src/app/(app)/admin/(top)/advertorials/actions.ts` |
| Tenancy + preflight marker | `src/hooks/deployment-tenancy.ts` |
| Copy/logic refusals | `src/lib/master-safety.ts` |
| Public quiz resolve | `src/lib/quiz-deployment.ts` |
| Public LP resolve | `src/lib/lp-deployment.ts` |
| Public advertorial resolve | `src/lib/advertorial-deployment.ts` |
| Public router + Brand valve + website render | `src/app/(public)/[[...slug]]/page.tsx` |
| Website snapshot write | `src/app/(app)/admin/sites/[slug]/pages/[id]/blocks-actions.ts` |
| `resolvePublicBlocks` | `src/lib/site-builder/sections.ts` |
| Brand status | `src/app/(app)/admin/sites/[slug]/settings/general/actions.ts`, `SitePublishControl.tsx`, `DangerZoneClient.tsx` |
| Brand create + seed | `src/app/(app)/admin/(top)/sites/actions.ts` |
| Funnel sample / starter live rows | `src/lib/funnel-samples.ts`, `src/seed/index.ts` |
| Bulk | `src/lib/bulk-deploy.ts`, `src/app/(app)/admin/(top)/deployments/actions.ts` |
| Path claims | `src/lib/path-claims.ts` |
| One URL function | `src/lib/deployment-url.ts` |
| Domain eligibility | `src/lib/domain-eligibility.ts` |
| Quiz UI machine | `src/components/builder/quiz/QuizBuilderApp.tsx` |
| LP UI machine | `src/components/builder/lp/LandingPagesApp.tsx`, `LPDeploymentEditor.tsx` |
| Advertorial UI machine | `src/components/builder/advertorial/AdvertorialBuilderApp.tsx` |
| Website UI machine | `src/components/builder/page-builder/PageBlocksBuilderApp.tsx` |
| Collections | `src/collections/Funnel{Quiz,Lp,Advertorial}Deployments.ts`, `FunnelQuizzes.ts`, `FunnelLandingPages.ts`, `FunnelAdvertorials.ts`, `Pages.ts`, `Sites.ts` |

---

## 16. What is already the right shape

Keep these; do not invent a sixth machine while repairing:

- `DeploymentStatus = draft | live | paused` with archive elsewhere.
- `decideTransition` + `GOES_LIVE` + unpublish never gated.
- Diverted go-live on quiz/LP save (keep the edits, refuse the flip).
- `pagefloPreflighted` marker on the tenancy hook.
- LP fingerprint as a digest of bindings, not `updatedAt > published_at`.
- `setLpDeploymentStatus` as the list toggle (quiz should match this).
- `effectiveDeploymentUrl` (make it the only printer).
- `checkPathAvailable` / `CLAIM_PRECEDENCE` as one map.
- Brand `setSiteStatus` enumerated transitions, archive terminal from UI.
- Quiz archive always unpublishes; restore does not re-publish.
- LP `is_enabled` vs `is_published` split; disable does not take pages down.
- Public refusal on unknown templates instead of a stand-in.
- LP 404 when a bound quiz cannot mount, rather than an empty card.
- Bulk draft-only, isolated per Brand.

The missing work is not a new lifecycle story. It is making advertorials,
quiz masters, website autosave, seed, and the three URL printers tell
the story `publish-lifecycle.ts` already wrote.
