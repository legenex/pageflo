# Stall policy

A unit is stalled when:

- two consecutive attempts produce no meaningful evidence of progress, or
- the same failure recurs without a new hypothesis, or
- required external authority/evidence is unavailable.

On stall:

1. stop automatic retries
2. record exact failure in `state/BLOCKERS.md`
3. record approaches already tried
4. identify smallest missing fact/authority
5. continue another independent unblocked unit when safe
6. do not interrupt the operator unless the blocker is the final critical-path obstacle

Never burn the full context or token budget retrying the same approach.
