# Evaluator loop

Builder cannot be the sole judge of its own work.

After the goal predicate passes, a separate evaluator pass returns PASS, FAIL, or BLOCKED.

Evaluator checks:

- requirement traceability
- actual behavior, not implementation claim
- regressions
- tenancy/security
- migration compatibility
- error handling
- public/live state transitions
- data durability
- idempotency
- template/visual fidelity where relevant
- accessibility where relevant
- test quality and negative controls
- observability/debuggability
- fake/demo data leaks

On FAIL, convert findings into bounded repair items. Default repair budget: two evidence-backed repair cycles. A third is allowed only with a genuinely new hypothesis. Then mark BLOCKED and move to another safe unit if possible.
