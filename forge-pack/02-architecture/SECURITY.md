# Security contract

Preserve and extend the current repository's tenant and secret invariants.

## Required

- Site/Brand remains authorization boundary everywhere, including custom server actions and background jobs.
- New Brand Website records/pages and deployment operations must use existing authorization helpers rather than inventing local checks.
- No cross-tenant data access in UI, APIs, jobs, queues, or exports.
- Secrets never enter client bundles, logs, Lead payloads, fixtures, prompts, or commits.
- Outbound URL imports and AI/reference fetches must use existing SSRF admission controls.
- Imported HTML must be sanitized and must not execute arbitrary source-site JavaScript by default.
- Custom scripts remain controlled/audited if current product supports them.
- AI output cannot bypass draft/publish boundary.
- Queue workers must re-check tenancy/ownership using durable IDs, not trust client-provided scope.
- Idempotency must protect buyer/webhook/CAPI side effects.
- Consent evidence remains immutable once captured except for append-only processing status.

## Verification

Run existing authorization, isolation, trusted-host, timeout, Lead idempotency, and relevant security harnesses. Add tests for any new Brand Website/import/queue endpoints.
