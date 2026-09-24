# DOMAINS — production domain, TLS, and routing audit

Odin. Rescue audit. 2026-09-24.

Runtime evidence beats `docs/STATE.md`, W60 PASS markers, and the handbook.
No application code was changed. Public DNS was not changed. Nginx was not
reloaded. Certificates were not issued.

---

## 1. Verdict

Preview hosts **route and terminate TLS**. Custom domains **almost do not exist**.
The operator console **does not tell those two facts apart**.

What actually works today:

- `*.preview.pageflo.io` and `*.preview.legenex.com` resolve to `51.81.202.161`,
  present Let's Encrypt wildcards, and proxy to the Next.js app.
- Dont Settle answers `200` on **both** preview suffixes with real brand HTML.
- A newly created Brand gets two preview rows, both painted **ACTIVE**, plus a
  **View Live Site** button. The public URL is `404` until the Brand is
  published, and a console login does not follow the operator onto the preview
  host.

What does not work:

- Every preview row is `status=active` / `ssl_status=unknown`. The Domains page
  shows a green **ACTIVE** pill and never prints `ssl_status`.
- The quiz deployment picker requires `status=active AND ssl_status=active`, so
  it treats every live preview host as **certificate pending** and will not
  select it. The LP picker uses `domainEligibility` and will. The advertorial
  picker offers raw host strings, including other brands' hosts, with no
  eligibility test.
- There is no custom domain in production that can serve, other than leftover
  nginx vhosts with **no** `domains` row (`getwhatyoureowed.co`,
  `crashclaim.co`, `test.checkmyclaim.co`). Connecting a new hostname cannot
  become publicly usable until acme.sh issues a cert; until then unmatched SNI
  presents **crashclaim.co**. The Add Domain UI still tells the operator that
  the A/CNAME record "Serves the site AND verifies ownership".
- `SUPER_ADMIN_PASSWORD` in production `.env` does not log `team@legenex.com`
  in. The walk used `capture@legenex.com` from the same file.

Operator complaints "Domains" and "Preview domains" are **not disproven**. They
are one product surface with three health contracts.

---

## 2. Measured production environment

Read from `/var/www/vhosts/legenex.com/os.legenex.com/.env` on `ssh pageflo`.
Values below are the live names. Secrets are not printed.

| Key | Production value |
|---|---|
| `NEXT_PUBLIC_SERVER_URL` | `https://os.legenex.com` |
| `LEGALOS_FALLBACK_HOST` | `os.legenex.com` |
| `LEGALOS_PREVIEW_DOMAIN` | `preview.legenex.com` |
| `LEGALOS_CNAME_TARGET` | `os.legenex.com` |
| `LEGALOS_A_TARGET` | `51.81.202.161` |
| `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY` | `true` |
| `LEGALOS_DEV_SKIP_DNS` | `false` |
| `PAGEFLO_APP_HOST` | unset (code fallback `app.pageflo.io`) |
| `PAGEFLO_PREVIEW_DOMAIN` | unset (code fallback `preview.pageflo.io`) |
| `PAGEFLO_SERVER_URL` | unset (so Payload `serverURL` is `https://os.legenex.com`) |
| `PAGEFLO_LEGACY_PREVIEW_DOMAIN` | unset (legacy reader uses `LEGALOS_PREVIEW_DOMAIN`) |
| `PAGEFLO_CNAME_TARGET` / `PAGEFLO_A_TARGET` | unset (legacy names used) |
| `PAGEFLO_ENFORCE_DOMAIN_ELIGIBILITY` | unset (legacy flag `true` is what runs) |
| `PAGEFLO_LEGACY_HOST_REDIRECT` | unset (do not flip) |
| `PLESK_API_URL` | `https://51.81.202.161:8443` |
| `PLESK_PROXY_TARGET` | `http://127.0.0.1:3000` |
| `PLESK_IP_ADDRESS` | `51.81.202.161` |
| `PLESK_INSECURE_SKIP_TLS_VERIFY` | `true` |

`classifyHost` therefore still works: `app.pageflo.io` is the console by
code fallback, `os.legenex.com` is a legacy-app host, tenant hosts fall
through to `Domains`. Cookie/CSRF `serverURL` remains the **legacy** origin.

---

## 3. How a hostname actually reaches the app

Three layers, independently owned. They disagree.

```text
browser
  -> public DNS (A 51.81.202.161 or CNAME os.legenex.com)
  -> nginx on 51.81.202.161:443
       /etc/nginx/conf.d/legalos-tenants/*.conf     (PageFlo tenant / preview / app)
       /etc/nginx/plesk.conf.d/vhosts/*.conf        (Plesk sites: os.legenex.com, …)
  -> proxy_pass http://127.0.0.1:3000
  -> Next middleware stamps x-pageflo-host
  -> resolveSiteByHost (domains row + preview alias)
  -> domainEligibility (if LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY=true)
  -> public router (Site.status draft/paused/archived overlay)
```

**Plesk is not the tenant domain list.** `plesk bin domain --list` returns 14
hosts (`os.legenex.com`, `legenex.com`, `claimsmart.co`, …). **None of them is
`pageflo.io`, `app.pageflo.io`, `preview.pageflo.io`, or a customer preview.**
Tenant TLS lives under `/etc/nginx/conf.d/legalos-tenants/`, included from
`/etc/nginx/conf.d/legalos-tenants.conf`. Provisioning writes those files
directly (`src/lib/plesk/provision-domain.ts`) and talks to acme.sh. The
function is still named `provisionDomainInPlesk`.

Live tenant nginx files:

| File | `server_name` | Cert | Notes |
|---|---|---|---|
| `crashclaim.co.conf` | `crashclaim.co www.crashclaim.co` | `/etc/ssl/legalos/crashclaim.co/` | **`default_server` on :80 and :443** |
| `preview.pageflo.io.conf` | `preview.pageflo.io *.preview.pageflo.io` | wildcard `*.preview.pageflo.io` + apex | |
| `preview.legenex.com.conf` | `*.preview.legenex.com` | wildcard only (apex **not** in SAN, apex **has no DNS**) | |
| `pageflo-app.pageflo.io.conf` | `app.pageflo.io` | `app.pageflo.io` | |
| `pageflo.io.conf` | `pageflo.io www.pageflo.io` | both names | |
| `getwhatyoureowed.co.conf` | `getwhatyoureowed.co` | matching cert | **no `domains` row** |
| `test.checkmyclaim.co.conf` | `test.checkmyclaim.co www.test.checkmyclaim.co` | matching cert | **no `domains` row** |

Unmatched SNI to `51.81.202.161:443` presents `CN=crashclaim.co` (measured,
verify-off handshake). That is not historical. The file sets
`listen 51.81.202.161:443 ssl default_server` on purpose. Comments in the
preview vhost say so.

acme.sh cron: `53 5,11,17,23 * * * acme.sh --cron`. Wildcards and tenant certs
are installed under `/etc/ssl/legalos/`. Renew window for
`*.preview.legenex.com` is 2026-10-14; for `*.preview.pageflo.io` 2026-11-19.

There is **no** systemd timer that retries DNS verify or SSL polling.
`legalos-keepalive.timer` and `legalos-dev-restart.timer` (daily 04:00 UTC)
are the only LegalOS timers. `pollDomainSslStatus` is an in-process 12×30s
promise. A restart kills it and leaves `status=provisioning`.

---

## 4. Live `domains` inventory (Postgres, after this audit)

Before any Odin writes, production had **two Brands** and **three preview
rows**. No custom domain rows at all. Other rescue agents then created Brands.
Odin created `rescue-odin-20260923` (site 22) and one pool-then-attached
hostname that does **not** exist in public DNS.

| id | host | kind | status | ssl_status | primary | site |
|---:|---|---|---|---|---|---|
| 70 | `dont-settle.preview.legenex.com` | preview | active | unknown | yes | 16 Dont Settle |
| 71–72 | `accident-compensation-helper.preview.{pageflo.io,legenex.com}` | preview | active | unknown | pageflo primary | 17 |
| 73–80 | rescue-qa / funnel / sec-a / sec-b, both suffixes | preview | active | unknown | pageflo primary | 18–21 |
| 81 | `rescue-odin-20260923.preview.pageflo.io` | preview | active | unknown | **yes** | 22 |
| 82 | `rescue-odin-20260923.preview.legenex.com` | preview | active | unknown | no | 22 |
| 83 | `rescue-odin-20260923.example` | custom | pending | pending | no | 22 |

Dont Settle is the only Brand that still has **one** preview row (legacy
suffix, primary). `dont-settle.preview.pageflo.io` has **no row**. It still
resolves: `previewAliasHosts` maps it onto row 70.

`ssl_status='active'` is not present on any row. The only writer of that
value is `src/lib/ssl-poll.ts`, and it never ran for these previews.

---

## 5. Preview suffixes — what was verified

TLS and DNS (this workstation, 2026-09-24):

| Host | A | Cert SAN | TLS |
|---|---|---|---|
| `dont-settle.preview.pageflo.io` | `51.81.202.161` | `*.preview.pageflo.io`, `preview.pageflo.io` | OK, LE, notAfter 2026-12-19 |
| `dont-settle.preview.legenex.com` | `51.81.202.161` | `*.preview.legenex.com` | OK, LE, notAfter 2026-11-12 |
| `rescue-odin-20260923.preview.pageflo.io` | same | same pageflo wildcard | OK **before the Brand existed** |
| `rescue-odin-20260923.preview.legenex.com` | same | legenex wildcard | OK **before the Brand existed** |
| `preview.pageflo.io` (apex) | `51.81.202.161` | covered | OK; self-check 404 (not a Site) |
| `preview.legenex.com` (apex) | **no DNS** | **not in SAN** | `gaierror` |

HTTP:

| URL | Result |
|---|---|
| `https://dont-settle.preview.pageflo.io/` | **200** `Home \| Dont Settle`, brand HTML |
| `https://dont-settle.preview.legenex.com/` | **200** same brand |
| `https://dont-settle.preview.{both}/api/legalos/self-check` | `ok:true`, `site_id:"16"`, `eligible:true`. Primary reported as `dont-settle.preview.legenex.com` |
| `https://rescue-odin-20260923.preview.{both}/api/legalos/self-check` | after create: `ok:true`, `site_id:"22"`, `eligible:true` |
| `https://rescue-odin-20260923.preview.{both}/` | **404** Page not found (anonymous **and** with a console session) |
| same + `?preview=1` / `?site=rescue-odin-20260923` | **404** (no cookie on the tenant host) |
| `https://rescue-qa-20260923.preview.pageflo.io/` | **200** (that Brand is `sites.status=active`) |
| `https://dontsettle.co/` | **200** Cloudflare / Base44. **Not PageFlo.** A `216.24.57.1` |
| `https://getwhatyoureowed.co/` | TLS OK for that name, app **404** `host not mapped to any site` |
| `https://crashclaim.co/` | TLS OK for that name, app **404** |

Dont Settle on both suffixes is **real**. The W60 claim is still true for that
one published Brand. It is **not** true for a Brand the operator just created.

`createSite` writes `{slug}.{PAGEFLO_PREVIEW_DOMAIN}` as primary (fallback
`preview.pageflo.io`) and the other root as non-primary. The New Brand wizard
hardcodes `preview.pageflo.io` in the preview card even though
`LEGALOS_PREVIEW_DOMAIN` is the only preview env var actually set.

---

## 6. Add Domain UI (tested, no public DNS change)

Modal at `/admin/brands/domains`.

| Input | UI result |
|---|---|
| empty | `Enter a hostname (e.g. example.com)` |
| `noperiod` | `invalid host` |
| `localhost` | `invalid host` |
| `dont-settle.preview.legenex.com` | `host … is already in use` |
| `https://dont-settle.preview.legenex.com/foo` | stripped to host, same duplicate error |
| `rescue-odin-20260923.example` | created in Unassigned as **PENDING** |

Validation is `host.includes('.')` after stripping scheme/path/port. That is
the whole public hostname policy. `not-a-real-tld.example` is accepted.

Unassigned expanded row:

- Attach-to-brand select.
- DNS table: for this apex, **A `rescue-odin-20260923.example` → `51.81.202.161`**
  with copy *"Points your root domain at PageFlo. Serves the site AND verifies
  ownership."*
- Hint: *"Add the required record … then click Verify DNS."*
- **There is no Verify DNS button until the row is attached.**

Attach to Rescue Odin + Verify DNS (still no public DNS): row stays
`pending/pending`, `last_checked_at` stamped, no nginx file, no cert, no
error banner. The operator sees **PENDING** next to two **ACTIVE** preview
rows and has no explanation that DoH returned nothing.

CNAME instructions for a subdomain would tell the tenant to CNAME to
`os.legenex.com` (the legacy console host), not a dedicated `cname` name.

---

## 7. UI says healthy / ready — runtime says not

These are the cases that make Domains feel broken. Each was observed, not
inferred from a comment.

### 7.1 Green ACTIVE on every preview, `ssl_status=unknown`

`BrandDomainRow` / `AttachedDomainRow` / Brand identity domain tab colour
**only** `status`. `ssl_status` is never rendered. Production: 13 preview
rows, all `active/unknown`, all green **ACTIVE**.

`domainEligibility`: preview is servable on `status` alone
(`PREVIEW_REQUIRES_SSL = false`). Custom requires both fields `active`.

Quiz builder (`QuizBuilderApp.tsx`):

```ts
isEligible: (_rec, d) => d.status === 'active' && d.sslStatus === 'active'
```

That rejects every preview host in production. LP editor calls
`isDomainSelectable`. Advertorial `<Select>` maps `brand.domains` as host
strings and then appends **every other brand's hosts**.

One Brand, three answers: "Active", "certificate pending", "here is Dont
Settle's host too".

### 7.2 View Live Site on a draft Brand

Rescue Odin dashboard (shot `06-brand-dashboard.png`):

- Badge **Partial** (honest: `site.status=draft`).
- Primary link `rescue-odin-20260923.preview.pageflo.io`.
- Red **View Live Site**.
- **2 Live funnels serving this Site now** (`/c/…` LP, `/s/…` quiz).
- **12 Active Pages**.

Clicking the preview URL, with or without the console session, is **404**.
`self-check` on the same host is `ok:true, eligible:true`. Eligibility does
not consult `sites.status`. The public router 404s drafts for anyone whose
**request host** has no session cookie. Console cookies are host-only on
`app.pageflo.io`. They do not exist on `*.preview.pageflo.io`.

`?preview=1` does not help from a cold browser. The operator cannot preview
a new Brand without publishing it. That is the preview-domain complaint.

Contrast: `rescue-qa-20260923` is `sites.status=active` and its pageflo.io
preview returns **200**. Same TLS, same nginx wildcard, different Site
status.

### 7.3 DNS record "serves the site"

`buildDnsRecords` plus the Domains table copy. One A or CNAME is described
as both routing and ownership. `checkDomainDns` only asks Cloudflare DoH
whether CNAME=`os.legenex.com` or A=`51.81.202.161` or TXT `_legalos.<host>`.

Packets to an unprovisioned name still hit nginx. Unmatched SNI presents
**crashclaim.co**. A real browser fails hostname verification. The UI never
says that. Status `verified` is painted green if it ever appears; the current
verify pipeline **never writes `verified`** — it jumps `pending → provisioning
→ active|error`.

### 7.4 Infrastructure without a row

| Host | TLS | nginx | `domains` row | App |
|---|---|---|---|---|
| `getwhatyoureowed.co` | valid for that name | tenant vhost | **none** | 404 not mapped |
| `crashclaim.co` | valid; **default SNI** | tenant vhost | **none** | 404 not mapped |
| `test.checkmyclaim.co` | valid | tenant vhost | **none** | not walked; no row |
| `dontsettle.co` | Google Trust / Cloudflare | not this server | **none** | third-party site |

Nginx comments still claim getwhatyoureowed is "Site 13 Don't Settle". Site
16 is Dont Settle now. The vhost is leftover. Paid traffic pointed here
would handshake and then 404.

### 7.5 Dont Settle's missing pageflo.io row

UI lists one host, green ACTIVE, star primary, suffix `preview.legenex.com`.
`https://dont-settle.preview.pageflo.io/` is 200 via alias. The Domains page
does not mention the alias. New Brands show two rows. Dont Settle looks
"incomplete" next to them and is the only Brand that actually serves.

### 7.6 Make-primary star vs server

UI enables the star when `status` is `active` **or `verified`** or kind is
preview. `mayBecomePrimary` rejects custom rows unless **both** status and
ssl are `active`. Clicking the star on a DNS-only row fails after the fact.

`pollDomainSslStatus` success path sets `primary: true` itself and demotes
the preview. The operator never clicked the star. The star is not the
cutover.

### 7.7 Advertorial / Deployments URL printers

Advertorial list, when no domain is bound:

`https://preview.legenex.com/a/${id}`

That host is the wildcard **root**, not a Site, and `/a/:id` is not a public
route. Deployments `hostOf` / `previewOf` / `previewUrlForBrandPath` print a
third family of URLs (`{slug}.{PAGEFLO_PREVIEW_DOMAIN}`).
`effectiveDeploymentUrl` is the one contract that consults eligibility; quiz
and advertorial lists do not all use it.

---

## 8. Defects

### DOM-P0-001 — Preview URL is Active / Live / View Live Site and 404s

**What the UI said:** Rescue Odin preview hosts **ACTIVE**, primary
`rescue-odin-20260923.preview.pageflo.io`, **View Live Site**, **2 Live
funnels serving this Site now**.

**What runtime did:** TLS OK (wildcard). `self-check` `ok:true eligible:true
site_id:22`. HTML **404** for anonymous and for a logged-in super-admin
whose cookie is on `app.pageflo.io`. `sites.status=draft`. `?preview=1`
without a tenant-host session still 404s.

**Why:** Preview rows are minted `status=active` at Brand create. Brand
create always writes `sites.status=draft`. Public router 404s drafts unless
`isBoundToSite` on **that request**. Console session does not ride to the
preview host. Funnel seed still marks deployments live.

**Evidence:** `06-brand-dashboard.png`, `07-site-settings-domains.png`,
`14-preview-pageflo-authed.png`, `18-anon-odin-pageflo.png`,
`http-after-create.json`. Contrast: Dont Settle and rescue-qa previews 200
when `sites.status=active`.

This is the operator "preview domains" ticket.

### DOM-P0-002 — One domain, three health contracts

**What the UI said:** every preview **ACTIVE** (green). Quiz picker (code):
not selectable unless `ssl_status=active`. LP picker: selectable.
Advertorial picker: every host string in the system.

**What runtime did:** production has **zero** rows with `ssl_status=active`.
Preview traffic still serves (Dont Settle 200). Quiz builder therefore
cannot honestly target the only hosts that work.

**Evidence:** `08-brands-domains.png`, `db-domains.txt`,
`src/components/builder/quiz/QuizBuilderApp.tsx` vs
`src/lib/domain-eligibility.ts` vs
`src/components/builder/advertorial/AdvertorialBuilderApp.tsx` (~line 1130).

### DOM-P0-003 — "This DNS record serves the site" vs crashclaim SNI

**What the UI said:** A `rescue-odin-20260923.example → 51.81.202.161`
"Serves the site AND verifies ownership." Verify DNS is the next step after
attach.

**What runtime did:** Verify against a name with no public DNS left the row
`pending/pending` with a timestamp and no error copy. A name that **did**
A-record to this IP, without a tenant vhost, would present **crashclaim.co**
and fail in a browser. Custom `ssl_status=active` only after
`pollDomainSslStatus` does a real HTTPS GET of `/api/legalos/self-check`.
There is no background retry. Daily `legalos-dev-restart.timer` kills an
in-flight poller and can leave `provisioning` forever until someone clicks
re-check.

**Evidence:** `13-example-dns-records.png`, `24-after-verify.png`, unmatched
SNI cert dump, `crashclaim.co.conf` `default_server`,
`src/lib/ssl-poll.ts`, empty 7-day journal for `ineligible host` /
`self-check`.

### DOM-P1-001 — Dual preview suffix is live on the wire, split in the table

Dont Settle: one row, legenex primary; pageflo.io works by alias only.
New Brands: two rows, pageflo.io primary. Apex `preview.legenex.com` has
no DNS and is not on the wildcard cert; apex `preview.pageflo.io` is.
`PAGEFLO_PREVIEW_DOMAIN` unset, `LEGALOS_PREVIEW_DOMAIN=preview.legenex.com`,
code canonical is `preview.pageflo.io`.

### DOM-P1-002 — Leftover tenant vhosts with no Domain row

`getwhatyoureowed.co`, `crashclaim.co` (also default SNI),
`test.checkmyclaim.co`. Valid certificates, app 404. Plesk list has no
`pageflo.io`. Connecting a customer domain does not register a Plesk domain
and does not show up in Plesk.

### DOM-P1-003 — CNAME target is the legacy console host

Tenants are told to CNAME to `os.legenex.com`. That name is a Plesk vhost
for the old app origin, not a dedicated routing hostname. It does resolve to
the right IP. Combined with DOM-P0-003 it is the wrong *story*.

### DOM-P1-004 — Advertorial / Deployments print URLs the router will not serve

`https://preview.legenex.com/a/{id}` and `{host}/a/{slug}`. See Archie
`effectiveDeploymentUrl`. Domain-shaped lie, not a TLS bug.

### DOM-P1-005 — Delete teardown uses the wrong `pleskIsConfigured`

`brands/domains/actions.ts` imports `pleskIsConfigured` from
`src/lib/plesk/client.ts` (API URL+key). Provisioning itself uses
`src/lib/plesk/provision-domain.ts` (always true unless
`PAGEFLO_DISABLE_PROVISIONING`). Production happens to have Plesk API keys
set, so delete may still unprovision. A host without those keys would leave
nginx+cert behind. `removeDomain` on the site settings path imports the
filesystem predicate.

### DOM-P1-006 — Payload `serverURL` is still `https://os.legenex.com`

Console is `https://app.pageflo.io`. CSRF origins are derived and include
the app host fallback, which is why capture-user login worked. Cookie
`Secure`/`Domain` still follow Payload's configured server URL plus
host-only `Set-Cookie` from `signIn`. This is the cutover footgun, not a
broken console today.

---

## 9. What this audit created (left in production)

Allowed uniquely-named audit assets. Not deleted.

- Brand `rescue-odin-20260923` (site 22, **draft**).
- Preview rows 81–82.
- Custom row 83 `rescue-odin-20260923.example` attached, `pending/pending`.
  **No public DNS change. No cert. No nginx file.**

---

## 10. Evidence index

All under `docs/rescue-audit/evidence/odin/`.

| File | What it shows |
|---|---|
| `01-sign-in.png` / `01b-sign-in-failed-super_admin.png` | `team@legenex.com` + production `.env` password rejected |
| `02-after-login.png` | `capture@legenex.com` reached `/admin/overview` |
| `04-new-brand-modal.png` / `05-new-brand-filled.png` | wizard preview host `*.preview.pageflo.io` |
| `06-brand-dashboard.png` | Partial + View Live Site + 2 Live funnels |
| `07-site-settings-domains.png` | both suffixes ACTIVE, pageflo PRIMARY |
| `08-brands-domains.png` | every preview ACTIVE; Dont Settle one row |
| `10-add-domain-modal.png` + `11-add-*.png` | invalid / duplicate / success |
| `13-example-dns-records.png` | A record copy "serves the site" |
| `14` / `15` / `18-anon-odin-*` | preview 404 authenticated and not |
| `16` / `17` / `18-anon-dont-settle-*` | Dont Settle 200 both suffixes |
| `18-anon-getwhatyoureowed.png` / `18-anon-crashclaim.png` | leftover vhosts 404 |
| `22` / `24` | attach + verify, still PENDING |
| `http-after-create.json` | self-check vs HTML 404 |
| `db-domains.txt` | live rows |
| `walk-notes.txt` | timestamped walk |
| `_walk.mts` / `_attach.mts` | how the evidence was taken |

SSH was read-only: env keys, `plesk bin domain --list`,
`/etc/nginx/conf.d/legalos-tenants/*`, `/etc/ssl/legalos/*`, acme.sh
`--list`, `journalctl -u legalos-dev.service` (no ineligible-host lines in
7 days), `systemctl list-timers`.
