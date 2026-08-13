/**
 * Does the DATABASE this process is pointed at match the CODE it is running?
 *
 * READ-ONLY. It is safe against production and is meant to be run there, as the
 * step between "migrations applied" and "start serving".
 *
 * WHY IT IS NOT "did migrate exit 0". `pnpm payload migrate` proves the
 * migrations are consistent with EACH OTHER. It proves nothing about whether
 * they match the collections, because nothing in the migration runner reads a
 * collection. The two drift silently, in one direction, for one reason: outside
 * production the postgres adapter auto-pushes the schema, so a developer's
 * database grows a column the moment the code declares it and no migration is
 * ever felt to be missing.
 *
 * WHY A READ IS THE RIGHT INSTRUMENT. Payload's SELECT enumerates every column a
 * collection declares. So reading one row from every collection and every global
 * asks precisely the question a boot asks, and gets the same answer — including
 * the failure mode that matters, which is not "one page is wrong" but "the
 * process throws before it serves anything".
 *
 * Three real defects were found by exactly this loop on a migration-only
 * database, none of which was in F001's list:
 *
 *   payload_locked_documents_rels   six funnel FK columns absent, which also
 *                                   makes DELETING ANY DOCUMENT in ANY
 *                                   collection fail app-wide
 *   integration_config              two sample-seeding markers absent, so the
 *                                   admin shell 500s
 *   (and every one of them present in production, from a dev push)
 */

import type { Payload } from 'payload'

export type SchemaProblem = {
  kind: 'collection' | 'global'
  slug: string
  /** The database's own complaint, first line. */
  error: string
}

export type SchemaVerification = {
  ok: boolean
  collectionsChecked: number
  globalsChecked: number
  problems: SchemaProblem[]
}

const firstLine = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err)
  return message.split('\n')[0].slice(0, 300)
}

/**
 * Read one row from every collection and every global.
 *
 * Sequential rather than parallel on purpose: a failing query on postgres aborts
 * the transaction it is in, and running twenty of them at once against one
 * connection turns one real problem into twenty reports of
 * "current transaction is aborted".
 */
export const verifySchema = async (payload: Payload): Promise<SchemaVerification> => {
  const problems: SchemaProblem[] = []

  const collectionSlugs = Object.keys(payload.collections)
  for (const slug of collectionSlugs) {
    try {
      await payload.find({ collection: slug as never, limit: 1, depth: 0, overrideAccess: true })
    } catch (err) {
      problems.push({ kind: 'collection', slug, error: firstLine(err) })
    }
  }

  const globalSlugs = (payload.config.globals ?? []).map((g) => g.slug)
  for (const slug of globalSlugs) {
    try {
      await payload.findGlobal({ slug: slug as never, depth: 0, overrideAccess: true })
    } catch (err) {
      problems.push({ kind: 'global', slug, error: firstLine(err) })
    }
  }

  return {
    ok: problems.length === 0,
    collectionsChecked: collectionSlugs.length,
    globalsChecked: globalSlugs.length,
    problems,
  }
}

/** One block of text for a release log. */
export const formatVerification = (v: SchemaVerification): string => {
  if (v.ok) {
    return `schema OK: ${v.collectionsChecked} collections and ${v.globalsChecked} globals read cleanly`
  }
  const lines = v.problems.map((p) => `  ${p.kind} "${p.slug}": ${p.error}`)
  return [
    `SCHEMA MISMATCH: ${v.problems.length} of ${v.collectionsChecked + v.globalsChecked} reads failed.`,
    'The code declares something the database does not have. Do NOT start the service:',
    'it will throw at boot rather than degrade.',
    ...lines,
  ].join('\n')
}
