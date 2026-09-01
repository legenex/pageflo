# PageFlo product brief

Version 1, 1 September 2026. This is the initial brief. It states what PageFlo
is for and what it is made of. `docs/REQUIREMENTS.md` turns it into delivery
constraints and marks what is actually built. Where the two appear to conflict,
`docs/REQUIREMENTS.md` governs what is true today and this file governs what the
product is aiming at.

**Nothing in this brief asserts that a capability is live.** Read
`docs/REQUIREMENTS.md` for that. A concept described here may be fully built,
half built, or not started.

---

## What PageFlo is

PageFlo is a vertical-agnostic dynamic acquisition infrastructure platform.

It is the system a team uses to stand up an acquisition brand, build the pages
and qualification flows that brand runs on, publish them across many domains,
capture the leads they produce with defensible consent, validate those leads,
and route them where they need to go.

It is built for lead generators, affiliates, agencies, media buyers and growth
teams: operators who run more than one brand, more than one offer, and more than
one traffic source at the same time, and for whom the cost of a broken funnel or
an unrecorded consent is measured in money.

### Vertical-agnostic by construction

PageFlo grew out of LegalOS, a system built for legal claim acquisition. That
origin is visible in the code, in the seeded content, and in the name.

The legal-specific positioning is legacy and is being removed. Nothing in the
architecture requires a legal vertical: a Site is a brand, a quiz is a
qualification flow, a tier is a routing outcome, and none of those are
domain-specific. The verticalization lives in content, seed data and copy, not
in the model.

Where legal-specific structure remains and is load-bearing, notably the
`SharedLegalTemplates` collection and the legal slug fallbacks in the public
router, it is generalized deliberately rather than deleted.

---

## Core concepts

These are the nouns the product is built from. Each one is a real object an
operator creates, edits and deploys.

**Sites.** The tenant root. A Site is a brand: its identity, its palette, its
typography, its legal entity, its default phone number, its domains, and
everything published under it. Every other object is scoped to a Site, and
access control filters on that relationship. Deleting a Site cascades to its
children, including its leads, which is irreversible.

**Brand Kits.** The resolved identity a Site renders with: display name, short
name, logos for light and dark surfaces, tagline, palette, typography, legal
copyright line, disclaimer, and the legal document URLs. A brand kit is applied
to brandless content at render time, which is what makes one piece of content
deployable under many brands without duplicating it.

**Domains.** The hostnames a Site is reachable at. Each Site gets an auto-issued
preview subdomain that stays primary until a custom domain is verified. Custom
domains are provisioned through the hosting provider: DNS is checked, the vhost
and reverse proxy are created, and a certificate is issued. A domain is only
marked TLS-active after a real HTTPS handshake succeeds, never because a
provisioning API said so.

**Landing Pages.** The conversion surfaces. Authored brandless so one page can
run under many brands, built from typed, composable sections rather than free
HTML, with a template library and slot-based content.

**Advertorials.** Long-form editorial pages that carry a reader from a cold
click to an offer. Same brandless authoring model as landing pages, with a
different structural vocabulary.

**Quizzes.** The qualification flows. A quiz asks a visitor questions, branches
on their answers, assigns them an outcome, and captures the data and consent
that make the resulting lead usable.

**Tiered qualification flows.** A quiz assigns each visitor a tier: a
qualification outcome that determines what happens next. Tiers can be set
directly by an answer, or derived by calling an external service mid-flow. Tier
assignment is what turns a form fill into a routable, priceable lead.

**Conditional branching.** The path through a quiz depends on the answers given.
Branching is a derived graph, and the graph is validated rather than trusted:
unreachable tiers, tiers with no entry step, and flows that open on nothing are
defects the system detects before publish, not surprises a visitor discovers.

**Deployments.** The binding between brandless content and a brand. A deployment
takes a landing page, advertorial or quiz, attaches it to a Site, a Domain and a
path, and carries the per-deployment configuration: CTA mode, UTM handling,
pixel setup, content overrides. The same content can have many deployments; the
same path can serve different content for different brands.

**Multi-brand deployment.** The consequence of the above, and the central
product idea. Content is authored once, brand-agnostic. Brand identity, phone
number, legal copy and disclaimers resolve per brand at render. Running the same
proven funnel across ten brands costs ten deployments, not ten copies.

**Lead capture.** The submission path from a public form or quiz into a stored,
attributed lead record: attribution and click-id derivation, a shared event id
for advertising-platform deduplication, and a durable row.

**Consent.** Evidence that the person agreed to be contacted, captured at the
moment of submission and retrievable afterwards. Consent certificates are
claimed and stored server-side. The system never generates or substitutes one.

**Validation.** Checks that a lead is real and reachable before it is treated as
valuable: phone enrichment and line-type lookup, required-field and
format rules, and the rejection reasons that explain a refusal rather than
silently dropping it.

**Routing and delivery.** Getting the lead where it needs to go: outbound
webhooks with per-destination configuration, advertising-platform conversion
events, call-platform handoff, and operational notification. Delivery outcomes
are distinguishable from each other and are recorded.

**AI-assisted creation.** Generation woven through authoring rather than bolted
beside it: cloning an existing page into structured blocks, importing raw HTML,
rewriting copy for a brand, proposing quiz templates, and extracting brand
tokens from a reference. Every generation passes a house-style linter with
retries before it reaches an operator.

---

## Coming soon

Named here because they are part of the product's shape, and marked clearly so
nothing reads as shipped.

**Campaign Integrity, coming soon.** The layer that answers whether a campaign
is behaving: whether the deployed funnel is the one that was approved, whether
consent evidence is complete and retrievable, whether disclosures are present on
every surface that needs them, whether tracking fires once and only once, and
whether a brand's live pages still match its brand kit. Today the system has
several of the ingredients (page lint, contrast auditing, template identity
refusal, deployment path checks) without the layer that unifies them into a
verdict an operator can act on.

**Analytics, coming soon.** Cross-brand funnel and attribution reporting: volume
by source, cost per lead, step-level drop-off, tier distribution, acceptance and
rejection breakdowns, and per-brand comparison. The current
`/admin/analytics` route is a placeholder.

---

## Design principles

These are the commitments that shape how features get built, and they are
already visible in the codebase.

**Brandless authoring, brand-resolved rendering.** If a piece of content stores a
brand's phone number, logo or disclaimer, it can only ever serve one brand. So
it stores none of them, and resolves them at render.

**Wrong states are made structurally impossible, not merely avoided.** Text
colors are derived from the opaque surface they will sit on and verified against
WCAG, so unreadable text is unreachable rather than unlikely. A deployment that
names a template which does not exist refuses to serve rather than rendering
something plausible. TLS-active is set by a handshake, not by an API response.

**Consent and lead data are compliance artifacts.** They are captured
server-side, stored durably, never fabricated, and deleted only deliberately.

**Multi-tenancy is enforced at the data layer.** Scoping is a filter on the
access rule, not a condition in a component. Context is not authorization.

**Evidence over assertion.** A claim that something works is backed by a test
that ran, a measurement that was taken, or it is labelled unproven.

---

## Who it is for

- **Lead generators** running multiple brands into multiple buyers, who need the
  same funnel to work under many identities and the resulting leads to be
  defensible.
- **Affiliates** who need to stand up a compliant offer page and qualification
  flow quickly, on their own domain, with tracking that reconciles.
- **Agencies** operating acquisition for several clients, who need per-client
  isolation, per-client branding, and a single operational surface.
- **Media buyers** who need landing page and advertorial variants deployed fast,
  with conversion events that deduplicate correctly across pixel and server.
- **Growth teams** who need to test qualification flows and measure where people
  fall out, without an engineer for each change.

---

## What PageFlo is not

- Not a general website builder. It builds acquisition surfaces.
- Not a CRM. It captures, validates and routes leads; it does not work them.
- Not a call center platform. It hands off to one.
- Not an ad platform. It reports conversions to them.
- Not a single-brand tool. Multi-brand is the premise, not a feature.

---

## Legacy positioning being removed

The following are legal-vertical artifacts, retained today because they work and
because removing them is planned rather than incidental:

- the product name LegalOS, in code, database, service name and user interface
- the `LegalOSMarketing` public marketing fallback component
- the `SharedLegalTemplates` collection and the legal slug fallbacks
  (`/privacy`, `/terms`, `/partners`, `/submitted`, `/thanks`, `/tcpa`,
  `/disclosures`)
- MVA and Workers Compensation seed content, and the tier vocabulary attached
  to it
- the `LEGALOS_*` environment variable family and the `/api/legalos/*` route
  namespace

Each has a phase in `docs/EXECUTION-PLAN.md`. Some are cosmetic. Some, notably
the environment variables, the route namespace, the `legalos` database name and
the `molegenexcom` compose project, are load-bearing in production and cannot be
renamed without a coordinated infrastructure change.
