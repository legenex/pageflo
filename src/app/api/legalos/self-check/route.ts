/**
 * Compatibility alias. The implementation lives at `/api/pageflo/self-check`.
 *
 * The whole `/api/legalos/*` namespace stays mounted because consumers this
 * deploy does not control still call it: the release health gate in
 * `scripts/release.sh`, the SSL poller in `src/lib/ssl-poll.ts` hitting tenant
 * hosts that may still be serving an older build, copies of `q.js` already
 * cached on third-party pages, and operator bookmarks.
 *
 * This one in particular: `pollDomainSslStatus` opens a real HTTPS connection
 * to the TENANT host and GETs this path. That host can be serving a build from
 * before this rename, so the path must answer on both names.
 *
 * Removing this file is safe only once those consumers call
 * `/api/pageflo/self-check` instead.
 */

// Re-stated rather than re-exported: Next reads route segment config off the
// route file itself, and it must match the canonical route exactly.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export { GET } from '../../pageflo/self-check/route'
