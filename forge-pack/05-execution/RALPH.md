# Ralph-style outer loop

Use a fresh context at the boundary between independent work units when the host supports it and when active debugging context is no longer valuable.

Every iteration:

1. read `AGENTS.md`
2. read `state/HANDOFF.md`
3. read current unit definition and dependencies
4. verify git/worktree ownership
5. implement exactly one bounded unit
6. run goal predicate
7. run evaluator
8. update state
9. leave repository understandable and either clean or with clearly owned active work
10. exit/reset or proceed to next unit

Keep the same context during a difficult bounded debugging chain if reconstructing it would be wasteful.
