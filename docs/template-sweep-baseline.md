# Template colour sweep — baseline, 2026-08-12

`pnpm sweep:templates` renders every registered template against all thirteen
brand fixtures and reports every colour pairing that collides. This file records
what it found on the day it was written, so a later run can be compared against
something rather than read in isolation.

**Nothing in this record is fixed. Recording it is the deliverable.** The gate
was written before the templates it gates on purpose: it exists so that "is this
done" stops being a question a person answers by looking at a screen with one
brand open.

```bash
pnpm sweep:templates                    # full run, full listing
pnpm sweep:templates -- --summary       # rollups only
pnpm sweep:templates -- --fixture=pureWhite
pnpm sweep:templates -- --only=quiz     # or lp-identity / lp-ported / any id substring
pnpm sweep:templates -- --json
```

Exit codes: `0` clean, `1` something was found, `2` nothing was checked (an empty
registry, or an unknown fixture name). An empty registry never reports success.

## What is registered

36 templates, in three families:

| Family | Count | Source | Pairs audited |
|---|---|---|---|
| `lp-identity` | 4 | `src/lib/lp-identities/index.ts`, resolved through `deriveSurface` at each of the five section tones | body / muted / accent-as-text / on-filled-accent / card text / card muted / the three logo paths |
| `quiz` | 20 | `src/lib/quiz-templates/model.ts`, resolved through `quizTheme` | page text, card text, accent, filled progress segment, on-filled-accent, answer-row text |
| `lp-ported` | 12 | `src/lib/lp-templates/index.ts`, recoloured by `templateVars` | the two ends of the luminance ladder |

The brief that produced this sweep described the registry as "4 LP identities, 6
quiz skins". The six quiz skins were replaced by the twenty in
`quiz-templates/model.ts`; the old ids still resolve through
`LEGACY_TEMPLATE_IDS`, so nothing was lost, but the count is 20. The twelve
ported templates were not in the brief and are included because they are what
actually renders a landing page today.

## Baseline

```
36 templates × 13 fixtures
200 template violations
 27 fixture assertion failures
 24 dead brand variables
  0 import-boundary breaches
```

**Every one of the 200 violations is a `ui`-kind pair held to 3:1. Not a single
text pair (4.5:1) fails, on any of the thirteen fixtures, on any of the thirty-six
templates.** That is the load-bearing result: the derive-and-verify layer in
`surface.ts` and `resolve-tokens.ts` holds against brands built specifically to
break it. What fails is every place a brand colour is drawn *without* going
through it.

## Finding classes

### F-S1 · The logo is drawn in unlifted brand colours (142)

`markColors` (`src/lib/lp-nodes/palette.ts:159`) remaps a mark's paths by the
role each played in the identity and hands them back without checking either
against the ground the mark lands on. `ElementNode.tsx:527` draws them there.
Every other colour on the page is lifted until it reads; the mark is not.

Worst case `#FFFFFF` on `#FFFFFF` at 1.00:1 (`unverifiedInk`, identity A). Fires
on 10 of the 13 fixtures.

There is a second, separable half. `role()` matches a mark colour against the
identity's named slots and carries anything unrecognised through unchanged — and
the *dark* variants (`fillDark`, `strokeDark`, `fill2Dark`) of identities B and C
hold lifted values that appear in none of those slots. So on any dark ground,
identity B draws `#A9C4E4` and `#6FBF93`, and identity C draws `#7FA391` and
`#F7EFE5`, whatever brand the page is deployed under. That is the identity's own
palette surviving the remap, which is the exact failure the palette-ownership
rewrite was meant to end.

### F-S2 · A filled progress segment is not checked against the card (57)

`forms/progress.tsx:52,81` fills bars, segments, dots and diamonds with
`surface.accentFill`, which is the brand primary (or its dark remap) taken as-is.
`surface.accent` — the same colour lifted until it reads — sits right beside it
and is used for text only. A filled bar is a graphical object under WCAG 1.4.11
and needs the same 3:1 a border does.

Worst case `#FFFF00` on `#f6f6f6` at 1.01:1 (`neonOnWhite`). Fires on the three
fixtures whose primary sits at the top of the luminance range.

### F-S3 · An accent lifted against the card is used on the row (1)

`forms/answers.tsx:124` sets the "Recorded" stamp in `surface.accent` on a row
whose background is `surface.card`. `accent` was verified against `surface.bg`,
which is a different ground. One occurrence, and only because the lift had
already fallen back to `surface.text`: `#0b1220` on `#850085` at 2.08:1
(`saturationExtremes`, SQ-07).

### F-S4 · `none` borrows a hue it was never given (25 assertions)

A brand with nothing authored must resolve true neutral. It does through
`resolveBrandTokens` — every one of its eleven identity colours comes back
achromatic — and then picks up hue again downstream, from two places:

* `SAFE_DARK = '#0b1220'` in `color-system.ts:95` is a navy, not a neutral. It
  reaches the page as `onAccentFill` on every dark, brand and inverse ground.
* The unremapped dark mark variants from F-S1: `#6FBF93`, `#A9C4E4`, `#7FA391`,
  `#F7EFE5`.

A brandless page is supposed to look unset, because unset is findable and a
plausible wrong colour is not.

### F-S5 · An unparseable shape token reaches the CSS as `NaNpx` (2 assertions)

`resolve-tokens.ts:241` reads `radius` with `Number(...)` and writes the result
into `--site-radius` without checking it. A brand that authored `8px` rather than
`8` — which is what the field's own hint invites, since it says "in pixels" —
produces `--site-radius:NaNpx` and `--site-radius-lg:NaNpx`. Colour tokens are
validated; shape tokens are not.

### F-S6 · The brand's primary never reaches a ported template (24 dead vars)

`templateVars` (`lp-templates/tokens.ts:57`) sets `--lp-accent` and
`--lp-accent-dark` on every ported template's wrapper. No ported template's
markup reads either one — the string `lp-accent` does not appear in any of the
twelve generated modules. Those twelve are what renders a landing page today, so
a deployed page currently carries none of its brand's accent colour at all; it
renders entirely in the luminance ladder mixed between the brand's ink and its
page.

Not a contrast violation, which is why the sweep reports it separately. It is the
same failure wearing different clothes: a brand that does not appear on its own
page.

### F-S7 · The quiz builder audits a pairing nothing draws (not counted)

`auditQuizTemplateColors` (`src/components/builder/quiz/templates.tsx:175`)
reports on `brand.colors.primary` used raw as a step badge and on
`onPrimaryText(primary)` as selected-answer text. Neither has been drawn since
the twenty data-driven templates replaced the six hand-written ones — the
renderers use `surface.accent` and `surface.onAccentFill`. The audit is stale, so
an operator can be shown a contrast warning about a colour that is not on their
screen.

Found by building the sweep, not by running it: modelling this audit's pairs
produced 101 violations that no renderer can cause. The sweep models the
renderers instead.

## What this sweep does not cover

* `src/components/blocks/BlockRenderer.tsx` and `bespoke-css.ts` — site page
  blocks, whose pairings are not declared as data anywhere the sweep can read.
* Ported-template mid-rungs. Only the two ends of the ladder are audited; the mid
  rungs carry no declared role, so pairing two of them would report on something
  the markup may never place together.
* Hairlines and dividers. Held to perceptibility by design (`HAIRLINE_MIN`), not
  to the 3:1 `auditColorPairs` would demand of them.
* Anything an operator sets by hand through `applySectionColors`. That is a
  deliberate free choice the builder warns about live.
