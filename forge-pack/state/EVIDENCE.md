# Evidence

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
