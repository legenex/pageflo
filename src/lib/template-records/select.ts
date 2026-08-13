// @ts-nocheck -- the funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` to restore typing.
/**
 * "May this deployment be saved onto that template?" — asked in one place.
 *
 * This existed twice and only one copy was right, which is how an adversarial
 * pass found that a CLONED quiz template could be picked from the landing-page
 * editor's dropdown and then rejected by the save, taking every other unsaved
 * edit on the form with it. The quiz side asked the records; the landing-page
 * side asked the code registry, where a clone names nothing by design.
 *
 * Two rules, and the second one is the subtle half:
 *
 *  1. RECORDS FIRST, registry only as a floor. A clone resolves only as a
 *     record. The registry fallback is for the window between `pnpm payload
 *     migrate` and the first `ensureTemplateLibrary` — a stock id that has not
 *     been materialised yet still names the renderer it always named, so
 *     falling back there resolves the operator's real choice rather than
 *     substituting somebody else's template.
 *
 *  2. SELECTABILITY IS CHECKED ONLY ON A CHANGE. Disabling a template stops it
 *     being chosen; it does not put the deployments already on it into a state
 *     where their path or status cannot be edited. Blocking an unrelated save
 *     would make tidying the library take working pages hostage, which is the
 *     opposite of what disabling is for.
 */
import type { Payload } from 'payload'

import { canonicalTemplateId } from '@/lib/template-registry'
import { getQuizTemplateRecordByTemplateId, getLpTemplateRecord } from './index'
import { selectabilityProblem } from './model'

export type TemplateSelection = { ok: true; id: string } | { ok: false; error: string }

/**
 * The quiz template id to STORE for a deployment.
 *
 * `currentStoredId` is what the row carries today; pass it so an unrelated edit
 * to a deployment already on a disabled template is not refused.
 */
export const resolveQuizTemplateSelection = async (
  payload: Payload,
  requestedRaw: unknown,
  currentStoredId?: unknown,
): Promise<TemplateSelection> => {
  const requested = typeof requestedRaw === 'string' ? requestedRaw.trim() : ''
  if (!requested) return { ok: false, error: 'pick a visual template for this deployment first' }
  const current = typeof currentStoredId === 'string' ? currentStoredId.trim() : ''

  // Tolerates the table not existing: a missing library falls through to the
  // registry rather than failing every save on the box.
  const record = await getQuizTemplateRecordByTemplateId(payload, requested).catch(() => null)
  if (record) {
    if (record.rendererError) return { ok: false, error: `that template is broken: ${record.rendererError}` }
    if (requested !== current) {
      const problem = selectabilityProblem(record)
      if (problem) return { ok: false, error: `that template cannot be selected: ${problem}` }
    }
    return { ok: true, id: record.templateId }
  }

  return canonicalTemplateId('quiz', requested)
}

/**
 * The same question for the LANDING-PAGE template a deployment binds to.
 *
 * Here the selection IS the row, so this checks the record rather than an id
 * space. It was missing entirely: `saveDeployment` validated only that the
 * page's `template_id` named a renderer, so a disabled or archived template was
 * fully deployable and fully renderable.
 */
export const resolveLpTemplateSelection = async (
  payload: Payload,
  requestedRowId: unknown,
  currentRowId?: unknown,
): Promise<TemplateSelection> => {
  const requested = requestedRowId == null ? '' : String(requestedRowId)
  if (!requested) return { ok: false, error: 'pick a landing-page template for this deployment first' }
  const current = currentRowId == null ? '' : String(currentRowId)

  const record = await getLpTemplateRecord(payload, requested).catch(() => null)
  if (!record) return { ok: false, error: 'that landing-page template no longer exists' }
  if (record.rendererError) return { ok: false, error: `that template is broken: ${record.rendererError}` }
  if (requested !== current) {
    const problem = selectabilityProblem(record)
    if (problem) return { ok: false, error: `that template cannot be selected: ${problem}` }
  }
  return { ok: true, id: record.id }
}
