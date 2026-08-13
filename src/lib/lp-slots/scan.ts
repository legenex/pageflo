/**
 * A byte-exact scanner over the ported templates' markup.
 *
 * The twelve landing-page templates are the design handoff's own HTML, carried
 * over so that rendering them with no brand variables reproduces the reference
 * exactly. That property is the reason the port can be checked rather than
 * trusted, and it is fragile in one specific way: **any parse-and-serialise
 * round trip destroys it.** parse5 (and so cheerio, and so jsdom) will requote
 * attributes, re-encode entities, close implied tags and normalise self-closing
 * syntax. Each of those is individually harmless and collectively means the
 * markup is no longer the reference's.
 *
 * So nothing here ever rebuilds HTML. The scanner reports OFFSETS into the
 * original string and the caller slices it. A template that goes through slot
 * extraction and comes back out is byte-identical by construction, not by
 * carefulness, and `scripts/test-lp-slots.mts` asserts exactly that.
 *
 * It is a scanner rather than a parser on purpose: it does not attempt error
 * recovery, implied end tags, or the full tokenizer state machine. It handles
 * what these documents actually contain — inline-styled elements, SVG with
 * self-closing children, HTML comments, and the handoff's own `<script>` and
 * `<sc-for>` — and `scan()` reports anything it could not account for rather
 * than guessing, so a reference that grows a construct this does not know about
 * fails loudly instead of silently losing content.
 */

/** Elements that never have content and never close. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Elements whose content is raw text, not markup.
 *
 * A `<` inside one of these is data, so the scanner must skip to the matching
 * close tag rather than tokenising through it. Missing this is how a scanner
 * silently loses the rest of a document.
 */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])

export type ScannedAttr = {
  name: string
  /** The value with quotes removed, exactly as written (entities NOT decoded). */
  value: string
  /** Offsets of the value's first and last character, excluding the quotes. */
  valueStart: number
  valueEnd: number
}

export type ScannedNode = {
  tag: string
  attrs: ScannedAttr[]
  /** Offset of the `<` that opens this element. */
  start: number
  /** Offset just past the `>` of the closing tag (or the open tag, if void). */
  end: number
  /** Offset just past the `>` of the OPEN tag. Where content begins. */
  contentStart: number
  /** Offset of the `<` of the CLOSE tag. Where content ends. */
  contentEnd: number
  /** True for a void element or one written `<x />`. Content range is empty. */
  selfClosing: boolean
  children: ScannedNode[]
  parent: ScannedNode | null
  /** Depth from the root list; a top-level element is 0. */
  depth: number
}

export type ScanResult = {
  roots: ScannedNode[]
  /** Anything the scanner could not account for. Non-empty means do not trust it. */
  problems: string[]
}

const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g

const ATTR = /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

const parseAttrs = (raw: string, rawStart: number): ScannedAttr[] => {
  const out: ScannedAttr[] = []
  ATTR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR.exec(raw))) {
    const [whole, name, dq, sq, bare] = m
    const value = dq ?? sq ?? bare ?? ''
    // Offset of the value within `whole`: everything up to the value, plus the
    // opening quote when there is one. Computed rather than assumed so an
    // attribute written with odd spacing still points at the right bytes.
    const eq = whole.indexOf('=')
    let valueStart = rawStart + m.index + whole.length
    if (eq > -1) {
      const afterEq = whole.slice(eq + 1)
      const lead = afterEq.length - afterEq.replace(/^\s*['"]?/, '').length
      valueStart = rawStart + m.index + eq + 1 + lead
    }
    out.push({ name, value, valueStart, valueEnd: valueStart + value.length })
  }
  return out
}

/**
 * Scan a fragment into an element tree of offsets.
 *
 * Unbalanced close tags and unclosed elements are reported rather than repaired.
 * The reference documents are machine-generated and well formed; if one stops
 * being so, that is a fact about the handoff worth failing on.
 */
export const scan = (html: string): ScanResult => {
  const roots: ScannedNode[] = []
  const stack: ScannedNode[] = []
  const problems: string[] = []

  const push = (node: ScannedNode): void => {
    const parent = stack[stack.length - 1] ?? null
    node.parent = parent
    node.depth = stack.length
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  TAG.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG.exec(html))) {
    const [whole, closeTag, openTag, attrRaw, slash] = m

    if (closeTag) {
      const tag = closeTag.toLowerCase()
      // Find the nearest matching open element. Anything above it on the stack
      // was never closed, which is a defect in the source rather than something
      // to paper over, so it is reported.
      let i = stack.length - 1
      while (i >= 0 && stack[i].tag !== tag) i--
      if (i < 0) {
        problems.push(`stray close tag </${tag}> at ${m.index}`)
        continue
      }
      for (let j = stack.length - 1; j > i; j--) {
        problems.push(`unclosed <${stack[j].tag}> at ${stack[j].start}`)
      }
      const node = stack[i]
      node.contentEnd = m.index
      node.end = m.index + whole.length
      stack.length = i
      continue
    }

    if (!openTag) continue // comment, doctype, CDATA — not an element

    const tag = openTag.toLowerCase()
    const contentStart = m.index + whole.length
    const isVoid = VOID_TAGS.has(tag) || slash === '/'
    const node: ScannedNode = {
      tag,
      attrs: parseAttrs(attrRaw ?? '', m.index + whole.indexOf(attrRaw ?? '', 1 + tag.length)),
      start: m.index,
      end: contentStart,
      contentStart,
      contentEnd: contentStart,
      selfClosing: isVoid,
      children: [],
      parent: null,
      depth: stack.length,
    }
    push(node)
    if (isVoid) continue

    if (RAW_TEXT_TAGS.has(tag)) {
      // Content is data. Skip straight to the close tag so a `<` inside it is
      // never tokenised — the handoff's `<script type="text/x-dc">` blocks are
      // full of JSX-ish source and would otherwise shred the rest of the scan.
      const close = html.toLowerCase().indexOf(`</${tag}`, contentStart)
      if (close < 0) {
        problems.push(`unclosed raw-text <${tag}> at ${m.index}`)
        continue
      }
      const gt = html.indexOf('>', close)
      node.contentEnd = close
      node.end = gt < 0 ? html.length : gt + 1
      TAG.lastIndex = node.end
      continue
    }

    stack.push(node)
  }

  for (const left of stack) problems.push(`unclosed <${left.tag}> at ${left.start}`)

  return { roots, problems }
}

/** Depth-first walk in document order, including the roots themselves. */
export const walk = (nodes: ScannedNode[], visit: (n: ScannedNode) => void): void => {
  for (const n of nodes) {
    visit(n)
    walk(n.children, visit)
  }
}

/** The raw inner markup of an element, sliced from the original string. */
export const inner = (html: string, n: ScannedNode): string =>
  n.selfClosing ? '' : html.slice(n.contentStart, n.contentEnd)

/** The text an element contributes, with tags removed. Entities left as written. */
export const textOf = (html: string, n: ScannedNode): string =>
  inner(html, n).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

/** An attribute by name, or undefined. */
export const attr = (n: ScannedNode, name: string): ScannedAttr | undefined =>
  n.attrs.find((a) => a.name.toLowerCase() === name)

/** The value of a `style` declaration, e.g. `font-size`. Empty when unset. */
export const styleProp = (n: ScannedNode, prop: string): string => {
  const style = attr(n, 'style')?.value ?? ''
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return m ? m[1].trim() : ''
}
