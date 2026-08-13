/**
 * Typed source adapters.
 *
 * One adapter per kind of thing a brand can be read from. Every one obeys the
 * same three rules, and the rules are the reason this file exists rather than
 * each caller reading its own source:
 *
 *  1. IT NEVER THROWS. A broken source returns an outcome whose health says
 *     what went wrong in words an operator can act on. A thrown error would be
 *     caught somewhere generic and become "extraction failed", which tells
 *     nobody whether the site was down, the document was empty, or the URL
 *     pointed at this machine.
 *
 *  2. IT NEVER CLAIMS A RANK. An outcome carries a `kind`; precedence.ts turns
 *     that into a priority. An image extractor has nowhere to write "treat me
 *     as a brand document".
 *
 *  3. IT REUSES THE EXTRACTORS THAT ALREADY EXIST. `extractColors`,
 *     `extractCopyFromUrl`, `extractCopyFromGithub`, `parseTailwindConfig` and
 *     `parseBrandMarkdown` are the extraction infrastructure this repo already
 *     built and debugged. Nothing here re-derives a colour, a font or a WCAG
 *     ratio; it maps their output onto the profile contract.
 */

import { createHash } from 'node:crypto'
import { load } from 'cheerio'

import { extractColors, parseTailwindConfig, type ExtractedColors } from '../builder/extract/extract-colors'
import { extractCopyFromUrl, extractCopyFromGithub } from '../builder/extract/extract-copy'
import { parseGitHubUrl, type UrlBundle, type GithubBundle } from '../builder/extract/fetch-bundle'
import { parseBrandMarkdown, sanitizeBrandDocs, type BrandDoc } from '../brand/markdown-source'
import { isGrey } from '../brand/extract-score'
import { relativeLuminance } from '../builder/page-lint'
import { parseHex, rgbToHex, rgbToHsl } from '../builder/color-system'
import { IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_B64, type BrandImageType } from '../brand/source-limits'
import {
  BACKGROUND_TREATMENT,
  BORDER_CHARACTER,
  BUTTON_SHAPE,
  BUTTON_WEIGHT,
  CLAIM_SENSITIVITY,
  CTA_STYLE,
  DENSITY,
  HEADING_WEIGHT,
  HEADLINE_STYLE,
  ICON_STYLE,
  IMAGE_TREATMENT,
  LEGAL_CAUTION,
  NEUTRAL_STYLE,
  NEUTRAL_VOICE,
  RADIUS_CHARACTER,
  READING_LEVEL,
  SENTENCE_LENGTH,
  SHADOW_CHARACTER,
  SPACING_CHARACTER,
  SURFACE_LAYERING,
  TEXT_CASE,
  VOICE_SCALE_MAX,
  VOICE_SCALE_MIN,
  isBrandFieldPath,
  type BrandFieldPath,
  type BrandFieldValue,
  type BrandSourceKind,
  type BrandSourceRecord,
} from './profile'
import { SOURCE_KIND_PRIORITY, type FieldContribution } from './precedence'
import { assertSafeUrl, safeFetch, type DnsResolver, type FetchLike } from '../net/ssrf'

/* -------------------------------------------------------------------------- */
/*                                   Types                                     */
/* -------------------------------------------------------------------------- */

export type BrandImageInput = { name: string; mediaType: BrandImageType; dataBase64: string }

export type BrandSourceInput =
  | { kind: 'manual'; id?: string; label?: string; values: Array<{ field: BrandFieldPath; value: BrandFieldValue }> }
  | { kind: 'website'; id?: string; url: string }
  | { kind: 'repository'; id?: string; repoUrl: string }
  | { kind: 'brand_document'; id?: string; docs: BrandDoc[] }
  | { kind: 'design_tokens'; id?: string; name: string; format: 'json' | 'css'; text: string }
  | { kind: 'image'; id?: string; images: BrandImageInput[] }
  | { kind: 'brief'; id?: string; text: string }
  | { kind: 'pdf_document'; id?: string; name: string }
  | { kind: 'docx_document'; id?: string; name: string }
  | { kind: 'neutral_fallback'; id?: string }

export type SourceOutcome =
  | { ok: true; source: BrandSourceRecord; contributions: FieldContribution[]; notes: string[] }
  | { ok: false; source: BrandSourceRecord; reason: string; notes: string[] }

export type ImagePalette = { swatches: string[] }

export type SourceDeps = {
  /** Injected so a diff is reproducible in a test and honest in production. */
  now: () => string
  resolver?: DnsResolver
  fetchImpl?: FetchLike
  allowedPorts?: readonly number[]
  /** Confirms a URL really serves an image. Injected so tests need no network. */
  checkAsset?: (url: string) => Promise<{ ok: boolean; contentType: string }>
  /** Decodes an image to its dominant colours. Defaults to the sharp reader below. */
  readImagePalette?: (image: BrandImageInput) => Promise<ImagePalette | null>
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const shortId = (kind: BrandSourceKind, ref: string): string => `${kind}:${sha256(ref).slice(0, 12)}`

const record = (args: {
  id: string
  kind: BrandSourceKind
  ref: string
  contentHash: string | null
  now: string
  status: BrandSourceRecord['health']['status']
  reason: string | null
}): BrandSourceRecord => ({
  id: args.id.slice(0, 80),
  kind: args.kind,
  priority: SOURCE_KIND_PRIORITY[args.kind],
  ref: args.ref.slice(0, 2000),
  contentHash: args.contentHash,
  extractedAt: args.now,
  health: { status: args.status, reason: args.reason },
  contributedFields: 0,
})

/** Collects contributions while refusing to emit an empty one. */
class ContributionBag {
  private readonly items: FieldContribution[] = []
  constructor(
    private readonly kind: BrandSourceKind,
    private readonly sourceId: string,
  ) {}

  add(field: BrandFieldPath, value: BrandFieldValue, confidence: number, evidence: string): void {
    if (value === null) return
    if (typeof value === 'string' && value.trim() === '') return
    if (Array.isArray(value) && value.length === 0) return
    this.items.push({
      field,
      value,
      kind: this.kind,
      sourceId: this.sourceId,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidence: evidence.slice(0, 200),
    })
  }

  addMaybe(field: BrandFieldPath, value: string | undefined | null, confidence: number, evidence: string): void {
    this.add(field, value ?? null, confidence, evidence)
  }

  get all(): FieldContribution[] {
    return this.items
  }
}

const healthFor = (contributions: FieldContribution[], notes: string[]): { status: 'ok' | 'partial'; reason: string | null } =>
  contributions.length > 0
    ? { status: 'ok', reason: notes.length ? notes[0].slice(0, 500) : null }
    : { status: 'partial', reason: (notes[0] ?? 'Nothing usable was read from this source.').slice(0, 500) }

/* -------------------------------------------------------------------------- */
/*                     Deterministic axis + fact reading                       */
/* -------------------------------------------------------------------------- */

/**
 * Style and voice axes read out of prose the way `parseBrandMarkdown` reads
 * colours: by looking for a label and an ALLOWED value, never by asking a model
 * what the writing sounds like.
 *
 * A value only lands when it is literally one of the enum members, so
 * "Surface: #f5f5f5" cannot be read as a surface-layering axis and a document
 * that says "our tone is warm" contributes nothing rather than something
 * invented. Rules are ordered most-specific-first for the same reason
 * markdown-source.ts orders its colour roles: "button case" has to be tested
 * before "buttons".
 */
type AxisRule = { field: BrandFieldPath; label: RegExp; values: readonly string[] }

const AXIS_RULES: AxisRule[] = [
  { field: 'style.buttonCase', label: /\bbutton\s+(?:case|capitali[sz]ation)\b/, values: TEXT_CASE },
  { field: 'style.buttonShape', label: /\bbutton\s+(?:shape|corners?)\b/, values: BUTTON_SHAPE },
  { field: 'style.buttonWeight', label: /\bbutton\s+(?:weight|fill|style)\b/, values: BUTTON_WEIGHT },
  { field: 'style.headingCase', label: /\bheading\s+(?:case|capitali[sz]ation)\b/, values: TEXT_CASE },
  { field: 'style.headingWeight', label: /\bheading\s+weight\b/, values: HEADING_WEIGHT },
  { field: 'style.backgroundTreatment', label: /\bbackground\s+treatment\b/, values: BACKGROUND_TREATMENT },
  { field: 'style.radiusCharacter', label: /\b(?:corner|radius)\b/, values: RADIUS_CHARACTER },
  { field: 'style.borderCharacter', label: /\bborders?\b/, values: BORDER_CHARACTER },
  { field: 'style.shadowCharacter', label: /\b(?:shadows?|elevation)\b/, values: SHADOW_CHARACTER },
  { field: 'style.iconStyle', label: /\bicons?\b/, values: ICON_STYLE },
  { field: 'style.imageTreatment', label: /\b(?:photography|imagery|image\s+treatment|photos)\b/, values: IMAGE_TREATMENT },
  { field: 'style.surfaceLayering', label: /\b(?:surface\s+layering|layering|layers)\b/, values: SURFACE_LAYERING },
  { field: 'style.density', label: /\bdensity\b/, values: DENSITY },
  { field: 'style.spacing', label: /\bspacing\b/, values: SPACING_CHARACTER },
  { field: 'voice.sentenceLength', label: /\bsentence\s+length\b/, values: SENTENCE_LENGTH },
  { field: 'voice.headlineStyle', label: /\bheadline\s+style\b/, values: HEADLINE_STYLE },
  { field: 'voice.ctaStyle', label: /\b(?:cta|call\s?to\s?action)\s+style\b/, values: CTA_STYLE },
  { field: 'voice.readingLevel', label: /\breading\s+level\b/, values: READING_LEVEL },
  { field: 'voice.claimSensitivity', label: /\bclaim\s+sensitivity\b/, values: CLAIM_SENSITIVITY },
  { field: 'voice.legalCaution', label: /\blegal\s+caution\b/, values: LEGAL_CAUTION },
]

const SCALE_RULES: Array<{ field: BrandFieldPath; label: RegExp }> = [
  { field: 'voice.formality', label: /\bformality\b/ },
  { field: 'voice.directness', label: /\bdirectness\b/ },
  { field: 'voice.empathy', label: /\bempathy\b/ },
  { field: 'voice.authority', label: /\bauthority\b/ },
  { field: 'voice.urgency', label: /\burgency\b/ },
  { field: 'voice.reassurance', label: /\breassurance\b/ },
]

/** Words a person writes instead of a number, mapped onto the 0..4 scale. */
const SCALE_WORDS: Record<string, number> = {
  none: 0, minimal: 0, lowest: 0,
  low: 1, slight: 1,
  medium: 2, moderate: 2, balanced: 2, neutral: 2,
  high: 3, strong: 3,
  highest: 4, maximum: 4, very_high: 4,
}

/** Bullet-list sections that fill an approved-facts list. */
const LIST_SECTIONS: Array<{ field: BrandFieldPath; heading: RegExp }> = [
  { field: 'facts.prohibitedClaims', heading: /\b(?:prohibited|forbidden|banned|never)\s+claims?\b|\bclaims?\s+we\s+(?:never|do\s+not)\s+make\b/ },
  { field: 'facts.requiredDisclaimers', heading: /\brequired\s+disclaimers?\b|\bdisclaimers?\b/ },
  { field: 'facts.approvedProofPoints', heading: /\b(?:approved\s+)?proof\s+points?\b/ },
  { field: 'facts.approvedClaims', heading: /\b(?:approved|permitted|allowed)\s+claims?\b/ },
  { field: 'facts.services', heading: /\b(?:services|case\s+types|practice\s+areas)\b/ },
  { field: 'facts.audience', heading: /\b(?:audience|who\s+we\s+serve)\b/ },
  { field: 'facts.geographicScope', heading: /\b(?:geograph(?:y|ic\s+scope)|jurisdictions?|areas\s+served|coverage)\b/ },
  { field: 'voice.disallowedVocabulary', heading: /\b(?:disallowed|banned|prohibited|avoid)\s+(?:vocabulary|words|terms|language)\b/ },
  { field: 'voice.preferredVocabulary', heading: /\b(?:preferred|approved)\s+(?:vocabulary|words|terms|language)\b/ },
  { field: 'facts.approvedContact.addressLines', heading: /\b(?:address|postal\s+address|mailing\s+address)\b/ },
]

/** Single-line `Label: value` reads. `list` splits on commas or semicolons. */
const SINGLE_LABELS: Array<{ field: BrandFieldPath; label: RegExp; kind: 'text' | 'list' }> = [
  { field: 'facts.legalEntityName', label: /\b(?:legal\s+entity|legal\s+name|registered\s+name|entity)\b/, kind: 'text' },
  { field: 'facts.organizationName', label: /\b(?:organi[sz]ation|company|firm|practice)(?:\s+name)?\b/, kind: 'text' },
  { field: 'facts.approvedContact.email', label: /\b(?:e-?mail|contact\s+email)\b/, kind: 'text' },
  { field: 'facts.approvedContact.websiteUrl', label: /\b(?:website|site|homepage|url)\b/, kind: 'text' },
  { field: 'facts.services', label: /\b(?:services|case\s+types|practice\s+areas)\b/, kind: 'list' },
  { field: 'facts.audience', label: /\b(?:audience|who\s+we\s+serve)\b/, kind: 'list' },
  { field: 'facts.geographicScope', label: /\b(?:geograph(?:y|ic\s+scope)|jurisdictions?|areas\s+served|coverage)\b/, kind: 'list' },
  { field: 'voice.preferredVocabulary', label: /\b(?:preferred|approved)\s+(?:vocabulary|words|terms)\b/, kind: 'list' },
  { field: 'voice.disallowedVocabulary', label: /\b(?:disallowed|banned|prohibited|avoid)\s+(?:vocabulary|words|terms)\b/, kind: 'list' },
]

/** Line count ceiling. Document size is already capped; this bounds the walk. */
const MAX_LINES = 20_000

const normaliseAxisValue = (raw: string): string =>
  raw
    .replace(/[`*_~"']/g, ' ')
    .replace(/[\s-]+/g, '_')
    .trim()
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

const splitList = (raw: string): string[] =>
  raw
    .split(/[;,]/)
    .map((s) => s.replace(/[`*_~]/g, '').trim())
    .filter((s) => s.length > 0 && s.length <= 300)
    .slice(0, 50)

export type AuthoredReads = { values: Map<BrandFieldPath, BrandFieldValue>; evidence: Map<BrandFieldPath, string> }

/**
 * Read every axis and fact a document states outright.
 *
 * The FIRST statement of a field wins, matching `parseBrandMarkdown`, so a
 * reader controls precedence within a document by ordering it.
 */
export const readAuthoredFields = (text: string, docName: string): AuthoredReads => {
  const values = new Map<BrandFieldPath, BrandFieldValue>()
  const evidence = new Map<BrandFieldPath, string>()
  const put = (field: BrandFieldPath, value: BrandFieldValue, where: string): void => {
    if (values.has(field)) return
    values.set(field, value)
    evidence.set(field, where)
  }

  const lines = text.split(/\r?\n/).slice(0, MAX_LINES)
  let section: BrandFieldPath | null = null
  let sectionAt = ''
  let bullets: string[] = []

  const flush = (): void => {
    if (section && bullets.length > 0) put(section, bullets.slice(0, 50), sectionAt)
    section = null
    bullets = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const where = `${docName} line ${i + 1}`

    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const label = normaliseAxisValue(heading[1]).replace(/_/g, ' ')
      const match = LIST_SECTIONS.find((s) => s.heading.test(label))
      if (match) {
        section = match.field
        sectionAt = where
      }
      continue
    }

    const bullet = /^\s{0,4}(?:[-*+]|\d{1,2}[.)])\s+(.*)$/.exec(line)
    if (bullet && section) {
      const item = bullet[1].replace(/[`*_~]/g, '').trim()
      if (item && item.length <= 2000 && bullets.length < 50) bullets.push(item)
      continue
    }
    // A blank line inside a list is normal markdown; anything else ends it.
    if (section && line.trim() !== '' && !bullet) flush()

    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const label = normaliseAxisValue(line.slice(0, colon)).replace(/_/g, ' ')
    const rawValue = line.slice(colon + 1).trim()
    if (!rawValue) continue

    const axis = AXIS_RULES.find((r) => r.label.test(label))
    if (axis) {
      const value = normaliseAxisValue(rawValue)
      if ((axis.values as readonly string[]).includes(value)) {
        put(axis.field, value, where)
        continue
      }
    }
    const scale = SCALE_RULES.find((r) => r.label.test(label))
    if (scale) {
      const token = normaliseAxisValue(rawValue)
      const numeric = /^(\d)(?:_of_\d)?$/.exec(token)
      const n = numeric ? Number(numeric[1]) : SCALE_WORDS[token]
      if (typeof n === 'number' && n >= VOICE_SCALE_MIN && n <= VOICE_SCALE_MAX) {
        put(scale.field, n, where)
        continue
      }
    }
    const single = SINGLE_LABELS.find((r) => r.label.test(label))
    if (single) {
      if (single.kind === 'list') {
        const items = splitList(rawValue)
        if (items.length > 0) put(single.field, items, where)
      } else {
        const cleaned = rawValue.replace(/[`*_~]/g, '').trim()
        if (cleaned && cleaned.length <= 300) put(single.field, cleaned, where)
      }
    }
  }
  flush()

  return { values, evidence }
}

/* -------------------------------------------------------------------------- */
/*                    Mapping the existing extractors' output                  */
/* -------------------------------------------------------------------------- */

/**
 * `ExtractedColors` speaks in roles the funnel model uses; the profile speaks
 * in the brand token contract. The one mapping that matters:
 *
 *   `surface` (a light page/card ground) becomes `bg` (the page ground), and
 *   `darkBackdrop` is DELIBERATELY not mapped. darkBackdrop is the dark card
 *   backdrop the funnel previews paint behind their cards - writing it into a
 *   brand's page background is how a light brand renders dark, which is the
 *   inverse of the bug map-output.ts warns about at the top of its file.
 *
 * `cta` is also deliberately absent: the token contract requires it separately
 * from `primary` precisely because reusing the identity colour for buttons is a
 * guess, not a derivation. A website-only profile therefore reports itself as
 * incomplete, which is the honest answer.
 */
const addExtractedColors = (bag: ContributionBag, colors: ExtractedColors, where: string): void => {
  const confidence = Math.max(0.2, Math.min(0.9, colors.confidence))
  bag.addMaybe('tokens.primary', colors.primary, confidence, `${where}: brand primary`)
  bag.addMaybe('tokens.accent', colors.accent, confidence * 0.9, `${where}: accent`)
  bag.addMaybe('tokens.ink', colors.ink, confidence * 0.9, `${where}: body text colour`)
  bag.addMaybe('tokens.bg', colors.surface, confidence * 0.8, `${where}: page ground`)
  bag.addMaybe('tokens.ink_muted', colors.muted, confidence * 0.7, `${where}: secondary text`)
  bag.addMaybe('tokens.font_heading', colors.fontHeading, 0.7, `${where}: heading font`)
  bag.addMaybe('tokens.font_body', colors.fontBody, 0.7, `${where}: body font`)
}

/* -------------------------------------------------------------------------- */
/*                                   Website                                   */
/* -------------------------------------------------------------------------- */

const MAX_STYLESHEETS = 3
const MAX_CSS_CHARS = 400_000

const defaultCheckAsset =
  (deps: SourceDeps) =>
  async (url: string): Promise<{ ok: boolean; contentType: string }> => {
    const res = await safeFetch(url, {
      method: 'HEAD',
      resolver: deps.resolver,
      fetchImpl: deps.fetchImpl,
      allowedPorts: deps.allowedPorts,
      timeoutMs: 4000,
      maxRedirects: 2,
    })
    if (!res.ok) return { ok: false, contentType: '' }
    return { ok: /image|svg/i.test(res.contentType), contentType: res.contentType }
  }

export const collectFromWebsite = async (
  input: Extract<BrandSourceInput, { kind: 'website' }>,
  deps: SourceDeps,
): Promise<SourceOutcome> => {
  const now = deps.now()
  const id = input.id ?? shortId('website', input.url)
  const notes: string[] = []

  const page = await safeFetch(input.url, {
    resolver: deps.resolver,
    fetchImpl: deps.fetchImpl,
    allowedPorts: deps.allowedPorts,
  })
  if (!page.ok) {
    return {
      ok: false,
      source: record({ id, kind: 'website', ref: input.url, contentHash: null, now, status: 'failed', reason: page.reason }),
      reason: page.reason,
      notes,
    }
  }
  if (page.hops.length > 1) notes.push(`Followed ${page.hops.length - 1} redirect(s) to ${page.finalUrl}.`)

  const html = page.body
  const $ = load(html)
  const finalUrl = page.finalUrl
  const host = (() => {
    try {
      return new URL(finalUrl).host
    } catch {
      return ''
    }
  })()

  let css = ''
  $('style').each((_, el) => {
    css += '\n' + ($(el).html() ?? '')
  })

  const googleFontFamilies: string[] = []
  const sheetHrefs: string[] = []
  $('link[rel="stylesheet"], link[rel="preload"][as="style"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    let abs: string
    try {
      abs = new URL(href, finalUrl).toString()
    } catch {
      return
    }
    if (/fonts\.googleapis\.com/i.test(abs)) {
      try {
        for (const family of new URL(abs).searchParams.getAll('family')) {
          const name = family.split(':')[0].replace(/\+/g, ' ').trim()
          if (name) googleFontFamilies.push(name)
        }
      } catch {
        // A malformed font URL says nothing about the brand.
      }
      return
    }
    if (sheetHrefs.length < MAX_STYLESHEETS) sheetHrefs.push(abs)
  })

  for (const sheet of sheetHrefs) {
    if (css.length > MAX_CSS_CHARS) break
    const res = await safeFetch(sheet, {
      resolver: deps.resolver,
      fetchImpl: deps.fetchImpl,
      allowedPorts: deps.allowedPorts,
      timeoutMs: 5000,
    })
    if (res.ok) css += '\n' + res.body
    else notes.push(`A stylesheet could not be read (${res.reason})`)
  }

  const colors = extractColors({ css, html, googleFontFamilies })
  const bundle: UrlBundle = { finalUrl, host, html, $, css, googleFontFamilies, manifest: null }
  const copy = extractCopyFromUrl(bundle)

  const bag = new ContributionBag('website', id)
  addExtractedColors(bag, colors, 'rendered stylesheet')
  bag.addMaybe('identity.name', copy.name, 0.6, 'page title / og:site_name')
  bag.addMaybe('identity.displayName', copy.displayName, 0.6, 'og:site_name')
  bag.addMaybe('identity.tagline', copy.tagline, 0.5, 'meta description')
  bag.addMaybe('identity.primaryDomain', copy.domains?.[0], 0.9, 'the address that was read')
  bag.addMaybe('facts.legal.copyright', copy.copyright, 0.7, 'footer copyright line')
  bag.addMaybe('facts.legal.privacyUrl', copy.privacyUrl, 0.8, 'privacy link in the page')
  bag.addMaybe('facts.legal.termsUrl', copy.termsUrl, 0.8, 'terms link in the page')
  bag.addMaybe('facts.approvedContact.phoneStated', copy.callNumber, 0.6, 'tel: link or header text')
  bag.addMaybe('facts.approvedContact.email', copy.email, 0.6, 'mailto: link or footer text')
  bag.addMaybe('facts.approvedContact.websiteUrl', finalUrl, 0.9, 'the address that was read')

  // Logos: candidates from the page, each re-admitted through the SSRF guard
  // and then confirmed to serve an image. An unconfirmed logo URL is worse than
  // none - it renders as a broken image on every page the brand appears on.
  const checkAsset = deps.checkAsset ?? defaultCheckAsset(deps)
  const logoCandidates: string[] = []
  const pushCandidate = (href: string | undefined): void => {
    if (!href || logoCandidates.length >= 6) return
    try {
      const abs = new URL(href, finalUrl).toString()
      if (abs.length <= 2000 && !logoCandidates.includes(abs)) logoCandidates.push(abs)
    } catch {
      // Not a resolvable address.
    }
  }
  $('header img, nav img, [class*="logo"] img, a[href="/"] img').each((_, el) => {
    const $el = $(el)
    const signal = `${$el.attr('alt') ?? ''} ${$el.attr('class') ?? ''} ${$el.attr('src') ?? ''}`.toLowerCase()
    if (/logo|brand|mark/.test(signal)) pushCandidate($el.attr('src') ?? $el.attr('data-src'))
  })
  pushCandidate($('meta[property="og:image"]').attr('content'))
  const faviconCandidates: string[] = []
  $('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || faviconCandidates.length >= 4) return
    try {
      faviconCandidates.push(new URL(href, finalUrl).toString())
    } catch {
      // Not a resolvable address.
    }
  })

  const firstUsableAsset = async (candidates: string[]): Promise<string | undefined> => {
    for (const candidate of candidates) {
      const admission = await assertSafeUrl(candidate, { resolver: deps.resolver, allowedPorts: deps.allowedPorts })
      if (!admission.ok) {
        notes.push(`An image on the page was not read: ${admission.reason}`)
        continue
      }
      const asset = await checkAsset(candidate)
      if (asset.ok) return candidate
    }
    return undefined
  }

  bag.addMaybe('identity.logoUrl', await firstUsableAsset(logoCandidates), 0.7, 'logo image in the page header')
  bag.addMaybe('identity.faviconUrl', await firstUsableAsset(faviconCandidates), 0.7, 'icon link in the page head')

  const contributions = bag.all
  const health = healthFor(contributions, notes)
  return {
    ok: true,
    source: record({
      id,
      kind: 'website',
      ref: finalUrl,
      contentHash: sha256(html),
      now,
      status: health.status,
      reason: health.reason,
    }),
    contributions,
    notes,
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Repository                                  */
/* -------------------------------------------------------------------------- */

const REPO_BRANCHES = ['main', 'master'] as const
const REPO_TAILWIND = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs']
const REPO_GLOBALS = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css']
const REPO_READMES = ['README.md', 'readme.md', 'Readme.md']

export const collectFromRepository = async (
  input: Extract<BrandSourceInput, { kind: 'repository' }>,
  deps: SourceDeps,
): Promise<SourceOutcome> => {
  const now = deps.now()
  const id = input.id ?? shortId('repository', input.repoUrl)
  const notes: string[] = []
  const fail = (reason: string): SourceOutcome => ({
    ok: false,
    source: record({ id, kind: 'repository', ref: input.repoUrl, contentHash: null, now, status: 'failed', reason }),
    reason,
    notes,
  })

  const parsed = parseGitHubUrl(input.repoUrl)
  if (!parsed) return fail('That is not a GitHub repository address. Only github.com repositories are read.')

  const readRaw = async (branch: string, path: string): Promise<string | null> => {
    const res = await safeFetch(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${path}`, {
      resolver: deps.resolver,
      fetchImpl: deps.fetchImpl,
      allowedPorts: deps.allowedPorts,
      timeoutMs: 5000,
    })
    return res.ok ? res.body : null
  }
  const firstHit = async (branch: string, paths: string[]): Promise<string | null> => {
    for (const path of paths) {
      const text = await readRaw(branch, path)
      if (text) return text
    }
    return null
  }

  // The default branch is PROBED rather than asked for, because the GitHub API
  // rate-limits an unauthenticated caller far sooner than raw.githubusercontent
  // does, and a rate-limited probe reads as "the repository does not exist".
  let found: { branch: string; packageJsonText: string } | null = null
  for (const candidate of REPO_BRANCHES) {
    const text = await readRaw(candidate, 'package.json')
    if (text !== null) {
      found = { branch: candidate, packageJsonText: text }
      break
    }
  }
  if (!found) {
    return fail(`No readable branch was found for ${parsed.owner}/${parsed.repo}. The repository may be private or empty.`)
  }
  const { branch, packageJsonText } = found

  const tailwindConfig = await firstHit(branch, REPO_TAILWIND)
  const globalsCss = await firstHit(branch, REPO_GLOBALS)
  const readme = await firstHit(branch, REPO_READMES)

  let packageJson: Record<string, unknown> | null = null
  try {
    const value: unknown = JSON.parse(packageJsonText)
    if (value && typeof value === 'object' && !Array.isArray(value)) packageJson = value as Record<string, unknown>
  } catch {
    notes.push('package.json could not be parsed, so its name and description were not used.')
  }

  const tailwind = tailwindConfig ? parseTailwindConfig(tailwindConfig) : undefined
  const colors = extractColors({ css: globalsCss ?? '', tailwind })

  const bundle: GithubBundle = {
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    baseRaw: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}`,
    files: { tailwindConfig, globalsCss, packageJson, readme, manifest: null },
    assetUrls: [],
    accessible: true,
  }
  const copy = extractCopyFromGithub(bundle)

  const bag = new ContributionBag('repository', id)
  addExtractedColors(bag, colors, tailwindConfig ? 'tailwind config' : 'repository stylesheet')
  bag.addMaybe('identity.name', copy.name, 0.6, 'package.json name or README title')
  bag.addMaybe('identity.displayName', copy.displayName, 0.55, 'README title')
  bag.addMaybe('identity.tagline', copy.tagline, 0.5, 'package.json description or README lead')
  bag.addMaybe('identity.primaryDomain', copy.domains?.[0], 0.6, 'package.json homepage')
  bag.addMaybe('facts.approvedContact.email', copy.email, 0.5, 'README contact')
  bag.addMaybe('facts.approvedContact.phoneStated', copy.callNumber, 0.4, 'README contact')

  if (!tailwindConfig && !globalsCss) notes.push('No tailwind config or global stylesheet was found, so no colours were read.')

  const contributions = bag.all
  const health = healthFor(contributions, notes)
  return {
    ok: true,
    source: record({
      id,
      kind: 'repository',
      ref: bundle.baseRaw,
      contentHash: sha256([tailwindConfig, globalsCss, packageJsonText, readme].join('|')),
      now,
      status: health.status,
      reason: health.reason,
    }),
    contributions,
    notes,
  }
}

/* -------------------------------------------------------------------------- */
/*                    Markdown / MDX / text: documents + brief                 */
/* -------------------------------------------------------------------------- */

const collectFromProse = (
  kind: 'brand_document' | 'brief',
  id: string,
  ref: string,
  docs: BrandDoc[],
  now: string,
): SourceOutcome => {
  const sanitised = sanitizeBrandDocs(docs)
  if (!sanitised.ok) {
    return {
      ok: false,
      source: record({ id, kind, ref, contentHash: null, now, status: 'failed', reason: sanitised.error }),
      reason: sanitised.error,
      notes: [],
    }
  }

  const facts = parseBrandMarkdown(sanitised.docs)
  const notes = [...facts.notes]
  const bag = new ContributionBag(kind, id)

  // Colour and font tokens, straight from the deterministic parser. It already
  // keys them by the brand token contract's own names, so this is a copy.
  for (const [token, proposal] of Object.entries(facts.tokens)) {
    const field = `tokens.${token}`
    if (!isBrandFieldPath(field)) continue
    bag.add(field, proposal.value, proposal.confidence, proposal.source)
  }

  bag.addMaybe('identity.name', facts.identity.name, 0.85, 'stated in the document')
  bag.addMaybe('identity.displayName', facts.identity.name, 0.7, 'stated in the document')
  bag.addMaybe('identity.tagline', facts.identity.tagline, 0.85, 'stated as the tagline')
  bag.addMaybe('identity.logoUrl', facts.identity.logoUrl, 0.8, 'linked as the logo')
  bag.addMaybe('identity.primaryDomain', facts.identity.domains?.[0], 0.6, 'a web address in the document')
  bag.addMaybe('facts.legal.copyright', facts.identity.copyright, 0.85, 'copyright line')
  bag.addMaybe('facts.legal.privacyUrl', facts.identity.privacyUrl, 0.85, 'privacy link')
  bag.addMaybe('facts.legal.termsUrl', facts.identity.termsUrl, 0.85, 'terms link')
  bag.addMaybe('facts.approvedContact.phoneStated', facts.identity.callNumber, 0.8, 'stated as the phone number')

  for (const doc of sanitised.docs) {
    const authored = readAuthoredFields(doc.text, doc.name)
    for (const [field, value] of authored.values) {
      bag.add(field, value, 0.9, authored.evidence.get(field) ?? doc.name)
    }
  }

  const contributions = bag.all
  const health = healthFor(contributions, notes)
  return {
    ok: true,
    source: record({
      id,
      kind,
      ref,
      contentHash: sha256(sanitised.docs.map((d) => `${d.name}|${d.text}`).join('|')),
      now,
      status: health.status,
      reason: health.reason,
    }),
    contributions,
    notes,
  }
}

export const collectFromBrandDocuments = (
  input: Extract<BrandSourceInput, { kind: 'brand_document' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const docs = Array.isArray(input.docs) ? input.docs : []
  const ref = docs.map((d) => d.name).join(', ') || 'brand documents'
  return collectFromProse('brand_document', input.id ?? shortId('brand_document', ref), ref, docs, deps.now())
}

export const collectFromBrief = (
  input: Extract<BrandSourceInput, { kind: 'brief' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const text = typeof input.text === 'string' ? input.text : ''
  const docs: BrandDoc[] = text.trim() ? [{ name: 'pasted brief', text }] : []
  return collectFromProse('brief', input.id ?? shortId('brief', text.slice(0, 200)), 'pasted brief', docs, deps.now())
}

/* -------------------------------------------------------------------------- */
/*                        Structured JSON / CSS tokens                         */
/* -------------------------------------------------------------------------- */

/**
 * Token-name aliases, most specific first.
 *
 * Same ordering lesson as markdown-source.ts: `on-primary` names the colour
 * that sits ON the brand colour, and testing `primary` first would store it AS
 * the brand colour.
 */
const TOKEN_ALIASES: Array<{ token: string; names: string[] }> = [
  { token: 'primary_ink', names: ['on-primary', 'primary-ink', 'primary-foreground', 'primary-contrast', 'text-on-primary'] },
  { token: 'accent_ink', names: ['on-accent', 'accent-ink', 'accent-foreground', 'accent-contrast'] },
  { token: 'cta_ink', names: ['on-cta', 'cta-ink', 'cta-foreground', 'button-text', 'on-button'] },
  { token: 'ink_muted', names: ['muted', 'text-muted', 'foreground-muted', 'subtle', 'secondary-text'] },
  { token: 'surface_2', names: ['surface-2', 'surface2', 'elevated', 'nested', 'input-background'] },
  { token: 'border', names: ['border', 'divider', 'outline', 'hairline', 'stroke'] },
  { token: 'surface', names: ['surface', 'card', 'panel', 'sheet'] },
  { token: 'bg', names: ['background', 'bg', 'page', 'canvas', 'base'] },
  { token: 'cta', names: ['cta', 'action', 'button'] },
  { token: 'ink', names: ['ink', 'foreground', 'text', 'body'] },
  { token: 'accent', names: ['accent', 'secondary', 'highlight'] },
  { token: 'primary', names: ['primary', 'brand', 'main'] },
]

/** Keys that would walk into the prototype chain rather than the data. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const HEX_TOKEN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

type JsonLeaf = { key: string; value: string }

/**
 * Walk a parsed JSON token file, bounded in BOTH depth and count.
 *
 * A design-token export is uploaded by a human and is therefore hostile input;
 * an unbounded walk over one is a denial of service with extra steps.
 */
const collectJsonLeaves = (
  value: unknown,
  path: string[],
  out: JsonLeaf[],
  depth: number,
): void => {
  if (depth > 8 || out.length >= 500) return
  if (typeof value === 'string') {
    // A W3C-style token writes `{ "primary": { "$value": "#0b1f3a" } }`, so the
    // name of the token is the key ABOVE `$value`.
    const own = path[path.length - 1] ?? ''
    const key = own === 'value' || own === '$value' ? (path[path.length - 2] ?? own) : own
    out.push({ key, value })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectJsonLeaves(item, path, out, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      if (UNSAFE_KEYS.has(k)) continue
      collectJsonLeaves(v, [...path, k], out, depth + 1)
    }
  }
}

const normaliseTokenKey = (key: string): string => key.replace(/^--/, '').replace(/[_\s]+/g, '-').toLowerCase()

export const collectFromDesignTokens = (
  input: Extract<BrandSourceInput, { kind: 'design_tokens' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const now = deps.now()
  const ref = input.name || `design tokens (${input.format})`
  const id = input.id ?? shortId('design_tokens', ref)
  const notes: string[] = []
  const text = typeof input.text === 'string' ? input.text : ''
  const bag = new ContributionBag('design_tokens', id)

  if (!text.trim()) {
    const reason = 'The token file was empty.'
    return { ok: false, source: record({ id, kind: 'design_tokens', ref, contentHash: null, now, status: 'failed', reason }), reason, notes }
  }

  if (input.format === 'css') {
    // Read through `extractColors`, not `extractBrandFromCss`: the newer reader
    // accepts a final declaration with no trailing semicolon, and understands
    // Tailwind v4 `@theme` blocks as well as `:root`.
    const colors = extractColors({ css: text })
    addExtractedColors(bag, colors, 'design token stylesheet')
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      const reason = `The token file is not valid JSON: ${err instanceof Error ? err.message : 'unknown parse error'}`
      return { ok: false, source: record({ id, kind: 'design_tokens', ref, contentHash: null, now, status: 'failed', reason }), reason, notes }
    }
    const leaves: JsonLeaf[] = []
    collectJsonLeaves(parsed, [], leaves, 0)
    if (leaves.length >= 500) notes.push('The token file is very large; only its first 500 values were read.')

    const taken = new Set<string>()
    for (const alias of TOKEN_ALIASES) {
      if (taken.has(alias.token)) continue
      const hit =
        leaves.find((l) => alias.names.includes(normaliseTokenKey(l.key)) && HEX_TOKEN.test(l.value.trim())) ??
        leaves.find((l) => alias.names.some((n) => normaliseTokenKey(l.key).includes(n)) && HEX_TOKEN.test(l.value.trim()))
      if (!hit) continue
      const field = `tokens.${alias.token}`
      if (!isBrandFieldPath(field)) continue
      taken.add(alias.token)
      bag.add(field, hit.value.trim(), 0.9, `"${hit.key}" in ${ref}`)
    }
    const font = (names: string[]): JsonLeaf | undefined =>
      leaves.find((l) => names.some((n) => normaliseTokenKey(l.key).includes(n)) && !HEX_TOKEN.test(l.value.trim()))
    const heading = font(['font-heading', 'heading-font', 'font-display'])
    const body = font(['font-body', 'body-font', 'font-sans'])
    if (heading) bag.add('tokens.font_heading', heading.value.split(',')[0].replace(/["']/g, '').trim(), 0.85, `"${heading.key}"`)
    if (body) bag.add('tokens.font_body', body.value.split(',')[0].replace(/["']/g, '').trim(), 0.85, `"${body.key}"`)
  }

  const contributions = bag.all
  const health = healthFor(contributions, notes)
  return {
    ok: true,
    source: record({ id, kind: 'design_tokens', ref, contentHash: sha256(text), now, status: health.status, reason: health.reason }),
    contributions,
    notes,
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Images                                    */
/* -------------------------------------------------------------------------- */

type RawPixels = { data: Buffer; info: { channels: number } }
type SharpPipeline = {
  flatten: (options: { background: { r: number; g: number; b: number } }) => SharpPipeline
  resize: (width: number, height: number, options: { fit: 'inside' }) => SharpPipeline
  removeAlpha: () => SharpPipeline
  raw: () => SharpPipeline
  toBuffer: (options: { resolveWithObject: true }) => Promise<RawPixels>
}
type SharpFactory = (input: Buffer) => SharpPipeline

/**
 * sharp is loaded lazily and narrowed at runtime.
 *
 * It is a native binding: importing it at module scope would make every module
 * that touches the brand service depend on a working platform build, and an
 * image is the one source that may legitimately be absent. If it cannot load,
 * the image source reports 'failed' with the reason instead of taking the
 * request down.
 */
const loadSharp = async (): Promise<SharpFactory | null> => {
  try {
    const mod: unknown = await import('sharp')
    const candidate =
      typeof mod === 'function' ? mod : mod && typeof mod === 'object' ? (mod as { default?: unknown }).default : null
    return typeof candidate === 'function' ? (candidate as SharpFactory) : null
  } catch {
    return null
  }
}

/**
 * Dominant colours from an image, by decoding it - no model, no network.
 *
 * Pixels are bucketed at 4 bits per channel so near-identical shades of the
 * same brand colour count as one swatch, and each bucket reports the average of
 * the pixels in it rather than a bucket centre, so the swatch is a colour that
 * is actually in the image.
 */
export const sharpImagePalette = async (image: BrandImageInput): Promise<ImagePalette | null> => {
  const sharp = await loadSharp()
  if (!sharp) return null
  let raw: RawPixels
  try {
    raw = await sharp(Buffer.from(image.dataBase64, 'base64'))
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(48, 48, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  } catch {
    return null
  }
  const channels = raw.info.channels
  if (channels < 3) return null

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i + channels - 1 < raw.data.length; i += channels) {
    const r = raw.data[i]
    const g = raw.data[i + 1]
    const b = raw.data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  const swatches = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((x) => rgbToHex(x.r / x.count, x.g / x.count, x.b / x.count))
  return swatches.length > 0 ? { swatches } : null
}

export const collectFromImages = async (
  input: Extract<BrandSourceInput, { kind: 'image' }>,
  deps: SourceDeps,
): Promise<SourceOutcome> => {
  const now = deps.now()
  const images = Array.isArray(input.images) ? input.images : []
  const ref = images.map((i) => i.name).join(', ') || 'images'
  const id = input.id ?? shortId('image', ref)
  const notes: string[] = []
  const fail = (reason: string): SourceOutcome => ({
    ok: false,
    source: record({ id, kind: 'image', ref, contentHash: null, now, status: 'failed', reason }),
    reason,
    notes,
  })

  if (images.length === 0) return fail('No images were attached.')
  if (images.length > MAX_IMAGES) return fail(`Attach at most ${MAX_IMAGES} images.`)
  for (const image of images) {
    if (!(IMAGE_TYPES as readonly string[]).includes(image.mediaType)) {
      return fail(`${image.name || 'An image'} is a ${image.mediaType}, which cannot be read. Use ${IMAGE_TYPES.join(', ')}.`)
    }
    if (typeof image.dataBase64 !== 'string' || image.dataBase64.length === 0) {
      return fail(`${image.name || 'An image'} carried no data.`)
    }
    if (image.dataBase64.length > MAX_IMAGE_B64) {
      return fail(`${image.name || 'An image'} is too large. Downscale it before attaching.`)
    }
  }

  const readPalette = deps.readImagePalette ?? sharpImagePalette
  const swatches: string[] = []
  for (const image of images) {
    let palette: ImagePalette | null = null
    try {
      palette = await readPalette(image)
    } catch (err) {
      notes.push(`${image.name || 'An image'} could not be decoded: ${err instanceof Error ? err.message : 'unknown error'}`)
      continue
    }
    if (!palette || palette.swatches.length === 0) {
      notes.push(`${image.name || 'An image'} produced no usable colours.`)
      continue
    }
    for (const hex of palette.swatches) if (HEX_TOKEN.test(hex) && !swatches.includes(hex)) swatches.push(hex)
  }
  if (swatches.length === 0) return fail(notes[0] ?? 'No colours could be read from the images.')

  const bag = new ContributionBag('image', id)
  // An image is the weakest colour evidence there is: it says what is IN the
  // picture, not what the brand decided. Confidence is set accordingly, and the
  // saturated non-grey swatch is the only one offered as an identity colour.
  const withLuminance = swatches
    .map((hex) => ({ hex, lum: relativeLuminance(hex) ?? 0.5, rgb: parseHex(hex) }))
    .filter((x) => x.rgb !== null)
  const identity = withLuminance
    .filter((x) => !isGrey(x.hex))
    .sort((a, b) => rgbToHsl(b.rgb!)[1] - rgbToHsl(a.rgb!)[1])[0]
  const lightest = [...withLuminance].sort((a, b) => b.lum - a.lum)[0]
  const darkest = [...withLuminance].sort((a, b) => a.lum - b.lum)[0]

  if (identity) bag.add('tokens.primary', identity.hex, 0.4, 'the most saturated colour in the image')
  if (lightest && lightest.lum > 0.6) bag.add('tokens.bg', lightest.hex, 0.3, 'the lightest area of the image')
  if (darkest && darkest.lum < 0.25) bag.add('tokens.ink', darkest.hex, 0.3, 'the darkest area of the image')
  if (!identity) notes.push('Every colour in the images was grey, so no brand colour was proposed.')

  const contributions = bag.all
  const health = healthFor(contributions, notes)
  return {
    ok: true,
    source: record({
      id,
      kind: 'image',
      ref,
      contentHash: sha256(images.map((i) => i.dataBase64.slice(0, 4096)).join('|')),
      now,
      status: health.status,
      reason: health.reason,
    }),
    contributions,
    notes,
  }
}

/* -------------------------------------------------------------------------- */
/*                          Manual, neutral, unsupported                       */
/* -------------------------------------------------------------------------- */

export const collectFromManual = (
  input: Extract<BrandSourceInput, { kind: 'manual' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const now = deps.now()
  const ref = input.label ?? 'set by a person'
  const id = input.id ?? 'manual'
  const values = Array.isArray(input.values) ? input.values : []
  const contributions: FieldContribution[] = []
  const notes: string[] = []
  for (const entry of values) {
    if (!entry || !isBrandFieldPath(entry.field)) {
      notes.push(`"${String(entry?.field)}" is not a brand profile field and was ignored.`)
      continue
    }
    // A person clearing a field is a decision, so null and [] pass through here
    // rather than being dropped the way an empty machine read is.
    contributions.push({ field: entry.field, value: entry.value, kind: 'manual', sourceId: id, confidence: 1, evidence: ref })
  }
  const health = contributions.length > 0 ? healthFor(contributions, notes) : { status: 'partial' as const, reason: 'No values were set.' }
  return {
    ok: true,
    source: record({ id, kind: 'manual', ref, contentHash: null, now, status: health.status, reason: health.reason }),
    contributions,
    notes,
  }
}

/**
 * The neutral preview fallback: the lowest-priority source there is.
 *
 * It contributes only the style and voice axes a preview needs in order to
 * render, and it is RECORDED as a source so provenance can say "nobody chose
 * this" rather than presenting a default as a decision. It never touches a
 * token, an identity value or a fact - a neutral brand has no colours, and
 * showing one it did not pick is the bug `brand-fixtures.ts` calls "a page
 * showing a colour nobody chose".
 */
export const collectNeutralFallback = (
  input: Extract<BrandSourceInput, { kind: 'neutral_fallback' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const now = deps.now()
  const id = input.id ?? 'neutral'
  const bag = new ContributionBag('neutral_fallback', id)
  for (const [key, value] of Object.entries(NEUTRAL_STYLE)) {
    const field = `style.${key}`
    if (isBrandFieldPath(field)) bag.add(field, value, 0.1, 'neutral preview default')
  }
  for (const [key, value] of Object.entries(NEUTRAL_VOICE)) {
    const field = `voice.${key}`
    if (!isBrandFieldPath(field)) continue
    if (Array.isArray(value) && value.length === 0) continue
    bag.add(field, value, 0.1, 'neutral preview default')
  }
  const contributions = bag.all
  return {
    ok: true,
    source: record({ id, kind: 'neutral_fallback', ref: 'neutral preview default', contentHash: null, now, status: 'ok', reason: null }),
    contributions,
    notes: [],
  }
}

/**
 * PDF and DOCX are declared, ranked, and refused.
 *
 * They rank as brand documents because that is what they are. They are refused
 * because reading them needs a parser this repo does not have and cannot
 * verify, and a brand guideline half-read is worse than one not read: a
 * near-miss hex that looks right is exactly the failure the markdown parser was
 * written to remove. An honest refusal tells the operator to export the
 * document as markdown; a stub would tell them nothing and lose their colours.
 */
export const UNSUPPORTED_SOURCE_REASON =
  'PDF and Word documents are not read. This build has no parser it can verify, and a half-read brand guideline produces colours that look right and are not. Export the document as Markdown or plain text and attach that.'

export const collectUnsupported = (
  input: Extract<BrandSourceInput, { kind: 'pdf_document' | 'docx_document' }>,
  deps: SourceDeps,
): SourceOutcome => {
  const now = deps.now()
  const ref = input.name || input.kind
  const id = input.id ?? shortId(input.kind, ref)
  return {
    ok: false,
    source: record({ id, kind: input.kind, ref, contentHash: null, now, status: 'unsupported', reason: UNSUPPORTED_SOURCE_REASON }),
    reason: UNSUPPORTED_SOURCE_REASON,
    notes: [],
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Dispatcher                                  */
/* -------------------------------------------------------------------------- */

/**
 * One entry point per source, so a caller never picks an adapter by hand.
 *
 * The switch is exhaustive over the input union rather than falling through to
 * a default, so adding a source kind is a compile error here until it has an
 * adapter. A `default:` would have made a new kind silently do nothing, which
 * is the shape of every silent fallback this repo has had to remove.
 */
export const collectFromSource = async (input: BrandSourceInput, deps: SourceDeps): Promise<SourceOutcome> => {
  switch (input.kind) {
    case 'website':
      return collectFromWebsite(input, deps)
    case 'repository':
      return collectFromRepository(input, deps)
    case 'brand_document':
      return collectFromBrandDocuments(input, deps)
    case 'design_tokens':
      return collectFromDesignTokens(input, deps)
    case 'image':
      return collectFromImages(input, deps)
    case 'brief':
      return collectFromBrief(input, deps)
    case 'manual':
      return collectFromManual(input, deps)
    case 'neutral_fallback':
      return collectNeutralFallback(input, deps)
    case 'pdf_document':
    case 'docx_document':
      return collectUnsupported(input, deps)
  }
}
