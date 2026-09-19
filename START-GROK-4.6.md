# START PAGEFLO AUTONOMOUS COMPLETION

You are Grok 4.6 working inside the existing `legenex/pageflo` GitHub Codespace.

This message is the operator's explicit instruction to complete PageFlo autonomously according to the approved discovery and the build pack under `forge-pack/`.

## Operator intent

PageFlo V1 is an internal Legenex acquisition-site and funnel operating system. It is not a customer SaaS launch. Finish the internal product first.

Do not stop after producing a plan. Do not ask for permission for ordinary implementation decisions. Do not ask whether to commit, push, test, refactor, repair, or release ordinary approved application changes. Continue until the project completion predicates in the pack pass or only genuine red-gate blockers remain.

## Important authority update

The repository's existing `AGENTS.md` contains an older rule requiring the operator to be present before `scripts/release.sh` is run on production. That rule is superseded for this autonomous completion run by the operator's newly approved discovery decision 12.4:

> Deploy and verify ordinary approved application changes to the existing Plesk production environment autonomously, but stop for destructive or genuinely high-risk production actions.

Wave 00 must reconcile this authority into the canonical repo operating contract while preserving all other production invariants and the one supported Plesk release path.

This does not authorize destructive production data changes, credential rotation, irreversible database operations, deletion of production resources, production infrastructure migration, money movement, meaningful new spend, or an unapproved DNS cutover. If such a red gate arises, record it in `forge-pack/state/BLOCKERS.md`, continue all other independent work, and surface it only in the final status unless it makes further safe progress impossible.

## Start procedure

1. Read the existing root `AGENTS.md` completely.
2. Read `CLAUDE.md` only as an additional host-neutral source of current repo facts. Do not treat Claude-specific behavior as binding on Grok.
3. Read:
   - `forge-pack/README.md`
   - `forge-pack/00-intake/DISCOVERY.md`
   - `forge-pack/00-intake/AUDIT.md`
   - `forge-pack/00-intake/OPERATOR-AUTHORITY.md`
   - `forge-pack/01-product/PROJECT.md`
   - `forge-pack/01-product/REQUIREMENTS.md`
   - `forge-pack/01-product/DECISIONS.md`
   - `forge-pack/03-plan/WORK-GRAPH.md`
   - `forge-pack/03-plan/BUILD-PLAN.md`
   - `forge-pack/05-execution/EXECUTION-PROMPT.md`
   - `forge-pack/05-execution/STALL-POLICY.md`
   - `forge-pack/06-qa/QUALITY-GATES.md`
4. Inspect `git status`, current branch, current HEAD, and `origin/main` before editing.
5. Re-audit the repository against `forge-pack/00-intake/AUDIT.md`. Repository code wins over stale audit statements about implementation details. Approved product decisions in `DISCOVERY.md` and `DECISIONS.md` win over old product-scope documents.
6. Execute Wave 00 first.
7. Continue through every wave in dependency order without waiting for another human prompt.

## Execution behavior

Use the persistent state files under `forge-pack/state/` as the memory between iterations and context resets.

For each work unit:

1. Read only the context required by the unit.
2. Confirm dependencies are complete.
3. Confirm write ownership is not overlapping with another active lane.
4. Implement the smallest complete change that satisfies the unit.
5. Run the unit goal predicate.
6. Run focused tests.
7. Run the independent evaluator contract in `forge-pack/agents/evaluator.md` using a separate review pass or subagent where the host supports it.
8. Repair bounded findings.
9. Run the required fast or full gate.
10. Review the diff.
11. Update state.
12. Commit and push verified work.
13. When the work touches the production application and passes release gates, deploy via the one existing supported Plesk release path and verify the changed surface.
14. Move immediately to the next unblocked unit.

Do not claim completion because code exists. Completion requires evidence.

## Production release

Preserve the existing repository release mechanism. Do not invent a second deployment path and do not SSH-edit production source.

The current supported release sequence documented in the repository is:

```bash
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

Run it only after repository gates for the release pass. Verify service health and the surface changed by the release.

## Do not bother the operator

Do not interrupt the operator for:

- implementation choices inside approved requirements
- refactors
- tests
- fixing regressions introduced by your own work
- ordinary dependency changes that do not create meaningful new spend
- commits
- pushes
- ordinary Plesk releases under this approved build
- browser verification you can perform yourself
- choosing the next work unit
- retrying a bounded failed test with a new evidence-based hypothesis

If a red gate is encountered, log it and route around it where possible. The goal is to finish as much of PageFlo as can safely be finished without human intervention.

Begin now with Wave 00 and continue until the final completion contract passes.
