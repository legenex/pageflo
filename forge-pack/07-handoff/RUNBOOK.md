# Runbook

## Start

From the PageFlo Codespace repo root, ensure `forge-pack/` and `START-GROK-4.6.md` are present. Paste the full START prompt into Grok 4.6.

## Resume after context reset

Read, in order:

1. root `AGENTS.md`
2. `forge-pack/state/HANDOFF.md`
3. `forge-pack/state/BLOCKERS.md`
4. current unit in `03-plan/WORK-UNITS.yaml`
5. only the requirement/architecture docs needed by that unit

Then continue from disk state. Do not reconstruct decisions from chat memory.

## Inspect status

- `git status`
- `git log -n 10 --oneline`
- `forge-pack/state/BACKLOG.md`
- `forge-pack/state/PROGRESS.md`
- `forge-pack/state/EVIDENCE.md`

## Blocker handling

Follow `05-execution/STALL-POLICY.md`. Red gates are recorded and routed around. Do not interrupt the operator until the red gate is the final critical-path obstacle.

## Verification

Use `06-qa/QUALITY-GATES.md` and update `06-qa/ACCEPTANCE-MATRIX.md` with real evidence.

## Release

Use the one repository-supported Plesk release path after required gates. Verify health and the changed surface. Record commit SHA, release time, commands, and verification evidence.

## Switching hosts/models

Any new agent/model reads the same root instructions and persistent state. Host-specific memory is never canonical. The repo state, approved discovery, work graph, and evidence are canonical.
