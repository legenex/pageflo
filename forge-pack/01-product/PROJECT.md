# Project contract

## Name
PageFlo

## Repository
`https://github.com/legenex/pageflo`

## Product for this phase
PageFlo is Legenex's internal acquisition-site and funnel operating system.

## Primary workflow

1. Create or select Brand.
2. Complete Brand identity and common hosted legal pages.
3. Create, AI-generate, clone, or import the Brand website.
4. Edit website inside PageFlo with AI and practical section controls.
5. Create/select reusable master Quiz, Landing Page, or Advertorial.
6. Keep master Quiz logic separate from Quiz visual template.
7. Bind master asset to Brand/domain/path through a Deployment.
8. Automatically resolve Brand identity into the deployment.
9. Preview under PageFlo preview host.
10. Publish to Brand domain/subdomain/path.
11. Capture Lead durably with consent/attribution.
12. Validate and deliver asynchronously/retryably.
13. Inspect Leads and delivery state inside PageFlo.

## Product principles

- Brand first.
- Reuse master assets across brands.
- Deployment binds, it does not duplicate master logic.
- No deployment-specific public copy overrides.
- Brand reskinning is automatic.
- Quiz logic and Quiz appearance are separate.
- Template choice must materially change composition, not only colors.
- AI edits drafts, never silently mutates live paid-traffic content.
- Import fidelity matters, but imported content must become editable PageFlo structure.
- WordPress and Base44 are migration sources, not ongoing runtime dependencies after cutover.
- Internal workflows must work without raw CMS, SSH, or SQL.
- No fake product state.
- Preserve working production behavior while replacing weak internals.

## Non-goals for this phase

Paid SaaS packaging, billing, public signup, enterprise SSO, client portal, broad integration marketplace, advanced analytics, Campaign Integrity full product, dedicated PageFlo VPS migration.
