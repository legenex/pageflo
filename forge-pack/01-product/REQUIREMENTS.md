# Requirements

Each requirement has an observable verification target. IDs are stable for execution and traceability.

## Scope and shell

- PF-001: Existing internal roles remain functional. No new paid-customer role system is required. Verify existing role tests and UI access.
- PF-002: Production shell/navigation follows the supplied PageFlo redesign and internal navigation model. Verify browser screenshots and route availability.
- PF-003: Production UI contains no fake prototype metrics/entities presented as real. Verify fixture/demo strings are absent from production paths or clearly labeled examples.
- PF-004: Brand Kits are not a required top-level operator workflow. Brand identity is accessible from Brand/Site. Verify nav and Brand detail flow.

## Brand

- PF-010: Create/edit Brand with required identity fields from discovery. Verify persistence, validation, and brand-resolution tests.
- PF-011: Brand supports vertical values MVA, Workers' Compensation, insurance, finance, debt, home services, Other. Verify create/edit form and stored values.
- PF-012: Brand can be cloned with new identity/history and no accidental production domain/Lead duplication. Verify clone behavior.
- PF-013: AI can propose Brand identity from niche/brief for review. Verify generated draft and no automatic publish.
- PF-014: Brand provides PageFlo-hosted `/privacy` and `/terms` using reusable shared structures. Verify rendered brand identity and URLs.

## Brand website

- PF-020: Each Brand can own a normal multi-page website distinct from reusable funnel masters. Verify Brand website routes and page management.
- PF-021: AI can create a new Brand website from niche/brief. Verify draft website and required default pages.
- PF-022: Import a public WordPress or Base44 website with high visual fidelity into editable PageFlo structure. Verify at least one controlled WordPress fixture and one controlled Base44/public HTML fixture.
- PF-023: Imported website can operate without WordPress/Base44 runtime after PageFlo publish. Verify no runtime dependency on source host for local assets/content required by the migrated site.
- PF-024: Operator can edit website through natural-language AI with Brand context. Verify preview/direct-to-draft modes.
- PF-025: Operator can edit website through practical visual/section controls. Verify add/reorder/edit/hide/delete/undo or equivalent supported actions.
- PF-026: AI never silently edits live website. Verify version/publish boundary.

## Master assets

- PF-030: Master Quiz is brand-neutral and owns questions, answers, branching, outcomes, contact capture, consent, result/destination logic, and default copy. Verify data model and runtime.
- PF-031: Master Landing Page is brand-neutral reusable structure/design. Verify multi-brand deployments from one master.
- PF-032: Master Advertorial is brand-neutral reusable editorial structure/design. Verify CTA and embedded Quiz flows.
- PF-033: Master assets can be created, edited, cloned/duplicated, archived, and safely deleted. Verify active deployment delete protection.
- PF-034: Editing a master does not mutate live deployments until explicit republish. Verify version pin/publish behavior.
- PF-035: Deployment-specific public copy overrides are not available. Verify schema/UI/runtime do not store or apply such overrides except legacy compatibility fields that are deliberately ignored/migrated.

## Templates and builders

- PF-040: Quiz logic is independent from Quiz visual template. Verify same Quiz logic across at least two different visual templates.
- PF-041: Existing twenty Quiz templates render materially distinct structures per design specification. Verify visual/composition test sweep.
- PF-042: Quiz template preview uses the same composition path as deployed Quiz or a provably equivalent shared renderer. Verify renderer identity tests.
- PF-043: Landing Page templates render materially distinct structures. Verify template sweep and screenshots.
- PF-044: Advertorial templates render materially distinct structures. Verify template sweep and screenshots.
- PF-045: Landing Page/Advertorial can define recommended Quiz skin with operator override. Verify deployment creation UI and render.
- PF-046: Embedded Quiz does not alter master Quiz logic. Verify flow identity.
- PF-047: Parent assets can be created blank, cloned, imported from URL/HTML, or AI-generated. Verify all supported creation paths.
- PF-048: AI branded copy request creates/edits a parent variant, not a deployment-specific copy override. Verify resulting ownership/version model.

## Deployments

- PF-050: Deployment binds master asset to Brand/Site, visual template, domain, path, tracking/pixels/UTM, destination behavior, and embedded master Quiz where relevant. Verify schema and publish.
- PF-051: Brand identity automatically resolves into deployment. Verify Check A Case versus Don't Settle acceptance case.
- PF-052: Deployment states include Draft, Live, Paused and clear saved-versus-published version state. Verify UI/runtime.
- PF-053: Path collisions fail closed and identify conflict. Verify automated test.
- PF-054: Bulk deployment across multiple Brands is available in internal V1. Verify partial-failure isolation and review before publish.
- PF-055: Deployment public copy comes from its master version and Brand-resolved shared identity, not deployment copy overrides. Verify output.

## Domains and preview

- PF-060: Brand apex can host normal website and Brand paths/subdomains can host acquisition deployments. Verify routing matrix.
- PF-061: Canonical preview host is `*.preview.pageflo.io`. Verify application routing and health. DNS action itself is subject to operator authority if not already configured.
- PF-062: Domain workflow verifies binding, DNS state, SSL state, and correct PageFlo response. Verify existing cert/domain harnesses and browser/HTTP checks.
- PF-063: Existing production Plesk remains hosting backend for this phase. No VPS migration.

## AI

- PF-070: All AI feature paths use a provider abstraction and shared policy/lint layer. Verify no direct provider SDK call from feature paths.
- PF-071: AI automatically receives Brand and asset context. Verify prompt/context test without exposing secrets/Lead PII.
- PF-072: Operator chooses preview/diff or direct-to-draft apply mode. Verify both.
- PF-073: Multiple providers can be configured through APIs and supported auth mechanisms without hard-coding business logic to one model. Verify provider interface and at least one alternate test adapter if credentials are unavailable.

## Leads and delivery

- PF-080: Lead is durably persisted before nonessential downstream delivery work begins. Verify crash/failure test.
- PF-081: Downstream delivery uses durable queue/retry semantics with idempotency. Verify restart/retry and duplicate-prevention tests.
- PF-082: Generic configurable webhook is the primary new internal delivery adapter and supports LeadDistro.ai endpoints as configuration. Verify test endpoint fixture.
- PF-083: Preserve attribution/click IDs, shared browser/server event ID dedupe, configured consent evidence, validation/enrichment, Meta CAPI, delivery tracing, and notifications. Verify existing harnesses plus targeted additions.
- PF-084: Internal Leads UI supports search, Lead detail, consent, validation, delivery attempts/history, and clear errors. Verify browser journey.

## Production completion

- PF-090: Normal operator can complete the approved end-to-end workflow without SSH, SQL, WordPress, Base44, or raw Payload CMS. Verify E2E browser plus real test Lead in approved environment.
- PF-091: Existing production compatibility identifiers remain until deliberate migration. Verify `test:rebrand` and audit.
- PF-092: Ordinary releases continue to use the existing Plesk release path and are verified after deployment. Verify release evidence in state.
- PF-093: No unresolved P0/P1 regression, tenant isolation failure, Lead-loss risk, broken live domain, or critical security defect remains at project completion.
