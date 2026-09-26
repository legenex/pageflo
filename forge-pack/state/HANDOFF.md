# Handoff

Current phase: Rescue closeout, consent + delivery + harness. Reviewer gates (Bugsy, Critic, fresh Final QA) run against the SHA below.
Production SHA: see the last "Production SHA" line in `forge-pack/state/EVIDENCE.md` (updated on every release).
Acceptance Brand: `pageflo-rescue-acceptance-944138` (site 23). Operator credentials: `/home/legenex/.pageflo-admin-credentials` (mode 600).
What changed this run:
- Explicit consent (unchecked box, exact disclosure stored, server-resolved source) on quiz + website form; `leads.consent_*`; Leads UI evidence panel.
- Honest delivery state from an append-only `delivery_log`; `downstream.completed` is not "delivered"; `leads.delivery_state`.
- The delivery queue had never accepted a job (BullMQ rejects `lead:<id>` ids); fixed.
- Operator Retry (authorised, idempotent, skips settled steps, in history).
- HLR `state`: valid / invalid / not_configured / provider_error.
- Advertorial go-live refuses starter copy.
- Production harnesses rewritten (evidence-bearing assertions, exact-record targeting, no per-run pollution).
Tests: `pnpm typecheck`, `pnpm test` (incl. `test:leads-ui`, `test:delivery`, `test:harness-hygiene`, `test:publish`), `pnpm test:e2e`, `pnpm test:consent`, `pnpm test:release`, `pnpm verify:schema`, `pnpm test:isolation`, `pnpm test:console`; production `pnpm test:production-acceptance` (A-K).
Known blockers: none autonomous. Human-gated: custom hostname DNS/TLS (B-RESCUE-02), live buyer/pixel activation, production env naming.
Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`. Do not change default SNI (`crashclaim.co`).
Next action: none for V1 once the three reviewers PASS. Optional later: legal entity facts, EB-1, dedicated VPS, Plivo credentials for real phone validation.
Important files: `src/lib/lead-consent.ts`, `src/lib/lead-pipeline/delivery-state.ts`, `src/lib/lead-pipeline/log.ts`, `src/lib/lead-pipeline/run.ts`, `src/queues/lead-delivery.ts`, `src/workers/lead-delivery.ts`, `scripts/lib/production.mts`, `scripts/test-production-acceptance.mts`.
