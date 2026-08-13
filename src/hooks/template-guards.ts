// @ts-nocheck -- the funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` to restore typing.
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'
import { APIError } from 'payload'

/**
 * The template library's rules, enforced on every door rather than one.
 *
 * The server actions in `admin/(top)/template-actions.ts` refuse to delete a
 * referenced template and archive stock rows instead of dropping them. An
 * adversarial pass pointed out that those refusals only exist in the actions,
 * and both collections are `isAuthenticated` on all four verbs with no `site`
 * on them — so `DELETE /api/funnel-landing-pages/:id` and the raw `/cms` UI
 * walked straight past all of it.
 *
 * That matters far more after this change than before it. A
 * `funnel-landing-pages` row used to be one brand's page; it is now the
 * TEMPLATE every brand deploys, and the foreign key is `ON DELETE SET NULL`.
 * So one authenticated user — an analyst bound to a single Site — deleting a
 * row in `/cms` would null out `landing_page_id` on every other tenant's
 * deployment of it and 404 their live pages, with the reference destroyed
 * rather than archived.
 *
 * A hook is the only check that covers every writer, which is the same
 * reasoning the `template_id` field validators are written down with. What the
 * actions keep is the good ERROR MESSAGE — naming the deployments in the way —
 * because a hook cannot offer to fix anything.
 */

const asId = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? String((v as { id: unknown }).id ?? '') : String(v)

/**
 * Deployments standing in the way of removing a landing-page template.
 *
 * `overrideAccess: true` on purpose: the question is whether the row is
 * referenced AT ALL, and a caller who can only see their own tenant's
 * deployments would be told a template is free when it is not.
 */
const lpReferenceCount = async (req: { payload: unknown }, id: unknown): Promise<number> => {
  const res = await (req.payload as { find: Function })
    .find({
      collection: 'funnel-lp-deployments',
      where: { landing_page: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return res?.totalDocs ?? 0
}

const quizReferenceCount = async (req: { payload: unknown }, templateId: string): Promise<number> => {
  if (!templateId) return 0
  const p = req.payload as { find: Function }
  const [standalone, embedded] = await Promise.all([
    p
      .find({
        collection: 'funnel-quiz-deployments',
        where: { template_id: { equals: templateId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
    // An embedded quiz stores its skin on the LANDING PAGE's deployment, so
    // checking only standalone deployments would let a delete break every
    // landing page drawn in that skin.
    p
      .find({
        collection: 'funnel-lp-deployments',
        where: { embedded_quiz_template_id: { equals: templateId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
  ])
  return (standalone?.totalDocs ?? 0) + (embedded?.totalDocs ?? 0)
}

/** Deleting a referenced landing-page template is refused, by every door. */
export const guardLpTemplateDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const count = await lpReferenceCount(req, id)
  if (count > 0) {
    throw new APIError(
      `This landing-page template cannot be deleted: ${count} deployment${count === 1 ? '' : 's'} still use${count === 1 ? 's' : ''} it. Repoint or delete them first, or disable the template instead.`,
      409,
    )
  }
}

/** Same rule for quiz templates, including landing pages that embed the skin. */
export const guardQuizTemplateDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const row = await (req.payload as { findByID: Function })
    .findByID({ collection: 'funnel-quiz-templates', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  const count = await quizReferenceCount(req, String(row?.template_id ?? ''))
  if (count > 0) {
    throw new APIError(
      `This quiz template cannot be deleted: ${count} deployment${count === 1 ? '' : 's'} still use${count === 1 ? 's' : ''} it. Repoint or delete them first, or disable the template instead.`,
      409,
    )
  }
}

/**
 * A stock row's IDENTITY is not editable, by any door.
 *
 * `template_id` on a stock landing-page row decides what every deployment of it
 * renders, so a single `PATCH` could put a different firm's design on every
 * tenant's live page — and it would pass the field validator, which only asks
 * whether the new id resolves. `stock_key` is what reconcile matches on, so
 * changing it makes the library grow a duplicate on the next boot.
 *
 * Editable content — name, slug, angle, sections, slot copy, enabled — is
 * untouched: an operator is meant to rewrite a stock template's words.
 */
export const guardStockLpTemplateIdentity: CollectionBeforeChangeHook = async ({ req, data, originalDoc, operation }) => {
  if (operation !== 'update' || !originalDoc?.stock_key) return data

  const changed: string[] = []
  if ('template_id' in data && data.template_id !== originalDoc.template_id) changed.push('its design')
  if ('stock_key' in data && data.stock_key !== originalDoc.stock_key) changed.push('its library id')

  if (changed.length > 0) {
    throw new APIError(
      `"${String(originalDoc.name ?? 'This template')}" is part of the shipped library, so ${changed.join(' and ')} cannot be changed — every deployment of it would render something else. Clone it and change the clone.`,
      409,
    )
  }
  return data
}

export const guardStockQuizTemplateIdentity: CollectionBeforeChangeHook = async ({ data, originalDoc, operation }) => {
  if (operation !== 'update' || !originalDoc?.stock_key) return data

  const changed: string[] = []
  if ('template_id' in data && data.template_id !== originalDoc.template_id) changed.push('its stored id')
  if ('renderer_key' in data && data.renderer_key !== originalDoc.renderer_key) changed.push('its renderer')
  if ('stock_key' in data && data.stock_key !== originalDoc.stock_key) changed.push('its library id')

  if (changed.length > 0) {
    throw new APIError(
      `"${String(originalDoc.name ?? 'This template')}" is part of the shipped library, so ${changed.join(' and ')} cannot be changed — every deployment of it would render something else. Clone it and change the clone.`,
      409,
    )
  }
  return data
}

/**
 * Template-level slot copy must fit the template it belongs to.
 *
 * The server action validates this; `/cms` and `POST /api/...` did not, and the
 * copy reaches every deployment that has not overridden that slot. An override
 * naming a slot that does not exist is text nobody will ever see, on pages
 * across every tenant.
 */
export const guardLpSlotOverrides: CollectionBeforeChangeHook = async ({ data, originalDoc }) => {
  if (data?.slot_overrides == null) return data

  const { resolveTemplate } = await import('@/lib/template-registry')
  const { asSlotted } = await import('@/lib/lp-templates')
  const { validateOverrides } = await import('@/lib/lp-slots/model')

  const templateId = data.template_id ?? originalDoc?.template_id
  const res = resolveTemplate('lp', templateId)
  if (!res.ok || res.template.kind !== 'lp') return data

  const ported = res.template.template
  if (!ported) {
    if (Object.keys(data.slot_overrides as object).length > 0) {
      throw new APIError('This template draws from sections, not slots, so slot copy would never appear.', 400)
    }
    return data
  }

  const verdict = validateOverrides(asSlotted(ported), data.slot_overrides as never)
  if (!verdict.ok) {
    throw new APIError(verdict.problems.map((p: { detail: string }) => p.detail).join('; '), 400)
  }
  return data
}
