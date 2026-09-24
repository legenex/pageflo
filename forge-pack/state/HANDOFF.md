# Handoff

Current phase: Rescue Wave 2 released. W60 "complete" is withdrawn.
Production SHA: `5d642c0` (snapshot pin, visitor copy, Home/tenancy, DNS copy). GitHub `main` is ahead at `43c45fa` (production smoke + Brand TCPA settings). Super-admin reset complete; credentials at `/home/legenex/.pageflo-admin-credentials` (mode 600).
Acceptance Brand: `pageflo-rescue-acceptance-944138` Ready, Home 200, quiz `/s/...` live 200.
Independent: Security PASS, Funnel PASS, Bugsy P0-001/007/009 PASS. Critic/Final QA not re-run as a full FAIL/PASS gate.
Remaining: LP/advertorial/lead on the new Brand, Wave 3 settings remainder, full A-J browser suite, custom-domain DNS human gate.
Tests run this session:
- `pnpm typecheck` pass
- `pnpm test` all green
- `pnpm test:certs` 78 passed
- `pnpm test:isolation` 49 passed
- `pnpm test:identity` 33 passed
- `pnpm test:e2e` 34 passed
- `pnpm test:release` 31 passed
- `pnpm test:durability` 13 passed
- `pnpm test:idempotency` 23 passed
- `pnpm test:console` 327 passed
- production `pnpm check:live-preflight`: 3 live, 0 would fail re-publish
- production `pnpm check:paths`: 3 deployments, 0 unresolvable
Known blockers: none for internal V1. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Production:
- `https://app.pageflo.io/api/pageflo/health` 200
- `https://os.legenex.com/api/legalos/health` 200
- `*.preview.pageflo.io` SAN proven via `random-check.preview.pageflo.io`
- `preview.pageflo.io` and `test.preview.legenex.com` valid TLS
- unmatched SNI still `crashclaim.co`
Next action: none for V1. Optional later: `PAGEFLO_LEGACY_HOST_REDIRECT`, legal entity facts, EB-1, dedicated VPS.
Important files: `scripts/provision-pageflo-hosts.sh`, `src/queues/redis.ts`, `src/lib/lead-pipeline/run.ts`.
