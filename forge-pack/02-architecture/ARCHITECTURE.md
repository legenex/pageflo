# Target architecture

This is an evolution of the current PageFlo architecture, not a rewrite.

## Core domain model

```text
Organization/User/Auth
        |
        v
Brand (current Site boundary)
  | identity + niche + legal defaults + website settings
  |
  +--> Brand Website
  |      +--> Website Pages / sections / versions
  |
  +--> Domains
  |
  +--> Deployments
          |
          +--> Master Landing Page
          +--> Master Advertorial
          +--> Master Quiz
                    |
                    +--> Quiz Logic / graph / outcomes
                    +--> Quiz Visual Template selection at deployment
```

## Brand

Keep the current Site tenant/security boundary unless audit proves otherwise. Move the operator-facing Brand identity experience into the Brand/Site flow. Do not destructively remove existing Brand Kit structures merely to simplify labels.

Brand owns or resolves:

- identity tokens
- niche/vertical
- logo/favicon
- typography
- phone/contact
- legal entity
- privacy/terms pages
- default disclaimer
- brand voice
- normal website
- domain relationships

## Brand Website

Treat the normal Brand website as a first-class editable PageFlo object, separate from brand-neutral acquisition masters.

Preferred implementation shape:

- website manifest owned by Brand/Site
- pages stored as structured blocks/sections compatible with PageFlo builder primitives
- page versions/drafts separated from published version
- AI commands operate against structured draft state
- import pipeline converts public HTML into structured blocks plus captured local assets
- import keeps source metadata for audit but public runtime does not depend on source CMS after migration

Avoid an entirely separate renderer if the existing page builder/public renderer can safely serve Brand website pages. Reuse stable primitives where possible.

## Master assets

Master Quiz, Landing Page, Advertorial remain brand-neutral. They own public copy and structure.

New model rule: deployments do not own public copy overrides. If legacy deployment copy fields exist, migrate or deprecate without breaking old live records. New UI must not expose them as a normal authoring path.

Master publication/versioning must let live deployments remain on their last published master version until explicit republish.

## Quiz architecture

Separate:

1. Quiz graph/logic/content
2. Quiz composition/visual template
3. Brand tokens
4. Deployment binding

The same composition renderer must power live runtime and previews, or both must share a lower-level composition component so preview identity is testable.

Use the repository's existing quiz renderer diagnosis as the starting point. The repair must address page shell, width, card/no-card, header, progress, question placement, answer layout, icons/meta, navigation placement, responsive composition, and preview/runtime identity where the selected template needs those degrees of freedom.

## Landing Page and Advertorial architecture

Use a template/composition registry where templates may differ structurally, not only through token bags. Reuse shared block primitives and Brand token resolution.

Embedded Quiz uses master Quiz plus selected/recommended Quiz visual template. Host page may recommend a skin but cannot mutate Quiz logic.

## Deployment architecture

Deployment stores bindings and runtime configuration, not copied master content:

- master asset ID/version
- Brand/Site ID
- visual template ID
- embedded Quiz master ID if applicable
- recommended/overridden Quiz visual template
- domain/path
- publish state/version
- tracking/pixel/UTM
- CTA behavior/destination references
- Lead delivery destination references

No new deployment-specific public copy fields.

## Domain and preview architecture

Maintain current Plesk-backed custom-domain flow. Add canonical PageFlo preview routing for `*.preview.pageflo.io` while preserving existing compatibility preview host until safe to retire.

Application work and DNS work are separate. Code may support the new host before DNS is switched.

## Lead architecture

Required transaction boundary:

```text
public submission
  -> validate minimum request shape / idempotency
  -> persist canonical Lead + consent + attribution + event id DURABLY
  -> enqueue downstream jobs
  -> respond safely
  -> worker performs validation/enrichment/delivery/conversion side effects
  -> retry technical failures with bounded backoff
  -> record attempts and final status
```

Use durable queue semantics. If BullMQ/Redis is suitable and already available, prefer it rather than introducing another queue. Verify Redis persistence/restart behavior and failure modes first.

## AI architecture

All AI flows pass through existing shared invocation/policy layer or a generalized replacement that preserves its lint/safety behaviors.

Feature code depends on a provider-neutral interface. AI actions receive Brand and asset context and write only draft/version state.

## Operator UI

Implement the supplied PageFlo redesign shell with internal navigation. Use real data. Keep Payload CMS as technical escape hatch only.
