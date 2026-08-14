/**
 * Port the twelve landing-page templates out of the design handoff.
 *
 *   node scripts/extract-lp-templates.mjs [path-to-review-folder]
 *
 * The references in `review/` are self-contained pages whose every element is
 * styled INLINE - there is not one CSS class in them - which is what makes a
 * pixel-accurate port possible at all: each value is explicit on the element
 * that uses it, so nothing has to be inferred from a cascade.
 *
 * Two things are done to that markup and nothing else.
 *
 * The reference CHROME is removed: the dark toolbar across the top, and the
 * annotation strips, which the handoff marks for us by setting
 * `display:{{anno}}` on them. Those are the engineering notes, not the page.
 *
 * Every colour becomes a token WITH THE ORIGINAL AS ITS CSS FALLBACK, so
 * `#f7f7f7` becomes `var(--lp-n963, #f7f7f7)`. That detail is the whole design
 * of this thing. Rendered with no variables supplied, the output is byte-for-
 * byte the reference, which is what makes "pixel by pixel the same" a claim
 * anybody can check rather than one they have to trust. Supply the variables
 * and the same markup recolours to a brand, which is what the handoff means by
 * "attach a brand and it recolors through the token system".
 *
 * Tokens are named by LUMINANCE - n963 is a colour at 0.963 relative luminance
 * - so a template's greys keep their exact ordering and spacing when they are
 * remapped. Preserving that ladder is what preserves the contrast the design
 * was drawn with. Saturated colours are named separately because they are
 * brand accents rather than rungs on that ladder.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

import { runReferenceComponent, expandReference } from './lp-reference-runtime.mjs'
import { extractSlots, SUPPLY_PROBLEM } from '../src/lib/lp-slots/extract.ts'
import { stripAnnotationChips, remainingAnnotationTokens } from '../src/lib/lp-slots/strip-annotations.ts'
import { defaultHtml, validateTemplateSlots } from '../src/lib/lp-slots/model.ts'
import { findQuizMount, mountToPartCoordinates } from '../src/lib/lp-slots/quiz-mount.ts'

const REVIEW = process.argv[2] ?? 'review'
const OUT = 'src/lib/lp-templates'

/** Pull the page markup out of a bundled artifact page. */
const unpackPage = (file) => {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (t.startsWith('"<!DOCTYPE html>')) return JSON.parse(t)
  }
  return null
}

const srgb = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
const parseHex = (h) => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const saturation = ([r, g, b]) => {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255
  return mx === 0 ? 0 : (mx - mn) / mx
}

/**
 * The token a colour becomes.
 *
 * Neutrals are rungs on a lightness ladder and keep their position in it.
 * Anything with real chroma is an accent the brand should own, and there are
 * only ever a handful of those in a reference drawn in greys.
 */
const tokenFor = (hex) => {
  const rgb = parseHex(hex)
  const sat = saturation(rgb)
  if (sat > 0.18) return luminance(rgb) < 0.4 ? '--lp-accent-dark' : '--lp-accent'
  return `--lp-n${String(Math.round(luminance(rgb) * 1000)).padStart(3, '0')}`
}

/** Strip the handoff's own chrome: the toolbar and the annotation strips. */
const stripChrome = (html) => {
  let out = html
  const helmet = out.indexOf('</helmet>')
  if (helmet > -1) out = out.slice(helmet + '</helmet>'.length)
  // Annotation strips are self-identifying: the handoff toggles them with a
  // {{anno}} display value, so they can be removed without guessing.
  out = out.replace(/<div[^>]*display:\{\{anno\}\}[^>]*>[\s\S]*?<\/div>/g, '')
  // The component script is chrome by the same definition as the toolbar: it is
  // the design tool's own machinery, it has already been evaluated by the time
  // this runs, and it would otherwise ship two kilobytes of dead JSX inside a
  // string that a renderer mounts with dangerouslySetInnerHTML.
  out = out.replace(/<script[^>]*type="text\/x-dc"[^>]*>[\s\S]*?<\/script>/g, '')
  // Everything before the first real section is the reference toolbar.
  const first = out.search(/<section|<header|<footer/)
  if (first > 0) out = out.slice(first)
  return out.replace(/<\/x-dc>|<\/body>|<\/html>|<x-dc>/g, '').trim()
}

/**
 * Undo the handoff's own escaping of its placeholders.
 *
 * Every `{{brand.callNumber}}` in the references is written `{​{brand.callNumber}​}`
 * with a ZERO-WIDTH SPACE after the opening brace and before the closing one.
 * That is the designer defeating the design tool's template engine so the
 * placeholder would render literally in the reference, and it is invisible in
 * every editor and every diff.
 *
 * The consequence was not cosmetic. `resolveTokens` matches `\{\{([\w.]+)\}\}`,
 * which a zero-width space breaks, so NOT ONE brand placeholder in any of the
 * twelve ported templates ever resolved. Every page rendered `{{brand.callNumber}}`
 * as literal text to the visitor. Removing the character is what makes a
 * template brand-aware at all.
 *
 * Targeted rather than a blanket strip: only the two positions the handoff uses.
 * A zero-width space anywhere else is content and stays.
 */
const unescapePlaceholders = (html) =>
  html.replace(/\{​\{/g, '{{').replace(/\}​\}/g, '}}')

mkdirSync(OUT, { recursive: true })
const files = readdirSync(REVIEW).filter((f) => /^LP\d\d-/.test(f)).sort()
if (files.length === 0) {
  console.error(`No LP references found in ${REVIEW}/. Pass the folder as the first argument.`)
  process.exit(1)
}

const index = []
for (const file of files) {
  const page = unpackPage(join(REVIEW, file))
  if (!page) { console.error(`  ${file}: no page payload`); continue }

  // The slug the handoff itself uses, taken from its toolbar rather than from
  // the filename, so the id in our code is the id in the design.
  const slug = (page.match(/LP TEMPLATES \/<\/span>\s*<span[^>]*>([a-z0-9_]+)</) ?? [])[1]
    ?? basename(file, '.html').toLowerCase().replace(/^lp\d\d-/, '').replace(/-/g, '_')

  // The component's initial render, from the reference's OWN logic. This is
  // where `<sc-for>` gets its list and where a page-level value like
  // `{{playTitle}}` comes from. Run before the chrome strip because the script
  // it reads is part of that chrome.
  const { values, note } = runReferenceComponent(page)

  let html = stripChrome(page)
  html = unescapePlaceholders(html)

  const { html: expanded, loops } = expandReference(html, values)
  html = expanded

  // The designer's own notes about what belongs where. Nothing resolves them,
  // so left in they reach a visitor as literal braces; a browser-level render
  // check found sixteen doing exactly that across five templates.
  const stripped = stripAnnotationChips(html)
  html = stripped.html
  const leftover = remainingAnnotationTokens(html)
  if (leftover.length > 0) {
    console.error(`  ${slug}: annotation tokens survived the strip: ${[...new Set(leftover)].join(', ')}`)
    process.exitCode = 1
  }

  const seen = new Map()
  html = html.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (hex) => {
    const token = tokenFor(hex)
    if (!seen.has(token)) seen.set(token, hex.toLowerCase())
    return `var(${token}, ${hex})`
  })

  const tokens = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // Semantic content slots, derived from the reference's own structure. See
  // src/lib/lp-slots/extract.ts for the rules; nothing here is hand-authored,
  // because this file overwrites the generated modules wholesale.
  const slotted = extractSlots(slug, html)
  const parity = defaultHtml(slotted) === html
  const validation = validateTemplateSlots(slotted)

  if (!parity) {
    console.error(`  ${slug}: SLOT PARITY BROKEN - composing the defaults does not reproduce the markup. Refusing to write.`)
    process.exitCode = 1
    continue
  }
  for (const p of slotted.problems) console.error(`  ${slug}: ${p}`)

  /*
   * A block the design drew as empty dashed cards, which could not be turned
   * into a region, is NOT written.
   *
   * Same rule as the quiz mount and for the same reason: the module would ship
   * with `$ ———` and `[CASE RESULT PLACEHOLDER]` in it and nothing able to take
   * them off the page. A template that fails to build is recoverable; a live
   * attorney-advertising page carrying the handoff's stand-in case results is
   * what this pass exists to make unreachable.
   */
  if (slotted.problems.some((p) => p.startsWith(SUPPLY_PROBLEM))) {
    console.error(`  ${slug}: SUPPLY-OR-OMIT BLOCK NOT ADDRESSABLE. Refusing to write.`)
    process.exitCode = 1
    continue
  }

  /*
   * Where the real quiz runtime mounts.
   *
   * Located from the reference's own structure rather than marked by hand, for
   * the reason this whole script exists: it overwrites the generated modules,
   * so a hand-placed sentinel survives exactly until the next extraction. A
   * template whose card cannot be located, or which now has two things that
   * look like one, is NOT written - a landing page that mounts a live quiz in
   * the wrong place is worse than one that fails to build.
   */
  const mountRes = findQuizMount(html)
  for (const p of mountRes.problems) console.error(`  ${slug}: quiz mount: ${p}`)
  if (!mountRes.region) {
    console.error(`  ${slug}: NO QUIZ MOUNT. Refusing to write.`)
    process.exitCode = 1
    continue
  }
  const byId = new Map(slotted.slots.map((s) => [s.id, s]))
  const coords = mountToPartCoordinates(
    mountRes.region,
    slotted.parts,
    slotted.slotIds,
    slotted.slotIds.map((id) => byId.get(id)?.default ?? ''),
  )
  for (const p of coords.problems) console.error(`  ${slug}: quiz mount: ${p}`)
  if (!coords.mount) {
    console.error(`  ${slug}: QUIZ MOUNT NOT ADDRESSABLE in the part stream. Refusing to write.`)
    process.exitCode = 1
    continue
  }
  const quizMount = {
    ...coords.mount,
    tag: mountRes.region.tag,
    openTag: mountRes.region.openTag,
    surface: mountRes.region.surface,
    evidence: mountRes.region.evidence,
  }

  writeFileSync(join(OUT, `${slug}.ts`),
`// Generated by scripts/extract-lp-templates.mjs from ${file}. Do not edit by hand:
// re-run the extractor instead, or the code and the design drift apart silently.
//
// Every colour carries the reference's own value as its CSS fallback, so with
// no variables supplied this renders exactly as the handoff drew it.
//
// \`parts\` and \`slotIds\` are the same markup with its editable regions cut out:
// joining the parts with each slot's default reproduces \`html\` byte for byte,
// which is asserted by scripts/test-lp-slots.mts and by this script before it
// writes. A deployment stores OVERRIDES against these ids and never a copy of
// the template, so a corrected template reaches every deployment at once.

import type { LpSlot, LpSupplyGroup, LpUnsupportedRegion } from '@/lib/lp-slots/model'
import type { LpQuizMount } from '@/lib/lp-slots/quiz-mount'

export const slug = ${JSON.stringify(slug)}
export const source = ${JSON.stringify(file)}

/** The tokens this template uses, with the reference colour each replaced. */
export const tokens: Record<string, string> = ${JSON.stringify(Object.fromEntries(tokens), null, 2)}

/** The template as the reference draws it, with nothing overridden. */
export const html = ${JSON.stringify(html)}

/** Literal markup between the slots. Always \`slotIds.length + 1\` entries. */
export const parts: string[] = ${JSON.stringify(slotted.parts)}

/** The slot that fills each gap between the parts, in document order. */
export const slotIds: string[] = ${JSON.stringify(slotted.slotIds)}

/** Every editable region, with the reference's own copy as its default. */
export const slots: LpSlot[] = ${JSON.stringify(slotted.slots, null, 2)}

/** Regions the markup alone cannot carry. Empty means the template is complete. */
export const unsupported: LpUnsupportedRegion[] = ${JSON.stringify(slotted.unsupported, null, 2)}

/**
 * Blocks the design drew as empty dashed cards, which go live COMPLETE or not
 * at all.
 *
 * Empty for ten of the twelve. Where it is not, the reference drew case-result
 * cards holding \`[CASE RESULT PLACEHOLDER]\`, \`$ ———\` and
 * \`Case type · jurisdiction · year\` - stand-in copy for content the handoff did
 * not have. Only the bracketed line was ever flagged, so the other two shipped
 * to live attorney-advertising pages. With nothing supplied the region below is
 * cut out of the part stream and the page closes up; with anything supplied the
 * publish preflight requires the rest. See src/lib/lp-slots/model.ts.
 */
export const supplyGroups: LpSupplyGroup[] = ${JSON.stringify(slotted.supplyGroups ?? [], null, 2)}

/**
 * Where the live quiz replaces the reference's drawing of one.
 *
 * The card in the markup above is a PICTURE of a quiz: it has answer buttons
 * that do not answer and a progress rail that does not progress. The public
 * render composes the template either side of this region and mounts the same
 * runtime a standalone quiz deployment mounts, so a landing page runs the real
 * flow rather than a lookalike. See src/lib/lp-slots/quiz-mount.ts.
 */
export const quizMount: LpQuizMount = ${JSON.stringify(quizMount, null, 2)}
`)

  index.push({
    slug,
    file,
    tokens: tokens.length,
    bytes: html.length,
    slots: slotted.slots.length,
    loopsExpanded: loops,
    valid: validation.ok,
    supplyGroups: (slotted.supplyGroups ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      required: g.requiredSlotIds.length,
      inRegion: g.slotIds.length,
    })),
    quizMount: {
      tag: quizMount.tag,
      bytes: mountRes.region.end - mountRes.region.start,
      slotsInside: quizMount.slotIds.length,
      evidence: quizMount.evidence,
    },
    problems: validation.problems.map((p) => `${p.code}: ${p.detail}`),
  })
  console.log(
    `  ${slug.padEnd(28)} ${String(html.length).padStart(6)} bytes  ${String(tokens.length).padStart(2)} tokens  ` +
    `${String(slotted.slots.length).padStart(3)} slots  ${loops ? `${loops} loop(s)  ` : ''}` +
    `quiz ${String(mountRes.region.end - mountRes.region.start).padStart(5)}b  ` +
    `${stripped.chipsRemoved + stripped.containersRemoved ? `-${stripped.chipsRemoved + stripped.containersRemoved} anno  ` : ''}` +
    `${(slotted.supplyGroups ?? []).length ? `${slotted.supplyGroups.length} supply-group  ` : ''}` +
    `${validation.ok ? 'valid' : `INVALID (${validation.problems.length})`}${note ? `  [${note}]` : ''}`,
  )
  for (const g of slotted.supplyGroups ?? []) {
    console.log(
      `      supply-or-omit "${g.label}" (${g.id}): ${g.requiredSlotIds.length} slots must be supplied, ` +
      `${g.slotIds.length} omitted with the block`,
    )
  }
  for (const p of validation.problems) console.log(`      ${p.code}: ${p.detail}`)
}

writeFileSync(join(OUT, 'generated-index.json'), JSON.stringify(index, null, 2))
const invalid = index.filter((i) => !i.valid)
console.log(`\n${index.length} templates written to ${OUT}/`)
if (invalid.length > 0) {
  console.log(`${invalid.length} did not pass slot validation: ${invalid.map((i) => i.slug).join(', ')}`)
  process.exitCode = 1
}
