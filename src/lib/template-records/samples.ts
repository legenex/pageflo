// @ts-nocheck -- funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` to restore typing.
/**
 * Retiring the sample landing pages, without deleting anybody's work.
 *
 * `MVA Pain First`, `Authority Build` and `Editorial Test` were seeded as
 * "pages" under a model where a page and a template were different things. They
 * are not templates, they are three instances of three templates, and while
 * they sit in the library they are what a deployment picker offers instead of
 * the twelve.
 *
 * Deleting them is not as simple as a DELETE. `mva-pain-first` is published and
 * deployed LIVE at `/c/pain`, and `seedStarterFunnelsForBrand` points every new
 * brand's starter deployment at it by hard-coded slug. So the removal is:
 *
 *   1. recognise the row as genuinely unmodified sample data;
 *   2. repoint every deployment onto the STOCK ROW FOR THE SAME RENDERER;
 *   3. only then delete the sample row.
 *
 * Step 2 is what makes this legal under "do not silently change an existing
 * deployment to another template". Each sample already carries a real stock
 * `template_id` — `human_recovery_story`, `authority_network`,
 * `editorial_investigation_v2` — and it is repointed at the row carrying that
 * SAME id. The renderer on both sides of the move is identical, so no
 * deployment changes appearance. What changes is that a wrong-model record
 * stops standing between the deployment and the template it was already using.
 *
 * A row that fails the recognition test in step 1 is KEPT and relabelled
 * `origin: 'legacy'`. At that point it is somebody's authored content wearing a
 * sample's name, and the instruction not to blindly delete production content
 * outranks the instruction to remove the samples.
 */
import type { Payload } from 'payload'

import {
  RETIRED_SAMPLE_LANDING_PAGES,
  SEED_SECTION_COPY,
  DEFAULT_SECTION_ORDER,
} from '@/components/builder/lp/section-copy'

export type SampleReconcileResult = {
  removed: Array<{ slug: string; repointedTo: string; deployments: number }>
  kept: Array<{ slug: string; reason: string }>
  problems: string[]
}

/**
 * A stable stringification: object keys sorted, array order preserved.
 *
 * `JSON.stringify` alone is wrong here and the identity suite caught it against
 * a real database. Postgres normalises `jsonb` and does NOT preserve key
 * insertion order, so a row read back from the column has the same content as
 * the seed constant with its keys in a different sequence. Comparing the raw
 * strings declared all three samples "edited by an operator" and kept them —
 * which is the safe direction to be wrong in, but it meant the retirement
 * silently never happened.
 *
 * Array order stays significant on purpose: a reordered list of settlement
 * amounts or eligibility criteria IS an edit.
 */
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`
}

/**
 * Is this row still exactly what the seeder wrote?
 *
 * The seeder mints a fresh `id` per section on every run, so ids cannot be
 * compared. Everything else can: the section types in order, every section
 * visible, and each section's copy equal to the seed constant. An operator who
 * changed one headline fails this and keeps their page.
 */
export const isUnmodifiedSampleSections = (sections: unknown): boolean => {
  if (!Array.isArray(sections)) return false
  if (sections.length !== DEFAULT_SECTION_ORDER.length) return false

  return sections.every((raw, i) => {
    if (!raw || typeof raw !== 'object') return false
    const s = raw as Record<string, unknown>
    if (s.type !== DEFAULT_SECTION_ORDER[i]) return false
    if (s.isVisible !== true) return false
    const expected = SEED_SECTION_COPY[DEFAULT_SECTION_ORDER[i]] || {}
    return canonical(s.copy ?? {}) === canonical(expected)
  })
}

const sampleBySlug = new Map(RETIRED_SAMPLE_LANDING_PAGES.map((s) => [s.slug, s]))

/**
 * Remove the recognised sample landing pages, repointing what referenced them.
 *
 * Safe to run repeatedly: once the rows are gone it does nothing, and a row it
 * decided to keep is marked `legacy` so it is never reconsidered.
 */
export const retireSampleLandingPages = async (payload: Payload): Promise<SampleReconcileResult> => {
  const out: SampleReconcileResult = { removed: [], kept: [], problems: [] }

  const res = await payload.find({
    collection: 'funnel-landing-pages',
    where: { slug: { in: RETIRED_SAMPLE_LANDING_PAGES.map((s) => s.slug) } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs.length === 0) return out

  for (const raw of res.docs) {
    const row = raw as Record<string, unknown>
    const slug = String(row.slug ?? '')
    const sample = sampleBySlug.get(slug)
    if (!sample) continue

    // Already adopted as a stock row by ensureTemplateRecords, or already
    // judged to be user content. Either way it is not a sample any more.
    if (row.origin === 'stock' || row.origin === 'legacy') continue

    const looksLikeSample =
      String(row.name ?? '') === sample.name && String(row.template_id ?? '') === sample.template_id

    if (!looksLikeSample || !isUnmodifiedSampleSections(row.sections)) {
      await payload.update({
        collection: 'funnel-landing-pages',
        id: row.id as string,
        data: { origin: 'legacy' },
        overrideAccess: true,
      })
      out.kept.push({
        slug,
        reason: !looksLikeSample
          ? 'name or template no longer matches the seed — treated as authored content'
          : 'sections have been edited since seeding — treated as authored content',
      })
      continue
    }

    /*
     * The stock row drawing the SAME renderer. If it is missing, stop: deleting
     * the sample would leave its deployments pointing at nothing, and a broken
     * deployment is worse than a tidy library.
     */
    const stockRes = await payload.find({
      collection: 'funnel-landing-pages',
      where: { stock_key: { equals: sample.template_id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const stock = stockRes.docs[0]
    if (!stock) {
      out.problems.push(
        `sample "${slug}" was left in place: no stock template row for "${sample.template_id}" to repoint its deployments to`,
      )
      continue
    }

    const deps = await payload.find({
      collection: 'funnel-lp-deployments',
      where: { landing_page: { equals: row.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })

    for (const dep of deps.docs) {
      await payload.update({
        collection: 'funnel-lp-deployments',
        id: dep.id as string,
        data: { landing_page: stock.id },
        overrideAccess: true,
      })
    }

    await payload.delete({
      collection: 'funnel-landing-pages',
      id: row.id as string,
      overrideAccess: true,
    })

    out.removed.push({
      slug,
      repointedTo: String(stock.slug ?? stock.id),
      deployments: deps.docs.length,
    })
  }

  return out
}
