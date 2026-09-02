# PageFlo project state

Update this file after every completed or blocked task. It is the persistent
handoff between sessions and agents. It holds current factual state only.
Anything not measured is labelled as such.

Last updated: 1 September 2026, PageFlo rebrand and console redesign.

---

## Current control state

| | |
|---|---|
| Product name | PageFlo |
| Rebrand status | **User-facing rebrand complete.** Every screen, title, metadata string, email sender name, marketing surface and package identifier says PageFlo. A documented set of infrastructure and wire identifiers is deliberately unchanged; see "Compatibility identifiers" below. |
| Repository | `legenex/pageflo` on GitHub |
| Working and release branch | `main` |
| Canonical agent contract | `AGENTS.md`. `CLAUDE.md` is a short Claude Code entrypoint that defers to it. |
| Release mode | **Semi-autonomous.** Implement, validate, commit and push are pre-authorized. Running `scripts/release.sh` on production is not. See `AGENTS.md` section 4. |
| CI | **None.** No `.github/` directory, no GitHub Actions workflow. |
| Current phase | Phases 1 and 2 of `docs/EXECUTION-PLAN.md` complete in the repository. |
| Active human gates | Legal publication facts, see "Active blockers". |
| Active blockers | See "Active blockers" below. |

## Compatibility identifiers

**These are deliberately not renamed and must not be "cleaned up".** Each is
either live infrastructure that exists under that name on the host, or a wire
contract something outside this deployment already depends on. Every one is
listed with its consumer in `docs/INFRASTRUCTURE.md`, and `pnpm test:rebrand`
asserts each is still present.

Infrastructure: the `legalos` PostgreSQL database and role, the `legalos-dev`
systemd unit and its two timers, the `molegenexcom` Docker Compose project, the
`/var/www/vhosts/legenex.com/os.legenex.com` application directory, the
`legalos.git` Plesk bare repository, the `*.preview.legenex.com` wildcard and
its certificates, the `legalos_deploy` SSH key.

Wire contracts: `X-LegalOS-Event` and `X-LegalOS-Signature` on outbound
webhooks, the `x-legalos-*` request headers, the `/api/legalos/*` route
namespace (every route a re-export of `/api/pageflo/*`), the `app: "legalos"`
self-check marker, the `.legalos-builder-canvas` CSS scope, the
`legalos:quiz-height` postMessage protocol, and the `_legalos.<host>` DNS TXT
record name.

The `LEGALOS_*` environment variables are also still accepted, but only through
`src/lib/pageflo/env.ts`, which reads the `PAGEFLO_*` name first.

---

## Production truth, measured 1 September 2026

Everything in this section was measured on the host over SSH, read-only, on the
date above. The command that measured it is given so it can be re-run and
disagreed with.

### Host

| | |
|---|---|
| IP | `51.81.202.161` |
| Hostname | `vps-3ae59fb7` |
| OS | Debian GNU/Linux 12 (bookworm) |
| Control panel | Plesk |
| Node | v22.23.2 |
| pnpm | 9.15.0 |
| Disk | 197G total, 120G used, 70G available, 64% |

**This host is shared.** It also runs Buzz and Hermes in Docker
(`buzz-prod-relay-1`, `buzz-prod-postgres-1`, `buzz-prod-redis-1`,
`buzz-prod-minio-1`, `hermes`, `buzz-hermes-bridge`), plus
`meta-ad-library-scraper` and `plesk-portainer`. PageFlo does not have a machine
to itself. Anything that stops, restarts or resource-starves this host affects
other production systems.

### Application

| | |
|---|---|
| Application path | `/var/www/vhosts/legenex.com/os.legenex.com` |
| Has `.git` | No. It is a Plesk deployment target, not a clone. `git pull` there fails. |
| Bare repository | `/var/www/vhosts/legenex.com/git/legalos.git`, at `12ba129` |
| Service | `legalos-dev.service`, `active` |
| Unit file | `/etc/systemd/system/legalos-dev.service` |
| ExecStart | `/bin/bash -lc "pnpm start"`, User `root`, `MemoryMax=6G`, `Restart=always` |
| Serving | The production build from prebuilt `.next/`. No HMR. The unit's description says "dev server", which is misleading. |
| Last deploy | 15 August 2026, from `.next/` and `package.json` mtimes |
| Health | `http://127.0.0.1:3000/api/legalos/health` returns 200, `{"ok":true,"app":"legalos"}` |

### Data

| | |
|---|---|
| PostgreSQL | 16-alpine, Docker container `molegenexcom-postgres-1`, bound `127.0.0.1:5432` |
| Redis | 7-alpine, Docker container `molegenexcom-redis-1`, bound `127.0.0.1:6379` |
| Compose project | `molegenexcom`, from `/var/www/vhosts/legenex.com/mo.legenex.com/docker-compose.yml` |
| Migration ledger | 32 rows: 31 applied migrations matching the committed chain exactly, plus one `dev` row at `batch = -1` |
| Latest batch | 21, `20260814_160000_lp_deployment_publish_state` |
| Automated backups | **None.** `/root/legalos-backups` holds only the backups `scripts/release.sh` took, newest 15 August 2026. |

**The database and Redis run out of the old `mo.legenex.com` directory.** That
directory still exists on the host and is load-bearing. The compose project name
`molegenexcom` is baked into the running container names, and
`scripts/release.sh` refers to `molegenexcom-postgres-1` by name for its backup.
This is legacy naming that is technically required. Do not rename it outside a
deliberate, planned migration.

**Only the `postgres` and `redis` services of `docker-compose.yml` are used.**
The `app` service is not running and has not been for a long time. Project
documentation that said Docker is only used locally was wrong.

### Public surfaces, all returning 200

`https://os.legenex.com` is the control plane and deliberately has no `Domains`
row, so `/api/legalos/self-check` returns 404 for it. That is correct, and it is
why the release health gate points at `/api/legalos/health` instead.

### PageFlo hosts

One application serves four kinds of host, classified by
`src/lib/pageflo/hosts.ts` **before** any `Domains` lookup so a tenant row can
never claim one of PageFlo's own:

| Host | Role | Behaviour |
|---|---|---|
| `pageflo.io` | marketing | the public product site |
| `www.pageflo.io` | marketing | 308 to the apex |
| `app.pageflo.io` | app | the console and authentication; `/` redirects to `/admin` |
| `os.legenex.com` | legacy-app | unchanged, and the rollback path, until `PAGEFLO_LEGACY_HOST_REDIRECT=true` |
| a customer domain | tenant | resolved against `Domains` exactly as before |

An unresolvable host now **404s**. It used to render the product marketing page,
which advertised the product on every misconfigured or hostile `Host:` header
and disagreed with `robots.txt`, which already answered `Disallow: /` for the
same request.

Plesk domains on the host:

```
buzz.legenex.com          hermes.legenex.com        os.legenex.com
checkacase.com            injurycompensationhelper.com   quiz.legenex.com
claimsmart.co             kordyn.ai                 ruinyourlife.co
emissionscompensationhelper.com   legenex.com       scraper.legenex.com
freecasehelp.com          nexa.legenex.com
```

Verified responding: `os.legenex.com`, `checkacase.com`, `claimsmart.co`,
`quiz.legenex.com`.

`mo.legenex.com`, the old admin hostname that most historical documentation
names, **is no longer a Plesk domain**.

### Certificates

Plesk issues Let's Encrypt certificates for tenant domains through its REST API.
There is also a parallel `acme.sh` installation under `/root/.acme.sh` holding
`*.preview.legenex.com`, `crashclaim.co`, `getwhatyoureowed.co` and
`test.checkmyclaim.co`, renewed by a root cron entry four times daily. Two cert
paths exist and nothing documents which domain belongs to which.

### Undocumented scheduled work on the host

Neither of these is in the repository. Both were found by inspecting systemd
timers.

- `legalos-keepalive.timer`, every 5 minutes, runs `/usr/local/bin/legalos-warm.sh`
  to keep admin routes warm. That script exists only on the server, is not
  version-controlled, sends `Host: mo.legenex.com` (a host that no longer
  resolves to a Site), and its comments describe a Next dev server that is not
  what runs.
- `legalos-dev-restart.timer`, daily at 04:00 UTC, restarts `legalos-dev` to
  work around memory creep. This is why service uptime never exceeds 24 hours.

There is **no deploy cron**. `/var/log/legalos-deploy.log` does not exist. The
`scripts/deploy.sh`, `scripts/cron-deploy.sh` and `scripts/trigger-deploy.sh`
mechanism that older documentation describes is genuinely dead.

---

## Deployment method

Push to `main`, then Plesk fetch and deploy, then `scripts/release.sh` on the
host. The webhook normally performs the fetch and deploy on push; the two
`plesk` commands are the manual path when it has not fired.

```
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

`scripts/release.sh` does, in the only safe order: size-checked backup, fetch
and deploy, stop the service, install, importmap, build, migrate while the
service is down, `verify:schema`, start, HTTP health check. It prints the exact
rollback for whichever step failed. `--dry-run` prints the plan and touches
nothing.

Rollback is `git revert && git push`, then the block again.

Full narrative in `docs/release-runbook.md`, gate reasoning in `AGENTS.md`
section 6.

---

## Database model

PostgreSQL 16 through `@payloadcms/db-postgres` 3.83.0. 25 collections and 1
global, confirmed by `pnpm verify:schema`.

Everything is scoped to a `Site`, which is the tenant root. `Users.siteBindings[]`
assigns users to Sites with role `admin`, `editor` or `analyst`;
`super_admin: true` bypasses scoping.

Collections, by scoping:

- **Required `site`**: `Pages`, `LandingPages`, `Quizzes`, `BlogPosts`, `Leads`,
  `Numbers`, `TrackingConfigs`
- **Nullable `site`**: `Domains`, `Media`, `FunnelAdvertorialDeployments`,
  `FunnelLpDeployments`, `FunnelQuizDeployments`
- **No `site`**: `Users`, `SharedLegalTemplates`, `FunnelQuizTemplates`,
  `FunnelAdvertorials`, `FunnelLandingPages`, `FunnelQuizzes`
- **Optional `site`**: `AuditLog`, `BuildLogComments`
- **Global**: `IntegrationConfig`, super-admin only

Migrations are hand-written and idempotent. They are not auto-applied;
`scripts/release.sh` applies them between the build and the start, which is the
only safe order. Details in `docs/ARCHITECTURE.md`.

---

## Infrastructure dependencies

- Plesk, for nginx reverse proxy, TLS termination and tenant domain provisioning
- PostgreSQL 16 in Docker
- Redis 7 in Docker, currently only a health-check ping
- systemd, for the application service and two undocumented timers
- Let's Encrypt, through both Plesk and a separate `acme.sh`
- Anthropic API, for all AI generation
- Meta CAPI, TrueCall, TrustedForm, Jornaya, and an HLR provider (Plivo), for
  the lead pipeline
- Playwright with a Chromium binary, server-side, for screenshot and fidelity
  harnesses

Current and target infrastructure are documented in `docs/INFRASTRUCTURE.md`.

---

## Known major functional systems

Live and exercised by tests. See `docs/REQUIREMENTS.md` for the full status
breakdown.

- Multi-tenant Site model with per-Site access scoping and cascade delete
- Host-to-Site public routing with preview bypass, path resolution and slug
  redirects
- Block-based page builder with AI clone, HTML import, AI rewrite and page lint
- Brandless funnel authoring (advertorials, landing pages, quizzes) with
  per-brand deployment binding
- Quiz engine with tiers, conditional branching and derived-graph validation
- Twenty selectable quiz visual templates as manageable records
- Brand identity and brand-kit resolution with contrast-safe color derivation
- Custom domain provisioning through Plesk, with real-handshake SSL polling
- Synchronous lead capture pipeline with attribution, shared `event_id`,
  consent capture, HLR enrichment, CAPI, webhooks and Slack notify
- Shared legal template library with per-Site variable substitution and
  overrides
- Audit log across nearly all collections
- Release tooling with backup, correct migrate ordering, schema verification and
  health gate

---

## Known unfinished areas

- **`/admin/analytics` and `/admin/integrity` are unbuilt**, and say so. Both
  render a "coming soon" surface naming exactly what they are waiting on.
  Neither shows fabricated data. Analytics is waiting on an aggregation layer;
  the lead data it would report on is already captured in full. Campaign
  Integrity has no code and no agreed review model.
- **Per-Site user management requires workspace ownership.** Role bindings are
  real and enforced, but only a super admin can edit them, so a Site admin
  cannot add an editor to their own brand.
- **Site-wide SEO defaults do not exist.** Per-page SEO does, and is what a
  crawler actually reads.
- **54 files carry `// @ts-nocheck`**, about 24,000 of roughly 100,000 lines of
  `src/`. The original reason, missing `funnel-*` slugs in the generated types,
  no longer holds: `src/payload-types.ts` now contains all seven. The silencing
  is stale, and typecheck coverage is correspondingly weaker than a green run
  suggests.
- **Funnel collections are not wired into per-Site scoping.** Their access is
  plain `isAuthenticated`, not the `siteScoped*` helpers used everywhere else.
- **No queue.** `bullmq` is a declared dependency with no worker. The lead
  pipeline runs synchronously inside the request.
- **No ESLint config.** `pnpm lint` prompts interactively and exits 1.
- **No CI.** Nothing runs the validation matrix except a person or an agent.
- **No automated database backups.** Only what `scripts/release.sh` takes during
  a release.
- **Campaign Integrity does not exist.** It is a product concept with no code.
- 50 confirmed findings in `docs/audit-2026-06-04.md` remain the standing
  static-analysis backlog, tracked on `/admin/plan`.

---

## Validation capability, measured 1 September 2026

Measured in this codespace, which has `node_modules`, a working `.env` pointed
at localhost, a generated `src/payload-types.ts`, and PostgreSQL 16 plus
Redis 7 in local Docker.

| Command | Result |
|---|---|
| `pnpm typecheck` | PASS, exit 0, zero errors |
| `pnpm build` | PASS, exit 0, full route table emitted |
| `pnpm test` (17 suites) | PASS, exit 0 |
| `pnpm test:rebrand` | PASS, 38 assertions |
| `pnpm test:isolation` | PASS, 49 assertions |
| `pnpm test:identity` | PASS, 33 assertions |
| `pnpm test:release` | PASS, 31 assertions, on its own scratch database |
| `pnpm test:e2e` | PASS, 34 assertions, Chromium via Playwright |
| `pnpm check:paths` | PASS, 9 deployments, 0 unresolvable |
| `pnpm verify:schema` | PASS, 25 collections and 1 global read cleanly |
| `pnpm lint:tokens` | PASS |
| `pnpm check:buildlog` | PASS |
| `pnpm check:handbook` | PASS, 21 routes documented, 32 screens, 0 missing |
| `pnpm lint` | **NOT A CHECK.** No ESLint config; prompts interactively, exits 1. |

Not run this session: `pnpm test:bootstrap`, which needs its own empty
migration-only database provisioned first.

**Earlier project documentation said this codespace could not build.** That was
true when it was written and is not true now. Do not repeat it.

---

## Human-gated work

Nothing is currently waiting on a gate. The standing gates are in
`docs/HUMAN-GATES.md` and cover credentials, production secret mutation,
destructive production database work, consequential data imports, irreversible
migrations, DNS changes, infrastructure migration, host replacement, destructive
rollback, live external lead-delivery activation, meaningful financial spend,
and deleting resources.

The work that will reach a gate soonest is phase 10, the dedicated PageFlo VPS,
and phase 11, the production cutover.

---

## Active blockers

- **Legal publication facts are not configured.** `/privacy` fails closed and
  its footer link is absent until `PAGEFLO_LEGAL_ENTITY`,
  `PAGEFLO_LEGAL_ADDRESS`, `PAGEFLO_PRIVACY_CONTACT`,
  `PAGEFLO_LEGAL_JURISDICTION`, `PAGEFLO_SUBPROCESSORS`,
  `PAGEFLO_DATA_RETENTION` and `PAGEFLO_LEGAL_LAST_UPDATED` are set. This is a
  business decision, not a code task: a privacy policy makes binding statements
  about a real legal entity and none of those facts is derivable from this
  repository. `/admin/system` lists which are missing. There is deliberately no
  `/terms` route at all, because liability, warranty, payment and governing law
  are a contract rather than a description of the software.
- **EB-1, MVA qualification tier service does not exist.** The seeded MVA tiered
  quiz calls `https://api.legenex.com/mva-tier-lookup`. The contract is pinned by
  the node and asserted in `scripts/test-quiz-webhook.mts`, but the rule that
  turns a state and a date into a tier is not in this repository, any migration,
  any seed, or the Base44 account. Blocks tiers 1, 2 and 4 of the shipped MVA
  flow. Full detail and the remaining external blockers are in
  `docs/external-blockers.md`.
- **Certificate ownership is ambiguous.** Two issuance paths exist on the host,
  Plesk and a separate `acme.sh`, and nothing records which domain belongs to
  which. Resolve before phase 9.
- **`legalos-warm.sh` is unversioned.** A production timer runs a script that
  exists only on the server and references a dead hostname. Bring it into the
  repository or retire it, in phase 9.

---

## Next major milestone

The production domain cutover: `pageflo.io`, `www.pageflo.io` and
`app.pageflo.io` as Plesk domains on the existing host, reverse-proxied to the
same application, with certificates issued and the three `PAGEFLO_*` host
variables set in the production `.env`.

`os.legenex.com` stays exactly as it is until the new hosts are verified end to
end. `PAGEFLO_LEGACY_HOST_REDIRECT` is the last switch to flip, because setting
it to `true` is what removes the rollback path.

Changing the production `.env`, adding Plesk domains and any DNS change are all
human gates. See `docs/HUMAN-GATES.md`.

---

## Change log

### 1 September 2026, PageFlo rebrand and console redesign

The user-facing rebrand and the console redesign, in the repository. No
production change is part of this entry.

**Naming.** Every screen, page title, metadata string, email sender default,
marketing surface and package identifier says PageFlo, and reads it from
`src/lib/pageflo/product.ts` rather than repeating a literal. The infrastructure
and wire identifiers listed under "Compatibility identifiers" above are
deliberately unchanged; `pnpm test:rebrand` asserts each is still present, and
also that no `process.env.LEGALOS_*` read exists outside
`src/lib/pageflo/env.ts`. Twenty-five such reads did exist, which would have
split the configuration in half the moment an operator set a `PAGEFLO_*` name.

**Hosts.** `src/lib/pageflo/hosts.ts` classifies a host as marketing, app,
legacy-app or tenant, and every public surface asks it before any `Domains`
lookup. `src/payload.config.ts` now DERIVES the CSRF allowlist from the same
host variables rather than reading one differently-shaped variable, because a
missing CSRF origin fails silently: Payload returns `user = null` and every
server action reports "unauthenticated" with nothing naming CSRF.

**Console.** The design tokens, the sidebar, Overview and Leads landed in
`344526c` and the preceding working tree. This change completes the rest:
sign-in, Sites, Domains, Settings and its index, System health (two
byte-identical pages became one component), Profile, Agent Plan, Build Log,
Handbook, and the Site workspace. `src/components/pageflo/primitives.tsx` and
`interactive.tsx` are the shared vocabulary. The builder screens moved to the
console palette by re-pointing 23 values in `src/components/builder/ui.tsx`
rather than editing 1,797 call sites.

**Things that were not true, now fixed.** The Site Danger Zone had three
disabled buttons and told the operator that leads survive a Site delete, when
`cascadeDeleteSiteChildren` removes them. The Site dashboard reported a
hardcoded zero for active funnels and an empty funnels panel that never ran a
query. Its 30-day leads tile was labelled "excl. test" and did not exclude test
captures. The sidebar linked to `/admin/integrity`, which did not exist. Five
`window.confirm` dialogs became one owned component with a focus trap and
type-to-confirm.

**Schema.** One migration, `20260901_233000_sites_vertical_general`, widens
`enum_sites_vertical` with nine general values so a Site is not required to be a
legal practice area. Additive: no existing value is removed and no row is
rewritten. `pnpm test:release` exercises it up, down and re-applied.

**Validation.** `pnpm typecheck`, `pnpm test` (17 suites), `pnpm build`,
`pnpm verify:schema`, `pnpm test:release`, `pnpm test:isolation`,
`pnpm test:identity`, `pnpm check:paths`, `pnpm lint:tokens`,
`pnpm check:buildlog` and `pnpm check:handbook` all pass. `check:handbook` now
also walks every sidebar destination, which is what catches a nav entry that
404s.

### 1 September 2026, Phase 0: repository and operating cleanup

Established the PageFlo operating pack and corrected the repository's record of
its own state. No application code changed.

Created: `AGENTS.md`, `docs/STATE.md`, `docs/PRODUCT-BRIEF.md`,
`docs/REQUIREMENTS.md`, `docs/EXECUTION-PLAN.md`, `docs/HUMAN-GATES.md`,
`docs/INFRASTRUCTURE.md`, `docs/ARCHITECTURE.md`.

Rewritten: `CLAUDE.md`, from a 297-line operating manual to a short Claude Code
entrypoint deferring to `AGENTS.md`. `README.md`, which described a deployment
model retired months ago.

Corrections to previously documented facts, each measured:

- The codespace **can** build. `typecheck`, `build` and the full test matrix all
  pass here.
- `@ts-nocheck` covers **54** files, not the 25 previously documented, and its
  stated cause no longer holds.
- Docker is used **in production**, for PostgreSQL and Redis, out of the old
  `mo.legenex.com` directory under compose project `molegenexcom`. Documentation
  saying Docker was local-only was wrong.
- `mo.legenex.com` is no longer a Plesk domain, yet it remained in `README.md`,
  `docs/DEPLOY.md`, `ONBOARDING.md`, `.env.example` and a live production
  script.
- Two production systemd timers exist that no document mentioned.
- There are no automated database backups.
- `ssh root@51.81.202.161` as documented does not authenticate; the working form
  is the `legalos` host alias.

Superseded documents were given a header banner rather than deleted, because
several still hold the only written record of why a decision was made. See
`docs/DEPLOY.md`, `ONBOARDING.md`.
