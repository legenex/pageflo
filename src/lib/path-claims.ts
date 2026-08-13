/**
 * One answer to "who owns this URL", for every kind of thing that can own one.
 *
 * A Site serves four kinds of content at a path — `Pages`, site-scoped
 * `LandingPages`, funnel quiz deployments and funnel LP deployments — and until
 * now each decided path collisions differently or not at all. The public router
 * had a precedence order, `public-path-claims.ts` encoded part of it for the two
 * deployment resolvers, and the SAVE paths encoded none of it: two deployments
 * could be created on `/c/pain` with nothing said, and which one a visitor got
 * was decided by `docs[0]` — insertion order.
 *
 * Three rules, and each exists because its absence was a real failure:
 *
 *  1. ONE NORMALISATION. `/C/Pain/`, `/c/pain` and `c/pain` are the same URL to
 *     an operator pasting into an ad, and the resolver already matches them
 *     interchangeably. So they must COLLIDE at save time too; otherwise the
 *     product accepts two records it will then serve non-deterministically.
 *
 *  2. SCOPE IS PART OF THE CLAIM. A deployment bound to a domain claims that
 *     path on that host only; one with no domain claims it on every host the
 *     Site owns. Two claims conflict when their scopes can both apply to one
 *     request, which includes site-wide-versus-domain-specific — the resolver
 *     breaks that tie in favour of the domain match, but the site-wide record is
 *     still reachable on every OTHER host, so the pair is genuinely ambiguous
 *     rather than merely ordered.
 *
 *  3. THE SAME LOGIC ON SAVE, PUBLISH AND SERVE. A check that only runs on save
 *     is defeated by importing; one that only runs at serve time is a 404
 *     nobody can diagnose. `checkPathAvailable` is called by all three.
 *
 * PRECEDENCE, when a conflict exists anyway (legacy rows, a race): authored
 * content wins over deployments, and a domain-bound deployment wins over a
 * site-wide one. That is the router's existing behaviour written down rather
 * than changed, so this module can be introduced without moving any live page.
 */
import type { Payload } from 'payload'

import { normalizeDeploymentPath } from './quiz-deployment-path'
import { SHARED_TEMPLATE_PATHS } from './public-path-claims'

export type ClaimKind = 'page' | 'landing-page' | 'quiz-deployment' | 'lp-deployment' | 'shared-legal'

/**
 * Who beats whom when two records claim one URL.
 *
 * Lower is stronger. This is the public router's own order: it resolves a Page,
 * then a site-scoped LandingPage, then a shared legal template, then a quiz
 * deployment, then an LP deployment. Encoding it as data rather than as the
 * shape of an if-chain is what lets the save path and the serve path agree.
 */
export const CLAIM_PRECEDENCE: Record<ClaimKind, number> = {
  page: 0,
  'landing-page': 1,
  'shared-legal': 2,
  'quiz-deployment': 3,
  'lp-deployment': 4,
}

export type PathClaim = {
  kind: ClaimKind
  /** Record id. Empty for the built-in shared legal paths, which have no row. */
  id: string
  siteId: number
  /** null means the claim applies on every host the Site owns. */
  domainId: number | null
  /** The path exactly as stored, for an error message an operator recognises. */
  rawPath: string
  /** The comparison key. Case-folded, slash-normalised. */
  effectivePath: string
  /** False for a draft/paused record: it holds no claim until it is published. */
  live: boolean
  /** Human label for a conflict report. */
  label: string
}

/**
 * The canonical form of a path, for COMPARISON only.
 *
 * Lower-cased, which HTTP paths are not. That is deliberate and it is the
 * conservative direction: the public resolver already matches a stored path
 * case-insensitively (`pathVariantsFor` sends a lower-cased variant), so two
 * records differing only in case are already indistinguishable at serve time.
 * Treating them as distinct at save time would let the product accept a pair it
 * cannot then tell apart.
 *
 * Never use this to BUILD a URL — `normalizeDeploymentPath` is what a link uses,
 * and it preserves the case the operator chose.
 */
export const effectivePath = (raw: string | null | undefined): string =>
  normalizeDeploymentPath(raw).toLowerCase()

/** Does one claim's scope overlap another's, i.e. can one request match both? */
export const scopesOverlap = (a: PathClaim, b: PathClaim): boolean => {
  if (a.siteId !== b.siteId) return false
  // A site-wide claim is reachable on every host, so it overlaps everything.
  if (a.domainId === null || b.domainId === null) return true
  return a.domainId === b.domainId
}

export type PathConflict = {
  path: string
  /** The claim that wins under CLAIM_PRECEDENCE, so a report can say so. */
  winner: PathClaim
  losers: PathClaim[]
}

/**
 * Every set of live claims that fight over one URL.
 *
 * Draft records are excluded rather than reported: an unpublished deployment
 * parked on a path somebody else is using is a normal working state, and
 * flagging it would make the check something operators route around. It is
 * caught at PUBLISH instead, which is the moment it starts to matter.
 */
export const findConflicts = (claims: PathClaim[]): PathConflict[] => {
  const live = claims.filter((c) => c.live)
  const byPath = new Map<string, PathClaim[]>()
  for (const c of live) {
    const key = `${c.siteId}::${c.effectivePath}`
    const list = byPath.get(key)
    if (list) list.push(c)
    else byPath.set(key, [c])
  }

  const out: PathConflict[] = []
  for (const group of byPath.values()) {
    if (group.length < 2) continue
    // Within a path, only claims whose SCOPES overlap actually collide: two
    // deployments on the same path bound to two different domains are two
    // different URLs and are entirely legitimate.
    const colliding = group.filter((a) => group.some((b) => a !== b && scopesOverlap(a, b)))
    if (colliding.length < 2) continue
    const sorted = [...colliding].sort(
      (a, b) =>
        CLAIM_PRECEDENCE[a.kind] - CLAIM_PRECEDENCE[b.kind] ||
        // A domain-bound claim beats a site-wide one of the same kind, which is
        // the router's tie-break.
        (a.domainId === null ? 1 : 0) - (b.domainId === null ? 1 : 0) ||
        a.id.localeCompare(b.id),
    )
    out.push({ path: sorted[0].effectivePath, winner: sorted[0], losers: sorted.slice(1) })
  }
  return out
}

/* ------------------------------------------------------------------ loading */

const relId = (v: unknown): number | null => {
  if (v == null) return null
  const raw = typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Every claim a Site holds, from all five sources.
 *
 * `overrideAccess: true` throughout and deliberately: this answers a question
 * about the SITE, not about the caller, and a caller who can see only some of
 * the Site's content would be told a path is free when it is not. Every caller
 * has already been authorized against the Site by the time it gets here.
 */
export const collectSiteClaims = async (payload: Payload, siteId: number): Promise<PathClaim[]> => {
  const claims: PathClaim[] = []
  const nowIso = new Date().toISOString()

  const safeFind = async (collection: string, where: unknown, limit = 500): Promise<Array<Record<string, unknown>>> => {
    try {
      const res = await payload.find({ collection: collection as never, where: where as never, limit, depth: 0, overrideAccess: true })
      return res.docs as unknown as Array<Record<string, unknown>>
    } catch {
      // The funnel_* tables may be absent on a database the migration has not
      // reached. A missing table must not turn "is this path free" into a 500.
      return []
    }
  }

  for (const p of SHARED_TEMPLATE_PATHS) {
    claims.push({
      kind: 'shared-legal',
      id: '',
      siteId,
      domainId: null,
      rawPath: p,
      effectivePath: effectivePath(p),
      live: true,
      label: `the shared legal page at ${p}`,
    })
  }

  for (const d of await safeFind('pages', { site: { equals: siteId } })) {
    claims.push({
      kind: 'page',
      id: String(d.id),
      siteId,
      domainId: null,
      rawPath: str(d.slug),
      effectivePath: effectivePath(str(d.slug)),
      // Mirrors the router's own visibility rule: a scheduled page whose time
      // has come is live, one whose time has not is not.
      live:
        d.status === 'published' ||
        (d.status === 'scheduled' && typeof d.publish_at === 'string' && d.publish_at <= nowIso),
      label: `the page "${str(d.title) || str(d.slug)}"`,
    })
  }

  for (const d of await safeFind('landing-pages', { site: { equals: siteId } })) {
    claims.push({
      kind: 'landing-page',
      id: String(d.id),
      siteId,
      domainId: null,
      rawPath: str(d.slug),
      effectivePath: effectivePath(str(d.slug)),
      live: d.status === 'published',
      label: `the landing page "${str(d.title) || str(d.slug)}"`,
    })
  }

  for (const d of await safeFind('funnel-quiz-deployments', { site: { equals: siteId } })) {
    claims.push({
      kind: 'quiz-deployment',
      id: String(d.id),
      siteId,
      domainId: relId(d.domain),
      rawPath: str(d.path),
      effectivePath: effectivePath(str(d.path)),
      live: d.status === 'live',
      label: `the quiz deployment "${str(d.name) || d.id}"`,
    })
  }

  for (const d of await safeFind('funnel-lp-deployments', { site: { equals: siteId } })) {
    claims.push({
      kind: 'lp-deployment',
      id: String(d.id),
      siteId,
      domainId: relId(d.domain),
      rawPath: str(d.path),
      effectivePath: effectivePath(str(d.path)),
      live: d.status === 'live',
      label: `the landing-page deployment "${str(d.name) || d.id}"`,
    })
  }

  return claims
}

/* ---------------------------------------------------------------- the check */

export type PathAvailability =
  | { ok: true; effectivePath: string }
  | { ok: false; error: string; conflictsWith: PathClaim[] }

export type PathRequest = {
  siteId: number
  domainId: number | null
  path: string
  kind: ClaimKind
  /** The record being saved, so it does not conflict with itself. */
  excludeId?: string
  /**
   * Whether the record WILL be live. A draft may sit anywhere; publishing is
   * where the claim is actually taken, which is why publish re-runs this.
   */
  live: boolean
}

/** The root belongs to the Site's home page and is never a deployment path. */
const RESERVED = new Set(['/'])

export const checkPathAvailable = async (
  payload: Payload,
  req: PathRequest,
): Promise<PathAvailability> => {
  const path = effectivePath(req.path)

  if (path === '' || path === '/') {
    return { ok: false, error: 'a deployment needs a path; "/" belongs to the site\'s home page', conflictsWith: [] }
  }
  if (RESERVED.has(path)) {
    return { ok: false, error: `"${path}" is reserved`, conflictsWith: [] }
  }
  if (!/^\/[\w\-./]*$/.test(path)) {
    // Refused rather than escaped: a path with a space or a query string in it
    // is a mistake at the point it is typed, and accepting it produces a URL
    // that works in one place and not another.
    return { ok: false, error: `"${req.path}" is not a valid path`, conflictsWith: [] }
  }

  // A draft takes no claim, so nothing can conflict with it yet.
  if (!req.live) return { ok: true, effectivePath: path }

  const candidate: PathClaim = {
    kind: req.kind,
    id: req.excludeId ?? '__new__',
    siteId: req.siteId,
    domainId: req.domainId,
    rawPath: req.path,
    effectivePath: path,
    live: true,
    label: 'this record',
  }

  const existing = (await collectSiteClaims(payload, req.siteId)).filter(
    (c) => !(c.kind === req.kind && req.excludeId && c.id === req.excludeId),
  )

  const clashes = existing.filter(
    (c) => c.live && c.effectivePath === path && scopesOverlap(c, candidate),
  )
  if (clashes.length === 0) return { ok: true, effectivePath: path }

  const first = clashes[0]
  const sameSpelling = first.rawPath.trim() === req.path.trim()
  return {
    ok: false,
    // Naming the difference matters: "/C/Pain is taken" reads as a bug when the
    // operator can see "/c/pain" in the list and thinks they are different URLs.
    error: sameSpelling
      ? `"${normalizeDeploymentPath(req.path)}" is already served by ${first.label}`
      : `"${normalizeDeploymentPath(req.path)}" collides with "${first.rawPath}" (${first.label}) — paths are compared without case or a trailing slash, because that is how they are matched when a visitor arrives`,
    conflictsWith: clashes,
  }
}
