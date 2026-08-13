// Contrast-safe, brand-adaptive color system for the funnel builders (quiz,
// landing pages, advertorials). Two jobs:
//
//   1. PREVENTION — resolvePalette / getSafeTextColor / deriveBrandSurface /
//      onPrimaryText / effectiveBaseColor: every text color a template renders
//      is DERIVED from the opaque surface it actually sits on, verified to
//      clear WCAG, with a guaranteed-pass fallback. White-on-white (and
//      black-on-black) become structurally impossible.
//
//   2. DETECTION — auditColorPairs / auditPalette: a color-overlap auditor
//      that takes the concrete foreground/background pairings a design
//      produces and flags any that collide (too-low contrast). This is the
//      "system that identifies bad design with color overlaps" — used by the
//      builder to warn when a template + brand combination is unreadable.
//
// Reuses the WCAG math in page-lint.ts — does NOT reimplement luminance/ratio.

import { relativeLuminance, contrastRatio } from './page-lint'

// ---------------------------------------------------------------------------
// Color math — hex <-> rgb <-> hsl, all null-guarded.
// ---------------------------------------------------------------------------
type RGB = { r: number; g: number; b: number }

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n))

export function parseHex(input: string | undefined | null): RGB | null {
  if (!input || typeof input !== 'string') return null
  const s = input.trim().replace(/^#/, '')
  if (![3, 6].includes(s.length)) return null
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

const toHex2 = (n: number): string => clamp255(n).toString(16).padStart(2, '0')
export const rgbToHex = (r: number, g: number, b: number): string => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`

export function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    else if (max === gn) h = ((bn - rn) / d + 2) / 6
    else h = ((rn - gn) / d + 4) / 6
  }
  return [h, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1
  s = clamp01(s)
  l = clamp01(l)
  if (s === 0) {
    const v = clamp255(l * 255)
    return rgbToHex(v, v, v)
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return rgbToHex(hue2rgb(h + 1 / 3) * 255, hue2rgb(h) * 255, hue2rgb(h - 1 / 3) * 255)
}

// Alpha-composite `over` (with alpha 0..1) on top of opaque `under`.
function composite(over: RGB, alpha: number, under: RGB): RGB {
  const a = clamp01(alpha)
  return {
    r: over.r * a + under.r * (1 - a),
    g: over.g * a + under.g * (1 - a),
    b: over.b * a + under.b * (1 - a),
  }
}

// ---------------------------------------------------------------------------
// PREVENTION helpers
// ---------------------------------------------------------------------------

const SAFE_DARK = '#0b1220'
const SAFE_LIGHT = '#ffffff'

export type SafeTextResult = { hex: string; ratio: number; meets: 'AA' | 'AA-large' | 'fail' }

/**
 * Pick a text color VERIFIED to clear WCAG against an OPAQUE background hex.
 * Tries brand-derived candidates first, then neutral fallbacks, then a
 * luminance-chosen max-contrast color. The return is NEVER white-on-white:
 * the final fallback is chosen by the background's luminance.
 */
export function getSafeTextColor(
  bgHex: string,
  opts: { preferLight?: boolean; brandLight?: string; brandDark?: string; minRatio?: number } = {},
): SafeTextResult {
  const minRatio = opts.minRatio ?? 4.5
  const bgLum = relativeLuminance(bgHex)
  const preferLight = opts.preferLight ?? (bgLum == null ? false : bgLum < 0.5)
  const brandLight = opts.brandLight && parseHex(opts.brandLight) ? opts.brandLight : SAFE_LIGHT
  const brandDark = opts.brandDark && parseHex(opts.brandDark) ? opts.brandDark : SAFE_DARK

  const candidates = preferLight
    ? [SAFE_LIGHT, brandLight, '#f5f7fa', brandDark, SAFE_DARK, '#000000']
    : [SAFE_DARK, brandDark, '#1c2231', brandLight, '#f5f7fa', SAFE_LIGHT]

  let bestLarge: SafeTextResult | null = null
  for (const c of candidates) {
    const ratio = contrastRatio(c, bgHex)
    if (ratio == null) continue
    if (ratio >= minRatio) return { hex: c, ratio, meets: 'AA' }
    if (ratio >= 3 && !bestLarge) bestLarge = { hex: c, ratio, meets: 'AA-large' }
  }
  if (bestLarge) return bestLarge
  // Guaranteed-pass fallback: max contrast by luminance. Never invisible.
  const fb = bgLum != null && bgLum > 0.5 ? '#000000' : '#ffffff'
  return { hex: fb, ratio: contrastRatio(fb, bgHex) ?? 1, meets: 'fail' }
}

/** Muted/secondary text that still clears `targetRatio` (default 3:1) on an opaque bg. */
export function getSafeMutedColor(textHex: string, bgHex: string, targetRatio = 3): { hex: string; ratio: number } {
  const base = parseHex(textHex)
  if (!base) return { hex: textHex, ratio: contrastRatio(textHex, bgHex) ?? 1 }
  const under = parseHex(bgHex)
  // Alpha steps: blend the text toward the bg so it reads as "muted" while
  // staying readable. We composite to an opaque hex so the ratio is real.
  for (const alpha of [0.7, 0.8, 0.9]) {
    if (!under) break
    const blended = composite(base, alpha, under)
    const hex = rgbToHex(blended.r, blended.g, blended.b)
    const ratio = contrastRatio(hex, bgHex)
    if (ratio != null && ratio >= targetRatio) return { hex, ratio }
  }
  return { hex: textHex, ratio: contrastRatio(textHex, bgHex) ?? 1 }
}

/**
 * Produce a brand-hued OPAQUE surface from a base color: shift its luminance
 * for hierarchy and blend its hue toward the brand primary so the surface
 * visibly carries the brand. Returns an opaque hex usable as both the CSS
 * background AND the surfaceBase for contrast checks.
 */
export function deriveBrandSurface(
  baseHex: string,
  brandPrimary: string,
  opts: { lighten?: number; darken?: number; hueBlend?: number } = {},
): string {
  const base = parseHex(baseHex)
  if (!base) return parseHex(brandPrimary) ? brandPrimary : '#0d2447'
  const brand = parseHex(brandPrimary)
  let [h, s, l] = rgbToHsl(base)
  if (brand) {
    const [bh, bs] = rgbToHsl(brand)
    const blend = clamp01(opts.hueBlend ?? 0.06)
    h = h + (bh - h) * blend
    // Nudge saturation toward the brand a touch so the tint is perceptible.
    s = clamp01(s + (bs - s) * (blend * 0.6))
  }
  if (opts.lighten) l = clamp01(l + opts.lighten)
  if (opts.darken) l = clamp01(l - opts.darken)
  return hslToHex(h, s, l)
}

/** Text color readable ON the brand primary (for filled buttons / badges). */
export function onPrimaryText(brandPrimary: string): string {
  if (!parseHex(brandPrimary)) return '#ffffff'
  return getSafeTextColor(brandPrimary, { minRatio: 4.5 }).hex
}

/**
 * The brand's accent, at a lightness that is READABLE on a given ground.
 *
 * `getSafeTextColor` picks from a candidate list and therefore answers "what
 * colour can this text be"; this answers a different question — "how light must
 * THIS colour be to work here" — and the difference matters because an accent
 * carries brand identity. Substituting a safe near-black for a brand's gold
 * makes the page readable and stops it being that brand's page.
 *
 * So hue and saturation are held and only lightness moves, in one direction
 * chosen by the ground, until the ratio clears. A browser-level check across
 * the twelve ported templates found this: with the raw primary used directly, a
 * gold-accented brand produced between 25 and 143 unreadable text runs PER
 * TEMPLATE, and a red-accented one produced up to 22. The reference designs
 * were readable; what broke them was substituting a brand colour into a slot
 * whose contrast nobody re-verified.
 *
 * Returns the closest it got when no lightness clears the target — an accent
 * that is as readable as its hue allows, never white-on-white, and the caller
 * can see the achieved ratio.
 */
export function readableAccent(
  accentHex: string,
  groundHex: string,
  minRatio = 4.5,
): { hex: string; ratio: number; adjusted: boolean } {
  const rgb = parseHex(accentHex)
  const groundLum = relativeLuminance(groundHex)
  if (!rgb || groundLum == null) return { hex: accentHex, ratio: 1, adjusted: false }

  const start = contrastRatio(accentHex, groundHex) ?? 1
  if (start >= minRatio) return { hex: accentHex, ratio: start, adjusted: false }

  const [h, s] = rgbToHsl(rgb)
  // Away from the ground: darken on a light ground, lighten on a dark one.
  // Going the other way can also reach the ratio, at the cost of an accent that
  // reads as a different colour entirely.
  const goDarker = groundLum > 0.5
  let best = { hex: accentHex, ratio: start, adjusted: false }

  for (let step = 1; step <= 100; step++) {
    const [, , l0] = rgbToHsl(rgb)
    const l = goDarker ? Math.max(0, l0 - step / 100) : Math.min(1, l0 + step / 100)
    const hex = hslToHex(h, s, l)
    const ratio = contrastRatio(hex, groundHex)
    if (ratio == null) continue
    if (ratio > best.ratio) best = { hex, ratio, adjusted: true }
    if (ratio >= minRatio) return { hex, ratio, adjusted: true }
    if (l === 0 || l === 1) break
  }
  return best
}

/**
 * Effective OPAQUE base color for a translucent overlay sitting on a backdrop.
 * Used by glass/gradient templates: text sits on rgba(overlay, alpha) over
 * `backdropHex`. We composite to an opaque hex so getSafeTextColor can run.
 */
export function effectiveBaseColor(overlayHex: string, overlayAlpha: number, backdropHex: string): string {
  const over = parseHex(overlayHex)
  const under = parseHex(backdropHex)
  if (!over || !under) return parseHex(backdropHex) ? backdropHex : '#0d2447'
  const c = composite(over, overlayAlpha, under)
  return rgbToHex(c.r, c.g, c.b)
}

// Of a set of opaque hexes, return the darkest (lowest luminance) — used to
// pick the worst-case stop of a gradient so text stays safe across it.
export function darkestOf(...hexes: string[]): string {
  let best = hexes[0]
  let bestLum = relativeLuminance(hexes[0]) ?? 1
  for (const h of hexes.slice(1)) {
    const lum = relativeLuminance(h)
    if (lum != null && lum < bestLum) {
      best = h
      bestLum = lum
    }
  }
  return best
}

export type ResolvedPalette = {
  mode: 'dark' | 'light'
  pageBg: string // CSS background of the page (gradient/string allowed)
  cardSurface: string // CSS background of the card (rgba/gradient allowed)
  surfaceBase: string // OPAQUE hex the text effectively sits on
  text: string
  textMute: string
}

/**
 * One-call palette resolver each template uses. `strategy` forces light/dark;
 * 'auto' decides by the luminance of `surfaceBase`. ALWAYS returns a verified,
 * self-contained, contrast-safe palette.
 */
export function resolvePalette(
  brand: { colors?: { primary?: string; accent?: string; background?: string; cardBg?: string } },
  spec: { strategy: 'dark' | 'light' | 'auto'; pageBg: string; cardSurface: string; surfaceBase: string },
): ResolvedPalette {
  const lum = relativeLuminance(spec.surfaceBase)
  const mode: 'dark' | 'light' =
    spec.strategy === 'auto' ? (lum != null && lum >= 0.5 ? 'light' : 'dark') : spec.strategy
  const preferLight = mode === 'dark'
  const text = getSafeTextColor(spec.surfaceBase, {
    preferLight,
    brandDark: SAFE_DARK,
    brandLight: SAFE_LIGHT,
  }).hex
  const textMute = getSafeMutedColor(text, spec.surfaceBase).hex
  return {
    mode,
    pageBg: spec.pageBg,
    cardSurface: spec.cardSurface,
    surfaceBase: spec.surfaceBase,
    text,
    textMute,
  }
}

// ---------------------------------------------------------------------------
// DETECTION — color-overlap auditor
// ---------------------------------------------------------------------------

export type ColorPair = {
  // What this pairing is, for the report (e.g. "Headline on card").
  label: string
  // Foreground (text / icon / border) color. Hex.
  fg: string
  // Background it sits on. Hex (resolve translucency/gradients to an opaque
  // base before passing — use effectiveBaseColor / darkestOf).
  bg: string
  // 'text' pairs need 4.5:1 (3:1 large). 'ui' pairs (borders, icons,
  // decorative) need 3:1. 'large-text' needs 3:1.
  kind?: 'text' | 'large-text' | 'ui'
}

export type ColorViolation = {
  label: string
  fg: string
  bg: string
  ratio: number | null
  required: number
  severity: 'error' | 'warning'
  message: string
}

const requiredRatio = (kind: ColorPair['kind']): number =>
  kind === 'ui' || kind === 'large-text' ? 3 : 4.5

/**
 * The overlap detector. Given concrete fg/bg pairings, flag every one that
 * collides (contrast below the WCAG floor for its kind). A near-1:1 ratio
 * (e.g. white-on-white) is an 'error'; merely-below-threshold is a 'warning'.
 */
export function auditColorPairs(pairs: ColorPair[]): ColorViolation[] {
  const out: ColorViolation[] = []
  for (const p of pairs) {
    const required = requiredRatio(p.kind)
    const ratio = contrastRatio(p.fg, p.bg)
    if (ratio == null) continue // can't resolve one side — skip rather than false-flag
    if (ratio >= required) continue
    // Below threshold. Severe collisions (effectively invisible) are errors.
    const severity: 'error' | 'warning' = ratio < 1.6 ? 'error' : 'warning'
    const pretty = ratio.toFixed(2)
    out.push({
      label: p.label,
      fg: p.fg,
      bg: p.bg,
      ratio,
      required,
      severity,
      message:
        severity === 'error'
          ? `${p.label}: ${p.fg} on ${p.bg} is ${pretty}:1 — effectively invisible (needs ${required}:1).`
          : `${p.label}: ${p.fg} on ${p.bg} is only ${pretty}:1 (needs ${required}:1).`,
    })
  }
  return out
}

/**
 * Audit a resolved palette's own internal pairings — the text/muted-on-surface
 * pairs the palette guarantees. Should always come back clean for palettes
 * produced by resolvePalette; used as a self-check / regression guard and to
 * audit hand-authored templates.
 */
export function auditPalette(pal: ResolvedPalette, extraPairs: ColorPair[] = []): ColorViolation[] {
  return auditColorPairs([
    { label: 'Body text on surface', fg: pal.text, bg: pal.surfaceBase, kind: 'text' },
    { label: 'Muted text on surface', fg: pal.textMute, bg: pal.surfaceBase, kind: 'large-text' },
    ...extraPairs,
  ])
}
