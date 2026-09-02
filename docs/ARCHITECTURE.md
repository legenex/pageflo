# PageFlo architecture

How the application is built and why. `AGENTS.md` is the operating contract and
holds the invariants; this file is the reference an agent reads before changing a
subsystem.

Everything here was verified against the repository. Where a claim is
historical or was found to be wrong, it says so rather than being deleted.

---

## Request flow

Every request hits Plesk's nginx, which terminates TLS and reverse-proxies to
the Next.js app on `127.0.0.1:3000`. From there:

1. **`src/middleware.ts`** decides whether the path is Payload territory
   (`/admin/*`, `/cms/*`, `/api/*`) or public site territory. For the public
   path it stamps three request-intent headers onto the response so the
   catch-all route can read them:
   - `x-pageflo-host`, the raw `Host:`
   - `x-pageflo-preview-site`, from `?site=<slug>`, which bypasses host lookup
   - `x-pageflo-preview`, from `?preview=1`, which asks the route to skip the
     `status='published'` filter so drafts and scheduled content render
   - `x-pageflo-host-role`, the classification from `src/lib/pageflo/hosts.ts`

   The `x-legalos-*` spellings of the first three are stamped alongside and read
   as a fallback. They are compatibility identifiers; see
   `docs/INFRASTRUCTURE.md`.

   Middleware only forwards the preview intent. **The route re-verifies that the
   request is authenticated before honouring the draft bypass.** Never move that
   check into middleware.

2. **`/admin/*`** is the custom branded dashboard, `src/app/(app)/admin/`.
3. **`/cms/*`** is the raw Payload admin, configured with `routes.admin: '/cms'`
   in `src/payload.config.ts`. It is used for fields not yet exposed in the
   custom UI, and several custom pages deep-link into it.
4. **`/api/*`** is Payload's REST surface plus our own endpoints:
   `/api/pageflo/*` (health, dns-check, self-check, test-capture, agent-plan,
   quiz-ai, quiz-webhook, client-error, buildlog-capture, legal-template
   affected-sites), `/api/leads` for public capture, `/api/media/upload` for
   builder uploads. Every one is also mounted at `/api/legalos/*` as a
   re-export, for consumers this deploy does not control: the release health
   gate, the SSL poller probing tenant hosts that may be serving an older build,
   and cached copies of `q.js` on third-party pages.
5. **`/(public)/[[...slug]]/page.tsx`** is the public catch-all, and its FIRST
   decision is `classifyHost()` from `src/lib/pageflo/hosts.ts`, taken before
   any database lookup:
   - `marketing` renders the PageFlo product site at `/` and `/privacy`;
   - `app` redirects `/` to `/admin` and 404s everything else public;
   - `legacy-app` behaves exactly as it did before the rebrand until
     `PAGEFLO_LEGACY_HOST_REDIRECT` is `true`, then 308s to the app host;
   - `tenant` is the only role that reaches `resolveSiteByHost()`.

   Checking reserved hosts first is what makes it impossible for a `Domains`
   row to claim `pageflo.io` or `app.pageflo.io`. For a tenant host the route
   maps `Host:` to Domain to Site, applies the Site's brand tokens, resolves the
   path to a `Page` / `LandingPage` / `BlogPost` or a funnel deployment, and
   falls back to a `SharedLegalTemplate` for known legal slugs (`/privacy`,
   `/terms`, `/partners`, `/submitted`, `/thanks`, `/tcpa`, `/disclosures`). An
   unresolvable host **404s**; it does not render the product site, which is
   what `robots.txt` was already saying for the same request.

The host cache in `site-resolver.ts` has a 60 second TTL. Call
`invalidateHostCache(host)` after Domain mutations.

Server-side reads of Site and Domain go through `src/lib/site-data.ts`, whose
helpers are wrapped in React `cache()` so a layout, a page and its components
dedupe to one query per render. Use those rather than a fresh `payload.find` in
each component.

Auth in the custom admin goes through `src/lib/auth.ts` (`getCurrentUser`,
`isBoundToSite`). Server actions must call it. They do not inherit Payload
access control.

### Route groups

`(payload)` exists because Payload's `withPayload` Next plugin convention
expects it. `(public)`, `(app)` and `(auth)` exist so each can own a root
`layout.tsx`.

### Admin route layout

`src/app/(app)/admin/` has two shapes, and which one a page belongs to is a
design decision:

- **`admin/(top)/*`** are platform-wide surfaces that span tenants: `overview`,
  `sites`, `brands`, `leads`, `analytics`, `users`, `settings`, `system`,
  `plan`, `profile`, `buildlog`, `handbook`, plus the brandless funnel builders
  `advertorials`, `landing-pages`, `quizzes`. The `(top)` group gives them the
  shared top-nav shell.
- **`admin/sites/[slug]/*`** is everything scoped to one Site: `pages`, `blog`,
  `numbers`, and `settings/{general,domains,paths,seo,tracking,users,danger-zone}`.
  The Site is loaded once in `layout.tsx` and shared through `SiteContext.tsx`.
  Server actions here must still re-verify the caller is bound to that Site.
  Context is not authorization.

---

## Multi-tenancy model

This is the most load-bearing concept in the codebase. Everything is scoped to a
`Site`.

- `Sites` is the tenant root.
- **Required, NOT NULL `site`**: `Pages`, `LandingPages`, `Quizzes`,
  `BlogPosts`, `Leads`, `Numbers`, `TrackingConfigs`.
- **Nullable `site`**: `Domains`, `Media`, and the three `Funnel*Deployments`.
- **No `site` field at all**: `Users`, `SharedLegalTemplates`,
  `FunnelQuizTemplates`, and the three brandless funnel authoring collections.
  `AuditLog` has an optional `site` for best-effort attribution.

`Users.siteBindings[]` assigns users to Sites with role `admin`, `editor` or
`analyst`. `super_admin: true` bypasses scoping. The helpers in
`src/access/index.ts` (`siteScopedRead`, `siteScopedWrite`, `siteScopedAdmin`,
`isSuperAdmin`) return either `true` or a `{ site: { in: ids } }` filter. Use
them on collection access rules.

`SharedLegalTemplates` is the deliberately global content collection: the
library of legal page bodies with `{{site.*}}` variables substituted at render
by `renderTemplateVars()` in `src/lib/template-vars.ts`.
`applyTemplateOverrides` layers per-Site overrides and `deepRenderTemplateVars`
walks a block tree. Sites can override per template.

**Site deletion requires the cascade.** Every child foreign key is `ON DELETE
SET NULL`, so for the NOT NULL children Postgres aborts the whole
`delete from sites`. `cascadeDeleteSiteChildren` in `src/hooks/site-cascade.ts`,
a `beforeDelete` hook on `Sites`, removes children first. Its
`SITE_CHILD_COLLECTIONS` list is currently:

```
pages, landing-pages, quizzes, blog-posts, numbers, tracking-configs,
leads, media, domains, funnel-advertorial-deployments,
funnel-lp-deployments, funnel-quiz-deployments
```

That includes the Site's `Leads`, which is irreversible and a compliance
consideration. Export lead and consent records before deleting a brand. If you
add a new site-scoped collection, add its slug to that list or Site deletion
starts failing silently.

New Sites are not born empty. `src/lib/starter-content.ts` seeds a
vertical-appropriate home page from `src/seed/home-blocks.ts`, a qualifying
quiz, and a landing page, themed by the Site's brand tokens at render.

---

## Funnel builder: brandless content, per-brand deployment

A second content model lives alongside the site-scoped collections. It splits
authoring from brand binding so one piece of content can run under many brands.

- **Authoring collections are brandless**: `FunnelAdvertorials`,
  `FunnelLandingPages`, `FunnelQuizzes`, plus `FunnelQuizTemplates` for the
  visual template records. Their bodies are brand-agnostic; header, colors,
  phone, CTA and disclaimer are resolved per brand only at render.
- **Deployment collections** bind a brandless document to a Site, a Domain and a
  path, and carry CTA mode, UTM and pixel config:
  `FunnelAdvertorialDeployments`, `FunnelLpDeployments`,
  `FunnelQuizDeployments`.
- Cross-references between funnel documents are stored as **text ids**, for
  example `quiz_deployment_id`, not Payload relationships. This mirrors the
  artifact the model was ported from.
- Access on these collections is plain `isAuthenticated`, **not** the
  `siteScoped*` helpers used elsewhere. They are not yet wired into the per-Site
  scoping model. This is a known gap; see `docs/REQUIREMENTS.md`.
- `src/lib/brand-map.ts` maps a production `Site` and its Domains into the
  artifact's `brand` object shape. `Site.brand_identity`, a jsonb column, is the
  source of truth when present.
- `src/lib/funnel-samples.ts` auto-seeds real, editable sample records the first
  time a builder is opened. No manual `pnpm seed` is needed.

### The `@ts-nocheck` situation

54 files carry `// @ts-nocheck`, covering roughly 24,000 of about 100,000 lines
of `src/`. They are the ported builder apps, the `(top)` funnel pages and their
actions, the public quiz runtime, the template-records library, and the seed.

**The original reason no longer holds.** The `funnel-*` slugs were missing from
the generated `src/payload-types.ts`, so the ported code could not type-check.
`payload-types.ts` now contains all seven funnel slugs. The silencing is stale.

A `@ts-nocheck` silences everything in its file. Treat any file that has one as
unchecked and read it carefully rather than trusting that it compiles. Removing
them, file by file, with real types applied, is phase 5 work in
`docs/EXECUTION-PLAN.md`.

---

## Page builder: block-based pages

`Pages` and `LandingPages` bodies are arrays of typed blocks: `hero`,
`nav_header`, `trust_strip`, `prose`, `cta`, `cards`, `stats`, `testimonials`,
`faq`, `services_grid`, `how_it_works`, `final_cta`, `site_footer` and others.

**Three artifacts must stay in lock-step when a block gains a field:**

1. `src/lib/builder/block-schemas.ts`, the Zod schemas that define the AI and
   model contract for `body_blocks`
2. `src/collections/Pages.ts`, the Payload field definitions
3. `src/components/blocks/BlockRenderer.tsx`, the renderer that reads them

Shipping two of the three is a bug.

Other pieces of `src/lib/builder/`:

- `html-to-blocks.ts` and `html-to-structured-blocks.ts` import raw HTML into
  blocks.
- `extract/` is the AI-clone fetch pipeline: `fetch-bundle.ts` pulls a remote
  page and its assets, then `extract-colors.ts`, `extract-copy.ts`,
  `extract-logos.ts` and `map-output.ts`. `extract-brand-tokens.ts` is the
  single-page brand-token puller.
- `page-lint.ts` holds pure, cheap accessibility, SEO, hierarchy and contrast
  checks that re-run on every blocks-state change to drive the builder's Page
  health card. **It owns the WCAG math** (`relativeLuminance`, `contrastRatio`).
- `color-system.ts` does two jobs. **Prevention**: `resolvePalette`,
  `getSafeTextColor`, `deriveBrandSurface`, `onPrimaryText` and
  `effectiveBaseColor` derive every text color from the opaque surface it
  actually sits on and verify WCAG, which makes white-on-white structurally
  impossible rather than merely unlikely. **Detection**: `auditColorPairs` and
  `auditPalette` flag unreadable brand and template combinations. It reuses
  `page-lint.ts`'s WCAG math. Never reimplement luminance or ratio, and never
  hardcode a text color in a template when a derive helper exists.

Builder server actions live under
`src/app/(app)/admin/sites/[slug]/pages/`: `ai-clone-action.ts`,
`html-import-action.ts`, `ai-rewrite-action.ts`, `convert-action.ts`. They go
through `invokeLLM`.

`src/components/blocks/bespoke-css.ts` holds the CSS string shared by the legacy
`CheckMyClaimHome` component and the `BlockRenderer` ports of its sections, so
the visual stays identical while sections migrate block by block. **Every rule
is dual-scoped** `html.site-shell` for the public page and
`.pageflo-builder-canvas` for the admin preview, plus `.legalos-builder-canvas`
for page HTML saved before the rename. Add all three selectors or the
builder preview diverges from the live page. Its `:root` fallbacks are a neutral
navy and gray palette, deliberately not Check My Claim blue, so a brand-unaware
Site cannot inherit that identity.

---

## Quiz system

`src/lib/quiz-flow/` holds the flow model: `index.ts`, `paths.ts` and
`validate.ts`. Quizzes support tiers, conditional branching and derived-graph
validation. `validate.ts` runs reachability checks including
`tier_reachability`, `no_entry_for_tier`, and a check that some step resolves
for a visitor who has not yet been assigned a tier.

`src/lib/quiz-templates/` holds the visual template model and theme.
`FunnelQuizTemplates` makes those templates manageable records rather than
hardcoded constants.

The public runtime is `src/components/public/quiz/`: `QuizRuntime.tsx`,
`QuizSurface.tsx`, `chrome.tsx`, `view-model.ts`, plus `QuizStill.tsx` in the
builder for the fidelity harness.

Tier assignment can call an external provider between questions. **The MVA tier
lookup service does not exist.** See EB-1 in `docs/external-blockers.md`: the
seeded MVA tiered quiz calls `https://api.legenex.com/mva-tier-lookup`, the
contract is pinned by the node and asserted in `scripts/test-quiz-webhook.mts`,
and the rule that turns a state and a date into a tier is not in this
repository, any migration, any seed, or the Base44 account.

---

## Lead capture pipeline

Public lead submissions (`POST /api/leads`, `src/app/api/leads/route.ts`) and
the test harness (`POST /api/pageflo/test-capture`) funnel into one
orchestrator: `runLeadPipeline()` in `src/lib/lead-pipeline/run.ts`.

**It runs synchronously inside the request. There is no background worker.**
`bullmq` is a declared dependency but no queue or worker is wired up. The only
runtime use of Redis is a health-check ping in
`src/lib/system-health/checks.ts`. Do not assume lead work is async.

Steps, each returning a `PipelineStep` for the result trace:

1. derive attribution and `fbc` (`attribution.ts`)
2. mint the shared `event_id` (`event-id.ts`)
3. claim the TrustedForm cert and verify the Jornaya lead
   (`src/lib/integrations/`)
4. enrich the phone via HLR
5. persist the `Leads` row
6. fire Meta CAPI and TrueCall
7. dispatch outbound webhooks (`dispatch-webhooks.ts`)
8. Slack notify (`slack.ts`)

All integration calls and credentials are server-side only.

`Leads` carries an idempotency key, added in
`20260814_120000_leads_idempotency_key.ts` and asserted by
`pnpm test:idempotency`.

---

## AI usage

`src/lib/ai/invoke.ts` wraps the Anthropic SDK with: Zod schema to JSON schema
for `tool_use`, forced tool invocation (`tool_choice: { type: 'tool' }`),
automatic banned-vocab post-check, and up to two retries that feed the
validation error back into the prompt.

The default model is `claude-sonnet-4-6`. The `model` parameter is a closed
union: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.
Widen the type there rather than casting at a call site.

The client is lazily constructed and throws if `ANTHROPIC_API_KEY` is unset, so
importing the module is safe at build time.

Prefer `invokeLLM` over calling `Anthropic` directly so the retry and vocab
guarantees stay intact.

`src/lib/ai/banned-vocab.ts` (`hasBannedSignals`) is the linter.
`src/lib/ai/humanizer.ts` is a prompt-level pass that strips AI tells (inflated
symbolism, em-dash overuse, rule-of-three, filler) while preserving facts and
quoted material.

---

## Tenant domain provisioning

Connecting a custom domain to a Site goes through Plesk's REST API,
`src/lib/plesk/`:

1. `verifyAndPromoteDomain` checks DNS, then calls Plesk to register the domain,
   set reverse-proxy directives to `localhost:3000`, and issue a Let's Encrypt
   certificate.
2. The Domain row flips `status: provisioning` to `active`.
3. `pollDomainSslStatus`, every 30 seconds for about four minutes, hits
   `https://<host>/` until it returns 2xx, then flips `ssl_status: active`.
   **Never inferred from Plesk's response.**
4. The public router can now resolve `Host: tenant-domain.com` to Domain to
   Site.

Removing a custom domain calls Plesk's domain delete so the vhost and cert are
cleaned up too.

`LEGALOS_DEV_SKIP_DNS=true`, dev only and false in production, reveals a Skip
DNS button for local testing.

**The Plesk coupling is narrow.** Only `src/lib/plesk/client.ts` and
`src/lib/plesk/provision-domain.ts` talk to Plesk, and only four files import
them: the two domain action files, `src/lib/system-health/checks.ts`, and
`src/lib/agent-plan/plan.ts`. That is the seam phase 9 replaces with a provider
interface. See `docs/INFRASTRUCTURE.md`.

---

## Globals and cross-cutting hooks

- **`IntegrationConfig` global**, `src/globals/IntegrationConfig.ts`, slug
  `integration-config`, holds platform-wide integration settings (SMTP, Slack,
  GitHub, Search Console) and is super-admin only. Per-Site integration values
  live on `TrackingConfig`. Do not conflate the two.
- **Audit log**: `auditAfterChange` and the after-delete hook in
  `src/hooks/audit.ts` write a diff of every authenticated mutation to
  `AuditLog`. Attached across nearly all collections.
- **Slug redirects**: `captureSlugRedirect` in `src/hooks/slug-redirects.ts`
  appends the old slug to `slug_redirects[]` when a published document's slug
  changes, so the public router can 301 old to new.
- **Site cascade delete**: `cascadeDeleteSiteChildren`, described above. Runs
  for all delete paths: custom admin, raw `/cms`, REST, local API.

---

## Migrations

Schema changes auto-push in dev, because `db: postgresAdapter` sets no explicit
`push` and Payload's default is auto-push when `NODE_ENV !== production`.
Anything that "works locally" may be riding a dev push no migration reproduces.

For production: generate with `pnpm payload migrate:create <name>`, commit and
push it, and let `scripts/release.sh` apply it between the build and the start.

**A migration runs because its file is in `src/migrations/`.** Payload's
`readMigrationFiles` reads the directory, sorts by filename, and explicitly
skips `index.ts`. A file dropped in runs whether or not it is registered, and
deleting lines from `index.ts` disables nothing. An earlier version of the
project documentation said the opposite. `index.ts` is still maintained as the
one place the intended chain is written down in order, and `pnpm test:release`
fails if it and the directory disagree.

Only the first three migrations have a companion `.json` drizzle snapshot.
Everything from `20260528_*` onward is hand-written SQL, so `migrate:create`
diffs against a stale snapshot and will re-emit changes later migrations already
applied. Read its output before committing.

House style is retry-safe DDL: `ADD COLUMN IF NOT EXISTS`,
`DROP COLUMN IF EXISTS`, `CREATE TABLE IF NOT EXISTS`,
`ALTER TYPE ... ADD VALUE IF NOT EXISTS`, nullable columns so existing rows need
no backfill, and a header comment saying why.
`20260528_220000_pages_hidden_blocks.ts` is the canonical short example.

**A missing column breaks startup, not just one query.** Payload's `SELECT`
enumerates every column a collection declares, so one absent column throws
before startup completes. That is why `20260529_060000_sites_global_blocks.ts`
was reduced to a no-op `DROP COLUMN IF EXISTS` and the global nav and footer
moved into the existing `brand_identity` jsonb.

Postgres forbids `ALTER TYPE ... ADD VALUE` inside a transaction and Payload
wraps every migration's `up()` in one, with no per-migration opt-out in 3.83. To
add an enum value, reach into the raw pg pool on a fresh connection;
`20260518_134859_site_status_draft.ts` is the working example.

### F001, the historical schema drift, is closed

`pnpm test:bootstrap` is what keeps it closed: it creates a Site with every
declared field against a migration-only database and reads them back.

The historical text is kept so the claim can be checked rather than believed.
**Was**: `src/collections/Sites.ts` declared columns no committed migration
created, including `brand_identity`, the `brand_*` display fields, the `legal_*`
fields and the `typography_*` fields, and all six `funnel_*` tables were absent.
`20260529_060000_sites_global_blocks.ts`'s header asserted that `brand_identity`
"has been on the table since the initial migration", which was false; grep the
migrations and the name appears only in that comment. Do not trust migration
prose over a grep.

Three further columns found missing by that suite were fixed in
`20260813_210000` and `20260813_213000`: six `funnel_*_id` columns on
`payload_locked_documents_rels`, whose absence also made deleting any document
in any collection fail, and two markers on `integration_config`, whose absence
made the admin return 500.

---

## Path aliases

- `@/*` maps to `./src/*`
- `@payload-config` maps to `./src/payload.config.ts`

---

## Configuration notes

- `next.config.mjs` is deliberately minimal. `cors: '*'` and the `csrf`
  allowlist are set in `src/payload.config.ts`. Do not add CORS handling at the
  route layer.
- **The CSRF allowlist is a live foot-gun.** Server actions send an `Origin`
  header that must match an entry, or Payload's cookie auth returns `user =
  null` and the action fails as "unauthenticated" with no CSRF-shaped error. The
  list is `NEXT_PUBLIC_SERVER_URL`, plus localhost outside production, plus
  comma-separated `LEGALOS_EXTRA_ORIGINS`. Use that environment variable to add
  apex and `www` aliases rather than editing code.
- `next.config.mjs` sets `serverActions.bodySizeLimit: '4mb'` because the brand
  wizard posts documents and downscaled images in one action, and Next rejects
  an oversized body with an uncatchable 413 before the action runs. The per-file
  limits in `src/lib/brand/source-limits.ts` are sized to add up to less than
  it. Keep the two in step.
- `serverExternalPackages: ['playwright']` is required: Playwright resolves its
  Chromium binary from its own package directory at runtime, and bundling would
  break the launch.
- Image `remotePatterns` are built from `LEGALOS_IMAGE_HOSTS` and are **empty by
  default**. `hostname: '**'` was there once, which made
  `/_next/image?url=https://<anything>` an unauthenticated server-side fetch of
  an attacker-chosen host on every public tenant domain. Brand artwork renders
  as a plain `<img>` the visitor's browser fetches, so this server never fetches
  a remote image. Wildcards are refused, so it cannot regress.
- Before a production build, regenerate the Payload admin import map with
  `pnpm generate:importmap`. The artifact is
  `src/app/(payload)/cms/importMap.js` and **it is committed**, not built on the
  fly.
- `src/payload-types.ts` is generated and gitignored. It does not exist in a
  fresh clone. Ten modules import from `@/payload-types`, so `pnpm typecheck`
  fails until `pnpm generate:types` has run against a reachable database.
  Regenerate it after editing collection fields.

---

## Review tooling

- **`.claude/agents/*.md`** holds sixteen scoped subsystem reviewer-fixers
  (migrations, lead-pipeline, site-routing, access, provisioning, integrations,
  builder-lib, builder-actions, block-renderer, funnel, collections,
  admin-actions, ai, public-cmc, system-health) plus
  `legalos-adversarial-verifier`, a read-only agent whose job is to refute a
  reported finding. Each reviewer's front matter scopes it to specific paths.
  These are checked in; `.gitignore` allowlists `.claude/commands/` and
  `.claude/agents/` and ignores the rest of `.claude/`.
- **`docs/audit-2026-06-04.md`** is the standing audit: 58 raw findings, 50
  confirmed (1 critical, 12 high, 20 medium, 16 low, 1 nit), each with a
  problem statement, a proposed fix and an independent verifier's confirmation.
  Static analysis only, not runtime-verified. Check it before reporting a new
  bug in a subsystem it covers.
- **`/admin/plan`** is the live board. `src/lib/agent-plan/plan.ts` is the
  static assignment of finding ids to agents; `src/lib/agent-plan/store.ts` is
  the runtime status layer, one atomically written JSON file per agent under
  `data/agent-status/`, gitignored and created lazily, so concurrent agents can
  POST status without a read-modify-write race. Agents report via
  `POST /api/pageflo/agent-plan`. Deliberately not a Payload collection: it is a
  dev and ops surface with no tenant benefit that would otherwise cost a
  migration.
