# Evidence

## 2026-09-26 consent, delivery, retry, harness closeout

Production SHA: see the final line of this block.
- `pnpm typecheck` pass; `pnpm test` all green; `pnpm test:e2e` 34 (6 of 6 runs after the endpoint fix); `pnpm test:consent` 133; `pnpm test:delivery`, `pnpm test:leads-ui` 68, `pnpm test:publish` 294, `pnpm test:release` 29, `pnpm verify:schema`, `pnpm test:isolation` 50, `pnpm test:console` 327
- production `pnpm test:production-acceptance` A-K: 77 passed, 0 failed (run qamuhn9vsc; QA leads 24 and 25)
- Critic (2026-09-26) FAIL with two P1s (Delivered filter matched legacy rows; consent/delivery fields editable by any Brand editor); repaired in the next release.

## W60 production 2026-09-20 (GX10-01)

HEAD: `b54e8bd`
Host: hostname `gx10-01`, user `legenex`, `CODESPACES` empty, repo `/home/legenex/Documents/Projects/PageFlo` tracking `origin/main`.
Production: `ssh pageflo` -> `vps-3ae59fb7` as root.

Plesk:
```
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```
First release (`4a9043e`): 4 migrations, ledger 31 -> 35, schema 25+1, healthy after 2s.
Second release (`b54e8bd`): 0 migrations, healthy after 2s.

Live:
- `https://app.pageflo.io/api/pageflo/health` 200 `{"ok":true,"app":"legalos"}`
- `https://os.legenex.com/api/legalos/health` 200
- `random-check.preview.pageflo.io` cert SAN `*.preview.pageflo.io`, `preview.pageflo.io`
- `preview.pageflo.io` valid TLS
- `test.preview.legenex.com` valid TLS `*.preview.legenex.com`
- unmatched SNI `crashclaim.co`
- `www.pageflo.io` 308 -> `https://pageflo.io/`
- `os.legenex.com/` 200, not redirected
- Dont Settle 200 on both preview suffixes including `/s/dont-settle`, `/c`, `/c/dont-settle`, `/privacy`, `/terms`
- live-preflight 3 live / 0 fail; check:paths 0 unresolvable
- admin Brand-first routes 200 after login

Local: typecheck, `pnpm test`, isolation 49, identity 33, e2e 34, release 31, certs 78, console 327, durability 13, idempotency 23, verify:schema, lint:tokens, check:handbook 0 missing.

## W60 local 2026-09-20 (Codespace, not GX10-01)

HEAD after host-provision and worker-boot fixes: see `git rev-parse HEAD`.
Environment: GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, hostname `codespaces-d8809b`. Not GX10-01.

Local gates:
- `pnpm typecheck` pass
- `pnpm test` all green
- `pnpm test:isolation` 49
- `pnpm test:identity` 33
- `pnpm test:e2e` 34 (fresh production build)
- `pnpm test:release` 31
- `pnpm test:certs` 73
- `pnpm test:console` 327
- `pnpm lint:tokens` pass
- `pnpm check:handbook` 22 routes, 19 sidebar destinations
- `pnpm check:paths` 0 unresolved (local DB)
- `pnpm verify:schema` 25 collections + 1 global
- `next build` compiled after worker-boot split

Production (this environment):
- `https://os.legenex.com/api/legalos/health` 200 `{"ok":true,"app":"legalos"}`
- DNS: pageflo.io, www, app, preview, `random-check.preview.pageflo.io` -> 51.81.202.161
- TLS: unmatched SNI still `crashclaim.co`. `app.pageflo.io` HTTPS not valid.
- `ssh pageflo` Permission denied (publickey); `~/.ssh/pageflo_deploy` absent
- Plesk fetch/deploy + `scripts/release.sh`: UNPROVEN
- `scripts/provision-pageflo-hosts.sh` live run: UNPROVEN
- `PAGEFLO_LEGACY_HOST_REDIRECT` not set

## W20 W42 2026-09-20

- DNS: pageflo.io, app.pageflo.io, preview.pageflo.io, www.pageflo.io, test.preview.pageflo.io -> 51.81.202.161
- TLS: app.pageflo.io SNI is crashclaim.co (fail). os.legenex.com health 200. test.preview.legenex.com TLS valid.
- SSH: root@51.81.202.161 Permission denied (publickey)
- `pnpm typecheck` pass
- `pnpm test:release` 31 passed
- `pnpm test:rebrand` 38
- `pnpm test:certs` 50
- `pnpm test:trusted-host` 47
- `pnpm test:preview-hosts` 12
- `pnpm test:site-builder` 10
- `pnpm check:paths` 0 unresolved

## W22 2026-09-20

- `pnpm test:compositions`: 636 passed, 0 failed
- `pnpm test:flow`: 205 passed, 0 failed
- `pnpm typecheck`: pass
- Every `QUIZ_TEMPLATES` id is claimed and `resolveCompositionForRender` reports no default-card fallback

## W12 2026-09-19

- `pnpm typecheck`: pass
- `pnpm test:durability`: 12 passed, 0 failed
- `pnpm test:idempotency`: 23 passed, 0 failed
- Production Plesk release: UNPROVEN (SSH alias missing in this Codespace)

## W11 2026-09-19

- `pnpm typecheck`: pass
- `pnpm test:release`: 31 passed, 0 failed (includes `20260919_120000_sites_vertical_debt`)
- Clone path in `createSite` still creates a new preview domain and does not copy Leads or custom domains.

## W10 2026-09-19

- `pnpm check:handbook`: 22 routes documented, 33 screens, 19 sidebar destinations, 0 missing, 0 mismatched
- `pnpm typecheck`: pass
- Nav no longer includes Brand Kits. Identity remains on Brand settings (`/admin/sites/<slug>/settings/general`).
- `/admin/websites` and `/admin/deployments` query live collections with `overrideAccess: false`.


## W00 2026-09-19

Git: branch `main`, HEAD `6736d0991e4b79340a44823e101fd1d1ee8dc675`, up to date with `origin/main`, clean tree before pack extract.

Pack: extracted `PageFlo-Grok-4.6-Autonomous-Build-Pack (1).zip` into `forge-pack/`.

Production health from this Codespace:

- `https://os.legenex.com/api/legalos/health` -> 200 `{"ok":true,"app":"legalos","time":"2026-09-19T10:02:27.848Z"}`
- `https://app.pageflo.io/api/pageflo/health` -> DNS failure, UNPROVEN
- `ssh legalos` -> hostname unresolved, UNPROVEN

Re-audit facts written into `docs/STATE.md` section "Wave 00 re-audit".

Docs changed: `AGENTS.md`, `CLAUDE.md`, `docs/STATE.md`, `docs/PRODUCT-BRIEF.md`, `docs/REQUIREMENTS.md`, `docs/EXECUTION-PLAN.md`, `docs/HUMAN-GATES.md`, `forge-pack/state/*`.

No `src/` change. No production release required for W00.

Evaluator: host Task subagent failed to start (requires `ses_*` id). Independent read-only pass on AGENTS sections 1, 4, 6, 7, 12, 14, 19, CLAUDE.md, PRODUCT-BRIEF Internal V1, HUMAN-GATES, STATE Wave 00 re-audit:

- PASS: internal V1, Brand-first, no deployment copy overrides, bulk deploy, lead queue durability, redesign visual source, discovery 12.4 autonomous ordinary Plesk release, 18 technical invariants, compatibility identifiers, DNS/credentials/destructive-DB still gated.
- P2 leftover: `docs/INFRASTRUCTURE.md` still says release is "run by a human or by an agent with authorization". Not in W00 write scope. Historical production facts in STATE.md after the re-audit section remain dated 1 September 2026.
