/**
 * ONE answer to "what URL does this deployment actually serve on".
 *
 * Before this module the landing-page deployment editor computed that question
 * three times, in three different ways, on one screen — and the three disagreed
 * on a saved deployment:
 *
 *   header      `{draft.domain || 'preview.legenex.com'}{draft.path}`   -> preview.legenex.com/c/
 *   Final URL   `https://preview.legenex.com/lp/${id || 'new'}`         -> .../lp/new
 *   the router  Host: -> Domain -> Site, then `path`                    -> dont-settle.preview.legenex.com/c
 *
 * Every one of those is wrong in a different way and none of them is what a
 * visitor reaches:
 *
 *  - `preview.legenex.com` is the WILDCARD ROOT, not a host any Site answers on.
 *    The real preview host is `<site-slug>.preview.legenex.com`. The bare root
 *    is a vhost that belongs to no tenant.
 *  - `/lp/<id>` IS NOT A ROUTE. Nothing serves it. `resolveLpDeployment` matches
 *    on the deployment's `path`, so the id never appears in a public URL. It
 *    looked plausible enough to survive review and to be copied into the
 *    advertorial (`/a/<id>`) and quiz (`/q/<id>`) builders as well.
 *  - the `|| 'new'` fallback meant an EXISTING deployment rendered a URL that
 *    described a record that does not exist yet.
 *
 * So the rule is stated once, here, and the surfaces ask. Pure and isomorphic —
 * no React and no server imports — because the builder, the publish preflight
 * and a test harness all need the same answer and only one of them can import
 * Payload. A second copy of "where does this live" is how a deployment gets
 * advertised at a URL that 404s.
 *
 * The host is DERIVED and VERIFIED rather than assumed: it comes from the
 * brand's real Domain rows filtered through the one eligibility contract
 * (`domain-eligibility.ts`), so a URL this module prints is a URL the public
 * router will answer for. When nothing is eligible it says so instead of
 * inventing a hostname, which is the failure the hardcoded fallback hid.
 */
import { domainEligibility, type DomainLike } from './domain-eligibility'
import { normalizeDeploymentPath } from './quiz-deployment-path'

/**
 * The domain shape the builders carry on `brand.__domains` (see brand-map.ts).
 * Camel-cased, unlike the Payload row, which is why the adapter below exists
 * rather than every caller remembering to rename one field.
 */
export type BrandDomain = {
  id?: string
  host: string
  primary?: boolean
  status?: string
  sslStatus?: string
  kind?: string
}

/** Bridge the builder's camelCase domain onto the eligibility contract's row shape. */
export const toDomainLike = (d: BrandDomain): DomainLike => ({
  host: d.host,
  kind: d.kind ?? null,
  status: d.status ?? null,
  ssl_status: d.sslStatus ?? null,
  primary: d.primary ?? false,
})

export type HostSource =
  /** The deployment names this domain explicitly. */
  | 'bound'
  /** No explicit domain: the brand's primary eligible host. */
  | 'brand-primary'
  /** No explicit domain and no eligible primary: the brand's preview host. */
  | 'brand-preview'
  /** Nothing the brand owns can serve. */
  | 'none'

export type EffectiveUrl = {
  /** The host a visitor actually reaches this on. Empty when none can serve. */
  host: string
  /** The path, normalized the way the public resolver normalizes it. */
  path: string
  /** `https://host/path`, or '' when there is no servable host. */
  url: string
  hostSource: HostSource
  /** True when the host is a preview host rather than a custom domain. */
  isPreview: boolean
  /**
   * True when the host serves today but has no verified certificate. Preview
   * hosts are deliberately allowed to (see PREVIEW_REQUIRES_SSL); a caller
   * should SAY so rather than imply a check that did not happen.
   */
  certificateUnverified: boolean
  /** Operator-facing reason there is no URL. Empty when there is one. */
  problem: string
}

const isPreviewDomain = (d: BrandDomain): boolean => d.kind === 'preview'

/**
 * The host this deployment is reached on, and why.
 *
 * `boundHost` wins when it is set AND still eligible: a deployment pinned to a
 * domain is pinned to it, and if that domain has stopped being servable the
 * honest answer is the problem, not a quiet fallback to some other host the
 * operator did not choose. A deployment with NO bound domain is reachable on
 * every host the Site owns — that is the router's actual behaviour — so the
 * canonical one is shown: primary first, then any eligible custom domain, then
 * the preview host.
 */
export const effectiveDeploymentUrl = (input: {
  /** The host stored on the deployment, when it names one. */
  boundHost?: string | null
  /** Every domain the brand owns. */
  brandDomains?: BrandDomain[] | null
  path?: string | null
}): EffectiveUrl => {
  const path = normalizeDeploymentPath(input.path)
  const domains = (input.brandDomains ?? []).filter((d) => d && typeof d.host === 'string' && d.host)

  const eligible = domains.filter((d) => domainEligibility(toDomainLike(d)).eligible)

  const build = (d: BrandDomain, hostSource: HostSource): EffectiveUrl => {
    const e = domainEligibility(toDomainLike(d))
    return {
      host: d.host,
      path,
      // '/' is the Site's home page; appending it would print a trailing slash
      // the router normalizes away, so the two would not compare equal.
      url: `https://${d.host}${path === '/' ? '' : path}`,
      hostSource,
      isPreview: isPreviewDomain(d),
      certificateUnverified: e.eligible ? e.previewUnverified : false,
      problem: '',
    }
  }

  const bound = (input.boundHost ?? '').trim().toLowerCase()
  if (bound) {
    const match = domains.find((d) => d.host.toLowerCase() === bound)
    if (!match) {
      return {
        host: bound,
        path,
        url: `https://${bound}${path === '/' ? '' : path}`,
        hostSource: 'bound',
        isPreview: false,
        certificateUnverified: false,
        problem: 'this domain is not one this brand owns',
      }
    }
    const e = domainEligibility(toDomainLike(match))
    if (!e.eligible) return { ...build(match, 'bound'), problem: e.reason }
    return build(match, 'bound')
  }

  const primary = eligible.find((d) => d.primary && !isPreviewDomain(d))
  if (primary) return build(primary, 'brand-primary')

  const custom = eligible.find((d) => !isPreviewDomain(d))
  if (custom) return build(custom, 'brand-primary')

  const preview = eligible.find((d) => isPreviewDomain(d)) ?? eligible[0]
  if (preview) return build(preview, 'brand-preview')

  return {
    host: '',
    path,
    url: '',
    hostSource: 'none',
    isPreview: false,
    certificateUnverified: false,
    problem:
      domains.length === 0
        ? 'this brand has no domains yet'
        : 'none of this brand’s domains can serve traffic yet',
  }
}

/**
 * What to print when there is nowhere to serve from.
 *
 * A single place so the editor, the list and the preview button do not each
 * invent their own phrasing for the same state.
 */
export const NO_SERVABLE_HOST_LABEL = 'No servable domain yet'

/** The URL to display, or the standing label when there is none. */
export const displayDeploymentUrl = (u: EffectiveUrl): string => u.url || NO_SERVABLE_HOST_LABEL
