/**
 * Check that every route the handbook documents actually exists.
 *
 *   node --experimental-strip-types scripts/check-handbook-routes.ts
 *
 * Documentation rots by pointing at screens that moved. Writing the handbook as
 * data instead of prose is what makes that checkable at all, and this is the
 * check: each documented route is resolved back to the file that serves it, and
 * a route with no file fails the run.
 *
 * It cannot verify that the WORDS are still true - only a person can do that -
 * but a link that 404s is the failure mode that needs no judgement to catch.
 */
import fs from 'node:fs'
import { ALL_PAGES, FIRST_RUN } from '../src/lib/handbook.ts'
import { NAV } from '../src/components/app/nav-config.ts'

/** Routes outside the admin, which do not follow the admin file layout. */
const SPECIAL: Record<string, string> = {
  '/': 'src/app/(public)/[[...slug]]/page.tsx',
  '/cms': 'src/app/(payload)/cms',
  '/sign-in': 'src/app/(auth)/sign-in/page.tsx',
}

/** Where a route would live, allowing for the (top) layout group. */
const fileFor = (route: string): string | null => {
  if (SPECIAL[route]) return fs.existsSync(SPECIAL[route]) ? SPECIAL[route] : null
  const rest = route.replace(/^\/admin\/?/, '')
  const candidates = rest
    ? [`src/app/(app)/admin/(top)/${rest}/page.tsx`, `src/app/(app)/admin/${rest}/page.tsx`]
    : ['src/app/(app)/admin/page.tsx']
  return candidates.find((c) => fs.existsSync(c)) ?? null
}

const routes = [...new Set([...ALL_PAGES.map((p) => p.route), ...FIRST_RUN.map((s) => s.route)])].sort()

let missing = 0
for (const route of routes) {
  if (!fileFor(route)) {
    console.log(`  MISSING  ${route} is documented but no page serves it`)
    missing += 1
  }
}

// A `pattern` claims a real URL shape, so it has to start at its own route.
let mismatched = 0
for (const page of ALL_PAGES) {
  if (page.pattern && !page.pattern.startsWith(page.route)) {
    console.log(`  MISMATCH ${page.title}: pattern "${page.pattern}" does not begin with its link "${page.route}"`)
    mismatched += 1
  }
}

/**
 * Every sidebar destination must exist too.
 *
 * The handbook check above only proves that DOCUMENTED routes exist. The
 * sidebar is the other list of routes in this application, it is the one every
 * operator actually clicks, and it had a group pointing at `/admin/integrity`
 * when no such page existed. A nav entry that 404s is worse than a missing
 * feature: it reads as the product being broken rather than unfinished.
 */
const navRoutes = [
  ...NAV.map((g) => g.href),
  ...NAV.flatMap((g) => g.children?.map((c) => c.href) ?? []),
]
const navTargets = [...new Set(navRoutes.map((href) => href.split('?')[0]))].sort()

let navMissing = 0
for (const route of navTargets) {
  if (!fileFor(route)) {
    console.log(`  MISSING  ${route} is in the sidebar but no page serves it`)
    navMissing += 1
  }
}

console.log(
  `\n${routes.length} routes documented, ${ALL_PAGES.length} screens described, ` +
    `${navTargets.length} sidebar destinations, ` +
    `${missing + navMissing} missing, ${mismatched} mismatched`,
)
if (missing || navMissing || mismatched) process.exit(1)
