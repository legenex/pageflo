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
  if (/^(https?:)?\/\//i.test(v)) return true
  if (/^\/[^/]/.test(v) || /^\.{0,2}\//.test(v)) return true
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(v)) return true
  return false
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

    // An image slot's override is a URL, and an empty one means "no image", not
    // "empty box": the reference's own placeholder is what an unfilled image
    // looks like, and it is what keeps the default render byte-identical.
    if (slot.escaping === 'image') {
      const url = (raw ?? '').trim()
      if (url === '') { out.push(slot.default); continue }
      if (!isSafeImageUrl(url)) {
        refused.push({ id, reason: `"${url.slice(0, 60)}" is not an allowed image URL` })
        out.push(slot.default)
        continue
      }
      const altSlot = slot.pairedWith ? byId.get(slot.pairedWith) : undefined
      const alt = altSlot
        ? (Object.prototype.hasOwnProperty.call(overrides, altSlot.id) ? overrides[altSlot.id] : altSlot.default)
        : ''
      applied.push(id)
      out.push(
        `<img src="${escapeHtmlText(url)}" alt="${escapeHtmlText(alt)}" loading="lazy" ` +
        `style="display:block;width:100%;height:100%;object-fit:cover">`,
      )
      continue
    }

    if (raw === undefined || raw === slot.default) {
      out.push(slot.default)
      continue
    }

    if (URL_ROLES.has(slot.role) && !isSafeImageUrl(raw)) {
      refused.push({ id, reason: `"${raw.slice(0, 60)}" is not an allowed image URL` })
      out.push(slot.default)
      continue
    }

    applied.push(id)
    out.push(escapeHtmlText(raw))
  }

  return { html: out.join(''), unknownOverrides, refused, applied }
}

/** The template exactly as the reference drew it. The parity target. */
export const defaultHtml = (template: LpSlottedTemplate): string =>
  composeTemplate(template, {}).html

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

  // A placeholder nothing resolves reaches the visitor as literal braces.
  const html = defaultHtml(template)
  const unresolved = new Set<string>()
  for (const m of html.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = m[1]
    if (isResolvedToken(key)) continue
    if (ANNOTATION_NAMESPACES.test(key)) continue
    unresolved.add(key)
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
): SlotValidation => {
  const problems: SlotProblem[] = []
  const byId = new Map(template.slots.map((s) => [s.id, s]))

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
    if (URL_ROLES.has(slot.role) && !isSafeImageUrl(value)) {
      problems.push({ code: 'unsafe_override', detail: `"${id}" is not an allowed image URL` })
    }
    if (slot.required && value.trim() === '') {
      problems.push({ code: 'missing_required_role', detail: `"${id}" is required and was overridden with nothing` })
    }
  }

  return { ok: problems.length === 0, problems }
}

/** Slots grouped by section, in document order. What an editor renders. */
export const slotsBySection = (
  template: LpSlottedTemplate,
): Array<{ section: number; label: string; slots: LpSlot[] }> => {
  const out: Array<{ section: number; label: string; slots: LpSlot[] }> = []
  for (const s of template.slots) {
    const last = out[out.length - 1]
    if (last && last.section === s.section) last.slots.push(s)
    else out.push({ section: s.section, label: s.sectionLabel, slots: [s] })
  }
  return out
}
