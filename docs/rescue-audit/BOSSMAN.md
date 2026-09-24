# BOSSMAN — PageFlo rescue audit kickoff

Status: AUDIT IN PROGRESS. Previous W60 PASS / V1 complete claim is untrusted.

Last updated: 2026-09-24 (session resumed after agent cancel)

## Session resume

The first spawn of seven audit agents was cancelled when the host session
exited. Archie completed `ARCHITECTURE.md`. Critic/Picasso/Funnel failed
production sign-in because they used local `.env` (`preview@localhost`), which
is not the production super-admin.

Production sign-in credentials live in:

`/var/www/vhosts/legenex.com/os.legenex.com/.env`

as `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`. Email is `team@legenex.com`.
Do not use `PAGEFLO_REPO/.env` against `app.pageflo.io`.

Production `.env` still uses LegalOS names. Measured:

| Key | Production value |
|---|---|
| `NEXT_PUBLIC_SERVER_URL` | `https://os.legenex.com` |
| `LEGALOS_FALLBACK_HOST` | `os.legenex.com` |
| `LEGALOS_PREVIEW_DOMAIN` | `preview.legenex.com` |
| `LEGALOS_CNAME_TARGET` | `os.legenex.com` |
| `LEGALOS_A_TARGET` | `51.81.202.161` |
| `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY` | `true` |
| `PAGEFLO_SERVER_URL` | unset |
| `PAGEFLO_APP_HOST` | unset (code fallback `app.pageflo.io`) |
| `PAGEFLO_PREVIEW_DOMAIN` | unset (code fallback `preview.pageflo.io`) |
| `PAGEFLO_EXTRA_ORIGINS` | unset |

Code fallbacks keep `classifyHost` working. Cookie/CSRF `serverURL` is still
the legacy origin. Custom-domain DNS instructions CNAME to `os.legenex.com`.

## Execution environment (proven)

| Fact | Value |
|---|---|
| Host | `gx10-01` |
| User | `legenex` |
| CODESPACES | empty |
| PAGEFLO_REPO | `/home/legenex/Documents/Projects/PageFlo` |
| GitHub origin | `https://github.com/legenex/pageflo.git` |
| Branch | `main`, clean, matches `origin/main` |
| GitHub HEAD | `0818c76` Record W60 production TLS, Plesk release, and acceptance |
| Production SSH | `ssh pageflo` as `root` on `vps-3ae59fb7` |
| Production app dir | `/var/www/vhosts/legenex.com/os.legenex.com` |
| Production Plesk git | `/var/www/vhosts/legenex.com/git/legalos.git` |
| Production SHA | `b54e8bd` Return after queued lead delivery so submit is not blocked |
| Production remote | `git@github.com:legenex/legalos.git` (compatibility identifier) |
| Service | `legalos-dev.service` active |
| Health | `https://app.pageflo.io/api/pageflo/health` 200 `{"ok":true,"app":"legalos"}` |
| Legacy health | `https://os.legenex.com/api/legalos/health` 200 |
| SHA drift | GitHub is one commit ahead of production (`0818c76` is the W60 write-up). Live code is `b54e8bd`. |

`projects/pageflo` under AgentOS is a project card only. It is not the Git repository.

## Audit rules

- Application code stays unchanged until Bossman publishes `DEFECT-REGISTER.md` and `REMEDIATION-PLAN.md`.
- Each agent writes only the owned files listed below.
- Runtime evidence beats docs, previous PASS markers, and unit tests.
- Do not enable `PAGEFLO_LEGACY_HOST_REDIRECT`.
- Do not print secrets, passwords, API keys, or `~/.ssh/pageflo_deploy`.
- Do not activate a live external buyer.
- Do not make DNS changes.
- Do not delete production Brands, Leads, or domains.
- Creating uniquely named audit Brands and assets in production is allowed.
- Sign in at `https://app.pageflo.io/sign-in` using `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `PAGEFLO_REPO/.env`. Never write the password into a report.
- No MCP browser tools exist in this harness. Use Playwright (`PAGEFLO_REPO/node_modules/.bin/playwright`) with Chromium under `~/.cache/ms-playwright`.
- Screenshots go under `docs/rescue-audit/evidence/<agent>/`.
- HTTP 200 is not acceptance. Click, save, refresh, preview, publish, and re-open.

## File ownership

| Agent | Owned files |
|---|---|
| Bossman | `BOSSMAN.md`, `DEFECT-REGISTER.md`, `REMEDIATION-PLAN.md` |
| Archie | `ARCHITECTURE.md`, `DEPLOYMENT-LIFECYCLE.md` |
| Bugsy | `BUGS.md` |
| Critic | `ACCEPTANCE-REVIEW.md` |
| Odin | `DOMAINS.md`, `DOMAIN-LIFECYCLE.md` |
| Funnel Auditor | `FUNNEL-PARITY.md`, `SETTINGS-INVENTORY.md`, `RENDER-PARITY.md` |
| Picasso | `UX.md` |
| Security Reviewer | `SECURITY.md` |
| Final QA | `FINAL-QA.md` (after remediation) |

## Known operator complaints (treat as P0 until disproven)

- Domains
- Preview domains
- Deployments
- Landing Page workflows
- Advertorial workflows
- Quiz workflows
- Settings consistency
- Builder / Preview / Live consistency
- General product workflow consistency

## Observed before agent spawn (not a verdict)

- Production journal has Next.js `Failed to find Server Action "r2s"` and `"x"` (stale client vs server action mismatch).
- Default SNI historically `crashclaim.co` for unmatched hosts.
- Acceptance matrix A01-A30 all marked PASS from W60. Treat as historical only.
- Existing tests are mostly `scripts/*.mts` assertion harnesses, not operator-journey browser tests.

## Agent brand slugs (do not collide)

| Agent | Brand slug to create if a new Brand is required |
|---|---|
| Bugsy | `rescue-qa-20260923` |
| Odin | `rescue-odin-20260923` |
| Funnel Auditor | `rescue-funnel-20260923` |
| Security | `rescue-sec-a-20260923` and `rescue-sec-b-20260923` |
| Picasso | reuse existing plus observe Bugsy/Funnel assets; create `rescue-ux-20260923` only if needed |

## After audit

Bossman consolidates `DEFECT-REGISTER.md` and `REMEDIATION-PLAN.md`. Dexter then remediates. Builders do not certify their own work.
