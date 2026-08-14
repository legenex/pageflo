# Quiz renderer architecture: the template collapse, and the seam that fixes it

**Status:** diagnosis + design. No production code changed by this document.
**Scope:** the twenty `sq_*` quiz visual templates, from stored id to pixels.
**Date:** 2026-08-14

---

## 0. The one-sentence root cause

Every one of the twenty templates renders through a single hard-coded JSX tree —
`PreviewQuestionCard` (`src/components/builder/quiz/preview.tsx:285-352`) inside
a fixed page shell (`src/components/public/quiz/QuizRuntime.tsx:489-604`) — and
"choosing a template" only selects a bag of **style tokens** plus **two swappable
leaf widgets**, so twenty designs that differ structurally in the handoff are
forced through one composition that can differ only in colour, radius, font and
the interior of a progress bar and a button.

The library's own header comment states the intent plainly
(`src/lib/quiz-templates/model.ts:6-9`): *"the twenty are twenty combinations
over one renderer instead of twenty files that would drift apart."* That premise
is the defect. It is correct for the axes the handoff decomposes (progress form,
answer form) and wrong for everything the handoff *also* varies — canvas, width,
card presence, header, question placement, split layout, chrome. The model has no
field for any of those, so no amount of correct implementation below it can
produce a different-looking template.

---

## 1. How an `sq_*` id becomes pixels

```
funnel_quiz_deployments.template_id  (a template RECORD id)
  └─ resolveQuizTemplateRecordForRender()      src/lib/quiz-deployment.ts:102-131
       └─ record.rendererKey  ─────────────────────────────────► an sq_* id
  └─ deployment.templateId = record.rendererKey  quiz-deployment.ts:306
  └─ deployment.progressForm = deployment ?? record ?? null    quiz-deployment.ts:311

/(public)/[[...slug]]/page.tsx:763  ── mounts ──► QuizRuntime
  QuizRuntime.tsx:104   resolveForRender('quiz', deployment.templateId)  → canonical sq_* id
  QuizRuntime.tsx:107   getTemplateConfig(templateId, deployment.progressForm) → `tc`
  QuizRuntime.tsx:489   ONE page shell: bg, header, <main>, 760px column, footer
  QuizRuntime.tsx:554   a generic 4px progress bar, drawn for EVERY template
  QuizRuntime.tsx:565   <PreviewQuestionCard templateId=… />          ← the only card

PreviewQuestionCard        preview.tsx:194-353
  :196  getTemplateConfig(templateId)          ← re-resolved, progressForm DROPPED
  :285  <div style={cardStyle} className="preview-card">   ← the single composition
  :289    renderHeader(...)                    templates.tsx:171-184  (identical, all 20)
  :290    renderProgressIndicator(...)         templates.tsx:152-162 → QuizProgress
  :293-296 tagline / headline / question / subheadline   (fixed order, fixed sizes)
  :298    <div style={{display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`}}>
  :299      renderAnswerButton(...)            templates.tsx:136-150 → QuizAnswer
  :306-325 dropdown / date / text / textarea / form  (one markup each, all templates)
  :345    nav row: back left, submit right     (fixed)
  :350-351 TCPA line, footerTrust (always '')
```

`getTemplateConfig` (`src/components/builder/quiz/templates.tsx:114-119`) is the
seam. It returns the token bag built in `configFor`
(`templates.tsx:55-107`). That bag is the *entire* vocabulary a template has for
altering the render.

### 1.1 Is there ONE generic DOM composition? — Yes

**Component:** `PreviewQuestionCard`, `src/components/builder/quiz/preview.tsx:194-353`.
It is the sole card renderer for the public page, the builder flow preview and
the node preview modal (`preview.tsx:366`, `preview.tsx:536`,
`QuizRuntime.tsx:565` — the only three call sites in the repo).

**The exact switch fields**, quoted from `templates.tsx:64-106`:

```js
    cardBorder: (brand) => `1px solid ${themeFor(brand).surface.line}`,
    cardRadius: squared ? 2 : 12,
    cardShadow: () => 'none',
    cardMaxWidth: templateMaxWidth(spec) ?? 1120,
    cardPadding: 'clamp(22px, 4vw, 40px) clamp(18px, 3.5vw, 34px)',

    headlineSize: spec.answers === 'oversized_letters' ? 'clamp(28px, 6vw, 44px)' : 'clamp(21px, 4vw, 30px)',
    headlineWeight: spec.serifQuestion ? 600 : 700,
    headlineFamily: () => (spec.serifQuestion ? QUIZ_FONTS.serif : QUIZ_FONTS.display),
    bodyFamily: () => QUIZ_FONTS.body,

    buttonRadius: spec.answers === 'pill_chips' || spec.answers === 'reply_pills' ? 999 : 8,
    footerTrust: '',
```

Five of those are **constant across all twenty**: `cardShadow` and
`cardPadding` and `bodyFamily` and `footerTrust` never vary, and neither do the
page ornaments above them:

```js
    cardBackdrop: () => 'none',
    pageOverlay: () => 'none',
    pagePattern: () => 'none',
    patternSize: '0 0',
```
— `templates.tsx:84-90`

So the real per-template variance in the card chrome is **four discrete values**:
`cardRadius ∈ {2, 12}`, `headlineSize ∈ {2 sizes}`, `headlineWeight/Family ∈
{serif 600, display 700}`, `buttonRadius ∈ {8, 999}` — plus `cardMaxWidth`,
which §1.3 shows is largely unreachable.

Everything else that could distinguish a template lives in the two leaf widgets:
`QuizProgress` (`src/components/public/quiz/forms/progress.tsx`, 20 branches) and
`QuizAnswer` (`src/components/public/quiz/forms/answers.tsx`, 19 branches). Both
are drawn **in the same slot, in the same order, inside the same card**, so they
change the texture of two elements and nothing about the composition.

That is exactly what the screenshots show. Editorial Inline, Authority Console
and Case Router all declare `width: [520, 640]`
(`model.ts:88, 114, 210`), so their cards are the same width; they share the same
header, the same outer progress bar, the same padding, the same headline block
and the same nav row. Their entire difference is: card radius 12 / 2 / 12,
serif / sans / serif question, and two leaf widgets.

### 1.2 The differentiating leaves are themselves degraded

Three separate data starvations remove most of the variance the leaves *could*
have produced:

**(a) Progress forms never receive their labels.** `renderProgressIndicator`
calls the widget with position only:

```jsx
    <QuizProgress form={tc.spec.progress} theme={tc.theme(brand)} index={stepIdx} total={totalSteps} />
```
— `templates.tsx:160`

`ProgressProps` declares `labels?: string[]` and `note?: string`
(`progress.tsx:32-35`), and **no caller in the repository passes either**
(verified by grep for `labels=` / `note=` across `src/`). The consequence, per
branch:

| Form | Template | Without labels it draws |
|---|---|---|
| `factor_rail` | SQ-04 Case Dossier | "Factor 1…Factor N" (`progress.tsx:94`) |
| `deadline_rail` | SQ-07 Deadline Timeline | "Accident" → "Filing deadline" (`:129-130`) |
| `route_breadcrumb` | SQ-11 Case Router | **a plain bar and nothing else** (`:177` `labels.length` is 0) |
| `milestone_rail` | SQ-15 Timeline Journey | "Step 1…Step N" (`:216`) |
| `tab_status` | SQ-16 Case File Console | fixed Incident/Medical/Legal/Contact (`:235`) |
| `path_nodes` | SQ-19 Decision Path | "Step N" chips (`:280`) |
| `item_count` | SQ-20 Evidence Checklist | "Step N" (`:296`) |
| `caps_thin_bar` | SQ-08 Insurer Context | the generic count, never the "why we ask" note (`:144`) |

The one progress form whose whole identity is the breadcrumb (Case Router) is
reduced to a bar — which is precisely why Case Router screenshots as generic.

**(b) Answers never receive an icon.** The bridge reads a field that nothing
writes:

```jsx
    icon={a?.iconNode ?? null}
```
— `templates.tsx:147`

`iconNode` occurs exactly once in the repository (that line). The quiz answer
model has no icon field at all (`src/components/builder/quiz/seed-data.ts`
answers are built by `mkA(label, {fm, next})`). So `withIcon`
(`answers.tsx:48`) is always false and the **entire `IconPolicy` axis — fifteen
declared policies, `model.ts:54-57` — is inert**. Worse, the three tile forms
render the icon slot unconditionally, so they draw an *empty* well:
`icon_tiles` (`answers.tsx:151`), `diagram_tiles` (`:222`), `pick_cards`
(`:261`). SQ-14 Incident Scene is documented as "seven simplified top-down
collision diagrams" (`model.ts:247`); it renders seven empty grey rectangles.

**(c) Answer meta never exists.** `meta={a?.meta ?? a?.sublabel ?? ''}`
(`templates.tsx:145`) — neither key exists on any answer, so `router_cards`
drops its route line (`answers.tsx:194`) and `field_rows` shows only
Selected/Empty.

### 1.3 The runtime overrides the template's own geometry

```jsx
          <div ref={cardAreaRef} style={{ maxWidth: chromeless ? '100%' : 760, margin: '0 auto' }}>
```
— `QuizRuntime.tsx:553`

A hard 760px column wraps the card on every standalone page. Eight of the twenty
declare a wider maximum (`model.ts`: 880, 900, 820, 860, 840, 820, 840, 900) and
are silently clamped. `sq_fullscreen_focus` declares full bleed
(`width: [440, 0]`, `model.ts:285`), which `templateMaxWidth` turns into `null`
(`model.ts:366`) and `configFor` then turns into **1120**
(`templates.tsx:96`) — a number that is both not-full-bleed and unreachable
behind the 760 column. `QuizTheme.width` (`theme.ts:89`) is computed and read by
nothing (grep). `width[0]`, the minimum, is read by nothing.

Immediately above the card, the runtime draws its own progress bar for every
template, competing with whichever of the twenty forms the template chose:

```jsx
            {quiz.steps.length > 1 ? (
              <div style={{ height: 4, backgroundColor: `${C.primary}22`, borderRadius: 999, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, backgroundColor: C.primary, transition: 'width 0.3s' }} />
```
— `QuizRuntime.tsx:554-557` (and identically in the builder preview,
`preview.tsx:533-535`)

So *every* template ships with a generic brand-primary bar. That single element
does more to make the twenty look alike than any other line in the codebase.

### 1.4 Answer layout is computed and then ignored

`answerLayout(form)` (`answers.tsx:290-309`) returns the arrangement each answer
form implies — auto-fit tile grids for `icon_tiles`/`diagram_tiles`/`pick_cards`,
a wrapping flex row for `pill_chips`, a right-aligned column for `reply_pills`,
a zero-gap stack for `lettered_hairline`/`field_rows`. It is imported and
re-exported by `templates.tsx:32,45` and consumed by **only** the thumbnail
(`TemplatePreview.tsx:66`). The real renderer hard-codes a uniform grid:

```jsx
    {(node.questionType === 'button_grid' || node.questionType === 'single_select') && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'clamp(8px, 1.5vw, 12px)' }}>
```
— `preview.tsx:298` (and `:302` for multi-select)

So chips do not wrap, reply pills are not right-aligned, hairline rows carry a
12px gap they are designed not to have, and every tile grid is `repeat(N, 1fr)`
from the author's column setting rather than the form's own minimum tile width.
**The thumbnail and the live page disagree on layout by construction.**

### 1.5 Two more live defects found in the same path

**The deployment's `progressForm` override never reaches the progress widget.**
`quiz-deployment.ts:48-56` documents this exact class of bug being fixed one
layer up ("This was READ by QuizRuntime and never SET here"). `QuizRuntime.tsx:107`
now correctly builds `tc` *with* the override — but it is used only for page
background/overlay, because `PreviewQuestionCard` re-resolves its own config and
drops the argument:

```jsx
  const tc = getTemplateConfig(templateId)
```
— `preview.tsx:196` (compare `QuizRuntime.tsx:107` and `preview.tsx:489`, both of
which pass `deployment.progressForm`)

The in-card `QuizProgress` therefore always draws the template's default form.
The `progress_form` column an operator can edit still has no effect on the
element it names.

**`cardBackdrop` is a function used as a CSS value.** `templates.tsx:84` defines
`cardBackdrop: () => 'none'`; `preview.tsx:270` spreads
`...(tc.cardBackdrop ? { backdropFilter: tc.cardBackdrop, ... } : {})`. A
function is truthy, so React is handed a function as a style value and drops it.
The knob has never worked in either direction.

---

## 2. Degrees of freedom a template actually has today

### 2.1 Every field on `QuizTemplate` (`model.ts:59-78`) and what it changes

| Field | Reaches the DOM via | What it can actually change | Effective |
|---|---|---|---|
| `id` | `templates.tsx:114` cache key | nothing visual | — |
| `code`, `name`, `origin`, `blurb`, `use` | admin listings only | nothing visual | — |
| `width[0]` | nothing (grep: no reader) | nothing | **dead** |
| `width[1]` | `templateMaxWidth` → `cardMaxWidth` (`:96`) → `preview.tsx:267` | card max-width, clamped by the 760px column (`QuizRuntime.tsx:553`) | min(w, 760); full-bleed impossible |
| `progress` | `tc.spec.progress` → `QuizProgress` (`:160`) | the interior of one widget in one fixed slot | 20 forms, 8 degraded (§1.2a); override dropped (§1.5) |
| `answers` | `tc.spec.answers` → `QuizAnswer` (`:141`) | the interior of one button | 19 forms; layout ignored (§1.4) |
| `answers` (2nd effect) | `squared` (`:62`) → `cardRadius` (`:95`) | card corner radius 2 vs 12 | 2 values |
| `answers` (3rd effect) | `buttonRadius` (`:104`) | inputs/nav radius 999 vs 8 | 2 values |
| `answers` (4th effect) | `headlineSize` (`:99`) | headline size, `oversized_letters` only | 2 values |
| `icons` | `tc.spec.icons` → `QuizAnswer` (`:142`) | which answers show an icon | **inert** — no icon data exists (§1.2b) |
| `serifQuestion` | `theme.ts:85`, `templates.tsx:100-101` | question face + weight | 2 values |
| `dark` | `theme.ts:77-79` | page ground and card ground | 1 template uses it |

**Total genuine degrees of freedom: seven.** One width (clamped), one progress
widget (partly degraded, override broken), one answer-button interior, one card
radius, one button radius, one headline size, one question face. Plus a dark
flag used once.

### 2.2 What a template can and cannot change

| Axis | Today | Where it is decided instead |
|---|---|---|
| Outer page / canvas | ❌ | `QuizRuntime.tsx:490-499` — one `<div>`, brand background, `minHeight:100vh` |
| Content width | ⚠️ clamped | `QuizRuntime.tsx:553` hard 760; template's own max only applies below that |
| Card vs no card | ❌ | always a card (`preview.tsx:285`); inline placement strips it for all twenty (`QuizRuntime.tsx:507-515`) |
| Header | ❌ | `templates.tsx:171-184` — identical "Step N of M" + "Confidential" for all twenty; the model has no header field |
| Progress location / geometry | ❌ location, ⚠️ geometry | always slot 2 inside the card (`preview.tsx:290`); interior varies; a second generic bar is always drawn outside (`QuizRuntime.tsx:554`) |
| Question positioning | ❌ | fixed tagline → headline → question → subheadline stack (`preview.tsx:293-296`) |
| Typography hierarchy | ⚠️ | question face/weight/size switch on 2 booleans; every other size is a literal in `preview.tsx` |
| Answer orientation | ❌ | uniform `repeat(cols,1fr)` grid (`preview.tsx:298`); `answerLayout` unused |
| Answer geometry | ✅ | the one axis that works (`answers.tsx:93-279`) |
| Icons / numbers / checks | ❌ | policy declared, no data (`templates.tsx:147`) |
| Selected state | ✅ | per answer form, three signals each (`answers.tsx:51-73`) |
| Supporting copy | ❌ | `footerTrust: ''` for all twenty (`templates.tsx:105`); TCPA line fixed (`preview.tsx:350`) |
| Navigation placement | ❌ | back-left / submit-right row, always last (`preview.tsx:345-348`) |
| Footer / chrome | ❌ | brand-owned, template-blind (`QuizRuntime.tsx:531-549`, `:593-603`) |
| Split-screen layout | ❌ | structurally impossible — one column, one card |
| Responsive composition | ❌ | one media query collapses every grid to 1fr for all twenty (`QuizRuntime.tsx:516-520`) |

Two of seventeen axes work.

---

## 3. Is the preview a simplified approximation?

Three different surfaces, three different answers. Precision matters here because
one of them is already correct and must not be "fixed".

**Template card thumbnail — APPROXIMATION.**
`TemplateGallery.tsx:272` → `TemplatePreview`
(`src/components/builder/quiz/TemplatePreview.tsx:30-86`). It builds its own DOM:
a `QuizProgress`, one hard-coded string `"How were you injured?"` (`:63`), and
two sample answers from a module constant (`:23`) laid out with `answerLayout`
(`:66`) — the function the live page ignores. No card, no header, no nav, no
input types, no endpoint, no chrome. It is a two-element swatch, not the design.

**Deployment gallery preview modal — APPROXIMATION, and provably so.**
`TemplateGallery.tsx:222-226` mounts the same `TemplatePreview` at `height={640}`.
The asymmetry is the proof: the landing-page branch immediately above
(`TemplateGallery.tsx:199-221`) mounts `LivePreview`, which the file's own header
calls *"the same component the public page and the builder's own centre pane
render"* (`:24-30`). Landing pages get the real composition path; quizzes get a
swatch. Rule 2 of that file — *"EVERY PREVIEW IS A REAL RENDER"* — holds for LP
and is false for quiz.

**Templates tab preview modal — APPROXIMATION, with a caption that says otherwise.**
`QuizTemplatesPanel.tsx:115-139` → `Thumb` (`:83`) → `TemplatePreview`. Its
caption reads *"A real render, not a picture of one: the progress and answer
forms below are the components the deployed quiz mounts"* (`:134-135`). That
sentence is technically true of the two leaf widgets and false of everything
around them, which is the most expensive kind of half-true: an operator reads it
as a guarantee about the design.

**Builder flow preview (`QuizPreviewView`) — REAL.**
`preview.tsx:372-559` mounts the actual `PreviewQuestionCard` (`:536`) driven by
the actual `quiz-graph` functions. It duplicates the *runtime* (its own
`handleAnswer` at `:433-470`, its own history at `:472`) but not the *renderer*.
This is the surface that must be preserved in spirit and de-duplicated in
mechanism.

**Node preview modal — REAL.** `preview.tsx:355-370` mounts
`PreviewQuestionCard` on a single node.

---

## 4. The seam that must change

There are two, and both must move together.

**Seam A — resolution returns tokens, not a component.**
`getTemplateConfig(id) → { cardRadius, headlineSize, buttonRadius, … }`
(`templates.tsx:114-119`) is consumed by a fixed tree (`preview.tsx:285-352`).
While the return value is a style bag, the DOM cannot vary; every new axis
requires a new token *and* a new branch inside the one card. Resolution must
instead return **a component that owns its own DOM**.

**Seam B — the page canvas belongs to the runtime, not to the template.**
`QuizRuntime.tsx:489-604` owns the background, the header, the 760px column, the
generic progress bar, the body sections and the footer. Even a per-template card
component cannot produce Fullscreen Focus (edge-to-edge), Timeline Journey (a
rail beside the question), Case File Console (a tab bar above a document body) or
Guided Conversation (a scrolling transcript) while that shell is fixed. The
canvas must be inside the template's component, with the runtime supplying only
data and handlers.

Moving A without B yields twenty templates that all sit in a 760px column under a
brand-primary bar. Moving both is what makes the seventeen axes reachable.

---

## 5. The corrected architecture

### 5.1 The split

**Shared, single-implementation, never duplicated per template**

- the state machine: step index, tier, field values, history/back stack, finished
- graph routing: `resolveNodeForStep`, `explicitStepIndex`, `nextSequentialStepIndex`, `entryStepIndex` (`src/lib/quiz-graph.ts`)
- invisible-node execution and the auto-advance cycle bound (`QuizRuntime.tsx:374-401`)
- answer application: field mappings, `isDQ`, `setTier` (`QuizRuntime.tsx:240-244`)
- qualification / tier decisioning (`src/lib/quiz-webhook/tier.ts`)
- webhook + verification + AI node execution (`QuizRuntime.tsx:248-314`)
- consent capture, TrustedForm/Jornaya reads, attribution
- lead submission, the single-submit ref, the idempotency key, the retry (`QuizRuntime.tsx:176-234`)
- pixel dedupe / `event_id`
- destinations and redirect resolution (`src/lib/quiz-destinations.ts`)
- embed height reporting, container measurement
- theming: `quizTheme` (`src/lib/quiz-templates/theme.ts`) and the colour system

**Shared but optional (visual primitives a composition may use or ignore)**

`QuizProgress`, `QuizAnswer`, `QuizField`, `QuizDatePicker`, `QuizNav`,
`QuizConsent`, `QuizEndpoint`, `QuizSpinner`.

**Per composition (the whole point)**

The complete DOM: canvas, width, card-or-not, header, where progress goes and
what shape it is, where the question sits, the type scale, how answers are
arranged, supporting copy, nav placement, footer, split layouts, and its own
responsive rules.

### 5.2 The interface

New module: `src/lib/quiz-compositions/`.

```ts
/* ---------------------------------------------------------------- contract */

/** A composition is a component plus the ids it draws. Nothing else. */
export interface QuizComposition {
  /** Stable composition key, e.g. 'editorial', 'console_tabs', 'fullscreen'. */
  readonly key: string
  /** The sq_* template ids this composition draws. Every id must be claimed once. */
  readonly renders: readonly string[]
  /** The whole render, canvas included. There is no second component. */
  readonly Root: React.ComponentType<QuizCompositionProps>
}

export type QuizRenderMode =
  /** A visitor. Answers write leads, redirects navigate. */
  | 'live'
  /** An operator clicking through. Real machine, side effects suppressed. */
  | 'preview'
  /** A frozen still: fixture data, handlers are no-ops, pointer events off. */
  | 'still'

/** Where the composition is mounted. Chrome is the composition's to draw. */
export type QuizPlacement = 'page' | 'inline' | 'embed'

export interface QuizCompositionProps {
  /** Everything the machine knows, in the only shape a composition may read. */
  readonly view: QuizViewModel
  /** The only way a composition can change anything. */
  readonly actions: QuizActions
  /** Brand-derived, contrast-verified. Never invent a colour. */
  readonly theme: QuizTheme
  /** Cosmetic axes for the specific id being drawn (progress/answer form, serif, dark, width). */
  readonly spec: QuizTemplateSpec
  readonly mode: QuizRenderMode
  readonly placement: QuizPlacement
  /** Shared visual primitives. Using them is optional; re-implementing input is not. */
  readonly P: QuizPrimitives
}

/* -------------------------------------------------------------- view model */

export interface QuizViewModel {
  readonly phase: 'question' | 'working' | 'endpoint' | 'complete'
  readonly step: {
    readonly index: number          // zero-based, visible steps only
    readonly total: number
    readonly percent: number
    /** Real milestone names when the quiz has them; derived placeholders otherwise. */
    readonly labels: readonly string[]
    /** True when `labels` are derived rather than authored — a composition may hide the rail. */
    readonly labelsAreDerived: boolean
  }
  readonly node: {
    readonly id: string
    readonly kind: 'question' | 'form' | 'endpoint' | 'transition'
    readonly tagline: string | null      // already interpolated
    readonly headline: string | null
    readonly question: string | null
    readonly subheadline: string | null
    readonly helpNote: string | null     // SQ-08's "why we ask"
    readonly hiddenInLive: boolean       // draw the builder-only badge
  }
  readonly input: QuizInputModel
  /** Answered history, for compositions that show it (SQ-10 Answer First, SQ-13 chat). */
  readonly answered: readonly { question: string; answer: string; stepIndex: number }[]
  readonly nav: {
    readonly canGoBack: boolean
    readonly canSubmit: boolean
    readonly autoAdvance: boolean
    readonly submitLabel: string
    readonly backLabel: string
  }
  readonly endpoint: {
    readonly mode: 'none' | 'immediate' | 'button'
    readonly url: string | null
    readonly buttonLabel: string
    readonly settled: boolean            // lead persisted; safe to redirect
  } | null
  readonly legal: { readonly tcpa: string | null; readonly disclaimer: string | null }
  readonly chrome: {
    readonly header: BrandHeaderConfig | null
    readonly footer: BrandFooterConfig | null
    readonly bodySections: readonly BodySection[]
  }
}

export type QuizInputModel =
  | { readonly kind: 'options'; readonly multi: boolean; readonly options: readonly QuizOption[] }
  | { readonly kind: 'fields'; readonly fields: readonly QuizFieldModel[]; readonly honeypot: QuizFieldModel | null }
  | { readonly kind: 'date'; readonly value: PartialDate; readonly dayRequired: boolean }
  | { readonly kind: 'text'; readonly field: QuizFieldModel }
  | { readonly kind: 'none' }

/**
 * One selectable answer, fully resolved.
 *
 * `select` is BOUND: it already carries auto-advance policy, multi-select
 * toggling, field mappings, DQ and tier. A composition draws it and calls it;
 * it can neither construct an answer nor route one, which is what makes twenty
 * compositions unable to hold twenty subtly different selection bugs.
 */
export interface QuizOption {
  readonly id: string
  readonly index: number
  readonly label: string
  readonly meta: string | null
  readonly iconKey: string | null     // resolved by the composition against its own icon set
  readonly selected: boolean
  readonly select: () => void
}

export interface QuizActions {
  readonly submit: () => void
  readonly back: () => void
  readonly setField: (key: string, value: string) => void
  readonly setDate: (value: PartialDate) => void
  /** Preview-only; a no-op in 'live'. */
  readonly restart: () => void
}

export interface QuizPrimitives {
  readonly Progress: typeof QuizProgress
  readonly Answer: typeof QuizAnswer
  readonly Field: React.ComponentType<{ model: QuizFieldModel; theme: QuizTheme }>
  readonly DatePicker: React.ComponentType<{ value: PartialDate; dayRequired: boolean; theme: QuizTheme }>
  readonly Nav: React.ComponentType<{ view: QuizViewModel; actions: QuizActions; theme: QuizTheme }>
  readonly Consent: React.ComponentType<{ text: string; theme: QuizTheme }>
  readonly Endpoint: React.ComponentType<{ view: QuizViewModel; theme: QuizTheme; mode: QuizRenderMode }>
  readonly Spinner: React.ComponentType<{ theme: QuizTheme }>
}
```

Three properties of this interface do the structural work:

1. **`view` is data, not nodes.** A composition cannot reach a Payload document,
   a graph function or a fetch. Copy arrives interpolated; steps arrive counted.
2. **`actions` and `option.select` are the only mutations.** There is no
   `onAnswer(answerObject)` and no `node` on the props, so a composition
   physically cannot assemble an answer, apply a field mapping, set a tier or
   choose a next step.
3. **`P.Field` / `P.DatePicker` are the only input controls.** A composition that
   wants a text question renders `<P.Field/>`; it never writes an `<input>` bound
   to its own state. This is what keeps honeypot handling, validation and
   `canSubmit` single-implementation across twenty designs.

### 5.3 Registration and resolution

```ts
// src/lib/quiz-compositions/registry.ts
import { editorial } from './editorial'
import { consoleTabs } from './console-tabs'
/* … */

const COMPOSITIONS: readonly QuizComposition[] = [editorial, consoleTabs, /* … */]

/** sq_* id → composition. Built once; duplicate claims are a startup error. */
const BY_TEMPLATE_ID: ReadonlyMap<string, QuizComposition> = /* built from `renders` */

export type CompositionResolution =
  | { ok: true; composition: QuizComposition }
  | { ok: false; error: string; requestedId: string }

/** Strict. Used by save paths, the publish preflight and record selectability. */
export const resolveComposition = (templateId: unknown): CompositionResolution => /* … */

/** Render path: must draw something, and says when it guessed. */
export const resolveCompositionForRender = (templateId: unknown): {
  composition: QuizComposition
  usedFallback: boolean
  requestedId: string
  error: string | null
} => /* … falls back to NEUTRAL_COMPOSITION, mirroring resolveForRender */
```

**Rules, mirroring the existing `template-registry` discipline:**

- The **id space does not change.** `src/lib/template-registry.ts` remains the
  sole authority on which `sq_*` ids and aliases exist
  (`template-registry.ts:263-287`). Composition resolution runs *after* it, on
  the canonical id. Legacy ids (`default`, `minimal`, `editorial`, `gradient`,
  `glass`, `compact` — `model.ts:341-348`) therefore keep working with no new
  mapping table.
- `registryHealth()` (`template-registry.ts:370-421`) gains two checks: every
  registered quiz template id is claimed by exactly one composition, and no
  composition claims an id the registry does not know. A missing claim is a
  startup-visible problem, not a silent fallback.
- **`renders` is many-to-one on purpose.** Twenty ids do not need twenty files.
  The handoff clusters into roughly eight compositions — `editorial`,
  `soft_card`, `console`, `dossier`, `direct_panel`, `fullscreen`, `rail`
  (timeline/decision path), `conversation` — each claiming two to four ids and
  varying them through `spec` (progress form, answer form, serif, dark, width).
  The rule is: **if two ids differ only in the leaves, they share a composition;
  if they differ in structure, they do not.** That is the judgement the current
  model made once, globally, and got wrong.
- **Selectability vs renderability.** `selectabilityProblem`
  (`src/lib/template-records/model.ts:85-90`) gains a fourth clause: a record
  whose `rendererKey` resolves in the template registry but has **no registered
  composition** is not selectable, and says so. Render keeps using
  `resolveCompositionForRender`, so a deployment already on such an id continues
  to draw (under the neutral composition, logged). Existing deployments never
  break; unsupported synthetic variants stop being offered. This is the same
  existing-vs-new split `quiz-deployment.ts:91-100` already applies to
  `is_enabled`.

### 5.4 One renderer for all five surfaces

The five surfaces differ in **who drives the machine**, never in **who draws the
pixels**.

```ts
// src/components/public/quiz/QuizSurface.tsx
export function QuizSurface(props: {
  quiz: PublicQuiz
  brand: Brand
  deployment: PublicQuizDeployment
  site: SiteRef | null
  mode: QuizRenderMode
  placement: QuizPlacement
  surfaceColor?: string | null
  /** Only for mode: 'still' — freezes the machine at a scripted position. */
  fixture?: QuizFixture
}) {
  const machine = props.mode === 'still'
    ? useScriptedQuizMachine(props.quiz, props.fixture)   // pure, no effects, no fetch
    : useQuizMachine({ ...props })                        // the real state machine
  const { composition } = reportCompositionFallback('quiz surface',
    resolveCompositionForRender(props.deployment.templateId))
  const theme = quizTheme(spec, props.brand, props.surfaceColor)
  return <composition.Root view={machine.view} actions={machine.actions} theme={theme}
                           spec={spec} mode={props.mode} placement={props.placement} P={PRIMITIVES} />
}
```

| Surface | Today | After |
|---|---|---|
| Public quiz page | `QuizRuntime` → `PreviewQuestionCard` | `QuizSurface mode="live" placement="page"` |
| Embedded quiz (iframe) | same, `embed` prop | `QuizSurface mode="live" placement="embed"` |
| Quiz in an LP hero | same, `inline` prop + `!important` CSS card-strip (`QuizRuntime.tsx:507-515`) | `QuizSurface mode="live" placement="inline"` — the composition decides what "inline" means for *its* design instead of a global override |
| Builder flow preview (`QuizPreviewView`) | its own duplicate state machine (`preview.tsx:433-470`) | `QuizSurface mode="preview"` + the existing brand/deploy toolbar around it — the duplicate machine is deleted |
| Node preview modal | `PreviewQuestionCard` on one node | `QuizSurface mode="still"` with a one-node fixture |
| Deployment gallery preview modal | `TemplatePreview` swatch (`TemplateGallery.tsx:224`) | `QuizSurface mode="still"` at device width — a real render |
| Gallery card thumbnail | `TemplatePreview` swatch (`:272`) | `QuizSurface mode="still"` inside the existing scale-and-contain box used for LP thumbs (`TemplateGallery.tsx:102-133`) |
| Templates tab thumb + modal | `TemplatePreview` (`QuizTemplatesPanel.tsx:83`) | same `QuizSurface mode="still"` |

`src/components/builder/quiz/TemplatePreview.tsx` is deleted. There is then no
component in the repository capable of drawing an approximation of a quiz
template, which is the only durable way to keep item G true.

`useScriptedQuizMachine` is the piece that makes a thumbnail cheap without making
it a lie: it takes a fixture (sample question, sample options, step 2 of 5, one
option selected), builds the **same `QuizViewModel`**, and returns no-op actions.
Because the type is identical, a composition cannot behave differently in a
thumbnail — it has no way to tell.

### 5.5 The risk this seam exists to prevent

**The naive fix is to copy `PreviewQuestionCard` twenty times.** Each copy would
carry its own `submitSelected` (`preview.tsx:247-255`), its own `canSubmit`
(`:257`), its own auto-advance branch (`:299`), its own multi-select toggle
(`:303`), its own smart-date wiring (`:313`), its own honeypot (`:324`) and its
own redirect effect (`:233-239`). Twenty copies of `canSubmit` means twenty
places for a required-field rule to be wrong, and a lead lost on template
seventeen would be invisible on the other nineteen. The current codebase already
demonstrates the failure at scale=2: `QuizPreviewView.handleAnswer`
(`preview.tsx:433-470`) is a second copy of `QuizRuntime.advance`
(`QuizRuntime.tsx:239-353`) and has already drifted — it never executes webhook
or verification nodes, so tier assignment behaves differently in the builder than
in production.

Four structural defences, in order of strength:

1. **The props carry no primitives of behaviour.** No `node`, no `quiz`, no
   `deployment`, no `onAnswer(answer)`. `option.select()` is bound. There is
   nothing for a composition to re-implement, because it is never given the
   inputs re-implementation would need.
2. **Input controls are primitives, not markup.** `P.Field` and `P.DatePicker`
   own value state and validation; `view.nav.canSubmit` is computed by the
   machine. A composition renders `<P.Nav/>` or its own button wired to
   `actions.submit` — but the *predicate* is never restated.
3. **An import-graph gate.** `scripts/test-quiz-compositions.mts` asserts that no
   file under `src/lib/quiz-compositions/**` imports `quiz-graph`,
   `lead-capture-client`, `quiz-webhook`, `quiz-destinations`, `payload`, or uses
   `fetch`/`useEffect`-with-network. A composition that starts to grow a runtime
   fails CI on the import, before the logic exists. This is the same
   "make the wrong state structurally impossible" rule the colour system uses.
4. **A conformance suite.** The same script mounts every composition against
   three fixtures (options question, form node, endpoint) in `still` mode and
   asserts the test hooks the e2e suite depends on are present:
   `data-quiz-root`, `data-quiz-answer` once per option, `data-quiz-submit` when
   `canSubmit`, `data-quiz-back` when `canGoBack`, `data-quiz-endpoint` on an
   endpoint (`preview.tsx:285, 337, 346-347`, `answers.tsx:86`). A composition
   that draws a beautiful design with unclickable answers cannot merge.

---

## 6. Staged migration

Every stage is independently shippable and leaves live deployments rendering.
No stage changes a stored `template_id`.

**Stage 0 — extract the machine. No pixel changes.**
Move the state machine out of `QuizRuntime` into `useQuizMachine`
(`src/components/public/quiz/machine.ts`), returning `{ view, actions }`. Build
`QuizViewModel` from exactly the values `QuizRuntime` already computes. Wrap
today's card as a composition, `legacy_card`, whose `Root` renders the current
page shell (`QuizRuntime.tsx:489-604`) plus the current card
(`preview.tsx:285-352`) verbatim, claiming **all twenty ids**.
*Verification:* the e2e lead script (`scripts/test-e2e-lead.mts`) passes
unchanged; DOM diff on three live deployments is empty.

**Stage 1 — one mount everywhere.**
Add `QuizSurface` and `useScriptedQuizMachine`. Route the public page, embed,
inline, `QuizPreviewView`, `NodePreviewModal`, `TemplateGallery` (thumb + modal)
and `QuizTemplatesPanel` through it. Delete `TemplatePreview.tsx` and
`QuizPreviewView`'s duplicate `handleAnswer`/`goBack`.
*Effect:* previews become real renders immediately, still of the generic design —
which is the honest picture and will look worse, correctly.
*Verification:* the builder preview now executes webhook nodes exactly as
production does (the drift in §5.5 closes as a side effect).

**Stage 2 — fix the data starvation. Requires one migration.**
Feed the view model what the leaves have always needed:
`view.step.labels` from a new `quiz.milestones[]` (falling back to derived names
with `labelsAreDerived: true`), `QuizOption.iconKey` and `.meta` from new
per-answer fields, `node.helpNote` from a new node field. Migration is additive,
nullable, `ADD COLUMN IF NOT EXISTS`, per house style. Also fix, in this stage:
`getTemplateConfig` losing `progressForm` (`preview.tsx:196`), the 760px clamp
(`QuizRuntime.tsx:553`) becoming composition-owned, the duplicate outer progress
bar (`:554`) being removed, and the `cardBackdrop` function-as-CSS-value.
*Effect:* Case Router shows its breadcrumb, Case Dossier its factor names, Incident
Scene its diagrams. Still one composition, but eight of the twenty stop looking
identical.

**Stage 3 — land compositions, one family per PR.**
Each PR adds one composition and moves its two-to-four ids off `legacy_card`'s
`renders` list. Suggested order, most-distinct first, so the win is visible
early: `fullscreen` (SQ-17), `rail` (SQ-15, SQ-19), `console` (SQ-03, SQ-16),
`conversation` (SQ-13), `dossier` (SQ-04, SQ-20), `editorial` (SQ-01, SQ-12),
`direct_panel` (SQ-05, SQ-07), `soft_card` (SQ-02, SQ-06, SQ-09, SQ-10, SQ-11,
SQ-14, SQ-18). A deployment on a moved id starts drawing the new composition on
the next deploy with no data change; a deployment on an unmoved id is untouched.
*Verification per PR:* conformance suite green; a screenshot pair (page + gallery
still) proving they match; the e2e lead script against one deployment on the
moved id.

**Stage 4 — retire the token bag.**
When `legacy_card.renders` is empty, delete it, delete `getTemplateConfig`'s
cosmetic keys (`cardRadius`, `headlineSize`, `headlineWeight`, `buttonRadius`,
`cardShadow`, `cardBackdrop`, `pageOverlay`, `pagePattern`, `footerTrust`),
and keep only `quizTheme` + `spec`. `PreviewQuestionCard` is deleted with it.
Extend `registryHealth` to fail if any registered template id has no composition.

**Rollback at every stage** is `git revert && git push` plus the standard rebuild:
no stage rewrites stored ids, so reverting code reverts the design with no data
repair.

---

## 7. What this document does not cover

- The **AI template wizard** (`AINewQuizTemplateWizard.tsx`,
  `createQuizTemplateWithClaude`) currently produces a record whose `rendererKey`
  is one of the twenty plus a progress override. Under this design it should
  choose a **composition** and its cosmetic axes; the wizard's contract needs a
  matching change in Stage 3 or it will keep manufacturing near-duplicates.
- **Per-composition responsive behaviour** replaces the global media query
  (`QuizRuntime.tsx:516-520`). Each composition must state its own; the
  conformance suite should render every composition at 390px and assert no
  horizontal overflow.
- Nothing here has been executed. This codespace cannot build (no
  `node_modules`, no `.env`, no database), so every claim above is read from the
  committed source with file:line evidence and none of it is runtime-verified.
