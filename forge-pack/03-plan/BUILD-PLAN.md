# Build plan

## Wave 00: Truth and authority

- W00 Re-audit current checkout.
- Reconcile root AGENTS/CLAUDE and persistent docs with approved discovery.
- Preserve current technical invariants.
- Update release authority so ordinary verified Plesk releases no longer require another operator prompt during this completion run.
- Rebaseline state, known defects, current live behavior, and exact collection/route ownership.

Gate: no feature coding before the new source-of-truth documents are internally consistent.

## Wave 01: Foundations in parallel

Lane A: W10 PageFlo shell/navigation redesign.

Lane B: W11 Brand/Site identity, hosted legal pages, Brand-first operator flow.

Lane C: W12 durable Lead persistence plus queue/retry/idempotency foundation.

Integration owner: orchestrator/integrator after each lane passes its predicate.

## Wave 02: Core creation systems in parallel

Lane A: W20 Brand Website first-class model and practical manual section editor.

Lane B: W21 master asset/version/clone/archive/delete semantics and explicit republish model.

Lane C: W22 repair Quiz composition renderer and true template fidelity.

## Wave 03: Authoring completion in parallel

Lane A: W30 WordPress/Base44/public URL high-fidelity import plus AI website editing.

Lane B: W31 Landing Page/Advertorial structural template fidelity and master authoring.

Lane C: W32 Master Quiz logic/runtime/builder completion.

## Wave 04: Bind, publish, operate

- W40 deployment model and automatic Brand reskinning.
- W41 bulk deploy and preview routing.
- W42 domains and `*.preview.pageflo.io` application support.
- W43 polished Leads UI and delivery observability can run in parallel with W40-W42 once W12 and W10 are complete.

## Wave 05: Product integration

- W50 migrations and compatibility review.
- Run controlled import journeys.
- Run Check A Case versus Don't Settle multi-brand acceptance.
- Run primary end-to-end Lead journey.
- Resolve all P0/P1 defects.

## Wave 06: Release and finish

- W60 full gate.
- Release verified ordinary changes to Plesk using supported release path.
- Verify app, domains that are already under application control, Lead flow, and operator journey.
- If `preview.pageflo.io` DNS itself requires an unapproved external change, leave one explicit red-gate blocker with exact record/action rather than interrupting the operator earlier.
- Final evaluator and Critic-style review.

## Critical path

W00 -> W11 -> W21 -> W22/W31/W32 -> W40 -> W41 -> W42 -> W50 -> W60.

W12 Lead durability is also release-critical and must reach W50 before completion.
