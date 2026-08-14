/**
 * SAVED and PUBLISHED are two different facts, and `status` only knows one.
 *
 * A deployment row carries `status: draft | live | paused`, which answers "is
 * this serving". It cannot answer "is what is saved here the thing that passed
 * the publish gate", and the product needed that answer in two places:
 *
 *   - a publish attempt that the preflight REFUSES still saved the operator's
 *     edits (deliberately — losing work to make a point is worse). The row is
 *     then a draft holding changes nobody has approved, and the only honest
 *     thing to show is "saved, not published";
 *   - a row that is already LIVE keeps serving through content edits, by
 *     design: editing is not publishing, and re-gating every keystroke would
 *     make the gate the thing operators route around. But those edits reached
 *     the public page without ever passing a check, and nothing said so.
 *
 * WHY A FINGERPRINT AND NOT A TIMESTAMP COMPARISON. `updatedAt > published_at`
 * looks like the same question and is not: the publish itself is an UPDATE, so
 * the two stamps land microseconds apart and the comparison needs a tolerance
 * that is wrong at both ends — too tight and every freshly published row reads
 * as stale, too loose and a real edit inside the window reads as verified. A
 * digest of the fields that actually matter has no clock in it: equal means the
 * saved row IS the row that passed, and that cannot drift.
 *
 * WHAT IS FINGERPRINTED: everything a visitor sees or the preflight inspects.
 * `name` is excluded because it is an internal label, `status` because it is
 * the other axis, and the timestamps because they are not content. Adding a
 * field to the deployment means adding it here, or renaming a destination will
 * silently keep reading as verified.
 *
 * SERVER ONLY. `node:crypto` is imported directly, so this module must never be
 * pulled into a client bundle. The surfaces that need the answer are handed the
 * derived booleans (see `lpPublishState`), not the hasher.
 */
import { createHash } from 'node:crypto'

/** Field names on the `funnel_lp_deployments` row, in a fixed order. */
const LP_FINGERPRINTED_FIELDS = [
  'landing_page',
  'site',
  'domain',
  'path',
  'quiz',
  'quiz_deployment_id',
  'embedded_quiz_template_id',
  'embedded_progress_form',
  'content_overrides',
  'destination_overrides',
  'utm',
  'pixels',
] as const

/**
 * JSON with object keys in a fixed order, at every depth.
 *
 * `JSON.stringify` preserves insertion order, so `{a:1,b:2}` and `{b:2,a:1}`
 * serialise differently while being the same config. A save that rewrites a
 * jsonb bag in a different key order would otherwise read as an edit.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    // Undefined members are absent members: `{a: undefined}` and `{}` are the
    // same row once Postgres has seen them.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/**
 * A relationship reads back as a number, a string or a populated document
 * depending on `depth` and on which door wrote it. All three mean one row, so
 * all three must hash the same or a re-read would look like an edit.
 */
const fingerprintValue = (v: unknown): unknown => {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && 'id' in (v as Record<string, unknown>)) {
    return String((v as { id: unknown }).id)
  }
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  // '' and null both mean "not set" on the text columns here.
  if (typeof v === 'string') return v === '' ? null : v
  return v
}

/** The digest of one landing-page deployment's publish-relevant state. */
export const lpDeploymentFingerprint = (row: Record<string, unknown>): string => {
  const subject: Record<string, unknown> = {}
  for (const field of LP_FINGERPRINTED_FIELDS) subject[field] = fingerprintValue(row[field])
  return createHash('sha256').update(stableStringify(subject)).digest('hex').slice(0, 32)
}

/**
 * What the admin surfaces are told about a row's publication.
 *
 * Booleans and one date, never the digest: the client has no use for the hash
 * and shipping it would invite a second implementation of the comparison.
 */
export type PublishState = {
  /** This row has passed the publish gate at least once. */
  everPublished: boolean
  /** When it last did. ISO, or null if it never has. */
  lastPublishedAt: string | null
  /**
   * The saved row is not the row that passed. TRUE for a draft holding refused
   * edits AND for a live page serving changes that were never checked; the two
   * are told apart by `status`, which the caller already has.
   */
  unverifiedChanges: boolean
}

export const lpPublishState = (row: Record<string, unknown>): PublishState => {
  const stamp = row.last_published_at
  const lastPublishedAt =
    typeof stamp === 'string' && stamp ? stamp : stamp instanceof Date ? stamp.toISOString() : null
  const stored = typeof row.published_fingerprint === 'string' ? row.published_fingerprint : ''

  // Never published is not "changed since publish". A row nobody has ever
  // published has no verified state to differ from, and reporting one would put
  // an "edited since publish" warning on every brand-new draft.
  if (!lastPublishedAt || !stored) {
    return { everPublished: false, lastPublishedAt: null, unverifiedChanges: false }
  }
  return {
    everPublished: true,
    lastPublishedAt,
    unverifiedChanges: lpDeploymentFingerprint(row) !== stored,
  }
}
