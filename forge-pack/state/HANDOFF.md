# Handoff

Current phase: Wave 06. Repository work through W50 is on main. W60 is blocked on production SSH from this environment.
HEAD: see `git rev-parse HEAD`. Last application commit before this handoff: `891d5ca` W43, plus a test:publish regex fix.
Tests run this session:
- `pnpm test` all green (including 246 publish, 22 LP/advertorial fidelity, 16 leads-ui, 15 bulk-deploy, 19 brand-reskin, 20 quiz-master-runtime)
- `pnpm test:isolation` 49 passed
- `pnpm test:identity` 33 passed
- `pnpm test:e2e` 34 passed
- `pnpm test:release` 31 passed
- `pnpm typecheck` pass
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, not GX10-01. `ssh pageflo` fails because `~/.ssh/pageflo_deploy` is absent. Production TLS still presents `crashclaim.co` for app.pageflo.io and `*.preview.pageflo.io`. ACME CNAME is live. No Plesk release of W31-W43 has run.
Production: `https://os.legenex.com/api/legalos/health` 200. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: from a host that can `ssh pageflo`, run `scripts/provision-pageflo-hosts.sh`, then the AGENTS.md section 6 Plesk sequence, then prove:
- `https://app.pageflo.io/api/pageflo/health` 200
- `https://os.legenex.com/api/legalos/health` 200
- `*.preview.pageflo.io` SAN on an arbitrary Brand hostname
Important files: `scripts/provision-pageflo-hosts.sh`, `src/instrumentation.ts`, `src/lib/advertorial-deployment.ts`, `src/lib/bulk-deploy.ts`.
