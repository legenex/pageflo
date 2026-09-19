# Locked decisions

1. Internal use first. Customer SaaS packaging is deferred.
2. Brand/Site is the top-level public identity context.
3. Existing roles stay. Do not simplify to one super-admin.
4. Brand identity lives inside Brand/Site, not as a separate required top-level Brand Kit workflow.
5. PageFlo hosts Brand privacy and terms pages under the Brand domain.
6. AI may propose complete Brand identity including name direction and logo direction.
7. Imported WordPress/Base44 sites prioritize high visual fidelity before normalization.
8. Brand websites have both AI editing and manual visual/section editing.
9. Master changes require explicit republish before live deployments change.
10. Deployment-specific public copy overrides are forbidden for the new model.
11. If branded copy differs, create/edit a parent variant or clone rather than a deployment copy override.
12. Quiz logic belongs to master Quiz. Quiz visual design is separate.
13. Landing Page/Advertorial can recommend a Quiz skin and operator may override it.
14. Deployment cannot override Quiz logic.
15. Keep and repair all twenty current Quiz templates so they are structurally distinct.
16. Do not automatically rewrite copy for every Brand deployment.
17. Bulk multi-brand deploy is required now.
18. Canonical preview target is `*.preview.pageflo.io`.
19. AI apply mode is operator-selectable per action: preview/diff or direct-to-draft.
20. Generic configurable webhook is the default new Lead delivery approach.
21. Fix downstream delivery durability now using durable capture plus queue/retry/idempotency.
22. Build a polished internal Leads screen now.
23. Supplied PageFlo redesign pack is binding visual reference.
24. Keep Plesk for this phase.
25. Grok may autonomously commit, push, release ordinary approved application changes to Plesk, verify, repair, and continue.
26. Red-gate production actions remain human-authority only.

## Conflict resolutions

### Deployment copy conflict
Earlier proposed answers 6.1, 7.1, and 7.3 mentioned deployment copy overrides. The operator explicitly selected "No. Any copy change requires a new or cloned master" at 4.5. The explicit selected answer wins. Deployment copy overrides are therefore excluded from the target model.

### AI branded rewrite conflict
Question 6.4 allowed operator-requested AI rewrite. Because deployment copy overrides are forbidden, such a rewrite must produce/update a parent variant or clone, not an override stored only on the deployment.

### Website migration wording conflict
The edited answer to 3.4 said WordPress/Base44 should be non-existent after migration but ended with "moved over to base44." This is internally contradictory. The product intent and surrounding answers clearly define PageFlo as the destination, so the pack records the intended target as PageFlo.
