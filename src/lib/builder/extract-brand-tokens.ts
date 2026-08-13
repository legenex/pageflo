// Extract brand color tokens + font family from an imported CSS string, and
// synthesise a per-page `:root` override that maps them onto the LegalOS
// --site-* variables. The bespoke renderer (nav, hero, trust strip, CTAs,
// footer) reads those vars via the step-9 brand cascade, so the imported
// page renders in the original palette without touching the Site row.

const HEX = /#([0-9a-fA-F]{3,8})\b/
const ROOT_BLOCK = /:root\s*\{([\s\S]*?)\}/g
// The trailing semicolon is OPTIONAL on the last declaration in a block, and
// requiring it dropped that declaration silently. Worse than missing: the
// caller falls a missing `accent` back to `primary`, so
// `:root{--primary:#0b3d91;--accent:#c8a24a}` reported accent as #0b3d91 - a
// wrong answer rather than no answer. `extract-colors.ts:210` already had the
// correct form and a comment explaining it; this copy did not.
const CSS_VAR_DECL = /--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g

type Tokens = Record<string, string>

// Pull every --name: value pair out of every :root block. Multiple :root
// blocks just merge (later wins, matching the cascade).
const parseRootVars = (css: string): Tokens => {
  const out: Tokens = {}
  let m: RegExpExecArray | null
  while ((m = ROOT_BLOCK.exec(css)) !== null) {
    const body = m[1]
    let v: RegExpExecArray | null
    CSS_VAR_DECL.lastIndex = 0
    while ((v = CSS_VAR_DECL.exec(body)) !== null) {
      out[v[1]] = v[2].trim()
    }
  }
  return out
}

// Some authors put colours in property declarations rather than vars. Sweep
// for the most prominent ones as a fallback so we still get colours out of a
// CSS file that doesn't use :root variables.
const fallbackHexFromCss = (css: string, propRegex: RegExp): string | undefined => {
  const m = propRegex.exec(css)
  if (!m) return undefined
  const hex = HEX.exec(m[0])
  return hex ? `#${hex[1]}` : undefined
}

// Take the first matching token name out of a candidate list (case-insensitive).
const pickToken = (tokens: Tokens, candidates: string[]): string | undefined => {
  const lower: Record<string, string> = {}
  for (const k of Object.keys(tokens)) lower[k.toLowerCase()] = tokens[k]
  for (const c of candidates) {
    const v = lower[c.toLowerCase()]
    if (v && HEX.test(v)) return v
  }
  return undefined
}

// Strip quotes / fallback fonts and keep the leading family name only —
// matches what the public layout already does for --site-font-*.
const cleanFontFamily = (s: string | undefined): string | undefined => {
  if (!s) return undefined
  const first = s.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return first || undefined
}

export type ExtractedBrand = {
  primary?: string
  accent?: string
  ink?: string
  surface?: string
  muted?: string
  success?: string
  warning?: string
  danger?: string
  fontHeading?: string
  fontBody?: string
}

export function extractBrandFromCss(css: string): ExtractedBrand {
  if (!css) return {}
  const tokens = parseRootVars(css)
  // Primary is the most ambiguous — sites use 'primary' for the dominant
  // brand colour but some put the dark background there instead. Prefer the
  // most CTA-like options first: orange / red / accent-like names usually
  // mean 'click me'. Then fall back to plain 'primary' / 'brand'.
  const primary =
    pickToken(tokens, ['primary', 'brand', 'cta', 'orange', 'red', 'action', 'accent-cta']) ||
    fallbackHexFromCss(css, /\.(btn|cta|button)[^{}]*\{[^}]*background(-color)?\s*:[^;}]*/i)
  const accent =
    pickToken(tokens, ['accent', 'gold', 'yellow', 'highlight', 'secondary']) ||
    primary
  const ink =
    pickToken(tokens, ['ink', 'navy', 'dark', 'foreground', 'text', 'fg', 'navy-dark']) ||
    fallbackHexFromCss(css, /(?:body|html|h1|\.section-title)[^{}]*\{[^}]*color\s*:[^;}]*/i)
  const surface =
    pickToken(tokens, ['surface', 'background', 'bg', 'light-bg', 'page-bg', 'paper'])
  const muted =
    pickToken(tokens, ['muted', 'gray', 'grey', 'text-muted', 'text-dim', 'subtle'])
  const success = pickToken(tokens, ['success', 'green', 'positive'])
  const warning = pickToken(tokens, ['warning', 'amber'])
  const danger = pickToken(tokens, ['danger', 'red', 'error', 'negative'])

  // Fonts: tokens first, then a sweep for body / html { font-family }.
  const fontTokenHeading = pickFontToken(tokens, ['font-heading', 'heading-font', 'font-head'])
  const fontTokenBody = pickFontToken(tokens, ['font-body', 'body-font', 'font'])
  const fontHeading =
    cleanFontFamily(fontTokenHeading) ||
    cleanFontFamily(fallbackFontFromCss(css, /(h1|h2|h3|h4|h5|h6)[^{}]*\{[^}]*font-family\s*:[^;}]*/i))
  const fontBody =
    cleanFontFamily(fontTokenBody) ||
    cleanFontFamily(fallbackFontFromCss(css, /(?:body|html)[^{}]*\{[^}]*font-family\s*:[^;}]*/i))

  const out: ExtractedBrand = {}
  if (primary) out.primary = primary
  if (accent) out.accent = accent
  if (ink) out.ink = ink
  if (surface) out.surface = surface
  if (muted) out.muted = muted
  if (success) out.success = success
  if (warning) out.warning = warning
  if (danger) out.danger = danger
  if (fontHeading) out.fontHeading = fontHeading
  if (fontBody) out.fontBody = fontBody
  return out
}

export const cleanFontFamilyName = cleanFontFamily

export const pickFontToken = (tokens: Tokens, names: string[]): string | undefined => {
  const lower: Record<string, string> = {}
  for (const k of Object.keys(tokens)) lower[k.toLowerCase()] = tokens[k]
  for (const n of names) {
    const v = lower[n.toLowerCase()]
    if (v) return v
  }
  return undefined
}

export const fallbackFontFromCss = (css: string, propRegex: RegExp): string | undefined => {
  const m = propRegex.exec(css)
  if (!m) return undefined
  const ff = /font-family\s*:\s*([^;}]+)/i.exec(m[0])
  return ff ? ff[1].trim() : undefined
}

// Synthesise a <style>:root{...}</style> block that maps the extracted tokens
// onto the LegalOS --site-* variables the bespoke renderer reads. Only
// emits the vars we actually found so we don't override the Site's brand with
// blanks. Returns null when nothing was extracted.
export function buildBrandOverrideCss(brand: ExtractedBrand): string | null {
  const lines: string[] = []
  const add = (name: string, value: string | undefined) => {
    if (value) lines.push(`  ${name}: ${value};`)
  }
  add('--site-primary', brand.primary)
  add('--site-accent', brand.accent)
  add('--site-ink', brand.ink)
  add('--site-surface', brand.surface)
  add('--site-muted', brand.muted)
  add('--site-success', brand.success)
  add('--site-warning', brand.warning)
  add('--site-danger', brand.danger)
  if (brand.fontHeading)
    lines.push(`  --site-font-heading: '${brand.fontHeading.replace(/'/g, "\\'")}', system-ui, sans-serif;`)
  if (brand.fontBody)
    lines.push(`  --site-font-body: '${brand.fontBody.replace(/'/g, "\\'")}', system-ui, sans-serif;`)
  if (lines.length === 0) return null
  // Extra-high specificity so we beat anything the public layout already set
  // for this site. :root + html.site-shell + .legalos-builder-canvas matches
  // the public site AND the admin builder preview canvas.
  return [`/* Extracted brand override from import */`, `:root,`, `html.site-shell,`, `.legalos-builder-canvas {`, ...lines, `}`].join('\n')
}
