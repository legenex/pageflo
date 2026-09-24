# DOMAIN-LIFECYCLE — the state machine that actually runs

Odin. Rescue audit. 2026-09-24.

This is the lifecycle as coded and as measured on production. Intended
states that nothing writes any more are marked **dead**. UI labels that
disagree with eligibility are marked **lie**.

Companion: `DOMAINS.md`.

---

## 1. Two records, not one

A hostname the operator can see is the join of:

1. A `domains` row (`kind`, `status`, `ssl_status`, `primary`, `site`,
   `plesk_domain_id`, `verification_token`, `provisioning_error`,
   `last_checked_at`).
2. A Site (`sites.status`: `draft | active | paused | archived`).
3. Optional nginx vhost + acme.sh cert under `/etc/nginx/conf.d/legalos-tenants/`
   and `/etc/ssl/legalos/`.
4. Public DNS.

The UI shows (1) `status` only, plus a star for (1) `primary`, plus a
dashboard badge that ANDs (1) `status=active` with (2) `sites.status=active`.
It never shows (1) `ssl_status`, (3), or (4).

`self-check` consults (1) and eligibility, **not** (2). The public HTML
router consults all of (1)+(2) and requires a session on **that host** to
relax (2).

---

## 2. Fields

### `kind`

| Value | Who writes it | Can delete | Can detach |
|---|---|---|---|
| `preview` | `createSite` only | no (UI + action) | no |
| `custom` | `createPoolDomain` | yes (type-to-confirm host) | yes, back to pool |

### `status` (row-level, collection enum)

| Value | Who writes it today | UI pill | Servable? (custom) | Servable? (preview) |
|---|---|---|---|---|
| `pending` | create pool; detach reset | yellow PENDING | no | n/a (previews never start here) |
| `verified` | **nobody in the current pipeline** | green VERIFIED **lie** | no (`explain`: DNS verified, no cert) | n/a |
| `provisioning` | `verifyAndPromoteDomain` after DNS ok | yellow | no | n/a |
| `active` | preview at create; custom only via `ssl-poll` success | green ACTIVE | only if `ssl_status=active` | **yes** even if ssl unknown |
| `error` | provision fail or poller timeout | red ERROR | no | n/a |

### `ssl_status`

| Value | Who writes it | Shown in Domains UI? |
|---|---|---|
| `unknown` | preview create (field default); detach | **no** |
| `pending` | pool create; after DNS before poller | **no** |
| `active` | **only** `pollDomainSslStatus` after HTTPS self-check | **no** |
| `error` | poller exhausted | **no** |

`PREVIEW_REQUIRES_SSL = false` in `src/lib/domain-eligibility.ts`. Flip that
without issuing preview certs as `ssl_status=active` and every preview 404s
under `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY=true`.

### `primary`

At most one per Site by convention, not a DB constraint. Writers:

- `createSite`: canonical preview suffix `true`, the other suffix `false`.
- `setPrimary` (star): gated by `mayBecomePrimary`.
- `pollDomainSslStatus` success: **forces** `primary: true` and demotes
  others. No operator click.
- detach / delete: clears or promotes a preview fallback if eligible.

### `site`

`null` = unassigned pool. Preview rows cannot be null (`beforeValidate`).
Unassigned custom rows 404 in `resolveSiteByHost` regardless of status.

### `plesk_domain_id`

Despite the name, provisioning stores the **hostname** once nginx/acme work
succeeds. Pool detach now nulls it. Delete uses it as the teardown key.

---

## 3. Preview lifecycle

```text
createSite(slug)
  │
  ├─ sites.status = draft                          // always
  ├─ domains {slug}.preview.pageflo.io             // PAGEFLO_PREVIEW_DOMAIN fallback
  │     kind=preview status=active ssl=unknown
  │     primary=true
  └─ domains {slug}.preview.legenex.com            // LEGALOS_PREVIEW_DOMAIN
        kind=preview status=active ssl=unknown
        primary=false

No DNS check. No acme.sh. No nginx write.
Covered by existing wildcard vhosts + certs (measured).
```

Existing Dont Settle (site 16) predates dual-write: **only** the legenex
row exists. `{slug}.preview.pageflo.io` still resolves via
`previewAliasHosts` in `resolveSiteByHost`.

```text
request host
  → reserved-host check (app / marketing / legacy-app)  // first
  → domains.host exact
  → else previewAliasHosts(host)                        // other suffix
  → else redirects_from[]
  → admit() = domainEligibility, refused if enforce=true
  → if Site draft and no bound session on THIS host → 404
  → if Site paused and no session → PausedSite
  → if Site archived → 404
```

Preview → custom primary: a non-preview host only 307s to primary when
primary is eligible **and** the request is not preview-to-preview
(`previewToPreview` short-circuit). An ineligible custom primary does
**not** steal the preview off the air (that bug was real on site 13;
the guard is in `resolveSiteByHost`).

**UI lie:** green ACTIVE + View Live Site from the moment of create.
**Runtime:** TLS works; HTML 404 until `sites.status=active`. Console
session does not count, because the cookie is host-only on
`app.pageflo.io`.

Preview rows never enter pending / provisioning / ssl-poll. They can
never reach `ssl_status=active` without a separate backfill. That is why
the quiz picker and the Domains page cannot agree (DOM-P0-002).

---

## 4. Custom domain lifecycle

```text
Add Domain (pool)
  host normalized (strip scheme, path, port, lower)
  reject if !includes('.')
  reject if host unique-conflict
  insert: kind=custom site=null status=pending ssl=pending
          verification_token=random dns_records=buildDnsRecords(host)
          primary=false
  UI: Unassigned / PENDING
  Verify DNS button: hidden (canVerify requires siteId)
  DNS table: shown anyway, copy says "then click Verify DNS"   // lie

Attach to Brand
  requirePoolDomain
  update site=<brand>
  immediately verifyAndPromoteDomain

verifyAndPromoteDomain
  kind must be custom
  DEV skip DNS: unreachable in NODE_ENV=production
  checkDomainDns via Cloudflare DoH:
      CNAME chain ends at LEGALOS_CNAME_TARGET (os.legenex.com)
      OR A == LEGALOS_A_TARGET (51.81.202.161)
      OR TXT _legalos.<host> contains token
      (TXT is accepted, never displayed)
  DNS fail:
      stamp last_checked_at
      stay pending                          // observed on .example
      return ok:true verified:false         // attach reports success!
  DNS ok:
      status=provisioning ssl=pending
      provisionDomainInPlesk(host)          // NOT Plesk domain API
         covered-by-wildcard → ok, no write
         already-managed cert → ok
         else: nginx :80 ACME bootstrap → acme.sh HTTP-01
               → nginx :443 vhost → systemctl reload nginx
      provision fail → status=error ssl=pending, provisioning_error set
      provision ok   → fire-and-forget pollDomainSslStatus (12 × 30s)

pollDomainSslStatus
  GET https://<host>/api/legalos/self-check   // real TLS, no skip
  require JSON app=="legalos" ok==true site_id match
  success:
      status=active ssl=active primary=true
      demote other primaries
      // does NOT publish the Site
  timeout:
      status=error ssl=error
      provisioning_error="self-check failed after 12 attempts: …"

Daily legalos-dev-restart.timer at 04:00 UTC:
  kills the in-process poller
  row can sit in provisioning forever
  manual recheckDomainDns re-launches the poller if status=provisioning
```

`attachDomainToSite` returns `{ ok: true, verified: false }` when DNS
fails. The UI just `router.refresh()`. The operator sees PENDING, not a
toast that DoH missed.

There is **no** cron that walks `pending|error`. Comments in
`brands/domains/actions.ts` and `verifyAndPromoteDomain` still talk about
"the per-site auto-verify poller". Instrumentation only starts the lead
worker. The poller is a comment.

### Provisioning vs Plesk

`src/lib/plesk/provision-domain.ts`:

- Writes `/etc/nginx/conf.d/legalos-tenants/<host>.conf`.
- Issues/installs acme.sh certs into `/etc/ssl/legalos/<host>/`.
- `pleskIsConfigured()` here is `true` unless
  `PAGEFLO_DISABLE_PROVISIONING=true`.
- Refuses to write a per-host vhost for names already covered by an
  acme.sh **wildcard** (`*.preview.pageflo.io`, `*.preview.legenex.com`).
- Protects `crashclaim.co` and the wildcard files from unprovision.

`src/lib/plesk/client.ts` `pleskIsConfigured()` is "API URL and key
present". Brands delete uses that one. Site-settings delete uses the
filesystem one. Production currently has both API keys and filesystem
access, so the split is latent.

Plesk REST is **not** how tenant hosts are created. The Plesk domain
list does not contain `pageflo.io`.

---

## 5. Eligibility vs UI vs pickers

`domainEligibility` (the contract):

```text
no row / no host / no site     → not eligible
status != active               → not eligible (reason named)
preview && !PREVIEW_REQUIRES_SSL
                               → eligible, previewUnverified=(ssl!='active')
custom && ssl != active        → not eligible
else                           → eligible
```

Wired: `resolveSiteByHost` (production enforce=true), publish preflight,
LP deployment picker, `effectiveDeploymentUrl`, `mayBecomePrimary`.

Not wired: quiz picker (stricter, requires ssl active even on preview),
advertorial picker (weaker, all hosts, all brands), Brand identity domain
tab (colours `verified` as success), Domains `StatusBadge` (colours
`verified` green, ignores ssl).

`resolveDomainForProvisioning` is ungated on purpose so the poller can
open `ssl_status=active`. Public HTML must not call it. `self-check`
does, and answers `ok:true eligible:false` for a provisioning custom
host. A draft Site on an eligible preview still gets `eligible:true`
from `self-check` and 404 from `/`. **self-check is not "the site is
live".**

---

## 6. Overlay: Site status

Independent of domain `status`. Applied in
`src/app/(public)/[[...slug]]/page.tsx`.

| `sites.status` | Anonymous on an eligible host | Bound session **on that host** |
|---|---|---|
| `draft` | 404 | content (maySeeUnpublished) |
| `active` | serve | serve |
| `paused` | PausedSite | serve |
| `archived` | 404 | 404 |

Brand dashboard "Ready" = primary domain `status=active` **and** Site
`active`. Rescue Odin showed **Partial** correctly. It still offered
**View Live Site** to a URL that 404s.

Publishing the Brand (`setSiteStatus draft→active`) is the switch that
makes a preview URL return HTML. It is not a domain action. The Domains
page cannot do it. The operator who only opens Domains sees ACTIVE and
thinks the URL works.

---

## 7. Overlay: cookies and host roles

```text
classifyHost
  app.pageflo.io          → app          (console, auth)
  pageflo.io / www        → marketing
  os.legenex.com          → legacy-app   (still serves console; redirect flag off)
  anything else           → tenant
```

`signIn` sets `{cookiePrefix}-token` host-only, `Secure`, `SameSite=lax`,
path `/`. Opening `https://{slug}.preview.pageflo.io` is a different
host. The operator is anonymous there. Draft preview therefore 404s
even from a tab that is logged into the console.

Reserved hosts are never looked up in `domains`. A Domain row cannot
hijack `app.pageflo.io`.

---

## 8. Overlay: nginx / cert / DNS (outside the row)

A row can be `active/active` and still fail in a browser if the vhost or
cert is gone. The inverse is live today: vhost+cert with **no row**
(`getwhatyoureowed.co`) handshakes and then 404s.

Default SNI: first/only `default_server` is `crashclaim.co`. Any
customer hostname that A-records here before provisioning presents that
certificate.

Wildcard coverage: a single-label name under `preview.pageflo.io` or
`preview.legenex.com` is already TLS-complete. `createSite` does not
need to provision. Custom names are not.

DNS for the CNAME target `os.legenex.com` resolves to `51.81.202.161`
(measured). `checkInfra` would mark that OK. It does not prove a
browser can complete TLS for the **customer** name.

---

## 9. State diagram (custom)

```text
                    createPoolDomain
                           │
                           v
                     ┌───────────┐
                     │  pending  │◄──────── detach (site=null, ssl=unknown)
                     │ ssl=pending│
                     └─────┬─────┘
                           │ attach + Verify DNS
              DNS fail ────┤
                           │ DNS ok
                           v
                     ┌──────────────┐     provision fail
                     │ provisioning │───────────────► error / ssl=pending
                     │ ssl=pending  │                      │
                     └──────┬───────┘                      │ Verify DNS
                            │ poller                       │ (retries full pipeline)
                            │                              v
              poller fail   │                    pending|error retry
                   ┌────────┤
                   v        │ poller HTTPS self-check ok
              error/ssl=error
                            v
                     ┌─────────────────────┐
                     │ active / ssl=active │  auto primary=true
                     │                     │  Site status unchanged
                     └─────────────────────┘
```

`verified` sits on the enum and the green badge. Nothing in this diagram
enters it.

---

## 10. State diagram (preview)

```text
createSite ──► active / ssl=unknown / primary (canonical suffix)
          └──► active / ssl=unknown / not primary (other suffix)

        ╳ DNS
        ╳ provision
        ╳ ssl-poll
        ╳ delete
        ╳ detach

Serve HTML iff sites.status=active (or a session cookie on THIS host).
TLS already provided by wildcard vhost.
```

---

## 11. "Healthy" matrix (production, 2026-09-24)

| Host | DNS | TLS | nginx | row | eligibility | Site | HTML |
|---|---|---|---|---|---|---|---|
| `dont-settle.preview.legenex.com` | A | wildcard | wildcard vhost | active/unknown primary | yes | active | **200** |
| `dont-settle.preview.pageflo.io` | A | wildcard | wildcard vhost | **no row, alias** | yes via alias | active | **200** |
| `rescue-odin-20260923.preview.pageflo.io` | A | wildcard | wildcard vhost | active/unknown primary | yes | **draft** | **404** |
| `rescue-odin-20260923.preview.legenex.com` | A | wildcard | wildcard vhost | active/unknown | yes | draft | **404** |
| `rescue-odin-20260923.example` | none | n/a | none | pending/pending | no | draft | n/a |
| `getwhatyoureowed.co` | A here | matching cert | tenant vhost | **none** | n/a | n/a | **404** |
| `crashclaim.co` | CNAME/A here | matching; **default SNI** | tenant vhost | none | n/a | n/a | **404** |
| `dontsettle.co` | different IP | Google/CF | not us | none | n/a | n/a | third party |
| `preview.legenex.com` apex | **none** | n/a | wildcard does not name apex | none | n/a | n/a | no DNS |
| `preview.pageflo.io` apex | A | wildcard+apex SAN | named | none | n/a | n/a | self-check 404 |

UI paints the first four preview rows (and the alias-less Dont Settle
row) identically: green ACTIVE.

---

## 12. What a human should not trust

- Green **ACTIVE** on Brands → Domains.
- **View Live Site** on a Partial Brand.
- **2 Live funnels serving this Site now** on a draft Brand.
- DNS copy that the A/CNAME "serves the site".
- "Click Verify DNS" on an unassigned row (button absent).
- `self-check.eligible=true` as "visitors will see a page".
- Plesk domain list as "what PageFlo serves".
- `status=verified` as a state this pipeline still produces.
- Comments about an auto-verify poller.
- Quiz domain dropdown as the same list the public router uses.
- Advertorial printed `preview.legenex.com/a/{id}` URLs.

What a human **can** trust, today:

- Dont Settle on both preview suffixes, TLS + 200, if they ignore the
  custom domain `dontsettle.co` (not ours) and `getwhatyoureowed.co`
  (ours, unmapped).
- Wildcard DNS+TLS for `{anything}.preview.pageflo.io` and
  `{anything}.preview.legenex.com` (one label only).
- Add Domain rejecting empty, no-dot, and duplicate hosts.
- Eligibility enforcement on the public resolver
  (`LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY=true`).
- Crashclaim as the certificate a stranger's hostname will see until
  provisioning writes a vhost.

That is the lifecycle. Repair starts with one health contract on screen,
a preview URL that either works or does not claim to, and a custom-domain
path whose DNS copy matches crashclaim-SNI reality. Not with another
badge colour.
