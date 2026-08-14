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
  /** Deployments whose NAME quoted a sample that no longer exists. */
  renamedDeployments: Array<{ from: string; to: string }>
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
  const out: SampleReconcileResult = { removed: [], kept: [], renamedDeployments: [], problems: [] }

  const res = await payload.find({
    collection: 'funnel-landing-pages',
    where: { slug: { in: RETIRED_SAMPLE_LANDING_PAGES.map((s) => s.slug) } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs.length === 0) {
    await renameDeploymentsQuotingRetiredSamples(payload, out)
    return out
  }

  for (const raw of res.docs) {
    /*
     * ONE BAD ROW MUST NOT ABORT THE WHOLE RETIREMENT.
     *
     * This loop used to let an exception escape, and in production one did: the
     * `editorial-test` row stored an unresolvable `template_id`, so stamping
     * `origin: 'legacy'` on it failed field validation and threw. That killed
     * the loop before `mva-pain-first` — the row after it — was ever examined,
     * and killed the caller's whole reconcile with it. Both samples survived,
     * and the library reported 14 templates instead of 12, for as long as the
     * bad cell existed. A per-row boundary makes the blast radius one row.
     */
    try {
      await retireOne(payload, raw as Record<string, unknown>, out)
    } catch (err) {
      out.problems.push(
        `sample "${String((raw as Record<string, unknown>).slug ?? '?')}" could not be retired: ` +
          `${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  await renameDeploymentsQuotingRetiredSamples(payload, out)
  return out
}

/** One sample row's retirement. Extracted so the caller can bound its failures. */
const retireOne = async (
  payload: Payload,
  row: Record<string, unknown>,
  out: SampleReconcileResult,
): Promise<void> => {
  {
    const slug = String(row.slug ?? '')
    const sample = sampleBySlug.get(slug)
    if (!sample) return

    // Already adopted as a stock row by ensureTemplateRecords, or already
    // judged to be user content. Either way it is not a sample any more.
    if (row.origin === 'stock' || row.origin === 'legacy') return

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
      return
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
      return
    }

    const deps = await payload.find({
      collection: 'funnel-lp-deployments',
      where: { landing_page: { equals: row.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })

    /*
     * The deployment's NAME is repointed too, when it quotes the sample.
     *
     * The seeder built names like "Check My Claim · MVA Pain First", so after
     * the row is gone those deployments read as pointing at a record that does
     * not exist — which is precisely the stale reference this whole correction
     * is about, left behind by the cleanup for it. Only the quoted fragment is
     * replaced, and only with the name of the template the deployment is now
     * bound to, so "Check My Claim · Human Recovery Story" still says which
     * brand and which template. A name an operator chose contains no sample
     * name and is untouched.
     */
    const stockName = String(stock.name ?? '')
    for (const dep of deps.docs) {
      const currentName = String(dep.name ?? '')
      const data: Record<string, unknown> = { landing_page: stock.id }
      if (stockName && currentName.includes(sample.name)) {
        data.name = currentName.split(sample.name).join(stockName)
      }
      await payload.update({
        collection: 'funnel-lp-deployments',
        id: dep.id as string,
        data,
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
}

/**
 * Deployments still named after a sample that has already been removed.
 *
 * Separate from the loop above and run unconditionally, because the two can get
 * out of step: a database where the retirement ran under an earlier build has
 * the rows gone and the names stale, and the loop returns early for exactly
 * those. Resolving the replacement from the deployment's CURRENT landing page
 * rather than from the sample table means this is correct whichever order the
 * two ran in.
 */
const renameDeploymentsQuotingRetiredSamples = async (
  payload: Payload,
  out: SampleReconcileResult,
): Promise<void> => {
  const stale = await payload
    .find({
      collection: 'funnel-lp-deployments',
      where: { or: RETIRED_SAMPLE_LANDING_PAGES.map((s) => ({ name: { contains: s.name } })) },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!stale || stale.docs.length === 0) return

  for (const dep of stale.docs) {
    const lpId = dep.landing_page == null
      ? null
      : typeof dep.landing_page === 'object'
        ? (dep.landing_page as { id: unknown }).id
        : dep.landing_page
    if (lpId == null) continue

    const lp = await payload
      .findByID({ collection: 'funnel-landing-pages', id: lpId as string, depth: 0, overrideAccess: true })
      .catch(() => null)
    const replacement = String(lp?.name ?? '')
    // A deployment still bound to a sample row is the loop's business, not this
    // one's — renaming it here would erase the evidence before the repoint.
    if (!replacement || RETIRED_SAMPLE_LANDING_PAGES.some((s) => s.name === replacement)) continue

    let name = String(dep.name ?? '')
    for (const s of RETIRED_SAMPLE_LANDING_PAGES) {
      if (name.includes(s.name)) name = name.split(s.name).join(replacement)
    }
    if (name === String(dep.name ?? '')) continue

    await payload.update({
      collection: 'funnel-lp-deployments',
      id: dep.id as string,
      data: { name },
      overrideAccess: true,
    })
    out.renamedDeployments.push({ from: String(dep.name ?? ''), to: name })
  }
}
