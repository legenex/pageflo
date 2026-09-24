# BUGS — Bugsy production operator audit

Date: 2026-09-24
Target: `https://app.pageflo.io`
Method: Playwright Chromium against live production. Credentials loaded from production `.env` over SSH (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`). Password never written into this file or into evidence.

**Blocked:** the documented production super-admin cannot sign in. Console workflows (Brand save/reload, website editor save/publish, New Quiz / Landing Page / Advertorial, deployments UI, Add Domain, leads table, Test Capture) are **UNPROVEN**. Public preview hosts, funnels, TLS, health, and recovery pages were exercised instead.

Scripts: `/tmp/pageflo-rescue-bugsy/walk.mts`, `public-walk.mts`, `remainder.mts`.
Evidence: `docs/rescue-audit/evidence/bugsy/`.

Brand slug `rescue-qa-20260923` already existed (site id 18, name "Rescue QA 20260924", status `active`). It was not deleted and was not duplicated.

---

## BUG-P0-001

- **Severity:** P0
- **Area:** Auth
- **Steps:**
  1. Load `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `/var/www/vhosts/legenex.com/os.legenex.com/.env`.
  2. Open `https://app.pageflo.io/sign-in`.
  3. Submit those credentials.
  4. Repeat once on `https://app.pageflo.io/cms/login`.
- **Expected:** `team@legenex.com` signs in to `/admin/`. The password in production `.env` authenticates the seeded super-admin.
- **Actual:** Both surfaces return "The email or password provided is incorrect." The sign-in Server Action ran and resolved (`Next-Action` 200, `ok: false`). `users.id=1` is `active` / `super_admin=true`, `last_login_at` is null, `login_attempts` incremented. A pbkdf2 compare of the env password against the stored salt/hash returns **no match**. Seed is create-if-missing only, so rotating `.env` does not update the row.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/01-sign-in.png`
  - `docs/rescue-audit/evidence/bugsy/02-sign-in-failed.png`
  - `docs/rescue-audit/evidence/bugsy/105-pub-cms-login-result.png`
  - `docs/rescue-audit/evidence/bugsy/_notes.txt` (action body, no secret)
  - URLs: `https://app.pageflo.io/sign-in`, `https://app.pageflo.io/cms/login`
- **Likely root cause:** Stored password hash for `team@legenex.com` drifted from `SUPER_ADMIN_PASSWORD`. Password was not rotated through `payload.update({ collection: 'users', data: { password } })`. This is a credential-rotation human gate, not something this audit changed.

---

## BUG-P0-002

- **Severity:** P0
- **Area:** Auth / recovery
- **Steps:**
  1. From sign-in, open Forgot password (`https://app.pageflo.io/cms/forgot`).
  2. Observe the page. Inspect HTML.
- **Expected:** A usable forgot-password form. If email is not configured, a visible explanation that recovery cannot send mail.
- **Actual:** HTTP 200, title "Forgot Password · PageFlo", **blank white screenshot**. SSR HTML has **no `<form>` and no `<input>`**. Production has no email adapter, so even a working form could not deliver. Combined with BUG-P0-001, the operator has no working login and no working recovery.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/103-pub-forgot.png`
  - Sign-in "Forgot password?" links to `/cms/forgot`
  - URL: `https://app.pageflo.io/cms/forgot`
- **Likely root cause:** Payload forgot-password view is client-rendered and does not hydrate (same unstyled CMS shell as `/cms/login`). No email transport is configured on the host.

---

## BUG-P0-003

- **Severity:** P0
- **Area:** Website / consent
- **Steps:**
  1. Open `https://rescue-qa-20260923.preview.pageflo.io/` (also the Dont Settle and ACH starter homes use the same consent pattern).
  2. Read the lead-form TCPA / consent line under the home capture form.
- **Expected:** Consent copy with working links to `/tcpa` and `/privacy`. No raw HTML. Phone numbers only via `resolvePhoneForPath`.
- **Actual:** The consent sentence shows escaped markup as visible text: `See our <a href="/tcpa">TCPA consent</a> and <a href="/privacy">privacy notice</a>.` The HTML source contains `&lt;a href=&quot;/tcpa&quot;&gt;`. A visitor cannot follow the required disclosures from that sentence. Labels on the same form are near-invisible (very low contrast).
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/107-qa-home-pageflo.png`
  - `docs/rescue-audit/evidence/bugsy/108-qa-home-legenex.png`
  - URL: `https://rescue-qa-20260923.preview.pageflo.io/`
- **Likely root cause:** Starter home blocks store HTML in a text field that is escaped on render (`homeBlocksForVertical` / BlockRenderer text path), so tags display instead of becoming links.

---

## BUG-P0-004

- **Severity:** P0
- **Area:** Advertorial
- **Steps:**
  1. Open the live Dont Settle advertorial as a visitor: `https://dont-settle.preview.pageflo.io/adv/letter`.
- **Expected:** A public story page. Embedded quiz shows visitor-facing questions only.
- **Actual:** The left rail dumps the **internal quiz graph**: "Welcome / Accident Type", "Accident Branch", "Accident State", "Injury Type12121212", "Qualified Lead Form", "DQ Lead Form", "/submitted (Qualified)", "/thanks (DQ)". Those are authoring keys, including a garbled node name and public path slugs. This is a live `status=live` deployment (id 2).
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/207-ds-adv.png`
  - URL: `https://dont-settle.preview.pageflo.io/adv/letter` (also `https://dont-settle.preview.legenex.com/adv/letter`)
- **Likely root cause:** Advertorial embedded-quiz chrome renders quiz step/node labels from the master graph instead of visitor copy. Seed data still carries `Injury Type12121212`.

---

## BUG-P0-005

- **Severity:** P0
- **Area:** Website / Brands
- **Steps:**
  1. Brand `accident-compensation-helper` is `status=active` with preview hosts on both suffixes.
  2. Open `/` on both preview roots.
  3. Compare with `/s/accident-compensation-helper` and `/c/accident-compensation-helper`.
- **Expected:** An active brand's apex serves the home page, or a clear unpublished state. Funnel paths and the website share one public shell.
- **Actual:** Both `https://accident-compensation-helper.preview.pageflo.io/` and `https://accident-compensation-helper.preview.legenex.com/` return **HTTP 404**. Desktop screenshot is a **blank white page** (Next `__next_error__` document, empty body text, empty title). Mobile shows "Page not found / Go back home" titled "Accident Compensation Helper". "Go back home" points at the same 404. The brand has **no `pages` row with slug `/`**. Quiz and landing-page paths on the same host return 200.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/201-ach-home-pageflo.png` (desktop blank)
  - `docs/rescue-audit/evidence/bugsy/202-ach-home-legenex.png`
  - `docs/rescue-audit/evidence/bugsy/225-ach-home-mobile.png` (mobile 404)
  - `docs/rescue-audit/evidence/bugsy/203-ach-quiz.png` (funnel works)
  - URLs above
- **Likely root cause:** Home page never seeded (or was removed) for this Site. Public `/` uses `notFound()` rather than a branded empty state. Desktop 404 paints a blank error document instead of the mobile not-found UI.

---

## BUG-P0-006

- **Severity:** P0
- **Area:** Domains
- **Steps:**
  1. Read production `domains` rows.
  2. Resolve a historical custom host (`dont-settle.co`).
  3. Note preview vs custom.
- **Expected:** Custom domains can be attached, verified, and served. Preview hosts exist per brand. DNS instructions match the live edge.
- **Actual:** Production `domains` has **zero verified custom hosts**. 13 preview rows + one pending pool row `rescue-odin-20260923.example`. `dont-settle.co` / `www.dont-settle.co` **do not resolve**. Every preview row has `ssl_status=unknown` even though wildcard certificates handshake. Operator domain workflow cannot be completed in this environment: there is nothing live to verify, and console Add Domain could not be clicked because of BUG-P0-001. Production env still sets `LEGALOS_CNAME_TARGET=os.legenex.com` (legacy console host).
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/journal-server-actions.txt` (adjacent host facts in BOSSMAN.md)
  - curl: `Could not resolve host: dont-settle.co`
  - DB: `SELECT host, kind, status, ssl_status FROM domains`
- **Likely root cause:** Custom-domain inventory was never migrated into this database, or was dropped. CNAME target still points at the legacy app host. SSL poller does not mark wildcard-served preview hosts `active`.

---

## BUG-P0-007

- **Severity:** P0
- **Area:** Server Actions
- **Steps:**
  1. `journalctl -u legalos-dev.service --since "7 days ago" | grep "Failed to find Server Action"`
  2. Use a primary control in a browser (this session: Sign in).
- **Expected:** Operator Save / Publish / Add Domain reach a live action id. Stale-tab failures are shown to the operator, not only the journal.
- **Actual:** **1790** hits in 7 days (172 today). Top ids: `"x"` 711, `"0"` 333, `"1"` 322, `"action"` 316, `"r2s"` 14, plus real hashes (`6863264c…`, `fa6f6903`, `vcv`, …). Sign-in in this session **did** find its action (full hash `40975fc7…`, HTTP 200). Authenticated Save/Publish/Add Domain could not be probed because login failed. The journal pattern is exactly the stale-client failure Bossman flagged. Builders wrap it in `settleAction`, but any screen that still calls an action without that wrapper, or that toasts success before the write, will lie.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/journal-server-actions.txt`
  - `docs/rescue-audit/evidence/bugsy/_notes.txt` (successful sign-in action vs failed credential)
- **Likely root cause:** Mix of (a) crawlers/bots sending junk `Next-Action` values `x`/`0`/`1`/`action`, and (b) real stale tabs after deploys (`r2s` and 64-hex ids). Production SHA lags GitHub; any long-lived admin tab after `scripts/release.sh` will miss.

---

## BUG-P1-008

- **Severity:** P1
- **Area:** Website / legal templates
- **Steps:** Open `https://dont-settle.preview.pageflo.io/terms`.
- **Expected:** Shared legal template with `{{site.name}}` substituted.
- **Actual:** Visible H1 is `Terms of Service | {{site.name}}`. Body copy below did substitute "Dont Settle". Title of the document is just "Dont Settle". Same host's `/privacy` is fine.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/209-ds-terms.png`
  - URL: `https://dont-settle.preview.pageflo.io/terms`
- **Likely root cause:** Page title/H1 path does not run the same variable substitution as the markdown body (`uses_shared_template` title still raw).

---

## BUG-P1-009

- **Severity:** P1
- **Area:** Landing Page
- **Steps:** Open live Dont Settle Authority Network LP: `https://dont-settle.preview.pageflo.io/c`.
- **Expected:** Brand phone via `resolvePhoneForPath`. Slot copy filled. No builder leftovers.
- **Actual:** Header phone is **`(800) 000-0000`**. Three stat tiles say **"Dynamic figure"**. A pill reads **"This deployment"**. Accreditations heading includes an em dash and "SUPPLIED PER BRAND". Footer elsewhere on the same page correctly shows `(833) 555-0444`.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/208-ds-lp-c.png`
  - URL: `https://dont-settle.preview.pageflo.io/c`
- **Likely root cause:** Template slots never filled for this deployment; placeholder phone and internal labels shipped live. Phone denormalized onto the template instead of resolved per path.

---

## BUG-P1-010

- **Severity:** P1
- **Area:** Website
- **Steps:** Create/open a new Brand's `/about` (QA brand: `https://rescue-qa-20260923.preview.pageflo.io/about`).
- **Expected:** Starter about content, or the brand shell with a useful empty state.
- **Actual:** HTTP 200, title "About | Rescue QA 20260924", body is only **"This page has no content blocks yet."** on a **dark admin canvas** (not the public site chrome used by Home/Privacy/Terms). `createSite` inserts About as `template_key=custom`, `uses_shared_template=false`, no `body_blocks`.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/109-qa-about-pageflo.png`
  - `docs/rescue-audit/evidence/bugsy/226-qa-about-mobile.png`
  - URL: `https://rescue-qa-20260923.preview.pageflo.io/about`
- **Likely root cause:** DEFAULT_PAGES seeds an empty custom About. The empty-blocks renderer falls back to the admin dark surface instead of `html.site-shell`.

---

## BUG-P1-011

- **Severity:** P1
- **Area:** Quiz
- **Steps:** Open any live starter quiz, e.g. `https://rescue-qa-20260923.preview.pageflo.io/s/rescue-qa-20260923`.
- **Expected:** Header call button dials the brand phone from `resolvePhoneForPath`.
- **Actual:** Button label is **CLICK HERE TO CALL** with **no number**. InnerText concatenation with the progress bar produced `CLICK HERE TO CALL 7%` in the accessibility tree. Same on ACH and Dont Settle quizzes. Brand default phones exist (`(833) 555-04xx`).
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/112-qa-quiz-pageflo.png`
  - `docs/rescue-audit/evidence/bugsy/113-qa-quiz-legenex.png`
  - `docs/rescue-audit/evidence/bugsy/203-ach-quiz.png`
  - URL: `https://rescue-qa-20260923.preview.pageflo.io/s/rescue-qa-20260923`
- **Likely root cause:** Standalone quiz chrome always renders the call CTA and omits the number when `resolvePhoneForPath` returns empty for that path, or the template hardcodes the label without the phone.

---

## BUG-P1-012

- **Severity:** P1
- **Area:** CMS / Auth
- **Steps:** Open `https://app.pageflo.io/cms/login` while logged out.
- **Expected:** Payload admin login styled as PageFlo, usable.
- **Actual:** Unstyled raw fields on a white page: "Email *", "Password *", "Forgot password?", "Login". Failed login paints "The email or password provided is incorrect." over the layout. This is the only recovery UI besides `/cms/forgot` (blank).
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/104-pub-cms-login.png`
  - `docs/rescue-audit/evidence/bugsy/105-pub-cms-login-result.png`
  - URL: `https://app.pageflo.io/cms/login`
- **Likely root cause:** Payload admin CSS/import map not loading on `app.pageflo.io` (asset base / `NEXT_PUBLIC_SERVER_URL` still `https://os.legenex.com`).

---

## BUG-P1-013

- **Severity:** P1
- **Area:** Landing Page / copy
- **Steps:** Open `https://rescue-qa-20260923.preview.pageflo.io/c/rescue-qa-20260923` and Dont Settle `/c/dont-settle`.
- **Expected:** Human-facing copy without em dashes (product linter / AGENTS.md).
- **Actual:** Public LP body contains U+2014 in multiple sentences ("the one small thing worth doing at each step", "Losses that may count — beyond the hospital bill", testimonial attribution). Starter LP copy was shipped with em dashes.
- **Evidence:**
  - `docs/rescue-audit/evidence/bugsy/114-qa-lp-pageflo.png`
  - `docs/rescue-audit/evidence/bugsy/_remainder-notes.txt` (`emdash=true`)
- **Likely root cause:** Seed / template slot copy was not run through the banned-punctuation linter.

---

## BUG-P2-014

- **Severity:** P2
- **Area:** Preview domains
- **Steps:** Compare `domains` rows for Dont Settle vs live requests to `{slug}.preview.pageflo.io`.
- **Expected:** Both preview roots stored as rows (`preview.pageflo.io` and `preview.legenex.com`).
- **Actual:** Dont Settle has only `dont-settle.preview.legenex.com` (primary). `dont-settle.preview.pageflo.io` still **200s** via alias resolution. Data and DNS have diverged; a future resolver change would take the canonical preview host offline for this brand.
- **Evidence:** DB row 70 only; `docs/rescue-audit/evidence/bugsy/205-ds-home-pageflo.png` (pageflo host works anyway)
- **Likely root cause:** `previewAliasHosts` papers over missing rows. Older brands were created before dual-preview insert.

---

## BUG-P2-015

- **Severity:** P2
- **Area:** Auth / copy
- **Steps:** View `https://app.pageflo.io/sign-in`.
- **Expected:** Concepts match the Brand-first model (Brand identity, not Brand Kits).
- **Actual:** Subtitle still lists **Brand Kits**. Product copy in `PRODUCT_CONCEPTS` is stale relative to the Brand Identity model.
- **Evidence:** `docs/rescue-audit/evidence/bugsy/01-sign-in.png`
- **Likely root cause:** `src/lib/pageflo/product.ts` `PRODUCT_CONCEPTS` still includes `'Brand Kits'`.

---

## Journal: Failed to find Server Action

Recorded as BUG-P0-007. Counts from `legalos-dev.service`, last 7 days:

| Action id | Count |
|---|---|
| `"x"` | 711 |
| `"0"` | 333 |
| `"1"` | 322 |
| `"action"` | 316 |
| `"r2s"` | 14 |
| `"y"` | 13 |
| 64-hex and short hashes | 1–2 each |
| **Total** | **1790** |

This session's Sign in action was found and executed. Authenticated Save / Publish / Add Domain were **not** clickable. Do not treat HTTP 200 on `/admin/*` as proof those buttons work.

---

## What did work (public)

- `https://app.pageflo.io/api/pageflo/health` 200 `{"ok":true,"app":"legalos"}`
- `https://os.legenex.com/api/legalos/health` 200
- `PAGEFLO_LEGACY_HOST_REDIRECT` is off: `https://os.legenex.com/sign-in` still serves the console, no 308 to `app.pageflo.io`
- TLS: `app.pageflo.io`, `os.legenex.com`, `*.preview.pageflo.io`, `*.preview.legenex.com` (Let's Encrypt)
- `rescue-qa-20260923.preview.pageflo.io` and `.preview.legenex.com` both serve Home, Privacy, Terms, quiz `/s/rescue-qa-20260923`, LP `/c/rescue-qa-20260923`
- Dont Settle preview both suffixes: Home, quiz, LPs, advertorial
- Sign-in page renders and the Server Action is reachable

---

## UNPROVEN (login blocked the operator journey)

These were required and could not be completed as a signed-in operator:

| Workflow | Status |
|---|---|
| New Brand create/save/reload/edit | Brand already existed. Console edit/save not run. |
| Website editor edit / autosave / preview popup / publish / republish | Public pages observed only. |
| New Quiz from console, publish, new deployment draft/publish/path/domain | Public starter quiz observed. Date step Next stays disabled until year+month (custom dropdowns). Lead submit **not completed** (would not use a live-buyer brand). |
| New Landing Page / template / deployment from console | Public LPs observed. |
| New Advertorial from console | Public advertorial observed. |
| Deployments index, bulk deploy, republish | Not opened authenticated. |
| Domains UI invalid host, duplicate host, DNS instruction panel | Not opened authenticated. |
| Leads table / Test Capture | Not opened authenticated. |
| Silent failure of Save Settings / Publish / Add Domain | Sign-in action did not silently fail. Other primary buttons untested. |

Do not treat W60 A01–A30 PASS, HTTP 200, or the existence of starter funnel rows as acceptance for those operator paths.

---

## Notes for Bossman

- Password rotation for `team@legenex.com` is a **human gate**. This audit did not change hashes, `.env`, or users.
- `nick@legenex.com` and `capture@legenex.com` are also `super_admin` / `active`. No extra super-admins were created.
- Audit brand `rescue-qa-20260923` is already `active` on preview hosts. It was not paused or deleted.
- No DNS changes. No live buyer enabled. `PAGEFLO_LEGACY_HOST_REDIRECT` left false.
