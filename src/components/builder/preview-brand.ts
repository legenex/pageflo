/**
 * The brand a preview uses when no brand is chosen.
 *
 * It lives in its own module rather than inside `lp/render.tsx` because both
 * builders need it: a quiz still and a landing-page thumbnail both have to
 * answer "what does this template look like with no client attached", and
 * importing it from the landing-page renderer would pull that whole renderer
 * into the quiz builder's bundle to read one object literal. `lp/render`
 * re-exports it, so every existing import address still works.
 */
export const PREVIEW_BRAND_DEFAULT = {
  id: 'preview',
  name: 'Preview',
  displayName: 'Your Brand',
  shortName: 'YB',
  tagline: '',
  primaryDomain: '',
  logoUrl: '',
  logoUrlDark: '',
  faviconUrl: '',
  // Deliberately colourless. "No brand" means the template identity shows
  // through; inventing a slate palette here would make the brandless preview
  // the one place in the product that renders in a colour nobody chose.
  colors: {},
  typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  contact: { callNumber: '', callCtaText: 'CLICK HERE TO CALL', callCtaStyle: 'pill' },
  legal: { copyright: '(c) 2026 Your Brand', tcpaText: '', privacyUrl: '', termsUrl: '', defaultDisclaimer: 'Brand disclaimer goes here.' },
}
