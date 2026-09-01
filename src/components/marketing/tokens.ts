/**
 * Marketing-site palette.
 *
 * The marketing site is a public, statically-styled surface rendered outside the
 * operator application's Tailwind theme, so it carries its own literal palette
 * rather than reading `--color-*`. The values are the same PageFlo tokens
 * defined in `src/app/globals.css`; this file is the single place the marketing
 * components read them from, so the two cannot drift by accident.
 *
 * `scripts/lint-brand-tokens.mjs` exempts the operator/product surfaces from the
 * hardcoded-colour rule for exactly this reason: these are product chrome, not
 * tenant brand output, and they must never be derived from a customer palette.
 */
export const M = {
  canvas: '#0A0E15',
  surfaceDeep: '#111823',
  surface1: '#131924',
  surface2: '#182030',
  surface3: '#1F2939',
  border: '#1A2130',
  borderStrong: '#243044',
  ink: '#EEF2F8',
  inkSecondary: '#C7D0DC',
  inkMuted: '#8B95A8',
  inkDim: '#808C9E',
  brand: '#E5484D',
  brandHover: '#D43B40',
  pos: '#3DD68C',
  warn: '#FACC14',
  info: '#5AA6DC',
  teal: '#41D9C7',
  purple: '#9585DD',
  orange: '#F97316',
} as const

/**
 * Illustrative brand colours used by the example deployments shown on the
 * marketing page. These are invented example brands, labelled as such wherever
 * they appear. They are not customers.
 */
export const EXAMPLE_BRANDS = {
  reclaim: '#2F7D5C',
  safestride: '#3663B8',
  checkacase: '#8C5AC4',
  dontsettle: '#C2703A',
} as const

export const FONT_SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
