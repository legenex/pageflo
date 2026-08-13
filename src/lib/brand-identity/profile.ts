/**
 * The Brand Profile: one typed, versioned description of a brand.
 *
 * This is the CONTRACT half of the brand-identity service. It defines what a
 * brand is, and nothing about where the values came from or how they were
 * chosen - that is precedence.ts and sources.ts.
 *
 * Three decisions are load-bearing and worth stating up front:
 *
 *  1. IT EXTENDS THE EXISTING NORMALISED SHAPE, it does not replace it. The
 *     `tokens` group uses the EXACT names from `lib/brand/tokens.ts`, so
 *     reducing a profile to what `siteToBrand` consumes is a copy, not a
 *     mapping table. A second mapping table is a second place for the two to
 *     drift, and this repo already paid for that once (three brand-to-CSS
 *     paths, four palettes).
 *
 *  2. EVERY SCALAR STYLE AND VOICE AXIS IS A CLOSED ENUM. An open string makes
 *     the profile undispatchable: nothing downstream can switch on "kind of
 *     formal", so the value would exist only to be shown back to a human. The
 *     template ids in this repo were open strings and every consumer grew its
 *     own silent fallback. Closed sets mean a renderer can exhaustively handle
 *     them and the compiler says when a new one is added.
 *
 *  3. THE VERSION IS PART OF THE DATA. A stored profile from an older shape has
 *     to be DETECTABLE, not silently misread, so `version` is a literal in the
 *     schema and `readProfile` checks it before validating anything else.
 *
 * Dependency-light on purpose: no node builtins, no network, no server-only
 * imports, so the admin UI can import the enums and the schema directly.
 */

import { z } from 'zod'
import { ALL_TOKENS, type BrandToken } from '../brand/tokens'

/**
 * Bump when a stored profile can no longer be read by this file.
 *
 * Adding an optional field does not need a bump; renaming, removing, or
 * changing the meaning of one does. A profile that fails the version check is
 * reported for migration rather than parsed on a hope.
 */
export const BRAND_PROFILE_VERSION = 1

/* -------------------------------------------------------------------------- */
/*                          Scalar axes - closed sets                          */
/* -------------------------------------------------------------------------- */

/**
 * Numeric voice axes use a 0..4 integer scale.
 *
 * Five points is the smallest scale that carries a neutral middle plus two
 * steps either side, which is what a human grading "how formal is this brand"
 * can actually distinguish. A 0..100 scale invites false precision: two sources
 * would report 62 and 65 for the same brand and the diff would call that a
 * change. Integers also make equality exact, so the refresh diff never fires on
 * floating-point noise.
 */
export const VOICE_SCALE_MIN = 0
export const VOICE_SCALE_MAX = 4
export const VOICE_SCALE_NEUTRAL = 2
const VoiceScale = z.number().int().min(VOICE_SCALE_MIN).max(VOICE_SCALE_MAX)

export const DENSITY = ['compact', 'regular', 'roomy'] as const
export const SPACING_CHARACTER = ['tight', 'balanced', 'airy'] as const
export const RADIUS_CHARACTER = ['square', 'subtle', 'rounded', 'pill'] as const
export const BORDER_CHARACTER = ['none', 'hairline', 'defined', 'heavy'] as const
export const SHADOW_CHARACTER = ['flat', 'soft', 'lifted', 'dramatic'] as const
export const BUTTON_SHAPE = ['square', 'rounded', 'pill'] as const
export const BUTTON_WEIGHT = ['ghost', 'outline', 'solid', 'heavy'] as const
export const TEXT_CASE = ['sentence', 'title', 'upper'] as const
export const HEADING_WEIGHT = ['light', 'regular', 'medium', 'bold', 'black'] as const
export const ICON_STYLE = ['none', 'line', 'solid', 'duotone', 'illustrated'] as const
export const IMAGE_TREATMENT = ['none', 'stock_photo', 'documentary', 'portrait', 'illustration', 'abstract'] as const
export const SURFACE_LAYERING = ['flat', 'cards', 'panels', 'layered'] as const
export const BACKGROUND_TREATMENT = ['solid', 'subtle_pattern', 'gradient', 'imagery'] as const

export const SENTENCE_LENGTH = ['short', 'mixed', 'long'] as const
export const HEADLINE_STYLE = ['statement', 'question', 'benefit', 'news', 'command'] as const
export const CTA_STYLE = ['directive', 'invitational', 'value', 'urgency'] as const
export const READING_LEVEL = ['plain', 'general', 'professional', 'technical'] as const
export const CLAIM_SENSITIVITY = ['conservative', 'balanced', 'assertive'] as const
export const LEGAL_CAUTION = ['standard', 'elevated', 'maximum'] as const

/* -------------------------------------------------------------------------- */
/*                              Leaf value schemas                             */
/* -------------------------------------------------------------------------- */

/**
 * One definition per leaf, reused by BOTH the profile object below and the
 * per-field map at the bottom of this file.
 *
 * That reuse is the point: the merge validates a single incoming value against
 * FIELD_SCHEMAS, and the finished profile is validated against
 * BrandProfileSchema. If those two disagreed, a value could pass the field
 * check and then make the whole profile unparseable. Sharing the schema object
 * makes that disagreement impossible rather than merely unlikely.
 */
const Text = z.string().trim().min(1).max(300).nullable()
const LongText = z.string().trim().min(1).max(4000).nullable()
const UrlText = z.string().trim().min(1).max(4000).url().nullable()
/** Matches `resolveBrandTokens`' own HEX test exactly, so a token that validates here resolves there. */
const HexColor = z.string().trim().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i).nullable()
const FontFamily = z.string().trim().min(1).max(40).nullable()
/**
 * Radius is a whole number of pixels written as digits.
 *
 * `resolveBrandTokens` does `Number(b.radius ?? 8)`, so "8px" becomes NaN and
 * ships `--site-radius: NaNpx`. Refusing the unit here means the bad value
 * cannot reach the resolver in the first place.
 */
const PixelNumber = z.string().trim().regex(/^\d{1,3}$/).nullable()
const CssShadow = z.string().trim().min(1).max(200).nullable()
const ShortList = z.array(z.string().trim().min(1).max(300)).max(50)
const LongList = z.array(z.string().trim().min(1).max(2000)).max(50)

/* -------------------------------------------------------------------------- */
/*                                   Groups                                    */
/* -------------------------------------------------------------------------- */

export const BrandIdentityFactsSchema = z.object({
  name: Text,
  displayName: Text,
  shortName: Text,
  tagline: Text,
  logoUrl: UrlText,
  logoUrlDark: UrlText,
  faviconUrl: UrlText,
  primaryDomain: Text,
})

/**
 * The brand's authored design tokens, keyed EXACTLY as `lib/brand/tokens.ts`
 * names them. Never rename these: the reduction to `siteToBrand` copies this
 * object straight into `Site.brand`.
 */
export const BrandTokensSchema = z.object({
  primary: HexColor,
  primary_ink: HexColor,
  accent: HexColor,
  accent_ink: HexColor,
  cta: HexColor,
  cta_ink: HexColor,
  bg: HexColor,
  surface: HexColor,
  surface_2: HexColor,
  ink: HexColor,
  ink_muted: HexColor,
  border: HexColor,
  font_heading: FontFamily,
  font_body: FontFamily,
  radius: PixelNumber,
  radius_lg: PixelNumber,
  shadow: CssShadow,
})

export const BrandVisualStyleSchema = z.object({
  density: z.enum(DENSITY),
  spacing: z.enum(SPACING_CHARACTER),
  radiusCharacter: z.enum(RADIUS_CHARACTER),
  borderCharacter: z.enum(BORDER_CHARACTER),
  shadowCharacter: z.enum(SHADOW_CHARACTER),
  buttonShape: z.enum(BUTTON_SHAPE),
  buttonWeight: z.enum(BUTTON_WEIGHT),
  buttonCase: z.enum(TEXT_CASE),
  headingCase: z.enum(TEXT_CASE),
  headingWeight: z.enum(HEADING_WEIGHT),
  iconStyle: z.enum(ICON_STYLE),
  imageTreatment: z.enum(IMAGE_TREATMENT),
  surfaceLayering: z.enum(SURFACE_LAYERING),
  backgroundTreatment: z.enum(BACKGROUND_TREATMENT),
})

export const BrandVoiceSchema = z.object({
  formality: VoiceScale,
  directness: VoiceScale,
  empathy: VoiceScale,
  authority: VoiceScale,
  urgency: VoiceScale,
  reassurance: VoiceScale,
  sentenceLength: z.enum(SENTENCE_LENGTH),
  headlineStyle: z.enum(HEADLINE_STYLE),
  ctaStyle: z.enum(CTA_STYLE),
  readingLevel: z.enum(READING_LEVEL),
  claimSensitivity: z.enum(CLAIM_SENSITIVITY),
  legalCaution: z.enum(LEGAL_CAUTION),
  preferredVocabulary: ShortList,
  disallowedVocabulary: ShortList,
})

/**
 * Approved facts. Everything in here is a STATEMENT ABOUT THE WORLD that a
 * human has signed off, which is why nothing may infer into it.
 *
 * `approvedContact.phoneStated` is evidence, not a render source. Phone display
 * goes through `resolvePhoneForPath(path, site_id)` and nowhere else, so this
 * field records what a source claimed for an operator to reconcile against the
 * Numbers collection. `profileToSiteInput` deliberately does not carry it.
 */
export const BrandApprovedFactsSchema = z.object({
  organizationName: Text,
  legalEntityName: Text,
  audience: ShortList,
  services: ShortList,
  geographicScope: ShortList,
  approvedContact: z.object({
    phoneStated: Text,
    email: Text,
    addressLines: ShortList,
    websiteUrl: UrlText,
  }),
  approvedClaims: LongList,
  approvedProofPoints: LongList,
  prohibitedClaims: LongList,
  requiredDisclaimers: LongList,
  legal: z.object({
    copyright: Text,
    tcpaText: LongText,
    privacyUrl: UrlText,
    termsUrl: UrlText,
  }),
})

/* -------------------------------------------------------------------------- */
/*                                Field paths                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every mergeable leaf, by dotted path.
 *
 * Closed for the same reason the style axes are closed: provenance, locks and
 * the diff all key off these, and a free-string key means a typo silently
 * creates a lock nobody can ever clear. The suite asserts this list is exactly
 * the set of leaves the schema produces, so the two cannot drift.
 */
export const BRAND_FIELD_PATHS = [
  'identity.name',
  'identity.displayName',
  'identity.shortName',
  'identity.tagline',
  'identity.logoUrl',
  'identity.logoUrlDark',
  'identity.faviconUrl',
  'identity.primaryDomain',

  'tokens.primary',
  'tokens.primary_ink',
  'tokens.accent',
  'tokens.accent_ink',
  'tokens.cta',
  'tokens.cta_ink',
  'tokens.bg',
  'tokens.surface',
  'tokens.surface_2',
  'tokens.ink',
  'tokens.ink_muted',
  'tokens.border',
  'tokens.font_heading',
  'tokens.font_body',
  'tokens.radius',
  'tokens.radius_lg',
  'tokens.shadow',

  'style.density',
  'style.spacing',
  'style.radiusCharacter',
  'style.borderCharacter',
  'style.shadowCharacter',
  'style.buttonShape',
  'style.buttonWeight',
  'style.buttonCase',
  'style.headingCase',
  'style.headingWeight',
  'style.iconStyle',
  'style.imageTreatment',
  'style.surfaceLayering',
  'style.backgroundTreatment',

  'voice.formality',
  'voice.directness',
  'voice.empathy',
  'voice.authority',
  'voice.urgency',
  'voice.reassurance',
  'voice.sentenceLength',
  'voice.headlineStyle',
  'voice.ctaStyle',
  'voice.readingLevel',
  'voice.claimSensitivity',
  'voice.legalCaution',
  'voice.preferredVocabulary',
  'voice.disallowedVocabulary',

  'facts.organizationName',
  'facts.legalEntityName',
  'facts.audience',
  'facts.services',
  'facts.geographicScope',
  'facts.approvedContact.phoneStated',
  'facts.approvedContact.email',
  'facts.approvedContact.addressLines',
  'facts.approvedContact.websiteUrl',
  'facts.approvedClaims',
  'facts.approvedProofPoints',
  'facts.prohibitedClaims',
  'facts.requiredDisclaimers',
  'facts.legal.copyright',
  'facts.legal.tcpaText',
  'facts.legal.privacyUrl',
  'facts.legal.termsUrl',
] as const

export type BrandFieldPath = (typeof BRAND_FIELD_PATHS)[number]
export const BrandFieldPathSchema = z.enum(BRAND_FIELD_PATHS)

/** Every value a leaf can hold. */
export type BrandFieldValue = string | number | string[] | null

/**
 * Fields the AI gap fill is ALLOWED to write.
 *
 * Style and voice only. Not tokens: an inferred colour is a wrong colour that
 * looks deliberate, which is the failure this repo's brand resolver was
 * rewritten to end. Not identity or facts: those are statements a brand makes
 * about itself, and an invented disclaimer or claim is a liability, not a
 * draft. The gap-fill request is built from this list, and the response is
 * filtered by it again, so overreach is unreachable from either side.
 */
export const AI_FILLABLE_FIELDS: readonly BrandFieldPath[] = BRAND_FIELD_PATHS.filter(
  (p) => p.startsWith('style.') || p.startsWith('voice.'),
)

/** Legal-weight fields. Asserted to be disjoint from AI_FILLABLE_FIELDS. */
export const LEGAL_WEIGHT_FIELDS: readonly BrandFieldPath[] = BRAND_FIELD_PATHS.filter((p) =>
  p.startsWith('facts.'),
)

/**
 * Per-field schema, sharing the exact objects used in the groups above.
 * The merge validates one incoming value through this; the profile validates
 * the whole through BrandProfileSchema. Same rules, one definition.
 */
export const FIELD_SCHEMAS: Record<BrandFieldPath, z.ZodTypeAny> = {
  'identity.name': Text,
  'identity.displayName': Text,
  'identity.shortName': Text,
  'identity.tagline': Text,
  'identity.logoUrl': UrlText,
  'identity.logoUrlDark': UrlText,
  'identity.faviconUrl': UrlText,
  'identity.primaryDomain': Text,

  'tokens.primary': HexColor,
  'tokens.primary_ink': HexColor,
  'tokens.accent': HexColor,
  'tokens.accent_ink': HexColor,
  'tokens.cta': HexColor,
  'tokens.cta_ink': HexColor,
  'tokens.bg': HexColor,
  'tokens.surface': HexColor,
  'tokens.surface_2': HexColor,
  'tokens.ink': HexColor,
  'tokens.ink_muted': HexColor,
  'tokens.border': HexColor,
  'tokens.font_heading': FontFamily,
  'tokens.font_body': FontFamily,
  'tokens.radius': PixelNumber,
  'tokens.radius_lg': PixelNumber,
  'tokens.shadow': CssShadow,

  'style.density': z.enum(DENSITY),
  'style.spacing': z.enum(SPACING_CHARACTER),
  'style.radiusCharacter': z.enum(RADIUS_CHARACTER),
  'style.borderCharacter': z.enum(BORDER_CHARACTER),
  'style.shadowCharacter': z.enum(SHADOW_CHARACTER),
  'style.buttonShape': z.enum(BUTTON_SHAPE),
  'style.buttonWeight': z.enum(BUTTON_WEIGHT),
  'style.buttonCase': z.enum(TEXT_CASE),
  'style.headingCase': z.enum(TEXT_CASE),
  'style.headingWeight': z.enum(HEADING_WEIGHT),
  'style.iconStyle': z.enum(ICON_STYLE),
  'style.imageTreatment': z.enum(IMAGE_TREATMENT),
  'style.surfaceLayering': z.enum(SURFACE_LAYERING),
  'style.backgroundTreatment': z.enum(BACKGROUND_TREATMENT),

  'voice.formality': VoiceScale,
  'voice.directness': VoiceScale,
  'voice.empathy': VoiceScale,
  'voice.authority': VoiceScale,
  'voice.urgency': VoiceScale,
  'voice.reassurance': VoiceScale,
  'voice.sentenceLength': z.enum(SENTENCE_LENGTH),
  'voice.headlineStyle': z.enum(HEADLINE_STYLE),
  'voice.ctaStyle': z.enum(CTA_STYLE),
  'voice.readingLevel': z.enum(READING_LEVEL),
  'voice.claimSensitivity': z.enum(CLAIM_SENSITIVITY),
  'voice.legalCaution': z.enum(LEGAL_CAUTION),
  'voice.preferredVocabulary': ShortList,
  'voice.disallowedVocabulary': ShortList,

  'facts.organizationName': Text,
  'facts.legalEntityName': Text,
  'facts.audience': ShortList,
  'facts.services': ShortList,
  'facts.geographicScope': ShortList,
  'facts.approvedContact.phoneStated': Text,
  'facts.approvedContact.email': Text,
  'facts.approvedContact.addressLines': ShortList,
  'facts.approvedContact.websiteUrl': UrlText,
  'facts.approvedClaims': LongList,
  'facts.approvedProofPoints': LongList,
  'facts.prohibitedClaims': LongList,
  'facts.requiredDisclaimers': LongList,
  'facts.legal.copyright': Text,
  'facts.legal.tcpaText': LongText,
  'facts.legal.privacyUrl': UrlText,
  'facts.legal.termsUrl': UrlText,
}

/* -------------------------------------------------------------------------- */
/*                             Source metadata                                 */
/* -------------------------------------------------------------------------- */

/**
 * Where a value can come from.
 *
 * `pdf_document` and `docx_document` are in the union DELIBERATELY while being
 * unsupported: an operator who attaches a PDF gets a source record whose health
 * says "unsupported, and why" instead of silence. Declaring the gap in the type
 * is the honest version of a stub.
 */
export const BRAND_SOURCE_KINDS = [
  'manual',
  'brand_document',
  'design_tokens',
  'pdf_document',
  'docx_document',
  'repository',
  'website',
  'image',
  'brief',
  'ai_gap_fill',
  'neutral_fallback',
] as const
export type BrandSourceKind = (typeof BRAND_SOURCE_KINDS)[number]
export const BrandSourceKindSchema = z.enum(BRAND_SOURCE_KINDS)

export const SOURCE_HEALTH_STATUSES = ['ok', 'partial', 'failed', 'unsupported'] as const
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number]

export const SourceHealthSchema = z.object({
  status: z.enum(SOURCE_HEALTH_STATUSES),
  /** Plain words an operator can act on. Null only when the status is 'ok'. */
  reason: z.string().max(500).nullable(),
})

export const BrandSourceRecordSchema = z.object({
  id: z.string().min(1).max(80),
  kind: BrandSourceKindSchema,
  /** Derived from `kind`, never passed in. See SOURCE_KIND_PRIORITY. */
  priority: z.number().int().min(1).max(8),
  /** URL, filename, or a short description of a pasted input. */
  ref: z.string().max(2000),
  /** sha256 of the bytes read, so a refresh can tell "unchanged" from "re-read". */
  contentHash: z.string().max(64).nullable(),
  extractedAt: z.string().datetime().nullable(),
  health: SourceHealthSchema,
  /** How many profile fields this source actually won. */
  contributedFields: z.number().int().min(0).max(BRAND_FIELD_PATHS.length),
})
export type BrandSourceRecord = z.infer<typeof BrandSourceRecordSchema>

export const FieldProvenanceSchema = z.object({
  sourceId: z.string().min(1).max(80),
  kind: BrandSourceKindSchema,
  priority: z.number().int().min(1).max(8),
  confidence: z.number().min(0).max(1),
  extractedAt: z.string().datetime().nullable(),
})
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>

export const BrandProfileMetaSchema = z.object({
  sources: z.array(BrandSourceRecordSchema).max(64),
  /** Per-field, which source won it and how sure that source was. */
  provenance: z.record(BrandFieldPathSchema, FieldProvenanceSchema),
  /**
   * Fields a human has pinned. Nothing but another human decision may change
   * one; every other source that disagrees is reported as a conflict.
   */
  locks: z
    .array(BrandFieldPathSchema)
    .max(BRAND_FIELD_PATHS.length)
    .refine((v) => new Set(v).size === v.length, { message: 'a field may be locked only once' }),
  approval: z.object({
    state: z.enum(['draft', 'approved']),
    by: z.string().max(200).nullable(),
    at: z.string().datetime().nullable(),
  }),
  lastExtractedAt: z.string().datetime().nullable(),
})

/* -------------------------------------------------------------------------- */
/*                                The profile                                  */
/* -------------------------------------------------------------------------- */

export const BrandProfileSchema = z.object({
  version: z.literal(BRAND_PROFILE_VERSION),
  identity: BrandIdentityFactsSchema,
  tokens: BrandTokensSchema,
  style: BrandVisualStyleSchema,
  voice: BrandVoiceSchema,
  facts: BrandApprovedFactsSchema,
  meta: BrandProfileMetaSchema,
})

export type BrandProfile = z.infer<typeof BrandProfileSchema>
export type BrandVisualStyle = z.infer<typeof BrandVisualStyleSchema>
export type BrandVoice = z.infer<typeof BrandVoiceSchema>
export type BrandApprovedFacts = z.infer<typeof BrandApprovedFactsSchema>

/**
 * The neutral profile: what a brand looks like before anybody has said anything
 * about it.
 *
 * Every enum sits at its most ordinary value and every fact is empty. Nothing
 * here is a guess about a brand - it is the shape a preview needs in order to
 * render at all, which is exactly why it is the LOWEST priority. When the
 * service uses these values it records `neutral_fallback` in provenance, so a
 * screen can say "nobody chose this" instead of showing it as a decision.
 */
export const NEUTRAL_STYLE: BrandVisualStyle = {
  density: 'regular',
  spacing: 'balanced',
  radiusCharacter: 'subtle',
  borderCharacter: 'hairline',
  shadowCharacter: 'soft',
  buttonShape: 'rounded',
  buttonWeight: 'solid',
  buttonCase: 'sentence',
  headingCase: 'sentence',
  headingWeight: 'bold',
  iconStyle: 'line',
  imageTreatment: 'none',
  surfaceLayering: 'cards',
  backgroundTreatment: 'solid',
}

export const NEUTRAL_VOICE: BrandVoice = {
  formality: VOICE_SCALE_NEUTRAL,
  directness: VOICE_SCALE_NEUTRAL,
  empathy: VOICE_SCALE_NEUTRAL,
  authority: VOICE_SCALE_NEUTRAL,
  urgency: VOICE_SCALE_NEUTRAL,
  reassurance: VOICE_SCALE_NEUTRAL,
  sentenceLength: 'mixed',
  headlineStyle: 'statement',
  ctaStyle: 'directive',
  readingLevel: 'general',
  claimSensitivity: 'conservative',
  legalCaution: 'standard',
  preferredVocabulary: [],
  disallowedVocabulary: [],
}

/**
 * A schema-valid profile with no provenance at all.
 *
 * The absence of provenance is what marks a field as "not yet sourced", which
 * is how the gap-fill step knows what to ask for. Values are present because
 * the schema requires them and a preview has to render; nobody is claimed to
 * have chosen them.
 */
export const createBlankProfile = (): BrandProfile => ({
  version: BRAND_PROFILE_VERSION,
  identity: {
    name: null,
    displayName: null,
    shortName: null,
    tagline: null,
    logoUrl: null,
    logoUrlDark: null,
    faviconUrl: null,
    primaryDomain: null,
  },
  tokens: {
    primary: null,
    primary_ink: null,
    accent: null,
    accent_ink: null,
    cta: null,
    cta_ink: null,
    bg: null,
    surface: null,
    surface_2: null,
    ink: null,
    ink_muted: null,
    border: null,
    font_heading: null,
    font_body: null,
    radius: null,
    radius_lg: null,
    shadow: null,
  },
  style: { ...NEUTRAL_STYLE },
  voice: { ...NEUTRAL_VOICE, preferredVocabulary: [], disallowedVocabulary: [] },
  facts: {
    organizationName: null,
    legalEntityName: null,
    audience: [],
    services: [],
    geographicScope: [],
    approvedContact: { phoneStated: null, email: null, addressLines: [], websiteUrl: null },
    approvedClaims: [],
    approvedProofPoints: [],
    prohibitedClaims: [],
    requiredDisclaimers: [],
    legal: { copyright: null, tcpaText: null, privacyUrl: null, termsUrl: null },
  },
  meta: {
    sources: [],
    provenance: {},
    locks: [],
    approval: { state: 'draft', by: null, at: null },
    lastExtractedAt: null,
  },
})

/* -------------------------------------------------------------------------- */
/*                          Reading a stored profile                           */
/* -------------------------------------------------------------------------- */

export type ProfileReadResult =
  | { ok: true; profile: BrandProfile }
  | {
      ok: false
      code: 'not_an_object' | 'version_missing' | 'version_mismatch' | 'invalid'
      reason: string
      storedVersion: number | null
    }

/**
 * Pull the version out of an unvalidated blob without validating anything else.
 *
 * Order matters: a v0 profile run straight through the schema comes back as
 * forty unrelated issues, and whoever reads that report goes looking for forty
 * bugs instead of writing one migration.
 */
export const readProfileVersion = (raw: unknown): number | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = (raw as { version?: unknown }).version
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

export const readProfile = (raw: unknown): ProfileReadResult => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'not_an_object', reason: 'The stored brand profile is not an object.', storedVersion: null }
  }
  const storedVersion = readProfileVersion(raw)
  if (storedVersion === null) {
    return {
      ok: false,
      code: 'version_missing',
      reason: `The stored brand profile carries no version. This build reads version ${BRAND_PROFILE_VERSION}.`,
      storedVersion: null,
    }
  }
  if (storedVersion !== BRAND_PROFILE_VERSION) {
    return {
      ok: false,
      code: 'version_mismatch',
      reason: `The stored brand profile is version ${storedVersion}; this build reads version ${BRAND_PROFILE_VERSION}. Migrate it before use.`,
      storedVersion,
    }
  }
  const parsed = BrandProfileSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    return {
      ok: false,
      code: 'invalid',
      reason: `The stored brand profile is version ${storedVersion} but does not match the schema: ${issues}`,
      storedVersion,
    }
  }
  return { ok: true, profile: parsed.data }
}

/* -------------------------------------------------------------------------- */
/*                             Path access                                     */
/* -------------------------------------------------------------------------- */

const isBrandFieldValue = (v: unknown): v is BrandFieldValue =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'number' ||
  (Array.isArray(v) && v.every((x) => typeof x === 'string'))

export const isBrandFieldPath = (v: unknown): v is BrandFieldPath =>
  typeof v === 'string' && (BRAND_FIELD_PATHS as readonly string[]).includes(v)

/**
 * Read a leaf. Verified rather than asserted: the schema guarantees the shape,
 * but a runtime check here means a future schema edit that breaks a path fails
 * loudly at the seam instead of leaking an unexpected type into the merge.
 */
export const getFieldValue = (profile: BrandProfile, field: BrandFieldPath): BrandFieldValue => {
  let cursor: unknown = profile
  for (const key of field.split('.')) {
    if (!cursor || typeof cursor !== 'object') {
      throw new Error(`Brand profile has no container for field "${field}".`)
    }
    cursor = (cursor as Record<string, unknown>)[key]
  }
  if (!isBrandFieldValue(cursor)) {
    throw new Error(`Brand profile field "${field}" holds a value the contract does not allow.`)
  }
  return cursor
}

/** Write a leaf on a DRAFT object. Never called on a profile a caller still holds. */
export const setFieldValue = (draft: BrandProfile, field: BrandFieldPath, value: BrandFieldValue): void => {
  const keys = field.split('.')
  const leaf = keys.pop()
  if (!leaf) throw new Error(`Empty brand profile field path.`)
  let cursor: unknown = draft
  for (const key of keys) {
    if (!cursor || typeof cursor !== 'object') {
      throw new Error(`Brand profile has no container for field "${field}".`)
    }
    cursor = (cursor as Record<string, unknown>)[key]
  }
  if (!cursor || typeof cursor !== 'object') {
    throw new Error(`Brand profile has no container for field "${field}".`)
  }
  ;(cursor as Record<string, unknown>)[leaf] = value
}

/**
 * Every leaf path a profile object actually contains, walked from the data.
 *
 * Used by the suite to assert BRAND_FIELD_PATHS is exactly the set of leaves,
 * which is the only thing standing between "a field was added to the schema"
 * and "a field silently has no provenance, no lock and no diff".
 */
export const walkLeafPaths = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : []
  const out: string[] = []
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(...walkLeafPaths(v, prefix ? `${prefix}.${k}` : k))
  }
  return out
}

/** The token names the profile carries, asserted against the token contract. */
export const PROFILE_TOKEN_NAMES: readonly BrandToken[] = ALL_TOKENS
