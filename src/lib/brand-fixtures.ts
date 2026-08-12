/**
 * Thirteen brands built to break colour derivation.
 *
 * These exist because verifying a template against whichever brands happen to
 * be in the database proves nothing about the next brand somebody authors. It
 * proves that today's rows survive today's templates, and it quietly encodes
 * today's data into the check: the day an operator picks a yellow, the check
 * that passed every morning for a month says nothing about it.
 *
 * So none of these is a row. Each one is a hand-written set of authored token
 * values chosen to attack a specific step of the derivation, run through the
 * real `siteToBrand` so what a template receives here is exactly what it would
 * receive in production. A template that renders all thirteen readably renders
 * any brand readably, because the thirteen bracket the space: both luminance
 * extremes and the pivot between them, chroma at zero, near-zero and maximum,
 * a page and its ink set to the same value, and three ways of authoring a
 * colour the resolver cannot parse.
 *
 * TWO OF THEM ASSERT FAILURE RATHER THAN APPEARANCE.
 *
 *   `missingRequired` must make `resolveBrandTokens` THROW. Substituting grey
 *   for a brand that is missing a required token would hide a brand that can
 *   never publish behind a brand that merely looks unfinished, and those need
 *   different answers from whoever is looking at the screen.
 *
 *   `none` has authored nothing at all. It must come back true neutral - no
 *   hue anywhere - and reported as brandless, not dressed in whichever
 *   template identity happened to supply the fallback. A page that borrows an
 *   identity's vermilion because its own brand is empty is a page showing a
 *   colour nobody chose.
 *
 * THIS FILE IS A VERIFICATION ASSET, NOT RUNTIME CODE. Nothing under
 * `src/app/(public)` and no collection may import it: a fixture that reaches a
 * public render is a fake brand on a real page. `scripts/sweep-templates.mts`
 * enforces that boundary on every run rather than trusting a convention.
 */

import { siteToBrand } from './brand-map'
import type { BrandToken } from './brand/tokens'

/** Exactly what a human types into the brand editor, and nothing else. */
export type AuthoredTokens = Partial<Record<BrandToken, string>>

/** The brand-shaped object every template consumes. */
export type FixtureBrand = ReturnType<typeof siteToBrand>

export type BrandFixture = {
  id: string
  /** The derivation step this fixture is built to break. */
  attacks: string
  authored: AuthoredTokens
  /**
   * What `resolveBrandTokens` must do with `authored`.
   *
   * `throws` is an assertion about refusal, not a note about brittleness: a
   * brand missing a required token has to be refused at the resolver, because
   * every softer answer renders something nobody authored.
   */
  resolves: 'ok' | 'throws'
  /** Required tokens this fixture omits or writes unparseably, in resolver order. */
  missing?: BrandToken[]
  /**
   * True for the brand that has authored nothing. It must resolve achromatic
   * and be reported as brandless; an identity-sourced hue here is the bug.
   */
  brandless?: boolean
  brand: FixtureBrand
}

/**
 * Fixture site ids are negative on purpose.
 *
 * Payload ids are positive, so a negative one cannot collide with a real Site
 * and `site_-3` is unmistakable in any log or screenshot that a fixture leaked
 * into. The alternative - plausible ids like 9001 - reads as a real tenant to
 * anyone who did not write this file.
 */
let nextFixtureSiteId = 0

const fixture = (
  id: string,
  attacks: string,
  authored: AuthoredTokens,
  extra: Pick<BrandFixture, 'resolves'> & Partial<Pick<BrandFixture, 'missing' | 'brandless'>>,
): BrandFixture => {
  nextFixtureSiteId -= 1
  return {
    id,
    attacks,
    authored,
    resolves: extra.resolves,
    missing: extra.missing,
    brandless: extra.brandless,
    // Through the production path deliberately. Hand-writing the resolved
    // object instead would test a shape rather than the code that produces it,
    // and the code that produces it is the thing under test.
    brand: siteToBrand(
      {
        id: nextFixtureSiteId,
        slug: `fixture-${id}`,
        name: `Fixture: ${id}`,
        status: 'active',
        ...(Object.keys(authored).length > 0 ? { brand: authored } : {}),
      },
      [],
    ),
  }
}

/** Every required token, in the order `REQUIRED_TOKENS` declares them. */
const ALL_REQUIRED: BrandToken[] = ['primary', 'cta', 'bg', 'ink']

export const BRAND_FIXTURES: BrandFixture[] = [
  // 1. Nothing authored. The brandless case, which is what every Site looks
  //    like between being created and having its colours filled in - so it is
  //    the state a template is most likely to meet first, not an edge case.
  fixture(
    'none',
    'No brand at all: must resolve true neutral and report brandless, never borrow the template identity’s hue.',
    {},
    { resolves: 'throws', missing: ALL_REQUIRED, brandless: true },
  ),

  // 2. Real colours, one required token absent. Distinct from `none` in the
  //    only way that matters: this brand has an identity and still cannot
  //    publish, so greying it out would describe it wrongly in both directions.
  fixture(
    'missingRequired',
    'A required token is absent while the rest are authored: the resolver must refuse rather than substitute.',
    { primary: '#2E4E3F', bg: '#FBFAF7', ink: '#1B1F1D' },
    { resolves: 'throws', missing: ['cta'] },
  ),

  // 3. The page and its body text set to the same value, with the card and the
  //    hairline set to it as well. Every one of those is an authored value the
  //    resolver could have taken on trust, and each is a different check.
  fixture(
    'inkEqualsBg',
    'Ink, card and hairline all equal the page: authored values that must be verified against the ground, not trusted.',
    {
      primary: '#8C6A3F',
      cta: '#8C6A3F',
      bg: '#F7F5F0',
      ink: '#F7F5F0',
      surface: '#F7F5F0',
      surface_2: '#F7F5F0',
      border: '#F7F5F0',
    },
    { resolves: 'ok' },
  ),

  // 4. The `_ink` tokens are the only inks a human authors that sit ON a colour
  //    rather than on a ground, and they are the last ones still taken at face
  //    value. Body ink is verified; text on a button is not. This isolates that
  //    single gap by leaving the body pair perfectly readable.
  fixture(
    'unverifiedInk',
    'Authored primary_ink / cta_ink / accent_ink equal to the fills they sit on, with body text left readable.',
    {
      primary: '#FFFFFF',
      primary_ink: '#FFFFFF',
      cta: '#FEFEFE',
      cta_ink: '#FFFFFF',
      accent: '#FFFFFF',
      accent_ink: '#FFFFFF',
      bg: '#FFFFFF',
      ink: '#111111',
    },
    { resolves: 'ok' },
  ),

  // 5. The upper luminance wall. A card has to step off a page that is already
  //    at the top of the range, and a hairline has to be perceptible against it.
  fixture(
    'pureWhite',
    'Every surface, ink and hue at #FFFFFF: nothing can step lighter, so every layer must be derived downward.',
    {
      primary: '#FFFFFF',
      cta: '#FFFFFF',
      accent: '#FFFFFF',
      bg: '#FFFFFF',
      surface: '#FFFFFF',
      surface_2: '#FFFFFF',
      ink: '#FFFFFF',
      ink_muted: '#FFFFFF',
      border: '#FFFFFF',
    },
    { resolves: 'ok' },
  ),

  // 6. The lower wall, and the one that also divides by zero in spirit: a
  //    luminance of exactly 0 leaves lightness arithmetic with no hue to keep
  //    and no headroom to darken into.
  fixture(
    'pureBlack',
    'Every surface, ink and hue at #000000: zero luminance, zero hue, and no room to derive downward.',
    {
      primary: '#000000',
      cta: '#000000',
      accent: '#000000',
      bg: '#000000',
      surface: '#000000',
      surface_2: '#000000',
      ink: '#000000',
      ink_muted: '#000000',
      border: '#000000',
    },
    { resolves: 'ok' },
  ),

  // 7. The pivot. #757575 sits where white text and black text are jointly at
  //    their worst - both land near 4.6:1 - so it is the tightest point in the
  //    entire light-or-dark decision. A rule that is off by a hair fails here
  //    and nowhere else, which is exactly why it is worth a fixture.
  fixture(
    'pivotGrey',
    'A ground at the luminance where light and dark text are equally bad (~4.6:1 either way): the light/dark pivot.',
    {
      primary: '#757575',
      cta: '#757575',
      accent: '#757575',
      bg: '#757575',
      surface: '#757575',
      ink: '#757575',
      border: '#757575',
    },
    { resolves: 'ok' },
  ),

  // 8. Hues with no headroom. A pure yellow cannot be darkened toward the page
  //    without leaving the hue, and cannot be lightened at all, so any rule
  //    that lifts a brand colour until it reads has to have a last resort.
  fixture(
    'neonOnWhite',
    'Maximum-luminance hues on a white page: colours that cannot be lifted far enough to read and must fall back.',
    {
      primary: '#FFFF00',
      cta: '#FFFF00',
      accent: '#00FF00',
      bg: '#FFFFFF',
      surface: '#FFFFFF',
      ink: '#FFFF00',
    },
    { resolves: 'ok' },
  ),

  // 9. Full chroma in every slot, with no two of them related. Attacks hue
  //    blending and saturation caps, which are the two places a derived surface
  //    can come back a colour nobody would have chosen.
  fixture(
    'saturationExtremes',
    'Fully saturated, mutually unrelated hues in every slot: hue blending and saturation caps at their limit.',
    {
      primary: '#FF0000',
      cta: '#0000FF',
      accent: '#00FF00',
      bg: '#FF00FF',
      surface: '#FFFF00',
      surface_2: '#00FFFF',
      ink: '#00FFFF',
      ink_muted: '#FF00FF',
      border: '#FF0000',
    },
    { resolves: 'ok' },
  ),

  // 10. A brand that is legitimately dark-first. Not a broken brand - a correct
  //     one that breaks any rule written on the assumption that a page is light,
  //     and the one that catches a dark template darkening an already-dark
  //     ground until its own card disappears into it.
  fixture(
    'darkGround',
    'A correct dark-first brand: catches light-page assumptions and dark templates re-darkening a dark ground.',
    {
      primary: '#7DF9C4',
      primary_ink: '#04140D',
      cta: '#7DF9C4',
      cta_ink: '#04140D',
      accent: '#FF7A45',
      bg: '#0A0C10',
      surface: '#141821',
      surface_2: '#1C222D',
      ink: '#F2F5F7',
      ink_muted: '#9AA3AD',
      border: '#232A34',
    },
    { resolves: 'ok' },
  ),

  // 11. Chroma near zero but not at zero. Every hue-preserving lift in the
  //     system keeps the hue and moves the lightness; here there is a hue to
  //     keep worth about two percent saturation, which is where "keep the
  //     brand's colour" and "produce a grey" become the same operation.
  fixture(
    'nearNeutralHue',
    'A primary with almost no chroma that is not grey: hue-preserving lifts with nearly nothing to preserve.',
    {
      primary: '#2B2F33',
      cta: '#2B2F33',
      accent: '#33302B',
      bg: '#F4F4F5',
      surface: '#EDEDEE',
      ink: '#1A1C1E',
      border: '#DEDEE0',
    },
    { resolves: 'ok' },
  ),

  // 12. Eight-digit hex. Valid CSS, and the two hex validators in this codebase
  //     disagree about it: the brand resolver's rejects it, the palette
  //     builder's accepts it. The strict one runs first today, so the loose one
  //     is unreachable through `siteToBrand` - but "unreachable today" is a
  //     property of call order, not of either validator, and this fixture is
  //     what notices when the order changes.
  fixture(
    'alphaHex',
    'Colours authored as #RRGGBBAA: valid CSS that one hex validator accepts and the other rejects.',
    {
      primary: '#3355AACC',
      cta: '#3355AACC',
      accent: '#AA335588',
      bg: '#FFFFFFEE',
      surface: '#F0F0F0AA',
      ink: '#111111FF',
      border: '#00000022',
    },
    { resolves: 'throws', missing: ALL_REQUIRED },
  ),

  // 13. Required tokens valid, every optional written in a notation the
  //     resolver cannot parse - including the shape tokens, which are the ones
  //     nobody thinks of as colours and so the ones nobody guards. An
  //     unparseable optional has to become a derivation, never reach the CSS.
  fixture(
    'junkOptionals',
    'Valid required tokens with every optional in an unparseable notation: must derive, never emit the raw string.',
    {
      primary: '#4A5D23',
      cta: '#4A5D23',
      bg: '#FFFFFF',
      ink: '#1A1A1A',
      accent: 'rebeccapurple',
      accent_ink: 'currentColor',
      primary_ink: 'hsl(0 0% 100%)',
      cta_ink: 'rgb(255 255 255)',
      surface: 'rgb(240,240,240)',
      surface_2: '',
      ink_muted: 'var(--muted)',
      border: '#12345',
      radius: '8px',
      radius_lg: 'large',
    },
    { resolves: 'ok' },
  ),
]

export const BRAND_FIXTURE_BY_ID: Record<string, BrandFixture> = Object.fromEntries(
  BRAND_FIXTURES.map((f) => [f.id, f]),
)

/**
 * Names of the colours on a fixture brand that carry IDENTITY.
 *
 * The brandless assertion runs over exactly these. `success`, `warning` and
 * `danger` are deliberately absent: they are system colours, identical for
 * every brand by design, and a brandless page still renders a red delete
 * button. Asserting no-hue over them would make the assertion fail on correct
 * behaviour, which is how a check gets deleted instead of fixed.
 */
export const IDENTITY_COLOR_KEYS = [
  'primary',
  'accent',
  'background',
  'cardBg',
  'cta',
  'ctaInk',
  'ink',
  'inkMuted',
  'border',
  'textOnDark',
  'onPrimary',
] as const
