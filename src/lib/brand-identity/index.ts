/**
 * The brand identity service: one seam, many sources.
 *
 * Everything a caller needs is here - build a profile, refresh it, reduce it to
 * the brand shape the product already renders from. The pieces underneath
 * (profile.ts, precedence.ts, sources.ts, net/ssrf.ts) are exported too, but a
 * caller that reaches past this file is choosing its own precedence, and two
 * places deciding precedence is how the old extractor ended up with four
 * palettes.
 *
 * Every side effect is injected: the clock, the DNS resolver, the fetch, the
 * image decoder, and the model call. Not for purity's sake - because a service
 * whose behaviour can only be observed with a network and an API key is a
 * service nobody tests, and this one decides what a tenant's brand looks like.
 */

import { z } from 'zod'

import { siteToBrand, type DomainLite } from '../brand-map'
import { invokeLLM } from '../ai/invoke'
import {
  AI_FILLABLE_FIELDS,
  BRAND_PROFILE_VERSION,
  FIELD_SCHEMAS,
  createBlankProfile,
  getFieldValue,
  type BrandFieldPath,
  type BrandProfile,
  type BrandSourceRecord,
} from './profile'
import {
  SOURCE_PRIORITY,
  diffProfiles,
  fieldsNeedingSource,
  mergeContributions,
  type FieldContribution,
  type FieldDiff,
  type LockConflict,
  type RejectedContribution,
} from './precedence'
import { collectFromSource, collectNeutralFallback, type BrandSourceInput, type SourceDeps, type SourceOutcome } from './sources'
import { nodeDnsResolver, type DnsResolver, type FetchLike } from '../net/ssrf'

export * from './profile'
export * from './precedence'
export * from './sources'
// URL admission moved to `lib/net/ssrf` once it stopped being a brand concern -
// six subsystems fetch on a user's behalf now. Re-exported here so the callers
// and the suite that already read it through this barrel keep working.
export * from '../net/ssrf'

/* -------------------------------------------------------------------------- */
/*                                 AI gap fill                                 */
/* -------------------------------------------------------------------------- */

export type GapFillRequest = {
  /** Exactly the fields the model may answer. Never contains a fact. */
  fields: readonly BrandFieldPath[]
  schema: z.ZodTypeAny
  system: string
  user: string
}

export type GapFillFn = (request: GapFillRequest) => Promise<unknown>

export type GapFillReport = {
  status: 'ok' | 'invalid' | 'unavailable' | 'skipped'
  requested: BrandFieldPath[]
  filled: BrandFieldPath[]
  reason: string | null
}

/**
 * The schema handed to the model: one optional property per gap, keyed by the
 * field path so the answer maps back with no lookup table.
 *
 * Optional on purpose - a model that has nothing to say about a brand's icon
 * style should be able to say nothing. Every property reuses the SAME leaf
 * schema the profile uses, so an answer that validates here is an answer the
 * merge will accept.
 */
export const buildGapFillSchema = (fields: readonly BrandFieldPath[]): z.ZodTypeAny => {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) shape[field] = FIELD_SCHEMAS[field].optional()
  return z.object(shape)
}

const GAP_FILL_SYSTEM = [
  'You describe a brand’s visual style and writing voice for a design system.',
  'You are given values that were READ from the brand’s own materials. Fill only the axes listed as missing.',
  'You must not invent facts. You are never asked for claims, disclaimers, contact details, services or legal text, and you must not return them.',
  'Answer only with values from the allowed set for each axis. If an axis cannot be judged from what you were given, leave it out.',
].join(' ')

const describeKnown = (profile: BrandProfile): string => {
  const parts: string[] = []
  const say = (label: string, field: BrandFieldPath): void => {
    const value = getFieldValue(profile, field)
    if (value === null || (Array.isArray(value) && value.length === 0)) return
    parts.push(`${label}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
  }
  say('Brand name', 'identity.name')
  say('Tagline', 'identity.tagline')
  say('Primary colour', 'tokens.primary')
  say('Accent colour', 'tokens.accent')
  say('Page background', 'tokens.bg')
  say('Body text colour', 'tokens.ink')
  say('Heading font', 'tokens.font_heading')
  say('Body font', 'tokens.font_body')
  say('Audience', 'facts.audience')
  say('Services', 'facts.services')
  return parts.length ? parts.join('\n') : 'Nothing about this brand has been read yet.'
}

const allowedValuesFor = (field: BrandFieldPath): string => {
  const schema = FIELD_SCHEMAS[field]
  if (schema instanceof z.ZodEnum) return (schema.options as readonly string[]).join(' | ')
  if (schema instanceof z.ZodNumber) return 'a whole number from 0 (lowest) to 4 (highest)'
  if (schema instanceof z.ZodArray) return 'a list of short words or phrases'
  return 'a short value'
}

const defaultGapFill: GapFillFn = (request) =>
  invokeLLM({
    system: request.system,
    user: request.user,
    schema: request.schema,
    schemaName: 'brand_style_and_voice',
    enforceNoBannedVocab: true,
    maxTokens: 1500,
  })

/* -------------------------------------------------------------------------- */
/*                                 The service                                 */
/* -------------------------------------------------------------------------- */

export type BrandIdentityDeps = {
  now?: () => string
  resolver?: DnsResolver
  fetchImpl?: FetchLike
  allowedPorts?: readonly number[]
  checkAsset?: SourceDeps['checkAsset']
  readImagePalette?: SourceDeps['readImagePalette']
  /**
   * The model call. Injected so the contract can be proved with a double:
   * there is no API key in a local checkout, and a service whose AI path is
   * only exercised in production has an untested AI path.
   */
  gapFill?: GapFillFn
}

export type BuildBrandProfileInput = {
  /** The profile being refreshed. Omit to build one from nothing. */
  base?: BrandProfile | null
  sources: readonly BrandSourceInput[]
  /** Default true. Set false to see exactly what the sources supplied. */
  includeNeutralFallback?: boolean
  /** Default true. The model still only ever fills style and voice gaps. */
  aiGapFill?: boolean
  deps?: BrandIdentityDeps
}

export type BrandIdentityResult = {
  profile: BrandProfile
  /** Before / after / who won, for every field a source spoke about. */
  diff: FieldDiff[]
  /** A locked field a source disagreed with. Never silently kept or applied. */
  conflicts: LockConflict[]
  rejected: RejectedContribution[]
  sources: BrandSourceRecord[]
  outcomes: SourceOutcome[]
  notes: string[]
  gapFill: GapFillReport
}

export const buildBrandProfile = async (input: BuildBrandProfileInput): Promise<BrandIdentityResult> => {
  const deps = input.deps ?? {}
  const now = deps.now?.() ?? new Date().toISOString()
  const sourceDeps: SourceDeps = {
    now: () => now,
    resolver: deps.resolver ?? nodeDnsResolver,
    fetchImpl: deps.fetchImpl,
    allowedPorts: deps.allowedPorts,
    checkAsset: deps.checkAsset,
    readImagePalette: deps.readImagePalette,
  }

  const base = input.base ?? createBlankProfile()
  const outcomes: SourceOutcome[] = []
  // Sequential rather than parallel: these are outbound fetches on behalf of an
  // operator, and hitting one host with four requests at once is how a brand
  // extraction gets rate-limited into looking like a broken feature.
  for (const source of input.sources) outcomes.push(await collectFromSource(source, sourceDeps))
  if (input.includeNeutralFallback !== false) {
    outcomes.push(collectNeutralFallback({ kind: 'neutral_fallback' }, sourceDeps))
  }

  const contributions: FieldContribution[] = []
  const notes: string[] = []
  for (const outcome of outcomes) {
    notes.push(...outcome.notes)
    if (outcome.ok) contributions.push(...outcome.contributions)
    else notes.push(`${outcome.source.kind}: ${outcome.reason}`)
  }

  const firstPass = mergeContributions({
    base,
    contributions,
    sources: outcomes.map((o) => o.source),
    now,
  })

  const considered = new Set<BrandFieldPath>(contributions.map((c) => c.field))
  const gapReport: GapFillReport = { status: 'skipped', requested: [], filled: [], reason: null }
  let profile = firstPass.profile
  const conflicts = [...firstPass.conflicts]
  const rejected = [...firstPass.rejected]

  if (input.aiGapFill !== false) {
    // Only fields no better source claimed. `ai_gap_fill` is priority 7, so a
    // field already held at 1..6 is not a gap and is never offered to the model.
    const gaps = fieldsNeedingSource(profile, AI_FILLABLE_FIELDS, SOURCE_PRIORITY.ai_gap_fill)
    gapReport.requested = gaps
    if (gaps.length === 0) {
      gapReport.reason = 'Every style and voice axis was supplied by a stronger source.'
    } else {
      const fill = deps.gapFill ?? (process.env.ANTHROPIC_API_KEY ? defaultGapFill : null)
      if (!fill) {
        gapReport.status = 'unavailable'
        gapReport.reason = 'No model is configured, so the remaining axes are on the neutral preview default.'
      } else {
        const schema = buildGapFillSchema(gaps)
        const request: GapFillRequest = {
          fields: gaps,
          schema,
          system: GAP_FILL_SYSTEM,
          // Only values already parsed out of the sources reach the prompt -
          // never the raw document text. A document cannot steer this, because
          // nothing it wrote in prose is in here to be obeyed.
          user: [
            'What has been read about this brand:',
            describeKnown(profile),
            '',
            'Missing axes, with the values each one allows:',
            ...gaps.map((f) => `- ${f}: ${allowedValuesFor(f)}`),
          ].join('\n'),
        }
        let raw: unknown
        try {
          raw = await fill(request)
        } catch (err) {
          gapReport.status = 'unavailable'
          gapReport.reason = `The model could not be reached: ${err instanceof Error ? err.message : 'unknown error'}`
        }
        if (gapReport.status !== 'unavailable') {
          const parsed = schema.safeParse(raw)
          if (!parsed.success) {
            gapReport.status = 'invalid'
            gapReport.reason = `The model's answer did not match the schema: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ')}`
          } else {
            const answer: Record<string, unknown> =
              parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
                ? (parsed.data as Record<string, unknown>)
                : {}
            const aiContributions: FieldContribution[] = []
            // Filtered by the requested set a second time. The schema already
            // limits the keys; this makes overreach unreachable even if the
            // schema is later built wrongly.
            for (const field of gaps) {
              const value = answer[field]
              if (value === undefined) continue
              aiContributions.push({
                field,
                value: value as FieldContribution['value'],
                kind: 'ai_gap_fill',
                sourceId: 'ai-gap-fill',
                confidence: 0.35,
                evidence: 'inferred by the model from what the sources supplied',
              })
            }
            const aiRecord: BrandSourceRecord = {
              id: 'ai-gap-fill',
              kind: 'ai_gap_fill',
              priority: SOURCE_PRIORITY.ai_gap_fill,
              ref: 'model gap fill',
              contentHash: null,
              extractedAt: now,
              health: { status: aiContributions.length > 0 ? 'ok' : 'partial', reason: aiContributions.length > 0 ? null : 'The model returned no values.' },
              contributedFields: 0,
            }
            const secondPass = mergeContributions({
              base: profile,
              contributions: aiContributions,
              sources: [aiRecord],
              now,
            })
            profile = secondPass.profile
            conflicts.push(...secondPass.conflicts)
            rejected.push(...secondPass.rejected)
            for (const c of aiContributions) considered.add(c.field)
            gapReport.status = 'ok'
            gapReport.filled = secondPass.diff.filter((d) => d.changed).map((d) => d.field)
          }
        }
      }
    }
  }

  if (gapReport.reason) notes.push(gapReport.reason)

  return {
    profile,
    diff: diffProfiles(base, profile, considered),
    conflicts,
    rejected,
    sources: profile.meta.sources,
    outcomes,
    notes,
    gapFill: gapReport,
  }
}

/**
 * Re-read the sources for a profile that already exists.
 *
 * Identical to a build with a base, and named separately because that is what
 * the caller is doing: the interesting output of a refresh is the DIFF and the
 * CONFLICTS, not the profile.
 */
export const refreshBrandProfile = async (
  existing: BrandProfile,
  input: Omit<BuildBrandProfileInput, 'base'>,
): Promise<BrandIdentityResult> => buildBrandProfile({ ...input, base: existing })

/* -------------------------------------------------------------------------- */
/*                    Reduction to the shape the product renders               */
/* -------------------------------------------------------------------------- */

export type SiteShell = {
  id: number
  slug: string
  /** Site lifecycle status; a picker refuses an archived brand. */
  status?: string
}

const omitNull = (values: Record<string, string | null>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== '') out[k] = v
  return out
}

/**
 * Turn a profile into the Site-shaped object `siteToBrand` already consumes.
 *
 * This is a COPY, not a mapping: `profile.tokens` uses the token contract's own
 * names, so the whole group goes into `Site.brand` unchanged. That is the point
 * of naming them that way - a mapping table here would be a second place for
 * the profile and the token contract to drift apart.
 *
 * ONE VALUE IS DELIBERATELY NOT CARRIED: the phone number.
 * `facts.approvedContact.phoneStated` records what a source claimed so an
 * operator can reconcile it against the Numbers collection. It must never reach
 * `Site.default_phone` or `brand_identity.contact.callNumber`, because phone
 * display goes through `resolvePhoneForPath(path, site_id)` and a number
 * denormalised onto a brand is a number that keeps ringing after it has been
 * reassigned.
 */
export const profileToSiteInput = (profile: BrandProfile, site: SiteShell): Record<string, unknown> => {
  const identity = profile.identity
  const brand: Record<string, string> = {
    ...omitNull(profile.tokens),
    ...omitNull({
      display_name: identity.displayName,
      short_name: identity.shortName,
      tagline_brand: identity.tagline,
      logo_url: identity.logoUrl,
      logo_url_dark: identity.logoUrlDark,
      favicon_url: identity.faviconUrl,
    }),
  }

  return {
    id: site.id,
    slug: site.slug,
    status: site.status ?? 'active',
    name: identity.name ?? '',
    tagline: identity.tagline ?? '',
    brand,
    typography: omitNull({
      headline_font: profile.tokens.font_heading,
      body_font: profile.tokens.font_body,
    }),
    legal: omitNull({
      copyright: profile.facts.legal.copyright,
      tcpa_text: profile.facts.legal.tcpaText,
      privacy_url: profile.facts.legal.privacyUrl,
      terms_url: profile.facts.legal.termsUrl,
      default_disclaimer: profile.facts.requiredDisclaimers.join('\n\n') || null,
    }),
    brand_identity: {
      primaryDomain: identity.primaryDomain ?? '',
      urls: omitNull({
        privacy: profile.facts.legal.privacyUrl,
        terms: profile.facts.legal.termsUrl,
      }),
      // No `contact` key at all: `siteToBrand` fills an empty callNumber from
      // `brand_identity.contact`, so an entry here would reintroduce the
      // denormalised phone through a side door.
    },
  }
}

/** The brand object every template, quiz, landing page and page renderer reads. */
export const profileToBrand = (
  profile: BrandProfile,
  site: SiteShell,
  domains: DomainLite[] = [],
): ReturnType<typeof siteToBrand> => siteToBrand(profileToSiteInput(profile, site), domains)

/** The version this build writes, re-exported so a caller need not reach past the seam. */
export const CURRENT_BRAND_PROFILE_VERSION = BRAND_PROFILE_VERSION
