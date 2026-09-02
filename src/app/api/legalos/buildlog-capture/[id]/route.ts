/**
 * Compatibility alias. The implementation lives at `/api/pageflo/buildlog-capture/[id]`.
 *
 * The whole `/api/legalos/*` namespace stays mounted because consumers this
 * deploy does not control still call it: the release health gate in
 * `scripts/release.sh`, the SSL poller in `src/lib/ssl-poll.ts` hitting tenant
 * hosts that may still be serving an older build, copies of `q.js` already
 * cached on third-party pages, and operator bookmarks.
 *
 * Removing this file is safe only once those consumers call
 * `/api/pageflo/buildlog-capture/[id]` instead.
 */

export { GET } from '../../../pageflo/buildlog-capture/[id]/route'
