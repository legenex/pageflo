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

## EB-2 — Namecheap is unavailable, so no tenant host can serve valid HTTPS

**Status: OPEN. Disqualifies production release on its own.**

Authoritative DNS for `legenex.com` and `getwhatyoureowed.co` is Namecheap
BasicDNS, which is down for maintenance. Two records are needed and neither can
be simulated:

1. `getwhatyoureowed.co` — remove the A record `162.255.119.42`, leaving only
   `51.81.202.161`. Today roughly half of real traffic never reaches this server
   and ACME HTTP-01 validation fails intermittently for the same reason.
2. `legenex.com` — add a permanent CNAME

       _acme-challenge.preview.legenex.com  ->  7bd5dcb7-ec33-4647-af4e-042ab69c40b9.auth.acme-dns.io

   The acme-dns registration and the wildcard issuance scripts are already
   staged on the production server. **Do not create a second registration** and
   do not change that target.

Wildcard issuance for `*.preview.legenex.com` must not be attempted until public
DNS actually shows that CNAME: a failed ACME order burns a Let's Encrypt rate
limit and locks out retries for a week.

Until then every tenant host answers with a certificate for `crashclaim.co` and
shows a full-page browser warning. No amount of application work changes that,
and no proof produced with `curl -k`, a forced resolve, or a `/etc/hosts` entry
is evidence about it.

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
