# Approved discovery

Status: APPROVED by operator.

Track: brownfield product completion and redesign.

Readiness: sufficient to begin architecture and execution. The operator explicitly selected `Approve discovery`.

## 1. Internal V1 scope

### 1.1 Purpose
PageFlo V1 is an internal Legenex acquisition-site and funnel operating system used to create brands, websites, quizzes, landing pages, and advertorials, then deploy them under the correct Brand, domain, and path.

### 1.2 Users
Internal Legenex operators only for V1. Keep existing auth and roles, but do not expand customer-facing tenancy, billing, plans, public signup, or client portal workflows.

### 1.3 Deferred SaaS scope
Paid customer plans, billing, public signup, enterprise SSO, customer-facing tenant administration, large integration marketplace, and other SaaS packaging.

### 1.4 Primary workflow
Brand first. Public assets inherit or explicitly bind to the selected Brand.

### 1.5 Roles
Keep the existing roles and permissions. Do not expand them for V1.

## 2. Brand creation and identity

### 2.1 Brand object
One public acquisition brand such as Check A Case or Don't Settle. Keep it aligned with the current Site model unless the repo audit proves a safer equivalent.

### 2.2 Verticals
Personal Injury limited to MVA and Workers' Compensation, plus insurance, finance, debt, home services, and Other/custom niche.

### 2.3 Required Brand identity
Name, slug, description, niche/vertical, primary URL/domain, logo, favicon, primary and secondary/accent colors, typography, support/contact details, default phone, legal entity/copyright, privacy URL, terms URL, default disclaimer, and brand voice.

### 2.4 Brand creation modes
Manual, import from an existing website or Base44 app, clone an existing PageFlo Brand, or AI-generate from niche and brief.

### 2.5 Common legal pages
PageFlo creates and hosts standard `/privacy` and `/terms` pages under the Brand domain using reusable shared page structures.

### 2.6 AI identity
AI may generate name direction, description, palette, typography, logo direction, and default copy for review.

## 3. Brand website

### 3.1 Creation modes
AI-create a new website for the niche, or re-import a website currently on WordPress or Base44.

### 3.2 Migration behavior
Ingest the public website into editable PageFlo structure, bring across required copy/assets, preserve important visual structure, and eliminate runtime dependency on WordPress/Base44 once PageFlo is approved and published.

### 3.3 Import fidelity
High visual fidelity first, then normalize into PageFlo-editable structure.

### 3.4 AI editing
An operator must edit the website through natural-language AI from inside PageFlo without returning to WordPress, Base44, or code. The operator wrote that WordPress/Base44 should be non-existent after migration. One phrase in the supplied answer said "moved over to base44" while also saying Base44 is deleted. This pack resolves that obvious internal contradiction as "moved over to PageFlo" and records it as an interpretation.

### 3.5 Manual editing
AI editing plus a practical visual/section editor.

### 3.6 AI edit scope
Copy, sections, images, CTA wording, layout choices, navigation, new pages, page order, and brand styling within the Brand identity. Changes are not silently published live.

### 3.7 Default website pages
Home, About or How It Works, Contact, Privacy, Terms, plus vertical-specific supporting pages selected by the generation flow.

## 4. Master asset model

### 4.1 Master Quiz
Brand-neutral parent logic and content. Create, edit, clone/duplicate, archive, and delete when safe. Deployments reference the parent rather than copying logic by default.

### 4.2 Master Landing Page
Reusable parent design/content structure with a template library. It is brand-neutral and editable manually or with AI.

### 4.3 Master Advertorial
Same parent/deployment model as Landing Pages, with editorial structure and CTA or embedded Quiz behavior. It has a template library and supports manual/AI editing and cloning.

### 4.4 Master updates
Existing deployments use the latest published master only after explicit republish. No silent live fan-out.

### 4.5 Deployment copy overrides
NO deployment-specific copy overrides. Any public copy change requires changing the parent or creating a cloned/new master variant. This explicit selected decision overrides earlier proposed text that mentioned deployment copy overrides.

### 4.6 Clone
Creates a new independent master ID and history. Existing deployments remain attached to the original.

## 5. Master Quiz logic and visual designs

### 5.1 Master Quiz contains
Questions, answer options, conditional branching, qualification outcomes/tiers, custom fields, contact capture, consent step, destination/result logic, and default copy. Current structure is broadly acceptable but must be verified end to end.

### 5.2 Quiz design/template contains
Visual skin only: layout, progress treatment, typography, answer presentation, cards, spacing, backgrounds, and composition. Logic stays in the parent Quiz.

### 5.3 Standalone deployment
Master Quiz -> Quiz design/template -> Brand -> domain/path -> apply Brand identity -> preview -> publish.

### 5.4 Embedded Quiz
Landing Page/Advertorial parent -> master Quiz -> selected/inherited Quiz design -> deployment Brand.

### 5.5 Embedded styling
Landing Page/Advertorial designs may define a recommended Quiz skin. Operator can override it.

### 5.6 Logic overrides
Deployment cannot change master Quiz logic. Logic changes happen on the master. Deployment presentation choices are allowed, but public copy is not deployment-specific because decision 4.5 forbids copy overrides.

### 5.7 Existing 20 Quiz templates
Keep the library and fix the renderer so templates are genuinely structurally distinct. The current repository diagnosis confirms the template-collapse defect.

## 6. Landing Pages and Advertorials

### 6.1 Landing Page parent
Brand-neutral reusable page design with structure, default copy, and editable slots. Brand-specific identity, legal pages, and links resolve from the Brand. Public copy variants require separate parent variants, not deployment overrides.

### 6.2 Advertorial parent
Brand-neutral editorial design with article structure, default copy/slots, CTA locations, and optional link/embed of a master Quiz.

### 6.3 Creation modes
Blank, clone PageFlo master, import URL/HTML, or AI create from niche, brief, or reference.

### 6.4 AI rewrite per Brand
Do not automatically rewrite every deployment. Reskin automatically. If an operator asks AI for different branded copy, create or update a parent variant consistent with decision 4.5, rather than storing deployment copy overrides.

### 6.5 Advertorial to Quiz
Support CTA-to-Quiz and embedded Quiz. Deployment selects master Quiz and visual skin.

### 6.6 Template fidelity
Page templates and Quiz templates must look materially like the selected design. They must not collapse to one generic composition with color changes.

## 7. Deployments and reskinning

### 7.1 Deployment contains
Source master asset, Brand/Site, domain, path, publish state, selected visual template, selected master Quiz when embedded, destinations, tracking/pixels, UTM configuration, and other non-copy campaign bindings. Deployment-specific public copy fields are excluded by decision 4.5.

### 7.2 Brand-resolved fields
Brand name, logos, favicon, colors, typography, phone details, legal/copyright identity, privacy/terms URLs, default disclaimer, and Brand chrome.

### 7.3 Deployment-specific fields
Path, selected page/Quiz design, CTA destination or mode where this is behavior rather than copy, tracking IDs, preview URL, UTM defaults, pixels, and destination configuration. Do not add campaign copy overrides.

### 7.4 Multi-brand proof
One master asset deployed under Check A Case and Don't Settle must preserve identical master behavior while rendering correct logo, colors, typography, legal URLs, domain, and Brand chrome.

### 7.5 States
Draft, Live, Paused, with clear Saved versus last successfully Published distinction. Preserve working publish-preflight behavior.

### 7.6 Bulk deployment
Required in internal V1. Multi-brand rollout must be supported now.

## 8. Domains, paths, preview

### 8.1 Custom domains
Bind to correct Brand/Site, verify DNS, provision SSL, resolve to correct PageFlo content, and be manageable inside PageFlo.

### 8.2 Preview root
Canonical target is `*.preview.pageflo.io`.

### 8.3 Main website versus marketing assets
Brand apex is the normal Brand website. Marketing assets can use Brand subdomains and/or paths. Example: `checkacase.com` for the website and `start.checkacase.com` or `checkacase.com/check` for a Landing Page, Quiz, Advertorial, or other acquisition asset.

### 8.4 Path collision
Block publish and show the conflicting live Deployment.

### 8.5 Hosting backend
Keep the current Plesk production environment for this phase. Do not migrate infrastructure just because the app is being finished.

## 9. AI inside PageFlo

### 9.1 Required actions
Create Brand/site from niche brief, import existing site, create/clone page assets, edit website by natural language, rewrite sections/copy, and assist with Quiz/page creation.

### 9.2 Apply mode
Operator can choose preview/diff or direct apply to draft each time. Direct apply still targets a draft/version, not silent live production.

### 9.3 Automatic Brand context
AI automatically receives Brand identity, niche, voice, legal defaults, and current asset context.

### 9.4 Live editing
No silent direct live edits. AI edits draft/saved version and uses normal publish path.

### 9.5 Provider flexibility
Provider abstraction. Connect multiple models through APIs or supported OAuth/login mechanisms when practical. Do not permanently bind feature code to one provider.

## 10. Leads, consent, validation, delivery

### 10.1 Pipeline remains in V1
Published Quiz/form must durably create a Lead with attribution/consent and send to configured downstream destination.

### 10.2 Preserve
Lead capture, attribution/click IDs, event ID deduplication, TrustedForm/Jornaya where configured, phone validation/enrichment, Meta CAPI, generic webhooks, delivery tracing, operational notifications.

### 10.3 Delivery default
Generic configurable webhook first, including LeadDistro.ai endpoints when required.

### 10.4 Durability
Fix the synchronous downstream gap. Durable Lead capture first, then queued/retryable downstream delivery.

### 10.5 Leads UI
Polished internal Leads screen with search, Lead detail, consent, validation, and delivery history.

## 11. Redesign and navigation

### 11.1 Design source
Supplied PageFlo redesign pack in the repository is binding visual reference.

### 11.2 Navigation
Overview, Brands/Sites, Websites, Quizzes, Landing Pages, Advertorials, Deployments, Domains, Leads, Integrations/System, Settings. Analytics and Campaign Integrity remain clearly deferred.

### 11.3 Brand Kits
Do not keep Brand Kits as a separate top-level concept. Brand identity lives inside Brand/Site because Brand creation is step one. Preserve underlying compatibility data only as necessary.

### 11.4 Prototype data
No fake metrics, Leads, domains, status, or other demo data in production. Real data or honest empty states only.

### 11.5 Payload CMS
Not a normal operator workflow. May remain an administrator escape hatch.

### 11.6 Fidelity
Match supplied PageFlo redesign closely for shell, navigation, spacing, dark visual system, and key screen patterns while changing labels/workflows where this approved internal model requires it.

## 12. Build boundary and done

### 12.1 Preserve production
Preserve existing working production behavior, current data, domain routing, Lead capture, working deployments, and compatibility identifiers that remain load-bearing.

### 12.2 Hosting
Build in existing GitHub/Codespaces workflow and keep production on current Plesk VPS for this phase.

### 12.3 Grok autonomy
Inspect repo first, implement bounded work units, parallelize only with explicit ownership, test, diagnose, repair, independently review, update persistent state, commit, push, release approved ordinary changes, and continue autonomously until completion. Do not bother the operator with routine choices.

### 12.4 Release authority
Grok may deploy and verify ordinary approved application changes to Plesk autonomously. Destructive/high-risk production actions remain red gates.

### 12.5 End-to-end proof
Create Brand -> generate/import website -> AI edit -> create/select master Quiz -> create/select Landing Page or Advertorial -> create branded Deployment with embedded or standalone Quiz -> preview -> connect/use domain -> publish -> submit real test Lead -> verify Brand, consent, attribution, validation and delivery without SSH, SQL, WordPress, Base44, or raw CMS for the normal workflow.

### 12.6 Decision
APPROVED.
