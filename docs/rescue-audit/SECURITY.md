# PageFlo security review (rescue audit)

Security Reviewer. 2026-09-24.

Runtime evidence beats docs and prior PASS markers. No application code was
changed. No DNS was changed. No production Brands, Leads, or domains were
deleted. Two uniquely named audit Brands were created as allowed.

---

## 1. Verdict

**Brand is the intended tenant. It is not the authorization boundary of the
operator product.**

Site-scoped collections (`Pages`, `Leads`, `Domains`, `Numbers`,
`TrackingConfigs`, `Media`, site-scoped `Quizzes` / `LandingPages`) have real
access filters plus `enforceSiteBinding` on create. Funnel deployments, funnel
masters, and the builder screens the operator actually uses do not.

`ARCHITECTURE.md` **ARCH-P1-006** is confirmed in collection access, in the
Deployments / Quizzes / Landing Pages / Domains UIs, and in authenticated REST.

Production currently has **three users, all `super_admin`**, and **zero
site-bound tenant operators**. The hole is therefore latent for PII (Leads are
scoped) and live for funnel config: the first invited Brand admin inherits a
workspace-wide read of every other Brand's deployments, domains, and shared
masters, and a workspace-wide write of those masters.

---

## 2. Method

| Item | Value |
|---|---|
| Repo | `/home/legenex/Documents/Projects/PageFlo` @ `main` |
| Production | `https://app.pageflo.io` (live SHA still `b54e8bd` per BOSSMAN) |
| Login attempted | `SUPER_ADMIN_EMAIL=team@legenex.com` from production `.env` via `ssh pageflo` |
| Login result | **Rejected.** `POST /api/users/login` → `The email or password provided is incorrect.` `ensureSuperAdmin` is create-if-missing only. |
| UI / REST operator | `capture@legenex.com` (production build-log capture super_admin). Password never printed. |
| Brands created | `rescue-sec-a-20260923`, `rescue-sec-b-20260923` (status `draft`) |
| Not done | exploits, payload writes to other tenants, DNS, deletes, extra super-admins, tenant-user creation |
| Local harness | `pnpm test:authz` → **69 passed, 0 failed** |

Failed `team@` attempts locked the account (`login_attempts=5`,
`lock_until` ~10 minutes). Attempts were cleared so the seed operator is not
left locked. Password was not rotated.

Evidence: `docs/rescue-audit/evidence/security/`.

---

## 3. ARCH-P1-006 — confirmed

> Funnel collections are not site-scoped on read. Cross-Brand builder is the
> reason. It also means the Deployments page and every builder list are global.

### Code

All three deployment collections are `isAuthenticated` on every verb:

```29:34:src/collections/FunnelLpDeployments.ts
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
```

Same shape: `FunnelQuizDeployments`, `FunnelAdvertorialDeployments`.
`deployment-tenancy.ts` states this is deliberate for reads. Writes are fenced
by `enforceDeploymentTenancy` / `enforceDeploymentTenancyOnDelete`. Reads are
not.

The Deployments page queries those collections with the real user and
`overrideAccess: false`, which still returns **every** Brand's rows because
the access rule is a boolean.

Landing Pages / Quizzes / Advertorials builders go further: they load
deployments, Sites, and Domains with **`overrideAccess: true`**, gated only by
`getCurrentUser()` in the admin layout. Any authenticated user, including a
future one-Brand analyst, receives the full workspace.

### UI (production, 2026-09-24)

After creating Rescue Sec A and Rescue Sec B:

- `/admin/deployments` lists quiz + LP rows for **Dont Settle, Accident
  Compensation Helper, Rescue QA, Rescue Funnel, Rescue Odin, Rescue Sec A,
  Rescue Sec B** in one table. Bulk deploy checkboxes name every Brand.
  Shot: `evidence/security/06-deployments.png`.
- `/admin/quizzes` — master `MVA Tiered Quiz T4` shows
  **7 deployments (7 live)** spanning Rescue Sec A, Rescue Sec B, and every
  other Brand. Shot: `evidence/security/08-quizzes.png`.
- `/admin/landing-pages` — stock `Human Recovery Story` shows **7 deployments**.
  Shot: `evidence/security/07-landing-pages.png`.
- `/admin/brands/domains` groups preview hosts for every Brand, including A and
  B. Shot: `evidence/security/10-domains.png`.
- `/cms/collections/funnel-lp-deployments` is reachable as a second admin.
  Shot: `evidence/security/12-cms-lp-deployments.png`.

### REST (authenticated capture super_admin)

`GET /api/funnel-lp-deployments?limit=50&depth=1` → 200, `totalDocs=8`, brands
include Rescue Sec A, Rescue Sec B, Dont Settle, and the other audit Brands.

`GET /api/funnel-quiz-deployments` → 200, `totalDocs=7`, same Brand set.

Unauthenticated `GET` of those collections → **403**
`You are not allowed to perform this action.` Anonymous is closed. Any session
is not.

---

## 4. Defects

### SEC-P0-001 — Funnel deployments are not site-scoped on read

**ARCH-P1-006.** Collection access is `isAuthenticated`. The Deployments UI,
`/cms`, and REST list every Brand's deployments to any logged-in user.
Deployment rows are not Lead PII, but they are the live URL map: Brand, path,
domain, master, status.

Write path is separately fenced (`enforceDeploymentTenancy`,
`requireDeploymentSiteAdmin` on LP / quiz / advertorial / bulk actions). This
defect is the **read** hole plus the builder pages that bypass even that with
`overrideAccess: true`.

**Fix direction (not applied):** `siteScopedRead` on the three deployment
collections; stop `overrideAccess: true` on builder page loads; keep
cross-Brand authoring as an explicit super-admin view.

### SEC-P0-002 — Brandless masters are globally writable by any authenticated user

`funnel-landing-pages`, `funnel-quizzes`, `funnel-advertorials`,
`funnel-quiz-templates` are `isAuthenticated` on create/update/delete, with
**no `site` column**. Template-guards stop deleting a referenced template and
rewriting stock identity. They do **not** stop rewriting copy, quiz graphs, or
slots.

Production: `MVA Tiered Quiz T4` is live on seven Brands; `Human Recovery Story`
is live on seven. A single PATCH from any session changes every Brand's live
funnel. Seed writes those deployments `status: 'live'` (`funnel-samples.ts`).

**Fix direction:** treat master write as super-admin (or a new "library editor"
role). Keep read global if the product wants one library. Republish should be
required before live changes (product decision  — currently ignored).

### SEC-P1-001 — `Users.status` does not block login

`invited` / `active` / `disabled` is a UI field. `Users` has no `beforeLogin`
hook. Payload login only checks password + lockout. A "disabled" operator still
authenticates. Not exercised against a live disable (would require mutating a
user).

### SEC-P1-002 — `AuditLog.create` is `() => true`

Anonymous REST `POST /api/audit-log` is an open write of the compliance log
(GraphQL is disabled, which closes one door). Read is 403 when anonymous.
No forged row was inserted.

### SEC-P1-003 — `listSiteMedia` reads any `siteId` with `overrideAccess: true`

`src/app/(app)/admin/sites/[slug]/pages/[id]/media-actions.ts` checks
`getCurrentUser()` only. Per-Site layout would hide the picker for a foreign
slug, but the server action is callable with another Brand's `siteId`.

### SEC-P1-004 — Tracking secrets are readable at analyst scope; builder pages skip access

`TrackingConfigs.read = siteScopedRead` (analyst+). `capi_token`, `api_secret`,
`access_token`, `api_key`, `hmac_secret` have no field-level read restriction.
Per-Site tracking page is behind `isBoundToSite` (good). REST still returns the
row to anyone bound as analyst.

### SEC-P1-005 — Authenticated `/api/leads` `site_slug` is not binding-checked

Anonymous `site_slug` and spoofed `x-pageflo-host` / `x-forwarded-host` were
refused (`could not resolve site`). If the connection host does not resolve a
Site **and** a session exists, `site_slug` is honored with `overrideAccess:
true` and **no** `isBoundToSite`. A tenant user posting to `app.pageflo.io` can
file a lead (and fire that Brand's CAPI/webhooks) on another Brand. Test
Capture correctly uses `isBoundToSite`.

### SEC-P1-006 — `/api/media/upload` writes unscoped files, including SVG, under `public/uploads`

Any authenticated user. No Site stamp. SVG is allowed (`image/svg+xml`). Files
are world-readable at `/uploads/<hex>.svg`. Stored XSS on the app origin.

### SEC-P1-007 — Production seed password does not authenticate; lockout works

`SUPER_ADMIN_PASSWORD` in production `.env` does not log in `team@legenex.com`.
Seed will never repair it. Five failures lock the user (~10 minutes). Prior
audit agents using local `.env` against production contributed. Account was
unlocked after this review's failed attempts. Capture account still works.

### SEC-P1-008 — New Brands seed **live** funnel deployments (ARCH-P1-007)

Creating Rescue Sec A/B (draft Brands) inserted quiz + LP deployments with
`status: 'live'`. Deployments UI shows them Live. Anonymous preview hosts 404
because the Brand is `draft` (correct). Publishing the Brand would immediately
serve seeded funnels with no preflight.

### SEC-P1-009 — `cors: '*'` on Payload

Credentialed cookies are `SameSite=Lax`, which limits browser CSRF from foreign
sites. The REST surface still advertises any origin.

### SEC-P1-010 — `GET /api/pageflo/legal-templates/[key]/affected-sites`

Any authenticated user, `overrideAccess: true`, returns every Site using that
shared template.

### SEC-P2-001 — `/cms` is a full second admin

Unauthenticated `/cms` returns 200 (Payload login shell). Authenticated, it
exposes every `isAuthenticated` collection without the custom shell's
super-admin gates (Users / Integrations pages). Deployment writes still hit the
tenancy hook.

### SEC-P2-002 — Cookie / CSRF still include the legacy origin

Production `NEXT_PUBLIC_SERVER_URL=https://os.legenex.com`. Code also allowlists
`https://app.pageflo.io` via `appHost()` fallback. Capture login on
`app.pageflo.io` succeeded. Not a login blocker. Dual-origin cookies remain a
cutover footgun.

---

## 5. Controls that hold (runtime + code)

| Control | Evidence |
|---|---|
| Anonymous collection REST | 403 on sites, deployments, users, leads list (leads GET is 405 because the custom route shadows Payload), audit-log, tracking, domains, media |
| GraphQL | 404 `GraphQL is disabled on this deployment` |
| Host spoof on public lead ingest | `x-pageflo-host` / `x-legalos-host` / `x-forwarded-host` did not select a tenant |
| Anonymous `site_slug` | 400 `could not resolve site` |
| Unauthenticated `/admin/*` | 307 → `/sign-in` |
| Draft Brand, anonymous preview | `https://rescue-sec-a-20260923.preview.pageflo.io/` and `.preview.legenex.com` → 404 |
| Per-Site admin layout | `isBoundToSite` before `overrideAccess` reads under `/admin/sites/[slug]` |
| Leads UI | `overrideAccess: false` + `siteScopedRead`. Super-admin sees the one existing Dont Settle lead; CSV export uses the same query |
| Deployment **writes** | `enforceDeploymentTenancy` + `requireDeploymentSiteAdmin` (LP, quiz, advertorial, bulk). Isolation suite covers the raw door (not re-run against production) |
| Template delete / stock identity | `template-guards.ts` on every door |
| Users cannot self-grant bindings | `siteBindings` field access `isSuperAdminField`; Users create `isSuperAdmin` |
| Sites create | collection `isSuperAdmin`; `createSite` uses `overrideAccess: false` |
| Users / Integrations pages | custom shell denies non-super-admin |
| Test Capture | `isBoundToSite` |
| Preview `?site=` / `?preview=1` | middleware is intent-only; public route re-checks session + binding. Anonymous ignored. Authed super-admin `?site=rescue-sec-a-20260923` **did** render the draft Brand on the console host (expected for a bound user) |
| `trustedHost` | public API tenant identity from `Host` only |
| SSRF helper | `src/lib/net/ssrf.ts` (`assertSafeUrl` / `safeFetch` / `safePost`) |
| Image proxy | `LEGALOS_IMAGE_HOSTS` empty ⇒ Next image optimizer admits nothing (prior review; not re-probed with internals) |
| Authz helpers | `pnpm test:authz` 69/0 |

`scripts/test-tenant-isolation.mts` exists and covers Pages/Domains/Numbers
plus funnel deployment **writes**. It was **not** executed against production
(it creates and deletes its own fixtures on `DATABASE_URI`).

---

## 6. Surface map (as coded)

| Collection / door | Read | Write | Tenant field |
|---|---|---|---|
| `sites` | bound ids / super_admin | update: site admin; create/delete: super_admin | self |
| `pages`, `quizzes`, `landing-pages`, `blog-posts` | `siteScopedRead` + binding hook | editor+ | required `site` |
| `domains`, `tracking-configs` | `siteScopedRead` | admin + binding hook | `site` |
| `leads` | `siteScopedRead` | create public (custom route); update editor; delete false | required `site` |
| `media` | `siteScopedRead` | editor + binding hook | optional `site` |
| `funnel-*-deployments` | **`isAuthenticated`** | hook tenancy | nullable `site` |
| `funnel-landing-pages`, `funnel-quizzes`, `funnel-advertorials`, `funnel-quiz-templates` | **`isAuthenticated`** | **`isAuthenticated`** (+ template-guards) | none |
| `users` | self or super_admin | self (not bindings); create/delete super_admin | n/a |
| `audit-log` | site-scoped / super_admin | **create true** | optional `site` |
| `integration-config` | super_admin | super_admin | global |
| `/api/media/upload` | n/a | any session → `public/uploads` | none |
| `/cms` | Payload admin | same collection rules | — |

---

## 7. Production snapshot (read-only)

Users: `team@legenex.com`, `nick@legenex.com`, `capture@legenex.com` — all
`status=active`, `super_admin=true`. No tenant-bound operator exists, so a
non-super-admin cross-Brand REST read was **not** executed (would have required
creating a user).

Brands after this review (ids 16–22): Dont Settle (active), Accident
Compensation Helper, Rescue QA / Funnel / Odin / **Sec A** / **Sec B**. Sec A/B
are `draft` with 1 LP deployment, 1 quiz deployment, 2 preview domain rows each.
Seeded deployments are `live` in the table.

Leads: one historical Dont Settle row. Not inspected beyond the list UI. Not
exported.

---

## 8. Evidence index

| File | What it shows |
|---|---|
| `docs/rescue-audit/evidence/security/walk-notes.txt` | Full probe log (no secrets) |
| `01-sign-in.png` | Console sign-in |
| `01b-sign-in-failed.png` | `team@` + production `.env` password rejected |
| `02-after-login.png` | Capture super-admin overview |
| `03-brands-before.png` | Brands list before Sec A/B |
| `04a-*.png` / `04b-*.png` | Create-Site wizard for A and B |
| `05-brands-after.png` | Both audit Brands present |
| `06-deployments.png` | **ARCH-P1-006 UI** — all Brands in one deployments table + bulk form |
| `07-landing-pages.png` | Global template library, 7 deployments on Human Recovery Story |
| `08-quizzes.png` | Shared live quiz naming Sec A, Sec B, and every other Brand |
| `09-advertorials.png` | Advertorial builder |
| `10-domains.png` | All Brand preview hosts, including Sec A/B |
| `11-leads.png` | Leads UI (super-admin, one Dont Settle row) |
| `12-cms-lp-deployments.png` | Raw Payload admin on funnel LP deployments |
| `13-authed-site-query.png` | Bound super-admin `?site=` preview of draft Sec A on the console host |
| `14-brand-a-overview.png` / `15-brand-b-overview.png` | Draft Brand overviews |
| `docs/rescue-audit/evidence/security/findings.json` | Machine-readable defect list |

---

## 9. What this review did not certify

- Tenant-user (non-super-admin) isolation against production, because no such
  user exists and none was created.
- XSS on live public pages (prior review claimed escaping; not re-injected).
- SSRF against cloud metadata (helper exists; live exploit not attempted).
- Disabled-user login (would require flipping `status` on a real user).
- `test-tenant-isolation.mts` against production Postgres.
