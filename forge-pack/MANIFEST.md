# Manifest

## Root pack files

- `README.md`: entry point and source precedence.
- `00-intake/DISCOVERY.md`: approved user decisions.
- `00-intake/SOURCE-LEDGER.md`: evidence used to build this pack.
- `00-intake/AUDIT.md`: verified repository facts and known gaps.
- `00-intake/OPERATOR-AUTHORITY.md`: explicit autonomous authority for this build.
- `01-product/PROJECT.md`: locked project contract.
- `01-product/REQUIREMENTS.md`: testable requirements.
- `01-product/ACCEPTANCE.md`: end-to-end acceptance contract.
- `01-product/DECISIONS.md`: resolved decisions and conflict resolutions.
- `01-product/ASSUMPTIONS.md`: explicit assumptions that Grok may verify but must not silently expand.
- `01-product/DEFERRED.md`: intentionally deferred scope.
- `02-architecture/ARCHITECTURE.md`: target architecture derived from the approved model.
- `02-architecture/CONTEXT-GRAPH.md`: object and dependency context.
- `02-architecture/SECURITY.md`: non-negotiable security and tenant boundaries.
- `02-architecture/OPERATIONS.md`: Plesk and release operations.
- `02-architecture/RISKS.md`: risk register.
- `03-plan/WORK-GRAPH.md`: dependency graph and critical path.
- `03-plan/WORK-UNITS.yaml`: machine-readable execution units.
- `03-plan/BUILD-PLAN.md`: execution waves.
- `03-plan/HUMAN-PATH.md`: red gates that may require later human authority.
- `03-plan/TRACEABILITY.md`: requirement to work to evidence mapping.
- `04-prompts/WAVE-*.md`: bounded wave prompts.
- `05-execution/EXECUTION-PROMPT.md`: autonomous outer-loop contract.
- `05-execution/RALPH.md`: fresh-context iteration rules.
- `05-execution/GOAL-LOOP.md`: bounded unit loop.
- `05-execution/EVALUATOR-LOOP.md`: independent review loop.
- `05-execution/STALL-POLICY.md`: stop and reroute rules.
- `06-qa/QUALITY-GATES.md`: fast and full gates.
- `06-qa/ACCEPTANCE-MATRIX.md`: acceptance checklist.
- `06-qa/REVIEW-CHECKLIST.md`: adversarial reviewer checklist.
- `06-qa/PACK-REVIEW.md`: pack self-review verdict.
- `07-handoff/RUNBOOK.md`: resume and release runbook.
- `08-hosts/GROK-4.6.md`: Grok-specific usage guidance.
- `agents/*.md`: host-neutral role contracts.
- `state/*.md`: durable project memory.
