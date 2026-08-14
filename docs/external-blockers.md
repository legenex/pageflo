# External blockers

Things LegalOS cannot finish on its own, each with the exact information or
access that would close it. Written 2026-08-13.

Everything here is blocked on somebody outside this repository. Nothing here is
blocked on engineering effort, and nothing here should be "fixed" by inventing
the missing part — each item says what a wrong guess would cost.

---

## EB-1 — The MVA qualification tier service does not exist

**Status: OPEN. Blocks tiers 1, 2 and 4 in the shipped MVA flow.**

### What the flow expects

The seeded MVA Tiered Quiz (`src/components/builder/quiz/seed-data.ts`,
`n_tier_lookup`) calls a provider between the accident-date question and the
detail questions. The contract is not described anywhere; it is *pinned by the
node itself* and asserted in `scripts/test-quiz-webhook.mts`:

| | |
|---|---|
| Method | `POST` |
| URL as configured | `https://api.legenex.com/mva-tier-lookup` |
| Request headers | `Content-Type: application/json` |
| Request body | `{"accident_state": "<US state>", "incident_date": "<YYYY-MM>"}` |
| Response | JSON, `200` |
| Response field read | top-level `tier` |
| Accepted values | `t1`, `t2`, `t3`, `t4` (the quiz's declared tier ids) |
| Anything else | carried onto the lead, never used for routing, logged |

The node's own description says what is behind it:
`Webhook > BigQuery (state + date > tier_1/2/3/4)`.

### What is missing

**The rule that turns a state and a date into a tier.** It is not in this
repository, in any migration, in any seed, or in the Base44 account:

    grep -rn "tier" src/                 -> the four tier IDs, and nothing that assigns them
    US_STATES in seed-data.ts            -> a list of state names, no per-state data
    Base44 "Legenex Lead Gateway" app    -> functions processLead, testHlr, testLeadByte
                                            (no tier lookup; entities are Lead,
                                            Supplier, Webhook, HlrSettings, …)

The only tier assigned anywhere in the flow by hand is `t3`, set by the answer
"We Were Both At Fault / Not Sure". Every other tier comes from this response.

### Why it is not being implemented here

A state-and-date-to-tier map is a **qualification rule on a legal advertising
funnel**. It decides which questions a claimant is asked, which of them are
disqualified, and which buyer receives the lead. A plausible-looking rule —
statute-of-limitations windows per state, say — would be indistinguishable from
the real one in every test and wrong in production, and nobody downstream would
be able to tell. The instruction on this run was explicit and it is also the
right call: do not invent MVA qualification rules that are not present in an
authoritative source.

### Exactly what is needed to close this

One of:

1. **The BigQuery table or query** that the node's description refers to, plus
   who may reach it and with what credential. LegalOS would then either call it
   directly or keep calling an HTTP wrapper around it.
2. **A working endpoint** at any URL that satisfies the contract in the table
   above. It does not have to be at `api.legenex.com`; the URL is stored on the
   node and is an operator field.
3. **The rules themselves**, in a form somebody is willing to sign off on
   (a state-to-tier table with the date windows). LegalOS can then hold them as
   data and the lookup becomes local — which is better, because a funnel that
   stops qualifying when a third party is down is a funnel that stops earning.

### What HAS been done, so the day it arrives is a configuration change

* The execution layer is complete and proven against every provider behaviour:
  `t1`–`t4`, an undeclared tier, a timeout, a non-JSON body, every HTTP error
  status, and an SSRF-blocked target. 133 assertions, `pnpm test:webhook`.
* A returned tier only steers routing when the quiz declares it
  (`src/lib/quiz-webhook/tier.ts`). Anything else rides on the lead and is
  logged, never routed on.
* The builder's "Run Test" now executes through the SAME server path
  (`/api/legalos/quiz-webhook-test`), so a node cannot test green in a browser
  and 405 in production — which is precisely what the current endpoint does.
* Failure is never fatal: every refusal returns the visitor to the flow
  untiered. A lead with no tier is worth more than no lead.

### The measurement that started this

Production, 2026-08-13:

    [legalos] quiz-webhook n_tier_lookup answered 405
    [legalos] quiz-webhook n_hlr_lookup  answered 400

`api.legenex.com/mva-tier-lookup` answers a browser with an application shell
and answers the server with 405. This cloud environment's network policy blocks
outbound requests to it, so that measurement has not been repeated here and is
carried forward from `docs/production-readiness.md` rather than re-asserted.

---

## EB-2 — Tenant HTTPS — **CLOSED 2026-08-14**

**Status: CLOSED. Verified externally, 48/48 assertions, from two network paths.**

The owner made both Namecheap changes. Measured from this codespace and from the
production server, against both authoritative nameservers and 1.1.1.1 / 8.8.8.8 /
9.9.9.9:

* `getwhatyoureowed.co` → **`51.81.202.161` only**. `162.255.119.42` is gone from
  every resolver, including authoritative.
* `_acme-challenge.preview.legenex.com` → CNAME
  `7bd5dcb7-ec33-4647-af4e-042ab69c40b9.auth.acme-dns.io`, byte-identical on all five.

Issued and installed on that basis:

| host | cert | via | expires | renewal |
|---|---|---|---|---|
| `*.preview.legenex.com` | LE `YE2` | acme-dns DNS-01 | 2026-11-12 | acme.sh cron, self-installing |
| `getwhatyoureowed.co` | LE `YE2` | HTTP-01 webroot | 2026-11-12 | acme.sh cron, self-installing |
| `crashclaim.co` (+www) | LE `YE1` | HTTP-01 webroot | 2026-11-12 | acme.sh cron, self-installing |
| `test.checkmyclaim.co` | LE `YE1` | HTTP-01 webroot | 2026-11-12 | acme.sh cron, self-installing |

The last two were not part of the ask. They were found **five and eight days from
expiry with nothing renewing them** — neither is a Plesk domain, so Plesk's own
renewal never considered them, and neither was in `acme.sh --list`. `crashclaim.co`
is the first `:443` server block and therefore the de-facto default vhost for every
unmatched SNI, so its expiry would have degraded every unmatched host on 2026-08-20.
Both now renew. The catch-all still presents `crashclaim.co`, unchanged.

Serving config lives in `/etc/nginx/conf.d/legalos-tenants/`, which is hand/app
managed and **not** regenerated by Plesk. The preview wildcard is one vhost for the
whole namespace (`preview.legenex.com.conf`); the filename sorts after
`crashclaim.co.conf` on purpose, because with no `default_server` anywhere the FIRST
`:443` block answers unmatched SNI and that must not silently change.

Proof standard met: ordinary `curl` and `openssl` with full validation — no `-k`, no
`--insecure`, no `--resolve`, no `/etc/hosts` — plus `verify_hostname`, SAN coverage,
expiry, and SNI discrimination against a second servername on the same socket.

---

## EB-3 — Production error tracking has no chosen provider

**Status: OPEN — a decision, not an implementation.**

See `docs/production-readiness.md` criterion 6 and `src/lib/observability/`.
The provider-neutral half is built and running: every server error goes through
one reporter with a stable event shape, and it writes to the process log when no
transport is configured. What is missing is a decision about WHERE those events
should go, and the credential for it.

Closing it needs: a chosen destination (Sentry, a log drain, an HTTP endpoint)
and its DSN/URL placed in the server's `.env` as `LEGALOS_ERROR_WEBHOOK_URL` (or
a provider adapter added beside the existing one). No code change is required to
start capturing to the log; that is already on.

---

## EB-4 — Live deployments fail their own publish preflight

**Status: OPEN. Not external — but it is a decision about content, not a bug to
fix silently, so it is recorded here.**

Quiz deployment 17 (`SettlementAssist.co`, `/s/settlementassist-co`) is
`status='live'` and **cannot be re-published through the sanctioned door**. Its
preflight, run against production on 2026-08-14, returns two blocking failures:

    FAIL  Brand is complete enough to publish — the brand has no a legal disclaimer
    FAIL  The flow carries consent language — no node in this quiz mentions consent or TCPA

Nineteen other checks pass, including domain ownership, domain eligibility, path
availability, flow reachability and tier reachability.

**Consequence: unpublishing any such deployment is a ONE-WAY DOOR.** It goes down
through the UI and the UI cannot bring it back. This was discovered by doing
exactly that during acceptance; the deployment was returned to its prior state.

The consent failure may be a **false positive**. The visitor *does* see consent
copy: the runtime renders `brand.legal.tcpaText` beneath the form node, and that
was confirmed in a browser on the live page. `checkConsent` looks for a *node*
whose text mentions consent/TCPA, which is a different place from where the copy
actually comes from. Either the check should also accept brand-level TCPA text, or
the flows should carry node-level consent — that is a compliance call, not a
refactor, which is why it is not being changed here.

The disclaimer failure is not a false positive: `Sites.legal_default_disclaimer`
is genuinely empty for that brand.

Also, the message itself has a grammar bug — "the brand has no **a** legal
disclaimer" — and it is user-facing.

To close: decide whether brand-level TCPA text satisfies consent, populate the
brands' legal disclaimer, then re-run the preflight.

---

## EB-5 — Admin "Publish" silently no-ops in the production build

**Status: OPEN. Functional defect, found in production 2026-08-14.**

The production log carries, repeatedly:

    Failed to find Server Action "0000000000000000000000000000000000000000"
    Failed to find Server Action "x"

Unpublish works. **Publish does not** — the click resolves no server action, the
mutation never runs, and the UI reports nothing. Combined with EB-4 this is how a
deployment goes offline and stays offline.

An all-zero action id is not a stale-tab hash; it looks like the action reference
is not being bound in the production build. `next.config.mjs` enables the
`reactCompiler` experiment, which the build output flags with `⨯`. That is the
first thing to rule out.

Not reproducible from a dev server — it needs `pnpm build` + `pnpm start`.
