# Production readiness: end-to-end plan

Written 2026-08-11. This is the working plan for getting LegalOS to a state
where real traffic can be pointed at it. It is evidence-based: every claim about
the current state below was measured on the server rather than assumed, and the
command that measured it is given so it can be re-run.

## What "production ready" means here

Six exit criteria. Anything not on this list is improvement, not readiness.

1. A visitor reaching any live host over HTTPS sees the site, with no browser
   security warning.
2. A fresh deploy of this repo against an empty database produces a working app.
3. A lead submitted on any live funnel is persisted and delivered, and a failure
   to deliver is visible to somebody.
4. Every Site renders as its own brand, and no Site can render another's.
5. The app can be changed without a person having to remember an undocumented
   step, and a broken change is caught before it ships.
6. When something breaks at 3am, there is a way to find out what.

---

## Current state, measured

### The blocking finding

Every host is served with a certificate for a completely different domain:

    getwhatyoureowed.co                       https=200  cert CN = crashclaim.co
    don-t-settle.preview.legenex.com          https=307  cert CN = crashclaim.co
    auto-claim-eval.preview.legenex.com       https=404  cert CN = crashclaim.co
    settlementassist-co.preview.legenex.com   https=200  cert CN = crashclaim.co

    plesk bin certificate --list -domain getwhatyoureowed.co
    -> Unable to find domain with name 'getwhatyoureowed.co'

None of these hosts exist in Plesk, so nginx answers them from a catch-all vhost
holding an unrelated certificate. **Every one of them shows a full-page security
warning in a real browser.** Automated checks have not caught this because they
were run with certificate verification disabled.

Worse, the database disagrees: `domains.ssl_status` is `active` for the live
host. Something set that without verifying the certificate matches the host, so
the system reports healthy while the socket says otherwise. That check is itself
a defect - a health check that cannot fail is not a health check.

### Everything else found

| Area | State | How it was checked |
|---|---|---|
| Sites | 3: two active, `auto-claim-eval` is `draft` and therefore 404s | `select … from sites` |
| Schema | F001 open: `brand_identity` and six `funnel_*` tables have no committed migration | `grep` over `src/migrations/` |
| Migrations | Cannot be run: Payload detects dev-push drift and warns that proceeding loses data | `pnpm payload migrate` |
| Tests | None. No test directory, no test script | `ls`, `package.json` |
| Lint | No committed ESLint config; `next lint` prompts interactively | `ls .eslintrc*` |
| Error tracking | None | `grep` for sentry/posthog/datadog |
| Lead pipeline | Runs synchronously in-request. `bullmq` is a dependency with no worker | `src/lib/lead-pipeline/run.ts` |
| Backups | Plesk dumps exist (~2.9GB). Postgres coverage unconfirmed | `ls /var/lib/psa/dumps` |
| Templates | 12 LP ports (11 at exact element parity), 20 quiz templates | element diff, all twelve |

---

## P0 — Blocks launch

Nothing below P0 matters until these are done. A visitor cannot currently reach
the product without dismissing a security warning.

### P0.1 Register every host in Plesk and issue a real certificate
Exit: each host returns 200 over HTTPS with a certificate whose CN or SAN
matches that host, verified **with** certificate checking enabled.
Risk: outward-facing. Let's Encrypt rate-limits (5 duplicate certs per week),
and a bad vhost edit can take the live site down. Do one host first, confirm,
then the rest.

### P0.2 Make `ssl_status` mean something
Exit: the poller verifies the certificate matches the host, and rejects a
mismatch. Re-running it against today's state must produce `failed`, not
`active`. A check that passes on a wrong-CN cert has negative value: it
converted a visible outage into an invisible one.

### P0.3 Close F001 so a fresh deploy works
Exit: `pnpm payload migrate` runs green against an empty database and produces
every table the collections declare. Today the six `funnel_*` tables and several
`Sites` columns exist only because dev auto-push created them, so criterion 2
above currently fails outright.
Note: this is also why migrate cannot be run on production - Payload sees the
drift and refuses without a data-loss confirmation.

### P0.4 Confirm database backups
Exit: a Postgres dump exists, is recent, is off-box, and has been restored once
into a scratch database to prove it. An untested backup is a hope.

---

## P1 — Correctness before traffic

### P1.1 Lead delivery is observable
The pipeline runs inside the request with no worker and no retry. A failed CAPI
post or webhook is lost silently.
Exit: every pipeline step's outcome is persisted, and a failure surfaces
somewhere a human looks.

### P1.2 Ported landing-page templates become editable
Their copy lives in ported markup rather than nodes, so the element tree and
click-to-edit are switched off for all twelve. This gates "reskin a deployment"
being about anything more than colour.
Exit: copy travels as nodes while the markup stays the reference's, and the
element diff against the reference still passes.

### P1.3 Quiz component states
Twenty-four states are specified and not built, including several that decide
whether a lead is lost: network failure with retry, resume, validation, and the
alternate completion for a non-qualifying answer set.
Exit: every state expressible by every template, checked against the handoff.

### P1.4 Brand isolation
Exit: an automated check proves no Site can render another Site's content, and
that a `draft` Site 404s on every route. Multi-tenancy is the load-bearing
concept here and nothing currently tests it.

### P1.5 Don't Settle parity
Blocked on a decision: which "current Don't Settle website" is the target.
Exit: element diff against the agreed source, same method as the twelve.

---

## P2 — Hardening

- **P2.1** A test suite. There is none. Start where a break is silent and
  expensive: `site-resolver`, the access helpers, `lead-pipeline`, the palette
  and contrast derivation.
- **P2.2** A committed ESLint config, so `pnpm lint` is a real gate.
- **P2.3** Error tracking, so criterion 6 is met.
- **P2.4** Fix the stale docs. `README.md` and `docs/DEPLOY.md` both describe a
  deploy flow that no longer exists and name the wrong host.
- **P2.5** Finish `case_type_router` (105 of 174 elements; its variants are
  script-generated in the reference).
- **P2.6** Diagnose the gallery thumbnail bleed. Four containment approaches
  each measured correct and each painted over the card.
- **P2.7** Move the three live quiz deployments off the legacy `default` id.

---

## Sequencing

    P0.1 -> P0.2 ---------------------------\
    P0.3 -> P0.4 ----------------------------> P1.1, P1.4 -> LAUNCHABLE
                                            /
    P1.2 -> P1.5 ---------------------------/
    P1.3 -----------------------------------/

P0.1 and P0.3 are independent and can run in parallel. P1.2 is the largest
single engineering item and gates P1.5.

## How each item is verified

No item is done because the code looks right. Each needs evidence of the kind
the finding above was produced with: a command whose output can be pasted, or a
browser driven to the screen and read back out of the DOM. Today's lesson is
worth keeping - measuring layout reported success four times on a card that was
visibly broken, so the instrument has to match the claim.

## Decisions needed

1. Which "current Don't Settle website" is the pixel-match target?
2. Should `auto-claim-eval` go live, or stay draft?
3. Is the `don-t-settle.preview -> getwhatyoureowed.co` 307 intended? A preview
   domain that redirects to production cannot preview anything.
4. P1.2: make ported templates editable, or accept colour-only reskin for now?

---

# 2026-08-13: verification pass against the real server

SSH access was restored, so everything below was measured on production rather
than reasoned about. Where a claim could not be verified, it says so.

## The 2026-08-11 blocking finding is CONFIRMED and still open

Re-measured from an external vantage, with certificate verification ON:

    host                                       DNS              cert CN         curl
    auto-claim-eval.preview.legenex.com        51.81.202.161    crashclaim.co   000 (cert rejected)
    don-t-settle.preview.legenex.com           51.81.202.161    crashclaim.co   000 (cert rejected)
    settlementassist-co.preview.legenex.com    51.81.202.161    crashclaim.co   000 (cert rejected)
    getwhatyoureowed.co        162.255.119.42 + 51.81.202.161   crashclaim.co   000 (cert rejected)
    os.legenex.com                             51.81.202.161    os.legenex.com  200 (valid)

`plesk bin domain --list` contains none of the four tenant hosts. **No tenant
domain can serve valid HTTPS.** The app layer is not the problem: forced to our
IP with `--resolve`, every host returns the correct `site_id` from
`/api/legalos/self-check`.

Two additional facts the earlier pass did not have:

- `getwhatyoureowed.co` resolves to **two** A records, and `162.255.119.42` is
  not this server. Roughly half of real traffic never reaches us, and ACME
  HTTP-01 validation would fail intermittently for the same reason.
- `*.preview.legenex.com` wildcard DNS is correct and points only here (a random
  nonexistent subdomain resolves to 51.81.202.161), but the `legenex.com` zone
  is **not** authoritative in Plesk, so a wildcard certificate needs DNS-01 at
  whoever holds the zone.

### What it takes to clear it

1. **Previews**: a wildcard certificate for `*.preview.legenex.com`, issued via
   DNS-01 at the external DNS provider. Per-host Plesk vhosts would also work
   but create one Plesk domain per tenant preview, which is a product decision
   rather than a fix.
2. **getwhatyoureowed.co**: point the registrar A record at 51.81.202.161 only,
   then re-run domain verification so the vhost and certificate are actually
   provisioned.

Both need access this session does not have. Neither was attempted, because a
failed ACME order burns a Let's Encrypt rate limit that locks out retries.

## Database rows now tell the truth

`domains.ssl_status` was `active` for `getwhatyoureowed.co` — a value the SSL
poller is only supposed to write after a real HTTPS handshake, which cannot have
happened. Its `plesk_domain_id` held the hostname rather than a Plesk id, so
nothing was ever provisioned. Corrected against the measurements above:

    64/65/69  preview  status active  ssl_status unknown -> pending  (never issued)
    67        custom   status active  ssl_status active  -> error/error

Taken with a verified `pg_dump` backup first (1.1 MB, 86 tables, restored row
counts checked): `/root/legalos-backups/legalos-20260813T121137Z.sql.gz`. The
system `pg_dump` is version 15 against a 16.13 server and produces a **20-byte
empty file with a zero exit status** — use the container's binary:
`docker exec molegenexcom-postgres-1 pg_dump`.

## Two controls existed, were tested, and were never on the code path

This turned out to be the theme of the day, and it is worth naming as a pattern
rather than as two bugs.

1. **SSRF admission.** `lib/brand-identity/ssrf.ts` was complete and had a
   52-case blocked-range matrix passing against it. Nothing called it. The brand
   extractor, the AI page clone, the Playwright render, the outbound webhooks
   and the SSL probe all used bare `fetch()`. Now wired into every one, and the
   matrix is re-run **through** `fetchTextSafe`, `headOk`, `fetchUrlBundle` and
   `safePost`, so a future bare `fetch` fails the suite.

2. **Domain eligibility.** `site-resolver.ts` imported `domainEligibility`,
   declared `ENFORCE_DOMAIN_ELIGIBILITY`, named a log prefix and described
   enforcement in its header. `resolveSiteByHost` called none of it. Verified
   live: with the switch on and a domain corrected to `status=error`, the host
   still answered 200 and nothing was logged.

A control that is present, imported, documented and untested *at its call site*
is indistinguishable from no control. Both now have tests that read the calling
module and fail when the gate leaves the path.

### A third, found only by driving a browser

Gating the resolved host was not enough. Site 13's preview host was eligible;
its primary (`getwhatyoureowed.co`) was not; the resolver kept 307-ing every
visitor onto the refused domain, which then fell through to the LegalOS
marketing page. **The brand was reachable on neither of its hosts**, off two
rows each handled correctly on its own. `curl` of the preview host showed 307
and looked fine; a real browser failed with `ERR_CERT_COMMON_NAME_INVALID`.

## The shipped MVA quiz never ran its own tier lookup

`webhook` and `verification` nodes were listed as invisible and advanced past
without any HTTP call, so `responseMappings` never wrote anything.

In the live MVA Tiered Quiz — deployed to all three sites — exactly one answer
sets a tier by hand (`t3`). Tiers 1, 2 and 4 are assigned **only** by the tier
lookup's response mapping. Every visitor therefore walked the entire quiz
untiered and every tier-scoped question variant was dead. The flow validator was
already reporting this as `route_depends_on_unapplied_response`.

Both node types now execute server-side via `/api/legalos/quiz-webhook`, which
reads the URL, headers and payload from the stored node and never from the
client. Verified live in a real browser: **2 webhook executions** on one run.

**Still open, and not a code problem:** the configured endpoint
`https://api.legenex.com/mva-tier-lookup` is a Base44 web app, not an API. GET
returns an HTML shell; POST, PUT and OPTIONS all return 405. Production logs the
real answer:

    [legalos] quiz-webhook n_tier_lookup answered 405
    [legalos] quiz-webhook n_hlr_lookup  answered 400

So the mechanism works and fails safe, but tiers 1, 2 and 4 cannot become active
until that URL points at a service that returns `{"tier": "t1"|"t2"|"t3"|"t4"}`.
A returned tier that is not a declared tier id is kept as a value and logged,
never used for routing.

## Live results

Driven against production, TLS bypassed at the app port so the certificate
blocker does not mask application behaviour.

| Test | Result |
|---|---|
| Publish / unpublish / republish — Page | 200 (marker present) -> 404 (marker gone) -> 200. Control: unknown slug 404s |
| Publish / unpublish / republish — LP deployment | 200 -> 404 -> 200 |
| Publish / unpublish / republish — quiz deployment | 200 -> 404 -> 200 |
| Exactly one lead, standalone quiz | **1** lead POST, **1** row, from a full 10-step browser run |
| Exactly one lead, LP flow | **Not provable — the LP-embedded quiz is inert.** See below |
| Eligibility enforcement | previews serve; `getwhatyoureowed.co` refused with a logged reason |
| Migrations | 3 pending applied; all F001 columns and `funnel_*` tables present |
| Local suite | 1,625 assertions, 8 suites, 0 failures |

`/partners` and `/privacy-policy` stay 200 while their Page is draft. That is the
`SharedLegalTemplate` fallback working as designed, not a publish bug — proven
by a purpose-made page on a slug with no fallback, which 404s correctly.

## New blocker: the landing-page funnel cannot capture a lead

The quiz card on a landing page is **static markup from the LP template HTML
string, not the real runtime**. Measured in-browser on `/c/don-t-settle`:

    standalone /s/don-t-settle   button type=button  React props: YES  [LOGO SLOT]: no
    LP-embedded /c/don-t-settle  button type=submit  React props: NO   [LOGO SLOT]: YES

Clicking an answer changes nothing in the DOM. Seven clicks produced zero lead
POSTs. React hydrates the page; it does not own that button. A visible
`[LOGO SLOT]` placeholder is rendering on a live public landing page.

Separately, cross-references are stored as text ids with no foreign key, and
**3 of 4 live LP deployments point at quiz deployments that no longer exist**
(11 and 16 are absent; only 14 resolves). That is not the cause of the inert
quiz — deployment 13 has a valid target and is equally inert — but it is a
second defect on the same path.

## Corrected exit-criteria status

| # | Criterion | Status |
|---|---|---|
| 1 | HTTPS with no browser warning | **FAIL** — no tenant certificate exists |
| 2 | Fresh deploy against an empty DB | **FAIL** — F001: production columns exist only via dev push |
| 3 | Lead persisted and delivered | **PARTIAL** — quiz flow proven end to end; LP flow cannot capture |
| 4 | Every Site renders as its own brand | PASS at the app layer; every host returned the right `site_id` |
| 5 | Changed without an undocumented step | **PARTIAL** — Plesk's GitHub deploy key is revoked; `--fetch` fails |
| 6 | A way to find out at 3am | **FAIL** — still no error tracking |

**Gate 14 / production release: NOT PASS.** Criterion 1 alone is disqualifying,
and it needs DNS and certificate access this session did not have.

## Adversarial verification of this pass

An independent read tried to refute each finding above. All four were
**CONFIRMED**, and it then found five defects in the repairs themselves. Two
were serious enough to matter, and both are fixed:

- **The fetch deadline did not cover the body read.** `clearTimeout` fired when
  the headers arrived, so a server that answered 200 and then trickled bytes
  under the size cap held the read open indefinitely. This was not theoretical:
  `safePost` made `dispatch-webhooks` read response bodies it had never read
  before, and that runs synchronously inside `POST /api/leads`, so one slow
  receiver could hang a visitor's lead submission. The timer now stays armed
  through the read, an abort mid-body is reported as a timeout, and unread
  bodies are cancelled rather than pinning a socket.
- **The author's HTTP verb was ignored.** `safePost` hardcoded POST while the
  builder offers five verbs, so a GET verification node received a POST with an
  empty body, got 405, and the flow routed on nothing — the exact silent failure
  the change set out to end.

Three more, also fixed: LP-embedded quizzes were still not executing webhooks
(`resolveEmbeddedQuiz` synthesises `lp:<id>`, which `findByID` could not parse,
so the binding the product now prefers stayed broken); a deployment id was
effectively a bearer token for another tenant's funnel, because nothing checked
the deployment belonged to the Site serving the request; and the JSON payload
template was interpolated textually, so an answer of `x","tier":"1` could forge
sibling fields in what the buyer received.

### Open, and deliberately not changed in this pass

- **`/_next/image` is an open image proxy.** `next.config.mjs` sets
  `remotePatterns: [{ protocol: 'https', hostname: '**' }]`, so
  `/_next/image?url=https://<anything>` is an unauthenticated server-side fetch
  of an attacker-chosen host on every public tenant domain. Narrower than the
  fixed paths (https only, image content types only) but the same shape. The fix
  is an explicit host allowlist; it was not applied because tenant brand logos
  are remote URLs and a wrong list breaks image rendering on live sites. Needs
  the real list of image hosts first.
- **Webhook node config reaches the browser.** `quiz-deployment.ts` ships the
  full node array to the client component, so `webhookUrl`, `webhookHeaders`
  (keys *and* values) and `webhookPayload` are in the RSC payload of every
  public quiz page. No shipped node contains a literal secret today (the seeded
  HLR header is `Bearer {{twilio_token}}`, which resolves empty), so this is a
  latent hazard rather than an active leak — but the builder invites exactly the
  habit that would make it one. The fix is to send the runtime a boolean
  "this node calls a webhook" instead of the configuration.
- **The builder's "Run Test" button lies.** It interpolates the URL and uses the
  author's verb from the admin's browser; the server never interpolates the URL.
  So a node can test green and 404 in production.
- **Cache staleness across hosts, bounded at 60s.** `Domains.afterChange`
  invalidates only the mutated host, so a sibling host can keep a stale
  `primaryHost` for up to a minute after a primary flips to `error`.
- **`brand-map.ts` link emission is still unfiltered** — it picks the primary
  host with no eligibility test, so funnel-rendered links can point at a host
  the resolver refuses.


---

# 2026-08-13, later: the repository-side gates

Written after the cloud pass recorded in
`docs/template-system-implementation-state.md`. Only the criteria whose STATUS
changed are restated; everything else stands as measured above.

| # | Criterion | Was | Now |
|---|---|---|---|
| 2 | Fresh deploy against an empty DB | **FAIL** | **PASS** — `pnpm test:bootstrap`, 54 assertions, 24 collections read against a migration-only schema. Two more drifts were found and fixed doing it (`20260813_210000`, `20260813_213000`); neither was in F001's list. |
| 3 | Lead persisted and delivered | **PARTIAL** — LP flow could not capture | **PASS at the app layer** — the LP quiz card is the real runtime; one lead from the standalone path and one from the LP path, in a browser, against a local database. Not a production measurement. |
| 5 | Changed without an undocumented step | **PARTIAL** | **PASS** — `scripts/release.sh` migrates while the service is down and verifies before starting. `pnpm test:release`, 26 assertions against a scratch database at the previous release's schema. |
| 6 | A way to find out at 3am | **FAIL** | **PARTIAL** — one reporter, one stable event shape, redaction proven, error boundaries added. The destination is an external decision: EB-3. |
| 1 | HTTPS with no browser warning | **FAIL** | **FAIL, unchanged.** Namecheap is down; see EB-2. Nothing in this pass touched it and nothing in this pass should be read as progress on it. |

**Gate 14 / production release: still NOT PASS.** Criterion 1 alone is
disqualifying and it is blocked on DNS this session did not have.

Also corrected in this pass, because both were load-bearing and false:

* `CLAUDE.md` said `src/migrations/index.ts` "is what runs, not the directory
  listing". Payload reads the DIRECTORY and skips `index.ts`.
* `20260518_134859_site_status_draft.down` had never worked — it set a column to
  `text` while its DEFAULT was still an enum value, so every rollback that
  reached it failed with 42804.
