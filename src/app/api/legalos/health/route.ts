/**
 * Compatibility alias. The implementation lives at `/api/pageflo/health`.
 *
 * The whole `/api/legalos/*` namespace stays mounted because consumers this
 * deploy does not control still call it: the release health gate in
 * `scripts/release.sh`, the SSL poller in `src/lib/ssl-poll.ts` hitting tenant
 * hosts that may still be serving an older build, copies of `q.js` already
 * cached on third-party pages, and operator bookmarks.
 *
 * This one in particular: `scripts/release.sh` polls it 30 times before it will
 * call a release healthy, from a checkout that is by definition the OLD one for
 * part of that window. `LEGALOS_HEALTH_URL` overrides the path per host.
 *
 * Removing this file is safe only once those consumers call
 * `/api/pageflo/health` instead.
 */

// Re-stated rather than re-exported: Next reads route segment config off the
// route file itself, and it must match the canonical route exactly.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export { GET } from '../../pageflo/health/route'
