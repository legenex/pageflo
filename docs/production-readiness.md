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
