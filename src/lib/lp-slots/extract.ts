/**
 * Deriving semantic slots from a reference template's own structure.
 *
 * This runs at EXTRACTION time, not at render time and not by hand. The twelve
 * generated modules under `lp-templates/` are overwritten wholesale every time
 * `scripts/extract-lp-templates.mjs` runs, so a slot written into one by hand
 * survives exactly until the next time the handoff changes. Deriving them means
 * the same reference produces the same ids every time, and a design change
 * shows up as a changed id rather than as a page that quietly stopped being
 * editable.
 *
 * WHAT COUNTS AS A SLOT. An element whose content is its own: it holds visible
 * text and contains no descendant that is itself a slot. That rule is what
 * makes a mixed-content line like
 *
 *     <span>UPDATED FOR <code>{{deployment.jurisdiction}}</code></span>
 *
 * a single editable line rather than two fragments, and it is why the slot's
 * default is the element's inner MARKUP rather than its text: keeping the
 * `<code>` chip is what keeps the reference intact when nobody overrides it.
 *
 * WHAT A ROLE IS DECIDED BY. Tag first, because a reference that uses `h1` and
 * `summary` has already said what those are. Then position — the paragraph
 * directly after the `h1` is the subheadline, wherever it sits in the DOM — and
 * only then appearance, for the regions the handoff draws with style instead of
 * structure (an eyebrow is small, tracked and upper-case in all twelve). Each
 * rule is one the reference actually follows; none is a guess about what a
 * designer probably meant.
 */
import { scan, walk, inner, textOf, attr, styleProp, type ScannedNode } from './scan'
import type { LpSlot, LpSlottedTemplate, LpUnsupportedRegion, SlotRole } from './model'

/* ------------------------------------------------------------ what is text */

/** Tags that can hold editable copy. Structural and decorative tags cannot. */
const CONTENT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'a', 'span', 'div', 'code', 'blockquote', 'strong', 'em',
  'td', 'th', 'button', 'summary', 'figcaption', 'label', 'legend', 'caption', 'dt', 'dd',
])

/** Inside these, nothing is copy: it is vector geometry or program text. */
const OPAQUE_TAGS = new Set(['svg', 'script', 'style', 'noscript', 'template'])

/** The handoff's own loop directive. Its body is driven by the reference's JS. */
const LOOP_TAG = 'sc-for'

/** Text that is only a placeholder chip is the handoff annotating itself. */
const ONLY_PLACEHOLDER = /^\{\{\s*[\w.]+\s*\}\}$/

/**
 * The handoff's image convention.
 *
 * There is not one `<img>` in any of the twelve references. Where a brand asset
 * belongs, the design draws a DASHED BOX with a bracketed label — `[LOGO SLOT]`,
 * `[BRAND IMAGE / VIDEO SLOT]`, `[TRUST MARK]` — because the handoff had no
 * assets to place. Finding those boxes is the only way an image can become
 * editable without adding markup the reference does not have.
 *
 * The label must name a picture. `[LEGAL DISCLOSURE]` and
 * `[CASE RESULT PLACEHOLDER]` are drawn in the same dashed box and are text,
 * so a rule keyed only on the box would turn a legal notice into an image well.
 */
const BRACKET_LABEL = /\[([A-Z0-9 ·/_-]{3,})\]/
const IMAGE_WORD = /\b(IMAGE|VISUAL|LOGO|MARK|PHOTO|PORTRAIT|HEADSHOT|VIDEO|MAP|BADGE|SEAL|ICON)\b/
const NOT_IMAGE_WORD = /\b(DISCLOSURE|DISCLAIMER|LEGAL|RESULT|COPY|TEXT)\b/

/* ----------------------------------------------------------------- helpers */

const isUpperish = (s: string): boolean => {
  const letters = s.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) return false
  return letters === letters.toUpperCase()
}

const px = (v: string): number => {
  const m = /^(-?[\d.]+)px$/.exec(v.trim())
  return m ? Number(m[1]) : NaN
}

/**
 * Font size in px, seeing through `clamp(min, pref, max)`.
 *
 * The references set every hero at `clamp(34px, 5.4vw, 54px)`, so reading the
 * declaration literally would score every headline as NaN and lose the one
 * signal that separates a headline from a caption.
 */
const fontSizePx = (n: ScannedNode): number => {
  const raw = styleProp(n, 'font-size')
  if (!raw) return NaN
  const clamp = /^clamp\(\s*([^,]+),/.exec(raw)
  return px(clamp ? clamp[1] : raw)
}

const fontWeight = (n: ScannedNode): number => {
  const raw = styleProp(n, 'font-weight')
  if (!raw) return NaN
  if (raw === 'bold') return 700
  const n2 = Number(raw)
  return Number.isFinite(n2) ? n2 : NaN
}

const ancestors = function* (n: ScannedNode): Generator<ScannedNode> {
  let p = n.parent
  while (p) { yield p; p = p.parent }
}

const hasAncestor = (n: ScannedNode, pred: (a: ScannedNode) => boolean): boolean => {
  for (const a of ancestors(n)) if (pred(a)) return true
  return false
}

/* ------------------------------------------------------------ role signals */

const DISCLAIMER = /attorney advertising|not a law firm|legal disclosure|disclaimer|tcpa|do not sell|prior results|past results|no fee(?:s)? unless|©|\(c\)\s*20|all rights reserved|privacy policy|terms of (?:service|use)/i

const TRUST = /no obligation|free|secure|confidential|encrypted|takes? (?:about|less than|under)|no cost|no upfront|\bssl\b|100%|does not affect|no credit/i

/**
 * An eyebrow, as all twelve draw one: small, letter-spaced, upper-case.
 *
 * Requiring all three is deliberate. Small alone is a caption; tracked alone is
 * a wordmark; upper-case alone is an acronym in a sentence. The combination is
 * a kicker line above a heading and does not occur by accident.
 */
const isEyebrow = (n: ScannedNode, text: string): boolean => {
  const size = fontSizePx(n)
  if (!Number.isFinite(size) || size > 13) return false
  const tracking = styleProp(n, 'letter-spacing')
  if (!tracking || /^0/.test(tracking)) return false
  return isUpperish(text) && text.length <= 90
}

/**
 * A card is a repeated sibling. Two of a shape is a coincidence; the handoff
 * never draws a "card grid" with fewer than two, and a two-column comparison is
 * exactly the case that must count as one.
 */
const inRepeatedGroup = (n: ScannedNode): boolean => {
  for (const a of ancestors(n)) {
    const parent = a.parent
    if (!parent) continue
    const sameShape = parent.children.filter((c) => c.tag === a.tag)
    if (sameShape.length >= 2 && parent.children.length === sameShape.length) return true
  }
  return false
}

const inFooterish = (n: ScannedNode): boolean =>
  n.tag === 'footer' || hasAncestor(n, (a) => a.tag === 'footer')

const inDetails = (n: ScannedNode): boolean => hasAncestor(n, (a) => a.tag === 'details')

/* ------------------------------------------------------------- the classifier */

type Ctx = {
  html: string
  /** The h1 of this template, if it has one. Used to place the subheadline. */
  headline: ScannedNode | null
  /** Slot elements in document order, so "the one after the h1" is answerable. */
  order: ScannedNode[]
}

const roleFor = (n: ScannedNode, text: string, ctx: Ctx): SlotRole => {
  if (n.tag === 'summary') return 'faq_question'
  if (inDetails(n)) return 'faq_answer'

  if (n.tag === 'h1') return 'headline'

  // A disclaimer is decided by what it SAYS, not where it is: the twelve put
  // theirs in a footer, under a form, and inside a hero band, and a rule keyed
  // on position would find one of the three.
  if (DISCLAIMER.test(text) && (text.length > 40 || inFooterish(n))) return 'disclaimer'

  if (n.tag === 'a' || n.tag === 'button') {
    // A CTA is a short label. A long anchor is a link inside a sentence, and
    // calling that a call to action would put paragraph copy in the CTA editor.
    return text.length <= 60 ? 'cta_label' : 'section_body'
  }

  if (isEyebrow(n, text)) return 'eyebrow'

  if (n.tag === 'h2') return 'section_headline'
  if (n.tag === 'h3' || n.tag === 'h4' || n.tag === 'h5' || n.tag === 'h6') {
    return inRepeatedGroup(n) ? 'card_title' : 'section_headline'
  }

  // The paragraph immediately after the headline is the deck, wherever the DOM
  // puts it. Every one of the twelve opens this way.
  if (ctx.headline && (n.tag === 'p' || n.tag === 'div' || n.tag === 'span')) {
    const hi = ctx.order.indexOf(ctx.headline)
    if (hi >= 0 && ctx.order[hi + 1] === n) return 'subheadline'
  }

  if (TRUST.test(text) && text.length <= 140) return 'trust_line'

  if (n.tag === 'li') return 'card_body'
  if (n.tag === 'p') return inRepeatedGroup(n) ? 'card_body' : 'section_body'

  if (inRepeatedGroup(n)) {
    // Within a repeated group, weight and size separate the card's title from
    // its body. The handoff draws every card the same way: one heavier line,
    // then one or two lighter ones.
    const w = fontWeight(n)
    const s = fontSizePx(n)
    if ((Number.isFinite(w) && w >= 600) || (Number.isFinite(s) && s >= 15)) return 'card_title'
    return 'card_body'
  }

  return 'text'
}

/* ------------------------------------------------------------ section labels */

/**
 * The reference's own name for a band.
 *
 * Each section in the handoff is preceded by `<!-- ===== key takeaway ===== -->`.
 * Using it means the deployment editor's section headings are the designer's
 * words rather than "Section 4", at no cost and with no invention.
 */
const labelBefore = (html: string, start: number, fallback: string): string => {
  const before = html.slice(0, start)
  const m = [...before.matchAll(/<!--\s*=*\s*([^=<>-][^<]*?)\s*=*\s*-->/g)].pop()
  if (!m) return fallback
  // Only if it is the last thing before this element, allowing whitespace.
  if (before.slice(m.index + m[0].length).trim() !== '') return fallback
  return m[1].trim().slice(0, 60) || fallback
}

/* ------------------------------------------------------------------ extract */

export type ExtractOptions = {
  /** Maximum characters of reference copy a slot may hold. Longer is a bug. */
  maxDefaultChars?: number
}

export type ExtractResult = LpSlottedTemplate & { problems: string[] }

/**
 * Turn one template's markup into parts, slot ids and slot definitions.
 *
 * The output satisfies `parts.join(defaults) === html` exactly. Nothing is
 * re-serialised: every part is a slice of the input, so the literal markup
 * between slots is the reference's own bytes.
 */
export const extractSlots = (slug: string, html: string, opts: ExtractOptions = {}): ExtractResult => {
  const maxDefaultChars = opts.maxDefaultChars ?? 4000
  const { roots, problems } = scan(html)

  const unsupported: LpUnsupportedRegion[] = []
  const loops: ScannedNode[] = []
  walk(roots, (n) => { if (n.tag === LOOP_TAG) loops.push(n) })
  if (loops.length > 0) {
    unsupported.push({
      kind: 'sc-for',
      detail:
        'the reference repeats this region from data held in its own <script>, so the markup alone does not carry the content',
      count: loops.length,
    })
  }

  /* --- pass 0: image placeholder boxes ------------------------------------ */
  //
  // Found FIRST, because a box's own label spans would otherwise be picked up
  // as ordinary text slots and the two regions would overlap.

  type ImageBox = { box: ScannedNode; label: string }
  const imageBoxes: ImageBox[] = []
  const seenBoxes = new Set<ScannedNode>()

  const isImageLabel = (n: ScannedNode): string | null => {
    const m = BRACKET_LABEL.exec(textOf(html, n))
    if (!m) return null
    return IMAGE_WORD.test(m[1]) && !NOT_IMAGE_WORD.test(m[1]) ? m[1] : null
  }

  // The DEEPEST element carrying the label, then climb to the dashed frame.
  //
  // Both halves matter. Starting from an ancestor and climbing up can never
  // reach a dashed box that is a DESCENDANT, so the search would settle on some
  // outer layout row and swallow whatever else it contained - which is exactly
  // what happened before this: four templates produced an "image" region
  // several hundred bytes wide that overlapped real text slots.
  walk(roots, (n) => {
    if (hasAncestor(n, (a) => OPAQUE_TAGS.has(a.tag) || a.tag === LOOP_TAG)) return
    const label = isImageLabel(n)
    if (!label) return
    let deeper = false
    walk(n.children, (d) => { if (isImageLabel(d)) deeper = true })
    if (deeper) return

    let box: ScannedNode | null = n
    while (box && !/dashed/i.test(styleProp(box, 'border') + styleProp(box, 'border-top') + styleProp(box, 'border-bottom'))) {
      box = box.parent
    }
    // No dashed frame means the label is a caption beside a drawn graphic, not
    // a well waiting for an asset. Skipping is correct: there is nothing there
    // an operator could fill.
    if (!box || seenBoxes.has(box)) return
    seenBoxes.add(box)
    imageBoxes.push({ box, label })
  })

  const inImageBox = (n: ScannedNode): boolean =>
    imageBoxes.some(({ box }) => n.start >= box.contentStart && n.end <= box.contentEnd)

  /* --- pass 1: which elements are slots ---------------------------------- */

  const candidates = new Set<ScannedNode>()
  walk(roots, (n) => {
    if (n.selfClosing) return
    if (!CONTENT_TAGS.has(n.tag)) return
    if (hasAncestor(n, (a) => OPAQUE_TAGS.has(a.tag) || a.tag === LOOP_TAG)) return
    if (OPAQUE_TAGS.has(n.tag) || n.tag === LOOP_TAG) return
    if (inImageBox(n) || imageBoxes.some((b) => b.box === n)) return
    const text = textOf(html, n)
    if (text === '') return
    if (ONLY_PLACEHOLDER.test(text)) return
    candidates.add(n)
  })

  // Only the deepest candidate on each path becomes a slot. An ancestor whose
  // content is already covered by its children is a container, not a line.
  //
  // An IMAGE BOX blocks an ancestor exactly as a text candidate does. Without
  // that, excluding a box's internals from the text candidates made the box's
  // parent look like a leaf, and it claimed the whole region - 1,700 bytes in
  // one case, swallowing five trust-mark wells and everything between them.
  const containsImageBox = (n: ScannedNode): boolean =>
    imageBoxes.some(({ box }) => box.start >= n.contentStart && box.end <= n.contentEnd)

  const slotNodes: ScannedNode[] = []
  walk(roots, (n) => {
    if (!candidates.has(n)) return
    if (containsImageBox(n)) return
    let hasCandidateDescendant = false
    walk(n.children, (d) => { if (candidates.has(d)) hasCandidateDescendant = true })
    if (!hasCandidateDescendant) slotNodes.push(n)
  })

  /* --- pass 2: images ----------------------------------------------------- */

  type Cut = {
    start: number
    end: number
    role: SlotRole
    escaping: 'text' | 'attr' | 'image'
    value: string
    node: ScannedNode
    /** Alt text to pair with, for an image box. */
    altDefault?: string
  }
  const cuts: Cut[] = []

  for (const n of slotNodes) {
    cuts.push({
      start: n.contentStart,
      end: n.contentEnd,
      role: 'text',
      escaping: 'text',
      value: inner(html, n),
      node: n,
    })
  }

  for (const { box, label } of imageBoxes) {
    cuts.push({
      start: box.contentStart,
      end: box.contentEnd,
      role: 'image_src',
      escaping: 'image',
      value: inner(html, box),
      node: box,
      // "BRAND IMAGE / VIDEO SLOT" -> "Brand image / video". A real starting
      // point rather than an empty required field, and better than nothing if
      // an operator ships without touching it.
      altDefault: label
        .replace(/\bSLOT\b|\bPLACEHOLDER\b/g, '')
        .replace(/\s*·.*$/, '')
        .trim()
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
    })
  }

  walk(roots, (n) => {
    if (n.tag !== 'img') return
    if (hasAncestor(n, (a) => OPAQUE_TAGS.has(a.tag) || a.tag === LOOP_TAG)) return
    const src = attr(n, 'src')
    if (src) cuts.push({ start: src.valueStart, end: src.valueEnd, role: 'image_src', escaping: 'attr', value: src.value, node: n })
    const alt = attr(n, 'alt')
    // An `alt` that is not written cannot be given a slot without rewriting the
    // tag, which would break byte parity. Reported rather than invented: a
    // missing alt is an accessibility defect in the REFERENCE and belongs in
    // the handoff, not patched over here.
    if (alt) cuts.push({ start: alt.valueStart, end: alt.valueEnd, role: 'image_alt', escaping: 'attr', value: alt.value, node: n })
    else problems.push(`<img> at ${n.start} has no alt attribute in the reference, so no alt slot could be made`)
  })

  cuts.sort((a, b) => a.start - b.start || a.end - b.end)

  // Overlapping cuts would corrupt the stream. They should be impossible given
  // the deepest-candidate rule, so this asserts rather than repairs.
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i].start < cuts[i - 1].end) {
      problems.push(`overlapping slot regions at ${cuts[i - 1].start}..${cuts[i - 1].end} and ${cuts[i].start}..${cuts[i].end}`)
    }
  }

  /* --- pass 3: sections, roles, ids --------------------------------------- */

  const sectionOf = (offset: number): { index: number; label: string } => {
    for (let i = 0; i < roots.length; i++) {
      if (offset >= roots[i].start && offset < roots[i].end) {
        return { index: i + 1, label: labelBefore(html, roots[i].start, roots[i].tag) }
      }
    }
    return { index: 0, label: 'document' }
  }

  const ctx: Ctx = {
    html,
    headline: slotNodes.find((n) => n.tag === 'h1') ?? null,
    order: cuts.filter((c) => c.escaping === 'text').map((c) => c.node),
  }

  for (const c of cuts) {
    if (c.escaping === 'text') c.role = roleFor(c.node, textOf(html, c.node), ctx)
  }

  /**
   * FAQs the reference draws without `<details>`.
   *
   * Only one of the twelve uses a real disclosure element; the rest draw a
   * question and its answer as two divs inside a repeated card, which no tag
   * rule can tell from any other card. What DOES distinguish them is the
   * question mark: a card whose first line is a question and whose next line is
   * not is an FAQ item in every template that has one. Applied after roles are
   * assigned so it corrects a card_title/card_body pair rather than competing
   * with the tag rules.
   */
  const textCuts = cuts.filter((c) => c.escaping === 'text')
  for (let i = 0; i < textCuts.length - 1; i++) {
    const q = textCuts[i]
    const a = textCuts[i + 1]
    const qText = textOf(html, q.node)
    if (!qText.endsWith('?') || qText.length > 180) continue
    if (q.role !== 'card_title' && q.role !== 'card_body' && q.role !== 'section_headline') continue
    if (a.role !== 'card_body' && a.role !== 'section_body') continue
    // Both halves must sit in the same card, or this pairs the last question of
    // one item with the first line of the next.
    const share = [...ancestors(q.node)].some((x) => a.node.start >= x.contentStart && a.node.end <= x.contentEnd && x.depth > 0)
    if (!share) continue
    const aText = textOf(html, a.node)
    if (aText.endsWith('?')) continue
    q.role = 'faq_question'
    a.role = 'faq_answer'
  }

  const parts: string[] = []
  const slotIds: string[] = []
  const slots: LpSlot[] = []
  const ordinals = new Map<string, number>()

  let cursor = 0
  for (const c of cuts) {
    if (c.start < cursor) continue // already reported as an overlap
    const { index: section, label } = sectionOf(c.start)
    const key = `s${String(section).padStart(2, '0')}_${c.role}`
    const ordinal = (ordinals.get(key) ?? 0) + 1
    ordinals.set(key, ordinal)
    const id = `${key}_${ordinal}`

    parts.push(html.slice(cursor, c.start))
    slotIds.push(id)
    cursor = c.end

    if (c.value.length > maxDefaultChars) {
      problems.push(`slot "${id}" default is ${c.value.length} chars, over the ${maxDefaultChars} limit - the candidate rule probably swallowed a container`)
    }

    const plainLength = textOf(html, c.node).length || c.value.length
    slots.push({
      id,
      role: c.role,
      escaping: c.escaping,
      section,
      sectionLabel: label,
      // For an image slot this is the reference's own placeholder MARKUP, not a
      // URL: an unfilled image well renders the dashed box the design drew, so
      // the default composition stays byte-identical to the reference.
      default: c.value,
      // A headline is what the page is, and a real disclaimer is what the law
      // requires. A short legal LINK ("Privacy Policy") matches the same
      // vocabulary and is not a disclaimer anybody has to write, so length
      // separates them - marking ninety slots required per template would make
      // the check something operators route around.
      required: c.role === 'headline' || (c.role === 'disclaimer' && plainLength >= 80),
      maxChars: Math.max(40, Math.ceil(plainLength * 1.6)),
      ...(c.escaping === 'image' ? { pairedWith: `${id}__alt` } : {}),
    })

    if (c.escaping === 'image') {
      // The alt has no position in the reference because the reference has no
      // image. It is materialised into the <img> the src slot emits.
      slots.push({
        id: `${id}__alt`,
        role: 'image_alt',
        escaping: 'meta',
        section,
        sectionLabel: label,
        default: c.altDefault ?? '',
        required: false,
        maxChars: 160,
        pairedWith: id,
      })
    }
  }
  parts.push(html.slice(cursor))

  // Placeholders the render pipeline does not resolve, outside a loop body.
  const scriptPlaceholders = new Set<string>()
  for (const m of html.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = m[1]
    if (/^(brand|quiz|site|deployment|page|ct|q)\./.test(key)) continue
    scriptPlaceholders.add(key)
  }
  if (scriptPlaceholders.size > 0) {
    unsupported.push({
      kind: 'script-placeholder',
      detail: `values computed by the reference's own script: ${[...scriptPlaceholders].sort().join(', ')}`,
      count: scriptPlaceholders.size,
    })
  }

  return { slug, parts, slotIds, slots, unsupported, problems }
}
