# Goal loop

For each bounded unit:

1. State objective and measurable predicate.
2. Inspect evidence before changing code.
3. Make the smallest coherent change likely to move the predicate.
4. Run the predicate.
5. Interpret result, do not merely read exit code.
6. Continue only if there is measurable progress or a new evidence-backed hypothesis.
7. Stop on success.
8. Stop on stall.
9. Record result.

Do not expand scope because nearby code looks untidy. Create a separate defect/work item unless it blocks the current predicate.
