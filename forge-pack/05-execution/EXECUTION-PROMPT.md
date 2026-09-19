# Autonomous execution contract

The orchestrator owns the project outcome, not merely task dispatch.

Loop until complete:

1. Read root instructions and `state/HANDOFF.md`.
2. Read current work graph status from `state/BACKLOG.md`.
3. Select exactly one highest-priority unblocked unit, or one safe parallel wave with disjoint write ownership.
4. Re-read only the requirement/architecture paths needed for that unit.
5. Inspect current implementation before editing.
6. Implement the unit completely.
7. Run its goal predicate.
8. Run focused tests.
9. Run independent evaluator.
10. Repair bounded findings.
11. Run the required gate.
12. Review diff and migration impact.
13. Update state and evidence.
14. Commit and push verified work.
15. Release ordinary approved app changes when release gate says useful/safe.
16. Verify release.
17. Continue without waiting for the operator.

Never use conversational memory as project state when the fact can be written to disk.
