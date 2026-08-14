/**
 * Fail-closed plumbing for every builder mutation.
 *
 * A Next server action can fail in two ways that look nothing alike to the code
 * that called it:
 *
 *   1. it RESOLVES with `{ ok: false, error }` — a refusal the action chose,
 *      such as a publish preflight declining to take a funnel live;
 *   2. it REJECTS — a stale action id after a deploy ("Failed to find Server
 *      Action ..."), a dropped connection, a 500 out of the action endpoint.
 *
 * Only the first was ever handled in this tree. A rejection therefore skipped
 * BOTH the rollback and the error toast, so the row kept the value the operator
 * hoped for while the database kept the old one. On the pause/unpublish path
 * that is a live legal-advertising funnel displayed as PAUSED while it keeps
 * serving — a compliance exposure rather than a cosmetic one, because the
 * operator gets visual confirmation of a stop that never happened.
 *
 * `settleAction` collapses case 2 into case 1, so the single `if (!res.ok)`
 * branch every handler already writes covers both. `commitOptimistic` goes
 * further and makes the rollback + visible error + reconcile trio the only way
 * to spend an optimistic update.
 */

/** What a settled action hands back when it did not produce a usable result. */
export type ActionFailure = { ok: false; error: string }

/** Anything a builder server action resolves to. They all carry `ok`. */
type ActionResult = { ok: boolean }

const GENERIC_FAILURE = 'That change did not go through. Try again.'

/**
 * What to tell an operator when an action never returned a result.
 *
 * Each branch names a cause the operator can act on. The wording deliberately
 * says the change "did not go through" rather than "was not saved": a rejection
 * arrives without proof either way, which is exactly why every caller pairs this
 * message with a reconcile against the server.
 */
export const actionErrorMessage = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''

  // The shape production is actually producing. The tab holds a build the server
  // no longer serves, so the action id resolves to nothing and the call never
  // reaches our code — reloading is the whole fix, so lead with it.
  if (/server action/i.test(raw)) {
    return 'This tab is running an older version of the app, so the change did not go through. Reload the page and try again.'
  }
  if (/failed to fetch|networkerror|network request failed|load failed|err_(?:connection|network|internet)/i.test(raw)) {
    return 'Could not reach the server, so the change did not go through. Check your connection and try again.'
  }
  return raw ? `That change did not go through: ${raw}` : GENERIC_FAILURE
}

/**
 * Await a server action and never reject.
 *
 * The resolved value is passed through untouched on success, so callers keep
 * reading `res.id` / `res.warning` / `res.archived` exactly as before.
 */
export async function settleAction<T extends ActionResult>(
  action: Promise<T> | (() => Promise<T>),
): Promise<T | ActionFailure> {
  try {
    const res = await (typeof action === 'function' ? action() : action)
    // An action that resolves to nothing is a failure too. `res.ok` on undefined
    // throws inside the handler, which is the same silent no-op by another route.
    if (!res || typeof res !== 'object' || typeof (res as ActionResult).ok !== 'boolean') {
      return { ok: false, error: GENERIC_FAILURE }
    }
    return res
  } catch (err) {
    return { ok: false, error: actionErrorMessage(err) }
  }
}

/** The message a settled failure carries, whatever shape it arrived in. */
export const failureMessage = (res: unknown): string =>
  (res && typeof res === 'object' && typeof (res as ActionFailure).error === 'string'
    ? (res as ActionFailure).error
    : '') || GENERIC_FAILURE

/**
 * Commit an optimistic change. The caller has ALREADY written the hopeful state;
 * this owns everything that happens when the server disagrees with it.
 *
 * `rollback` puts the last known-good value back, `onError` puts the reason on
 * screen, and `reconcile` re-reads the row from the server. All three are needed
 * and the order matters:
 *
 *   - rollback first, so the screen stops asserting something untrue at once;
 *   - then the message, so the operator knows the control did not take;
 *   - then the reconcile, because a rejection does NOT prove the write failed to
 *     land. The local rollback is a well-informed guess; the refetch is the
 *     answer, and it wins if the two disagree.
 */
export async function commitOptimistic<T extends ActionResult>({
  action,
  rollback,
  onError,
  reconcile,
  onSuccess,
}: {
  /** A thunk, not a promise, so a synchronous throw is caught too. */
  action: () => Promise<T>
  rollback: () => void
  onError: (message: string) => void
  reconcile?: () => void
  onSuccess?: (res: T) => void
}): Promise<T | ActionFailure> {
  const res = await settleAction(action)
  if (!res.ok) {
    rollback()
    onError(failureMessage(res))
    reconcile?.()
    return res
  }
  onSuccess?.(res as T)
  return res
}
