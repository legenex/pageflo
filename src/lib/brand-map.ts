// Maps a production Site (+ its attached domains) into the funnel-builder
// artifact's brand object shape. Used by the Site Pages renderer (via the
// public layout CSS vars), the Quiz builder, the Landing Page builder, the
// Advertorial builder, and the Brand Identities admin page — so a change
// to a Site's brand fields flows everywhere.
//
// Merge rule (THE invariant the whole platform relies on):
//   1. Site.brand.* fields are the SINGLE SOURCE OF TRUTH for canonical
//      brand identity — colours, fonts, logos, taglines, display name.
//      They beat brand_identity.* every time.
//   2. brand_identity.* (JSON column) is for funnel-only extensions:
//      contact CTA copy, legal disclaimer, default body sections, default
//      page chrome (header + footer), bg pattern. Anything that has no
//      Site.brand equivalent.
//
// So: editing a colour in the Site brand editor instantly recolours every
// quiz, LP, advertorial, and site page that points at that Site, even if
// brand_identity still has an older value in its JSON blob.

import { resolveBrandTokens, MissingBrandTokenError } from './brand/resolve-tokens'

export type DomainLite = {
  id: string
  host: string
  primary: boolean
  status: string
  /** Only a domain with an active certificate can serve a funnel over https. */
  sslStatus: string
  /** site | quiz | landing | advertorial | preview. Absent on older rows. */
  kind?: string
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

// Sizes are pixel values a renderer puts straight into a style, so a stored 0 or
// a negative is treated as "not set" rather than passed through. A zero-height
// logo or a zero-size copyright line is not a choice the editor can express, and
// an invisible copyright line on an attorney-advertising page is the failure
// mode worth spending a branch on.
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback

// Field-by-field "non-empty wins" merge for nested colour/typography/etc.
// objects. brand_identity's fields fill in any slot Site.brand left empty
// without ever overriding a Site.brand value.
const mergeNested = (
  fromSite: Record<string, string>,
  fromIdentity: Record<string, unknown> | undefined,
): Record<string, string> => {
  if (!fromIdentity || typeof fromIdentity !== 'object') return fromSite
  const out: Record<string, string> = { ...fromSite }
  for (const k of Object.keys(fromIdentity)) {
    const v = (fromIdentity as Record<string, unknown>)[k]
    if (!out[k] && typeof v === 'string' && v.trim() !== '') out[k] = v
  }
  return out
}

/** The standalone-page header and footer a brand renders its funnels with. */
export type BrandChrome = {
  header: {
    logoEnabled: boolean
    ctaButton: { enabled: boolean; text: string; url: string; fontSize: number }
  }
  footer: { logoEnabled: boolean; logoSize: number; showCopyright: boolean; fontSize: number }
}

/**
 * Resolve the page chrome a brand's standalone funnel pages wear.
 *
 * Chrome is a BRAND concern, not a per-placement one. It used to be authored on
 * each quiz deployment, which meant two deployments of one quiz under one brand
 * could show different logos, different call buttons and different copyright
 * lines, and a deployment created without chrome showed none at all.
 *
 * Nothing here can resolve to null. That is the point: the footer carries
 * `legal.copyright`, and on an attorney-advertising page a missing copyright
 * line is a compliance regression rather than a cosmetic one, so a brand that
 * has never opened the chrome editor still renders a complete header and footer.
 *
 * Exported so the brand editor can display exactly what the renderer will paint.
 * A second derivation in the editor is how "what you see" and "what ships" drift
 * apart.
 */
export function resolveDefaultChrome(
  identity: Record<string, unknown> | null | undefined,
  contact: { callNumber?: string; callCtaText?: string } | null | undefined,
): BrandChrome {
  const ident = obj(identity)
  const callDigits = str(contact?.callNumber).replace(/[^\d+]/g, '')
  const callHref = callDigits ? `tel:${callDigits}` : ''

  const header = obj(ident.defaultHeader)
  const cta = obj(header.ctaButton)
  const storedUrl = str(cta.url).trim()
  const footer = obj(ident.defaultFooter)

  return {
    header: {
      logoEnabled: bool(header.logoEnabled, true),
      ctaButton: {
        // A brand with no number has nothing to dial, so the button starts off
        // rather than rendering a dead `tel:`.
        enabled: bool(cta.enabled, Boolean(callHref)),
        // The brand authors its call-to-action copy once, under contact. Reading
        // it here is what stops the header saying one thing while every in-page
        // call button says another.
        text: str(cta.text).trim() || str(contact?.callCtaText).trim() || 'CLICK HERE TO CALL',
        // A stored `tel:` is a COPY of the brand's call number, and the brand
        // editor saves the resolved object back, so a copy would keep dialling
        // the old number long after the brand changed it. Phone links are
        // therefore always re-derived; any other destination (a booking page,
        // say) is a real authoring choice and is kept.
        url: !storedUrl || storedUrl.startsWith('tel:') ? callHref : storedUrl,
        fontSize: num(cta.fontSize, 11),
      },
    },
    footer: {
      logoEnabled: bool(footer.logoEnabled, true),
      logoSize: num(footer.logoSize, 32),
      showCopyright: bool(footer.showCopyright, true),
      fontSize: num(footer.fontSize, 12),
    },
  }
}

export function siteToBrand(s: Record<string, unknown>, domainList: DomainLite[]) {
  const id = Number(s.id)
  const primaryDomain = domainList.find((d) => d.primary)?.host ?? domainList[0]?.host ?? ''
  const brand = (s.brand ?? {}) as Record<string, unknown>
  const legal = (s.legal ?? {}) as Record<string, unknown>
  const typo = (s.typography ?? {}) as Record<string, unknown>
  const identity = (s.brand_identity && typeof s.brand_identity === 'object'
    ? (s.brand_identity as Record<string, unknown>)
    : {}) as Record<string, unknown>

  // Colour comes from the canonical brand tokens through the one resolver.
  //
  // What this replaces was the reason quizzes did not look like their brand.
  // Two bugs, both silent:
  //
  //   1. The page background was read from `brand.ink` - the BODY TEXT colour.
  //      Ink is dark by definition, so every quiz rendered on a dark ground no
  //      matter what the brand's actual background was.
  //   2. `cardBg` was never populated at all, so it always fell through to a
  //      hardcoded '#0d2447'. That plus a '#1d8df6' primary default meant any
  //      brand with a sparse record rendered in Check My Claim's blue and navy.
  //      Not "close to the wrong colour" - literally another brand's palette.
  //
  // brand_identity is no longer consulted for colour either. The token columns
  // are the single store (the P0-B migration promoted the JSON values into
  // them), and reading both is how two stores drift apart.
  let tokens: ReturnType<typeof resolveBrandTokens> | null = null
  let missingTokens: string[] = []

  // Built once so the catch below can retry with the SAME authored values and
  // patch only what was missing. Rebuilding a neutral set from scratch there is
  // what threw away a brand's real colours because one unrelated token was
  // absent.
  const authored = {
      primary: str(brand.primary),
      primary_ink: str(brand.primary_ink),
      accent: str(brand.accent),
      accent_ink: str(brand.accent_ink),
      cta: str(brand.cta),
      cta_ink: str(brand.cta_ink),
      bg: str(brand.bg),
      surface: str(brand.surface),
      surface_2: str(brand.surface_2),
      ink: str(brand.ink),
      ink_muted: str(brand.ink_muted) || str(brand.muted),
      border: str(brand.border),
      font_heading: str(brand.font_heading),
      font_body: str(brand.font_body),
      radius: str(brand.radius),
      radius_lg: str(brand.radius_lg),
      shadow: str(brand.shadow),
  }

  try {
    tokens = resolveBrandTokens(authored)
  } catch (err) {
    missingTokens = err instanceof MissingBrandTokenError ? err.missing : ['primary']

    // Substitute ONLY the tokens that are actually missing, and keep every
    // value the brand really set.
    //
    // This used to replace the whole palette with grey the moment any single
    // required token was absent, which meant a brand with a perfectly good
    // navy primary rendered entirely grey because nothing had written its
    // background. Saving from the editor could not fix it either, so it looked
    // exactly like a save that silently reverted.
    //
    // The substitutes are a TRUE NEUTRAL, no hue at all, and that part was
    // right: grey reads as "not set yet", where an invented blue reads as a
    // finished brand that happens to be wrong. `incomplete` and `missingTokens`
    // are what the UI surfaces so the gap is visible rather than merely absent.
    const NEUTRAL: Record<string, string> = {
      primary: '#737373',
      cta: '#737373',
      bg: '#f5f5f5',
      ink: '#171717',
    }
    const patched: Record<string, string | undefined> = { ...authored }
    for (const key of missingTokens) {
      if (NEUTRAL[key]) patched[key] = NEUTRAL[key]
    }

    try {
      tokens = resolveBrandTokens(patched)
    } catch {
      // A second failure means the missing list did not describe the whole
      // problem. Falling all the way back is right here, and only here.
      tokens = resolveBrandTokens(NEUTRAL)
    }
  }

  const v = tokens.vars
  const colorsResolved = {
    primary: v['--site-primary'],
    accent: v['--site-accent'],
    // The page ground and the card, from the tokens that actually mean those
    // things rather than from the text colour.
    background: v['--site-bg'],
    cardBg: v['--site-surface'],
    cta: v['--site-cta'],
    ctaInk: v['--site-cta-ink'],
    ink: v['--site-ink'],
    inkMuted: v['--site-ink-muted'],
    border: v['--site-border'],
    // Legacy alias: "text on a known-dark surface". Now derived against the ink
    // colour rather than assumed white, so it stays legible for a brand whose
    // ink is light.
    textOnDark: v['--site-ink-inverse'],
    onPrimary: v['--site-primary-ink'],
    // Status colours are system-wide. A brand does not get its own danger red,
    // because a warning that changes colour per tenant stops meaning warning.
    success: v['--sys-success'],
    warning: v['--sys-warning'],
    danger: v['--sys-danger'],
  }

  const typographyFromSite: Record<string, string> = {
    headlineFont: str(typo.headline_font) || str(brand.font_heading),
    bodyFont: str(typo.body_font) || str(brand.font_body),
    baseSize: str(typo.base_size),
  }
  const typography = mergeNested(typographyFromSite, identity.typography as Record<string, unknown> | undefined)
  const typographyResolved = {
    headlineFont: typography.headlineFont || 'Inter',
    bodyFont: typography.bodyFont || 'Inter',
    baseSize: typography.baseSize || 'md',
  }

  const contactFromSite: Record<string, string> = {
    callNumber: str(s.default_phone),
    callCtaText: '',
    callCtaStyle: '',
  }
  const contact = mergeNested(contactFromSite, identity.contact as Record<string, unknown> | undefined)
  const contactResolved = {
    callNumber: contact.callNumber || '',
    callCtaText: contact.callCtaText || 'CLICK HERE TO CALL',
    callCtaStyle: contact.callCtaStyle || 'pill',
  }

  const legalFromSite: Record<string, string> = {
    copyright: str(legal.copyright),
    tcpaText: str(legal.tcpa_text),
    privacyUrl: str(legal.privacy_url),
    termsUrl: str(legal.terms_url),
    defaultDisclaimer: str(legal.default_disclaimer) || str(s.default_disclaimer_md),
  }
  const legalResolved = mergeNested(legalFromSite, identity.legal as Record<string, unknown> | undefined)

  // Destination URLs for this brand: where its quizzes and funnels send people
  // (thank you, did-not-qualify, partners, legal pages). Stored under
  // brand_identity.urls; privacy and terms fall back to the Site's own legal
  // fields so a brand that only filled those in still resolves them, and
  // anything still empty falls back to the site's built-in page at render time
  // (see resolveDestination in quiz-destinations.ts).
  const urlsFromIdentity = (identity.urls && typeof identity.urls === 'object'
    ? (identity.urls as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const urls: Record<string, string> = {}
  for (const k of ['thank_you', 'dq', 'partners', 'privacy', 'terms', 'disclosures']) {
    const v = urlsFromIdentity[k]
    if (typeof v === 'string' && v.trim()) urls[k] = v.trim()
  }
  if (!urls.privacy && legalResolved.privacyUrl) urls.privacy = legalResolved.privacyUrl
  if (!urls.terms && legalResolved.termsUrl) urls.terms = legalResolved.termsUrl

  const chrome = resolveDefaultChrome(identity, contactResolved)

  // Top-level scalars: Site.brand wins, fall back to brand_identity, then
  // to a sensible default.
  const pick = (siteVal: string, identityKey: string, fallback = ''): string => {
    if (siteVal) return siteVal
    const iv = identity[identityKey]
    return typeof iv === 'string' && iv ? iv : fallback
  }

  return {
    id: `site_${id}`,
    siteId: id,
    siteSlug: str(s.slug),
    // The Site's lifecycle status, so a picker can refuse an archived brand the
    // same way it refuses an archived quiz. Without this every dropdown that
    // lists brands offered archived ones, which is how a funnel gets built for
    // a brand that was deliberately retired.
    status: str(s.status, 'active'),
    name: str(s.name),
    displayName: pick(str(brand.display_name), 'displayName', str(s.name)),
    shortName: pick(str(brand.short_name), 'shortName'),
    tagline: pick(str(brand.tagline_brand) || str(s.tagline), 'tagline'),
    logoUrl: pick(str(brand.logo_url), 'logoUrl'),
    logoUrlDark: pick(str(brand.logo_url_dark), 'logoUrlDark'),
    faviconUrl: pick(str(brand.favicon_url), 'faviconUrl'),
    primaryDomain: primaryDomain || str(identity.primaryDomain),
    colors: colorsResolved,
    // The full CSS variable map, so a renderer can hand the whole set to a
    // style tag instead of picking values out one at a time.
    tokens: tokens.vars,
    contrast: tokens.audit,
    /** True when the brand has no usable colours and is rendering as grey. */
    incomplete: missingTokens.length > 0,
    missingTokens,
    typography: typographyResolved,
    contact: contactResolved,
    domains: [] as string[],
    legal: legalResolved,
    urls,
    bgPattern: (typeof identity.bgPattern === 'string' && identity.bgPattern) || 'plus',
    bgColor: colorsResolved.background,
    defaultBodySections: Array.isArray(identity.defaultBodySections) ? (identity.defaultBodySections as unknown[]) : [],
    defaultHeader: chrome.header,
    defaultFooter: chrome.footer,
    __domainCount: domainList.length,
    __domains: domainList,
  }
}

// Build the full brand list + per-site domain map from raw Payload docs.
export function buildBrandsFromSites(
  siteDocs: Array<Record<string, unknown>>,
  domainDocs: Array<Record<string, unknown>>,
) {
  const domainsBySite = new Map<number, DomainLite[]>()
  for (const d of domainDocs) {
    if (d.site == null) continue
    const sid = typeof d.site === 'object' ? Number((d.site as { id: unknown }).id) : Number(d.site)
    const arr = domainsBySite.get(sid) ?? []
    arr.push({
      id: String(d.id ?? ''),
      host: String(d.host ?? ''),
      primary: Boolean(d.primary),
      status: typeof d.status === 'string' ? d.status : 'pending',
      sslStatus: typeof d.ssl_status === 'string' ? d.ssl_status : 'pending',
      kind: typeof d.kind === 'string' ? d.kind : undefined,
    })
    domainsBySite.set(sid, arr)
  }
  return siteDocs.map((s) => siteToBrand(s, domainsBySite.get(Number(s.id)) ?? []))
}
