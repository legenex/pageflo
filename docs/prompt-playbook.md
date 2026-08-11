# Prompt playbook: production readiness

Fourteen prompts, in order. Each is written to be pasted as-is. Read the
"why" before running one; several are gated on a decision only you can make.

Companion to `docs/production-readiness.md`, which holds the measured
current-state assessment.

## Goal coverage

| Your goal | Prompts |
|---|---|
| Template libraries implemented | P13 |
| Brand identities working properly | P6 |
| Correct sites showing | P7 |
| Don't Settle matches the current site | P4, P10 |
| Preview domains work | P1, P2 |
| Live linked domains work | P2, P3 |
| Template library reskins deployments | P8, P9 |
| Quiz adjusts to chosen design | P11, P12 |
| (foundation, gates a fresh deploy) | P5 |
| (production hygiene) | P14 |

---

## P1 — Preview domains get real certificates

> Register the three `*.preview.legenex.com` hosts in Plesk and issue Let's
> Encrypt certificates for each. Do `don-t-settle.preview.legenex.com` FIRST,
> alone. Verify with certificate verification ENABLED that the served cert's CN
> matches the host, then do the other two. Mirror however `checkacase.com` is
> configured, since that one already works. Do not touch `getwhatyoureowed.co`.

**Why.** All three resolve to this server but none exist in Plesk, so nginx
answers them from a catch-all vhost holding a `crashclaim.co` certificate. Every
preview link shows a browser security warning today.

**Exit.** `openssl s_client` shows `CN = <host>` for all three, and `curl`
without `-k` returns 200.

**Risk.** Touches production vhosts. Let's Encrypt rate-limits at 5 duplicate
certs per week, which is why this does one host first.

---

## P2 — Make `ssl_status` capable of failing

> Fix the SSL poller so it verifies the certificate actually matches the host,
> not just that the URL returns 2xx. Then re-run it against every Domain row and
> show me the before/after. A host we do not serve must not read `active`.

**Why.** The database says `ssl_status: active` for `getwhatyoureowed.co`, a
domain that does not even point at this server. A check that passes on a
wrong-CN certificate turned a visible outage into an invisible one — it is worse
than no check.

**Exit.** Running the poller today marks the preview domains `active` (after P1)
and `getwhatyoureowed.co` something other than `active`.

---

## P3 — Decide what happens to `getwhatyoureowed.co`

> `getwhatyoureowed.co` resolves to 162.255.119.42, not to us, so the live Don't
> Settle site is served by another host. Tell me which you want:
> (a) migrate it here — I will prepare the vhost and cert so only the DNS switch
> remains, or (b) leave it there — I will correct the Domain row so we stop
> claiming a domain we do not serve.

**Why.** Right now the system asserts it serves a domain it does not.
Whichever you choose, the lie has to go. **This one needs your answer before it
can run.**

**Exit.** Either a cutover plan with a single DNS change, or a corrected Domain
row.

---

## P4 — Capture the current Don't Settle site as the parity target

> Fetch the live Don't Settle site at getwhatyoureowed.co and store it as the
> parity reference, the same way the twelve handoff templates were stored. Then
> tell me which of the twelve ported templates is structurally closest to it,
> with the element counts to justify the answer.

**Why.** "Should look exactly like the current site" needs a fixed target that
can be diffed. This makes the claim checkable instead of a matter of opinion,
using the same element-diff method that measured the twelve.

**Exit.** A stored reference and a recommendation naming a template.

---

## P5 — Close F001 so a fresh deploy works

> Write the missing migrations for the six `funnel_*` tables and the `Sites`
> columns that no committed migration creates, and prove them by running
> `pnpm payload migrate` against a scratch empty database. Do NOT run migrate
> against production — it warns about data loss because of the dev-push drift.
> Reconcile production separately once the fresh path is proven.

**Why.** Deploying this repo against an empty database does not currently
produce a working app; those tables exist only because Payload's dev auto-push
made them. It is also why migrate cannot be run on production at all.

**Exit.** Migrate runs green on an empty database and the app boots against it.

**Risk.** High if pointed at production. The prompt forbids that explicitly.

---

## P6 — Brand identities working properly

> Audit each Site's tokens end to end: the Brand Identities screen, through
> `brand_identity`, `resolveBrandTokens` and `paletteFrom`, to what renders.
> Show me a table per Site of what it set versus what it fell back to. Fix
> Don't Settle's near-white `ink` on near-white paper at source.

**Why.** Don't Settle stores `ink: #F7F5F0` on a near-white page — an invisible
page, saved only because the palette layer overrides it. That is a data bug
masked by a safety net, and the safety net should not be load-bearing.

**Exit.** A per-Site table, and no Site relying on an override to be readable.

---

## P7 — Correct sites showing

> Write an automated check that proves tenant isolation: every active Site
> renders only its own content on its own host, a draft Site 404s on every
> route, and no host resolves to the wrong Site. Run it against all three Sites
> and paste the output.

**Why.** Multi-tenancy is the load-bearing concept in this codebase and nothing
tests it. A cross-tenant leak is the worst failure available here, and today it
would be found by a customer.

**Exit.** A repeatable check, passing, covering all three Sites.

---

## P8 — Ported templates become editable

> Make the twelve ported landing-page templates editable: extract their copy
> into nodes while the markup stays the reference's, so the element tree and
> click-to-edit work again. The element diff against each reference must still
> pass afterwards.

**Why.** Their copy lives in ported markup, so editing is switched off for all
twelve. This is the single biggest blocker to "the template library reskins
deployments" meaning anything beyond colour.

**Exit.** A ported template can be edited element by element AND still diffs
clean against its reference.

**Risk.** Largest engineering item in the plan. Expect it to take longest.

---

## P9 — Deployments reskin per brand

> Prove one landing page deployed under three brands renders three palettes and
> one identical structure, measured from the DOM. Add a per-deployment template
> override so the same page can run as different templates for different brands.

**Why.** This is the payoff of the whole template system. The two-brand version
already passes; this extends it and makes the template itself per-deployment.

**Exit.** DOM evidence: same section list, three different palettes.

---

## P10 — Don't Settle rebuilt to parity

> Using the reference captured in P4 and the template chosen there, rebuild the
> Don't Settle site in LegalOS and diff it element by element against the live
> one. Report the match rate and what is left.

**Why.** Your goal stated directly, made checkable.

**Exit.** An element-diff match rate, with residuals named.

**Depends on.** P4, P6, P8.

---

## P11 — Quiz follows the host page's design

> Make an embedded quiz inherit its host landing page's template, not just its
> palette. A quiz inside a ported template should read as part of that page.

**Why.** This is what "dynamically adjusted to chosen design" means in practice.
Today the quiz inherits colour but keeps its own template.

**Exit.** The same quiz embedded in two different landing-page templates renders
in two different presentations.

---

## P12 — Quiz component states and field types

> Build the twenty-four component states from the quiz handoff and the four
> missing field types: ZIP, multi-select with mutual exclusion, split date, and
> consent as a first-class field. Check each against the handoff.

**Why.** Several decide whether a lead is lost: network failure with retry,
resume, validation, and the alternate completion for a non-qualifying answer.
The handoff treats all twenty-four as required of every template.

**Exit.** Every state expressible by every template.

---

## P13 — Finish the template libraries

> Three leftovers: finish `case_type_router` (105 of 174 elements — its variants
> are script-generated in the reference), diagnose why the gallery thumbnail
> paints over its card through four different containment approaches, and drive
> the residual pixel difference on the other eleven to zero.

**Why.** Completes "template libraries implemented". The thumbnail one is a
genuine unknown — four fixes each measured correct and each failed.

**Exit.** Twelve complete ports, a working picker preview.

---

## P14 — Production hygiene

> Add a test suite covering `site-resolver`, the access helpers, `lead-pipeline`
> and the palette derivation; commit an ESLint config so `pnpm lint` is a real
> gate; add error tracking; verify a Postgres backup exists off-box and restore
> it once to prove it. Fix `README.md` and `docs/DEPLOY.md`, which both describe
> a deploy flow that no longer exists.

**Why.** There is no test suite, no committed lint config, no error tracking,
and an unverified backup. Criterion: when something breaks at 3am there is a way
to find out what.

**Exit.** Tests run in CI, lint gates, errors are reported, a backup has been
restored once.

---

## Suggested order

**Now, no decisions needed:** P1, P2, P5, P6, P7
**After you answer P3:** P3, then P4 → P10
**Longest lead time, start early:** P8 → P9
**Then:** P11, P12, P13, P14
