/**
 * Which composition draws which `sq_*` template, as DATA.
 *
 * Separate from `registry.ts` for one reason: `registry.ts` imports seven React
 * components, and `registryHealth()` in `src/lib/template-registry.ts` needs to
 * assert that every claimed id exists and that no id is claimed twice. Importing
 * the components to answer a question about strings would pull the whole quiz
 * renderer - and `lucide-react` with it - into `template-registry`, which the
 * deployment resolver, the publish preflight and several server actions import.
 *
 * So the claims live here, in a module with no imports at all, and each
 * composition's `renders` list is READ from this table rather than restated
 * beside it. There is one place a claim is written down, which is what stops the
 * health check and the renderer disagreeing about who draws what.
 *
 * The ids are CANONICAL. Resolution runs after `template-registry`, so the six
 * legacy aliases (`default`, `minimal`, `editorial`, `gradient`, `glass`,
 * `compact`) resolve to their canonical target first and never appear here.
 *
 * An id absent from this table is not broken: it draws through the default
 * composition, which is the shared card fourteen of the twenty still use.
 */
export const COMPOSITION_CLAIMS: Readonly<Record<string, readonly string[]>> = {
  authority_console: ['sq_authority_console'],
  case_file_console: ['sq_case_file_console'],
  direct_panel: ['sq_direct_panel'],
  editorial_inline: ['sq_editorial_inline'],
  evidence_checklist: ['sq_evidence_checklist'],
  fullscreen_focus: ['sq_fullscreen_focus'],
}

/** Every claimed id, in declaration order. Duplicates are the caller's to spot. */
export const CLAIMED_TEMPLATE_IDS: readonly string[] =
  Object.values(COMPOSITION_CLAIMS).flatMap((ids) => [...ids])
