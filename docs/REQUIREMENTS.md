# PageFlo requirements

Version 1, 1 September 2026.

This document is built from functionality **actually present in the repository**,
plus clearly identified future PageFlo requirements. Every LIVE claim was
checked against code and, where a harness exists, against a suite that ran.

## Status vocabulary

| Status | Meaning |
|---|---|
| **LIVE** | Built, reachable by a user or a caller, and exercised by a test or verified in production. |
| **PARTIAL** | Built enough to be useful but incomplete in a way that matters. The gap is stated. |
| **PLANNED** | Not built. A PageFlo requirement with no implementation today. |
| **UNKNOWN / NEEDS AUDIT** | Code exists, but its correctness or completeness has not been established. Do not assume either way. |

Do not upgrade a status without evidence. Do not convert an assumption into a
fact.

---

## 1. Tenancy and access

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 1.1 | A `Site` is the tenant root; every content object is scoped to one | **LIVE** | `src/collections/*`; required `site` on Pages, LandingPages, Quizzes, BlogPosts, Leads, Numbers, TrackingConfigs |
| 1.2 | Access control filters reads and writes by Site binding | **LIVE** | `src/access/index.ts`; `pnpm test:isolation`, 49 assertions |
| 1.3 | Users bind to Sites with role `admin` / `editor` / `analyst`; `super_admin` bypasses | **LIVE** | `src/collections/Users.ts` |
| 1.4 | Server actions in the custom admin re-verify the caller is bound to the Site | **LIVE** | `src/lib/auth.ts`, `isBoundToSite`; `pnpm test:authz` |
| 1.5 | Site deletion cascades to all children including Leads | **LIVE** | `src/hooks/site-cascade.ts`, `SITE_CHILD_COLLECTIONS` |
| 1.6 | Every authenticated mutation is written to an audit log | **LIVE** | `src/hooks/audit.ts`, attached across nearly all collections |
| 1.7 | **Funnel authoring and deployment collections are Site-scoped** | **PARTIAL** | Access on all six `Funnel*` collections is plain `isAuthenticated`, not the `siteScoped*` helpers. Verified in `src/collections/FunnelQuizzes.ts:16-21`. Any authenticated user can read and write any brand's funnel content. Phase 7. |
| 1.8 | Operator UI for user and role management | **PARTIAL** | `/admin/users` and `/admin/settings/users` are `Placeholder` components deep-linking to raw Payload `/cms`. Functionality exists; the operator surface does not. |
| 1.9 | Two-factor authentication for operator accounts | **PLANNED** | No implementation. |
| 1.10 | External-party portals (buyer, supplier, client) with row-scoped isolation | **PLANNED** | No implementation. Multi-tenancy today is operator-side only. |

---

## 2. Sites, brands and domains

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 2.1 | Create a Site with brand identity, palette, typography and legal fields | **LIVE** | `src/collections/Sites.ts`, `brand_identity` jsonb |
| 2.2 | Brand kit resolution, with precedence between sources | **LIVE** | `src/lib/brand-identity/{index,precedence,profile,sources}.ts`; `pnpm test:brand-identity`, 721 assertions |
| 2.3 | Brand tokens applied to public render as CSS variables | **LIVE** | `src/app/(public)/layout.tsx` |
| 2.4 | Contrast-safe color derivation; white-on-white structurally impossible | **LIVE** | `src/lib/builder/color-system.ts` reusing `page-lint.ts` WCAG math; `pnpm lint:tokens`, `pnpm sweep:templates` |
| 2.5 | A new Site is seeded with usable starter content | **LIVE** | `src/lib/starter-content.ts`, `src/seed/home-blocks.ts` |
| 2.6 | Auto-issued preview subdomain per Site, primary until a custom domain verifies, undeletable from UI | **LIVE** | `LEGALOS_PREVIEW_DOMAIN`; wildcard cert `*.preview.legenex.com` present on the host |
| 2.7 | Custom domain provisioning: DNS check, vhost, reverse proxy, certificate | **LIVE** | `src/lib/plesk/provision-domain.ts`; production tenant domains responding 200 |
| 2.8 | `ssl_status='active'` only after a real HTTPS handshake | **LIVE** | `src/lib/ssl-poll.ts` |
| 2.9 | Host-to-Site resolution with a bounded cache and explicit invalidation | **LIVE** | `src/lib/site-resolver.ts`, 60s TTL, `invalidateHostCache` |
| 2.10 | Preview of unpublished content without DNS | **LIVE** | `?site=<slug>` and `?preview=1`; route re-verifies authentication before honouring the draft bypass |
| 2.11 | Slug change leaves a 301 from the old path | **LIVE** | `src/hooks/slug-redirects.ts` |
| 2.12 | Domain provisioning is portable across hosting providers | **PLANNED** | Coupled to Plesk. The seam is narrow: `src/lib/plesk/{client,provision-domain}.ts`, imported by four files. Phase 9. |
| 2.13 | Certificate ownership is unambiguous | **UNKNOWN / NEEDS AUDIT** | Two issuance paths on the host: Plesk Let's Encrypt, and a separate `acme.sh` holding four certs. Nothing records which domain belongs to which. |

---

## 3. Page and funnel authoring

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 3.1 | Block-based page building with typed, composable sections | **LIVE** | `src/collections/Pages.ts`, `src/lib/builder/block-schemas.ts`, `src/components/blocks/BlockRenderer.tsx` |
| 3.2 | Page health linting: accessibility, SEO, hierarchy, contrast | **LIVE** | `src/lib/builder/page-lint.ts`, re-runs on every blocks-state change |
| 3.3 | Import raw HTML into structured blocks | **LIVE** | `src/lib/builder/html-to-blocks.ts`, `html-to-structured-blocks.ts` |
| 3.4 | AI clone of a remote page into blocks, with asset extraction | **LIVE** | `src/lib/builder/extract/*`, `ai-clone-action.ts` |
| 3.5 | AI rewrite of copy for a brand | **LIVE** | `ai-rewrite-action.ts` through `invokeLLM` |
| 3.6 | Brand token extraction from a reference page | **LIVE** | `src/lib/builder/extract-brand-tokens.ts` |
| 3.7 | Brandless landing page authoring, slot-based | **LIVE** | `FunnelLandingPages`, `src/lib/lp-slots/`, `src/lib/lp-templates/`; `pnpm test:slots` |
| 3.8 | Brandless advertorial authoring | **LIVE** | `FunnelAdvertorials`, `src/components/builder/advertorial/` |
| 3.9 | Landing page template library with identity enforcement | **LIVE** | A deployment naming an unknown template refuses to serve rather than rendering a fallback; `pnpm test:identity`, 33 assertions |
| 3.10 | Media upload and image picking in the builder | **LIVE** | `/api/media/upload`, `src/components/builder/page-builder/ImagePicker.tsx` |
| 3.11 | Scheduled publishing of pages | **LIVE** | `20260529_020000_pages_scheduled_publish.ts`; route honours `preview=1` for scheduled content |
| 3.12 | Saved and published are distinct states, visibly | **LIVE** | `20260814_160000_lp_deployment_publish_state.ts`; `pnpm test:publish` |
| 3.13 | Builder code is type-checked | **PARTIAL** | 54 files carry `// @ts-nocheck`, about 24,000 of roughly 100,000 lines of `src/`, concentrated in the ported builder apps. The original cause (missing `funnel-*` slugs in generated types) no longer holds. Phase 5. |
| 3.14 | Builder UI meets the PageFlo design system | **PLANNED** | The design system does not exist yet. Phases 2 and 4. |

---

## 4. Quizzes and qualification

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 4.1 | Multi-step quiz with typed questions and answers | **LIVE** | `src/lib/quiz-flow/`, `src/components/public/quiz/QuizRuntime.tsx`; `pnpm test:flow` |
| 4.2 | Conditional branching on answers | **LIVE** | `src/lib/quiz-flow/paths.ts` |
| 4.3 | Tiered qualification outcomes | **LIVE** | `src/lib/quiz-flow/validate.ts`, tier model and `setTier` answers |
| 4.4 | Derived-graph validation before publish | **LIVE** | `validate.ts` checks `tier_reachability`, `no_entry_for_tier`, and that some step resolves for an untiered visitor |
| 4.5 | Quiz visual templates as manageable records, not constants | **LIVE** | `FunnelQuizTemplates`, `20260813_220000_template_records.ts`; `pnpm test:records`, `pnpm test:registry` |
| 4.6 | Twenty selectable quiz templates that are visually distinct | **PARTIAL** | Measured, not asserted: `docs/quiz-fidelity-baseline.md` and `docs/quiz-template-source-audit.md` record the perceptual baseline and where templates collapse toward each other. Stage B landed six genuinely distinct templates. The remainder is measured work in progress. |
| 4.7 | Mid-flow tier lookup against an external provider | **PARTIAL** | The call, contract and error handling are built and asserted in `scripts/test-quiz-webhook.mts`. **The provider does not exist.** See EB-1 in `docs/external-blockers.md`. Blocks tiers 1, 2 and 4 of the shipped MVA flow. |
| 4.8 | The final screen a claimant sees is meaningful | **LIVE** | Commit `12ba129` |
| 4.9 | Quiz composition and embedding inside a landing page | **LIVE** | `20260813_180000_lp_deployment_embedded_quiz.ts`; `pnpm test:compositions` |
| 4.10 | Quiz progress form persistence | **LIVE** | `20260806_120000_quiz_deployment_progress_form.ts` |

---

## 5. Deployment and multi-brand

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 5.1 | Bind brandless content to a Site, Domain and path | **LIVE** | `Funnel{Advertorial,Lp,Quiz}Deployments` |
| 5.2 | One piece of content deployed under many brands | **LIVE** | `src/lib/brand-map.ts` resolves brand at render |
| 5.3 | Per-deployment CTA mode, UTM and pixel configuration | **LIVE** | Deployment collection fields |
| 5.4 | Per-deployment content overrides | **LIVE** | `20260813_120000_lp_deployment_content_overrides.ts` |
| 5.5 | Every deployed path is resolvable by a real request | **LIVE** | `pnpm check:paths`; 9 deployments, 0 unresolvable |
| 5.6 | Re-saving a deployment is not a second deployment | **LIVE** | Commit `b46976a` |
| 5.7 | Domain eligibility enforced before deployment | **LIVE** | `LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY`, set on the host |
| 5.8 | Cross-references between funnel documents use stable ids | **PARTIAL** | Stored as text ids, for example `quiz_deployment_id`, not Payload relationships. Mirrors the source artifact. No referential integrity; `pnpm reconcile:lp-quiz` exists to repair drift, which is evidence the gap is real. |

---

## 6. Lead capture, consent and validation

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 6.1 | One canonical processing path for every real lead source | **LIVE** | `runLeadPipeline()` in `src/lib/lead-pipeline/run.ts`, reached by `/api/leads` and `/api/legalos/test-capture` |
| 6.2 | Attribution and click-id derivation | **LIVE** | `src/lib/lead-pipeline/attribution.ts` |
| 6.3 | Pixel and CAPI share one `event_id` for deduplication | **LIVE** | `src/lib/lead-pipeline/event-id.ts` |
| 6.4 | TrustedForm certificate claimed server-side and stored | **LIVE** | `src/lib/integrations/trustedform.ts`; never generated or substituted |
| 6.5 | Jornaya lead verification | **LIVE** | `src/lib/integrations/jornaya.ts` |
| 6.6 | Phone enrichment via HLR | **LIVE** | `src/lib/integrations/hlr.ts`, Plivo |
| 6.7 | Durable lead row with idempotency key | **LIVE** | `20260814_120000_leads_idempotency_key.ts`; `pnpm test:idempotency` |
| 6.8 | Outbound webhook dispatch with HMAC signing and event filtering | **LIVE** | `src/lib/lead-pipeline/dispatch-webhooks.ts`, through the SSRF admission in `src/lib/net/ssrf.ts` |
| 6.9 | Meta CAPI and TrueCall delivery | **LIVE** | `src/lib/integrations/{meta-capi,truecall}.ts` |
| 6.10 | Slack notification on capture | **LIVE** | `src/lib/lead-pipeline/slack.ts` |
| 6.11 | Bounded timeouts on every outbound call | **LIVE** | `pnpm test:timeouts`, 17 assertions |
| 6.12 | Consent line on a public lead form names the correct company | **LIVE** | Commit `7796feb` |
| 6.13 | End-to-end lead capture through a real browser | **LIVE** | `pnpm test:e2e`, 34 assertions, Chromium |
| 6.14 | **Lead processing survives a downstream outage** | **PARTIAL** | The pipeline runs **synchronously inside the request**. `bullmq` is a declared dependency with no worker; Redis is used only for a health-check ping. A slow or failing downstream extends the visitor's request. Timeouts bound it, but there is no retry queue and no replay after a crash. Phase 6. |
| 6.15 | Every rejected lead is retained with a stable machine reason | **UNKNOWN / NEEDS AUDIT** | Step results are traced. Whether every rejection path persists a durable, queryable reason has not been established. |
| 6.16 | Operator UI for leads | **PARTIAL** | `/admin/leads` is a `Placeholder` deep-linking to raw Payload `/cms`. Data exists; the operator surface does not. |
| 6.17 | Global do-not-contact suppression across every intake path | **PLANNED** | No implementation. |
| 6.18 | Configurable per-campaign validation rules | **PLANNED** | Validation is currently fixed in the pipeline, not configured per deployment. |

---

## 7. Routing and delivery

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 7.1 | Configurable outbound destinations per Site | **LIVE** | `TrackingConfigs`, webhook config |
| 7.2 | Delivery outcomes are distinguishable and recorded | **PARTIAL** | `WebhookDispatchResult` carries ok, status, error and duration per destination. Whether every outcome is durably persisted and queryable per lead is **UNKNOWN / NEEDS AUDIT**. |
| 7.3 | Route order, priority and weighting per campaign | **PLANNED** | No implementation. Delivery today is fan-out to all enabled destinations. |
| 7.4 | Caps by destination, campaign, state or period | **PLANNED** | No implementation. |
| 7.5 | Ping-post, exclusive, shared and resale delivery modes | **PLANNED** | No implementation. |
| 7.6 | Buyer response parsing, configurable per destination | **PLANNED** | No implementation. |
| 7.7 | Retry with bounded classes after a delivery failure | **PLANNED** | Depends on 6.14. |

---

## 8. AI assistance

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 8.1 | Schema-constrained generation with forced tool use | **LIVE** | `src/lib/ai/invoke.ts`, Zod to JSON schema, `tool_choice: { type: 'tool' }` |
| 8.2 | Validation failures retry with the error fed back | **LIVE** | Up to two retries |
| 8.3 | House-style linting on every AI output | **LIVE** | `src/lib/ai/banned-vocab.ts`, em-dash check, `enforceNoBannedVocab` |
| 8.4 | AI-tell removal preserving facts and quotes | **LIVE** | `src/lib/ai/humanizer.ts` |
| 8.5 | AI quiz template proposal | **LIVE** | `/api/legalos/quiz-ai`, `AINewQuizTemplateWizard.tsx`; `pnpm test:ai` with an injected fake LLM |
| 8.6 | Model choice is a closed union, widened in one place | **LIVE** | `invoke.ts`; default `claude-sonnet-4-6` |
| 8.7 | AI generation is cost-bounded per operator or per Site | **PLANNED** | No budget, quota or spend visibility. |

---

## 9. Analytics and campaign integrity

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 9.1 | Cross-brand funnel and attribution analytics | **PLANNED** | `/admin/analytics` is a 12-line `Placeholder`. |
| 9.2 | Step-level quiz drop-off and tier distribution | **PLANNED** | No implementation. |
| 9.3 | Cost per lead and campaign performance | **PLANNED** | No implementation. |
| 9.4 | Rejection-reason reporting | **PLANNED** | Depends on 6.15. |
| 9.5 | Campaign Integrity: deployed funnel matches approved funnel | **PLANNED** | No implementation. Ingredients exist (page lint, contrast audit, template identity refusal, deployment path checks); the unifying layer does not. |
| 9.6 | Consent evidence completeness reporting | **PLANNED** | No implementation. |
| 9.7 | Tracking fires exactly once, verified | **PARTIAL** | The shared `event_id` dedupe contract is implemented and tested. There is no reporting surface that shows an operator whether it held in production. |

---

## 10. Platform operations

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 10.1 | System health checks across process, database, Redis and integrations | **LIVE** | `src/lib/system-health/checks.ts`; `/admin/system` |
| 10.2 | Liveness endpoint independent of tenant mapping | **LIVE** | `/api/legalos/health`; deliberately not `self-check`, which 404s for the control-plane host |
| 10.3 | Structured error capture with PII redaction | **LIVE** | `/api/legalos/client-error`, `LEGALOS_ERROR_WEBHOOK_URL` optional; `pnpm test:observability`, 44 assertions |
| 10.4 | Release tooling with backup, correct migrate ordering, schema verification and health gate | **LIVE** | `scripts/release.sh`; `pnpm test:release`, 31 assertions |
| 10.5 | Schema verification reads every collection and global before start | **LIVE** | `pnpm verify:schema`; 25 collections, 1 global |
| 10.6 | Migrations are idempotent, retry-safe and reversible as a batch | **LIVE** | `pnpm test:release` asserts up, re-up, and `migrate:down` of the batch |
| 10.7 | Agent status board for parallel work | **LIVE** | `/admin/plan`, `src/lib/agent-plan/` |
| 10.8 | Operator handbook covering every screen | **LIVE** | `/admin/handbook`; `pnpm check:handbook`, 21 routes and 32 screens, 0 missing |
| 10.9 | **Automated database backups** | **PLANNED** | None. `/root/legalos-backups` holds only what releases produced, newest 15 August 2026. No restore drill has been performed. |
| 10.10 | **Continuous integration** | **PLANNED** | No `.github/` directory, no workflow. Nothing runs the validation matrix except a person or an agent. |
| 10.11 | **Lint configuration** | **PLANNED** | `next lint` has no committed ESLint config; it prompts interactively and exits 1. |
| 10.12 | Everything that runs in production is version-controlled | **PARTIAL** | `/usr/local/bin/legalos-warm.sh` runs every 5 minutes from `legalos-keepalive.timer` and exists only on the server. `legalos-dev-restart.timer` restarts the service daily at 04:00 UTC to work around memory creep. Neither is in the repository or documented anywhere before this pack. |
| 10.13 | Deployment is reproducible on a fresh host | **UNKNOWN / NEEDS AUDIT** | `scripts/first-time-setup.sh` describes the retired Docker model. Whether a fresh host can be brought up from the repository has not been tested. Phase 9. |

---

## 11. Rebrand to PageFlo

| # | Requirement | Status | Evidence and gaps |
|---|---|---|---|
| 11.1 | Product name is PageFlo in all user-facing surfaces | **PLANNED** | 36 user-facing `LegalOS` strings across `src/components/` and `src/app/`. Phase 1. |
| 11.2 | Marketing fallback reflects PageFlo positioning, not legal-vertical | **PLANNED** | `src/components/LegalOSMarketing.tsx`. Phase 1 and 3. |
| 11.3 | Legal-vertical structures generalized, not deleted | **PLANNED** | `SharedLegalTemplates` and the legal slug fallbacks are load-bearing today. |
| 11.4 | Identifier rename strategy for load-bearing names | **PLANNED** | `LEGALOS_*` environment variables (26 distinct), the `/api/legalos/*` route namespace, the `legalos-dev` service, the `legalos` database, and the `molegenexcom` compose project are all live infrastructure. Renaming any of them requires a coordinated change, not a find and replace. Phase 1 decides the strategy; phases 9 to 11 execute the infrastructure half. |
| 11.5 | PageFlo design system and application shell | **PLANNED** | Phases 2 and 3. Explicitly out of scope until then. |

---

## Global acceptance rules

- Tests use disposable databases and injected fakes. No test reaches a live
  external endpoint, and no test spends money.
- Every P0 path has positive, negative, timeout, authorization and idempotency
  coverage where applicable.
- Migrations are additive, idempotent and restartable.
- Every production change has stated rollback steps and observable success
  criteria.
- No requirement is marked LIVE without a commit, command output, or observed
  behavior behind it.
- A status is downgraded the moment its evidence stops holding, not when someone
  gets around to it.
