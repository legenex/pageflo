/**
 * Where the real quiz runtime mounts inside a ported landing-page template.
 *
 * THE PROBLEM. Each of the twelve references draws a quiz card: an eyebrow, a
 * progress rail, a question, four answer buttons and a Back/Continue pair. It is
 * a PICTURE of a quiz. Ported verbatim it shipped to production as static
 * markup, so a visitor on a landing page clicked an answer and nothing happened
 * — measured in-browser: seven clicks, zero lead posts, while the standalone
 * quiz at the sibling URL worked. The page looked like it captured leads and did
 * not.
 *
 * THE SHAPE OF THE FIX. The card is not redrawn and it is not deleted from the
 * asset. It is located ONCE, at extraction time, and recorded as a region. The
 * live render composes the template either side of that region and mounts the
 * same `QuizRuntime` a standalone deployment mounts in the gap. So the landing
 * page owns the page and the quiz owns the quiz, and there is no second
 * implementation of "ask a question" to drift.
 *
 * WHY IT IS DERIVED RATHER THAN HAND-MARKED. The generated modules are
 * overwritten wholesale by `scripts/extract-lp-templates.mjs`, so a sentinel
 * hand-placed in one lasts until the next extraction. And a hand-placed marker
 * cannot fail: it is right until the design moves and then it is silently
 * wrong. This locates the card from the reference's OWN structure and REFUSES
 * when the structure stops being recognisable, which is the behaviour that keeps
 * a moved card from quietly mounting the runtime in the middle of a FAQ.
 *
 * THE RULE, in the order it is applied.
 *
 *  1. An ANSWER GROUP is an element whose element children include at least two
 *     `<button>`s and whose button children are ALL answer-shaped: eight or
 *     more characters of text and not a navigation verb. The Back/Continue pair
 *     is therefore not an answer group, and neither is a lone CTA.
 *  2. An answer group is a QUIZ answer group only if some ancestor carries a
 *     second quiz affordance: a step indicator ("Question 1 of 6", "1 of 5") or
 *     a navigation button. This is the test that excludes `case_type_router`'s
 *     eight case-type cards, which are page presentation — the visitor picks an
 *     incident type and the page repaints — and are not the quiz.
 *  3. The CARD is the outermost of {nearest ancestor with a step indicator,
 *     nearest ancestor with a nav button}. Taking the nearest of either alone
 *     leaves the other outside, and a static "QUESTION 1 OF 6" left on the page
 *     beside a live quiz is the same lie in miniature.
 *  4. The card widens SIDEWAYS over contiguous contentless siblings. A progress
 *     rail is an empty div, and `insurer_vs_claimant` draws one beside the card
 *     rather than inside it; left behind it would sit above a live quiz frozen
 *     at 17%. Across the twelve this absorbs exactly that one element.
 *  5. The card is never a sectioning element and the region never grows into
 *     one. Replacing a `<section>` would take its background band with it.
 *
 * What it deliberately does NOT take: a step RAIL that carries text.
 * `authority_network` lists "01 INCIDENT / 02 INJURIES / 03 TREATMENT" beside
 * the card. Those are the phases of the process the page is describing, they are
 * editable slots, and the running quiz draws its own progress inside the mount.
 *
 * Exactly one region per template, or the extractor fails. Zero means the card
 * moved; two means something else in the page now looks like a quiz. Both are
 * facts about the handoff worth stopping on.
 */

import { scan, walk, textOf, openTagOf, opaqueBackgroundAt, type ScannedNode } from './scan'

/** Sectioning elements. Expansion stops below them; see rule 5. */
const SECTIONING = new Set(['section', 'header', 'footer', 'main', 'article', 'aside', 'nav', 'body'])

/**
 * A navigation verb, anchored at the start of the button's text.
 *
 * Anchored on purpose: an ANSWER reading "I went back to work the next day"
 * contains "back" and is not a nav control. The arrow glyphs are optional
 * because the references write "← Back" and "Continue →" and one template
 * writes "Add to file →".
 */
const NAV_TEXT = /^\s*(?:←|→|<|>|«|»|‹|›)?\s*(back|continue|next|previous|prev|skip|add to file)\b/i

/**
 * A step indicator: "Question 1 of 6", "STEP 1 OF 7", "1 / 4", "1 of 5".
 *
 * Deliberately does not require the words. Four of the twelve write the bare
 * "1 of 5" form, and a rule that only matched the wordy form would find no card
 * in a third of the library.
 */
const STEP_INDICATOR = /\b\d{1,2}\s*(?:of|\/)\s*\d{1,2}\b/i

/** Shortest text a button can carry and still read as an answer rather than a control. */
const MIN_ANSWER_CHARS = 8

export type QuizMountEvidence = {
  /** How many answer-shaped buttons fixed the anchor. */
  answerButtons: number
  /** Whether a step indicator contributed to the boundary. */
  stepIndicator: boolean
  /** Whether a navigation button contributed to the boundary. */
  navControl: boolean
  /** Whether a contentless sibling (a progress rail) was absorbed. */
  absorbedRail: boolean
}

export type QuizMountRegion = {
  /** Offset of the `<` opening the replaced element. */
  start: number
  /** Offset just past the `>` closing it. */
  end: number
  /** The element that is replaced, for the record. */
  tag: string
  /**
   * The reference's own markup for the region.
   *
   * Kept so a test can assert `before + reference + after` reproduces the
   * template byte for byte — which is what proves the split moved nothing else.
   */
  reference: string
  /**
   * The card's own opening tag, verbatim.
   *
   * The live render emits this tag with nothing inside it and mounts the runtime
   * there, so the quiz keeps the card's box exactly: its width and flex basis,
   * its padding, its border, its radius and its shadow. Rebuilding the box from
   * a description of it is how a "reskin" ends up half a template wide.
   */
  openTag: string
  /**
   * The OPAQUE background the card is read against, verbatim.
   *
   * Walked up from the card rather than read off it, because four of the twelve
   * draw the card as a transparent column inside a coloured shell —
   * `insurer_vs_claimant`'s quiz sits in a near-black panel and declares no
   * background of its own. Reading only the card's own tag would hand the
   * runtime an empty string and it would derive its text colours against the
   * page instead of against the panel it actually sits on, which is the exact
   * mistake the colour system exists to make impossible.
   *
   * Carries the reference's `var(--lp-nNNN, #hex)` form, so it resolves through
   * the same variables the rest of the template does.
   */
  surface: string
  evidence: QuizMountEvidence
}

export type QuizMountResult = {
  region: QuizMountRegion | null
  /** Non-empty means do not trust the result. The extractor refuses to write. */
  problems: string[]
}

const elementChildren = (n: ScannedNode): ScannedNode[] => n.children

const hasNavButton = (html: string, root: ScannedNode): boolean => {
  let found = false
  walk([root], (d) => {
    if (found) return
    if (d.tag === 'button' && NAV_TEXT.test(textOf(html, d))) found = true
  })
  return found
}


/** An element carrying no text at all — a rail, a divider, a spacer. */
const isContentless = (html: string, n: ScannedNode): boolean => textOf(html, n) === ''

/**
 * Every element whose button children are all answer-shaped.
 *
 * "All", not "some": a container holding four answers and a Continue is the
 * card, not the answer group, and anchoring on it would make rule 3 a no-op.
 */
const answerGroups = (html: string, roots: ScannedNode[]): Array<{ node: ScannedNode; answers: number }> => {
  const out: Array<{ node: ScannedNode; answers: number }> = []
  walk(roots, (n) => {
    const buttons = elementChildren(n).filter((c) => c.tag === 'button')
    if (buttons.length < 2) return
    const answers = buttons.filter((b) => {
      const text = textOf(html, b)
      return text.length >= MIN_ANSWER_CHARS && !NAV_TEXT.test(text)
    })
    if (answers.length === buttons.length) out.push({ node: n, answers: answers.length })
  })
  return out
}

/**
 * Widen a card sideways to take an adjacent progress rail. Rule 4.
 *
 * A rail is CONTENTLESS — a bar drawn at a fixed percentage width with no text
 * in it — so absorbing every contiguous contentless sibling takes the rail and
 * nothing else. Across the twelve it takes exactly one element, in
 * `insurer_vs_claimant`, which draws its rail as a sibling of the card rather
 * than inside it. Left behind it would sit above a live quiz frozen at 17%.
 *
 * Deliberately sideways rather than upward. The obvious alternative — take the
 * parent when its other children are all rails — also takes a parent whose only
 * child is the card, and those are layout wrappers: `human_recovery_story`'s is
 * the flex box that centres the card, and removing it would drop the centring.
 * A sibling range cannot make that mistake because it never leaves the level
 * the card is on.
 */
const absorbAdjacentRails = (
  html: string,
  card: ScannedNode,
  roots: ScannedNode[],
): { start: number; end: number; absorbed: boolean } => {
  const siblings = card.parent ? elementChildren(card.parent) : roots
  const index = siblings.indexOf(card)
  if (index < 0) return { start: card.start, end: card.end, absorbed: false }

  let first = index
  let last = index
  while (first > 0 && isContentless(html, siblings[first - 1])) first--
  while (last < siblings.length - 1 && isContentless(html, siblings[last + 1])) last++

  return {
    start: siblings[first].start,
    end: siblings[last].end,
    absorbed: first !== index || last !== index,
  }
}

/**
 * Locate the quiz card in one ported template's markup.
 *
 * Returns `region: null` with a problem rather than a guess. Every caller treats
 * a problem as fatal: the extractor refuses to write the module, and the slot
 * test refuses the template.
 */
export const findQuizMount = (html: string): QuizMountResult => {
  const problems: string[] = []
  const { roots, problems: scanProblems } = scan(html)
  for (const p of scanProblems) problems.push(`scan: ${p}`)

  const candidates: Array<{ card: ScannedNode; openTag: string; surface: string; evidence: QuizMountEvidence }> = []

  for (const group of answerGroups(html, roots)) {
    let stepAncestor: ScannedNode | null = null
    let navAncestor: ScannedNode | null = null

    for (let a: ScannedNode | null = group.node; a; a = a.parent) {
      if (!stepAncestor && STEP_INDICATOR.test(textOf(html, a))) stepAncestor = a
      if (!navAncestor && hasNavButton(html, a)) navAncestor = a
      if (stepAncestor && navAncestor) break
    }

    // Rule 2: an answer group with no second affordance anywhere above it is
    // not a quiz. This is the one that keeps `case_type_router`'s case-type
    // cards out, and it is why that template has two answer groups and one
    // mount.
    if (!stepAncestor && !navAncestor) continue

    // Rule 3: the outermost of the two. They are on one ancestor chain, so
    // "outermost" is whichever contains the other.
    const anchor =
      !stepAncestor ? navAncestor!
      : !navAncestor ? stepAncestor
      : stepAncestor.start <= navAncestor.start && stepAncestor.end >= navAncestor.end ? stepAncestor
      : navAncestor

    if (SECTIONING.has(anchor.tag)) {
      problems.push(
        `the quiz card resolved to <${anchor.tag}>, a sectioning element; replacing it would take the section's own styling`,
      )
      continue
    }

    const { start, end, absorbed } = absorbAdjacentRails(html, anchor, roots)
    candidates.push({
      card: { ...anchor, start, end },
      openTag: openTagOf(html, anchor),
      surface: opaqueBackgroundAt(html, anchor),
      evidence: {
        answerButtons: group.answers,
        stepIndicator: Boolean(stepAncestor),
        navControl: Boolean(navAncestor),
        absorbedRail: absorbed,
      },
    })
  }

  if (candidates.length === 0) {
    problems.push('no quiz card found: no answer group has a step indicator or a navigation control above it')
    return { region: null, problems }
  }
  if (candidates.length > 1) {
    problems.push(
      `ambiguous quiz card: ${candidates.length} regions qualified (${candidates
        .map((c) => `${c.card.start}-${c.card.end}`)
        .join(', ')})`,
    )
    return { region: null, problems }
  }

  const { card, openTag, surface, evidence } = candidates[0]
  return {
    region: {
      start: card.start,
      end: card.end,
      tag: card.tag,
      reference: html.slice(card.start, card.end),
      openTag,
      surface,
      evidence,
    },
    problems,
  }
}

/* ------------------------------------------------- the generated descriptor */

/**
 * The mount as a generated module carries it.
 *
 * Offsets into `html` would be wrong the moment a deployment overrides a line
 * above the card, so the recorded position is a coordinate in the PART STREAM:
 * which literal part the region starts in and where inside it. Composition then
 * splits deterministically whatever the overrides do, and there is no scan and
 * no parse on the request path.
 */
export type LpQuizMount = {
  /** Index into `parts` where the region starts. */
  startPart: number
  /** Offset inside `parts[startPart]` of the region's first byte. */
  startOffset: number
  /** Index into `parts` where the region ends. */
  endPart: number
  /** Offset inside `parts[endPart]` just past the region's last byte. */
  endOffset: number
  /** Slot ids that live INSIDE the region, and therefore never render. */
  slotIds: string[]
  /** The element replaced, for diagnostics. */
  tag: string
  /** The card's own opening tag. The live render emits it empty and mounts inside. */
  openTag: string
  /**
   * The background declaration the card was drawn on, verbatim.
   *
   * The runtime derives its text colours against the surface it actually sits
   * on — the rule the colour system enforces everywhere — and this is where that
   * surface comes from. It is the reference's own value, so it carries a
   * `var(--lp-nNNN, #hex)` and resolves through the same variables the rest of
   * the template does. Empty when the card declared none.
   */
  surface: string
  evidence: QuizMountEvidence
}

/**
 * Map a region's html offsets into part-stream coordinates.
 *
 * `parts[i]` are the literal runs and `defaults[i]` the slot content between
 * them, and their concatenation is the template — an invariant the extractor
 * already asserts. So the offset of every part is arithmetic rather than a
 * search, and a boundary that lands inside a SLOT rather than a literal part is
 * reported instead of rounded: it would mean the card starts in the middle of a
 * piece of editable copy, which is not a card boundary.
 *
 * Takes a bare `{ start, end }` rather than a `QuizMountRegion` because the quiz
 * card is no longer the only region recorded this way: a supply-or-omit block
 * (see `LpSupplyGroup`) is cut out of the same stream by the same arithmetic,
 * and a second copy of this mapping is the one place an off-by-one would delete
 * the wrong half of a live page. `what` only names the region in the messages.
 */
export const mountToPartCoordinates = (
  region: { start: number; end: number },
  parts: string[],
  slotIds: string[],
  slotDefaults: string[],
  what = 'quiz mount',
): { mount: Omit<LpQuizMount, 'evidence' | 'tag' | 'openTag' | 'surface'> | null; problems: string[] } => {
  const problems: string[] = []
  const partStart: number[] = []
  let cursor = 0
  for (let i = 0; i < parts.length; i++) {
    partStart.push(cursor)
    cursor += parts[i].length
    if (i < slotDefaults.length) cursor += slotDefaults[i].length
  }

  const locate = (offset: number, label: string): { part: number; inner: number } | null => {
    for (let i = 0; i < parts.length; i++) {
      const lo = partStart[i]
      const hi = lo + parts[i].length
      // `<=` on the far end so a boundary sitting exactly at the join between a
      // part and the slot that follows it belongs to the part.
      if (offset >= lo && offset <= hi) return { part: i, inner: offset - lo }
    }
    problems.push(`the ${what}'s ${label} offset ${offset} falls inside a slot, not a literal part`)
    return null
  }

  const start = locate(region.start, 'start')
  const end = locate(region.end, 'end')
  if (!start || !end) return { mount: null, problems }

  // Every slot whose gap lies between the two coordinates is inside the card
  // and will not render. Reported rather than silently dropped: an operator who
  // overrode the quiz card's question needs to know the quiz owns that copy now.
  const inside: string[] = []
  for (let i = start.part; i < end.part; i++) {
    if (slotIds[i] !== undefined) inside.push(slotIds[i])
  }

  return {
    mount: { startPart: start.part, startOffset: start.inner, endPart: end.part, endOffset: end.inner, slotIds: inside },
    problems,
  }
}


