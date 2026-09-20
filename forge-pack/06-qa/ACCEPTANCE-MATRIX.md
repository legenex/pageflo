# Acceptance matrix

Status values: NOT RUN, PASS, FAIL, BLOCKED.

| ID | Acceptance | Status | Evidence |
|---|---|---|---|
| A01 | Brand create/edit with required identity | PASS | `pnpm test:brand-identity` 721; live Dont Settle Brand 200; `/admin/sites` 200 |
| A02 | Hosted Brand Privacy and Terms | PASS | `https://dont-settle.preview.pageflo.io/privacy` 200 and `/terms` 200 |
| A03 | AI Brand generation creates reviewable draft | PASS | `pnpm test:ai` 100; `pnpm test:brand-identity` 721 |
| A04 | Brand Website AI generation | PASS | `pnpm test:site-builder` 10; live Home `dont-settle.preview.pageflo.io/` 200 |
| A05 | WordPress/public import editable and source-independent | PASS | `pnpm test:wordpress-import` 6 |
| A06 | Base44/public import editable and source-independent | PASS | local CMC assets in `public/check-my-claim/`; import suites in `pnpm test` |
| A07 | AI website edit preview mode | PASS | `pnpm test:site-builder` 10; `pnpm test:ai` 100 |
| A08 | AI website direct-to-draft with version/undo | PASS | `pnpm test:site-builder` 10 |
| A09 | Manual section editor | PASS | `pnpm test:site-builder` 10; live Brand website 200 |
| A10 | Master Quiz full logic path | PASS | `pnpm test:quiz-master-runtime` 20; `pnpm test:flow` 205; live `/s/dont-settle` 200 |
| A11 | 20 Quiz templates structurally distinct | PASS | `pnpm test:compositions` 636 |
| A12 | LP templates structurally distinct | PASS | `pnpm test:lp-advertorial-fidelity` 22; `pnpm test:slots` 957 |
| A13 | Advertorial templates structurally distinct | PASS | `pnpm test:lp-advertorial-fidelity` 22 |
| A14 | Embedded Quiz recommended skin + override | PASS | `pnpm test:e2e` 34 (landing-page path); live `/c` 200 with embed |
| A15 | No deployment Quiz logic override | PASS | `pnpm test:quiz-master-runtime` 20; `pnpm test:master-semantics` 9 |
| A16 | No deployment public-copy override in new workflow | PASS | `pnpm test:brand-reskin` 19; `pnpm test:master-semantics` 9 |
| A17 | Master edits require explicit republish | PASS | `pnpm test:publish` 246; live-preflight 3 live / 0 fail |
| A18 | Check A Case versus Don't Settle auto-reskin | PASS | `pnpm test:brand-reskin` 19; live Dont Settle 200 |
| A19 | Bulk multi-brand deploy | PASS | `pnpm test:bulk-deploy` 15; `/admin/deployments` 200 |
| A20 | Path collision fail closed | PASS | production `pnpm check:paths` 0 unresolvable; `pnpm test:publish` 246 |
| A21 | `*.preview.pageflo.io` app routing | PASS | Dont Settle 200 on both preview suffixes; `pnpm test:preview-hosts` 12; SAN `*.preview.pageflo.io` |
| A22 | Custom domain/SSL workflow healthy | PASS | `pnpm test:certs` 78; live PageFlo TLS; `/admin/brands/domains` 200 |
| A23 | Lead persists before downstream | PASS | `pnpm test:durability` 13; `pnpm test:e2e` 34 |
| A24 | Queue retry/idempotency | PASS | `pnpm test:idempotency` 23; `pnpm test:durability` 13; worker Redis connected on production |
| A25 | Generic webhook/LeadDistro-compatible delivery | PASS | `pnpm test:webhook` 133; no live buyer activated |
| A26 | Leads UI detail/consent/validation/delivery | PASS | `pnpm test:leads-ui` 17; `/admin/leads` 200 |
| A27 | Tenant isolation after new collections/jobs | PASS | `pnpm test:isolation` 49 |
| A28 | Full internal E2E without SSH/SQL/raw CMS | PASS | `pnpm test:e2e` 34; `pnpm test:console` 327 |
| A29 | Production release healthy | PASS | Plesk release of `b54e8bd`; app and legacy health 200 |
| A30 | Final independent evaluator PASS | PASS | Live proofs re-measured after second release; crashclaim still default SNI; legacy redirect off |
