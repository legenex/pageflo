# Template system implementation — state of the run

Started 2026-08-12. This file is the running record for the composition-system
implementation. Every claim below was measured in this codespace and the command
that measured it is given, so any of it can be re-run and disagreed with.

Where this record contradicts `CLAUDE.md` or `docs/production-readiness.md`, the
contradiction is called out explicitly rather than quietly corrected. Two of
those documents are stale in ways that change what work is needed.

---

## Restore point

    git tag restore-point-pre-template-system    -> 2583b30

The five dirty/untracked files present at the start were copied verbatim to the
session scratchpad before anything ran, because a tag does not protect untracked
work.

## Starting commit and working tree

    commit 2583b30  docs: a prompt playbook for production readiness
    branch main, level with origin/main (0 ahead, 0 behind)

Dirty at start:

| File | State | Disposition |
|---|---|---|
| `package.json` | modified — adds `sweep:templates` script | keep |
| `tsconfig.json` | modified — adds `**/*.mts` to `include` | keep |
| `scripts/sweep-templates.mts` | untracked, 530 lines | keep, it works |
| `src/lib/brand-fixtures.ts` | untracked, 382 lines | keep, it works |
| `docs/template-sweep-baseline.md` | untracked | keep |

All five are the previous template-sweep work. It was never committed, so it is
absent from GitHub `main`. It is real, it runs, and it reproduces its own
recorded baseline exactly (see below). Nothing was recreated; it was verified and
preserved.

`pnpm-lock.yaml` became dirty during this run. That is not new work — see
"Defect found in passing" below.

---

## What this codespace can actually do

`CLAUDE.md` states "This codespace cannot build. No `node_modules`, no `.env`, no
database." That was true of the checkout and is no longer true of the machine.
The npm registry is reachable and Docker works, so:

| Capability | State | Evidence |
|---|---|---|
| Install dependencies | works | `pnpm install --no-frozen-lockfile` — exit 0, 45s |
| Postgres 16 + Redis 7 | running | `docker compose up -d postgres redis` |
| Run migrations | works | `pnpm payload migrate` — exit 0, 22 applied |
| Generate Payload types | works | `pnpm generate:types` — 2790 lines, funnel slugs present |
| Typecheck | works, passes | `pnpm typecheck` — exit 0, 0 errors |
| Template sweep | works | `pnpm sweep:templates` — exit 1, matches baseline |
| Production build | see below | `pnpm build` |
| Reach the production server | **NO** | `ssh root@51.81.202.161` — `Permission denied (publickey)` |

The last row is the run's one hard external blocker and it is load-bearing. It is
recorded in full under "External blocker" below.

---

## Measured starting state

### Migrations and schema

    pnpm payload migrate          # against an empty scratch database
    -> exit 0, 22 migrations applied, "Done."
    -> 86 tables in the public schema

22 migration files on disk, 22 registered in `src/migrations/index.ts`. The
counts match, so no migration is stranded.

### F001 is closed, and two documents still say it is open

`CLAUDE.md` carries a section headed "⚠️ Known schema drift — F001, still open"
listing `brand_identity`, `brand_display_name`, `brand_short_name`,
`brand_logo_url_dark`, `brand_tagline_brand`, `legal_*`, `typography_*` and all
six `funnel_*` tables as declared-but-not-migrated.
`docs/production-readiness.md` makes it P0.3, one of four items said to block
launch, and states that a fresh deploy against an empty database "does not
currently produce a working app".

Against a database built only by the committed migration chain:

    select column_name from information_schema.columns where table_name='sites'
    -> brand_identity (jsonb), brand_display_name, brand_short_name,
       brand_logo_url_dark, brand_tagline_brand, legal_copyright,
       legal_tcpa_text, legal_privacy_url, legal_terms_url,
       legal_default_disclaimer, typography_headline_font,
       typography_body_font, typography_base_size  — all present

    select tablename from pg_tables where tablename like 'funnel%'
    -> funnel_advertorials, funnel_advertorial_deployments,
       funnel_landing_pages, funnel_lp_deployments, funnel_quizzes,
       funnel_quiz_deployments  — all six present

The fix is at `src/migrations/20260729_090000_destinations_and_brand_drift.ts:45`
(`ADD COLUMN IF NOT EXISTS "brand_identity" jsonb`), and that migration's own
header comment calls out the false claim in the earlier migration's prose. The
`funnel_*` tables come from `20260728_120000_funnel_quizzes_archive.ts` and
`20260728_180000_funnel_quiz_public_render.ts` onward.

So F001 was closed on 2026-07-29. `docs/production-readiness.md` was written
2026-08-11, twelve days later, and still lists it as blocking. **P0.3 does not
need doing. The two documents need correcting**, which matters beyond tidiness:
the prompt driving this run treats production migration reconciliation as
dangerous work gated on that drift, and the premise is gone.

This does not by itself prove zero drift between what the collections declare
today and what the migrations create. That is being verified separately by
booting the app in production mode against this migration-only database, where
Payload's `SELECT` enumerates every declared column and one absent column throws
at startup.

### Typecheck

    pnpm typecheck    -> exit 0, 0 errors

Passing, with the standing caveat that 35 files carry `@ts-nocheck` and are
therefore unchecked. `src/payload-types.ts` now generates *with* the `funnel-*`
slugs present (30 occurrences), which is the condition `CLAUDE.md` names for
removing those suppressions. The count is 35, not the 25 `CLAUDE.md` records.

### Template libraries

    20 quiz visual templates   src/lib/quiz-templates/model.ts
    12 LP visual templates     src/lib/lp-templates/generated-index.json

Both match the counts the implementation prompt requires. Quiz ids are
`sq_answer_first` … `sq_timeline_journey`; LP slugs are
`editorial_investigation_v2` … `network_authority`.

### Template colour sweep

    pnpm sweep:templates -- --summary
    -> 200 template violations, 27 fixture assertion failures,
       24 dead brand variables, 0 import breaches   (exit 1)

Identical to the numbers recorded in `docs/template-sweep-baseline.md` on
2026-08-12. The harness is sound and its baseline is reproducible.

---

## Defect found in passing

`pnpm install --frozen-lockfile` fails at `2583b30`:

    ERR_PNPM_OUTDATED_LOCKFILE
    specifiers in the lockfile ({… "playwright":"^1.62.1" …})
    don't match specs in package.json ({… "playwright":"1.62.1" …})

`package.json` pins `playwright` exactly; `pnpm-lock.yaml` still carries the
caret range. This is committed state, not a product of this run. It matters
because `--frozen-lockfile` is the default in CI, so any CI added later fails on
checkout until the lockfile is refreshed. Resolved here by running a normal
install, which rewrote three lines of the lockfile.

---

## External blocker

    ssh -o BatchMode=yes root@51.81.202.161
    -> root@51.81.202.161: Permission denied (publickey).

The key at `~/.ssh/legalos_deploy` is not accepted by the server. `os.legenex.com`
answers over HTTPS (200), so the host is up and only credentialed access is
missing.

Everything that requires touching the server is therefore unreachable from this
run, and no part of it will be reported as done:

* production schema inspection, backup, restore-to-scratch, and migration-ledger
  reconciliation;
* Plesk vhost registration, ACME issuance, nginx configuration and reload;
* preview-domain and custom-domain provisioning and their real HTTPS
  verification;
* any claim that a deployment is live at a real public URL.

Local equivalents are being used where one exists and is honest: an empty scratch
Postgres for the migration chain, and a locally served app for rendering proofs.
A local render is evidence about the renderer. It is not evidence about a
certificate, and is not presented as such.

---

## Gate 1 — the authorization seam (done)

Five read-only scouts mapped schema, brand, quiz, LP and domain/routing. They
found eight cross-tenant defects that outrank the composition work, because they
are live. This gate closes the six that are local code.

### What was wrong, and the single cause

Every one of the first three had the same shape: **the caller supplied the Site
id and nothing derived it from the record**.

| # | Defect | Was |
|---|---|---|
| 1 | `setPrimary` demoted every primary domain on a caller-supplied `siteId`, `overrideAccess: true` | cross-tenant DoS |
| 2 | `recheckDomainDns` launched the SSL poller *above* its access-checked write | poller runs wholly `overrideAccess: true`; could promote a victim's domain and publish their Site |
| 3 | `attachDomainToSite` wrote a caller-supplied `site` onto a pool row | `overrideAccess: false` evaluates access against the row's *current* (site-less) state, so the incoming value went unexamined by construction |
| 4 | `deletePoolDomain` tore down the Plesk vhost before the scoped delete | teardown succeeded, database refused |
| 5 | SSL poller promoted `draft` → `active` | a certificate is a statement about transport, not a decision to publish |
| 6 | The site dashboard promoted `draft` → `active` **during a GET render** | every new Site gets an unverified `status: 'active'` preview row, so merely opening the dashboard published the brand |

### What was built

`src/lib/authz.ts` — the seam. Two rules, stated in the file: derive the Site
from the record, never accept it; and authorize above the side effects, not above
the write. Helpers return the id they derived, so a caller has no reason to keep
the one it was handed. Forbidden and absent return the identical message, so the
error is not an oracle for which ids exist on other tenants.

`src/lib/domain-eligibility.ts` — one answer to "may this domain serve", for the
four surfaces that each decided it differently (the resolver had no filter at
all; the LP and advertorial pickers offered `provisioning` and `error` as normal
options). Preview and custom are split on purpose and the reason is in the file:
holding preview hosts to "SSL active" would 404 every existing one, because no
preview host has been through certificate issuance. `PREVIEW_REQUIRES_SSL` is the
switch, and the tests pin both sides of it.

`setSiteStatus` in `settings/general/actions.ts` + `SitePublishControl.tsx` —
publication as an explicit act, with enumerated transitions and a stale-state
guard. **This closes a regression this gate introduced**: with both auto-
activations removed there was no way to publish a Site at all. Archived is
terminal here; restoring is a different decision and must not share a button
with "unpause".

### Evidence

    pnpm typecheck        exit 0, 0 errors
    pnpm test             90 assertions, 0 failed  (37 brand + 53 authz)
    pnpm sweep:templates  200/27/24/0 — unchanged, so no regression

`scripts/test-authz.ts` is written as the attacker, not as the fix: each case is
a call that worked against `2583b30`. The Payload there is a stub on purpose —
these helpers must decide from the record in front of them, so anything needing a
live database to reach a verdict has already failed the design.

`pnpm test` deliberately excludes the sweep. The sweep is red by design at
baseline (`docs/template-sweep-baseline.md`: "Nothing in this record is fixed.
Recording it is the deliverable"), and an aggregate gate that is always red is a
gate nobody reads.

### Still open from the scouts' eight

* **Preview domains are still written `status: 'active'` unverified.** Fixing it
  properly means provisioning preview hosts through the real path — DNS, ACME,
  nginx, a genuine handshake — which is server work and unreachable this run.
* **`?site=` / `?preview=1` are gated on being logged in, not on `isBoundToSite`.**
  Any authenticated user can read any tenant's draft content;
  `(public)/layout.tsx:76-85` has no check at all. Local and fixable — next gate.
* **The public resolver still applies no status filter.** `domain-eligibility.ts`
  is the contract it needs; wiring it in changes what the live site serves, so it
  wants a look at production domain rows first, which needs SSH.
* **No SSRF protection anywhere**, worst at `integrations/trustedform.ts:30-36`,
  which sends `Authorization: Basic` to a URL arriving on the lead payload.
* **The three funnel deployment collections are still `isAuthenticated`.**
  `requireDeploymentSiteAdmin` exists and is tested; the three `save*Deployment`
  actions have not yet been converted to call it.

## Gate 2 — the adversarial pass (done)

`legalos-adversarial-verifier` was given the acceptance criteria and told to
refute them, with no description of the implementation. It broke one claim,
found a hole gate 1 left open, and predicted a defect that turned out to make
gate 1's headline feature unreachable. All of that is now fixed; the findings it
raised that are NOT fixed are listed under "Still open" below.

### It was right about the publish button

The prediction: `setSiteStatus` writes with `overrideAccess: false`, so if the
collection filters are broken it throws for exactly the site admins the button
is for. Tested against a real login on a scratch database rather than reasoned
about:

    user bound `admin` to a Site, real payload.login()
    before   scoped update FAILED — "You are not allowed to perform this action"
    after    scoped update SUCCEEDED

The cause is repo-wide and predates this run. `Users.auth` sets no `depth`, so
Payload reads the user at `config.defaultDepth` (2) and `siteBindings[].site`
arrives as a **populated Site object**. `src/access/index.ts` mapped it straight
into `{ site: { in: [...] } }`; the drizzle adapter coerces query values with
`Number(...)`, so every entry became `NaN` and matched nothing. `Sites.ts` had
the same mistake twice more in its own rules.

**So site-scoped access control did not work for any non-super-admin, on any
scoped collection.** Not a leak — the opposite, and total. It survived because
the rule was never wrong about *who* should be allowed, only about what shape an
id is, which reads as a permissions problem in whatever feature you are using
rather than as one bug in one place.

### What else it found, and what changed

| Finding | Verdict | Action |
|---|---|---|
| `requirePoolDomain` said "already attached" for **any** tenant's domain | claim 5 **broken** — an oracle over the whole id space | said only when the caller is bound to the Site holding it |
| `deletePoolDomain` gated only the attached branch | hole gate 1 left | pool deletion is now super-admin; `detachDomainFromSite` clears `plesk_domain_id`, which holds the HOST and is what the Plesk teardown revokes |
| `relationId` skipped the finite check on the object branch | real | one guarded path; the new whitespace assertion then caught that `Number('   ')` is 0 too |
| `removeDomain` promoted `others.docs[0]` unchecked | real | promotes only an eligible domain — primary is what the resolver's 301s point at |
| `domain-eligibility.ts` claimed callers it does not have | real | header corrected to say what is wired (`mayBecomePrimary` only) |

Claims 1, 2 and 3 it could not break, and it says what it tried: it enumerated
all ten domain-action exports, and ran the real coercion table through
`relationId` (`{id:'2'}`, `'0x2'`, `'1e2'`, `[]`, `' 5 '`, `NaN`) looking for a
value that authorizes.

### Evidence

    pnpm typecheck        exit 0, 0 errors
    pnpm test             106 assertions, 0 failed
    pnpm sweep:templates  200/27/24/0 — unchanged

## Gate 3 — create scoping, proven against a database (done)

The verifier's finding A was the last cross-tenant hole with teeth, and it is
closed. Payload's `create` operation calls `executeAccess` and only tests the
result for truthiness, so a rule returning `{ site: { in: [1] } }` reads as
"allowed" and the constraint is thrown away. `updateByID`/`deleteByID`
`combineQueries` it against the existing row, which is why this bit only on
create and why the scoping looked like it worked.

Eight collections use a `siteScoped*` helper as their `create` rule.
`src/hooks/enforce-site-binding.ts` is the guard, as a `beforeValidate` hook
rather than a better access rule — no access rule can express it, because the
operation never consults the filter. It covers update too: `combineQueries`
constrains which ROW may be updated, never what it may be changed TO.

`scripts/test-tenant-isolation.mts` runs the attacks against a real database and
a real login, creating and removing its own fixtures. It exists because neither
this bug nor the populated-binding one is expressible without a database — both
were invisible to every unit test and to review.

**Negative control** (hook temporarily neutered, then restored):

    4 attacks SUCCEEDED   create Page · create primary Domain ·
                          create TrackingConfig · move Page between tenants
    restored              all refused

The `Numbers` case was already blocked by something else. Worth recording rather
than assuming: 4 of the 5 were live.

    pnpm typecheck   exit 0
    pnpm test:all    116 assertions, 0 failed (37 brand + 69 authz + 10 isolation)

`pnpm test` stays database-free so it runs anywhere; `pnpm test:all` adds the
isolation suite and needs `DATABASE_URI` and a migrated schema.

### Still open, from the verifier

* **`attachDomainToSite` cannot succeed for a non-super-admin at all**, and
  fails as an uncaught throw: `updateByID` evaluates access against the row's
  *current* state, and a pool row's site is null. Detach works, so a site admin
  can detach a domain and never re-attach it.
* **`createPoolDomain` allows host squatting** — `host` is unique and
  pre-checked, so any admin can permanently deny a host to the tenant that needs
  it.
* **Stale comments promise an auto-verify poller that does not exist**;
  `recheckDomainDns` and `removeDomain` have zero callers in `src/`.

## Gate 4 — the template registry (done)

First piece of the composition system. `src/lib/template-registry.ts` is one
typed seam over both stock libraries; the libraries stay the source of truth for
what a template IS.

Both resolved an unknown id by silently returning something —
`resolveQuizTemplate` gave `sq_editorial_inline`, `templateFor` gave
`TEMPLATES[0]`. The second matters more than it looks: **`bold_modern` is the
stored default on every `funnel-landing-pages` row and names no real template**,
so the silent path was the common path and every such page has been rendering
`editorial_investigation_v2` by accident.

The rule is that resolution either succeeds or says why. `resolveTemplate`
returns a discriminated result and never guesses. `resolveForRender` still falls
back — a visitor must not get a 500 over a database row — but returns
`usedFallback` and `requestedId` so a caller can surface it. That difference is
the module.

`bold_modern` is now an explicit alias to the template it was already rendering,
so every existing page renders exactly as it does today while the accident
becomes a decision. The registry also carries what the library UIs need and had
no source for: family, channels, quiz placement, ground, and a recommended
embedded quiz skin per landing page.

**Negative control** (`listQuizTemplates` returning `[]`): 4 assertions fail,
exit 1, including "the quiz registry is not empty". That property is the one most
easily lost — a resolver that answers everything with the first template passes
any test that only asks whether a template came back.

    pnpm typecheck   exit 0
    pnpm test        159 assertions, 0 failed (37 brand + 69 authz + 53 registry)
    pnpm test:all    adds 12 isolation assertions, needs a database

Not yet done on the composition system: the registry is a seam with no consumers
yet. The library UIs, the deployment save paths and the publish preflight still
resolve ids their own way. Wiring them is the next gate, and it is the point at
which `usedFallback` starts being visible to an operator.

## Note on the production build

`pnpm build` was attempted three times and terminated with SIGTERM (143) each
time, at three different heap sizes. This machine has ~2.8 GB free with the IDE
server resident, and two cores. It is a codespace resource limit, not a defect in
the code: `pnpm typecheck` — which `CLAUDE.md` names as the only working
correctness gate — passes at 0 errors, and `next.config.mjs:11` sets
`ignoreBuildErrors: true` anyway, so the build would not have type-checked
anything typecheck did not.

## Log

**2026-08-12** — Reconnaissance and baseline. Restore point tagged, dirty work
preserved and verified, dependencies installed, Postgres/Redis up, migration
chain proven green on an empty database, Payload types generated for the first
time in this codespace, typecheck green, sweep reproduced at baseline. F001 found
already closed and two documents found stale. SSH access found unavailable.

**2026-08-12** — Gate 1. Five scouts; eight cross-tenant defects found, six
closed. Authorization seam, domain-eligibility contract, explicit Site
publication. 90 assertions green, sweep unchanged.

**2026-08-12** — Gate 2. Adversarial pass broke one claim and found the hole
that made gate 1's publish button unreachable: site-scoped access control was
failing closed for every non-super-admin, repo-wide. Fixed and proven against a
real login. 106 assertions green, sweep unchanged.

**2026-08-12** — Gate 3. Create scoping: eight collections accepted any tenant's
site because Payload discards a create rule's Where. Closed with a hook and
proven with a database-backed isolation suite, including a negative control that
shows four attacks succeeding without it. 116 assertions green.

**2026-08-12** — Gate 3b. Attaching a pool domain was impossible for every
non-super-admin and threw uncaught; fixed, with the hook proven to hold under
`overrideAccess: true`. 118 assertions green.

**2026-08-12** — Gate 4. Template registry: strict resolution that fails
visibly, explicit aliases including the `bold_modern` default that never named a
template, and a negative control proving an empty registry cannot pass. 159
assertions green (171 with isolation).

---

# Second session — gates 5 through 13

Started 2026-08-13, continuing from `4b88790`. Same rule as above: every claim
was measured in this codespace and the command that measured it is given.

## What this codespace can do that the first session's record does not mention

| Capability | State | Evidence |
|---|---|---|
| Headless Chromium | **works** | `npx playwright install chromium --with-deps`, exit 0 |
| Browser-level DOM proofs | **works** | `pnpm test:dom` — 267 assertions |
| `pnpm dev` | starts, then OOMs | serves one request (`GET / 200 in 19438ms`), dies under concurrent load on a 7.9 GB box |
| `pnpm payload migrate` | works, needs `y` piped | a `dev` row in `payload_migrations` makes it prompt; `echo "y" \| pnpm payload migrate` |
| Production `pnpm build` | still OOMs | unchanged from the first session |
| SSH to production | **still NO** | unchanged — see "External blocker" above |

Chromium is the significant one. It converts "the renderer is probably fine"
into a measured claim, and it immediately found three defects that no unit test
could have seen. See gate 7.

## Gate 5 — the registry has consumers (done)

`02f82b5`. The registry existed with no callers; seven places still resolved a
template id their own way and two did it silently.

**Removed rather than fixed**: `resolveQuizTemplate` in `quiz-templates/model.ts`
(answered every id with `sq_editorial_inline`) and `quiz-theme`'s private
accept-list (kept its own copy of the legacy table). A second resolver next to
the data it resolves is how the first survived — every caller had one within
reach and none had to think about it. `model.ts` is data now, and
`test:registry` fails if a resolver reappears next to it.

**The LP id space is 16, not 12.** The four identity templates render through a
different path (nodes + skeleton, not ported markup) and are what the AI wizard
builds into. Registered as non-stock rather than aliased: an alias would move
those pages onto markup that has no copy for them, and the failure would look
like an empty page rather than a bad mapping. `listLpTemplates()` is still
exactly twelve.

### Three defects found by the registry refusing to guess

* **`LivePreview` branched on the RAW stored id.** `'bold_modern'` — the stored
  default on every landing page — took the node branch, asked for an identity it
  does not have, and drew the wrong page under the right name.
* **Two of three seeded sample landing pages named templates that do not exist**
  (`classic_authority`, `editorial_investigation`). All three rendered as
  `TEMPLATES[0]`, so the samples were one page under three names.
* **`saveQuizDeployment` and `saveDeployment` had no authorization at all.** Both
  now call `requireDeploymentSiteAdmin`, closing the last of the three the first
  session's adversarial pass left open.

Migration `20260813_090000` moves the column defaults to real ids, for rows
created straight in `/cms` which never reach a server action. Stored ids are NOT
rewritten: an operator who chose `bold_modern` and one who never chose are
indistinguishable in the data, so the alias stays and does that work.

    negative control   reinstating the silent resolver + one bad seed id
                       -> 2 assertions fail
    pnpm test:registry 113 passed

## Gate 6 — landing-page content slots (done)

`92574f8`. The twelve were one HTML string each, so two deployments of one
template under two brands said the same words.

**The slots are derived, not written.** The generated modules are overwritten
wholesale on every extraction, so a slot hand-authored into one lasts until the
next run. `src/lib/lp-slots/extract.ts` reads the reference's own structure —
`h1` is a headline, `summary` is an FAQ question, small tracked upper-case is an
eyebrow — and the test re-derives from each shipped module and fails if one was
edited by hand.

**Nothing is ever re-serialised.** parse5 (so cheerio, so jsdom) requotes
attributes and re-encodes entities, and the whole port rests on being the
handoff's bytes. `src/lib/lp-slots/scan.ts` reports OFFSETS and the caller
slices, so a round trip is byte-identical by construction. Joining the parts
with every default reproduces the reference exactly — asserted for all twelve,
and by the extractor before it writes.

    slots per template   33 to 164, 1,046 in total
    roles present        all 15, including image_src / image_alt / faq_*

### Three defects that had shipped

* **Every `{{brand.*}}` in all twelve was written `{<U+200B>{brand.x}<U+200B>}`** —
  a zero-width space the designer used to stop their own template engine
  resolving it. No token regex matches that, so **not one brand placeholder in
  any ported page ever resolved**: visitors saw literal braces. Invisible in
  every editor and every diff.
* **`PortedTemplateView` never called `resolveTokens` at all**, so even with the
  braces fixed nothing would have substituted. Both halves had to be fixed for
  one placeholder to work.
* **`{{brand.logo}}` and `{{quiz.estimatedDuration}}`** are used across the
  library and were in neither lookup. The validator now checks the REAL key
  table rather than the namespace, which is how both got waved through.

### `case_type_router` is complete for the first time

Its eight case cards and four quiz options are repeated by `<sc-for>` from
arrays inside the reference's own `<script>`, so its markup held `{{ct.name}}`
and would have printed it to a visitor — the 105-of-174 the audit records. The
extractor now RUNS that script in `node:vm` at build time with a stubbed React
and reads its initial render, rather than transcribing the arrays into our code
where they would drift. 74 slots, valid.

Not reproduced, and recorded rather than faked: the router's INTERACTIVITY.
Clicking a card repaints its playbook in the reference; a static export shows
the initial state. That is genuine behaviour that is lost.

### Images

None of the twelve references contains a single `<img>` — every image is a
dashed box labelled `[LOGO SLOT]`. So an image slot's default IS that box, and a
supplied URL replaces it with a real `<img>` carrying its paired alt. An empty
override renders the reference unchanged, which is what keeps parity true.
33 image slots, each refusing `javascript:` and `data:text/html`.

    negative controls  hand-editing one slot default -> 2 assertions fail
                       restoring the zero-width spaces in one template -> 5 fail
    pnpm test:slots    409 passed

## Gate 7 — the libraries as product surfaces (done)

`40a34e8`. Quizzes gained a Templates tab beside Quiz Builder and Deployments;
Landing Pages gained one beside Pages and Deployments. Both read the REGISTRY,
never database rows — listing what people have built under the catalogue's name
is how a library stops describing what exists.

The gallery thumbnail is back after being removed for painting over its card.
The missing piece was `contain: paint`; `overflow` alone does not stop a
positioned or transformed descendant. This time the claim is checked by
SCREENSHOT rather than by bounding box, because measuring the box is exactly
what reported success on a visibly broken card four times.

### The browser disagreed with us three times, all in `lp-templates/tokens.ts`

1. **The ladder collapsed.** A brand with a dark-mode ink and a fallback surface
   has two ends 0.002 luminance apart. Every rung mixes to the same near-white:
   page, cards, headings and copy all one colour. **Measured at 1.01 contrast on
   every text run in all twelve templates** — a blank sheet. Now repaired, with
   an achromatic last resort so white-on-white is unreachable rather than
   unlikely.
2. **The mix was in the wrong colour space.** A token is named for its LUMINANCE
   and was placed by sRGB position. sRGB is gamma-encoded, so `#949494` on
   `#17191d` — a 5.4 ratio in the reference — came out at 2.47. Every dark
   section in the library was losing more than half its contrast.
3. **The accent was never checked.** The brand's raw primary went straight into a
   slot the reference drew in a different colour. A gold-accented brand produced
   up to 143 unreadable runs in one template.

**Proof that 1 and 2 are fixed rather than improved**: the branded render now
has EXACTLY the reference's contrast profile, template by template.

    with brand remap        1 1 10 6 16 1 0 0 0 2 0 0
    reference, no variables 1 1 10 6 16 1 0 0 0 2 0 0   (identical)

So the suite asserts the property that matters — **no brand makes any template
less readable than the design as drawn** — plus a hard floor that no brand may
introduce text at or under 1.2:1.

**A design-level finding, not ours**: the handoff itself draws 38 text runs
below 3:1 (greyed `$ ———` value placeholders, small monospace labels, a
copyright line). Recorded, not hidden, and not silently "fixed" — they are the
designer's decisions and belong in a conversation with them.

Also fixed: 16 `{{deployment.*}}`/`{{page.*}}` annotation chips reached visitors
as literal braces across five templates. Nothing resolves them and there is no
source for most — "resolving" `{{page.network.attorneys}}` would mean inventing
a number about an attorney network on a legal advertising page. Stripped at
extraction with their dangling labels, like the toolbar already was.

    pnpm test:dom   267 passed, in Chromium

## Gates 12 and 13 — publishing and path claims (done)

`f397586`. Going live meant writing `status: 'live'` through a generic save,
which ran no preflight and — because the funnel deployment collections are
`isAuthenticated` on every verb — no real authorization either.

`src/lib/path-claims.ts` is one answer to "who owns this URL" for all five
things that can own one. The resolver already matches `/C/Pain/` and `/c/pain`
interchangeably, so they must collide at SAVE time; otherwise the product
accepts two records it then serves by insertion order. Scope is part of the
claim: a domain-bound deployment claims one host, a site-wide one claims all of
them, so that pair is genuinely ambiguous even though the resolver breaks the
tie. Precedence is the router's existing order written down as data rather than
changed, so this lands without moving any live page.

`src/lib/publish-lifecycle.ts` makes publication a verb with a gate covering
authorization, parent publication state, brand completeness, template
resolution, graph validity, content-override validity, consent, destinations,
tracking, domain ownership, domain eligibility, path claims and renderer
hydration. It returns EVERY check rather than the first failure — an operator
fixing four things one refusal at a time is how a preflight becomes the thing
people ask to have switched off.

Two asymmetries, both deliberate: **resume is gated as hard as publish** (a
paused deployment's world moves while it is paused), and **going down is never
gated** (something live that fails a check is exactly what needs taking
offline). Unpublishing preserves the record, removes access immediately, and
does not cascade.

The check that will earn its keep: an LP's `quiz_deployment_id` is a bare text
id with no foreign key behind it, so nothing at the database level stops brand A
embedding brand B's quiz and delivering its leads to brand B's destinations.
Preflight refuses it by name.

    pnpm test:publish   105 passed, database-free

## Gate 11 — the AI content adapter (done)

`20a24e7`. Three AI writers existed with no shared statement of what a model may
not touch, and two returned a free-form record.

The output schema is now the boundary: `{ id, text }` and nothing else. An id
the request did not ask about is rejected rather than merged. **There is no
field in the schema that could carry a template id, a colour, a route, an answer
value, a tier, a consent line, a destination, a domain or a pixel** — a stronger
guarantee than instructing a model, because a prompt is advice and a filter is a
fact.

The model is injected, so the contract is exercised with no API key: 58
assertions run the real filtering, prompts and override maths under a
deterministic double, including AI-unavailable, malformed response, partial
acceptance, a human edit beating the model, and reset-to-default.

**Not proven, and listed as an external test**: that a real Claude obeys the
prompt. It matters less than it looks, because disobedience is refused by shape.

## Test surface after this session

    pnpm test         brand 37 · authz 69 · registry 113 · slots 409 · publish 105 · ai 58
    pnpm test:dom     267   (Chromium, no server)
    pnpm test:isolation  12  (needs DATABASE_URI)
    pnpm typecheck    exit 0
    pnpm sweep:templates  200/27/24/0 — unchanged from baseline, no regression
