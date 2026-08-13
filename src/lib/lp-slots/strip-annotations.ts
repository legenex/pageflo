/**
 * Removing the handoff's engineering annotations from a reference template.
 *
 * The references carry two kinds of `{{token}}`. One is DATA the product
 * resolves — `{{brand.callNumber}}`, `{{quiz.name}}` — and belongs in the
 * markup. The other is the designer TELLING THE IMPLEMENTER what goes in a
 * region, drawn as a small monospace chip:
 *
 *     <span>UPDATED FOR <code>{{deployment.jurisdiction}}</code></span>
 *     <div>ATTORNEYS IN NETWORK · <code>{{page.network.attorneys}}</code></div>
 *
 * Nothing resolves those. They are not fields on any record and never were:
 * `page.network.attorneys` is a note saying "put the network size here". Left
 * in, they reach a real visitor as literal braces, and a browser-level render
 * check found 16 of them across five templates doing exactly that.
 *
 * They are chrome, in the same sense as the reference toolbar and the
 * `display:{{anno}}` annotation strips the extractor already removes, so they
 * are removed at the same stage and by the same reasoning. Parity is measured
 * against the reference MINUS its annotations, which is the standard
 * `stripChrome` already set — a template that kept them would be a faithful
 * copy of a design document rather than a working page.
 *
 * WHY NOT RESOLVE THEM INSTEAD. That was the alternative and it was rejected:
 * there is no source for most of them, so "resolving" would mean inventing a
 * number about an attorney network, which is a claim, on a legal advertising
 * page, that nobody approved. An operator who wants the line writes it — every
 * one of these sits inside an editable slot.
 *
 * WHY THE CONTAINER GOES TOO. Removing only the chip leaves "UPDATED FOR" or a
 * dangling "·" on the page, which reads as a rendering bug rather than as an
 * absent optional line. When what remains is a label with nothing to label, the
 * whole element goes.
 */
import { scan, walk, inner, textOf, type ScannedNode } from './scan'

/** Namespaces that are annotation rather than data. */
const ANNOTATION = /\{\{\s*(?:deployment|page)\.[\w.]+\s*\}\}/g

/**
 * A token, plus whatever punctuation only existed to attach it to a label.
 *
 * The separator has to go with it or the page shows "FILE REF: MVA-" and
 * "ATTORNEYS IN NETWORK ·", which read as a rendering fault rather than as an
 * optional line nobody filled in. Both sides are matched because the references
 * put the chip on either side of its label.
 */
const ANNOTATION_WITH_SEPARATOR = /\s*[·•+:,;—–-]?\s*\{\{\s*(?:deployment|page)\.[\w.]+\s*\}\}\s*[·•+:,;—–-]?\s*/g

/** What is left when a label has lost its value: a separator, or nothing. */
const DANGLING = /^[\s·•+:,;—–-]*$/

export type StripResult = {
  html: string
  /** How many chips were removed, and how many containers went with them. */
  chipsRemoved: number
  containersRemoved: number
}

export const stripAnnotationChips = (html: string): StripResult => {
  const { roots } = scan(html)

  /**
   * The deepest element containing an annotation token.
   *
   * Deepest, because an ancestor also "contains" it and cutting the ancestor
   * would take its siblings' markup with it. Note the token is often NOT in an
   * element of its own — the references write `ATTORNEYS IN NETWORK ·
   * {{page.network.attorneys}}` as one text run — so this cannot look for a
   * chip element and has to work on whatever element the text lands in.
   */
  const holders: ScannedNode[] = []
  walk(roots, (n) => {
    if (n.selfClosing) return
    ANNOTATION.lastIndex = 0
    if (!ANNOTATION.test(inner(html, n))) return
    let deeper = false
    walk(n.children, (d) => {
      ANNOTATION.lastIndex = 0
      if (!d.selfClosing && ANNOTATION.test(inner(html, d))) deeper = true
    })
    if (!deeper) holders.push(n)
  })

  /**
   * Cut the element, or only the token inside it.
   *
   * Decided by what the element would SAY once the token and its separator are
   * gone. "UPDATED FOR" and "FILE REF: MVA-" are labels that existed only to
   * introduce a value and go entirely; a sentence that happens to contain a
   * token keeps the sentence and loses the token.
   */
  const cuts: Array<{ start: number; end: number; container: boolean }> = []
  for (const holder of holders) {
    const content = inner(html, holder)
    const cleanedText = content.replace(ANNOTATION_WITH_SEPARATOR, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

    // A label is short and now says nothing, or ends where its value used to
    // start. Anything longer is real copy.
    const isLabel = DANGLING.test(cleanedText) || (cleanedText.length <= 40 && /[·•+:,;—–-]$/.test(cleanedText))

    if (isLabel && holder.parent) {
      cuts.push({ start: holder.start, end: holder.end, container: true })
      continue
    }

    // Otherwise cut each token in place, within this element's content only, so
    // an offset computed here cannot reach into a sibling.
    ANNOTATION_WITH_SEPARATOR.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ANNOTATION_WITH_SEPARATOR.exec(content))) {
      cuts.push({
        start: holder.contentStart + m.index,
        end: holder.contentStart + m.index + m[0].length,
        container: false,
      })
    }
  }

  // Right to left, so every offset stays valid, and skipping anything already
  // inside a removed container.
  cuts.sort((a, b) => b.start - a.start)
  let out = html
  let last = Number.POSITIVE_INFINITY
  let chipsRemoved = 0
  let containersRemoved = 0
  for (const c of cuts) {
    if (c.end > last) continue
    out = out.slice(0, c.start) + out.slice(c.end)
    last = c.start
    if (c.container) containersRemoved++
    else chipsRemoved++
  }

  return { html: out, chipsRemoved, containersRemoved }
}

/** Every annotation token still present. Empty is the passing state. */
export const remainingAnnotationTokens = (html: string): string[] =>
  [...html.matchAll(/\{\{\s*((?:deployment|page)\.[\w.]+)\s*\}\}/g)].map((m) => m[1])

/** Re-exported so the extractor can report on what it walked. */
export { inner }
