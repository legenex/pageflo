# Quiz template fidelity — the perceptual baseline

**Status:** measurement. No production code was changed to produce this document.
**Scope:** the twenty selectable `sq_*` quiz templates, as pixels.
**Harness:** `scripts/quiz-template-fidelity.mts`
**Date:** 2026-08-15 (Stage A landed: one machine, one surface, `QuizStill`, the
760px clamp and the duplicate progress bar removed)

```bash
pnpm tsx scripts/quiz-template-fidelity.mts
pnpm tsx scripts/quiz-template-fidelity.mts --only sq_card_deck,sq_decision_path
pnpm tsx scripts/quiz-template-fidelity.mts --no-reference     # implementation only, nothing gated
```

Exit `0` when every template is materially distinct from every other at the
source-derived bar; `1` when any has collapsed, or when a render failed, or when
no reference pairs existed to derive a bar from. Output lands in
`artifacts/quiz-fidelity/` — 160 PNGs named `<sq_id>.<viewport>.<state>.png` plus
`fidelity.json` carrying every pairwise distance, so a regression suite can
consume the numbers rather than re-derive them.

---

## 0. The headline

**At the phone viewport, thirteen of the twenty templates are one
indistinguishable blob.** The implementation resolves into **8 visually distinct
groups** where the source resolves into **14** under the identical rule. On the
lead-form step it is worse: **5 groups**, one of them sixteen templates wide.

Desktop is much closer to honest — **12 groups against the source's 14** — and
the *selected* state is the one place the library outperforms its own control
(17 groups, only 3 pairs under the bar against the reference set's 10). Selection
is where the nineteen answer forms actually reach pixels.

And every template is further from its own source design than the source's own
threshold for "these two are different templates". The closest reproduction in
the set, `sq_editorial_inline`, sits at 0.0375 against a desktop bar of 0.0271.
That comparison carries a constant framing offset and is a ranking rather than a
score — §4 says exactly how much to trust it.

| | desktop | mobile |
|---|---|---|
| distinct groups — **reference** (control) | 14 / 20 | 14 / 20 |
| distinct groups — **implementation**, initial | **12 / 20** | **8 / 20** |
| distinct groups — implementation, selected | 17 / 20 | 14 / 20 |
| distinct groups — implementation, lead form | 13 / 20 | **5 / 20** |
| pairs under the bar — reference (control) | 10 / 190 | 10 / 190 |
| pairs under the bar — implementation, initial | 13 / 190 | **44 / 190** |
| pairs under the bar — implementation, lead form | 10 / 190 | **57 / 190** |

---

## 1. Method

### What is rendered, on both sides

**Implementation.** `QuizStill` — the frozen renderer Stage A landed, which
mounts the real `QuizSurface` / `QuizCard` driven by `useStillQuizMachine`. Not
an approximation: the component that draws a gallery thumbnail is the component
that draws a live page, and `TemplatePreview` no longer exists to draw anything
else. It is mounted in a real Chromium from an esbuild bundle of the actual
`src/` modules, so the container-width effect that decides how many answer
columns fit — an effect that only exists in a browser — is live.

**Reference.** The supplied `quizzes/Standalone-Quiz-NN-*.html`, loaded straight
into the same Chromium. Those files are self-extracting, so the browser does the
unpacking and what renders is the design as delivered. The harness matches file
to template by the `SQ-NN` code and then **verifies** the match by reading the
slug out of the design's own preview toolbar; all twenty verified on this run.

### Conditions, held identical

- **Brand:** `PREVIEW_BRAND_DEFAULT` — the product's own colourless preview
  brand, which resolves through `NEUTRAL_QUIZ_FALLBACK`, the neutral palette the
  handoff draws every template in. The reference's own default is its "Neutral
  preview" brand. Both sides are therefore brandless on purpose: a brand-coloured
  render would let hue stand in for design.
- **Flow:** one fixture, six visible steps, the question drawn at step 1 of 6 so
  the implementation's step counter reads the same denominator as the
  reference's. The question node is transcribed from `STILL_FIXTURE_QUIZ`, and
  the harness asserts at runtime that the two have not drifted apart.
- **Viewports:** 1280×900 and 390×844. The screenshot is the viewport, not the
  full page — what a visitor sees, at a fixed size, so no comparison is between
  images of different shape.
- **States:** initial question, an answer selected, and the lead form.
- **Determinism:** transitions and animations disabled on both sides; all four
  faces (`Archivo`, `Inter`, `JetBrains Mono`, `Source Serif 4`) explicitly
  requested and confirmed loaded before the first shot, because the twenty differ
  partly by face and a run without them would understate the distinction. Two
  independent full runs on this machine produced **byte-identical** console
  output, so a later run that differs is reporting a change rather than noise.
  A run also records which faces loaded, so a fontless environment reports
  itself instead of quietly producing a system-font baseline.

### Framing — the one adjustment, and why

A still draws no page chrome. The reference preview has switches for exactly the
chrome a still omits — **Brand logo, Quiz introduction, Phone CTA, Privacy
line** — and the harness turns all four **off** before every reference
screenshot, verifying each actually flipped. The progress indicator is
deliberately left **on**: it is the template's own identity, not chrome.

This is not a convenience. Those four elements are identical in all twenty
references, so leaving them in would make the reference set look more alike than
it is, and would therefore **lower** the bar the implementation has to clear.
The same reasoning applies to the 49px band of the preview's dark shell that the
hidden toolbar exposes; the harness reclaims it rather than photographing an
identical strip into all twenty shots.

### The metric

**Primary — RMSE over a 64×64 luminance grid, range 0..1.** Not a byte hash: a
byte hash answers "identical or not", and the interesting failure here is
"different in ways nobody would notice". Not a raw full-resolution diff either:
that answers a question about antialiasing. Downscaling first is what makes the
number perceptual — the box average discards sub-pixel detail and keeps what a
person actually reads a layout by: where the dark regions are, how wide the card
runs, whether the ground is light or dark. 64 rather than the 8 a pHash uses,
because eight is plenty to say "same image" and far too coarse to *rank* 190
pairs, which is the job.

**Secondary — dHash, 64 bits of horizontal-gradient sign, normalised Hamming.**
Brightness- and contrast-invariant, so it corroborates the primary where the
primary might be reading tone alone. Both come from the same PNG in the same
downscale pass.

### The bar is derived, not declared

A fixed threshold would be this harness asserting its own taste. The reference
set already contains the answer: twenty designs the source treats as distinct,
rendered through one byte-identical engine, so **their own pairwise distances are
the library's definition of a material difference**. The bar is the **5th
percentile of the reference pairwise distribution, per viewport** — a percentile
rather than the minimum so one unusually close reference pair cannot drag it to
zero, and derived rather than declared so it moves if the source does.

| viewport | n | min | **p5 (the bar)** | p25 | median | max |
|---|---|---|---|---|---|---|
| desktop | 190 | 0.0207 | **0.0271** | 0.0402 | 0.0517 | 0.8309 |
| mobile | 190 | 0.0425 | **0.0522** | 0.0635 | 0.0724 | 0.8141 |

The distribution is bimodal by construction: `sq_deadline_timeline` is the one
template that grounds dark, so its nineteen pairs sit around 0.8 and pull the
maximum up. The bar is set from the crowded light end, which is where the
difficult comparisons live.

Because the bar is a percentile, the reference set fails its own bar on ten
pairs at each viewport by definition. **Those ten are the control**: any
implementation count above them is collapse the source does not have.

Only the **initial** state gates the exit code — it is the one state all twenty
references present on load, identically, without simulating each design's own
interaction model, so it is the only state a reference-derived expectation
exists for. The selected and lead-form states are measured against the same bar
and reported as borrowing it.

---

## 2. The clusters

Single linkage — two templates are in one group if a chain of
below-the-bar pairs connects them. That is the right join rule for this
question: a picker showing the whole chain is offering a run of pictures no
operator can tell apart.

### Reference (the control)

> **desktop, 7 templates:** `sq_editorial_inline`, `sq_recovery_soft`,
> `sq_case_dossier`, `sq_answer_first`, `sq_case_router`, `sq_timeline_journey`,
> `sq_decision_path`
>
> **mobile, 7 templates:** `sq_editorial_inline`, `sq_recovery_soft`,
> `sq_insurer_context`, `sq_case_router`, `sq_network_vetting`,
> `sq_timeline_journey`, `sq_decision_path`

Thirteen singletons at each viewport. This is what the source looks like under
the same rule, and it is the number to beat.

### Implementation — initial question

> **desktop, 9 templates:** `sq_editorial_inline`, `sq_recovery_soft`,
> `sq_authority_console`, `sq_insurer_context`, `sq_answer_first`,
> `sq_network_vetting`, `sq_guided_conversation`, `sq_decision_path`,
> `sq_evidence_checklist`
>
> **mobile, 13 templates:** `sq_editorial_inline`, `sq_recovery_soft`,
> `sq_authority_console`, `sq_case_dossier`, `sq_insurer_context`,
> `sq_sixty_second`, `sq_answer_first`, `sq_case_router`, `sq_network_vetting`,
> `sq_guided_conversation`, `sq_case_file_console`, `sq_decision_path`,
> `sq_evidence_checklist`

### Implementation — lead form

> **mobile, 16 templates:** everything except `sq_deadline_timeline`,
> `sq_case_dossier`, `sq_timeline_journey` and `sq_fullscreen_focus`.

### The worst individual collapses

Read the last column as *how much of the source's own difference survived*.

| pair | viewport | source | implementation | compression |
|---|---|---|---|---|
| `sq_authority_console` ~ `sq_evidence_checklist` | mobile | 0.1799 | **0.0112** | 16.0× |
| `sq_recovery_soft` ~ `sq_authority_console` | mobile | 0.1709 | 0.0371 | 4.6× |
| `sq_authority_console` ~ `sq_decision_path` | mobile | 0.1681 | 0.0337 | 5.0× |
| `sq_authority_console` ~ `sq_network_vetting` | mobile | 0.1733 | 0.0339 | 5.1× |
| `sq_recovery_soft` ~ `sq_authority_console` | desktop | 0.1072 | **0.0182** | 5.9× |
| `sq_case_file_console` ~ `sq_decision_path` | desktop | 0.1417 | 0.0272 | 5.2× |
| `sq_authority_console` ~ `sq_evidence_checklist` | desktop | 0.1126 | 0.0256 | 4.4× |
| `sq_network_vetting` ~ `sq_decision_path` | mobile | 0.0559 | **0.0139** | 4.0× |

`sq_authority_console` appears in five of the eight. It is the template the
implementation flattens hardest: the source draws a dark institutional header
strip and squared rows, the implementation draws the same rounded neutral card
everything else gets.

`sq_network_vetting` ~ `sq_decision_path` is the cleanest illustration of the
mechanism. Both declare `answers: 'thin_radio'`. The source distinguishes them
completely — `sq_decision_path` puts a full-width labelled path-node header above
a nested inner card; `sq_network_vetting` is a narrow 460–580px column with a
vetting strip under the answers. The implementation renders both as the same
two-column radio grid inside the same card, differing only in the progress
widget and about 250px of width. At 390px the width difference disappears
entirely and 0.0139 is what is left.

---

## 3. Full table

Distances at the **initial** state. `nearest other` is the closest sibling at
desktop. `vs ref` is the distance to that template's own reference design.

| # | id | name | nearest other | d(desktop) | d(mobile) | vs ref (desktop) | vs ref (mobile) | verdict |
|---|---|---|---|---|---|---|---|---|
| 01 | `sq_editorial_inline` | Editorial Inline | `sq_answer_first` | 0.0232 | 0.0329 | 0.0375 | 0.0595 | **FAIL** both |
| 02 | `sq_recovery_soft` | Recovery Soft | `sq_authority_console` | 0.0182 | 0.0371 | 0.0433 | 0.0675 | **FAIL** both |
| 03 | `sq_authority_console` | Authority Console | `sq_recovery_soft` | 0.0182 | 0.0112 | 0.1081 | 0.1702 | **FAIL** both |
| 04 | `sq_case_dossier` | Case Dossier | `sq_case_file_console` | 0.0378 | 0.0496 | 0.0470 | 0.0633 | **FAIL** mobile |
| 05 | `sq_direct_panel` | Direct Panel | `sq_insurer_context` | 0.0306 | 0.0592 | 0.1522 | 0.2177 | PASS |
| 06 | `sq_quiz_first` | Quiz First | `sq_decision_path` | 0.0331 | 0.0587 | 0.0521 | 0.0793 | PASS |
| 07 | `sq_deadline_timeline` | Deadline Timeline | `sq_fullscreen_focus` | 0.8695 | 0.8317 | 0.0801 | 0.0977 | PASS |
| 08 | `sq_insurer_context` | Insurer Context | `sq_network_vetting` | 0.0215 | 0.0309 | 0.0746 | 0.0814 | **FAIL** both |
| 09 | `sq_sixty_second` | Sixty Second | `sq_editorial_inline` | 0.0360 | 0.0426 | 0.0422 | 0.0648 | **FAIL** mobile |
| 10 | `sq_answer_first` | Answer First | `sq_editorial_inline` | 0.0232 | 0.0474 | 0.0463 | 0.0739 | **FAIL** both |
| 11 | `sq_case_router` | Case Router | `sq_network_vetting` | 0.0306 | 0.0485 | 0.0458 | 0.0701 | **FAIL** mobile |
| 12 | `sq_network_vetting` | Network Vetting | `sq_insurer_context` | 0.0215 | 0.0139 | 0.0707 | 0.0732 | **FAIL** both |
| 13 | `sq_guided_conversation` | Guided Conversation | `sq_network_vetting` | 0.0223 | 0.0329 | 0.0430 | 0.0593 | **FAIL** both |
| 14 | `sq_incident_scene` | Incident Scene | `sq_evidence_checklist` | 0.0306 | 0.0532 | 0.0484 | 0.0772 | PASS |
| 15 | `sq_timeline_journey` | Timeline Journey | `sq_case_dossier` | 0.0446 | 0.0553 | 0.0461 | 0.0690 | PASS |
| 16 | `sq_case_file_console` | Case File Console | `sq_decision_path` | 0.0272 | 0.0427 | 0.1478 | 0.2074 | **FAIL** mobile |
| 17 | `sq_fullscreen_focus` | Fullscreen Focus | `sq_case_file_console` | 0.0547 | 0.0774 | 0.0709 | 0.0913 | PASS |
| 18 | `sq_card_deck` | Card Deck | `sq_evidence_checklist` | 0.0355 | 0.0634 | 0.0706 | 0.0840 | PASS |
| 19 | `sq_decision_path` | Decision Path | `sq_evidence_checklist` | 0.0262 | 0.0139 | 0.0407 | 0.0642 | **FAIL** both |
| 20 | `sq_evidence_checklist` | Evidence Checklist | `sq_authority_console` | 0.0256 | 0.0112 | 0.0580 | 0.0809 | **FAIL** both |

**13 of 20 FAIL.** 9 fail at both viewports, 4 at mobile only. The 7 that pass
are the ones whose identity happens to survive as a field the current model
carries: a dark ground (`sq_deadline_timeline`), a full-bleed width
(`sq_fullscreen_focus`), an auto-fit tile grid — `icon_tiles`, `diagram_tiles`,
`pick_cards` — (`sq_quiz_first`, `sq_incident_scene`, `sq_card_deck`), or a wide
column plus a rail-shaped progress form (`sq_timeline_journey`).
`sq_direct_panel` is the marginal one: it clears the desktop bar by 0.0035, and
its `bold_buttons` answer form plus `bar_percent_chip` progress are the whole of
that margin.

---

## 4. Distance to the source design

Read these **relatively**, not as absolute fidelity scores. Every one carries a
constant framing offset: the implementation's neutral page ground resolves to
white where the reference host is cream, and the implementation adds a
`STEP N OF M` + `Confidential` strip above every card that no reference draws.
Both are the same on all twenty, so the *ranking* is meaningful and the absolute
value is inflated by an unknown constant.

| closest to source | | furthest from source | |
|---|---|---|---|
| `sq_editorial_inline` | 0.0375 | `sq_direct_panel` | **0.1522** |
| `sq_decision_path` | 0.0407 | `sq_case_file_console` | **0.1478** |
| `sq_sixty_second` | 0.0422 | `sq_authority_console` | **0.1081** |
| `sq_guided_conversation` | 0.0430 | `sq_deadline_timeline` | 0.0801 |
| `sq_recovery_soft` | 0.0433 | `sq_insurer_context` | 0.0746 |

Desktop mean 0.0663, range 0.0375–0.1522. Mobile mean 0.0926, range
0.0593–0.2177.

The three furthest are the three whose identity is a **structure the model has
no field for**: `sq_direct_panel`'s dark headline band, `sq_case_file_console`'s
tab row, `sq_authority_console`'s dark header strip. That agrees, from pixels,
with what `docs/quiz-renderer-architecture.md` argued from code.

Two readings, both true and worth stating separately:

1. **No template is a faithful reproduction.** The best (0.0375) is still
   further from its own source than the source's own material-difference bar
   (0.0271) — though how much of that gap is the constant framing offset is not
   separable from these numbers alone.
2. **Nineteen of twenty are closer to a sibling than to their own source**, at
   both viewports. The only exception is `sq_deadline_timeline`, and only
   because it is the one template that grounds dark. The framing caveat applies
   in the same direction, and the margins are wide enough that it would take an
   implausibly large offset to reverse: `sq_recovery_soft` is 0.0182 from
   `sq_authority_console` and 0.0433 from its own design.

---

## 5. What the numbers say about the mechanism

**Width is doing most of the differentiating, and width is the axis a phone
removes.** The four axes `QuizTemplate` declares are width, progress form,
answer form and icon policy. Icon policy is inert — there is no icon field on a
quiz answer anywhere in the model, so `withIcon` is false for every answer of
every template, which `templates.tsx` says outright. Answer form is real but
ten of the twenty land in the same default branch of `answerLayout`. Progress
form is real and reaches perhaps 40px of vertical space. That leaves width. At
1280px the declared widths span 440–900px and separate the library into 12
groups; at 390px every template clamps to the same screen and the count falls to
8.

**Selection is where the library works.** Desktop selected: 17 groups, 3 pairs
under the bar — better than the reference's own 10. The nineteen answer forms
resolve their selected state differently and it shows. Any repair should keep
that and stop relying on it to carry the resting state, which is what an
operator picks from.

**The lead form is the least differentiated screen in the product.** 13 groups
at desktop, 5 at mobile, a sixteen-template chain. Every template draws the same
five stacked inputs in the same column, and the only things left are the
progress widget and the card width.

---

## 6. Two defects found while measuring

Neither is the subject of this document; both were visible in the artefacts and
are recorded so they are not rediscovered.

**A. A brandless quiz loses its primary on every input and button.** `QuizCard`
reads `brand.colors.primary` raw in more than a dozen places — input, textarea
and dropdown borders, the submit-button fill, the back-button border, the
endpoint medallion and its button, the routing-node spinner — rather than
reading the resolved palette that every other colour on the card goes through.
Under
`PREVIEW_BRAND_DEFAULT`, whose `colors` is `{}` on purpose, that interpolates to
the string `undefined55`, the declaration is invalid, and Chromium falls back to
its own `2px inset` input chrome and a transparent disabled submit button. See
`artifacts/quiz-fidelity/png/*.desktop.form.png`. `NEUTRAL_QUIZ_FALLBACK.primary`
(`#232a34`) exists for exactly this and is bypassed. It affects the form and
endpoint states only; the initial and selected states are palette-derived
throughout and are unaffected — so the gated numbers above are not measured
under it, and the lead-form numbers are.

**B. A generic header strip is drawn above all twenty.** `renderHeader` draws
`STEP N OF M` and a `Confidential` pill on every template, identical in all
twenty, immediately above whichever of the twenty progress forms the template
chose. It is the same class of homogeniser as the duplicate progress bar Stage A
removed, and it is now the largest single element all twenty share. No reference
draws a strip common to all twenty — each states its progress in its own words
and its own place, which is the point of having twenty progress forms.

---

## 7. What this does not measure

- **One brand.** Everything here is the neutral fallback palette. A branded
  render could differentiate more (a brand-driven dark ground) or less. Colour
  collision under thirteen brand fixtures is `pnpm sweep:templates`'s question,
  not this one.
- **One flow.** One fixture, one question type (`button_grid`), one form. A quiz
  whose steps are dropdowns and smart-dates would exercise different card
  branches.
- **Three states of twenty-four.** `quizzes/Standalone-Quiz-States.html`
  specifies twenty-four states each template must express. Three are measured.
- **Reference states.** References are captured at the initial state only, so
  `vs ref` is an initial-state number and the selected/form comparisons have no
  reference counterpart.
- **Motion, focus, hover, and error states.** Transitions are frozen by design.
- **Whether a human can tell them apart.** RMSE over a luminance grid is a proxy.
  It agreed with the eye on every pair spot-checked while building this, and the
  PNGs are on disk precisely so the proxy can be argued with.
