# Reviewer B — Security & Tenant-Isolation Adversarial Review

Branch `claude/legalos-final-integration-gvvtr8`, prod server on :3000, DB `legalos`.
Method: real logins + Payload local API (`overrideAccess:false` as tenant users), raw REST with
tenant cookies, curl, DB inspection, code read. All fixtures created were removed; **no committed
source was edited** (git status clean except 2 pre-existing screenshot pngs).

## Negative controls (baseline)
- `pnpm test:authz` → **69 passed, 0 failed**
- `pnpm test:isolation` → **44 passed, 0 failed**
- **Non-vacuity PROVEN**: runtime-detached `enforceDeploymentTenancy` (beforeChange+beforeDelete)
  from the live `funnel-lp-deployments` collection → the cross-tenant write
  (userA updates site B's deployment) then **SUCCEEDED**. The hook is the load-bearing control;
  the passing suite is real. Throwaway copy also written to /tmp/throwaway-collections (removed).

## Verdicts A–P

**A. Cross-tenant template edit — BLOCKED (by design + guards).** `funnel-landing-pages` and
`funnel-quiz-templates` are GLOBAL/brandless (`isAuthenticated`, no `site` column). Any authed
user editing *editable* fields (name/copy) is intended (shared library). Destructive/identity ops
are separately guarded → see C, D.

**B. Cross-tenant deployment edit/delete/null/move — BLOCKED.** `enforceDeploymentTenancy`
(src/hooks/deployment-tenancy.ts:77-144). Verified: local API userA update/delete/null-site/move
of site B's lp/quiz/adv deployments all "deployment not found"; raw REST `PATCH`/`DELETE
/api/funnel-quiz-deployments/68` as wrong-tenant cookie → **HTTP 404**. Orphan (site:null) and
cross-move both refused (both-ends check).

**C. Delete a referenced template — BLOCKED.** `guardLpTemplateDelete`/`guardQuizTemplateDelete`
(src/hooks/template-guards.ts:83-105) → 409 naming the count. Verified via local API, raw REST
(`DELETE /api/funnel-landing-pages/2` → 409 "5 deployments still use it"), and fails-closed even
under `overrideAccess:true`.

**D. Rewrite immutable stock identity — BLOCKED.** `guardStockLpTemplateIdentity` /
`guardStockQuizTemplateIdentity` (template-guards.ts:119-150). `template_id`/`stock_key`/
`renderer_key` changes on stock rows → 409 "part of the shipped library...". Verified REST
(`PATCH /api/funnel-landing-pages/2 template_id` → 409) + local API + overrideAccess (fails closed).

**E. Disabled template for a new deployment — BLOCKED at publish.** Save action refuses on template
change (`resolveLpTemplateSelection`, landing-pages/actions.ts:110); publish preflight refuses
go-live (`!record.isEnabled` → "disabled and cannot be published onto", publish-lifecycle.ts:214).
The raw collection door lets a *draft* reference a disabled template (no relationship validator),
but it cannot serve or go live (go-live only via the preflighted door — see I).

**F. Archived template — BLOCKED.** Preflight `record.archivedAt` → "has been deleted"
(publish-lifecycle.ts:213). Confirmed go-live onto an archived template is blocked.

**G. Cross-bind a Quiz Flow of site B — N/A by design.** `funnel_quizzes` has **no `site` column**
(brandless authoring collection). There is no tenant on a quiz flow to cross-bind.

**H. Cross-bind a Domain of site B into site A's deployment — LOW / defense-in-depth gap (NOT an
isolation break).** The server action blocks it ("that domain belongs to a different brand",
landing-pages/actions.ts:217), but the **raw REST / local-API door does NOT**: `enforceDeploymentTenancy`
validates only `deployment.site`, never the referenced `domain`'s tenant. A tenant admin CAN store
another brand's `domain_id` on their own deployment (verified: userA set site-A deployment.domain =
site-B's domain via `overrideAccess:false`, stored successfully). **Impact = none for isolation**:
the public LP/quiz resolvers query deployments `WHERE site = <host-resolved siteId>` FIRST
(src/lib/lp-deployment.ts:134, src/lib/quiz-deployment.ts), and `domain` is only a same-site
host tiebreaker — so the cross-tenant ref is inert (no cross-tenant serving, no host takeover).
Worth closing to uphold the codebase's own "every door" principle (mirror the action's
domain-tenant check in the hook).

**I. Direct status=live preflight bypass — BLOCKED.** Cross-tenant flip → "deployment not found".
Own-brand raw go-live without the marker → 403 "going live runs the publish preflight" (both local
API and REST). **Forging `context.legalosPreflighted` via the REST body is IGNORED by Payload** —
`PATCH /api/funnel-quiz-deployments/68 {"status":"live","context":{"legalosPreflighted":true}}`
returned 403 and the row stayed `draft`. The marker is only settable through the local API
(trusted server code), which is exactly what `setLp/QuizDeploymentStatus` use after running the
preflight — not remotely reachable.

**J. Preview cross-tenant — BLOCKED.** Zero leak of a site-B draft page (marker `CROSSTENANT-DRAFT-
SECRET-MARKER`) via: anonymous `?site=`, anonymous direct `x-legalos-preview-site`/`x-legalos-preview`
header injection, wrong-tenant `?site=&preview=1`, wrong-tenant direct header injection — all 0.
Route re-verifies `getCurrentUser()` + `isBoundToSite` before honoring any bypass
(src/app/(public)/[[...slug]]/page.tsx:299-300, 341-357); `previewSiteSlug` forced null when
unauthenticated. Harness validated (published page on its own host renders the marker). Note: the
preview-by-header/query channels appear to fail *closed* in this server config (even the owner
positive control did not render through them) — the safe direction; not a vuln.

**K. SSRF via URL extraction — BLOCKED.** `assertSafeUrl`/`safeFetch` (src/lib/net/ssrf.ts), on-path
in fetch-bundle. Refused: `169.254.169.254` (metadata), `10/172.16/192.168` private, `[::1]`,
`.internal`/`.local` suffixes, DNS-rebind `169.254.169.254.nip.io` (every resolved addr checked),
octal `0177.0.0.1` + decimal `2130706433` (→127.0.0.1), non-80/443 ports (5432/6379), `file://`,
`gopher://`.

**L. SSRF via images — BLOCKED.** `LEGALOS_IMAGE_HOSTS` empty ⇒ `remotePatterns` admits nothing.
`GET /_next/image?url=...` → **HTTP 400** for `169.254.169.254/latest/meta-data`, arbitrary external
host, and `localhost:3000` self. Wildcards refused in image-hosts.mjs.

**M. SSRF via webhook target — BLOCKED.** Node URL is server-side (never client-interpolated) and
goes through `safePost`. `safePost` → metadata/redis refused; `executeWebhookNode` with an internal
URL returned `{ok:true, called:false}` — the request was never made (graceful degradation).

**N. TrustedForm credential exfiltration — BLOCKED.** `certUrl` host-pinned to `trustedform.com`
and checked BEFORE assembling `Authorization: Basic` (src/lib/integrations/trustedform.ts:68-72);
`safePost` refuses redirects (no bounce). Credentials (`tf.api_key`, `j.account_id`, `tk.api_key`)
are only passed INTO integration functions — never into the pipeline `steps[].detail` or the JSON
returned by `/api/leads` (details are only 'skipped'/'missing credentials'/error text/cert_id/
audit_token/'sent'/status). No client-reachable path leaks them.

**O. Brand Identity XSS — BLOCKED (escaped).** Empirically injected
`<img src=x onerror=alert(1)>"><script>alert(2)</script>` into a live site's `brand_display_name`+
`name`, rendered the live LP: output shows only `&lt;img...&gt;` in HTML text/attributes and
`<img...` inside RSC flight islands — **0 executable occurrences, 0 `</script>` breakouts**.
`resolveTokensForHtml` escapes every substituted brand value before `dangerouslySetInnerHTML`
(src/components/builder/lp/tokens.ts:115-133). Restored after.

**P. Slot-override XSS — BLOCKED (escaped).** Same payload injected into a deployment
`content_overrides` slot rendered escaped via `escapeHtmlText` (src/lib/lp-slots/model.ts:544;
image/alt wells at :413). No unescaped injection on the live page. Restored after.

## Only vulnerable/actionable finding
- **H (LOW, defense-in-depth):** `enforceDeploymentTenancy` does not validate the tenant of a
  deployment's `domain` relationship, so a tenant can store another brand's `domain_id` via the
  raw REST/local-API door (the server action blocks it). No isolation impact today because the
  public resolvers filter by host-resolved `site` first, making the reference inert. Recommend
  mirroring the action's `domain.site === deployment.site` check inside the hook.

Everything else A–P: BLOCKED (G is N/A by design).
