# Handoff

Current phase: Wave 01 complete. Wave 02 is next.
Current unit: W12 done. Next unblocked: W20 (needs W10+W11), W21 (needs W11), W22 (needs W10+W21).
Last verified state: W11 `3ab9aed`. W12 durability and idempotency tests passed.
Known failure: production SSH alias `legalos` missing. `app.pageflo.io` DNS UNPROVEN. Ordinary Plesk release of Wave 01 src changes is UNPROVEN.
Next action: W21 master asset/version semantics, then W22 quiz composition repair. W20 website editor can proceed in parallel with disjoint files. Do not edit `src/migrations/` in parallel.
Important files: `src/lib/lead-pipeline/run.ts`, `src/queues/lead-delivery.ts`, `src/lib/quiz-templates/`.
