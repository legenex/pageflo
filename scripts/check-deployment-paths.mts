/**
 * Which live deployments store a path no request can resolve to?
 *
 *   NODE_ENV=production pnpm check:paths          # report
 *   NODE_ENV=production pnpm check:paths --fix    # normalise, ONLY where unambiguous
 *
 * Read-only by default, on purpose. A deployment's path is a route a customer
 * may have in an ad, so rewriting one is a product decision, not a cleanup.
 *
 * The defect it finds: every READ path calls `normalizeDeploymentPath`, but
 * until now the admin actions wrote `dep.path` raw. A row stored as '/c/'
 * normalises to '/c', and the lookup searches `pathVariantsFor('/c')` =
 * ['/c','c'] — so the stored value is in neither list and the row is
 * unreachable while the admin still shows it LIVE. Production had two.
 *
 * `--fix` normalises a row ONLY when doing so cannot change which deployment
 * answers: if two rows would collide on the same normalised path for the same
 * site, both are left alone and reported, because picking a winner is the
 * owner's call.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { normalizeDeploymentPath } from '../src/lib/quiz-deployment-path.ts'
import { pathVariantsFor } from '../src/lib/public-path-claims.ts'

const APPLY = process.argv.includes('--fix')

type Row = { id: number | string; name: string; site: number | string; path: string; status: string; kind: string }

const main = async () => {
  const payload = await getPayload({ config })

  const rows: Row[] = []
  for (const [collection, kind] of [
    ['funnel-quiz-deployments', 'quiz'],
    ['funnel-lp-deployments', 'lp'],
  ] as const) {
    const res = await payload.find({ collection, limit: 0, depth: 0, overrideAccess: true })
    for (const d of res.docs as unknown as Record<string, unknown>[]) {
      rows.push({
        id: d.id as number,
        name: String(d.name ?? ''),
        site: (typeof d.site === 'object' && d.site ? (d.site as { id: number }).id : d.site) as number,
        path: String(d.path ?? ''),
        status: String(d.status ?? ''),
        kind,
      })
    }
  }

  const unreachable = rows.filter((r) => {
    const norm = normalizeDeploymentPath(r.path)
    return !pathVariantsFor(norm).includes(r.path)
  })

  console.log(`\n${rows.length} deployments; ${unreachable.length} store a path no request can resolve to.\n`)
  if (unreachable.length === 0) { process.exit(0) }

  // Group by (site, normalised) to spot collisions the normalisation would create.
  const byTarget = new Map<string, Row[]>()
  for (const r of rows) {
    const key = `${r.site}::${normalizeDeploymentPath(r.path)}`
    byTarget.set(key, [...(byTarget.get(key) ?? []), r])
  }

  let fixable = 0
  let blocked = 0
  for (const r of unreachable) {
    const norm = normalizeDeploymentPath(r.path)
    const peers = (byTarget.get(`${r.site}::${norm}`) ?? []).filter((p) => p.status === 'live')
    const collides = r.status === 'live' && peers.length > 1
    console.log(`  [${r.kind} ${r.id}] site ${r.site} ${r.status.padEnd(6)} "${r.path}" -> "${norm}"  ${r.name}`)
    if (collides) {
      blocked++
      console.log(`      BLOCKED: ${peers.length} live deployments would share "${norm}" (ids ${peers.map((p) => p.id).join(', ')}).`)
      console.log(`               Normalising both would make one of them shadow the other. Owner decision.`)
    } else {
      fixable++
      if (APPLY) {
        await payload.update({
          collection: r.kind === 'quiz' ? 'funnel-quiz-deployments' : 'funnel-lp-deployments',
          id: r.id,
          data: { path: norm },
          overrideAccess: true,
        } as never)
        console.log(`      FIXED -> "${norm}"`)
      } else {
        console.log(`      fixable (no collision); re-run with --fix to apply`)
      }
    }
  }

  console.log(`\n${fixable} fixable, ${blocked} blocked on an owner decision.`)
  if (!APPLY && fixable > 0) console.log('Nothing was changed. Re-run with --fix to normalise the fixable rows.')
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
