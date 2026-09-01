# PageFlo

Vertical-agnostic dynamic acquisition infrastructure. One codebase, one admin,
many public-facing brand sites.

> **Naming.** The product is being renamed from **LegalOS** to **PageFlo**. The
> code, the database, the systemd service and the user interface still say
> LegalOS, and several of those names are load-bearing production
> infrastructure. See `docs/EXECUTION-PLAN.md` phase 1.

## Read these first

| Document | What it is |
|---|---|
| **`AGENTS.md`** | **The canonical operating contract.** Every agent, model and harness reads it before doing any work. |
| `CLAUDE.md` | Short Claude Code entrypoint. Defers to `AGENTS.md`. |
| `docs/STATE.md` | Persistent handoff. Current factual state, measured. |
| `docs/ARCHITECTURE.md` | How the application is built and why. |
| `docs/PRODUCT-BRIEF.md` | What PageFlo is for. |
| `docs/REQUIREMENTS.md` | What is LIVE, PARTIAL, PLANNED or UNKNOWN. |
| `docs/EXECUTION-PLAN.md` | Phases 0 to 12, LegalOS to PageFlo. |
| `docs/HUMAN-GATES.md` | What needs approval, and what explicitly does not. |
| `docs/INFRASTRUCTURE.md` | Current infrastructure and target infrastructure. |
| `docs/release-runbook.md` | Releasing, and why the order is what it is. |

There is one source of operating truth: `AGENTS.md`. If another document
disagrees with it, `AGENTS.md` wins and the other document is wrong.

## Stack

- Payload CMS 3.83 on Next.js 15.4, App Router, React 19
- PostgreSQL 16, Redis 7
- Anthropic SDK, wrapped by `src/lib/ai/invoke.ts`
- TypeScript 5.7, Tailwind CSS 4
- `pnpm@9.15.0`, Node `>=20.9`

Served in production by the `legalos-dev` systemd unit running `next start`
against a prebuilt `.next/`, behind Plesk's nginx. Not Docker: only the
`postgres` and `redis` services of `docker-compose.yml` are used, and those run
in production too.

## Local development

```bash
cp .env.example .env
# fill in DATABASE_URI, PAYLOAD_SECRET, SUPER_ADMIN_EMAIL/PASSWORD, ANTHROPIC_API_KEY

docker compose up -d postgres redis   # Postgres + Redis only
pnpm install
pnpm payload migrate                  # apply the committed chain
pnpm generate:types                   # src/payload-types.ts is gitignored and required
pnpm dev
```

- Admin: http://localhost:3000/admin
- Raw Payload admin: http://localhost:3000/cms
- Marketing fallback: http://localhost:3000

Preview a Site without DNS by appending `?site=<slug>` to any URL. Add
`?preview=1`, while authenticated, to render drafts and scheduled content.

`pnpm seed` seeds the shared legal templates and placeholder Sites.
`LEGALOS_DEV_SKIP_DNS=true` reveals a Skip DNS button in the Connect Domain
modal. It must be `false` in production.

## Validation

There is no unit-test framework. There is a suite of standalone assertion
harnesses under `scripts/`, plus `tsc`.

```bash
pnpm typecheck        # tsc --noEmit
pnpm test             # 16 assertion suites, the main gate
pnpm build            # proves the production bundle compiles
pnpm verify:schema    # reads every collection and global, as a boot would
pnpm test:release     # migration order, up/down, idempotency, on a scratch DB
pnpm test:all         # pnpm test plus isolation, identity, fresh bootstrap
```

Two things to know:

- **`pnpm lint` is not a check.** `next lint` has no committed ESLint config. It
  prompts interactively and exits 1. Configuring it is phase 8 work.
- **`pnpm typecheck` passing is weaker than it looks.** 54 files carry
  `// @ts-nocheck`, about 24,000 of roughly 100,000 lines of `src/`. Removing
  them is phase 5 work.

`next build` does not type-check: `next.config.mjs` sets
`typescript.ignoreBuildErrors` deliberately, because the ported builder code
fails it. Run both.

## Shipping a change

Push to `main`, then release on the server. **A push alone changes nothing.**
There is no CI, and the running service serves a prebuilt `.next/`.

```bash
git add -A && git commit -m "what changed" && git push
```

Then, on the server:

```
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

`scripts/release.sh` does the rest in the only safe order: size-checked backup,
stop, install, importmap, build, **migrate while the service is down**,
`verify:schema`, start, health check. It prints the exact rollback for whichever
step failed. `--dry-run` prints the plan and touches nothing.

Both `plesk` lines are needed, in that order. `--deploy` alone redeploys
whatever was last fetched, which looks exactly like a successful deploy of
nothing.

Rollback: `git revert && git push`, then run the block again.

Details and reasoning: `docs/release-runbook.md` and `AGENTS.md` section 6.

## Architecture at a glance

```
Internet -> os.legenex.com / tenant-domain.com
   |
Plesk nginx (TLS termination, ports 80/443)
   | reverse proxy
127.0.0.1:3000 (Next.js, systemd unit legalos-dev)
   |- /admin/*        Custom branded dashboard
   |- /cms/*          Raw Payload admin
   |- /api/*          Payload REST + GraphQL
   |- /api/legalos/*  Health, dns-check, self-check, quiz-ai, agent-plan, ...
   |- /api/leads      Public lead capture
   `- /*              Public router, host-routed
        |- Host -> Domain -> Site
        |- Apply the Site's brand tokens
        |- Path -> Page / LandingPage / BlogPost
        |- Fall back to a SharedLegalTemplate for known legal slugs
        `- Fall back to the marketing component if no Site matches
```

Full detail in `docs/ARCHITECTURE.md`.

## Superseded documents

Kept because they hold the only written record of why some decisions were made.
Do not follow their instructions.

- `docs/DEPLOY.md` describes the retired Docker Compose plus cron deploy model
  and the dead `mo.legenex.com` host.
- `ONBOARDING.md` describes a live-server-editing workflow that contradicts
  `AGENTS.md`.
- `scripts/deploy.sh`, `scripts/cron-deploy.sh`, `scripts/trigger-deploy.sh` and
  `scripts/first-time-setup.sh` are historical reference. Nothing runs them.
