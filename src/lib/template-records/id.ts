/**
 * What a stored quiz template id may look like, and who checks that it exists.
 *
 * Pure and database-free on purpose. This is imported by Payload field
 * validators, which run inside the write transaction on every save — including
 * the reconcile's own writes — and a validator that queried the database would
 * turn a missing migration into a total write outage: on a database where
 * `funnel_quiz_templates` does not exist yet, the lookup throws and every save
 * to a deployment fails. The resolvers deliberately catch that case and degrade
 * to a 404; a validator cannot.
 *
 * So the division of labour is:
 *
 *   field validator   SHAPE only — is this a plausible template id
 *   server action     EXISTENCE + ENABLED — may this operator choose it now
 *   publish preflight EXISTENCE + ENABLED — may this go live
 *   render path       EXISTENCE — refuses to serve rather than draw a stand-in
 *
 * The shape check still earns its place: it is the only gate that covers
 * `/cms` and `POST /api/...`, and it keeps arbitrary text out of a column that
 * three different code paths dereference.
 */
import { resolveTemplate } from '@/lib/template-registry'

/**
 * Lower-case letters, digits and underscores, 3-64 characters.
 *
 * Matches the twenty stock ids (`sq_editorial_inline`) and the ids the clone
 * and create actions mint (`sq_case_dossier_copy_a1b2c3`). Deliberately narrow:
 * these ids end up in log lines, `data-` attributes and URLs.
 */
export const QUIZ_TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9_]{2,63}$/

/**
 * A quiz template id that a deployment is allowed to STORE.
 *
 * Accepts anything the code registry knows (including the six legacy aliases)
 * and anything shaped like a record id. It cannot accept "only ids that exist"
 * without a database read — see the file comment for why that would be worse
 * than this.
 */
export const validateStoredQuizTemplateId = (value: unknown): true | string => {
  if (value == null || value === '') return true
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) return 'a quiz template id cannot be blank'

  // A registry id is always fine, and saying so first keeps the twenty stock
  // ids passing even if the pattern is ever tightened.
  if (resolveTemplate('quiz', id).ok) return true

  if (!QUIZ_TEMPLATE_ID_PATTERN.test(id)) {
    return `"${id}" is not a valid quiz template id (lower-case letters, digits and underscores, 3-64 characters)`
  }
  return true
}
