/**
 * Semantic content slots for the twelve ported landing-page templates.
 *
 * THE PROBLEM THIS SOLVES. The twelve are the design handoff's own markup, one
 * large HTML string per template. That is what makes them pixel-accurate and it
 * is also why nothing in them could be edited: the copy is inside the markup,
 * so "reskin a deployment" meant changing colours and nothing else. Two
 * deployments of one template under two brands said the same words.
 *
 * THE SHAPE OF THE FIX. A slot is a named, typed hole in the markup. The
 * template ships as an alternating list — literal HTML, slot, literal HTML,
 * slot — so composing a page is a string join rather than a DOM rebuild, and
 * the literal parts are byte-for-byte the reference's. Joining the parts with
 * every slot's DEFAULT reproduces the original template exactly, which is the
 * property `scripts/test-lp-slots.mts` asserts and which keeps the parity claim
 * checkable rather than asserted.
 *
 * WHERE THE SLOTS COME FROM. Not from hand-editing the generated modules: those
 * are overwritten by `scripts/extract-lp-templates.mjs` every time it runs, so
 * anything written into them by hand is lost the next time the handoff changes.
 * The slot IDs are DERIVED by the extractor from the reference's own structure,
 * which means re-running it reproduces the same ids from the same input and a
 * change in the design shows up as a changed id rather than as silence.
 *
 * WHAT A DEPLOYMENT STORES. Overrides only, `{ [slotId]: string }`. The stock
 * defaults are immutable build assets. A deployment that overrides nothing
 * renders the reference; a deployment that overrides three lines renders the
 * reference with three lines changed. There is no copy of the template per
 * deployment, so a corrected template reaches every deployment at once.
 *
 * ESCAPING. A default is trusted markup from the build. An override is operator
 * input and is escaped for its position — HTML text or attribute value — so an
 * override cannot introduce an element, an event handler, or a `javascript:`
 * URL. That is enforced in `composeTemplate` below rather than at the call
 * sites, because a call site that forgets is indistinguishable from one that
 * does not exist yet.
 */

import { RESOLVABLE_TOKEN_KEYS } from '@/components/builder/lp/tokens'
import { relativeLuminance } from '@/lib/builder/page-lint'
import { resolveCssColor } from '@/lib/lp-templates/resolve-css-color'
import { isPublicImageHost } from '@/lib/net/image-hosts.mjs'
import type { LpQuizMount } from './quiz-mount'

/**
 * Whether a template colour declaration paints something dark.
 *
 * Derived through the same variables the wrapper sets rather than guessed from
 * the reference's own hex, so a light template deployed under a dark brand
 * chooses the dark-ground logo. An unresolvable declaration answers `false` —
 * the light mark — because that is what the references themselves assume and a
 * wrong guess in the other direction hides a dark logo on a dark band.
 */
const isDarkDeclaration = (declaration: string, vars?: Record<string, string>): boolean => {
  const hex = resolveCssColor(declaration, vars ?? {})
  if (!hex) return false
  const lum = relativeLuminance(hex)
  return lum != null && lum < 0.5
}

/* ------------------------------------------------------------------- roles */

/**
 * What a slot IS, semantically.
 *
 * The list is closed on purpose. An open one degenerates into every template
 * naming its regions differently, which is the state the twelve were already
 * in, and it makes "write me a headline" impossible to ask for generically —
 * the AI adapter and the deployment editor both dispatch on this.
 */
export const SLOT_ROLES = [
  'eyebrow',
  'headline',
  'subheadline',
  'cta_label',
  'trust_line',
  'section_headline',
  'section_body',
  'card_title',
  'card_body',
  'faq_question',
  'faq_answer',
  'disclaimer',
  'image_src',
  'image_alt',
  /**
   * Visible, editable, and none of the above. Not a failure: a landing page has
   * legends, table cells, step numbers and captions that are genuinely just
   * text. Naming them honestly beats forcing them into a role they do not have,
   * which would make the roles useless for dispatch.
   */
  'text',
] as const

export type SlotRole = (typeof SLOT_ROLES)[number]

/** Roles whose value is a URL, and which therefore need URL validation. */
export const URL_ROLES: ReadonlySet<SlotRole> = new Set<SlotRole>(['image_src'])

/* ------------------------------------------------------------------- model */

export type SlotEscaping =
  /** The slot sits between tags. Its value is escaped as HTML text. */
  | 'text'
  /** The slot sits inside a double-quoted attribute value. */
  | 'attr'
  /**
   * The slot is a reference IMAGE PLACEHOLDER — one of the handoff's dashed
   * boxes labelled `[LOGO SLOT]`, `[BRAND IMAGE SLOT]`, `[TRUST MARK]`.
   *
   * None of the twelve references contains a single `<img>`: every image is
   * drawn as a labelled box, because the handoff had no brand assets to put in
   * one. So there is no `src` attribute to make into a slot, and inventing an
   * `<img>` unconditionally would break the parity claim the whole port rests
   * on. Instead the box's CONTENT is the slot: empty override renders the
   * reference's own placeholder byte-for-byte, and a supplied URL replaces it
   * with a real `<img>` carrying the paired alt text.
   */
  | 'image'
  /**
   * Not in the markup at all.
   *
   * Alt text has nowhere to live until an image exists. It is still a real,
   * required, editable value — an image with no alt is an accessibility defect
   * — so it is a slot, paired to its image, and materialised into the `<img>`
   * tag at composition time.
   */
  | 'meta'

export type LpSlot = {
  /**
   * Stable within a template. Derived from the reference's own structure:
   * `s<section>_<role>_<ordinal>`. Positional rather than content-hashed, so an
   * operator's override survives a copy edit to the reference but is correctly
   * invalidated when the region itself moves or disappears.
   */
  id: string
  role: SlotRole
  escaping: SlotEscaping
  /** 1-based index of the top-level element this slot lives in. */
  section: number
  /** The section's label, taken from the reference's own comment above it. */
  sectionLabel: string
  /** The reference's own content for this slot. Immutable. */
  default: string
  /**
   * An operator MUST supply this before publishing.
   *
   * Only the roles a page cannot be honest without: a headline, and any legal
   * disclaimer the reference carries. Marking everything required would make
   * the check unusable and marking nothing required would make it decorative.
   */
  required: boolean
  /** Roughly how long the reference's own copy is, for editor guidance. */
  maxChars: number
  /**
   * The other half of an image pair: `image_src` names its `image_alt` and
   * vice versa. Composition needs it because the alt is written into a tag the
   * src slot emits, and the editor needs it to show the two together.
   */
  pairedWith?: string
  /**
   * What KIND of asset an image well is asking for.
   *
   * A LOGO has a brand-level answer and a neutral fallback — the brand's own
   * name, set in the type the design chose for that well. Any other picture has
   * neither, so an unfilled one is REMOVED rather than stood in for: a page with
   * one fewer photograph is a page, and a page with a labelled grey rectangle on
   * it is a mockup somebody published.
   */
  /**
   * The reference has NO usable content for this slot, so an operator must
   * write some before the page can go live.
   *
   * Set where the handoff's own content was only an annotation label —
   * `[CASE RESULT PLACEHOLDER]` — which is a case result on a legal advertising
   * page. There is no honest default for that, so the slot ships empty and the
   * publish preflight refuses until somebody fills it. Distinct from `required`,
   * which means "must not be BLANKED": a headline is required and ships with the
   * reference's own perfectly good words.
   */
  mustSupply?: boolean
  /**
   * What a VISITOR is shown when nothing overrides this slot.
   *
   * Absent for almost every slot, where the reference's own copy is the answer.
   * Present where the handoff's content carried one of its own annotations —
   * `[LEGAL DISCLOSURE] · {{brand.disclaimer}}` cleans to the token alone — so
   * `default` can stay the reference's bytes, which is what keeps parity a claim
   * about the handoff and keeps the slots re-derivable from the shipped markup.
   */
  liveDefault?: string
  assetKind?: 'logo' | 'image'
  /** The reference's own presentation of an image well. See `renderImageWell`. */
  well?: {
    /** The well's opening tag verbatim, for its geometry. */
    openTag: string
    /** The style of the label inside it, reused when a brand falls back to its name. */
    labelStyle: string
    /** The opaque ground it sits on, for choosing a light or dark logo. */
    surface: string
  }
}

/**
 * A region the extractor found but cannot make editable.
 *
 * Recorded rather than dropped. The handoff's `<sc-for>` loops and the
 * placeholders their bodies read (`{{ct.name}}`) are driven by JavaScript that
 * lives in the reference's own `<script>` block, so the markup alone does not
 * contain the content. Silently shipping those would put `{{ct.name}}` on a
 * live page; silently dropping them would delete a section. Declaring them lets
 * `validateTemplateSlots` fail the template and say why.
 */
export type LpUnsupportedRegion = {
  kind: 'sc-for' | 'script-placeholder'
  detail: string
  count: number
}

/**
 * A template as the renderer consumes it.
 *
 * `parts.length === slotIds.length + 1` always. That invariant is what makes
 * composition a join; `validateTemplateSlots` checks it, because an off-by-one
 * here silently drops the last section of a page.
 */
export type LpSlottedTemplate = {
  slug: string
  parts: string[]
  slotIds: string[]
  slots: LpSlot[]
  unsupported: LpUnsupportedRegion[]
  /**
   * Where the live quiz replaces the reference's drawing of one.
   *
   * Optional in the TYPE and mandatory in the DATA: the extractor refuses to
   * write a template whose card it could not locate. It is nullable here so a
   * synthetic template in a test, or a future non-quiz template, composes whole
   * rather than being unrepresentable.
   */
  quizMount?: LpQuizMount | null
}

export type LpSlotOverrides = Record<string, string>

/* ---------------------------------------------------------------- escaping */

/**
 * HTML text escaping.
 *
 * `&` first, or the ampersands introduced by the later replacements are escaped
 * again. `<` and `>` stop an override from opening an element; the quotes are
 * escaped too so one function is safe in both positions and a future caller
 * cannot pick the wrong one.
 */
export const escapeHtmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * Whether a URL is safe to put in `src`.
 *
 * An allow-list, not a deny-list. `javascript:` is the obvious one, but `data:`
 * matters as much — `data:text/html` in an iframe src is script execution, and
 * the template thumbnails render in iframes. Relative and protocol-relative
 * paths are allowed because the reference uses them.
 */
export const isSafeImageUrl = (value: string): boolean => {
  const v = value.trim()
  if (v === '') return true

  /*
   * ABSOLUTE AND PROTOCOL-RELATIVE FIRST, and the order is the fix.
   *
   * The relative-path test used to run first and read `/^\.{0,2}\//`, which with
   * zero dots matches ANY string beginning with a slash — so `//evil.example/x`
   * was admitted as "a relative path" and never examined as the absolute URL it
   * is. Two leading slashes is a scheme-relative URL to another host.
   */
  if (/^(https?:)?\/\//i.test(v)) {
    try {
      const url = new URL(v.startsWith('//') ? `https:${v}` : v)
      // Credentials in an image URL are either a mistake or a way to make a
      // browser send them somewhere.
      if (url.username !== '' || url.password !== '') return false
      const host = url.hostname.startsWith('[') && url.hostname.endsWith(']')
        ? url.hostname.slice(1, -1)
        : url.hostname
      // A PUBLIC host. This server never fetches a brand's logo — the template
      // emits a plain `<img>` and the visitor's browser does — but a tenant
      // pointing every visitor at `http://169.254.169.254/` is an intranet probe
      // running in somebody else's browser, and there is no legitimate brand
      // asset at an address like that.
      return isPublicImageHost(host)
    } catch {
      return false
    }
  }

  // A path on this site: `/logo.png`, `./logo.png`, `../logo.png`.
  if (/^\/[^/]/.test(v) || /^\.{1,2}\//.test(v)) return true

  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+\/=\s]+$/i.test(v)) return true

  return false
}

/* ------------------------------------------------------------ image wells */

/**
 * A brand's artwork, as an image well needs it.
 *
 * `vars` is the CSS variable table the template wrapper sets, so a well's own
 * ground can be RESOLVED rather than assumed and a brand's light or dark logo
 * chosen against the colour it will actually be seen on. Passing nothing there
 * is honest and falls back to the light mark, which is what the references
 * themselves assume.
 */
export type BrandAssets = {
  logoUrl: string
  logoUrlDark: string
  /** What a brand with no artwork is called. Never empty on a real brand. */
  wordmark: string
  vars?: Record<string, string>
}

export type ComposeOptions = {
  /** The brand's artwork. Absent means no brand is in hand. */
  assets?: BrandAssets | null
  /**
   * Emit the reference's own placeholder wells verbatim.
   *
   * ONLY for the parity target. Every other caller degrades, because the
   * default has to be the safe one: a caller that forgets this flag renders a
   * page, and a caller that forgot the opposite flag published `[LOGO SLOT]` to
   * a live public landing page, which is where this rule comes from.
   */
  keepReferencePlaceholders?: boolean
}

/**
 * Turn a placeholder well's own style into a FILLED well's style.
 *
 * The design draws an empty well as a dashed frame around a grey fill. Both are
 * the drawing of an absence: once something is in the well they are wrong, and
 * a real brand logo arriving inside a dashed grey box was what shipped.
 *
 * The frame is made transparent rather than removed, so the well keeps the
 * exact size it had — dropping a 1.5px border on both axes moves everything
 * beside it by three pixels, which is a parity regression nobody would connect
 * to a logo.
 */
export const filledWellStyle = (openTag: string): string => {
  const style = /\sstyle\s*=\s*"([^"]*)"/i.exec(openTag)?.[1] ?? ''
  return style
    .split(';')
    .map((decl) => {
      const [rawProp, ...rest] = decl.split(':')
      const prop = rawProp.trim().toLowerCase()
      const value = rest.join(':').trim()
      if (!prop || !value) return ''
      if (prop === 'background' || prop === 'background-color' || prop === 'background-image') return ''
      if (prop.startsWith('border') && /\bdashed\b/i.test(value)) {
        const width = value.trim().split(/\s+/)[0]
        return `${prop}:${width} solid transparent`
      }
      return `${prop}:${value}`
    })
    .filter(Boolean)
    .join(';')
}

/** The element name an opening tag opens. */
const tagNameOf = (openTag: string): string => (/^<([a-zA-Z][\w:-]*)/.exec(openTag)?.[1] ?? 'div').toLowerCase()

/**
 * What an image well renders as.
 *
 * Four outcomes, in this order:
 *
 *  1. THE DEPLOYMENT'S OWN URL. An operator who chose a picture gets it.
 *  2. THE BRAND'S LOGO, for a well the design asked for a logo in. This is the
 *     Brand Identity asset contract doing its job: a brand supplies its mark
 *     once and every well in every template that wants one has it, rather than
 *     an operator pasting the same URL into twelve deployments.
 *  3. THE BRAND'S NAME, for a logo well when the brand has no mark. Set in the
 *     type the design chose for that well, inside the well's own box. Every
 *     brand has a name, so this outcome is always available and always says
 *     something true.
 *  4. NOTHING, for any other picture. A page with one fewer photograph is a
 *     page. A page with a dashed grey rectangle labelled `[BRAND IMAGE SLOT]`
 *     is a mockup somebody published, and that is what was measured live.
 */
const renderImageWell = (
  slot: LpSlot,
  url: string,
  alt: string,
  assets: BrandAssets | null | undefined,
): string => {
  const well = slot.well
  const openTag = well?.openTag ?? ''
  const tag = tagNameOf(openTag)
  const geometry = filledWellStyle(openTag)
  const isLogo = slot.assetKind === 'logo'

  const picture = (src: string): string =>
    `<${tag} style="${escapeHtmlText(geometry)}">` +
    `<img src="${escapeHtmlText(src)}" alt="${escapeHtmlText(alt)}" loading="lazy" decoding="async" ` +
    // `contain` for a mark, `cover` for a photograph. Cropping a logo to fill a
    // box is how a brand's name loses its last two letters.
    `style="display:block;width:100%;height:100%;object-fit:${isLogo ? 'contain' : 'cover'}"></${tag}>`

  if (url) return picture(url)
  if (!assets) return ''

  if (isLogo) {
    const dark = isDarkDeclaration(well?.surface ?? '', assets.vars)
    // Through the same allow-list a deployment override goes through. A brand's
    // logo URL is tenant input that reaches a `src`, so "it came from the brand
    // record" is not a reason to trust it — that is exactly the reasoning that
    // put a stored XSS in this component once already.
    const candidates = dark
      ? [assets.logoUrlDark, assets.logoUrl]
      : [assets.logoUrl, assets.logoUrlDark]
    const mark = candidates.find((c) => c && isSafeImageUrl(c) && c.trim() !== '') ?? ''
    if (mark) return picture(mark)

    const name = assets.wordmark.trim()
    if (!name) return ''
    return (
      `<${tag} style="${escapeHtmlText(geometry)}">` +
      `<span style="${escapeHtmlText(well?.labelStyle ?? '')}">${escapeHtmlText(name)}</span></${tag}>`
    )
  }

  return ''
}

/* -------------------------------------------------------------- composition */

export type ComposeResult = {
  html: string
  /** Overrides that named no slot in this template. Never silently applied. */
  unknownOverrides: string[]
  /** Overrides refused for their content, e.g. an unsafe image URL. */
  refused: Array<{ id: string; reason: string }>
  /** Slot ids that took an override, in template order. */
  applied: string[]
}

/**
 * Build a template's HTML from its parts and a set of overrides.
 *
 * The ONE composition path. The builder preview, the public render, the
 * thumbnail document and the AI adapter's before/after all call this, so a page
 * cannot look one way in the builder and another way live — which is the class
 * of bug the twelve were already prone to, being one string with no seam.
 *
 * An unknown override is REPORTED, not applied and not ignored: it means the
 * template changed under a saved deployment, and the operator needs to know
 * that a line they wrote is no longer on the page.
 */
export const composeTemplate = (
  template: LpSlottedTemplate,
  overrides: LpSlotOverrides = {},
  opts: ComposeOptions = {},
): ComposeResult => {
  const byId = new Map(template.slots.map((s) => [s.id, s]))
  const unknownOverrides = Object.keys(overrides).filter((k) => !byId.has(k))
  const refused: Array<{ id: string; reason: string }> = []
  const applied: string[] = []

  const out: string[] = []
  for (let i = 0; i < template.parts.length; i++) {
    out.push(template.parts[i])
    const id = template.slotIds[i]
    if (id === undefined) continue

    const slot = byId.get(id)
    if (!slot) {
      // A slot id in the stream with no metadata is a corrupt template. Emitting
      // nothing would delete content; emitting the id would print it on the
      // page. Neither is acceptable, so this is reported and the part is left
      // empty, and validateTemplateSlots refuses the template outright.
      refused.push({ id, reason: 'slot id appears in the markup but has no definition' })
      continue
    }

    const raw = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : undefined

    /*
     * An image slot is a WELL — the reference's dashed box — and its override is
     * a URL. Four things can be true of it and only one of them is "render the
     * design's placeholder":
     *
     *  - an operator supplied a URL          -> that picture
     *  - a brand supplied a logo             -> that mark, for a logo well
     *  - a brand supplied neither            -> its name, or nothing
     *  - the caller asked for the reference  -> the placeholder, for parity
     *
     * The last is a deliberate opt-in and the ONLY path that can put
     * `[LOGO SLOT]` on a page, because that string was measured on a live public
     * landing page and the default has to be the one that cannot do it.
     */
    if (slot.escaping === 'image') {
      const url = (raw ?? '').trim()
      let safe = ''
      if (url !== '') {
        if (isSafeImageUrl(url)) safe = url
        else refused.push({ id, reason: `"${url.slice(0, 60)}" is not an allowed image URL` })
      }
      if (opts.keepReferencePlaceholders && safe === '') { out.push(slot.default); continue }

      const altSlot = slot.pairedWith ? byId.get(slot.pairedWith) : undefined
      const alt = altSlot
        ? (Object.prototype.hasOwnProperty.call(overrides, altSlot.id) ? overrides[altSlot.id] : altSlot.default)
        : ''
      if (safe !== '') applied.push(id)
      out.push(renderImageWell(slot, safe, alt, opts.assets))
      continue
    }

    // What this slot says with nothing overriding it. The reference's own copy,
    // except where that copy was an annotation the design was making to itself.
    const stock = opts.keepReferencePlaceholders ? slot.default : slot.liveDefault ?? slot.default

    if (raw === undefined || raw === slot.default || raw === stock) {
      out.push(stock)
      continue
    }

    if (URL_ROLES.has(slot.role) && !isSafeImageUrl(raw)) {
      refused.push({ id, reason: `"${raw.slice(0, 60)}" is not an allowed image URL` })
      out.push(stock)
      continue
    }

    applied.push(id)
    out.push(escapeHtmlText(raw))
  }

  return { html: out.join(''), unknownOverrides, refused, applied }
}

/**
 * The template exactly as the reference drew it. The parity target.
 *
 * The one caller that WANTS the placeholder wells: parity is a claim about the
 * asset, and an asset that degraded its own image wells would no longer be the
 * handoff's markup.
 */
export const defaultHtml = (template: LpSlottedTemplate): string =>
  composeTemplate(template, {}, { keepReferencePlaceholders: true }).html

/* ------------------------------------------------------------- quiz mount */

/**
 * The attribute the live render marks the quiz mount with.
 *
 * A data attribute rather than an id: an id is a document-wide name a tenant's
 * own copy could collide with, and `querySelector('#...')` would then attach the
 * quiz to whichever came first.
 */
export const QUIZ_MOUNT_ATTR = 'data-legalos-quiz-mount'

export type ComposeWithMountResult = ComposeResult & {
  /** Markup before the quiz card. */
  before: string
  /** Markup after it. */
  after: string
  /** The card's own markup, which the live render does NOT emit. */
  reference: string
  /**
   * The card's own box, EMPTY, marked for the runtime to mount into.
   *
   * The reference's opening tag verbatim with one attribute added, so the quiz
   * inherits the card's width, flex basis, padding, border, radius and shadow
   * from the design rather than from a description of the design.
   */
  mountHtml: string
  /**
   * The whole page with the static card replaced by that empty box.
   *
   * ONE string, not two, and that is the load-bearing detail: `before` ends
   * inside an open element and `after` begins with its closing tag, so setting
   * them as the innerHTML of two separate nodes would have the parser repair
   * each half and produce a different tree. The page is mounted whole and the
   * runtime is portalled into the marked box, which keeps the DOM the
   * reference's by construction.
   */
  htmlWithMount: string
  /**
   * Slot ids that live inside the card.
   *
   * They have no position on a live landing page: the quiz owns that copy now.
   * Returned rather than dropped in silence so the deployment editor can stop
   * offering them and a preflight can tell an operator that a line they wrote
   * is not on the page.
   */
  mountedSlotIds: string[]
}

/**
 * The card's opening tag with the mount marker added.
 *
 * Inserted immediately after the tag name so it cannot land inside an attribute
 * value, and written with an explicit empty value so the result is well-formed
 * for a strict parser as well as for a browser.
 */
const markMountTag = (openTag: string): string =>
  openTag.replace(/^<([a-zA-Z][\w:-]*)/, (_m, tag) => `<${tag} ${QUIZ_MOUNT_ATTR}=""`)

/**
 * Compose a template split around its quiz card.
 *
 * The two halves are exactly what `composeTemplate` would have produced, cut at
 * a coordinate fixed at extraction time. Nothing is parsed, nothing is
 * re-serialised, and the cut cannot drift with an override because it is
 * expressed in the part stream rather than in byte offsets into the output.
 *
 * `before + reference + after === composeTemplate(template, overrides).html`
 * whenever no override targets a slot inside the card, and that identity is
 * asserted for all twelve templates in `scripts/test-lp-slots.mts`. It is the
 * proof that mounting the runtime moves nothing else on the page.
 *
 * A template with no recorded mount composes whole, with `after` empty. That is
 * the honest degradation: the page still renders, and the caller sees there is
 * nowhere to put a quiz rather than getting one dropped at the end.
 */
export const composeTemplateWithQuizMount = (
  template: LpSlottedTemplate,
  overrides: LpSlotOverrides = {},
  opts: ComposeOptions = {},
): ComposeWithMountResult => {
  const rawMount = template.quizMount
  const base = composeTemplate(template, overrides, opts)

  /*
   * A mount whose coordinates do not address this part stream is treated as no
   * mount at all.
   *
   * They cannot drift today - the extractor writes both in one pass and refuses
   * to write a template it could not locate - but the failure mode if they ever
   * did is the whole page after the bad index disappearing, silently, on a live
   * landing page. Composing WHOLE is the honest degradation: the visitor gets
   * the page, and the caller sees there is nowhere to put a quiz.
   */
  const addressable =
    rawMount != null &&
    Number.isInteger(rawMount.startPart) &&
    Number.isInteger(rawMount.endPart) &&
    rawMount.startPart >= 0 &&
    rawMount.startPart <= rawMount.endPart &&
    rawMount.endPart < template.parts.length &&
    rawMount.startOffset >= 0 &&
    rawMount.startOffset <= template.parts[rawMount.startPart].length &&
    rawMount.endOffset >= 0 &&
    rawMount.endOffset <= template.parts[rawMount.endPart].length &&
    (rawMount.startPart !== rawMount.endPart || rawMount.startOffset <= rawMount.endOffset)

  const mount = addressable ? rawMount : null
  if (!mount) {
    return {
      ...base,
      before: base.html,
      after: '',
      reference: '',
      mountHtml: '',
      htmlWithMount: base.html,
      mountedSlotIds: [],
    }
  }

  /**
   * The composed value of ONE slot in the stream.
   *
   * Deliberately delegates to `composeTemplate` on a one-slot template rather
   * than repeating its escaping rules. A second implementation of "escape an
   * override" is precisely the drift this module's header warns about, and the
   * one that would matter most: it is the boundary between operator copy and
   * markup. An image slot's paired alt override travels with it, because the
   * alt is written into the `<img>` the src slot emits and dropping it here
   * would make an image lose its alt text only on landing pages.
   */
  const slotAt = (index: number): string => {
    const id = template.slotIds[index]
    if (id === undefined) return ''
    const slot = template.slots.find((s) => s.id === id)
    const keys = [id, ...(slot?.pairedWith ? [slot.pairedWith] : [])]
    const scoped: LpSlotOverrides = {}
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) scoped[k] = overrides[k]
    }
    return composeTemplate({ ...template, parts: ['', ''], slotIds: [id], quizMount: null }, scoped, opts).html
  }

  /**
   * The stream from `parts[from]` up to but NOT including `parts[to]`:
   * `parts[from] slot[from] parts[from+1] … slot[to-1]`. Empty when `to <= from`.
   */
  const run = (from: number, to: number): string => {
    const out: string[] = []
    for (let i = from; i < to; i++) out.push(template.parts[i], slotAt(i))
    return out.join('')
  }

  const lastPart = template.parts.length - 1
  const { startPart, startOffset, endPart, endOffset } = mount

  const before = run(0, startPart) + template.parts[startPart].slice(0, startOffset)

  const after =
    template.parts[endPart].slice(endOffset) +
    (endPart === lastPart ? '' : slotAt(endPart) + run(endPart + 1, lastPart) + template.parts[lastPart])

  const reference =
    startPart === endPart
      ? template.parts[startPart].slice(startOffset, endOffset)
      : template.parts[startPart].slice(startOffset) +
        slotAt(startPart) +
        run(startPart + 1, endPart) +
        template.parts[endPart].slice(0, endOffset)

  const closeTag = `</${mount.tag}>`
  const mountHtml = `${markMountTag(mount.openTag)}${closeTag}`

  return {
    ...base,
    before,
    after,
    reference,
    mountHtml,
    htmlWithMount: before + mountHtml + after,
    mountedSlotIds: mount.slotIds,
  }
}

/* --------------------------------------------------------------- validation */

export type SlotProblem = {
  code:
    | 'duplicate_slot_id'
    | 'missing_required_role'
    | 'unknown_override'
    | 'no_editable_slots'
    | 'unresolved_placeholder'
    | 'stream_mismatch'
    | 'orphan_slot'
    | 'unsupported_region'
    | 'unsafe_override'
    /** Copy written into the region the live quiz replaces. It would never render. */
    | 'override_inside_quiz_mount'
  detail: string
}

export type SlotValidation = { ok: boolean; problems: SlotProblem[] }

/**
 * Roles a landing page must have to be publishable.
 *
 * Deliberately short. A page with no headline is not a landing page, and a page
 * with no call to action cannot convert, so those two are structural. Everything
 * else varies legitimately between a 5-section short-form template and a
 * 14-section editorial one, and requiring it would encode one template's shape
 * as the rule for all twelve.
 */
export const REQUIRED_ROLES: readonly SlotRole[] = ['headline', 'cta_label']

/**
 * Placeholders the render pipeline resolves.
 *
 * The ACTUAL lookup table, imported from the resolver, not a namespace prefix.
 * Trusting the prefix is what let `{{brand.logo}}` and
 * `{{quiz.estimatedDuration}}` ship in all twelve: both are spelled like tokens,
 * both sit in a namespace that resolves, and neither was in the table, so both
 * reached visitors as literal braces.
 */
const isResolvedToken = (key: string): boolean => RESOLVABLE_TOKEN_KEYS.has(key)

/**
 * Namespaces the reference uses as ENGINEERING ANNOTATION rather than as data.
 *
 * `{{deployment.jurisdiction}}` and `{{page.results.total}}` are the handoff
 * telling the implementer what belongs there. They are not implemented and are
 * not going to be resolved by the token pass, so they are slot DEFAULTS that an
 * operator overrides — real editable copy, not a broken variable. Left in the
 * default they read as a placeholder chip, which is what the reference shows.
 */
const ANNOTATION_NAMESPACES = /^(deployment|page)\./

export const validateTemplateSlots = (template: LpSlottedTemplate): SlotValidation => {
  const problems: SlotProblem[] = []
  const add = (code: SlotProblem['code'], detail: string): void => { problems.push({ code, detail }) }

  // The stream invariant. An off-by-one here truncates a page.
  if (template.parts.length !== template.slotIds.length + 1) {
    add('stream_mismatch', `${template.parts.length} parts for ${template.slotIds.length} slots; parts must be slots + 1`)
  }

  const seen = new Set<string>()
  for (const s of template.slots) {
    if (seen.has(s.id)) add('duplicate_slot_id', `"${s.id}" is defined twice`)
    seen.add(s.id)
  }

  // Every id in the stream must have a definition, and every definition must be
  // reachable. The first prints raw ids on a page; the second is a slot an
  // editor offers that changes nothing. A `meta` slot is deliberately not in
  // the stream — it is written into a tag another slot emits — so it is checked
  // against its pair instead.
  const streamIds = new Set(template.slotIds)
  const byId = new Map(template.slots.map((s) => [s.id, s]))
  for (const id of streamIds) if (!seen.has(id)) add('orphan_slot', `"${id}" is in the markup with no definition`)
  for (const s of template.slots) {
    if (s.escaping === 'meta') {
      const pair = s.pairedWith ? byId.get(s.pairedWith) : undefined
      if (!pair) add('orphan_slot', `"${s.id}" is metadata with no slot to attach to`)
      else if (pair.pairedWith !== s.id) add('orphan_slot', `"${s.id}" and "${pair.id}" do not point at each other`)
      continue
    }
    if (!streamIds.has(s.id)) add('orphan_slot', `"${s.id}" is defined but never rendered`)
  }

  if (template.slots.length === 0) add('no_editable_slots', 'the template has no editable slots at all')

  const roles = new Set(template.slots.map((s) => s.role))
  for (const r of REQUIRED_ROLES) {
    if (!roles.has(r)) add('missing_required_role', `no slot has the required role "${r}"`)
  }

  /*
   * A placeholder nothing resolves reaches the visitor as literal braces.
   *
   * The pattern here must be LOOSER than the resolver's, and it used to be
   * tighter in exactly the ways that mattered. The resolver matches
   * `\{\{([\w.]+)\}\}` — no inner whitespace, word characters and dots only —
   * while this scanned `\{\{\s*([\w.]+)\s*\}\}` and then asked whether the
   * trimmed key was resolvable. Three forms slipped through:
   *
   *   {{ brand.displayName }}   trimmed to a real key, so declared fine; the
   *                             resolver never matches it and it ships as braces
   *   {{brand-name}}            hyphen, so neither matches; not scanned either
   *   {<U+200B>{brand.x}<U+200B>}  the zero-width-space form this whole gate
   *                             exists to kill, and it passed
   *
   * So the scan is now anything BRACE-SHAPED, and a hit counts as resolved only
   * if the resolver itself would have matched it — same literal pattern, not a
   * description of it.
   */
  const html = defaultHtml(template)
  const unresolved = new Set<string>()
  for (const m of html.matchAll(/\{[\s​﻿]*\{([^{}]{1,80})\}[\s​﻿]*\}/g)) {
    const raw = m[1]
    const exact = /^([\w.]+)$/.exec(raw)
    // Only the exact form can resolve; everything else is literal braces on a
    // page however plausible it looks.
    if (exact && !/[​﻿]/.test(m[0]) && m[0].startsWith('{{') && m[0].endsWith('}}')) {
      if (isResolvedToken(exact[1])) continue
      if (ANNOTATION_NAMESPACES.test(exact[1])) continue
      unresolved.add(exact[1])
      continue
    }
    unresolved.add(raw.trim() || m[0])
  }
  for (const key of unresolved) {
    add('unresolved_placeholder', `"{{${key}}}" is in the markup and nothing resolves it`)
  }

  for (const u of template.unsupported) {
    add('unsupported_region', `${u.kind}: ${u.detail} (${u.count} occurrence${u.count === 1 ? '' : 's'})`)
  }

  return { ok: problems.length === 0, problems }
}

/**
 * Validate a deployment's overrides against the template it deploys.
 *
 * Separate from the template check because they fail for different reasons and
 * at different times: a template is wrong at build, a set of overrides is wrong
 * when the template moves under it. Publishing runs both.
 */
export const validateOverrides = (
  template: LpSlottedTemplate,
  overrides: LpSlotOverrides,
  opts: {
    /**
     * Whether every `mustSupply` placeholder must already have content.
     *
     * TRUE (the default) is the PUBLISH question: nothing goes live with an
     * unfilled design placeholder, evaluated over the merged
     * template-plus-deployment copy. FALSE is the LIBRARY question: a template
     * record or a work-in-progress save may legitimately carry placeholders
     * that a later template edit or deployment override will fill — refusing
     * to store them would make the twelve stock designs impossible to
     * materialise as records at all. Callers opt DOWN explicitly; anything
     * that forgets stays strict.
     */
    requireComplete?: boolean
  } = {},
): SlotValidation => {
  const problems: SlotProblem[] = []
  const byId = new Map(template.slots.map((s) => [s.id, s]))

  // Slots the reference could not fill. Checked over the TEMPLATE rather than
  // over the overrides, because the failure here is an override that is absent
  // — the one thing a loop over what was supplied can never see.
  if (opts.requireComplete !== false) {
    for (const slot of template.slots) {
      if (!slot.mustSupply) continue
      if (isInsideQuizMount(template, slot.id)) continue
      const value = Object.prototype.hasOwnProperty.call(overrides, slot.id) ? overrides[slot.id] : ''
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push({
          code: 'missing_required_role',
          detail: `"${slot.id}" (${slot.role}, ${slot.sectionLabel}) has no content: the design left a placeholder here and only you can say what belongs in it`,
        })
      }
    }
  }

  for (const [id, value] of Object.entries(overrides)) {
    const slot = byId.get(id)
    if (!slot) {
      problems.push({ code: 'unknown_override', detail: `"${id}" names no slot in template "${template.slug}"` })
      continue
    }
    if (typeof value !== 'string') {
      problems.push({ code: 'unsafe_override', detail: `"${id}" is not a string` })
      continue
    }
    // The quiz card is replaced by the live runtime, so copy written into it is
    // stored, validated, published and never seen. Refusing it here means an
    // operator is told at the point they can still put the words somewhere that
    // renders, rather than discovering it on a live page.
    if (isInsideQuizMount(template, id)) {
      problems.push({
        code: 'override_inside_quiz_mount',
        detail: `"${id}" is inside the quiz card, which the live quiz replaces; that copy comes from the flow`,
      })
      continue
    }
    if (URL_ROLES.has(slot.role) && !isSafeImageUrl(value)) {
      problems.push({ code: 'unsafe_override', detail: `"${id}" is not an allowed image URL` })
    }
    if (slot.required && value.trim() === '') {
      problems.push({ code: 'missing_required_role', detail: `"${id}" is required and was overridden with nothing` })
    }
  }

  return { ok: problems.length === 0, problems }
}

/**
 * Whether a slot lives inside the quiz card and therefore never renders.
 *
 * The card is replaced by the live runtime, so the question it asks, the answers
 * it offers and its Back/Continue labels come from the FLOW. An editor that kept
 * offering those as template copy would be inviting an operator to write a
 * question the visitor is never asked.
 */
export const isInsideQuizMount = (template: LpSlottedTemplate, slotId: string): boolean =>
  Boolean(template.quizMount?.slotIds.includes(slotId))

/** The slots an operator can actually change: everything the quiz does not own. */
export const editableSlots = (template: LpSlottedTemplate): LpSlot[] =>
  template.slots.filter((s) => !isInsideQuizMount(template, s.id))

/** Slots grouped by section, in document order. What an editor renders. */
export const slotsBySection = (
  template: LpSlottedTemplate,
): Array<{ section: number; label: string; slots: LpSlot[] }> => {
  const out: Array<{ section: number; label: string; slots: LpSlot[] }> = []
  for (const s of editableSlots(template)) {
    const last = out[out.length - 1]
    if (last && last.section === s.section) last.slots.push(s)
    else out.push({ section: s.section, label: s.sectionLabel, slots: [s] })
  }
  return out
}
