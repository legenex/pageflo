/**
 * The one function that turns a brand into CSS.
 *
 * Before this there were three brand-to-CSS paths (the public layout, the block
 * renderer, and the funnel brand map) each with their own fallbacks, and a
 * per-deployment theme generator writing a fourth palette on top. This replaces
 * all of it: a brand goes in, resolved CSS variables and a contrast audit come
 * out, and nothing else in the codebase is allowed to decide a colour.
 *
 * Three properties are deliberate and load-bearing:
 *
 *  1. NO FALLBACK PALETTE. A missing required token throws. The old layout had
 *     `?? '#0B1F3A'` on every variable, which meant a brand with no data
 *     rendered as a plausible-looking navy site instead of visibly failing.
 *     That is how wrong colours survive to production: they look deliberate.
 *
 *  2. EVERY DERIVED VALUE IS COMPUTED, NEVER STORED. Ramps, interaction states
 *     and unset `_ink` values are recomputed on each resolve. A stored derived
 *     value is a cache with no invalidation, and it goes stale the moment
 *     someone edits the colour it came from.
 *
 *  3. THE AUDIT IS RETURNED, NOT LOGGED. Callers get every resolved pair with
 *     its ratio so the publish gate can block on it and the brand editor can
 *     show it. A contrast check nobody can see is a contrast check nobody acts
 *     on.
 *
 * Colour maths is reused from builder/color-system.ts rather than
 * reimplemented, per the standing rule about never rewriting the WCAG maths.
 */

import {
  parseHex,
  rgbToHsl,
  hslToHex,
  getSafeTextColor,
  getSafeMutedColor,
} from '../builder/color-system'
import { contrastRatio } from '../builder/page-lint'
import {
  COLOR_TOKENS,
  SHAPE_TOKENS,
  REQUIRED_TOKENS,
  SYSTEM_COLORS,
  RAMP_STEPS,
  STATE_DELTAS,
  CONTRAST_MIN_BODY,
  CONTRAST_MIN_LARGE,
  TOKEN_LABELS,
  type ColorToken,
  type BrandToken,
} from './tokens'

export type BrandTokenInput = Partial<Record<BrandToken, string | number | null | undefined>>

export type ResolveOptions = {
  /** Light is the authored set as-is. Dark is the same set resolved onto a dark ground. */
  mode?: 'light' | 'dark'
  density?: 'compact' | 'regular' | 'roomy'
}

export type ContrastCheck = {
  pair: string
  fg: string
  bg: string
  ratio: number
  /** Body text needs 4.5:1; large text and UI edges need 3:1. */
  threshold: number
  pass: boolean
}

export type ResolvedTokens = {
  mode: 'light' | 'dark'
  density: 'compact' | 'regular' | 'roomy'
  /** Every CSS custom property, name to value, ready to serialise. */
  vars: Record<string, string>
  /** The same thing as a `:root { ... }` declaration body. */
  css: string
  audit: ContrastCheck[]
  /** True when every audited pair passes. The publish gate reads this. */
  passes: boolean
}

export class MissingBrandTokenError extends Error {
  readonly missing: BrandToken[]
  constructor(missing: BrandToken[]) {
    super(
      `Brand is missing required token${missing.length > 1 ? 's' : ''}: ${missing
        .map((t) => TOKEN_LABELS[t])
        .join(', ')}. Set them on the brand identity before rendering or publishing.`,
    )
    this.name = 'MissingBrandTokenError'
    this.missing = missing
  }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const hex = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return HEX.test(t) ? t : null
}

/** Shift a colour's lightness by a delta in the 0..1 HSL space, clamped. */
const shiftLightness = (hexValue: string, delta: number): string => {
  const rgb = parseHex(hexValue)
  if (!rgb) return hexValue
  const [h, s, l] = rgbToHsl(rgb)
  return hslToHex(h, s, Math.min(1, Math.max(0, l + delta)))
}

/**
 * Build a 50..900 ramp around a base colour.
 *
 * 500 is always the authored colour exactly, so a brand's primary never drifts
 * because it also had to be a ramp step. The rest interpolate towards near-white
 * and near-black rather than pure white and black, which keeps tinted surfaces
 * recognisably branded instead of washing out to grey.
 */
const buildRamp = (base: string): Record<number, string> => {
  const rgb = parseHex(base)
  const out: Record<number, string> = {}
  if (!rgb) {
    for (const step of RAMP_STEPS) out[step] = base
    return out
  }
  const [h, s, l] = rgbToHsl(rgb)
  const lightEnd = 0.97
  const darkEnd = 0.12
  for (const step of RAMP_STEPS) {
    if (step === 500) {
      out[step] = base
      continue
    }
    if (step < 500) {
      // 50 sits at lightEnd, 400 sits just above the base.
      const t = (500 - step) / 450
      out[step] = hslToHex(h, s, l + (lightEnd - l) * t)
    } else {
      const t = (step - 500) / 400
      out[step] = hslToHex(h, s, l - (l - darkEnd) * t)
    }
  }
  return out
}

const DENSITY_SCALE = { compact: 0.85, regular: 1, roomy: 1.2 } as const

export const resolveBrandTokens = (
  brand: BrandTokenInput | null | undefined,
  options: ResolveOptions = {},
): ResolvedTokens => {
  const mode = options.mode ?? 'light'
  const density = options.density ?? 'regular'
  const b = (brand ?? {}) as BrandTokenInput

  // 1. Required tokens. Throw rather than substitute: an invented palette that
  //    looks intentional is worse than a visible failure.
  const missing = REQUIRED_TOKENS.filter((t) => {
    const raw = b[t]
    return COLOR_TOKENS.includes(t as ColorToken) ? !hex(raw) : !raw
  })
  if (missing.length > 0) throw new MissingBrandTokenError(missing)

  const primary = hex(b.primary)!
  const cta = hex(b.cta)!
  const authoredBg = hex(b.bg)!
  const authoredInk = hex(b.ink)!

  // 2. Dark mode is the same authored set resolved onto an inverted ground, not
  //    a second set of authored values. One brand, two resolutions.
  const bg = mode === 'dark' ? shiftLightness(authoredBg, -(0.72 - 0)) : authoredBg

  // Body ink is DERIVED AND VERIFIED, never taken on trust.
  //
  // Dark mode always derived it; light mode used the authored value verbatim,
  // which is how a brand ended up with #F7F5F0 text on an #F7F5F0 page. The
  // audit below reported the failure and nothing acted on it, so the promise
  // three comments down - that unreadable text is structurally unreachable -
  // was true of every ink except the one that carries the actual body copy.
  //
  // An authored ink that reads is kept, because a brand that has chosen a
  // near-black or a warm off-black means it. One that cannot be read on its own
  // page is replaced rather than rendered, since a page nobody can read is not
  // a branding decision.
  const ink =
    mode === 'dark'
      ? getSafeTextColor(bg).hex
      : (contrastRatio(authoredInk, bg) ?? 0) >= CONTRAST_MIN_BODY
        ? authoredInk
        : getSafeTextColor(bg).hex

  const accent = hex(b.accent) ?? primary

  // 3. Surfaces step off the background rather than being invented, so a card
  //    always reads as a layer above the page it sits on whatever the brand is.
  const surfaceDelta = mode === 'dark' ? 0.05 : -0.035
  const steppedSurface = shiftLightness(bg, surfaceDelta)
  const authoredSurface = hex(b.surface)
  // A card must read as a layer above the page. An authored surface equal to
  // the page ground is not a layer, it is the same colour twice, and a brand
  // whose background and card background are both #F7F5F0 has said nothing
  // about cards. The 1.03 floor is measured rather than guessed: contrast ratio
  // compresses badly at small deltas, and an off-white card on white is 1.05.
  const surface =
    authoredSurface && (contrastRatio(authoredSurface, bg) ?? 1) >= 1.03 ? authoredSurface : steppedSurface
  const surface2 = hex(b.surface_2) ?? shiftLightness(surface, surfaceDelta)

  // 4. Every _ink is derived against the surface it will actually sit on. This
  //    is what makes unreadable text structurally unreachable rather than
  //    merely unlikely.
  const primaryInk = hex(b.primary_ink) ?? getSafeTextColor(primary).hex
  const accentInk = hex(b.accent_ink) ?? getSafeTextColor(accent).hex
  const ctaInk = hex(b.cta_ink) ?? getSafeTextColor(cta).hex
  const inkMuted = hex(b.ink_muted) ?? getSafeMutedColor(ink, bg).hex
  // Two borders, because one token was being asked to do two jobs at two
  // different standards.
  //
  // A hairline separating sections only has to be PERCEPTIBLE. Holding it to
  // the 3:1 that WCAG requires for control boundaries failed every brand in the
  // system on the same pair, and a publish gate that always fails is a gate
  // nobody can use - it gets bypassed, and then it protects nothing.
  //
  // The boundary of a control a person has to find, an input or a button edge,
  // genuinely does need 3:1. That is what borderStrong is for, and it is
  // derived rather than authored so it cannot be set to something invisible.
  const HAIRLINE_MIN = 1.2
  const authoredBorder = hex(b.border)
  const steppedBorder = shiftLightness(bg, mode === 'dark' ? 0.12 : -0.12)
  const border =
    authoredBorder && (contrastRatio(authoredBorder, bg) ?? 0) >= HAIRLINE_MIN ? authoredBorder : steppedBorder

  // Walked away from the page until it clears 3:1, rather than guessed at.
  let borderStrong = border
  for (let step = 1; step <= 12 && (contrastRatio(borderStrong, bg) ?? 0) < CONTRAST_MIN_LARGE; step += 1) {
    borderStrong = shiftLightness(bg, (mode === 'dark' ? 0.06 : -0.06) * step)
  }

  /*
   * `??` DOES NOT CATCH AN EMPTY STRING, and `siteToBrand` normalises every
   * absent token to `''`. So a brand that authored only the four required
   * colours - which is most of them - reached here with `radius: ''`,
   * `shadow: ''` and `font_heading: ''`, and shipped:
   *
   *   --site-radius: "0px"          Number('') is 0, not the default 8
   *   --site-shadow: ""             every elevation flat
   *   --site-font-heading: ",system-ui,sans-serif"
   *
   * That last one is the worst: a leading comma makes the whole `font-family`
   * declaration invalid, so headings silently fall back to the UA font and the
   * brand's typography never appears. Measured, not inferred.
   *
   * `pxNumber` additionally survives a UNIT: `radius: '8px'` gave `NaNpx`,
   * which is a value an operator can plausibly type and which no schema stopped.
   */
  const orDefault = (v: unknown, fallback: string): string => {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
    return s === '' ? fallback : s
  }
  const pxNumber = (v: unknown, fallback: number): number => {
    const n = parseFloat(orDefault(v, String(fallback)))
    return Number.isFinite(n) ? n : fallback
  }

  const fontHeading = orDefault(b.font_heading, 'Inter')
  const fontBody = orDefault(b.font_body, 'Inter')
  const radiusBase = pxNumber(b.radius, 8)
  const radiusLg = pxNumber(b.radius_lg, radiusBase * 2)
  const shadow = orDefault(b.shadow, '0 8px 24px -12px rgba(0,0,0,0.35)')
  const scale = DENSITY_SCALE[density]

  const vars: Record<string, string> = {
    '--site-primary': primary,
    '--site-primary-ink': primaryInk,
    '--site-accent': accent,
    '--site-accent-ink': accentInk,
    '--site-cta': cta,
    '--site-cta-ink': ctaInk,
    '--site-bg': bg,
    '--site-surface': surface,
    '--site-surface-2': surface2,
    '--site-ink': ink,
    '--site-ink-muted': inkMuted,
    '--site-border': border,
    '--site-border-strong': borderStrong,
    '--site-font-heading': `${fontHeading},system-ui,sans-serif`,
    '--site-font-body': `${fontBody},system-ui,sans-serif`,
    '--site-radius': `${radiusBase}px`,
    '--site-radius-lg': `${radiusLg}px`,
    '--site-shadow': shadow,
    '--site-density': String(scale),
    '--site-space': `${Math.round(16 * scale)}px`,
  }

  // 5. Ramps and interaction states, always computed.
  for (const [name, base] of [
    ['primary', primary],
    ['accent', accent],
    ['cta', cta],
  ] as const) {
    if (name !== 'cta') {
      const ramp = buildRamp(base)
      for (const step of RAMP_STEPS) vars[`--site-${name}-${step}`] = ramp[step]
    }
    for (const [state, delta] of Object.entries(STATE_DELTAS)) {
      vars[`--site-${name}-${state}`] =
        state === 'disabled' ? shiftLightness(base, mode === 'dark' ? -0.18 : 0.28) : shiftLightness(base, delta)
    }
  }

  // 6. Inverse pair: text that sits ON the ink colour when ink is used as a
  //    SURFACE rather than as text. Dark heroes, footers and panels do exactly
  //    that, and they are where hardcoded #ffffff usually hides. A literal white
  //    is only correct while the brand's ink happens to be dark; derived, it
  //    stays legible when a brand's ink is not.
  const inkInverse = getSafeTextColor(ink).hex
  vars['--site-ink-inverse'] = inkInverse
  vars['--site-ink-inverse-muted'] = getSafeMutedColor(inkInverse, ink).hex

  // Elevation and scrim. Neutral by design and identical for every brand: a
  // drop shadow is a depth cue, not an identity. Tokenised anyway so components
  // stop inventing their own alpha values and a future change lands in one file.
  vars['--site-shadow-sm'] = '0 1px 2px rgba(0,0,0,0.06)'
  vars['--site-shadow-md'] = '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)'
  vars['--site-shadow-lg'] = '0 20px 25px -5px rgba(0,0,0,0.10), 0 8px 10px -6px rgba(0,0,0,0.10)'
  vars['--site-scrim'] = 'rgba(0,0,0,0.55)'
  vars['--site-hairline'] = mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'
  vars['--site-tint'] = mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'

  // 7. System colours: identical for every brand, by design.
  for (const [name, value] of Object.entries(SYSTEM_COLORS)) {
    vars[`--sys-${name}`] = value
    vars[`--sys-${name}-ink`] = getSafeTextColor(value).hex
  }

  // 8. Legacy aliases, kept alive on purpose and in exactly one place.
  //
  //    `--site-muted` is used in 22 components that predate this contract.
  //    `--site-success/warning/danger` used to be BRAND fields, which is what
  //    let a destructive action render in brand orange on one site and brand
  //    red on another. Pointing the old names at the fixed system values ends
  //    that without a sweep through every component: status now means the same
  //    thing everywhere, whatever the brand record still says.
  //
  //    Delete this block once the components have moved to the canonical names.
  vars['--site-muted'] = inkMuted
  vars['--site-success'] = SYSTEM_COLORS.success
  vars['--site-warning'] = SYSTEM_COLORS.warning
  vars['--site-danger'] = SYSTEM_COLORS.danger

  const check = (pair: string, fg: string, bgc: string, threshold: number): ContrastCheck => {
    const ratio = contrastRatio(fg, bgc) ?? 0
    return { pair, fg, bg: bgc, ratio: Math.round(ratio * 100) / 100, threshold, pass: ratio >= threshold }
  }

  const audit: ContrastCheck[] = [
    check('Body text on page background', ink, bg, CONTRAST_MIN_BODY),
    check('Body text on card surface', ink, surface, CONTRAST_MIN_BODY),
    check('Secondary text on page background', inkMuted, bg, CONTRAST_MIN_LARGE),
    check('Text on primary', primaryInk, primary, CONTRAST_MIN_BODY),
    check('Text on call to action', ctaInk, cta, CONTRAST_MIN_BODY),
    check('Text on accent', accentInk, accent, CONTRAST_MIN_BODY),
    // Held to perceptibility, which is what a hairline is for.
    check('Section hairline against background', border, bg, HAIRLINE_MIN),
    // Held to the real standard, because this is what outlines a control.
    check('Control border against background', borderStrong, bg, CONTRAST_MIN_LARGE),
  ]

  const css = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('')

  return { mode, density, vars, css, audit, passes: audit.every((a) => a.pass) }
}

/** Convenience for a `<style>` tag: a complete `:root` rule. */
export const brandTokensCss = (brand: BrandTokenInput, options: ResolveOptions = {}): string =>
  `:root{${resolveBrandTokens(brand, options).css}}`
