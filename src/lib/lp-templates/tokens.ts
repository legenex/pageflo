/**
 * Turning a brand's palette into the variables a ported template reads.
 *
 * A ported template names its colours by LUMINANCE: `--lp-n963` is a colour the
 * reference drew at 0.963 relative luminance. That naming is what makes
 * recolouring safe, because the ladder of values a design uses carries its
 * contrast, and a remap that preserves the ladder preserves the contrast.
 *
 * So each token is placed at its own position on the brand's own range and the
 * colour is mixed there. The darkest rung lands on the brand's ink, the
 * lightest on its page, and everything between keeps its relative spacing. A
 * template that separated two greys by a hair still separates them by a hair;
 * one that used a hard black against a hard white still does.
 *
 * That argument holds for the RUNGS and only for the rungs, and the two places
 * it does not hold are where this module used to be wrong:
 *
 *  - the ladder needs two ends. A brand whose ink and surface land within a
 *    hair of each other collapses every rung onto one colour and the page goes
 *    blank. See MIN_LADDER_RATIO below.
 *  - an ACCENT is not a rung. It is a brand colour dropped into a slot the
 *    reference drew in a different one, so its contrast is not inherited from
 *    the design and has to be derived against the ground it lands on.
 *
 * Both were found by rendering the twelve in a real browser under three brands
 * and reading the computed colours back out; neither is visible to a unit test,
 * because every individual value involved is a colour somebody asked for.
 */

import { relativeLuminance, contrastRatio } from '@/lib/builder/page-lint'
import { parseHex, readableAccent, deriveBrandSurface } from '@/lib/builder/color-system'
import type { Palette } from '@/lib/lp-nodes/palette'
import type { PortedTemplate } from './index'

const lum = (hex: string): number => relativeLuminance(hex) ?? 0

/** Mix two colours in sRGB. */
const mix = (a: string, b: string, t: number): string => {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return a
  const k = Math.max(0, Math.min(1, t))
  // parseHex returns { r, g, b }, so the channels are read by name.
  const ch = (x: number, y: number): string => Math.round(x + (y - x) * k).toString(16).padStart(2, '0')
  return `#${ch(ra.r, rb.r)}${ch(ra.g, rb.g)}${ch(ra.b, rb.b)}`
}

/**
 * Mix two colours to land at a TARGET LUMINANCE, not at a position.
 *
 * This is the correction that makes this module's whole argument true. A token
 * is named `--lp-n296` because the reference drew it at 0.296 relative
 * luminance, and the claim is that placing it at the same relative position on
 * the brand's range preserves the contrast the design was built with. Mixing in
 * sRGB does not do that: sRGB is gamma-encoded, so the midpoint of two channel
 * values is nowhere near the midpoint of their luminances.
 *
 * The size of the error is not academic. `#949494` on `#17191d` is a ratio of
 * 5.4 in the reference — comfortably readable small text on a dark band. Mixed
 * positionally onto the same two ends it came out at `rgb(87,88,90)`, a ratio of
 * 2.47, and a browser-level check found 48 text runs across six templates
 * sitting below 3:1 for exactly this reason. Every dark section in the library
 * was quietly losing more than half its contrast.
 *
 * A binary search rather than an inverse-gamma formula because the two ends are
 * arbitrary colours rather than points on a grey axis: the luminance of a mix
 * between a warm dark and a cool light is not a closed form of the channel mix.
 * Twenty iterations resolve to well under one 8-bit step.
 */
const mixToLuminance = (dark: string, light: string, target: number): string => {
  const lo = lum(dark)
  const hi = lum(light)
  if (!(hi > lo)) return mix(dark, light, 0.5)
  const clamped = Math.max(lo, Math.min(hi, target))

  let a = 0
  let b = 1
  let best = mix(dark, light, 0.5)
  for (let i = 0; i < 20; i++) {
    const k = (a + b) / 2
    best = mix(dark, light, k)
    if (lum(best) < clamped) a = k
    else b = k
  }
  return best
}

/**
 * The CSS variables to set on a ported template's wrapper.
 *
 * `--lp-accent` is derived FROM the brand's primary rather than being it: a
 * saturated colour in a reference drawn in greys is an accent the brand owns
 * outright, but owning it does not make it readable on this template's ground.
 */
export const templateVars = (template: PortedTemplate, palette: Palette): Record<string, string> => {
  const rungs = Object.keys(template.tokens).filter((k) => k.startsWith('--lp-n'))
  const levels = rungs.map((k) => Number(k.slice('--lp-n'.length)) / 1000)
  const lo = Math.min(...levels, 1)
  const hi = Math.max(...levels, 0)
  const span = hi - lo || 1

  // The two ends of the brand's own range, ordered darkest to lightest so a
  // dark brand and a light one both produce a ladder that runs the right way.
  const inkFirst = lum(palette.ink) <= lum(palette.surface)
  let dark = inkFirst ? palette.ink : palette.surface
  let light = inkFirst ? palette.surface : palette.ink

  /*
   * A LADDER WITH NO RANGE IS A BLANK PAGE.
   *
   * Everything above assumes the brand's two ends actually span a usable range.
   * They do not always, and the failure is total rather than gradual: a brand
   * that sets a dark-mode ink (`#F2F4F8`) while its surface still comes from the
   * fallback identity (`#F4F2EE`) has an ink and a surface 0.002 apart in
   * luminance. Every rung then mixes to the same near-white, so the page, the
   * cards, the headings and the body copy are all one colour and the visitor
   * gets a blank sheet. A browser-level render check measured exactly that:
   * ratios of 1.01 on every text run in all twelve templates.
   *
   * Nothing downstream could catch it, because the design is right, the mixing
   * is right, and every individual value is a colour the brand asked for. What
   * was missing is the check that the two ends are two ends.
   *
   * So the range is REPAIRED rather than reported. The ink is kept, because text
   * colour is the more committed of the two signals and because keeping the
   * surface would decide the page's polarity from a value the brand may never
   * have set. The opposite end is then derived from the brand's own primary, so
   * the repair still carries the brand rather than dropping to a system grey.
   *
   * `deriveBrandSurface` and the WCAG maths are `color-system`'s; reimplementing
   * either here is what CLAUDE.md forbids and what would let the two drift.
   */
  const MIN_LADDER_RATIO = 7
  const spread = contrastRatio(dark, light)
  if (spread == null || spread < MIN_LADDER_RATIO) {
    const inkIsDark = lum(palette.ink) < 0.5
    if (inkIsDark) {
      dark = palette.ink
      light = deriveBrandSurface('#ffffff', palette.primary, { hueBlend: 0.04 })
    } else {
      light = palette.ink
      dark = deriveBrandSurface('#101216', palette.primary, { hueBlend: 0.08 })
    }
    // The derived end must itself clear the floor. When a brand's primary is so
    // pale that blending it cannot, the ladder falls to the achromatic extreme:
    // a page that is legible in a colour nobody chose beats one that is not
    // legible at all, and this is the branch that makes white-on-white
    // unreachable rather than merely unlikely.
    const repaired = contrastRatio(dark, light)
    if (repaired == null || repaired < MIN_LADDER_RATIO) {
      dark = inkIsDark ? palette.ink : '#0b0d10'
      light = inkIsDark ? '#ffffff' : palette.ink
    }
  }

  // The reference's own luminance ladder, stretched onto the brand's range.
  // Order and relative spacing are preserved in LUMINANCE, which is what
  // contrast is defined in, so a design that separated two greys by a hair
  // still separates them by a hair and one that used a hard black against a
  // hard white still does.
  const darkLum = lum(dark)
  const lightLum = lum(light)
  const vars: Record<string, string> = {}
  for (const key of rungs) {
    const level = Number(key.slice('--lp-n'.length)) / 1000
    const t = (level - lo) / span
    vars[key] = mixToLuminance(dark, light, darkLum + t * (lightLum - darkLum))
  }

  // The two accents are named by which GROUND they sit on, not by which is
  // "the brand colour". `tokenFor` in the extractor assigns a saturated colour
  // to `--lp-accent-dark` when its luminance is below 0.4 — i.e. a dark accent,
  // which the references only ever put on a light ground — and to `--lp-accent`
  // otherwise. Each is therefore derived against the end of the ladder it will
  // actually be read on.
  //
  // They used to be assigned the brand's raw primary with no check at all,
  // which is what the browser-level render test caught: a gold-accented brand
  // produced up to 143 unreadable text runs in a single template. CLAUDE.md's
  // rule — text colours are derived and verified, never assumed — was being
  // followed everywhere except the one place a brand colour meets a design that
  // was drawn for a different one.
  const lightestRung = vars[rungs[levels.indexOf(hi)]] ?? light
  const darkestRung = vars[rungs[levels.indexOf(lo)]] ?? dark
  vars['--lp-accent'] = readableAccent(palette.primary, darkestRung).hex
  vars['--lp-accent-dark'] = readableAccent(palette.primaryDark || palette.primary, lightestRung).hex

  return vars
}

/** The same, as a style attribute object React will accept. */
export const templateStyle = (template: PortedTemplate, palette: Palette): Record<string, string> =>
  templateVars(template, palette)
