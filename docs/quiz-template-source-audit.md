# Quiz template source audit — what the supplied design artifacts actually contain

**Status:** source archaeology only. This document is built **exclusively** from the supplied
design artifacts in `quizzes/` and `review/`. It deliberately does **not** read
`src/lib/quiz-templates/model.ts` or any other implementation file — treating the
implementation as evidence of its own intent is what makes a fidelity audit circular.

The three right-hand columns of the per-design table (**current LegalOS template ID**,
**current renderer**, **fidelity PASS/FAIL**) are intentionally left **empty**. A later agent
fills them by comparing the implementation against the rows below.

---

## 1. Method — why a plain grep finds nothing

Every file in `quizzes/` and `review/` is a **self-extracting bundled page**: a small loader
plus a `script[type="__bundler/manifest"]` holding every asset base64-encoded and gzipped, and a
`script[type="__bundler/template"]` holding the real document. Nothing readable survives a grep
of the raw file.

```
grep "PRESENTATION MODES" quizzes/Standalone-Quiz-States.html   # → no match
```

The string is right there once the page is unpacked. Everything below was produced with:

```
node scripts/unbundle-design-artifact.mjs <bundled.html> <outDir>
```

which writes `<outDir>/index.html` (the real document), `<outDir>/assets/*` and a
`manifest.json`. All 43 supplied artifacts were unbundled and read.

**Any future claim about these designs must cite the unbundled document, not the bundled file.**

---

## 2. Provenance — what was actually supplied, and in how many generations

`docs/LegalOS Quiz Templates.zip` unzips to `export/quizzes/*` — byte-for-byte the same 23 files
as the repo's `quizzes/` directory. `docs/LegalOS Landing Page Templates.zip` unzips to
`export/review/*` — the same 20 files as `review/`. So both directories **are** the supplied
source; neither is a derived artifact.

But they are **two different generations**, and this is the single most important provenance fact
in this document.

| | `review/` (LP zip, 2026-08-06 10:21) | `quizzes/` (Quiz zip, 2026-08-06 12:51) |
|---|---|---|
| Landing-page templates | 12 (LP01–LP12), full pages | — |
| Standalone quiz templates | **16**, catalog entries only | **20**, full interactive preview pages |
| Quiz slugs | `sq_icon_grid`, `sq_conversational_chat`, `sq_case_estimator`, … | `sq_editorial_inline`, `sq_recovery_soft`, … |
| Per-template preview page | **none** — every card's `href` is `"#"` | yes — `Standalone-Quiz-01..20-*.html` |

Both directories contain files named `Standalone-Quiz-Library.html` and
`Standalone-Quiz-States.html`, and **they are not the same document**. After normalising the
re-bundling UUID churn, the real content differences are decisive:

`review/Standalone-Quiz-States.html`:
> All 24 states apply to landing-page quizzes and standalone quizzes alike; each of the **16**
> standalone templates must express every state in its own container.

`quizzes/Standalone-Quiz-States.html`:
> All 24 states apply to landing-page quizzes and standalone quizzes alike; each of the **20**
> standalone templates must express every state in its own container.

`review/index.html` describes its own delivery as *"12 landing-page templates, **16** standalone
quiz templates, states, embed lab, and engineering handoff."*

`review/Engineering-Handoff.html` likewise says *"Twelve landing-page templates and **sixteen**
standalone quiz templates"* and heads its section *"6 · Standalone quiz templates (16)"*.

**Conclusion.** `review/` is the earlier delivery. Its 16-template standalone quiz set is a
**superseded concept list** — different names, no preview pages, and only 3 slugs
(`sq_fullscreen_focus`, `sq_card_deck`, `sq_decision_path`) survive by name into the final set.
**The authoritative standalone quiz source is `quizzes/` — the 20 designs.** The 16-template
material is recorded in §8 because it carries per-template *mobile* and *modal* specifications
that the 20-template delivery never restates, but it must not be audited against as the target.

---

## 3. The pivotal question — CONFIRMED: two different axes

The brief asked whether the "8 presentation modes" are the same thing as the 20 standalone quiz
designs. **They are not.** They are orthogonal axes, and the source says so in its own words.

`review/Quiz-States.html`, the header of the page that contains the 8-mode grid:

> **Quiz presentation system**
> One QuizRuntime, **eight presentation shells**. The shell styles only the frame around the
> quiz — question logic, branching, lead delivery and destinations stay in the quiz deployment.

`quizzes/Standalone-Quiz-States.html`, describing the other axis and linking across to the first:

> All 24 states apply to landing-page quizzes and standalone quizzes alike; each of the 20
> standalone templates must express every state in its own container. … **Presentation modes per
> landing page live in LP quiz modes.**

So:

- **Axis A — LP presentation modes.** How a quiz is *embedded in a landing page*. A shell around
  a shared runtime. Documented in `review/Quiz-States.html` and `review/Engineering-Handoff.html`.
  See §4.
- **Axis B — standalone quiz designs.** Complete quiz *pages* for deployment without a landing
  page. Twenty of them, each a full interactive preview. See §6.

The two axes overlap in provenance but not in artifact: twelve of the twenty standalone designs
carry a `FROM LPnn` badge, e.g. from `quizzes/Standalone-Quiz-01-Editorial.html`:

```html
<span style="…">SQ-01 /</span>
<span style="…">sq_editorial_inline</span>
<span style="…background:rgba(14,165,233,.12);color:#0EA5E9;…">FROM LP01 · EDITORIAL INVESTIGATION</span>
```

and the remaining eight carry:

```html
<span style="…background:rgba(167,139,250,.14);color:#A78BFA;…">STANDALONE-ONLY DESIGN</span>
```

**A standalone design derived from an LP is still a distinct artifact from that LP's embed mode.**
`sq_quiz_first` (SQ-06) is a self-contained page with logo, intro, contact, consent and completion
steps; `quiz_first`'s LP mode is a full-width panel inside `LP06-Quiz-First.html`. Conflating them
loses eight designs that have no LP at all and misses that the twelve derived ones carry an entire
page shell the LP mode does not.

---

## 4. Axis A — the definitive list of LP presentation modes

### 4.1 The "8 presentation modes" grid

From `review/Quiz-States.html` (unbundled), line 586:

```html
<div style="…">8 PRESENTATION MODES · FULL DESIGNS LIVE ON EACH TEMPLATE</div>
```

The grid holds exactly 8 cards, each linking to an LP. All eight, with the mode name and the id
printed beneath it:

| # | Mode name | id printed in the card | Links to |
|---|---|---|---|
| 1 | Floating side card | `authority_network` | `LP03-Authority-Network.html` |
| 2 | Centered hero card | `human_recovery_story` | `LP02-Human-Recovery-Story.html` |
| 3 | Full-width quiz panel | `quiz_first` | `LP06-Quiz-First.html` |
| 4 | Inline editorial quiz | `editorial_investigation_v2` | `LP01-Editorial-Investigation.html` |
| 5 | Estimator-style module | `case_value_dossier · completeness rail, non-valuation disclaimer` | `LP04-Case-Value-Dossier.html` |
| 6 | Compact short-form quiz | `sixty_second_check` | `LP09-60-Second-Check.html` |
| 7 | Conversational card | `answer_first` | `LP10-Answer-First.html` |
| 8 | **Quiz strip under comparison** | `insurer_vs_claimant · also: split panel (split_screen_direct), inline rail (deadline_signal)` | `LP08-Insurer-vs-Claimant.html` |

**The 8th mode — previously missing — is "Quiz strip under comparison" (`insurer_vs_claimant`,
LP08).** Its subtitle names **two further modes inline** rather than giving them their own cards:

```html
<div style="…">insurer_vs_claimant · also: split panel (split_screen_direct), inline rail (deadline_signal)</div>
```

So the grid's "8" is a **curated display count, not the mode count**. Ten modes are named on that
page, and LP11 (`case_type_router`) and LP12 (`network_authority`) appear in the grid not at all.

### 4.2 The complete 12-row placement matrix — the real answer

`review/Engineering-Handoff.html` carries a per-template table with a `QUIZ PLACEMENT` column
covering all twelve LPs. This, not the 8-card grid, is the definitive list.

| LP | Template id | Length | Quiz placement (verbatim) | Quiz composition (verbatim, from §5 of the handoff / the LP page header) |
|---|---|---|---|---|
| LP01 | `editorial_investigation_v2` | Long | Inline, after article lead | `QUIZ: INLINE EDITORIAL`; order is `… lead → quiz → explanation …` |
| LP02 | `human_recovery_story` | Long | Overlap card beneath full-width story visual | `QUIZ: HERO CARD` |
| LP03 | `authority_network` | Long | Assessment console beneath centered hero | `QUIZ: ASSESSMENT CONSOLE`; "quiz lives in a structured assessment console (rail + panel) beneath the hero" |
| LP04 | `case_value_dossier` | Long | Central estimator, top | `QUIZ: ESTIMATOR MODULE`; "estimator shell + completeness rail; non-valuation disclaimer is REQUIRED and non-removable" |
| LP05 | `split_screen_direct` | Medium | Right hero panel / stacks below | `QUIZ: SPLIT HERO PANEL`; "50/50 panels; left dark (brand-grounded), right quizBackground; **stacks copy-then-quiz ≤900px**"; "reading order = copy before quiz in DOM" |
| LP06 | `quiz_first` | Medium | Centered full-width hero | `QUIZ: FULL-WIDTH HERO PANEL`; annotated in-page as `quiz mode: full_width_panel — dominant, above the fold on 360×640`; "oversized centered quiz card is the page" |
| LP07 | `deadline_signal` | Medium | Inline, under timeline rail | `QUIZ: INLINE BELOW TIMELINE`; "4-stage timeline rail (system warning colors, never brand-recolored); dark inline quiz with segmented progress" |
| LP08 | `insurer_vs_claimant` | Medium | Full-width strip after comparison | `QUIZ: FULL-WIDTH STRIP`; "horizontal quiz strip (question left / answers right, **stacks on mobile**)" |
| LP09 | `sixty_second_check` | Short | Centered under headline | `QUIZ: COMPACT CENTERED`; "Buttons: largest in library (58px)" |
| LP10 | `answer_first` | Short | Conversational card, opening | `QUIZ: CONVERSATIONAL CARD`; "bubble prompt + reply-chip quiz"; "Radius: asymmetric bubbles 4/16px" |
| LP11 | `case_type_router` | Medium | Pre-filled 2×2 card beside dynamic playbook | `QUIZ: ROUTER PRE-FILLED CARD`; "selection repaints the playbook copy and **pre-fills quiz Q1**"; "router is presentation + pre-fill ONLY — never mutates decision-tree logic, qualification, routing, or answer values"; "**Mobile:** cards 2-col ≤760px, playbook stacks above quiz" |
| LP12 | `network_authority` | Long | Sticky rail card, roman-numeral rows | `QUIZ: NETWORK RAIL CARD`; "sticky right rail card, roman-numeral rows — **static on mobile**" |

**Note on the LP pages themselves:** the quiz inside each `LPnn-*.html` is a **static single-question
mock**, not an interactive flow. `review/LP06-Quiz-First.html` contains zero `sc-for` loops and no
`{{opts}}` binding; it renders one hardcoded question ("How Were You Injured?") with a
`Continue →` button. The interactive behaviour lives only in the twenty standalone files.

### 4.3 The 9 core states that apply to every LP mode

From `review/Quiz-States.html`, section `CORE STATES · APPLY TO EVERY MODE`:

`01 · INITIAL QUESTION` (default) · `02 · SELECTED + BACK / CONTINUE` (quizSelected) ·
`03 · PROGRESS VARIANTS` (quizProgress) · `04 · LOADING / SUBMITTING` (no layout shift) ·
`05 · VALIDATION ERROR` (errorState) · `06 · LONG ANSWER LABELS` (wraps, never truncates) ·
`07 · MOBILE STACKING · 320px` · `08 · COMPLETION / HANDOFF` (positiveState) ·
`09 · PHONE CTA + TRUST LINE` (optional per deployment)

Colour is specified as semantic roles only, never hex:

> Every color below is a semantic role (`quizBackground · quizSurface · quizText · quizSelected ·
> quizProgress · focusRing`) resolved from the deployed brand; the teal shown here is the neutral
> preview value only.

---

## 5. The shared engine — what is common to all 20 standalone designs

Each `Standalone-Quiz-NN-*.html`, once unbundled, is:

1. a `<script>` in `<head>` defining `window.SQSHARED` — **byte-identical across all twenty**
   (md5 `e5e010f067cfea05975bd2e78239fd33`, 19 331 bytes, verified on all 20);
2. a body of `{{placeholder}}` markup — **the design**, different in every file;
3. a `renderVals()` override block — **the design tokens**, different in every file.

Because the engine is provably identical, **every difference between the twenty files is
presentation**. That is the mechanical basis for the distinctness finding in §6.

### 5.1 The shared question flow

`SQSHARED.FLOW` is a 9-entry array — 6 choice questions, then contact, consent, done:

| idx | id | kind | question |
|---|---|---|---|
| 0 | `accident` | choice | How were you injured? |
| 1 | `injury` | choice | What best describes your injuries? |
| 2 | `treatment` | choice | Did you receive medical treatment? |
| 3 | `timing` | choice | When did the accident happen? |
| 4 | `fault` | choice | Were you at fault for the accident? |
| 5 | `attorney` | choice | Do you already have an attorney? |
| 6 | `contact` | contact | Where should we send your free case review? |
| 7 | `consent` | consent | Review and confirm |
| 8 | `done` | done | — |

### 5.2 The design-token contract

`renderVals()` may override: `r:[sharp,soft,round]` (radius scale), `pads:[compact,standard,wide]`,
`widths:{compact,standard,wide,full}`, `shellBg`, `shellBd`, `shellSh`, `iconSize`, `submitLabel`,
`flow`, `manualNext`, plus three functions — `optStyle(sel,B)` (the **selected-vs-unselected token
function**), `optExtra(o,sel,B)`, and `extra(S,ctx)`.

### 5.3 What the engine does for mobile — and what it does not

This is critical, and narrower than any prose in the artifacts suggests. The entire viewport
behaviour of the standalone set is three lines of `SQSHARED`:

```js
const isMob = set.vp === 'mobile';
const justify = {left:'flex-start',center:'center',right:'flex-end'}[isMob?'center':set.align];
const qw = isMob ? '100%' : widths[set.width];
const frame = set.vp==='desktop' ? {w:'100%',bd:'none',r:'0px',pad:'0px',sh:'none'}
  : {w:set.vp==='tablet'?'768px':'390px', bd:'1px solid rgba(29,36,46,.18)', r:'26px', …};
```

Mobile forces alignment to **center** and the quiz column to **100%**. The 390px `frame` is a
**simulated device bezel for the preview**, not a breakpoint.

**There is not a single responsive media query anywhere in the twenty standalone designs.**
Verified across all 20 unbundled documents: the only `@media` rule present in any of them is

```css
@media (prefers-reduced-motion: reduce){*{transition:none !important;animation:none !important;}}
```

All narrow-width reflow is therefore **intrinsic** — `grid-template-columns:repeat(auto-fit,
minmax(min(100%,NNNpx),1fr))`, `flex-wrap:wrap`, and `min-width:min(100%,NNNpx)`. Where a design
has no such construct, it has **no reflow mechanism at all**.

Consequence for the audit: for the 20 standalone designs, **per-design mobile compositions beyond
"full width, centered" are not determinable from supplied source**. The only per-template mobile
specifications that exist anywhere in the supplied material are in the **superseded** 16-template
handoff table (§8).

---

## 6. Axis B — the real count of distinct standalone designs

### 6.1 Verdict: **20 genuinely distinct compositions.** None is a recolour of another.

Three independent lines of evidence, none of which relies on the catalog's marketing copy:

**(a) The engine is constant, so all variance is design.** Verified byte-identical `SQSHARED`
across all 20 (§5).

**(b) No two share a question-step composition.** The `<sc-if value="{{isChoice}}">` block was
extracted from all 20 and hashed: **20 distinct md5s, zero collisions.** Structural fingerprinting
of the full bodies (tag sequence + layout-shaping CSS properties only, colours and text stripped)
puts the **highest** pairwise Jaccard similarity at **0.702** (SQ-07 vs SQ-08) — and that residue
is the shared outer scaffold (host stage, device frame, contact/consent/done steps), not the design.
No pair approaches the ≥0.95 that a recolour would produce.

**(c) Every design carries a distinct token set.** Each `renderVals` differs in radius scale,
shell treatment, icon size and — decisively — in `optStyle`, the function that defines the
selected state. Three examples of genuinely different selection semantics:

```js
// SQ-01 Editorial — parchment tint, letter badge fills, border unchanged
optStyle:(sel,B)=>sel?{bg:'#F2F0E7',bd:B.primary,ink:'#1D1D1B',ic:B.text}
                    :{bg:'transparent',bd:'#C9C5B8',ink:'#33322C',ic:'#8A8578'}

// SQ-05 Direct Panel — full inversion to brand dark, white ink and icon
optStyle:(sel,B)=>sel?{bg:B.dark,bd:B.dark,ink:'#FFFFFF',ic:'#FFFFFF'}
                    :{bg:'#FFFFFF',bd:'#E3E3E3',ink:'#131313',ic:B.text}

// SQ-07 Deadline — brand-independent by design: dark row flips to solid white
optStyle:(sel)=>sel?{bg:'#FFFFFF',bd:'#FFFFFF',ink:'#1D242E',ic:'#1D242E'}
                   :{bg:'rgba(255,255,255,.04)',bd:'rgba(255,255,255,.18)',ink:'#F2F3F0',ic:'#D7A94B'}
```

**Also distinct at the flow level.** Five designs do not merely restyle the shared flow — they
**redefine it**, which means a port that treats all twenty as pure skins will be wrong five times:

| design | `flow` override | effect |
|---|---|---|
| SQ-09 | `[F0,F1,F3,F5,F6,F7,F8]` | **drops** `treatment` and `fault` → 4 questions, not 6 |
| SQ-14 | `[scene,F1,F3,F4,F5,F6,F7,F8]` | **replaces** Q1 with a new 7-option diagram question **and drops** `treatment` → 5 questions |
| SQ-15 | `[F0,F2,insurer,work,{…F5,short:'Current status'},contact,F7,F8]` | **adds two new questions** (`insurer`, `work`), reorders, relabels for the rail |
| SQ-16 | `[F0,F3,F1,F2,F4,F5,F6,F7,F8]` | **reorders** the shared questions into tab sections |
| SQ-20 | `[evidence,F0,F1,F3,F4,F5,F6,F7,F8]` | **prepends** a new 8-option `kind:'multi'` question with `noneV:'none'` mutual exclusion; **drops** `treatment` |

This directly contradicts the Engineering-Handoff's own rule that *"A skin never changes questions,
answer values, branching, qualification, routing, consent, analytics, completion destinations, call
routing, or webhooks."* See §9.

### 6.2 The catalog spec lines

`quizzes/Standalone-Quiz-Library.html` heads itself `20 TEMPLATES` and describes the split:

> Twenty complete, interactive quiz pages: **twelve adapted from the landing-page templates and
> eight standalone-only designs.**

Each card carries a `WIDTH / PROGRESS / ANSWERS / ICONS / USE` spec block. These are quoted per
design in §7 as *catalog claims*, and checked against markup.

### 6.3 Catalog width lines do not match the source tokens

The catalog `WIDTH` line is **advisory copy, not a derivable spec**. Nine designs declare **no
`widths` override at all** and therefore all render at the identical shared `400/600/820/100%`
ladder — despite the catalog printing five different ranges for them.

| id | name | catalog `WIDTH` | actual `widths` tokens | range == [compact, wide]? |
|---|---|---|---|---|
| SQ-01 | Editorial Inline | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-02 | Recovery Soft | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-03 | Authority Console | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-04 | Case Dossier | 680–880PX | 480/680/880/100% | NO (= [standard, wide]) |
| SQ-05 | Direct Panel | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-06 | Quiz First | **720–900PX** | 400/600/820/100% (**no override**) | NO — cannot render the claimed width |
| SQ-07 | Deadline Timeline | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-08 | Insurer Context | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-09 | Sixty Second | 360–440PX | 400/480/600/100% | NO — 360 and 440 are not tokens |
| SQ-10 | Answer First | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-11 | Case Router | 520–640PX | 400/600/820/100% (**no override**) | NO |
| SQ-12 | Network Vetting | 460–580PX | 460/580/760/100% | NO (= [compact, standard]) |
| SQ-13 | Guided Conversation | 360–560PX | 440/560/700/100% | NO — 360 is the contact-bubble cap, not a token |
| SQ-14 | Incident Scene | 520–820PX | 440/620/820/100% | NO |
| SQ-15 | Timeline Journey | 700–860PX | 520/700/860/100% | NO (= [standard, wide]) |
| SQ-16 | Case File Console | 680–840PX | 520/680/840/100% | NO (= [standard, wide]) |
| SQ-17 | Fullscreen Focus | 440PX–FULL | 440/560/680/100% | **YES** (wide = `full:100%`) |
| SQ-18 | Card Deck | 460–820PX | 460/640/820/100% | **YES** |
| SQ-19 | Decision Path | 480–840PX | 480/660/840/100% | **YES** |
| SQ-20 | Evidence Checklist | 440–760PX | 440/600/760/100% | **YES** |

**Do not treat the catalog width line as the spec.** Where they disagree, the `widths` token in
`renderVals` is what the supplied design actually renders.

---

## 7. Per-design record

Columns 11–13 are for a later agent; leave them empty here.

For every design: **Source dir** is `quizzes/`; **Source file** is the repo path; the unbundled
document is `<outDir>/index.html`. All designs share the outer scaffold described in §5.3 —
host stage → simulated device frame → `justify-content:{{justify}}` → `width:{{qw}}` column →
logo → intro → shell → phone CTA → privacy line. Only **within-shell** composition is recorded
below, plus any design that breaks that scaffold (noted explicitly).

Two facts hold for **19 of 20** and are not repeated in each row:

- **No Next/Continue button on the question step.** Only SQ-18 sets `manualNext:true`; every other
  design relies on the engine's auto-advance, `setTimeout(… i+1 …, 290)`. Confirmed by placeholder
  inventory: `{{nextGo}}`/`{{nextBg}}`/`{{nextIc}}` appear **only** in
  `Standalone-Quiz-18-Card-Deck.html`.
- **No `@media` responsive rule.** See §5.3.

### 7.1 Master table

| # | Source name / slug | Source file (`quizzes/`) | Origin | Progress style | Answer layout | Selected state | Nav on question step | Current LegalOS template ID | Current renderer | Fidelity PASS/FAIL |
|---|---|---|---|---|---|---|---|---|---|---|
| SQ-01 | Editorial Inline · `sq_editorial_inline` | `Standalone-Quiz-01-Editorial.html` | FROM LP01 | 3px **square** rule + serif counter | Lettered hairline rows, **no gap**, `border-bottom` separators | Parchment `#F2F0E7` fill; letter badge fills brand; **border unchanged** | Back + italic hint "Select an answer to continue" | | | |
| SQ-02 | Recovery Soft · `sq_recovery_soft` | `Standalone-Quiz-02-Human-Recovery.html` | FROM LP02 | 6px **pill** bar + "One step at a time" | Soft rounded rows, 36px circular icon chip, trailing radio | `B.soft` fill, `B.primary` border, chip fills brand, icon → `B.on` | Back + reassurance microcopy | | | |
| SQ-03 | Authority Console · `sq_authority_console` | `Standalone-Quiz-03-Authority-Assessment.html` | FROM LP03 | **8 segmented 4px blocks** + `STEP NN / NN`; renders on *all* steps | Squared rows, **leading square check marker** | `B.soft` fill, brand border, marker fills revealing check | Back + "Licensed · vetted · monitored" | | | |
| SQ-04 | Case Dossier · `sq_case_dossier` | `Standalone-Quiz-04-Case-Dossier.html` | FROM LP04 | **Left factor rail** — 8 rows, each echoing its recorded answer | Document rows, `min-height:46px`, trailing `RECORDED` mono stamp | `B.soft` fill + stamp appears + rail row checks and echoes answer | "← Previous factor" only | | | |
| SQ-05 | Direct Panel · `sq_direct_panel` | `Standalone-Quiz-05-Split-Direct.html` | FROM LP05 | **8px pill bar + % chip**, on a `{{brDark}}` band **inside** the shell; all steps | Bold full-width buttons, **2px borders**, trailing chevron `›` | **Full inversion** to `B.dark`, white ink/icon/chevron | Back, **centered** | | | |
| SQ-06 | Quiz First · `sq_quiz_first` | `Standalone-Quiz-06-Quiz-First.html` | FROM LP06 | 8px pill bar + "N% complete" | **Vertical icon tiles**, `auto-fit minmax(min(100%,158px))`, `min-height:116px`, `iconSize:30` | Full inversion to `B.dark`, white label + icon | Back, centered | | | |
| SQ-07 | Deadline Timeline · `sq_deadline_timeline` | `Standalone-Quiz-07-Deadline-Timeline.html` | FROM LP07 | **Horizontal node rail** ending in a **dashed amber** deadline node; all steps | Dark translucent rows on a `#20262F` shell | **Brand-independent**: translucent dark → **solid white** row, near-black ink | Back + `{{pctLabel}} COMPLETE` | | | |
| SQ-08 | Insurer Context · `sq_insurer_context` | `Standalone-Quiz-08-Insurer-Comparison.html` | FROM LP08 | Caps eyebrow + 4px bar (question step only) | **Left-accent rows** (`border-left:4px solid {{o.lft}}`) | `B.soft` fill + **left rail flips** `#E4E4E1` → `B.primary` | Back + "Independent · not an insurance company" | | | |
| SQ-09 | Sixty Second · `sq_sixty_second` | `Standalone-Quiz-09-Sixty-Second.html` | FROM LP09 | **Dot sequence** (6 dots) | **Wrapped pill chips**, `border-radius:999px` (ignores `qrIn`) | Chip fills solid `B.dark`, white label + icon | Back, centered | | | |
| SQ-10 | Answer First · `sq_answer_first` | `Standalone-Quiz-10-Answer-First.html` | FROM LP10 | Mono answered-count + **14×3px ticks**; all steps | 2-up `auto-fit minmax(min(100%,190px))` rows inside an accent card | `B.soft` fill, brand border; durable signal is the **collapsed history row** | "← Change my last answer" | | | |
| SQ-11 | Case Router · `sq_case_router` | `Standalone-Quiz-11-Case-Type-Router.html` | FROM LP11 | 5px bar **+ route breadcrumb** with `→` separators and a dashed current chip | Router tiles, `auto-fit minmax(min(100%,180px))`, 38px icon chip, mono `ROUTE →` tag | `B.soft` fill, chip → `B.primary`, icon → `B.on`, tag darkens | "← Back one step" | | | |
| SQ-12 | Network Vetting · `sq_network_vetting` | `Standalone-Quiz-12-Network-Authority.html` | FROM LP12 | **Zero-padded mono counter** `QUESTION 01 — 06` + **3px hairline filled `brDark`** | Thin 1px rows, `min-height:46px`, trailing **radio dot** | Quiet `#F4F4EE` fill, border → `B.dark`, radio fills brand | Back (in a `space-between` row with a single child) | | | |
| SQ-13 | Guided Conversation · `sq_guided_conversation` | `Standalone-Quiz-13-Guided-Conversation.html` | **STANDALONE-ONLY** | **None** except a mono counter in the chat header | **Right-aligned reply pills**, `border-radius:16px 4px 16px 16px` matching the user bubble | Full inversion to `B.dark` — the pill becomes the message it will send | "← Edit previous reply" | | | |
| SQ-14 | Incident Scene · `sq_incident_scene` | `Standalone-Quiz-14-Incident-Scene.html` | **STANDALONE-ONLY** | **22×4px segment ticks**, 3-state (done/current/pending); all steps | **Diagram tiles**, `auto-fit minmax(min(100%,136px))`, 52px pad, `iconSize:32` | `B.soft` tile tint + **52px pad fills brand, diagram inverts to `B.on`** | Back + "Simplified diagrams — closest match is fine" | | | |
| SQ-15 | Timeline Journey · `sq_timeline_journey` | `Standalone-Quiz-15-Timeline-Journey.html` | **STANDALONE-ONLY** | **Vertical milestone rail** (left column), 14px dots + 2px connectors, each node echoing its answer | Rows inside the white node card, no trailing marker | `B.soft` fill + rail dot fills brand with a white check and writes the label | "← Previous point", **outside** the card | | | |
| SQ-16 | Case File Console · `sq_case_file_console` | `Standalone-Quiz-16-Case-File-Console.html` | **STANDALONE-ONLY** | **4 tab states** (INCIDENT/MEDICAL/LEGAL/CONTACT) + status chip; **no bar** | Document rows, `min-height:46px`, trailing `● ON FILE` mono text marker | `B.soft` fill, brand border, `● ON FILE` appears | "← Previous field" | | | |
| SQ-17 | Fullscreen Focus · `sq_fullscreen_focus` | `Standalone-Quiz-17-Fullscreen-Focus.html` | **STANDALONE-ONLY** | **Full-bleed 5px edge bar** + `ONE QUESTION AT A TIME · STEP N OF 9` | **Oversized lettered buttons**: 30px letter cap + icon + 17px/700 label, `min-height:64px`, 2px border | Full inversion to `B.dark`; letter cap → translucent white chip | Back, centered | | | |
| SQ-18 | Card Deck · `sq_card_deck` | `Standalone-Quiz-18-Card-Deck.html` | **STANDALONE-ONLY** | `CARD n OF 8` + **8 rotated-45° diamond ticks** | **Pick-cards**, `auto-fit minmax(min(100%,158px))`, 54px circular medallion, `min-height:150px` | **Background unchanged (white)**; border, medallion, shadow, `translateY(-3px)` lift, `TAP TO PICK`→`✓ PICKED` | **Previous / Next pills — the only design with a real Next** | | | |
| SQ-19 | Decision Path · `sq_decision_path` | `Standalone-Quiz-19-Decision-Path.html` | **STANDALONE-ONLY** | **Horizontal path nodes**; future nodes **literally unlabelled**; active node grows 14→18px with a 4px halo; decorative branch stubs | 2-up `auto-fit minmax(min(100%,200px))` rows + trailing radio dot | `B.soft` fill, brand border, radio fills brand | "← Step back" + "Progress only — no hidden scoring shown" | | | |
| SQ-20 | Evidence Checklist · `sq_evidence_checklist` | `Standalone-Quiz-20-Evidence-Checklist.html` | **STANDALONE-ONLY** | Mono step label + **brand-tinted `N selected` chip** (multi step only); no bar | Checkbox + 32px icon tray + label rows; **the only `kind:'multi'` step in the set** | 5 channels: fill, border, ink, **tray fills brand + glyph → `B.on`**, checkbox fills revealing a check | **`Continue with N item(s) →` confirm** on the multi step; Back only elsewhere | | | |

### 7.2 Fields not in the master table

**Intended desktop composition.** All twenty use the §5.3 scaffold. Deviations:

- **SQ-04** is the only *LP-derived* design with an in-shell split: `display:flex;flex-wrap:wrap` with a
  `flex:1 1 218px;min-width:min(100%,218px)` factor rail beside a `flex:2.1 1 320px` question pane,
  plus a file header (`CASE FILE · NO. SMP-4187`) and a non-removable compliance strip.
- **SQ-15** is the other split: `display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start` with a
  `flex:1 1 190px;min-width:min(100%,190px)` rail and a `flex:2.2 1 300px` question column.
  **Verified side-by-side in markup**, as the catalog claims.
- **SQ-05** moves the headline and progress **inside** the shell onto a `{{brDark}}` band.
- **SQ-03**, **SQ-07**, **SQ-13**, **SQ-16** are banded shells (`overflow:hidden` + a header strip):
  a `#232A34` console header, an amber urgency strip, a white chat header, and a dark titlebar +
  scrolling tab strip respectively.
- **SQ-17 has no shell at all.** It is the only design of the twenty with **no `{{shellBg}}`,
  `{{shellBd}}`, `{{shellSh}}`, `{{qr}}` or `{{pad}}` anywhere**; content is centred vertically in
  the viewport via `flex:1` + `justify-content:center`, on the bare host canvas.

**Intended mobile composition.** For all twenty: **no mobile-specific rule exists in any file**
(§5.3). Recorded per design only as the *intrinsic* mechanism that would reflow it:

| design | intrinsic reflow mechanism | note |
|---|---|---|
| SQ-01 | none in the option list | contact inputs are the **only ones of the twenty lacking `min-width:0`** inside a `1fr 1fr` grid |
| SQ-02, SQ-03, SQ-05, SQ-07, SQ-08, SQ-12, SQ-15, SQ-16, SQ-20 | single-column flex option lists | SQ-12 has **no `min()`/`minmax()` anywhere** |
| SQ-04, SQ-15 | `flex-wrap:wrap` + `min-width:min(100%,Npx)` stacks the rail above the pane | the only true split-collapse in the set |
| SQ-06, SQ-10, SQ-11, SQ-14, SQ-18, SQ-19 | `auto-fit minmax(min(100%,Npx),1fr)` grids collapse to one column | SQ-14's 136px floor is the most aggressive |
| SQ-09, SQ-13 | `flex-wrap:wrap` pill rows | |
| SQ-16, SQ-19 | `overflow-x:auto` on the tab strip / node rail | scroll rather than wrap |
| SQ-17 | `clamp(26px,4vw,36px)` type and **16px inputs** (iOS no-zoom threshold) | the only design at that threshold |

Shared weakness: **SQ-16, SQ-17, SQ-18, SQ-19 and SQ-20 all hardcode `grid-template-columns:1fr 1fr`
(or fixed flex pairs) on the contact step with no `auto-fit`**, so the lead form stays two-up at 390px.

**Question placement.** `<h2>` inside the shell in 19 of 20, sizes 17–24px, split between
`'Source Serif 4'` (SQ-01, SQ-02, SQ-11, SQ-12 — all LP-derived) and `'Archivo'` 700/800 (the rest).
Two outliers: **SQ-17** at `clamp(26px,4vw,36px)` — the largest in the set, and the only heading
bound to `{{hostInk}}`; and **SQ-13**, where the question is **not a heading at all** but
`<p><strong>{{q}}</strong></p>` inside an assistant bubble — an a11y gap relative to all nineteen
siblings.

**Lead/form treatment.** Contact is a `1fr 1fr` grid in 14 of 20. Deviations: **SQ-09** (weighted
flex rows, `flex:1.4` phone / `flex:1` ZIP), **SQ-13** (icon-prefixed pill fields inside a
user-side bubble — the only design using the shared `{{fUser}}/{{fPhone}}/{{fMail}}/{{fZip}}`),
**SQ-16** (mono-labelled inline record rows, 52px fixed label column), **SQ-17** (flex rows,
2px borders, 16px text). Inputs are **underlined** only in **SQ-01**; boxed everywhere else.

**Consent treatment.** Verified by placeholder inventory (`grep -c '{{s\.v}}'` across the twenty
bodies): **14 designs render summary values; 6 omit `{{summary}}` entirely.** A port that assumes a
summary block always exists is wrong six times, and wrong in shape a seventh:

| design | what replaces the summary |
|---|---|
| SQ-04 | omitted — the left factor rail already echoes every answer |
| SQ-10 | omitted — the persistent collapsed history rows carry it |
| SQ-13 | omitted — the chat transcript carries it |
| SQ-15 | omitted — the rail's per-node answers carry it |
| SQ-17 | omitted entirely; hardcoded headline `One last tap.` |
| SQ-18 | omitted entirely; hardcoded headline `Last card: your go-ahead` |
| SQ-09 | **present but reshaped** — renders `{{s.v}}` as value-only pill chips with `{{s.k}}` discarded; heading hardcoded `One tap to finish` |

Of the 13 that render a true key/value table, the container differs per design: hairline rows with no
box (SQ-01, SQ-12), a bordered box (SQ-08, SQ-11, SQ-20), a tinted panel (SQ-05, SQ-14, SQ-19), a
contained card (SQ-02), and a mono-captioned record table (SQ-03 `RECORDED RESPONSES`, SQ-16).

TCPA sits **below the submit** in every design. Checkbox shape is a per-design signature: hard square
(SQ-01 20px, SQ-03 19px, SQ-12 19px **with no `border-radius` at all**, SQ-16 18px), rounded square
(most), and **a circle in SQ-19** (`border-radius:50%`) — which reads as a radio button rather than
a checkbox.

**Unique visual characteristics** are recorded inline in the master table and in §7.3.

### 7.3 Defects and contradictions found *inside* the supplied source

These are properties of the supplied designs, not of any implementation.

1. **SQ-11 references an undefined placeholder.** Its markup renders
   `<span style="width:25px;height:25px;border-radius:6px;background:{{brPrimary}};…">{{logoRoute}}</span>`,
   but SQ-11's `renderVals` has **no `extra:` block at all**, so `logoRoute` is never defined.
   Grep across the whole unbundled tree finds `logoRoute` only in SQ-11's own markup. The brand chip
   renders as an empty coloured square.
2. **SQ-11's catalog claim of pre-fill is not implemented.** The card says the accident-type pick
   "pre-fills the flow"; the file passes **no `flow` override and no branching**. The pick produces a
   breadcrumb label only.
3. **SQ-10's answered counter can never complete.** `answeredLabel` is
   `history.length + ' OF ' + (qTotal+2)` = *N* of **8**, but the engine only pushes to `history` for
   steps with `f.opts` (`if(k<i && f.opts)`), and contact/consent have none. It maxes at **6 OF 8**.
4. **SQ-15's rail node count matches neither the catalog nor its own copy.** `nodes = flow.slice(0,total)`
   yields **7** nodes; the catalog names five milestones; the file's own eyebrow says
   `SIX POINTS ON THE TIMELINE`. Only 5 of the 7 are questions — "Next step" and "Consent" are rendered
   as milestones.
5. **SQ-15's connector bar has no last-child suppression** — `<span style="width:2px;flex:1;background:{{n.bar}};min-height:22px">`
   is emitted for every node, leaving a dangling ≥22px stub below the final dot.
6. **SQ-14's authoring hint is stale** — `hint-placeholder-count="6"` while the live render is 7 ticks
   (`total = flow.length-1 = 7`).
7. **SQ-09's dot count contradicts its own badge.** Dots track `total` (6) while the intro badge prints
   `qTotal` (4) — "≈ 60 SECONDS · 4 QUICK QUESTIONS" above six dots.
8. **Three designs lose their signature element to the `progress` toggle.** `display:{{progD}}` gates
   SQ-04's entire factor rail, SQ-15's entire left column, SQ-16's tab strip and SQ-19's node rail.
   With progress off, SQ-15 degrades from a two-column timeline to a plain card **with no fallback
   indicator whatsoever**, and SQ-13 — whose only indicator is a header counter — loses progress
   signalling completely.
9. **SQ-07 has a latent white-on-light failure.** Its dark surface comes from `cfg.shellBg`, which the
   engine honours only when fill is on (`shellBg:set.fill?(cfg.shellBg||'#FFFFFF'):'transparent'`).
   With `fill` off the shell goes transparent while `color:#FFFFFF` headings and white-text inputs
   remain, over the default warm host.
10. **SQ-19's "branching" is decorative.** The two rotated branch stubs are static markup; no
    placeholder binds to them and nothing in the file or engine ever branches.
11. **SQ-18's Next is styled-disabled but clickable** — `nextBg:curA!=null?B.primary:'#C9CCD2'` and
    `cursor:not-allowed`, with no `disabled` attribute; clicking sets `err:'Select an answer to continue.'`
12. **SQ-18 alone does not advance on tap.** `manualNext:true` inverts the interaction model of the
    other nineteen designs.
13. **Hardcoded submit ink across the set.** Every design writes `background:{{submitBg}};color:#FFFFFF`
    rather than `color:{{brOn}}` — a literal where the option ink is derived.
14. **Dark-host support is undefined.** Every design hardcodes some surface/ink (`#FFFFFF` option
    backgrounds, `#131313`/`#1C1C1C` headings, `#232A34` bars) while the canvas takes `{{host}}`/`{{hostInk}}`.
    SQ-17 is the only design binding heading, sub, TCPA and privacy line to host tokens — yet its
    options remain hardcoded white. **Nothing in the supplied source states whether `host:'dark'` is
    supported**, and there is no contrast guard anywhere in `SQSHARED.js` or any `renderVals`.

---

## 8. The superseded 16-template set (`review/`) — recorded, not a target

Do **not** audit the implementation against this list; it is the earlier generation (§2). It is
recorded because it is the **only place in the supplied material with a per-template mobile and
modal specification**, and because its framing sentence is the clearest statement of the
skin/deployment boundary anywhere in the delivery:

> A skin never changes questions, answer values, branching, qualification, routing, consent,
> analytics, completion destinations, call routing, or webhooks.

`review/Engineering-Handoff.html` §6 table, columns
`TEMPLATE ID · EMBED MODES · MIN/MAX WIDTH · LAYOUT MODEL · ANSWER MODEL · PROGRESS MODEL · ICON REQUIREMENTS · QUESTION TYPES · MOBILE BEHAVIOR · MODAL BEHAVIOR · COMPLETION · RELATED LP`:

| template id | min/max | layout model | answer model | progress model | **mobile behavior** | **modal behavior** | related LP |
|---|---|---|---|---|---|---|---|
| `sq_icon_grid` | 480/960 | Centered tile grid | Icon tiles, tap | Segmented bar | 2-col grid | Fits sheet | quiz_first (LP06) |
| `sq_conversational_chat` | 360/720 | Message column w/ history | Reply chips + free text | Message count | Native narrow fit | Height-capped, history scrolls | answer_first (LP10) |
| `sq_case_estimator` | 640/1080 | Factor console rows | Per-row controls | Factor status rows | Rows stack | Not recommended <640 | case_value_dossier (LP04) |
| `sq_visual_stepper` | 560/1080 | Stepper header + panel | Option cards | Node stepper (horiz/vert) | Vertical stepper rail | Header compresses | — |
| `sq_vehicle_selector` | 480/960 | Icon card grid | Vehicle icon cards | Dot sequence | 2×4 grid | Fits sheet | — |
| `sq_timeline_intake` | 560/880 | Vertical timeline | Per-stop inputs | Milestone rail | Rail persists | Scrolls in sheet | — |
| `sq_checklist_qualifier` | 420/760 | Single checklist panel | Checkbox rows + explicit "none" | Selected count | Full-width rows | Fits sheet | — |
| `sq_fullscreen_focus` | 320/full | One question per viewport | Oversized buttons | Thin top bar | **PRIMARY TARGET** | Owns the sheet | — |
| `sq_compact_card` | 300/480 | Narrow card | Stacked buttons | Fraction text (1/6) | Already narrow | Slim sheet | sixty_second_check (LP09) |
| `sq_split_question` | 640/1080 | Context panel + answer panel | Option list | Bar on context panel | Context collapses to note | Splits vertically | — |
| `sq_incident_diagram` | 520/960 | Diagram tile grid | Diagram tiles | Segmented bar | 2-col tiles | Fits sheet | — |
| `sq_card_deck` | 320/560 | Stacked card deck | Tap buttons (swipe OPTIONAL, never required) | Deck count dots | **PRIMARY TARGET** | Sheet = deck | — |
| `sq_decision_path` | 560/920 | Path header + panel | Option cards | Path nodes (done/current) — no logic exposed | Path compresses to dots | Header compresses | — |
| `sq_document_review` | 480/840 | Checklist w/ document icons | Checkbox rows | Items-reviewed count | Rows persist | Fits sheet | — |
| `sq_minimal_email` | 360/640 | Single card, 3 steps | Big buttons → contact fields → consent | "1 of 3" text | Single column | n/a | — |
| `sq_guided_assessment` | 720/1200 | Section rail + question panel | All standard | Rail + question count + est. time | Rail → accordion | Not recommended | — |

Only three of these slugs (`sq_fullscreen_focus`, `sq_card_deck`, `sq_decision_path`) survive by name
into the final twenty, and even those changed: the final `sq_card_deck` is 460/820, not 320/560.

---

## 9. Specified behaviour and responsive rules

### 9.1 `quizzes/Standalone-Quiz-States.html` — 24 required component states

> All 24 states apply to landing-page quizzes and standalone quizzes alike; **each of the 20
> standalone templates must express every state in its own container.**

| # | state | rule (verbatim caption) |
|---|---|---|
| 01 | Initial | NOTHING SELECTED · **CONTINUE DISABLED** |
| 02 | Keyboard focus | 2PX RING · 2PX OFFSET · NEVER COLOR-ONLY · `TAB ORDER: ANSWERS → BACK → CONTINUE` |
| 03 | Hover | POINTER DEVICES ONLY · BORDER + SURFACE SHIFT |
| 04 | Selected answer | **BORDER + FILL + MARK — THREE SIGNALS** |
| 05 | Continue disabled | ARIA-DISABLED + HELPER TEXT, NOT JUST GRAY |
| 06 | Continue enabled | PRIMARY FILL · MIN 44PX TARGET |
| 07 | Back navigation | ALWAYS AVAILABLE AFTER Q1 · PRESERVES ANSWERS · returning shows the prior answer still selected |
| 08 | Validation error | TEXT + ICON + FIELD RING · NEVER COLOR ALONE |
| 09 | Loading | SKELETON + LABEL · CONTROLS INERT |
| 10 | Network failure | ANSWERS KEPT LOCALLY · RETRY ACTION · "Nothing was submitted twice." |
| 11 | Multi-select | COUNT + "NONE" CLEARS · MUTUAL EXCLUSION |
| 12 | Long answer labels | WRAP, NEVER TRUNCATE · ROW GROWS |
| 13 | Date input | MM / DD / YYYY · APPROXIMATE ALLOWED |
| 14 | ZIP / location input | NUMERIC KEYPAD · 5-DIGIT MASK |
| 15 | Telephone input | AUTO-FORMAT · TEL KEYPAD · CONSENT ADJACENT |
| 16 | Email input | INLINE FORMAT CHECK · NO PREMATURE ERROR |
| 17 | Free-text input | OPTIONAL · CHARACTER GUIDANCE · NEVER GATES |
| 18 | Consent | UNTICKED BY DEFAULT · FULL TCPA TEXT · REQUIRED |
| 19 | Qualified completion | NEXT STEP + EXPECTATION · **NO PAYOUT CLAIMS** |
| 20 | Alternate completion | RESPECTFUL · RESOURCES · **NO DEAD END** |
| 21 | Phone handoff | TEL: LINK · HIDDEN WHEN BRAND HAS NO NUMBER |
| 22 | Redirect state | DESTINATION NAMED · AUTO + MANUAL FALLBACK |
| 23 | Resume state | RETURNING VISITOR · CONTINUE OR START OVER |
| 24 | **Mobile state** | **44PX+ TARGETS · SINGLE COLUMN · THUMB REACH** |

**This document contradicts the twenty templates it governs.** States 01, 05 and 06 mandate a
Continue button with disabled/enabled semantics on the question step; **nineteen of the twenty
templates have no Continue button at all** and auto-advance 290ms after a tap (§7). Only SQ-18
satisfies 05/06 — and its Next carries no `disabled` attribute, so it does not satisfy 05's
"ARIA-DISABLED" either. Likewise state 24 mandates "SINGLE COLUMN" on mobile, which five templates'
hardcoded `1fr 1fr` contact grids cannot deliver.

### 9.2 `review/Engineering-Handoff.html` — rules shared by all LP templates

Headed *"4 · Rules shared by all ten templates"* — **it then lists twelve**; the count is wrong in
the source.

- **RESPONSIVE:** "320px floor; wrap-based grids (`minmax(min(100%,X),1fr)`) — no horizontal
  overflow"; "Headline + first quiz question visible within first two viewports on 360×640";
  "**Answer targets ≥44px (quiz answers 46–60px)**; comparison tables become stacked cards";
  "Media slots use fixed aspect-ratio boxes — zero CLS when assets attach; **quiz skeletons reserve
  exact heights**".
- **ACCESSIBILITY & MOTION:** "Logical h1→h2 order per page; **selected answers marked by check icon
  + weight, not color alone**"; "errors adjacent to field with aria-live"; "**Progress announced as
  text ("Question 4 of 7")**; visible `:focus-visible` ring everywhere"; "Motion limited to quiz
  progression, accordion, button feedback; all behind `prefers-reduced-motion`".
- **COMPLIANCE GUARDRAILS:** "No guaranteed amounts, acceptance, representation, or settlements
  anywhere in template copy"; "**No countdown timers**; deadline language is state-generic with
  explicit 'varies by state' disclaimers"; "Estimator (dossier) carries a non-valuation disclaimer
  **inside the quiz shell itself**"; "Every footer: not-a-law-firm line, TCPA block,
  `{{brand.disclaimer}}`, privacy/terms/DNS/TCPA links".
- **SHARED · TOKENS & A11Y** (standalone section): "Semantic roles only: `quizSurface, quizText,
  quizMuted, quizSelected, quizProgress, primaryAction` — resolved from the brand"; "**selection =
  border + fill + mark (never color alone)**"; "one outline family (Lucide-compatible, 1.8px
  stroke), no style mixing".
- **Embeds:** "style-isolated (shadow root or iframe): no host CSS bleed in, no quiz CSS bleed out;
  height reported to host via `postMessage` for iframe resizing".

**Note the "border + fill + mark — three signals" rule is violated by two of the twenty designs**:
**SQ-18** never changes the option background (white when selected and unselected), and **SQ-01**
never changes the border (`border:none;border-bottom:1px solid #E3E1D9` is hardcoded, so
`optStyle`'s `bd:B.primary` is dead code).

### 9.3 `review/Mobile-Previews.html`

Covers the **12 LPs only** — there is **no mobile-preview artifact for the 20 standalone quizzes**.
Its header states the responsive contract plainly:

> `MOBILE PREVIEWS · 390×780 LIVE FRAMES`
> `SCROLL INSIDE EACH PHONE · SAME RESPONSIVE PAGES, NOT SEPARATE MOCKS`

So the LPs were specified as **one responsive page**, never a separate mobile design. Twelve nested
page bundles (one per LP) are embedded; each is the same document rendered at 390px.

### 9.4 `review/Embed-Preview-Lab.html`

Belongs to the **superseded 16-template generation** (its template picker lists `Icon Grid …
Guided Assessment`). It carries a `RECOMMENDED {{recWidth}}` map, a viewport/container ladder
`[320, 375, 480, 640, 768, 960, 'full', 'modal']`, and four **simulated brands** used to stress
brand resolution — `Neutral fallback`, `Whitfield, Adams & Associates` (navy+gold, serif, long name),
`ClaimUp` (bright blue, short name), `Meridian Legal` (burgundy, **`logoMissing`**, **`phoneMissing`**).
It states: `SIMULATION ONLY — THE NEUTRAL DEFAULT PALETTE IS NEVER CHANGED BY A DEMO.`
The missing-logo and missing-phone brands are the supplied material's only explicit
**empty-state test fixtures**.

---

## 10. What is not determinable from the supplied source

- **Per-design mobile composition for the twenty standalone quizzes.** No media queries, no
  per-design breakpoints. Only intrinsic reflow (§7.2) and the engine's `qw:'100%'` + centred
  alignment. The 16-template mobile column (§8) belongs to the superseded generation and cannot be
  transferred design-for-design.
- **Whether `host:'dark'` is a supported combination** for any standalone design (§7.3 item 14).
- **Runtime semantics of the templating layer** — `sc-if`, `sc-for`, `sc-camel-on-click`,
  `style-hover`, `dc-import`, `hint-placeholder-count`. The host renderer is not among the supplied
  files, so hover treatments are readable only as declared values.
- **What `<dc-import name="SQ-Settings">` renders** — the settings-panel component is not supplied.
- **Provenance of the catalog `WIDTH` ranges** (§6.3). They do not derive from the `widths` tokens in
  16 of 20 cases and nothing in the supplied source explains the mapping.
- **Whether SQ-01's missing `min-width:0` actually overflows at 390px.** Structurally it is the
  outlier of the twenty; confirming the overflow requires a render.
- **Font loading.** `Archivo`, `Source Serif 4` and `JetBrains Mono` are referenced throughout; their
  `@font-face` declarations live in the bundled `<head>`/assets, not in the design bodies.
- **Any step-transition animation** beyond the declared `transition:width .3s` (progress bars),
  `transition:background .2s` (segment ticks) and `transition:transform .15s,box-shadow .15s` (SQ-18).

---

## 11. Appendix — reproducing this audit

```bash
SCRATCH=/tmp/quiz-audit
for f in quizzes/*.html review/*.html; do
  node scripts/unbundle-design-artifact.mjs "$f" "$SCRATCH/$(basename "$f" .html)"
done
```

Key verifications, each re-runnable:

```bash
# the shared engine is byte-identical across all 20 designs
for d in $SCRATCH/Standalone-Quiz-[0-9]*/; do
  node -e 'const h=require("fs").readFileSync(process.argv[1],"utf8");
    const a=h.indexOf("<script>"),b=h.indexOf("</script>",a);
    console.log(require("crypto").createHash("md5").update(h.slice(a+8,b)).digest("hex"))' "$d/index.html"
done | sort -u          # → exactly one hash: e5e010f067cfea05975bd2e78239fd33

# no responsive media query anywhere in the twenty
grep -ho '@media[^{]*' $SCRATCH/Standalone-Quiz-[0-9]*/index.html | sort -u
# → only "@media (prefers-reduced-motion: reduce)"

# only one design sets manualNext / references a Next control
grep -l '{{nextGo}}' $SCRATCH/Standalone-Quiz-[0-9]*/index.html   # → SQ-18 only
```

