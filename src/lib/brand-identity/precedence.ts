/**
 * Precedence, merge, diff and locks.
 *
 * The single rule this file exists to make structural: a lower-authority source
 * can never beat a higher-authority one, and a human's pinned value can never
 * be overwritten by a machine without somebody being told.
 *
 * Two design choices carry that:
 *
 *  1. A CONTRIBUTION CANNOT NAME ITS OWN RANK. It names its `kind`, and rank is
 *     looked up from SOURCE_KIND_PRIORITY. An image extractor cannot claim to
 *     be a brand document, because there is nowhere to put the claim.
 *
 *  2. THE MERGE DOES NOT MUTATE. It takes the current profile plus a bag of
 *     contributions and returns `{ profile, diff, conflicts, rejected }`. A
 *     mutating merge makes "what changed" something you have to reconstruct
 *     afterwards, and reconstructed answers are the ones that go stale.
 */

import {
  BRAND_FIELD_PATHS,
  BrandProfileSchema,
  FIELD_SCHEMAS,
  getFieldValue,
  isBrandFieldPath,
  setFieldValue,
  type BrandFieldPath,
  type BrandFieldValue,
  type BrandProfile,
  type BrandSourceKind,
  type BrandSourceRecord,
  type FieldProvenance,
} from './profile'

/* -------------------------------------------------------------------------- */
/*                                 Priorities                                  */
/* -------------------------------------------------------------------------- */

/**
 * Highest authority first. Lower number wins.
 *
 * The order is a statement about EVIDENCE, not about convenience:
 * a human who pinned a value outranks a document, a document the brand wrote
 * outranks a repository we inferred it from, a repository outranks a rendered
 * page we measured, a measurement outranks a guess from a picture, a picture
 * outranks prose, prose outranks a model, and a model outranks the neutral
 * shape a preview needs to render at all.
 */
export const SOURCE_PRIORITY = {
  manual_lock: 1,
  brand_document: 2,
  repository: 3,
  website: 4,
  image: 5,
  brief: 6,
  ai_gap_fill: 7,
  neutral_fallback: 8,
} as const

export type SourcePriorityName = keyof typeof SOURCE_PRIORITY
export type SourcePriority = (typeof SOURCE_PRIORITY)[SourcePriorityName]

/** Human words for a report. */
export const PRIORITY_LABEL: Record<SourcePriority, string> = {
  1: 'pinned by a person',
  2: 'stated in a brand document',
  3: 'read from the brand’s repository',
  4: 'measured on the brand’s website',
  5: 'inferred from an image',
  6: 'written in a brief',
  7: 'filled in by the model',
  8: 'neutral preview fallback',
}

/**
 * Rank per source kind. THE lookup - a contribution never carries a priority.
 *
 * `pdf_document` and `docx_document` rank as brand documents because that is
 * what they are; they are refused at the adapter for lack of a parser we trust,
 * not demoted here. Ranking them honestly means the day a parser lands, nothing
 * about precedence has to change.
 */
export const SOURCE_KIND_PRIORITY: Record<BrandSourceKind, SourcePriority> = {
  manual: SOURCE_PRIORITY.manual_lock,
  brand_document: SOURCE_PRIORITY.brand_document,
  design_tokens: SOURCE_PRIORITY.brand_document,
  pdf_document: SOURCE_PRIORITY.brand_document,
  docx_document: SOURCE_PRIORITY.brand_document,
  repository: SOURCE_PRIORITY.repository,
  website: SOURCE_PRIORITY.website,
  image: SOURCE_PRIORITY.image,
  brief: SOURCE_PRIORITY.brief,
  ai_gap_fill: SOURCE_PRIORITY.ai_gap_fill,
  neutral_fallback: SOURCE_PRIORITY.neutral_fallback,
}

/** Which kinds this build can actually read. */
export const SOURCE_KIND_SUPPORT: Record<BrandSourceKind, 'supported' | 'unsupported'> = {
  manual: 'supported',
  brand_document: 'supported',
  design_tokens: 'supported',
  pdf_document: 'unsupported',
  docx_document: 'unsupported',
  repository: 'supported',
  website: 'supported',
  image: 'supported',
  brief: 'supported',
  ai_gap_fill: 'supported',
  neutral_fallback: 'supported',
}

export const priorityOf = (kind: BrandSourceKind): SourcePriority => SOURCE_KIND_PRIORITY[kind]

/* -------------------------------------------------------------------------- */
/*                               Contributions                                 */
/* -------------------------------------------------------------------------- */

export type FieldContribution = {
  field: BrandFieldPath
  value: BrandFieldValue
  /** Rank is derived from this. There is deliberately no `priority` here. */
  kind: BrandSourceKind
  sourceId: string
  /** 0..1. Used only to break ties WITHIN one priority. */
  confidence: number
  /** Short words naming where in the source the value was found. */
  evidence: string
}

export type FieldDiff = {
  field: BrandFieldPath
  before: BrandFieldValue
  after: BrandFieldValue
  changed: boolean
  source: { sourceId: string; kind: BrandSourceKind; priority: SourcePriority } | null
  /** True when a human's pin was replaced by another human decision. */
  overrodeLock: boolean
}

export type LockConflict = {
  field: BrandFieldPath
  lockedValue: BrandFieldValue
  proposedValue: BrandFieldValue
  sourceId: string
  kind: BrandSourceKind
  priority: SourcePriority
  reason: string
}

export type RejectedContribution = {
  field: string
  sourceId: string
  kind: BrandSourceKind
  reason: string
}

export type MergeResult = {
  profile: BrandProfile
  diff: FieldDiff[]
  conflicts: LockConflict[]
  rejected: RejectedContribution[]
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                    */
/* -------------------------------------------------------------------------- */

/** Order-sensitive equality. A vocabulary list's order is a decision. */
export const sameFieldValue = (a: BrandFieldValue, b: BrandFieldValue): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => x === b[i])
  }
  return a === b
}

/**
 * Does this value say anything?
 *
 * A source that found nothing must not be able to erase a value that another
 * source found, so an empty contribution is dropped rather than merged. The one
 * exception is a person: clearing a field is a legitimate human action, and
 * refusing it would make a wrong value unfixable through the same door it came
 * in by.
 */
const carriesValue = (value: BrandFieldValue): boolean => {
  if (value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

const isBrandFieldValueShape = (v: unknown): v is BrandFieldValue =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'number' ||
  (Array.isArray(v) && v.every((x) => typeof x === 'string'))

/**
 * Validate one contribution through the SAME schema the profile uses for that
 * leaf, returning the normalised (trimmed) value. Anything else is rejected
 * with a reason, so a hostile or buggy adapter cannot make the profile invalid.
 */
const validateContribution = (
  c: FieldContribution,
): { ok: true; value: BrandFieldValue } | { ok: false; reason: string } => {
  const schema = FIELD_SCHEMAS[c.field]
  if (!schema) return { ok: false, reason: `"${c.field}" is not a brand profile field` }
  const parsed = schema.safeParse(c.value)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((i) => i.message).join('; ').slice(0, 200) }
  }
  if (!isBrandFieldValueShape(parsed.data)) {
    return { ok: false, reason: 'the value is not a string, number, list of strings or null' }
  }
  return { ok: true, value: parsed.data }
}

/* -------------------------------------------------------------------------- */
/*                                    Locks                                    */
/* -------------------------------------------------------------------------- */

export const isFieldLocked = (profile: BrandProfile, field: BrandFieldPath): boolean =>
  profile.meta.locks.includes(field)

/** Returns a NEW profile with the given fields pinned. Idempotent. */
export const lockFields = (profile: BrandProfile, fields: readonly BrandFieldPath[]): BrandProfile => {
  const next = structuredClone(profile)
  const set = new Set(next.meta.locks)
  for (const f of fields) set.add(f)
  next.meta.locks = BRAND_FIELD_PATHS.filter((f) => set.has(f))
  return next
}

/** Returns a NEW profile with the given fields unpinned. Idempotent. */
export const unlockFields = (profile: BrandProfile, fields: readonly BrandFieldPath[]): BrandProfile => {
  const next = structuredClone(profile)
  const drop = new Set<BrandFieldPath>(fields)
  next.meta.locks = next.meta.locks.filter((f) => !drop.has(f))
  return next
}

/* -------------------------------------------------------------------------- */
/*                                   Merge                                     */
/* -------------------------------------------------------------------------- */

type Candidate = {
  contribution: FieldContribution
  value: BrandFieldValue
  priority: SourcePriority
  /** Position in the input, so ties resolve stably rather than by sort luck. */
  order: number
}

/**
 * Merge contributions onto a profile.
 *
 * Winner selection, in order: lowest priority number, then highest confidence,
 * then earliest contributed. Confidence NEVER crosses a priority boundary - a
 * 0.99-confidence image inference still loses to a 0.30-confidence brand
 * document, because the ranking is about who is entitled to decide, not about
 * how sure the loser feels.
 */
export const mergeContributions = (input: {
  base: BrandProfile
  contributions: readonly FieldContribution[]
  sources?: readonly BrandSourceRecord[]
  now: string
}): MergeResult => {
  const draft = structuredClone(input.base)
  const diff: FieldDiff[] = []
  const conflicts: LockConflict[] = []
  const rejected: RejectedContribution[] = []

  const byField = new Map<BrandFieldPath, Candidate[]>()

  input.contributions.forEach((c, order) => {
    if (!isBrandFieldPath(c.field)) {
      rejected.push({ field: String(c.field), sourceId: c.sourceId, kind: c.kind, reason: 'not a brand profile field' })
      return
    }
    const checked = validateContribution(c)
    if (!checked.ok) {
      rejected.push({ field: c.field, sourceId: c.sourceId, kind: c.kind, reason: checked.reason })
      return
    }
    // A machine that found nothing must not erase what another source found.
    // A person clearing a field is a decision, and is allowed through.
    if (!carriesValue(checked.value) && c.kind !== 'manual') {
      rejected.push({
        field: c.field,
        sourceId: c.sourceId,
        kind: c.kind,
        reason: 'empty value from a non-human source; an empty read never overwrites a found value',
      })
      return
    }
    const list = byField.get(c.field) ?? []
    list.push({ contribution: c, value: checked.value, priority: priorityOf(c.kind), order })
    byField.set(c.field, list)
  })

  /** How many fields each source actually won, for the source record. */
  const wins = new Map<string, number>()

  for (const field of BRAND_FIELD_PATHS) {
    const candidates = byField.get(field)
    if (!candidates || candidates.length === 0) continue

    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        b.contribution.confidence - a.contribution.confidence ||
        a.order - b.order,
    )

    const before = getFieldValue(draft, field)
    const locked = isFieldLocked(draft, field)

    if (locked) {
      // Only another human decision may move a pinned value. Everything else
      // that disagrees is REPORTED - not silently kept, not silently applied.
      const human = candidates.find((c) => c.contribution.kind === 'manual')
      for (const c of candidates) {
        if (c.contribution.kind === 'manual') continue
        if (sameFieldValue(c.value, before)) continue
        conflicts.push({
          field,
          lockedValue: before,
          proposedValue: c.value,
          sourceId: c.contribution.sourceId,
          kind: c.contribution.kind,
          priority: c.priority,
          reason: `"${field}" is pinned to a value a person chose. ${
            PRIORITY_LABEL[c.priority]
          } disagrees (${c.contribution.evidence}). Unpin the field to accept it.`,
        })
      }
      if (!human) continue

      const after = human.value
      const changed = !sameFieldValue(before, after)
      if (changed) {
        setFieldValue(draft, field, after)
        draft.meta.provenance[field] = provenanceFor(human, input.now)
        wins.set(human.contribution.sourceId, (wins.get(human.contribution.sourceId) ?? 0) + 1)
      }
      diff.push({
        field,
        before,
        after,
        changed,
        source: {
          sourceId: human.contribution.sourceId,
          kind: human.contribution.kind,
          priority: human.priority,
        },
        overrodeLock: changed,
      })
      continue
    }

    const winner = candidates[0]

    // Precedence is judged against WHAT ALREADY HOLDS THE FIELD, not only
    // against the other contributions in this batch.
    //
    // This is the case a refresh makes and a first build never does: the brand
    // document set the tagline last month and today only the website was
    // re-read, so the website is the sole contribution and would win by default
    // - quietly replacing a stronger source that is not in the room. The stored
    // provenance is what keeps the incumbent's rank present when the source
    // itself is not. A re-read at the SAME rank is allowed through, because a
    // fresher reading from the same authority is the point of a refresh.
    const incumbent = draft.meta.provenance[field]
    if (incumbent && winner.priority > incumbent.priority) {
      diff.push({
        field,
        before,
        after: before,
        changed: false,
        source: { sourceId: incumbent.sourceId, kind: incumbent.kind, priority: incumbent.priority as SourcePriority },
        overrodeLock: false,
      })
      continue
    }

    const after = winner.value
    const changed = !sameFieldValue(before, after)
    if (changed) setFieldValue(draft, field, after)
    // Provenance is written even when the value did not change: "the website
    // now corroborates what the document said" is information, and leaving the
    // old provenance would make a re-read look like it never happened.
    draft.meta.provenance[field] = provenanceFor(winner, input.now)
    wins.set(winner.contribution.sourceId, (wins.get(winner.contribution.sourceId) ?? 0) + 1)

    diff.push({
      field,
      before,
      after,
      changed,
      source: {
        sourceId: winner.contribution.sourceId,
        kind: winner.contribution.kind,
        priority: winner.priority,
      },
      overrodeLock: false,
    })
  }

  // Source records: replace by id so a refresh updates health in place rather
  // than growing a second entry for the same source every run.
  if (input.sources && input.sources.length > 0) {
    const merged = new Map(draft.meta.sources.map((s) => [s.id, s]))
    for (const s of input.sources) {
      merged.set(s.id, { ...s, contributedFields: wins.get(s.id) ?? 0 })
    }
    draft.meta.sources = [...merged.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  }
  draft.meta.lastExtractedAt = input.now

  const parsed = BrandProfileSchema.safeParse(draft)
  if (!parsed.success) {
    // Every value was already validated against its own leaf schema, so getting
    // here means FIELD_SCHEMAS and BrandProfileSchema have drifted apart. That
    // is a contract bug, and it should be loud rather than half-applied.
    throw new Error(
      `Brand profile merge produced an invalid profile - FIELD_SCHEMAS and BrandProfileSchema disagree: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    )
  }

  return { profile: parsed.data, diff, conflicts, rejected }
}

const provenanceFor = (c: Candidate, now: string): FieldProvenance => ({
  sourceId: c.contribution.sourceId,
  kind: c.contribution.kind,
  priority: c.priority,
  confidence: Math.max(0, Math.min(1, c.contribution.confidence)),
  extractedAt: now,
})

/* -------------------------------------------------------------------------- */
/*                                    Diff                                     */
/* -------------------------------------------------------------------------- */

/**
 * The diff a refresh reports: before, after, whether it changed, and who won.
 *
 * Computed from the two profiles rather than stitched together from the merges
 * that produced them. A stitched diff has to be kept in step with the number of
 * merge passes, and it stops being true the first time somebody adds a pass.
 *
 * `considered` narrows the report to fields some source actually spoke about,
 * so a refresh that touched two fields does not print seventy rows.
 */
export const diffProfiles = (
  before: BrandProfile,
  after: BrandProfile,
  considered?: ReadonlySet<BrandFieldPath>,
): FieldDiff[] => {
  const out: FieldDiff[] = []
  for (const field of BRAND_FIELD_PATHS) {
    const b = getFieldValue(before, field)
    const a = getFieldValue(after, field)
    const changed = !sameFieldValue(b, a)
    // An unchanged field is reported only when a source actually spoke about
    // it. Without a considered set, a diff of two identical profiles is empty
    // rather than seventy rows of "no".
    if (!changed && !considered?.has(field)) continue
    const prov = after.meta.provenance[field]
    out.push({
      field,
      before: b,
      after: a,
      changed,
      source: prov ? { sourceId: prov.sourceId, kind: prov.kind, priority: prov.priority as SourcePriority } : null,
      overrodeLock: changed && before.meta.locks.includes(field),
    })
  }
  return out
}

/** Fields still unsourced, or sourced only at or below `atOrBelow`. */
export const fieldsNeedingSource = (
  profile: BrandProfile,
  candidates: readonly BrandFieldPath[],
  atOrBelow: SourcePriority,
): BrandFieldPath[] =>
  candidates.filter((f) => {
    const prov = profile.meta.provenance[f]
    return !prov || prov.priority >= atOrBelow
  })
