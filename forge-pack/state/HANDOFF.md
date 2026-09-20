# Handoff

Current phase: Wave 06. Repository work through W50 is on main. Host-provision script is corrected. W60 is blocked on production SSH from this environment.
HEAD: see `git rev-parse HEAD`.
Tests run this session:
- `pnpm test` all green
- `pnpm test:certs` 73 passed (includes provision-pageflo-hosts.sh source contract)
- `pnpm test:isolation` 49 passed
- `pnpm test:identity` 33 passed
- `pnpm test:e2e` 34 passed (after a fresh production build)
- `pnpm test:release` 31 passed
- `pnpm test:leads-ui` 17 passed
- `pnpm typecheck` pass
- `next build` compiled successfully after the worker-boot split
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6` (hostname `codespaces-d8809b`, user `codespace`), not GX10-01. `ssh pageflo` fails because `~/.ssh/pageflo_deploy` is absent. Production TLS still presents `crashclaim.co` for app.pageflo.io and `*.preview.pageflo.io`. ACME CNAME is live. No Plesk release of W31-W50 has run.
Production: `https://os.legenex.com/api/legalos/health` 200. DNS for pageflo.io / www / app / preview / *.preview points at 51.81.202.161. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: from GX10-01 (`ssh pageflo`), Plesk fetch/deploy of current main, `scripts/release.sh`, then `scripts/provision-pageflo-hosts.sh` as root, then prove:
- `https://app.pageflo.io/api/pageflo/health` 200
- `https://os.legenex.com/api/legalos/health` 200
- `*.preview.pageflo.io` SAN via an arbitrary hostname such as `random-check.preview.pageflo.io`
- `test.preview.legenex.com` still valid
Important files: `scripts/provision-pageflo-hosts.sh`, `src/instrumentation.ts`, `src/lib/advertorial-deployment.ts`, `src/lib/bulk-deploy.ts`.
