# PageFlo infrastructure

Version 1, 1 September 2026.

Two sections: **current**, which is what runs today and was measured, and
**target**, which is where PageFlo is going. They are deliberately separate so
neither gets mistaken for the other.

Moving from one to the other is phases 9 through 11 of
`docs/EXECUTION-PLAN.md`. **No part of that move happens outside those phases,
and every step of it is human-gated.**

---

# Current infrastructure

Measured on the host over SSH, read-only, 1 September 2026. PageFlo, still named
LegalOS, stays here for the whole redesign.

## The host

| | |
|---|---|
| IP | `51.81.202.161` |
| Hostname | `vps-3ae59fb7` |
| OS | Debian GNU/Linux 12 (bookworm) |
| Control panel | Plesk |
| Node | v22.23.2 |
| pnpm | 9.15.0 |
| Disk | 197G, 120G used, 70G free, 64% |
| SSH access from this repository | Host alias `legalos`, key `~/.ssh/legalos_deploy`. `ssh root@51.81.202.161` without the key fails; older documentation used that form. |

### The host is shared

This is the single most important fact about the current infrastructure. It is
not a dedicated PageFlo machine. Running alongside the application:

| Container | Image | Purpose |
|---|---|---|
| `buzz-prod-relay-1` | (local build) | Buzz production |
| `buzz-prod-postgres-1` | `postgres:17-alpine` | Buzz database |
| `buzz-prod-redis-1` | `redis:7-alpine` | Buzz cache |
| `buzz-prod-minio-1` | `minio/minio` | Buzz object storage |
| `hermes` | `nousresearch/hermes-agent` | Hermes |
| `buzz-hermes-bridge` | `hermes-bridge:dev` | Buzz to Hermes bridge |
| `meta-ad-library-scraper` | (local build) | Ad library scraper |
| `plesk-portainer` | `portainer/portainer-ce` | Container management |
| `molegenexcom-postgres-1` | `postgres:16-alpine` | **PageFlo database** |
| `molegenexcom-redis-1` | `redis:7-alpine` | **PageFlo Redis** |

Consequences that bind every agent:

- an action that restarts, reconfigures or resource-starves this machine affects
  other production systems, not only PageFlo
- disk, memory and CPU are shared. `legalos-dev.service` caps at
  `MemoryMax=6G`
- Plesk owns nginx and TLS for every domain on the box, including Buzz and
  Hermes
- infrastructure work here is a human gate. See `docs/HUMAN-GATES.md` gate 4

## Application runtime

| | |
|---|---|
| Path | `/var/www/vhosts/legenex.com/os.legenex.com` |
| Has `.git` | No. It is a Plesk deployment target. `git pull` there fails with "not a git repository". |
| Service | `legalos-dev.service`, systemd, `active` |
| Unit file | `/etc/systemd/system/legalos-dev.service` |
| ExecStart | `/bin/bash -lc "pnpm start"` |
| User | `root` |
| Limits | `MemoryHigh=4G`, `MemoryMax=6G`, `OOMPolicy=stop`, `Restart=always` |
| What it serves | The **production build**, from prebuilt `.next/`. There is no HMR and no auto-rebuild. |

The unit is named and described as a dev server. It is not one. The name is
historical and is load-bearing: renaming it is coordinated infrastructure work,
not a rename.

## Ingress and TLS

Internet, to Plesk nginx on 80 and 443, to `127.0.0.1:3000`.

Plesk terminates TLS for every domain. Tenant domains are added to Plesk through
its REST API when an operator connects a custom domain, which registers the
domain, sets reverse-proxy directives to `localhost:3000`, and issues a Let's
Encrypt certificate.

Plesk domains currently on the host:

```
buzz.legenex.com                 legenex.com
checkacase.com                   nexa.legenex.com
claimsmart.co                    os.legenex.com
emissionscompensationhelper.com  quiz.legenex.com
freecasehelp.com                 ruinyourlife.co
hermes.legenex.com               scraper.legenex.com
injurycompensationhelper.com
kordyn.ai
```

`os.legenex.com` is the PageFlo control plane. It deliberately has **no
`Domains` row**, which is why `/api/legalos/self-check` returns 404 for it and
why the release health gate points at `/api/legalos/health` instead. Pointing
the gate at `self-check` once made a successful release exit 1 and advised an
operator to reverse it.

`mo.legenex.com`, the hostname most historical documentation names, is **no
longer a Plesk domain**.

### Two certificate paths

Certificates are issued two ways and nothing records which domain belongs to
which:

1. **Plesk Let's Encrypt**, driven by the domain provisioning code
2. **`acme.sh`** under `/root/.acme.sh`, renewed by a root cron entry four times
   daily, currently holding `*.preview.legenex.com`, `crashclaim.co`,
   `getwhatyoureowed.co` and `test.checkmyclaim.co`

This ambiguity is an open blocker. Resolve it before phase 9.

## Data

| | |
|---|---|
| PostgreSQL | 16-alpine, Docker, `127.0.0.1:5432`, container `molegenexcom-postgres-1` |
| Redis | 7-alpine, Docker, `127.0.0.1:6379`, container `molegenexcom-redis-1` |
| Compose project | `molegenexcom` |
| Compose file | `/var/www/vhosts/legenex.com/mo.legenex.com/docker-compose.yml` |
| Database | `legalos`, role `legalos` |
| Migration state | 32 ledger rows: 31 applied migrations matching the committed chain exactly, plus one `dev` row at `batch = -1` |

**The database runs out of the old `mo.legenex.com` directory.** That directory
still exists and is load-bearing. The compose project name is baked into the
container names, and `scripts/release.sh` refers to `molegenexcom-postgres-1` by
name for its backup. This is legacy naming that is technically required. Do not
rename it outside a planned migration.

**Only `postgres` and `redis` from `docker-compose.yml` are used.** The `app`
service is not running and has not been for months. Documentation claiming
Docker is local-only was wrong.

Redis is used for exactly one thing: a health-check ping in
`src/lib/system-health/checks.ts`. `bullmq` is a declared dependency with no
worker.

### Backups

**There are no automated backups.** `/root/legalos-backups` contains only what
`scripts/release.sh` took during releases, newest 15 August 2026. No restore
drill has been performed. This is phase 9 work and is the single largest
operational risk in the current setup.

## Deployment

There is **no CI**. This repository has no `.github/` directory and no GitHub
Actions workflow.

```
push main
  -> GitHub webhook to Plesk Git extension
  -> Plesk --fetch: GitHub into the bare repo at
     /var/www/vhosts/legenex.com/git/legalos.git
  -> Plesk --deploy: bare repo checked out into the app directory
  -> scripts/release.sh, run by a human or by an agent with authorization
  -> live
```

`scripts/release.sh` does, in the only safe order: size-checked backup, fetch
and deploy, **stop the service**, install, importmap, build, **migrate while the
service is down**, `verify:schema`, start, HTTP health check. It prints the
exact rollback for the stage that failed.

The migrate-while-stopped ordering is not a preference. New code declares a
column; Payload's `SELECT` enumerates every column a collection declares; so a
service that starts before its migration throws at boot rather than degrading.

The exact command block is in `AGENTS.md` section 6. The narrative is in
`docs/release-runbook.md`.

## Scheduled work on the host

| Unit | Schedule | What it does |
|---|---|---|
| `legalos-keepalive.timer` | every 5 min | Runs `/usr/local/bin/legalos-warm.sh` to keep admin routes warm |
| `legalos-dev-restart.timer` | daily 04:00 UTC | Restarts `legalos-dev` to work around memory creep |
| `acme.sh` cron | 4x daily | Certificate renewal |

**Neither `legalos-*` timer is documented anywhere else, and
`legalos-warm.sh` is not in the repository.** That script exists only on the
server, sends `Host: mo.legenex.com` which no longer resolves to a Site, and its
comments describe a Next dev server that is not what runs. Bring it into version
control or retire it, in phase 9.

There is **no deploy cron**. `/var/log/legalos-deploy.log` does not exist. The
`deploy.sh`, `cron-deploy.sh` and `trigger-deploy.sh` mechanism older
documentation describes is genuinely dead.

## External dependencies

| Dependency | Used for | Failure mode |
|---|---|---|
| Anthropic API | All AI generation | Builder AI features fail; the app runs |
| Plesk REST API | Domain provisioning, health check | New custom domains cannot be connected |
| Let's Encrypt | TLS, via Plesk and `acme.sh` | Certificate renewal fails, eventually TLS errors |
| Meta CAPI | Server-side conversions | Conversions under-report |
| TrueCall | Call platform handoff | Handoff fails |
| TrustedForm | Consent certificate claim | Consent evidence incomplete |
| Jornaya | Lead verification | Verification skipped |
| Plivo | HLR phone enrichment | Enrichment skipped |
| `api.legenex.com/mva-tier-lookup` | MVA tier assignment | **Does not exist.** See EB-1 in `docs/external-blockers.md` |

## Environment

Production `.env` lives at
`/var/www/vhosts/legenex.com/os.legenex.com/.env`. It is gitignored and must
stay that way. Changing it is a human gate.

Keys present in production, names only:

```
DATABASE_URI  PAYLOAD_SECRET  NEXT_PUBLIC_SERVER_URL  LEGALOS_FALLBACK_HOST
SUPER_ADMIN_EMAIL  SUPER_ADMIN_PASSWORD  REDIS_URL  ANTHROPIC_API_KEY
PLESK_API_URL  PLESK_API_KEY  PLESK_PROXY_TARGET  PLESK_OWNER_LOGIN
PLESK_OWNER_EMAIL  PLESK_IP_ADDRESS  PLESK_INSECURE_SKIP_TLS_VERIFY
LEGALOS_PREVIEW_DOMAIN  LEGALOS_CNAME_TARGET  LEGALOS_A_TARGET
LEGALOS_DEV_SKIP_DNS  LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY
BUILDLOG_CAPTURE_EMAIL  BUILDLOG_CAPTURE_PASSWORD
```

`.env.example` documents the keys and is the only file permitted to hold
placeholders.

### One reader, two namespaces

`src/lib/pageflo/env.ts` is the only module that reads a configured value. Every
accessor tries the `PAGEFLO_*` name first and falls back to the `LEGALOS_*` one,
so a host whose `.env` has not been migrated keeps working unchanged and no call
site has to know two names exist. `pnpm test:rebrand` asserts that no
`process.env.LEGALOS_*` read exists anywhere else, because a second reader is a
split brain: after the operator sets the PageFlo name, half the code would see
the new value and half the old one, with nothing to signal it.

The PageFlo names the cutover adds:

| PageFlo name | Legacy name still accepted | What it decides |
|---|---|---|
| `PAGEFLO_SERVER_URL` | `NEXT_PUBLIC_SERVER_URL` | canonical console origin; CSRF, email links, absolute admin URLs |
| `PAGEFLO_MARKETING_HOST` | none, new | which host serves the product marketing site |
| `PAGEFLO_APP_HOST` | none, new | which host serves the console and authentication |
| `PAGEFLO_LEGACY_APP_HOSTS` | `LEGALOS_FALLBACK_HOST` | hosts that served the console before the rebrand |
| `PAGEFLO_LEGACY_HOST_REDIRECT` | none, new | when `true`, a legacy host 308s to the app host |
| `PAGEFLO_PREVIEW_DOMAIN` | `LEGALOS_PREVIEW_DOMAIN` | preview subdomain pattern |
| `PAGEFLO_CNAME_TARGET` | `LEGALOS_CNAME_TARGET` | what tenant CNAMEs point at |
| `PAGEFLO_A_TARGET` | `LEGALOS_A_TARGET` | A record for apex tenants |
| `PAGEFLO_EXTRA_ORIGINS` | `LEGALOS_EXTRA_ORIGINS` | additional CSRF origins |
| `PAGEFLO_IMAGE_HOSTS` | `LEGALOS_IMAGE_HOSTS` | hosts `/_next/image` may fetch |
| `PAGEFLO_ERROR_WEBHOOK_URL` | `LEGALOS_ERROR_WEBHOOK_URL` | where server errors are POSTed |
| `PAGEFLO_DEV_SKIP_DNS` | `LEGALOS_DEV_SKIP_DNS` | local-dev DNS bypass; false in production |
| `PAGEFLO_ENFORCE_DOMAIN_ELIGIBILITY` | `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY` | refuse a deployment onto an ineligible domain |
| `PAGEFLO_DISABLE_PROVISIONING` | `LEGALOS_DISABLE_PROVISIONING` | kill switch for Plesk vhost provisioning |
| `PAGEFLO_MIGRATION_DIR` | `LEGALOS_MIGRATION_DIR` | migration directory override, harnesses only |
| `PAGEFLO_GIT_SHA` / `_BUILD_NUMBER` / `_BUILD_TIME` | `LEGALOS_*` equivalents | build stamp shown in the version footer |
| `PAGEFLO_CHROMIUM_PATH` | `LEGALOS_CHROMIUM_PATH` | Chromium binary for the Playwright harnesses |

The CSRF allowlist is DERIVED from the host variables rather than typed twice:
`src/payload.config.ts` turns `PAGEFLO_APP_HOST`, `PAGEFLO_MARKETING_HOST` and
every legacy app host into https origins, with and without `www.`. A missing
CSRF origin is the worst failure mode in a domain cutover because it is
completely silent: Payload's cookie strategy returns `user = null` and every
server action fails as "unauthenticated" with nothing anywhere naming CSRF.

`PLESK_INSECURE_SKIP_TLS_VERIFY=true` is set in production because Plesk serves
its API on 8443 with a certificate that does not match the IP the app connects
to. Traffic stays on the host loopback. This is scoped to Plesk calls only and
must not spread.

## Compatibility identifiers

**These are deliberately not renamed. Renaming one breaks production, and the
break is not visible until a release fails or a third party stops receiving
leads.** `pnpm test:rebrand` asserts that each is still present, so a future
sweep cannot quietly "finish the job".

They fall into two groups. The first is live infrastructure, which cannot be
renamed by editing code at all; the second is wire identifiers that something
outside this deployment already depends on.

### Infrastructure

Every one of these is live infrastructure. None can be renamed by editing code.

| Name | Where it binds |
|---|---|
| `legalos-dev.service` | systemd unit, two timers reference it |
| `legalos` | PostgreSQL database and role |
| `molegenexcom` | Docker Compose project; container names derive from it |
| `/var/www/vhosts/legenex.com/mo.legenex.com` | Directory the database compose file lives in |
| `/var/www/vhosts/legenex.com/os.legenex.com` | Application directory, tied to the Plesk domain |
| `legalos.git` | Plesk Git repository name, used in the release command |
| `os.legenex.com` | Plesk domain, `NEXT_PUBLIC_SERVER_URL`, CSRF allowlist |
| `LEGALOS_*` | 26 environment variables, read across code and scripts |
| `/api/legalos/*` | Route namespace; the release health gate points into it |
| `.legalos-builder-canvas` | CSS scope paired with `html.site-shell` in `bespoke-css.ts` |
| `*.preview.legenex.com` | Wildcard DNS and certificate for every Site's preview domain |
| `legalos_deploy` | SSH key name and host alias |

### Wire identifiers

Renaming one of these is a breaking change to a consumer outside this deploy,
not a rebrand. Each is asserted present by `pnpm test:rebrand`, with the
consumer named.

| Identifier | Consumer that depends on it |
|---|---|
| `X-LegalOS-Event`, `X-LegalOS-Signature` | third-party webhook receivers already switching on and verifying these headers. The `X-PageFlo-*` pair is sent alongside so receivers can migrate on their own schedule. |
| `x-legalos-host`, `x-legalos-preview`, `x-legalos-preview-site` | stamped by middleware and read by the public page routes. `x-pageflo-*` is canonical and read first. |
| `/api/legalos/*` | `scripts/release.sh` health gate, the SSL poller probing tenant hosts that may still be serving an older build, cached copies of `q.js`, operator bookmarks. Every route is a re-export shim over `/api/pageflo/*`. |
| `app: "legalos"` | the marker `/api/pageflo/self-check` compares against to prove a host reached this application. Changing it makes every custom domain fail verification. |
| `.legalos-builder-canvas` | a CSS scope baked into page HTML saved before the rename. `bespoke-css.ts` dual-scopes it with `.pageflo-builder-canvas`. |
| `legalos:quiz-height`, `data-legalos-booted` | the postMessage protocol and guard attribute in copies of `q.js` already embedded on third-party pages. |
| `_legalos.<host>` | the DNS TXT record name tenants have already published to prove domain ownership. |
| `preview.legenex.com` | every issued preview host and its certificate. |

Phases 9 through 11 execute the infrastructure half, once the infrastructure
they name is being replaced anyway. The wire identifiers are retired one
consumer at a time, never as a sweep.

---

# Target infrastructure

Where PageFlo is going. **None of this is built. Nothing here describes
anything that runs today.**

## Architectural rules

These are not preferences.

1. **PageFlo gets its own dedicated VPS.** Not shared with Buzz, not shared with
   Hermes, not shared with scrapers.
2. **PageFlo never runs on the DashFlo VPS.** DashFlo stays on its own separate
   machine. PageFlo must never be designed around sharing DashFlo's production
   host, and no phase of this plan moves anything there. This is architectural,
   not a gate that can be approved.
3. **No dependency on a proprietary control panel.** Plesk is replaced by
   standard Linux infrastructure. Nothing in the application may assume a
   control panel exists.
4. **Everything that runs in production is in the repository.** No script that
   exists only on a server. No timer nobody wrote down.
5. **Backups are automated and their restore is proven**, before the cutover,
   not after.

## Target shape

| Layer | Target |
|---|---|
| Host | Dedicated VPS, standard Linux |
| Ingress | nginx, configuration version-controlled and validated with `nginx -t` before reload |
| TLS | Automated ACME issuance and renewal, one mechanism, not two |
| Application | Containers or systemd, chosen and justified in phase 9, deployed from the repository with no manual steps |
| Database | PostgreSQL, its own volume, automated encrypted backups with a proven restore |
| Cache and queue | Redis, doing real work: either the queue that phase 6 needs, or removed |
| Domain provisioning | A `DomainProvider` interface with an nginx plus ACME implementation; Plesk becomes one implementation among several, or is dropped |
| Deployment | CI that runs the gate on push and deploys on green, the way DashFlo does today |
| Observability | Health and readiness distinguishing process, database and backlog; alerting on anything that could lose, delay, misroute or misattribute a lead |

## The Plesk seam

The coupling is narrower than it looks, which is why phase 9 is feasible.

Plesk is reached from exactly two files:

- `src/lib/plesk/client.ts`
- `src/lib/plesk/provision-domain.ts`

Imported by exactly four:

- `src/app/(app)/admin/(top)/brands/domains/actions.ts`
- `src/app/(app)/admin/sites/[slug]/settings/domains/actions.ts`
- `src/lib/system-health/checks.ts`
- `src/lib/agent-plan/plan.ts`

Everything else that mentions Plesk mentions it in a comment, a health label, or
`src/lib/ssl-poll.ts`, which polls a real HTTPS handshake and does not care who
issued the certificate.

Phase 9 extracts a provider interface behind those two files and proves it with
a second, non-Plesk implementation. The application above that seam should not
change.

## What the move is not

- **Not a rewrite.** The application runs unchanged on the target; only what is
  underneath it changes.
- **Not a rebrand.** The load-bearing renames happen alongside the move because
  that is when they are cheap, not because the move requires them.
- **Not a big bang.** Phase 10 stands the new host up and runs it in parallel
  serving nothing. Phase 11 moves domains in tranches with a tested rollback at
  each step.
- **Not something an agent does unasked.** Phases 10 and 11 open human gates 2,
  3, 4 and 7. See `docs/HUMAN-GATES.md`.

## Open questions to resolve before phase 10

- containers or systemd on the target, and why
- one ACME mechanism, and which of the two current paths survives
- where backups go, and who can restore them
- whether Redis stays for a real queue or is removed
- what monitoring and alerting look like, given there is effectively none today
- whether the `legalos` database name is carried across or renamed during the
  restore, which is the cheapest moment it will ever be
