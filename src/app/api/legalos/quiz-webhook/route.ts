/**
 * Compatibility alias. The implementation lives at `/api/pageflo/quiz-webhook`.
 *
 * The whole `/api/legalos/*` namespace stays mounted because consumers this
 * deploy does not control still call it: the release health gate in
 * `scripts/release.sh`, the SSL poller in `src/lib/ssl-poll.ts` hitting tenant
 * hosts that may still be serving an older build, copies of `q.js` already
 * cached on third-party pages, and operator bookmarks.
 *
 * This one in particular: quiz runtimes embedded through `q.js` on third-party
 * pages call it, and those pages hold a cached bundle we cannot re-issue. A
 * visitor mid-funnel when the deploy lands must not lose their submission.
 *
 * Removing this file is safe only once those consumers call
 * `/api/pageflo/quiz-webhook` instead.
 */

// Re-stated rather than re-exported: Next reads route segment config off the
// route file itself, and it must match the canonical route exactly.
export const dynamic = 'force-dynamic'

export { POST } from '../../pageflo/quiz-webhook/route'
