/**
 * One answer to "may this domain serve traffic", for every surface that asks.
 *
 * Four places decided this independently and disagreed:
 *
 *   src/lib/site-resolver.ts          no filter at all — a `pending` or `error`
 *                                     domain was served the moment its row had a
 *                                     Site.
 *   quiz builder picker               status active AND ssl active. Correct, and
 *                                     the only one that was.
 *   landing-page builder picker       brand filter only; `provisioning` and
 *                                     `error` offered as normal options.
 *   advertorial builder picker        no filter, and deliberately appends every
 *                                     OTHER brand's domains.
 *
 * A rule with four implementations has no implementation. This module is the
 * rule; the surfaces call it and render the reason.
 *
 * ── On preview domains ────────────────────────────────────────────────────────
 *
 * A preview row is created with `status: 'active'` and nothing verified
 * (`admin/(top)/sites/actions.ts`), while its `ssl_status` is left `unknown`,
 * which is honest. So the two fields disagree, and the disagreement is not
 * cosmetic: holding preview domains to the same "SSL active" bar as custom
 * domains would 404 every existing preview host, because no preview host has
 * ever been through certificate issuance.
 *
 * The split below is therefore deliberate and temporary:
 *
 *   custom  → status active AND ssl_status active. This is the real fix; a
 *             half-provisioned custom domain must not be served.
 *   preview → status active. Weaker, and marked as such by `previewUnverified`
 *             so a caller can say so on screen instead of implying a check that
 *             did not happen.
 *
 * Closing that gap needs preview hosts provisioned through the same path custom
 * domains use — DNS, ACME, nginx, a real HTTPS handshake — which is server work.
 * `PREVIEW_REQUIRES_SSL` is the switch to flip once that is true, and the tests
 * pin both sides of it so flipping it cannot silently change something else.
 */

/**
 * Flip to `true` once preview hosts are issued real certificates. Until then a
 * preview domain is servable on `status` alone. Not an env var on purpose: this
 * is a statement about what the infrastructure does, and it should change in a
 * commit that can be reviewed, not per-environment where prod and dev can
 * disagree about what "active" means.
 */
export const PREVIEW_REQUIRES_SSL = false

export type DomainKind = 'preview' | 'custom'

/** The subset of a Domain row any of this depends on. */
export type DomainLike = {
  host?: string | null
  kind?: string | null
  status?: string | null
  ssl_status?: string | null
  primary?: boolean | null
  site?: unknown
}

export type Eligibility =
  | { eligible: true; previewUnverified: boolean }
  | { eligible: false; reason: string }

const kindOf = (d: DomainLike): DomainKind => (d.kind === 'preview' ? 'preview' : 'custom')

/**
 * Why a domain cannot serve, in words an operator can act on.
 *
 * The status is named rather than summarised: "not ready" tells somebody
 * something is wrong and nothing about what to open.
 */
const explain = (d: DomainLike): string => {
  const status = d.status ?? 'unknown'
  const ssl = d.ssl_status ?? 'unknown'
  if (status === 'pending') return 'DNS has not been verified yet'
  if (status === 'provisioning') return 'still being provisioned'
  if (status === 'error') return 'provisioning failed'
  if (status === 'verified') return 'DNS verified, but no certificate has been issued yet'
  if (status !== 'active') return `status is ${status}`
  if (ssl === 'pending') return 'certificate has not been issued yet'
  if (ssl === 'error') return 'certificate issuance failed'
  return `certificate status is ${ssl}`
}

/**
 * May this domain be served to the public?
 *
 * A domain with no Site is never servable regardless of status: an unassigned
 * pool row must 404, not resolve to whoever happens to be first.
 */
export const domainEligibility = (d: DomainLike | null | undefined): Eligibility => {
  if (!d) return { eligible: false, reason: 'domain not found' }
  if (!d.host) return { eligible: false, reason: 'domain has no host' }

  const status = d.status ?? 'unknown'
  if (status !== 'active') return { eligible: false, reason: explain(d) }

  const ssl = d.ssl_status ?? 'unknown'
  if (kindOf(d) === 'preview') {
    if (!PREVIEW_REQUIRES_SSL) {
      return { eligible: true, previewUnverified: ssl !== 'active' }
    }
    if (ssl !== 'active') return { eligible: false, reason: explain(d) }
    return { eligible: true, previewUnverified: false }
  }

  if (ssl !== 'active') return { eligible: false, reason: explain(d) }
  return { eligible: true, previewUnverified: false }
}

/** Convenience predicate for query filters and pickers. */
export const isDomainServable = (d: DomainLike | null | undefined): boolean => domainEligibility(d).eligible

/**
 * May this domain be selected as the target of a deployment?
 *
 * Identical to servability by design. A deployment pointed at a domain that
 * cannot serve is a page that 404s with no indication why, so the picker and the
 * router must not be able to drift apart.
 */
export const isDomainSelectable = (d: DomainLike | null | undefined): boolean => isDomainServable(d)

/**
 * May this domain be promoted to primary?
 *
 * Stricter than servable: primary decides the canonical host every generated
 * link and 301 points at, so a preview domain that has never had its certificate
 * verified may serve while it is the only option, but promoting a CUSTOM domain
 * over it requires the certificate to be real. A merely DNS-verified domain is
 * not eligible — that was the previous bar (`status !== 'active' && status !==
 * 'verified'`), and 'verified' means DNS resolved, not that anything is served.
 */
export const mayBecomePrimary = (d: DomainLike | null | undefined): Eligibility => {
  if (!d) return { eligible: false, reason: 'domain not found' }
  if (kindOf(d) === 'preview') return domainEligibility(d)
  const status = d.status ?? 'unknown'
  const ssl = d.ssl_status ?? 'unknown'
  if (status !== 'active' || ssl !== 'active') return { eligible: false, reason: explain(d) }
  return { eligible: true, previewUnverified: false }
}

/**
 * The label a picker should show, so a disabled option explains itself.
 * Ineligible domains are shown disabled rather than hidden — "why is my domain
 * not in the list" needs an answer on screen.
 */
export const domainOptionLabel = (d: DomainLike): string => {
  const e = domainEligibility(d)
  const primary = d.primary ? '  (primary)' : ''
  if (!e.eligible) return `${d.host ?? '(no host)'}${primary}  - ${e.reason}`
  if (e.previewUnverified) return `${d.host ?? ''}${primary}  (preview, certificate unverified)`
  return `${d.host ?? ''}${primary}`
}
