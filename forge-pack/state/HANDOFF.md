# Handoff

Current phase: POST-V1 rescue audit. W60 "complete" is withdrawn.
HEAD: local Wave 1 repairs on `main` after `0818c76`. Production still `b54e8bd` until the Plesk sequence runs.
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
