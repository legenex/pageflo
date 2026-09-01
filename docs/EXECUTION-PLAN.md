# PageFlo execution plan

Version 1, 1 September 2026.

Transforming LegalOS into PageFlo, in phases. The plan is dependency-led. Phase
numbers express order, not calendar. A phase is complete when its acceptance
criteria are met and `docs/STATE.md` records the evidence.

**Standing constraint: the current LegalOS production system must keep working
throughout.** Every phase before 11 is additive or internally-scoped. Nothing
before phase 10 changes where PageFlo runs, and nothing before phase 11 changes
what production serves in a way a visitor would notice without deliberate
approval.

---

## Phase 0: repository and operating cleanup

**Status: complete, 1 September 2026.**

Establish one source of operating truth and correct the repository's record of
its own state, before anything is rebuilt on top of it.

Delivered:

- `AGENTS.md` as the canonical operating contract
- `CLAUDE.md` reduced to a short Claude Code entrypoint that defers to it
- `docs/STATE.md`, `docs/PRODUCT-BRIEF.md`, `docs/REQUIREMENTS.md`,
  `docs/EXECUTION-PLAN.md`, `docs/HUMAN-GATES.md`, `docs/INFRASTRUCTURE.md`
- `docs/ARCHITECTURE.md`, holding the architecture knowledge that previously
  lived in `CLAUDE.md`
- `README.md` rewritten against the real deployment model
- superseded documents banner-marked rather than deleted
- the full validation matrix run and its real capability recorded

Acceptance: one document claims to be canonical; every measured production fact
in `docs/STATE.md` has the command that measured it; no operating instruction in
the repository contradicts `AGENTS.md`.

---

## Phase 1: PageFlo rebrand foundation

Establish the name and, more importantly, the **naming boundary**. This phase
decides what is safe to rename and what is load-bearing, and it renames only the
first category.

Work:

- classify every `LegalOS` and `legalos` occurrence into: user-facing copy,
  internal identifier, and live infrastructure name
- rename user-facing copy: the sidebar, sign-in, handbook, placeholders,
  settings descriptions, page metadata. 36 strings across `src/components/` and
  `src/app/`
- introduce the PageFlo name, tagline and positioning in one place rather than
  scattering literals
- decide and write down the compatibility strategy for the load-bearing names,
  without executing it:
  - the 26 `LEGALOS_*` environment variables
  - the `/api/legalos/*` route namespace
  - the `legalos-dev` systemd service
  - the `legalos` PostgreSQL database and role
  - the `molegenexcom` Docker Compose project and its container names
  - the `legalos.git` Plesk repository and `os.legenex.com` domain
  - the `.legalos-builder-canvas` CSS scope, which is paired with
    `html.site-shell` in `bespoke-css.ts`
- generalize the legal-vertical language in shared surfaces where it costs
  nothing, leaving `SharedLegalTemplates` and the legal slug fallbacks intact

Depends on: phase 0.

Acceptance: no user-facing surface says LegalOS; every load-bearing name is
listed with a decided migration strategy and an owning phase; production is
unaffected; the full validation matrix passes.

**Explicitly not in this phase:** any visual redesign, any infrastructure
rename, any database rename.

---

## Phase 2: design system and application shell

The visual foundation. Nothing here changes behavior.

Work:

- PageFlo design tokens: color, type scale, spacing, radius, elevation, motion,
  in light and dark
- a component primitive layer the whole application shares, replacing the
  ad hoc styling in `src/components/app/`
- the application shell: top navigation, site sidebar, page chrome, empty
  states, loading states, error states
- accessibility baseline: focus, contrast, keyboard paths, reduced motion
- the shell must not fight the existing brand-token system. Operator chrome and
  tenant brand rendering are separate palettes and must stay separate

Depends on: phase 1.

Acceptance: every shell surface renders from tokens; light and dark both pass
contrast; the tenant-facing brand token system is untouched; no page regressed.

---

## Phase 3: primary application pages

Rebuild the operator surfaces on the phase 2 shell, and close the placeholder
gap.

Work:

- Overview, Sites, Brands, Settings, System, Plan, Handbook: onto the new shell
- **Leads**: a real operator surface. Today `/admin/leads` is a 13-line
  placeholder deep-linking to raw Payload. List, filter by Site, inspect a lead
  with its pipeline trace, consent evidence and delivery outcomes, and export
- **Users**: a real roster and role-binding surface. Today `/admin/users` is a
  4-line placeholder
- Analytics stays a deliberate, honest "coming soon" until phase 6 gives it data
  worth showing

Depends on: phase 2.

Acceptance: no `Placeholder` component remains in the primary navigation except
Analytics, which says what it is waiting for; every rebuilt page enforces Site
scoping server-side; `pnpm check:handbook` still passes.

---

## Phase 4: builder redesign

The page, landing page, advertorial and quiz builders onto the new design
system, and the ported-artifact code brought up to the repository's standard.

Work:

- builder shells and inspectors onto phase 2 primitives
- the canvas preview and the public render must stay pixel-identical: every
  `bespoke-css.ts` rule stays dual-scoped
- quiz template fidelity: continue the measured work in
  `docs/quiz-fidelity-baseline.md` rather than asserting distinctness
- the template gallery, slot editor and node inspector as first-class surfaces
  rather than ports

Depends on: phase 2, and overlaps phase 5.

Acceptance: builder preview and public render remain identical, measured by the
existing fidelity harness; `pnpm test:dom`, `pnpm test:slots` and
`pnpm test:identity` pass; no template regressed against its baseline.

---

## Phase 5: functional completeness audit

Remove the blind spots before building on top of the code.

Work:

- **remove all 54 `// @ts-nocheck` headers**, file by file, applying the real
  types that `src/payload-types.ts` now provides. About 24,000 of roughly
  100,000 lines of `src/` are currently unchecked
- work the 50 confirmed findings in `docs/audit-2026-06-04.md`, tracked on
  `/admin/plan`, using the scoped reviewers in `.claude/agents/`
- resolve the UNKNOWN / NEEDS AUDIT entries in `docs/REQUIREMENTS.md`, in
  particular whether every rejection persists a durable reason and whether every
  delivery outcome is queryable per lead
- replace the text-id cross-references between funnel documents with something
  that has referential integrity, or prove the reconcile script is sufficient

Depends on: phase 1. Can run in parallel with phases 3 and 4 under the file
ownership rules in `AGENTS.md` section 16.

Acceptance: zero `@ts-nocheck` in `src/`; `pnpm typecheck` passes with full
coverage; every audit finding is fixed, refuted with evidence, or explicitly
deferred with a reason; no requirement remains UNKNOWN without a stated owner.

---

## Phase 6: backend and workflow completion

Make the lead path durable, and give analytics something true to report.

Work:

- **durable lead intake**: commit a sanitized receipt before enrichment,
  validation, delivery and billing, so a downstream outage or a crash cannot
  lose a paid lead. The pipeline is synchronous today
- **a real queue**: `bullmq` is declared with no worker. Either wire it or
  remove the dependency; do not leave the ambiguity
- **replay safety**: a committed receipt is replayable and replay cannot
  double-deliver or double-fire a conversion event
- configurable per-campaign validation rules, replacing the fixed pipeline rules
- routing configuration: order, priority, caps, and destination response parsing
- rejection reasons persisted with stable machine codes
- analytics data model, then the Analytics surface deferred from phase 3
- Campaign Integrity: unify page lint, contrast audit, template identity refusal
  and deployment path checks into a verdict an operator can act on

Depends on: phase 5.

Acceptance: a lead survives a downstream outage and an application restart,
proved by a test that kills the process mid-flight; replay does not
double-deliver; every rejection has a queryable reason; Analytics reports
numbers that reconcile against the lead table.

---

## Phase 7: security, tenancy and permissions

Close the tenancy gaps and harden the boundary.

Work:

- **wire the six `Funnel*` collections into per-Site scoping.** Their access is
  plain `isAuthenticated` today, so any authenticated user can read and write
  any brand's funnel content
- a complete authorization matrix: role by collection by action by row, asserted
  as a test rather than reviewed by eye
- secret handling review: `AGENTS.md` section 13 as an enforced property, not a
  convention
- the SSRF admission boundary re-verified against every outbound path added
  since it was written
- prepare, but do not build, the external-party portal isolation model

Depends on: phase 5, and phase 6 where routing configuration adds new surfaces.

Acceptance: `pnpm test:isolation` extended to cover funnel collections and
passing; the authorization matrix is a test; no credential reachable from a
browser response; every outbound path goes through the admission check.

---

## Phase 8: automated tests and QA

Turn a suite of harnesses into an enforced gate.

Work:

- **commit an ESLint config.** `pnpm lint` currently prompts interactively and
  exits 1, so it is not a check
- a single `pnpm gate` command running the full matrix in the right order, the
  way DashFlo's does
- **continuous integration.** There is no `.github/` directory today. A push
  runs the gate; a failing gate blocks the release
- coverage for the paths that have none, guided by phase 5's findings
- a browser-driven regression pass over the rebuilt surfaces from phases 3
  and 4

Depends on: phases 3, 4, 5.

Acceptance: `pnpm gate` exists, runs every check, and is green at a named
commit; CI runs it on every push to `main`; `pnpm lint` is a real check that
passes.

---

## Phase 9: Plesk-independence and infrastructure portability

Make PageFlo able to run somewhere that is not this Plesk host. Nothing moves in
this phase.

Work:

- **a hosting provider interface.** The Plesk coupling is narrow:
  `src/lib/plesk/{client,provision-domain}.ts`, imported by four files. Extract
  a `DomainProvider` interface with the Plesk implementation behind it, plus a
  second implementation (nginx plus ACME) proving the abstraction
- certificate handling that does not depend on Plesk, and a decision on the two
  competing issuance paths currently on the host
- **bring unversioned production behavior into the repository**:
  `/usr/local/bin/legalos-warm.sh` and the two systemd timers
- a reproducible host bring-up from the repository, replacing the retired
  `scripts/first-time-setup.sh`
- **automated database backups with a proven restore drill.** There are none
  today
- a deployment model for the target host: containers or systemd, justified and
  written down
- resolve the `molegenexcom` compose project and the `mo.legenex.com` directory
  the production database still runs out of

Depends on: phase 8, because moving without a gate is moving blind.

Acceptance: PageFlo runs end to end on a scratch host with no Plesk, with domain
provisioning and certificate issuance working through the non-Plesk provider;
a backup taken on that host restores into an empty database and the application
boots against it; nothing that runs in production is absent from the repository.

**This phase does not move production.**

---

## Phase 10: dedicated PageFlo VPS

Stand up PageFlo's own machine. Production still runs where it runs.

Work:

- provision a dedicated VPS for PageFlo. **Not the DashFlo VPS.** DashFlo stays
  on its own machine, and PageFlo must never be designed around sharing it
- standard Linux infrastructure: PostgreSQL, Redis, nginx, automated
  certificates, the deployment model chosen in phase 9
- deploy the current application to it from the repository, with no manual steps
- restore a production backup into it and verify the application against real
  data shapes
- run it in parallel with production, serving nothing, long enough for the
  results to be boring
- backups, monitoring, alerting and a restore drill on the new host

Depends on: phase 9.

**Human gates:** provisioning spend, credentials for the new host, and the
production data import into it. See `docs/HUMAN-GATES.md`.

Acceptance: the new host serves the full application from a clean deploy; a
production restore works; backups and their restore are proven; no production
traffic has moved.

---

## Phase 11: controlled production cutover

Move production. This is the only phase that changes what visitors reach.

Work:

- a cutover runbook with a tested rollback at every step
- move the control plane first, then tenant domains in tranches, smallest and
  lowest-risk first
- **DNS changes are individually gated**
- hold and compare after each tranche: lead volume, capture success, consent
  capture, conversion events, certificate status, error rate
- decommission the old path only after an agreed observation period, and only
  with approval

Depends on: phase 10.

**Human gates:** every DNS change, the infrastructure migration itself,
replacing the current production host, and any destructive rollback.

Acceptance: every domain resolves to the new host with a valid certificate;
lead capture, consent and conversion events reconcile against the pre-cutover
baseline; the rollback was tested, not just written; the old host is retired
deliberately, not abandoned.

---

## Phase 12: final product completion

PageFlo as the product brief describes it.

Work:

- the deferred product surface: full Analytics, Campaign Integrity, external
  party portals
- complete routing and delivery: ping-post, exclusive, shared and resale modes,
  caps, response parsing, retry classes
- configurable verticals, replacing the seeded legal content with a vertical
  model
- the remaining legal-vertical generalization: `SharedLegalTemplates` and the
  legal slug fallbacks become a generic document library
- the load-bearing identifier renames deferred from phase 1, now that the
  infrastructure they name has been replaced
- multi-tenant SaaS provisioning, if the product is going outward

Depends on: phase 11.

Acceptance: every PLANNED requirement in `docs/REQUIREMENTS.md` is LIVE or
consciously dropped with a reason; no requirement is UNKNOWN; the word LegalOS
appears in the repository only in history and in migration filenames.

---

## Parallelism and ownership

Phases 3, 4 and 5 overlap. Phases 6 and 7 overlap. Everything else is
sequential.

When phases run in parallel, the file ownership rules in `AGENTS.md` section 16
bind absolutely. The integrator-only surfaces stay in one serial session:
migrations, `payload.config.ts`, `Sites.ts`, the access helpers, the lead
pipeline orchestrator, the block schema and renderer pair, package files,
`scripts/release.sh`, and the operating pack itself.

Two agents never edit the same file. An agent that finds another agent's changes
in its path stops and reports the collision rather than resolving it.

---

## Stop conditions

Stop the affected work and record a blocker if:

- a test would need a live external endpoint or would spend money
- a migration cannot be made idempotent and restartable
- a rebrand rename would touch a live infrastructure name outside its phase
- a change to the builder would let the canvas preview and the public render
  diverge
- tenant scoping would have to be enforced in a component rather than at the
  data layer
- a credential would need to enter source, a fixture, a browser response or a
  chat message
- production would have to be touched before its phase, or before its gate

Continue every unaffected ready task.
