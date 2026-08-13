# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⭐ ENGINEERING STANDARD: exceptional, complete, best-of-the-best — always

**The owner's standing bar for this codebase: exceptional and as close to perfect as possible. No half-working systems. No "good enough." Every shipped feature is a fully functioning, well-built, complete path — the best of the best.**

What this means in practice, on every task:

- **Complete, not partial.** Finish the whole path: schema → migration → server action → renderer → builder UI → public render → edge cases. No stubs, no TODOs left in shipped code, no "wire this up later" in a feature that's meant to work now. (See the existing "No placeholders in any working config" rule — this generalizes it to all code.)
- **Correct first, then polished.** Verify behavior, not just compile. Where the local codespace can't build, reason it through and verify on the server; never ship on hope. Handle the failure modes (empty/missing data, hostile input, light/dark, mobile, multi-tenant scoping).
- **Robust over clever.** Make wrong states structurally impossible where you can (e.g. derive-and-verify rather than assume). Prefer designs where the bad outcome can't happen over designs that merely avoid it today.
- **Detail-oriented.** Match surrounding style, name things well, leave the code clearer than you found it. Accuracy and thoroughness over speed.
- **Earn the bar with rigor, not vibes.** For substantive work, design it properly (independent approaches, adversarial review, verification against real/adversarial inputs) before declaring done. Surface what's not covered instead of letting it read as finished.
- **Report faithfully.** If something is incomplete, say so plainly with what's left. "Done" means built, verified, and complete.

This is a durable preference — apply it without being re-asked.

### Operate as a senior engineer + QA — not a rookie

The bar above is the *what*; this is the *how*. On every task, work like a senior software engineer who is also the quality gate:

- **QA mindset up front.** Enumerate failure modes and edge cases before shipping — null/empty/missing data, hostile input, boundary conditions, light/dark, mobile, multi-tenant scoping — and defend against them in code. Anticipate breakage at integration points.
- **Root cause, never a workaround.** Fix the actual problem. No quick patch that leaves the real bug (e.g. fix the ACME ordering, don't paper over a wrong cert). Don't ignore tech debt or architectural issues you surface.
- **Verify behavior, not just compile.** Test critical paths against real and adversarial inputs (standalone harnesses where the codespace can't build). State plainly what's verified vs. not.
- **Architecture + trade-offs.** Explain *why*, not just *how*; offer alternatives; challenge a requirement when a better solution exists rather than implementing it blindly.
- **Production-grade by default.** Proper error handling and graceful degradation on every path. SOLID/DRY. Self-documenting code; comment the *why*, not the *what*. Readability first, performance second unless performance is critical.
- **Right-size.** Never under-engineer; avoid over-engineering. Be concise but thorough.
- **Follow explicit instructions exactly.** When the owner says do X, do X — don't ship a softer substitute (e.g. "remove the TXT record" means remove it, not relabel it "optional").

---

## ⛔ READ-THIS-FIRST: Every push needs a manual server deploy

**The user has explicitly asked to be reminded every single time.** Whenever you `git push` changes that touch `src/`, `package.json`, `next.config.mjs`, `tailwind.config.*`, `payload.config.ts`, `src/migrations/`, or anything that ends up in `.next/`, the **last block of your reply MUST be the SSH deploy commands** the user copy-pastes — starting with the Plesk fetch and ending with `systemctl status`. The change is NOT live without it. Don't say "deploy to see it" without the block. Don't shorten the block. Don't omit it even if the previous reply already showed it. See the "MANDATORY" section below for the exact commands.

---

## CRITICAL: Standard workflow — edit local, push, webhook deploys

**The flow is:** edit files in this local repo → `git commit && git push` → GitHub webhook fires → Plesk pulls into `/var/www/vhosts/legenex.com/os.legenex.com/` on `root@51.81.202.161` → **you must run `pnpm build && systemctl restart legalos-dev` on the server** → change is live at `https://os.legenex.com` once the build finishes.

The `legalos-dev` systemd unit runs the **production build** (`pnpm start` against prebuilt `.next/`), not `pnpm dev`. There is no HMR. A Plesk deploy alone will not change what users see — the prebuilt `.next/` output has to be regenerated and the service restarted.

There is no Docker rebuild. There is no `scripts/deploy.sh` step (the file is retained as historical reference only).

### Rules

- **ALWAYS edit files in this local clone.** Never SSH-edit server source files — they'll be overwritten on the next deploy.
- **ALWAYS commit + push to deploy.** That's the only mechanism that ships changes to the server.
- **EVERY src/ change requires `pnpm build && systemctl restart legalos-dev` on the server after the push.** The webhook only pulls; it does not rebuild. Without the rebuild + restart, users keep seeing the old prebuilt output.
- **SSH is used for the rebuild + restart, logs, and service state.** Use SSH for builds (`pnpm build`), restarts (`systemctl restart legalos-dev`), logs (`journalctl -u legalos-dev`), and one-off Plesk admin work. Never edit `src/` there.
- **NEVER suggest `docker compose up app` or `bash scripts/deploy.sh`.** The Docker app container is stopped; the production flow is Plesk fetch + deploy → `pnpm build` → restart.

### Standard operations

```bash
# Make a change — edit locally, then:
git add -A && git commit -m "what changed" && git push

# Tail the server's output to confirm the new build is up (after the user deploys)
ssh root@51.81.202.161 'journalctl -u legalos-dev -n 30 --no-pager -f'

# Read server-side state (logs / service / db)
ssh root@51.81.202.161 'systemctl status legalos-dev --no-pager'
```

### 🚨 MANDATORY: every reply that pushes src/ MUST end with the deploy block

After **any** `git push` you make that touches `src/`, `package.json`, `next.config.mjs`, `tailwind.config.*`, `payload.config.ts`, `src/migrations/`, or anything compiled into `.next/`, the **final block of your reply** must be the exact SSH commands below so the user can copy-paste them. This applies *every* time, even for a one-line fix, even if the previous reply already showed them, and even if you just want to say "deploy this and see if it works." The user has explicitly and repeatedly asked for this rule and gets stuck on the server without it.

**Do not summarize.** Paste the exact 8-line block. **Do not say "run pnpm build" instead** — `pnpm build` alone is not enough; the Plesk fetch and deploy must come first to bring your commits into the app directory, and `systemctl stop` must come before `pnpm build` to free `.next/` from the running process.

```
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

`scripts/release.sh` does the rest **in the only order that works**: stop,
install, importmap, build, **`pnpm payload migrate` while the service is down**,
**`pnpm verify:schema`**, start, health-check. It takes a size-checked database
backup first and prints the exact rollback for whichever step failed. The two
`plesk` lines are above it because the script cannot bring in the code it is
about to release; run it with no arguments after them. `--dry-run` prints the
plan and touches nothing. See `docs/release-runbook.md`.

**The old block started the service and left `pnpm payload migrate` as a
separate step you had to remember.** That order cannot work: new code declares a
column, the service boots before the migration creates it, and Payload's SELECT
enumerates every declared column — so the process throws at boot rather than
degrading. The last release hit that on `funnel_lp_deployments.quiz_id` and was
recovered by hand-transcribing migration SQL into psql.

**`git pull` does not work here and never did.** The app directory is a Plesk
*deployment target*, not a clone - it has no `.git`, so `git pull` exits with
"not a git repository". The repository is bare at
`/var/www/vhosts/legenex.com/git/legalos.git`, and Plesk moves code in two
distinct steps that are easy to confuse:

* `--fetch` pulls GitHub into the bare repo.
* `--deploy` checks the bare repo out into the app directory.

Running `--deploy` alone redeploys whatever was last fetched, which looks like a
successful deploy of nothing. The webhook normally performs both on push; these
commands are the manual path when it has not fired yet or you need it now.

What each step does (most are fast no-ops if nothing changed):
- `plesk ext git --fetch` — pull GitHub into the bare repo.
- `plesk ext git --deploy` — check the bare repo out into the app directory. Both are needed: `--deploy` on its own redeploys whatever was last fetched.
- `scripts/release.sh` — backup (size-checked: the system `pg_dump` is v15 against a v16 server and writes a 20-byte file with exit 0), stop, `pnpm install --frozen-lockfile`, `pnpm generate:importmap`, `pnpm build` (~60–90s, the slow step), **`pnpm payload migrate`**, **`pnpm verify:schema`**, start, and an HTTP health check. It ends with `active (running)` or it fails loudly and tells you how to roll back.

Then have the user hard-refresh: **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac).

The change is **not** live until this block has run. Never tell the user "it's live in ~10 seconds" — give them this block.

### Things that require an extra step after the push

All `src/` changes require the rebuild + restart from "Standard operations" above. The table below covers cases that need *additional* steps on top of that.

| What changed | Run on the server (in addition to the standard rebuild + restart) |
|---|---|
| Added a package (`pnpm add ...`) | `pnpm install` before `pnpm build` |
| Edited `.env` | `.env` is gitignored — edit it on the server (`ssh root@51.81.202.161 nano /var/www/vhosts/legenex.com/os.legenex.com/.env`) then rebuild + restart |
| Created a Payload migration | nothing extra — `scripts/release.sh` migrates between the build and the start, which is the only safe order |
| Edited `next.config.mjs` | (covered by the standard rebuild + restart) |
| Service stuck / weird state | `ssh root@51.81.202.161 systemctl restart legalos-dev` on its own |

---

## Stack

Payload CMS 3 on Next.js 15 (App Router, React 19), PostgreSQL 16, Redis 7, Anthropic SDK. Served in production by the `legalos-dev` systemd unit (`next start` against a prebuilt `.next/`) on a Plesk host — **not** Docker (the `app` service in `docker-compose.yml` is retained but stopped; only `postgres`/`redis` are used locally). See "Deploy model". Package manager is `pnpm@9.15.0`, Node `>=20.9`.

## Common commands

```bash
pnpm dev                                  # dev server on :3000 (Payload auto-pushes schema in dev)
pnpm dev:turbo                            # same, with the Turbopack dev bundler
pnpm build && pnpm start                  # production-mode local
pnpm typecheck                            # tsc --noEmit — the real correctness gate
pnpm seed                                 # idempotent — seeds 9 legal templates + 3 placeholder Sites
pnpm payload migrate                      # apply migrations from src/migrations/
pnpm payload migrate:create <name>        # generate a new migration after schema changes
pnpm generate:types                       # regenerate src/payload-types.ts (needs a reachable DB)
pnpm generate:importmap                   # regenerate Payload admin import map (run before build)
docker compose up -d postgres redis       # local Postgres + Redis only
```

There is no test suite. **`pnpm typecheck` is the only working correctness gate.** `pnpm lint` (`next lint`) exists in `package.json` but there is **no committed ESLint config** — it prompts for setup interactively and is not a usable check; don't report it as passing.

`pnpm typecheck` needs two things that are not in the repo: `node_modules` and a generated `src/payload-types.ts` (gitignored — see "Things to know when editing"). In this codespace neither exists, so typecheck can only be run on the server.

## Deploy model

A `git push` to `main` triggers Plesk's Git extension via webhook, which fetches into the bare repo at `/var/www/vhosts/legenex.com/git/legalos.git` and checks it out into `/var/www/vhosts/legenex.com/os.legenex.com/`. That target directory is not a clone and has no `.git`. The `legalos-dev.service` systemd unit serves the **production build** (`pnpm start` against `.next/`) from that directory — there is no HMR and no auto-rebuild. After the pull, you must SSH in and run `pnpm build && systemctl restart legalos-dev` for the change to take effect.

There is no container rebuild and no automatic migrate step. Rollback: `git revert && git push` (then rebuild + restart again).

Migrations are NOT auto-applied. If your push includes a new file under `src/migrations/`, run `ssh root@51.81.202.161 'cd /var/www/vhosts/legenex.com/os.legenex.com && pnpm payload migrate'` after the push (and as part of the same rebuild + restart sequence).

## Architecture: how a request flows

Every request hits Plesk's nginx (TLS termination) which reverse-proxies to the Next.js app on `127.0.0.1:3000`. From there:

1. **`src/middleware.ts`** decides whether the path is "Payload territory" (`/admin/*`, `/cms/*`, `/api/*`) or "public site territory". For the public path it stamps three request-intent headers onto the response so the catch-all route can read them: `x-legalos-host` (the raw `Host:`), `x-legalos-preview-site` (`?site=<slug>` — bypasses host lookup entirely), and `x-legalos-preview` (`?preview=1` — asks the route to skip the `status='published'` filter so drafts/scheduled content render). Middleware only *forwards* the preview intent; **the route re-verifies the request is authenticated before honouring the draft bypass** — never move that check into middleware.
2. **`/admin/*`** is the custom branded dashboard (`src/app/(app)/admin/`). **`/cms/*`** is the raw Payload admin (configured via `routes.admin: '/cms'` in `src/payload.config.ts`) — used for fields not yet exposed in the custom UI.
3. **`/api/*`** is Payload's REST/GraphQL surface plus our own endpoints (`/api/legalos/*` for dns-check / self-check / test-capture / agent-plan / legal-template affected-sites, `/api/leads` for public capture, `/api/media/upload` for builder uploads).
4. **`/(public)/[[...slug]]/page.tsx`** is the public catch-all. It calls `resolveSiteByHost()` in `src/lib/site-resolver.ts` to map `Host:` → Domain → Site, applies the Site's brand tokens, then resolves the path to a `Page`/`LandingPage`/`BlogPost`, falling back to a `SharedLegalTemplate` for known legal slugs (`/privacy`, `/terms`, `/partners`, `/submitted`, `/thanks`, `/tcpa`, `/disclosures`), and finally to the marketing site (`LegalOSMarketing`) if no Site matches the host.

The host cache in `site-resolver.ts` has a 60s TTL — call `invalidateHostCache(host)` after Domain mutations.

Server-side reads of Site/Domain go through `src/lib/site-data.ts`, whose helpers are wrapped in React `cache()` so a layout, page, and components in one render dedupe to a single query. Use those rather than a fresh `payload.find` in each component. Auth in the custom admin goes through `src/lib/auth.ts` (`getCurrentUser`, `isBoundToSite`) — server actions must call it, they don't inherit Payload access control.

### Admin route layout

`src/app/(app)/admin/` has two shapes, and which one a page belongs in is a design decision, not a preference:

- **`admin/(top)/*`** — LegalOS-wide surfaces that span tenants: `overview`, `sites`, `brands`, `leads`, `analytics`, `users`, `settings`, `system`, `plan`, `profile`, plus the brandless funnel builders (`advertorials`, `landing-pages`, `quizzes`). The `(top)` group exists to give them the shared top-nav shell.
- **`admin/sites/[slug]/*`** — everything scoped to one Site: `pages`, `blog`, `numbers`, and `settings/{general,domains,paths,seo,tracking,users,danger-zone}`. The Site is loaded once in `layout.tsx` and shared via `SiteContext.tsx`; server actions here must still re-verify the caller is bound to that Site (`isBoundToSite`) — context is not authorization.

## Multi-tenancy model

This is the single most load-bearing concept. **Everything is scoped to a `Site`.**

- `Sites` is the tenant root. **Required (NOT NULL) `site`**: `Pages`, `LandingPages`, `Quizzes`, `BlogPosts`, `Leads`, `Numbers`, `TrackingConfigs`. **Nullable `site`**: `Domains`, `Media`, and the three `Funnel*Deployments`. Access control filters on that relationship.
- `Users.siteBindings[]` assigns users to Sites with role `admin` / `editor` / `analyst`. `super_admin: true` bypasses scoping. The helpers in `src/access/index.ts` (`siteScopedRead`, `siteScopedWrite`, `siteScopedAdmin`, `isSuperAdmin`) return either `true` or a `{ site: { in: ids } }` filter — use them on collection access rules, don't reimplement.
- **Collections with no `site` field at all**: `Users`, `SharedLegalTemplates`, and the three brandless funnel *authoring* collections. `AuditLog` has an optional `site` (best-effort attribution). Everything else is scoped.
- `SharedLegalTemplates` is the deliberately-global content collection — it's the global library of legal page bodies (privacy, terms, TCPA, etc.) with `{{site.*}}` variables substituted at render via `renderTemplateVars()` in `src/lib/template-vars.ts` (`applyTemplateOverrides` layers per-Site overrides; `deepRenderTemplateVars` walks a block tree). Sites can override on a per-template basis.
- **Deleting a Site requires the cascade.** Every child FK is `ON DELETE SET NULL`, so for the NOT NULL children Postgres aborts the whole `delete from sites`. `cascadeDeleteSiteChildren` (`src/hooks/site-cascade.ts`, a `beforeDelete` hook on `Sites`) removes children first — including the Site's **`Leads`**, which is irreversible and a compliance consideration, so export lead/consent records before deleting a brand. If you add a new site-scoped collection, add its slug to `SITE_CHILD_COLLECTIONS` or Site deletion silently starts failing.
- New Sites are not born empty: `src/lib/starter-content.ts` seeds a vertical-appropriate home page (from `src/seed/home-blocks.ts`), a qualifying quiz, and a landing page, themed by the Site's brand tokens at render.

## Funnel Builder (brandless content + per-brand deployment)

A second content model, ported from the standalone funnel-builder artifact, lives alongside the site-scoped collections. It splits **authoring** from **brand binding** so one piece of content can run under many brands:

- **Authoring collections** (`Funnel Builder` admin group) are **brandless** — `FunnelAdvertorials`, `FunnelLandingPages`, `FunnelQuizzes`. Their bodies are brand-agnostic; header/colors/phone/CTA/disclaimer are resolved per brand only at render.
- **Deployment collections** — `FunnelAdvertorialDeployments`, `FunnelLpDeployments`, `FunnelQuizDeployments` — bind a brandless doc to a Site (brand) + Domain + path, and carry CTA-mode / UTM / pixel config. Cross-references between funnel docs are stored as **text ids** (e.g. `quiz_deployment_id`), not Payload relationships, mirroring the artifact.
- Access on these collections is plain `isAuthenticated` (NOT the `siteScoped*` helpers used elsewhere) — they are not yet wired into the per-Site scoping model. Audit hooks are attached.
- `src/lib/brand-map.ts` maps a production `Site` (+ its Domains) into the artifact's `brand` object shape; `Site.brand_identity` (JSON) is the source of truth when present. `src/lib/funnel-samples.ts` auto-seeds real, editable sample funnel records the first time a builder is opened (no manual `pnpm seed`).
- The `funnel-*` slugs are missing from the generated `payload-types.ts` on most machines. **25 files currently carry `// @ts-nocheck`** as a result — the `src/components/builder/**` apps, the `(top)/{advertorials,landing-pages,quizzes}` pages and their `actions.ts`, `src/lib/funnel-samples.ts`, and `src/seed/index.ts`. `payload-types.ts` is generated, never committed (see "Things to know when editing"), so the fix is `pnpm generate:types` against a live DB on the server, then drop the `@ts-nocheck` from files you touch and let real types apply. A `@ts-nocheck` at the top of a file silences *everything* in it — treat any file that has one as unchecked, and re-read it carefully rather than trusting that it compiles.
- **No migration exists for any of the six `funnel_*` tables.** They only exist where Payload dev auto-push created them. See the schema-drift warning in "Things to know when editing" before relying on them in production.

## Page builder (block-based pages)

`Pages` / `LandingPages` bodies are arrays of typed **blocks** (`hero`, `nav_header`, `trust_strip`, `prose`, `cta`, `cards`, `stats`, `testimonials`, `faq`, `services_grid`, `how_it_works`, `final_cta`, `site_footer`, …). Three artifacts must stay in lock-step when a block gains a field:

1. `src/lib/builder/block-schemas.ts` — Zod schemas that define the AI/model contract for `body_blocks`.
2. `src/collections/Pages.ts` — the Payload field definitions.
3. `src/components/blocks/BlockRenderer.tsx` — the renderer that reads the fields.

Other `src/lib/builder/` pieces:

- `html-to-blocks.ts` / `html-to-structured-blocks.ts` — import raw HTML → blocks.
- `extract/` — the AI-clone fetch pipeline: `fetch-bundle.ts` (pull a remote page + assets), `extract-colors.ts` / `extract-copy.ts` / `extract-logos.ts`, `map-output.ts`. `extract-brand-tokens.ts` is the single-page brand-token puller.
- `page-lint.ts` — pure, cheap a11y/seo/hierarchy/contrast checks that re-run on every blocks-state change to drive the builder's "Page health" card. Owns the WCAG math (`relativeLuminance`, `contrastRatio`).
- `color-system.ts` — contrast-safe, brand-adaptive palette derivation for the funnel builders. **Two jobs: prevention** (`resolvePalette`, `getSafeTextColor`, `deriveBrandSurface`, `onPrimaryText`, `effectiveBaseColor` derive every text color from the opaque surface it actually sits on and verify WCAG, making white-on-white structurally impossible) **and detection** (`auditColorPairs` / `auditPalette` flag unreadable brand+template combinations). It reuses `page-lint.ts`'s WCAG math — never reimplement luminance/ratio, and never hardcode a text color in a template when a derive helper exists.

Builder server actions live under `src/app/(app)/admin/sites/[slug]/pages/` (`ai-clone-action.ts`, `html-import-action.ts`, `ai-rewrite-action.ts`, `convert-action.ts`) and go through `invokeLLM` (see AI usage).

`src/components/blocks/bespoke-css.ts` holds the CSS string shared by the legacy `CheckMyClaimHome` component and the `BlockRenderer` ports of its sections, so the visual stays identical while sections migrate block-by-block. Every rule is dual-scoped `html.site-shell` (public) **and** `.legalos-builder-canvas` (admin preview) — add both selectors or the builder preview diverges from the live page. Its `:root` fallbacks are a neutral navy/gray palette, deliberately *not* Check My Claim blue, so a brand-unaware Site can't inherit CMC's identity.

## Hard rules enforced in code

These aren't style preferences — violating them creates correctness bugs or compliance risk:

- **Phone numbers** display only via `resolvePhoneForPath(path, site_id)` in `src/lib/resolve-phone.ts`. Never denormalize a phone onto a Page / LP / Quiz. Resolution order: matching `Numbers.page_paths[]` (longest prefix wins) → Site's fallback Number → `Site.default_phone`.
- **Pixel + CAPI** conversions share an `event_id` per the Meta dedupe contract. See `src/lib/lead-pipeline/event-id.ts`.
- **TrustedForm cert claim** and **HLR lookup** are server-side only. Credentials never leave the server (`src/lib/integrations/`).
- **Banned-vocab and em-dash linters** run on every AI output (`enforceNoBannedVocab: true` on `invokeLLM` in `src/lib/ai/invoke.ts`). Failures trigger up to 2 retries before surfacing.
- **Text colors are derived, never assumed.** In the funnel/page builders, get a text color from `src/lib/builder/color-system.ts` against the opaque surface it will sit on — don't hardcode `#fff`/`#000` or assume a brand token is dark. This is what makes white-on-white unreachable rather than merely unlikely.
- **`ssl_status='active'`** is set only after a real HTTPS handshake by the SSL poller (`src/lib/ssl-poll.ts`) — never assumed from Plesk's response.
- **Preview domains** (`{slug}.preview.legenex.com`) are auto-issued, always `primary: true` until a custom domain is verified, and cannot be deleted from the UI.
- **`SharedLegalTemplate` edits** must surface an affected-Sites list before save.
- **No placeholders in any working config.** `.env`, server actions, scripts, and runtime config must never contain placeholder strings (`<your-server-ip>`, `CHANGEME`, `paste-here`, `TODO`, etc.). `.env.example` is the only file that may carry placeholders. `scripts/deploy.sh` rejects placeholder-looking values at boot. If a value isn't known yet, leave the key blank rather than inserting a fake — code branches on emptiness, not on placeholder text. Every shipped feature must be a fully functioning, well-built path; partial-with-placeholder is treated as broken.

## Tenant domain provisioning

Connecting a custom domain to a Site goes through Plesk's REST API (`src/lib/plesk/`):

1. `verifyAndPromoteDomain` checks DNS, then calls Plesk to register the domain, set reverse-proxy directives to `localhost:3000`, and issue a Let's Encrypt cert.
2. The Domain row flips `status: provisioning` → `active`.
3. `pollDomainSslStatus` (every 30s for ~4 minutes) hits `https://<host>/` until it returns 2xx, then flips `ssl_status: active`.
4. The public router can now resolve `Host: tenant-domain.com` → Domain → Site.

`LEGALOS_DEV_SKIP_DNS=true` (dev only — must be `false` in prod) reveals a "Skip DNS" button for local testing.

## AI usage

`src/lib/ai/invoke.ts` wraps the Anthropic SDK with: Zod schema → JSON schema for `tool_use`, forced tool invocation (`tool_choice: { type: 'tool' }`), automatic banned-vocab post-check, and up to 2 retries that feed the validation error back into the prompt. Default model is `claude-sonnet-4-6`; the `model` param is a closed union (`claude-opus-4-7` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001`) — widen the type there rather than casting at a call site. The client is lazily constructed and throws if `ANTHROPIC_API_KEY` is unset, so importing the module is safe at build time. Prefer `invokeLLM` over calling `Anthropic` directly so the retry + vocab guarantees stay intact.

`src/lib/ai/banned-vocab.ts` (`hasBannedSignals`) is the linter; `src/lib/ai/humanizer.ts` is a prompt-level pass that strips AI tells (inflated symbolism, em-dash overuse, rule-of-three, filler) while preserving facts and quoted material.

## Lead capture pipeline

Public lead submissions (`POST /api/leads`, at `src/app/api/leads/route.ts`) and the test harness (`POST /api/legalos/test-capture`) funnel into one orchestrator: `runLeadPipeline()` in `src/lib/lead-pipeline/run.ts`. It runs **synchronously inside the request** — there is no background worker. Despite `bullmq` being a declared dependency, no queue/worker is wired up; the only runtime use of Redis is a health-check ping in `src/lib/system-health/checks.ts`. Don't assume lead work is async.

The orchestrator's steps (each returns a `PipelineStep` for the result trace): derive attribution / `fbc` (`attribution.ts`) → mint the shared `event_id` (`event-id.ts`) → claim the TrustedForm cert and verify the Jornaya lead (`src/lib/integrations/`) → enrich the phone via HLR → persist the `Leads` row → fire Meta CAPI + TrueCall → dispatch outbound webhooks (`dispatch-webhooks.ts`) → Slack notify (`slack.ts`). All integration calls and credentials are server-side only.

## Globals and cross-cutting hooks

- **`IntegrationConfig` global** (`src/globals/IntegrationConfig.ts`, slug `integration-config`) holds LegalOS-wide integration settings (SMTP, Slack, GitHub, Search Console) and is **super-admin only**. Per-Site integration values live on `TrackingConfig` instead — don't conflate the two.
- **Audit log**: the `auditAfterChange` / after-delete hooks (`src/hooks/audit.ts`) write a diff of every authenticated mutation to the `AuditLog` collection. They're attached across nearly all collections.
- **Slug redirects**: `captureSlugRedirect` (`src/hooks/slug-redirects.ts`) appends the old slug to `slug_redirects[]` when a *published* doc's slug changes, so the public router can 301 old → new.
- **Site cascade delete**: `cascadeDeleteSiteChildren` (`src/hooks/site-cascade.ts`) — see "Multi-tenancy model". Runs for *all* delete paths (custom admin, raw `/cms`, REST, local API).

## Bug-audit tooling: subsystem reviewers + the Agent Plan board

This repo carries its own review harness. Use it instead of ad-hoc greps when auditing or fixing a subsystem.

- **`.claude/agents/*.md`** — 15 subsystem reviewer-fixers (migrations, lead-pipeline, site-routing, access, provisioning, integrations, builder-lib, builder-actions, block-renderer, funnel, collections, admin-actions, ai, public-cmc, system-health) plus `legalos-adversarial-verifier`, a read-only agent whose job is to *refute* a reported finding. Each reviewer's front-matter scopes it to specific paths. These are checked in (`.gitignore` allowlists `.claude/commands/` and `.claude/agents/`); the rest of `.claude/` is personal state.
- **`docs/audit-2026-06-04.md`** — the standing audit: 58 raw findings → 50 confirmed (1 critical, 12 high, 20 medium, 16 low, 1 nit), each with a reviewer's problem statement, a proposed fix, and an independent verifier's confirmation. Static analysis only, not runtime-verified. Check here before "discovering" a bug — it may already be written up with a fix.
- **`/admin/plan`** — the live board. `src/lib/agent-plan/plan.ts` is the static assignment (auto-generated from the audit: which agent owns which finding id, `F001`…). `src/lib/agent-plan/store.ts` is the runtime status layer: one atomically-written JSON file per agent under `data/agent-status/` (gitignored, created lazily) so concurrent agents can POST status without a read-modify-write race. Agents report via `POST /api/legalos/agent-plan`. Deliberately **not** a Payload collection — it's a dev/ops surface with no tenant benefit and would otherwise cost a migration.
- `tasks/todo.md` is a scratch hand-off file for in-flight parallel work, not a durable backlog.

## Path aliases

- `@/*` → `./src/*`
- `@payload-config` → `./src/payload.config.ts`

## Things to know when editing

- **This codespace cannot build.** No `node_modules`, no `.env`, no database. Don't promise a local verification you can't perform — reason it through, then verify on the server after the deploy block.
- **`src/payload-types.ts` is generated and gitignored — it does not exist in a fresh clone.** Ten modules import from `@/payload-types`, so `pnpm typecheck` fails until `pnpm generate:types` has run against a reachable DB. After editing collection fields, regenerate it (on the server, where the DB lives).
- Schema changes: dev auto-pushes (Payload default outside production). For production, generate a migration with `pnpm payload migrate:create <name>`, commit and push it, then run `pnpm payload migrate` on the server (deploys don't auto-migrate).
- **A migration runs because its FILE is in `src/migrations/`.** Payload's `readMigrationFiles` reads the directory, sorts by filename, and explicitly skips `index.ts` — so a file dropped in runs whether or not it is registered, and deleting three lines from `index.ts` disables nothing. (An earlier version of this file said the opposite.) `index.ts` is still maintained as the one place the intended chain is written down in order, and `pnpm test:release` fails if it and the directory disagree. Migrations are written idempotent by hand. Only the first three migrations have a companion `.json` drizzle snapshot; everything from `20260528_*` on is hand-written SQL, so `migrate:create` diffs against a **stale** snapshot and will re-emit changes later migrations already applied. Read its output before committing. House style is retry-safe DDL — `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` / `CREATE TABLE IF NOT EXISTS` / `ALTER TYPE … ADD VALUE IF NOT EXISTS`, nullable columns so existing rows need no backfill, and a header comment saying *why*. `20260528_220000_pages_hidden_blocks.ts` is the canonical short example.
- **A missing column breaks startup, not just one query.** Payload's `SELECT` enumerates every column a collection declares, so one absent column throws before startup completes — which is why `20260529_060000_sites_global_blocks.ts` was reduced to a no-op `DROP COLUMN IF EXISTS` and the global nav/footer moved into the existing `brand_identity` jsonb. Never add a column to a collection without the migration in the same commit.
- **F001 is CLOSED, and `pnpm test:bootstrap` is what keeps it closed.** Every field below exists in the committed chain; the suite creates a Site with all of them against a migration-only database and reads them back. Three more columns were found missing by that suite and are fixed in `20260813_210000` and `20260813_213000` — six `funnel_*_id` columns on `payload_locked_documents_rels` (which also made DELETING ANY DOCUMENT in ANY collection fail) and two markers on `integration_config` (which made the admin 500). The historical text follows so the claim can be checked rather than believed. **⚠️ Was: Known schema drift — F001.** `src/collections/Sites.ts` declares columns that **no** committed migration creates: `brand_identity` (jsonb), `brand_display_name`, `brand_short_name`, `brand_logo_url_dark`, `brand_tagline_brand`, `legal_*` (copyright / tcpa_text / privacy_url / terms_url / default_disclaimer), `typography_*` (headline_font / body_font / base_size). All six `funnel_*` tables are likewise absent. Note that `20260529_060000_sites_global_blocks.ts`'s header **asserts `brand_identity` "has been on the table since the initial migration" — that is false**; grep the migrations and you'll find the name only in that comment. Don't trust migration prose over a grep. This is finding **F001** in `docs/audit-2026-06-04.md`; if you touch `Sites` fields or the funnel collections, fix the drift rather than adding to it.
- `next.config.mjs` is minimal; `cors: '*'` and the `csrf` allowlist are set in `payload.config.ts` — don't add CORS handling at the route layer. **The CSRF allowlist is a live foot-gun:** server actions send an `Origin` header that must match an entry, or Payload's cookie auth returns `user = null` and the action fails as "unauthenticated" with no CSRF-shaped error. The list is `NEXT_PUBLIC_SERVER_URL` + localhost (non-production only) + comma-separated `LEGALOS_EXTRA_ORIGINS` — use that env var to add apex/`www` aliases rather than editing code.
- `db: postgresAdapter` sets no explicit `push`, so Payload's default applies: schema auto-push when `NODE_ENV !== production`, migrations only in production. Anything that "works locally" may simply be riding a dev push that no migration reproduces.
- The `(payload)` route group exists because Payload's `withPayload` Next plugin convention expects it; the `(public)`, `(app)`, `(auth)` groups exist so each can have its own root `layout.tsx`.
- Before a production build, regenerate the Payload admin import map with `pnpm generate:importmap` — the artifact is `src/app/(payload)/cms/importMap.js` and it *is* committed, not built on the fly.
- **Stale docs — do not follow.** `README.md` and `docs/DEPLOY.md` both describe the old flow (`scripts/deploy.sh`, Docker Compose rebuild, and in DEPLOY.md the wrong host `mo.legenex.com`). The deploy model in *this* file (git push → Plesk webhook pull → `pnpm build` + `systemctl restart legalos-dev` on `os.legenex.com`) is authoritative. `scripts/deploy.sh`, `cron-deploy.sh`, and `trigger-deploy.sh` are historical reference only.
