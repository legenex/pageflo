# Remediation plan

Bossman + Archie. 2026-09-24.

Group repairs by root cause. Do not ship one hack per symptom.

## Wave 1 (this session) — preview, honesty, seed, website snapshot, pickers

Root cause: a new Brand is `draft`, preview hosts 404 anonymous visitors, and the console describes that Brand as live. Secondary: seed writes live deployments; website autosave clobbers `published_blocks`; quiz picker demands SSL on preview rows.

| ID | Change |
|---|---|
| REG-P0-001 | Serve `draft`/`paused` Brands on preview hosts only. Custom domains stay closed. |
| REG-P1-017 / UX-P0-001 | Delivery Serving and View Live Site follow Brand status. Draft = Preview site. |
| REG-P0-002 | Quiz domain picker uses `isDomainSelectable`. |
| REG-P0-006 | Seed funnel deployments as `draft`. |
| REG-P0-004 | Autosave writes `body_blocks` only. Publish toggle snapshots `published_blocks`. |
| REG-P0-007 | Publish brand preflight requires a published Home `/`. |
| Tests | Unit tests for preview-host visibility. Extend `test-preview-hosts`. |

Out of Wave 1 (human gate or later lane):

- REG-P0-008 password rotation
- REG-P0-010 CNAME / default SNI / real custom DNS
- REG-P0-003 full master version pin
- REG-P0-005 advertorial preflight + archive (Lane E, immediately after Wave 1 if time)
- REG-P0-009 live copy junk on Dont Settle
- REG-P0-011 tenancy on funnel reads
- REG-P0-012 server action mismatch UX
- `PAGEFLO_LEGACY_HOST_REDIRECT` stays off
- Production `.env` host names stay LegalOS unless a later approved env migration

## Wave 2 — deployment lifecycle parity

Advertorial go-live preflight. Archive vs delete. Quiz master Publish calls `setQuizPublished`. Invented `/q/{id}` `/a/{id}` URLs replaced with `effectiveDeploymentUrl`. Bulk deploy placeholder vs value.

## Wave 3 — identity, settings, tests

One Brand document. Dead Paths controls. Replace source-regex acceptance tests with browser/state tests. Do not grandfather W60.

## Release

Ordinary Plesk sequence after `pnpm typecheck` and focused tests. Smoke: create or reuse `rescue-qa-20260923`, confirm preview 200 **without** relying only on Dont Settle.
