// @ts-nocheck -- the funnel-quiz-templates slug is not in the committed
// payload-types yet; run `pnpm generate:types` to restore typing.
/**
 * Templates as records: reading them, and materialising the stock libraries.
 *
 * This module is the seam the whole correction turns on. Every product surface
 * — both Templates lists, both deployment galleries, the previews and the
 * public renderer — asks this file what templates exist. Nothing asks
 * `listLpTemplates()` / `listQuizTemplates()` any more; those are the RENDERER
 * catalogue and are consulted only from in here, to answer "what draws this
 * row" and "which rows should exist".
 *
 * That single-direction dependency is the whole design:
 *
 *      product surfaces  ->  template records (DB)  ->  template registry (code)
 *
 * A surface that reached past the middle box would be a second template system
 * again, which is the defect being repaired, so `scripts/test-template-records.mts`
 * asserts that no UI module imports the registry's list functions.
 */
import type { Payload } from 'payload'

import {
  listLpTemplates,
  listQuizTemplates,
  resolveTemplate,
  type RegisteredLpTemplate,
  type RegisteredQuizTemplate,
} from '@/lib/template-registry'
import {
  type LpTemplateRecord,
  type QuizTemplateRecord,
  type TemplateOrigin,
} from './model'

export * from './model'

/* ------------------------------------------------------------------ mapping */

const asStringMap = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

const asOrigin = (v: unknown, fallback: TemplateOrigin): TemplateOrigin => {
  const s = typeof v === 'string' ? v : ''
  return s === 'stock' || s === 'clone' || s === 'blank' || s === 'ai' || s === 'legacy' ? s : fallback
}

const asIsoOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * `is_enabled` may be NULL on a row that predates the column.
 *
 * NULL is not false: it means the question was never asked, and every such row
 * was selectable before the column existed. The migration backfills these, but
 * a row created by a concurrent writer during the deploy would not be, so the
 * read side agrees with the migration rather than trusting it.
 */
const asEnabled = (v: unknown): boolean => v !== false

export const toLpRecord = (row: Record<string, unknown>): LpTemplateRecord => {
  const templateId = typeof row.template_id === 'string' ? row.template_id : ''
  const res = resolveTemplate('lp', templateId)
  const reg = res.ok && res.template.kind === 'lp' ? (res.template as RegisteredLpTemplate) : null

  return {
    kind: 'lp',
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    // The CANONICAL id when it resolves, so every surface downstream agrees;
    // the RAW stored id when it does not, so the error can name what is wrong.
    templateId: reg ? reg.id : templateId,
    angle: String(row.angle ?? 'pain'),
    isPublished: Boolean(row.is_published),
    isEnabled: asEnabled(row.is_enabled),
    origin: asOrigin(row.origin, 'blank'),
    stockKey: typeof row.stock_key === 'string' && row.stock_key ? row.stock_key : null,
    archivedAt: asIsoOrNull(row.archived_at),
    sections: Array.isArray(row.sections) ? (row.sections as unknown[]) : [],
    slotOverrides: asStringMap(row.slot_overrides),
    rendererError: res.ok ? null : res.error,
    renderer: reg ? reg.renderer : null,
    code: reg ? reg.code : '',
    blurb: reg ? reg.blurb : '',
    family: reg ? String(reg.family) : '',
    ground: reg ? reg.ground : '',
    channels: reg ? reg.channels : '',
    quizPlacement: reg ? reg.quizPlacement : '',
    recommendedQuizTemplateId: reg ? reg.recommendedQuizTemplateId : '',
    usesSlots: reg ? reg.renderer === 'ported' : false,
  }
}

export const toQuizRecord = (row: Record<string, unknown>): QuizTemplateRecord => {
  const rendererKey = typeof row.renderer_key === 'string' ? row.renderer_key : ''
  const res = resolveTemplate('quiz', rendererKey)
  const reg = res.ok && res.template.kind === 'quiz' ? (res.template as RegisteredQuizTemplate) : null

  return {
    kind: 'quiz',
    id: String(row.id),
    name: String(row.name ?? reg?.name ?? ''),
    templateId: String(row.template_id ?? ''),
    rendererKey: reg ? reg.id : rendererKey,
    code: String(row.code ?? reg?.code ?? ''),
    blurb: String(row.blurb ?? reg?.blurb ?? ''),
    isEnabled: asEnabled(row.is_enabled),
    origin: asOrigin(row.origin, 'blank') as QuizTemplateRecord['origin'],
    stockKey: typeof row.stock_key === 'string' && row.stock_key ? row.stock_key : null,
    archivedAt: asIsoOrNull(row.archived_at),
    configOverrides:
      row.config_overrides && typeof row.config_overrides === 'object' && !Array.isArray(row.config_overrides)
        ? (row.config_overrides as Record<string, unknown>)
        : {},
    rendererError: res.ok ? null : res.error,
  }
}

/* ------------------------------------------------------------------ reading */

export type ListOptions = {
  /** Include soft-deleted rows. Off by default: deleted means gone from lists. */
  includeArchived?: boolean
}

export const listLpTemplateRecords = async (
  payload: Payload,
  opts: ListOptions = {},
): Promise<LpTemplateRecord[]> => {
  const res = await payload.find({
    collection: 'funnel-landing-pages',
    limit: 1000,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  })
  const all = res.docs.map((d) => toLpRecord(d as Record<string, unknown>))
  return opts.includeArchived ? all : all.filter((t) => !t.archivedAt)
}

export const listQuizTemplateRecords = async (
  payload: Payload,
  opts: ListOptions = {},
): Promise<QuizTemplateRecord[]> => {
  const res = await payload.find({
    collection: 'funnel-quiz-templates',
    limit: 1000,
    depth: 0,
    sort: 'code',
    overrideAccess: true,
  })
  const all = res.docs.map((d) => toQuizRecord(d as Record<string, unknown>))
  return opts.includeArchived ? all : all.filter((t) => !t.archivedAt)
}

export const getLpTemplateRecord = async (
  payload: Payload,
  id: string,
): Promise<LpTemplateRecord | null> => {
  const row = await payload
    .findByID({ collection: 'funnel-landing-pages', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  return row ? toLpRecord(row as Record<string, unknown>) : null
}

/**
 * The record a stored quiz `template_id` names.
 *
 * Returns null rather than a stand-in. Every caller has to decide what to do
 * about a missing template, and handing back a different one removes the
 * decision by making the failure invisible — which is the bug this whole
 * change exists to remove.
 */
export const getQuizTemplateRecordByTemplateId = async (
  payload: Payload,
  templateId: string,
): Promise<QuizTemplateRecord | null> => {
  const id = typeof templateId === 'string' ? templateId.trim() : ''
  if (!id) return null
  const res = await payload.find({
    collection: 'funnel-quiz-templates',
    where: { template_id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const row = res.docs[0]
  return row ? toQuizRecord(row as Record<string, unknown>) : null
}

/* -------------------------------------------------------------- reconciling */

/**
 * What a stock landing-page template row looks like when first materialised.
 *
 * `sections` is empty on purpose and is not a stub: the twelve ported templates
 * are drawn by `PortedTemplateView` from the handoff's own markup and the node
 * `sections` array is never read for them. Their editable copy lives in
 * `slot_overrides`, keyed by the slot ids `src/lib/lp-slots/` extracts.
 */
const stockLpRow = (t: RegisteredLpTemplate) => ({
  name: t.name,
  slug: t.id,
  template_id: t.id,
  angle: 'pain',
  // Published so a deployment of a stock template serves. The deployment's own
  // status is what decides whether it is live.
  is_published: true,
  is_enabled: true,
  origin: 'stock' as const,
  stock_key: t.id,
  sections: [],
  slot_overrides: {},
})

const stockQuizRow = (t: RegisteredQuizTemplate) => ({
  name: t.name,
  template_id: t.id,
  renderer_key: t.id,
  code: t.code,
  blurb: t.blurb,
  is_enabled: true,
  origin: 'stock' as const,
  stock_key: t.id,
  config_overrides: {},
})

export type ReconcileReport = {
  lpCreated: string[]
  lpRepaired: string[]
  quizCreated: string[]
  quizRepaired: string[]
  samplesRemoved: string[]
  samplesKept: string[]
  deploymentsRepointed: number
  problems: string[]
}

const emptyReport = (): ReconcileReport => ({
  lpCreated: [],
  lpRepaired: [],
  quizCreated: [],
  quizRepaired: [],
  samplesRemoved: [],
  samplesKept: [],
  deploymentsRepointed: 0,
  problems: [],
})

/**
 * Make the database hold exactly the libraries the code defines, plus whatever
 * operators have created.
 *
 * Idempotent and cheap: two reads, and a write only for a row that is missing
 * or has drifted. It is NOT gated by a once-ever marker, because a marker would
 * mean a template added to the library next month never appears without another
 * migration. Re-running it is the mechanism, not a repair.
 *
 * What it will NOT do: overwrite a stock row's editable content. An operator
 * who rewrites the Editorial Investigation template's copy keeps it. Only the
 * fields that identify a row as that stock template are repaired.
 */
export const ensureTemplateRecords = async (payload: Payload): Promise<ReconcileReport> => {
  const report = emptyReport()

  /* ---------------------------------------------- landing-page templates */
  const lpRes = await payload.find({
    collection: 'funnel-landing-pages',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const lpRows = lpRes.docs as Array<Record<string, unknown>>
  const lpByStockKey = new Map<string, Record<string, unknown>>()
  for (const r of lpRows) {
    const k = typeof r.stock_key === 'string' ? r.stock_key : ''
    if (k) lpByStockKey.set(k, r)
  }

  for (const t of listLpTemplates()) {
    const existing = lpByStockKey.get(t.id)
    if (!existing) {
      /*
       * A pre-existing row may already BE this template without saying so —
       * the seeded samples carried real stock `template_id`s. Adopting it is
       * better than creating a duplicate beside it, because two rows drawing
       * one template is the ambiguity this collection is meant to end.
       */
      const adoptable = lpRows.find(
        (r) =>
          !r.stock_key &&
          r.template_id === t.id &&
          String(r.slug ?? '') === t.id,
      )
      if (adoptable) {
        await payload.update({
          collection: 'funnel-landing-pages',
          id: adoptable.id as string,
          data: { stock_key: t.id, origin: 'stock', is_enabled: true },
          overrideAccess: true,
        })
        report.lpRepaired.push(t.id)
        continue
      }
      await payload.create({
        collection: 'funnel-landing-pages',
        data: stockLpRow(t),
        overrideAccess: true,
      })
      report.lpCreated.push(t.id)
      continue
    }

    // A stock row whose renderer id was changed no longer draws the template it
    // claims to be. Repair the identity; leave the content alone.
    if (existing.template_id !== t.id) {
      await payload.update({
        collection: 'funnel-landing-pages',
        id: existing.id as string,
        data: { template_id: t.id },
        overrideAccess: true,
      })
      report.lpRepaired.push(t.id)
    }
  }

  /* ------------------------------------------------------ quiz templates */
  const qRes = await payload.find({
    collection: 'funnel-quiz-templates',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const qRows = qRes.docs as Array<Record<string, unknown>>
  const qByStockKey = new Map<string, Record<string, unknown>>()
  for (const r of qRows) {
    const k = typeof r.stock_key === 'string' ? r.stock_key : ''
    if (k) qByStockKey.set(k, r)
  }

  for (const t of listQuizTemplates()) {
    const existing = qByStockKey.get(t.id)
    if (!existing) {
      await payload.create({
        collection: 'funnel-quiz-templates',
        data: stockQuizRow(t),
        overrideAccess: true,
      })
      report.quizCreated.push(t.id)
      continue
    }
    if (existing.renderer_key !== t.id || existing.template_id !== t.id) {
      await payload.update({
        collection: 'funnel-quiz-templates',
        id: existing.id as string,
        data: { renderer_key: t.id, template_id: t.id },
        overrideAccess: true,
      })
      report.quizRepaired.push(t.id)
    }
  }

  return report
}

/**
 * Bring the template libraries up, then retire the sample pages.
 *
 * Order is not optional: `retireSampleLandingPages` repoints a sample's
 * deployments onto the stock row for the same renderer, so the stock rows have
 * to exist first or every sample is kept with a "nothing to repoint to"
 * problem.
 *
 * Latched per process after a clean run, because it is called from admin page
 * renders and the steady state is two reads that find nothing to do. The latch
 * is NOT persisted: a restart re-checks, which is what makes a template added
 * to the library appear without a migration.
 */
let libraryEnsured = false
let ensureInFlight: Promise<void> | null = null

export const ensureTemplateLibrary = async (payload: Payload): Promise<void> => {
  if (libraryEnsured) return
  if (ensureInFlight) return ensureInFlight
  ensureInFlight = (async () => {
    try {
      const report = await ensureTemplateRecords(payload)
      const { retireSampleLandingPages } = await import('./samples')
      const samples = await retireSampleLandingPages(payload)

      const noise =
        report.lpCreated.length +
        report.lpRepaired.length +
        report.quizCreated.length +
        report.quizRepaired.length +
        samples.removed.length +
        samples.kept.length
      if (noise > 0) {
        // eslint-disable-next-line no-console
        console.info(
          `[template-records] lp +${report.lpCreated.length}/~${report.lpRepaired.length} · ` +
            `quiz +${report.quizCreated.length}/~${report.quizRepaired.length} · ` +
            `samples removed ${samples.removed.length}, kept ${samples.kept.length}`,
        )
      }
      for (const p of [...report.problems, ...samples.problems]) {
        // eslint-disable-next-line no-console
        console.warn(`[template-records] ${p}`)
      }
      libraryEnsured = true
    } catch (err) {
      // Never break the page that called us. Left unlatched so the next render
      // tries again rather than running for the process lifetime on one failure.
      // eslint-disable-next-line no-console
      console.error('[template-records] ensure failed (page still renders):', err)
    } finally {
      ensureInFlight = null
    }
  })()
  return ensureInFlight
}
