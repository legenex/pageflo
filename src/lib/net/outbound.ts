/**
 * A bounded `fetch` for the fixed third-party endpoints the lead pipeline calls.
 *
 * WHY. `runLeadPipeline` runs SYNCHRONOUSLY inside the visitor's POST — there is
 * no queue and no worker. Node's fetch (undici) defaults to a ~300s headers
 * timeout, so a single unresponsive vendor did not degrade a step: it held the
 * public lead form open for five minutes, occupied a server connection for the
 * whole time, and eventually gave the visitor a failure they would retry. One
 * dead pixel endpoint was enough to take lead capture down.
 *
 * WHY NOT `safePost`. `src/lib/net/ssrf.ts` bounds the addresses a USER supplies
 * (outbound webhooks, quiz webhook nodes, brand extraction). These endpoints are
 * hardcoded vendor URLs, so there is no confused-deputy problem to solve and no
 * DNS admission to run; what they were missing is only the deadline. This is
 * that deadline, spelled the same way — a hard ceiling, reported as a failure
 * with a reason rather than as a silent hang.
 *
 * Every caller already returns `{ ok: false, error }` from its own catch, so a
 * timeout degrades the step to a failed `PipelineStep` and never throws out of
 * the pipeline.
 */

/**
 * The ceiling for a vendor call on a visitor's critical path.
 *
 * Shorter than `safePost`'s 8s, and deliberately: the whole integration fan-out
 * runs concurrently under one `Promise.allSettled`, so this is the longest a
 * visitor can be made to wait for ALL of the pixel/CAPI vendors together, and 6s
 * is already far past any healthy response from them. An outbound webhook to a
 * buyer keeps the more generous 8s it has in `safePost`, because delivering that
 * one is worth more waiting than reporting a conversion is.
 */
export const OUTBOUND_TIMEOUT_MS = 6000

/** A rejection that came from the deadline rather than from the network. */
const isAbortLike = (err: unknown): boolean => {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/**
 * `fetch` with a hard deadline.
 *
 * `cache: 'no-store'` is not optional: Next patches the global fetch with its
 * own caching, and every one of these calls reports or reads LIVE state — a
 * conversion being sent, a lead id being verified. A cached response would make
 * the second lead of a session silently reuse the first one's answer. Same
 * reason `safeFetch` sets it.
 *
 * The signal is set here, so a caller must not pass its own; none do.
 */
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  timeoutMs: number = OUTBOUND_TIMEOUT_MS,
): Promise<Response> => {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    // Re-thrown as a plain Error with a readable message: undici rejects with a
    // DOMException whose `message` is "The operation was aborted", which tells
    // an operator reading a delivery log nothing about what happened or how long
    // it waited. Callers catch this exactly as they caught a network error.
    if (isAbortLike(err)) throw new Error(`timed out after ${timeoutMs}ms`)
    throw err
  }
}
