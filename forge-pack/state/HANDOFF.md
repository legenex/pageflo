# Handoff

Current phase: Wave 01 in progress.
Current unit: W11 done. Next: W12 Lead durability.
Last verified state: W10 `6557632`. W11 typecheck and test:release passed.
Known failure: production SSH alias `legalos` missing. `app.pageflo.io` DNS UNPROVEN.
Next action: W12 durable Lead persist then queue/retry/idempotency using existing Redis/BullMQ. Do not replace working synchronous capture until queue tests pass. `src/lib/lead-pipeline/run.ts` is integrator-only.
Important files: `src/lib/lead-pipeline/run.ts`, `src/lib/lead-pipeline/dispatch-webhooks.ts`.
