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

### Still open, from the verifier

* **`Domains.access.create = siteScopedAdmin` is a no-op.** Verified against
  Payload's source in `node_modules`: `create.js` only tests the access result
  for truthiness and discards the returned `Where`, so any user with one admin
  binding can `POST /api/domains` with another tenant's `site` and
  `primary: true`. The pattern (a `siteScoped*` helper used as `create`) is
  repeated across collections, so it is systemic and wants one pass.
* **`attachDomainToSite` cannot succeed for a non-super-admin at all**, and
  fails as an uncaught throw: `updateByID` evaluates access against the row's
  *current* state, and a pool row's site is null. Detach works, so a site admin
  can detach a domain and never re-attach it.
* **`createPoolDomain` allows host squatting** — `host` is unique and
  pre-checked, so any admin can permanently deny a host to the tenant that needs
  it.
* **Stale comments promise an auto-verify poller that does not exist**;
  `recheckDomainDns` and `removeDomain` have zero callers in `src/`.

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
