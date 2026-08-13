/**
 * The id of a Payload relationship value, however it arrived.
 *
 * A LEAF on purpose. This helper is consumed by the access layer and by
 * collection hooks — modules that `payload.config.ts` itself imports — so
 * anything it pulls in becomes part of every collection's import graph. It
 * used to live in `lib/authz.ts`, whose chain (`authz → auth →
 * payload.config → collections → access → authz`) closed a circular import
 * that the dev bundler tolerated and the production chunker turned into
 * `ReferenceError: Cannot access 'h' before initialization` on the sign-in
 * action. Keep this file dependency-free.
 */

export const relationId = (rel: unknown): number | null => {
  if (rel === null || rel === undefined) return null
  // Both branches go through the same finite check. The object branch used to
  // skip it, so `{ id: 'abc' }` returned NaN and `''`/`false`/`{ id: [] }`
  // returned 0 — neither of which is an id, and both of which contradict this
  // function's own contract. NaN never authorizes (NaN === NaN is false), but 0
  // is a real comparison: `Number(null)` is also 0, so a binding row with a null
  // site would have matched a caller who sent an empty form field.
  const raw = typeof rel === 'object' ? (rel as { id?: unknown }).id : rel
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') return null
  // Trimmed, not just compared to '': `Number('   ')` is 0 too, and so is
  // `Number(null)`, so a whitespace-only form field would have matched a binding
  // row whose site was null.
  if (typeof raw === 'string' && raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
