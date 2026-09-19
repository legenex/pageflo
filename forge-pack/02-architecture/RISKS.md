# Risk register

## R1 Production regression on shared Plesk
Severity: Critical

Mitigation: preserve release script, test before release, small coherent releases, verify after release, no server source edits.

## R2 Lead loss during async pipeline change
Severity: Critical

Mitigation: persistence before enqueue, idempotency, retry tests, queue outage tests, e2e test, preserve current behavior until replacement is proven.

## R3 Cross-tenant/Brand data leakage
Severity: Critical

Mitigation: reuse current auth helpers, isolation tests for new collections/server actions/workers.

## R4 Master/deployment migration changes live behavior
Severity: High

Mitigation: versioned master publication, explicit republish, compatibility migration, do not remove legacy fields before live records are audited.

## R5 Quiz and page template fidelity remains superficial
Severity: High

Mitigation: structural composition model, shared live/preview renderer, screenshot sweep, independent visual evaluator.

## R6 WordPress/Base44 imports produce brittle HTML dumps
Severity: High

Mitigation: high-fidelity capture followed by structured normalization, asset localization, no source runtime dependency, editability acceptance tests.

## R7 AI damages public content
Severity: High

Mitigation: draft/version writes only, operator chooses preview/direct-to-draft, normal publish gates.

## R8 `preview.pageflo.io` requires DNS change
Severity: Medium to High

Mitigation: complete code/routing first. If DNS is absent and change is a red gate, record blocker and continue. Do not substitute a fake success state.

## R9 Existing docs and root instructions conflict with newly approved internal scope
Severity: High

Mitigation: Wave 00 reconciles source-of-truth documents before feature work.

## R10 Over-rewrite instead of completion
Severity: High

Mitigation: audit before edits, preserve working code, change root causes, reuse current collections/renderers where safe.
