// @ts-nocheck -- new funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` on the server to restore typing.
'use server'

/**
 * CRUD for the two template libraries.
 *
 * Both libraries are records now, so both need the same seven verbs and both
 * need the same three refusals. Keeping them in one file is deliberate: the
 * rules below are the interesting part, and having written them twice is how
 * landing pages ended up with a delete that cascades and quizzes with no delete
 * at all.
 *
 * THE THREE RULES
 *
 * 1. Deleting a template that a deployment uses is refused, by name.
 *    `deleteLP` used to cascade-delete every referencing deployment. That was
 *    survivable while a row had one deployment; a template is shared by every
 *    brand, and these collections are `isAuthenticated` with no Site on them,
 *    so one operator tidying the library would have taken down other tenants'
 *    live pages. The refusal lists what is in the way.
 *
 * 2. Deleting a STOCK template archives it, never drops the row.
 *    `ensureTemplateRecords` materialises the library from the code registry on
 *    every boot, so a hard-deleted stock row comes straight back — a flip-flop
 *    that would look like the delete silently failing. An archived row is
 *    skipped by reconcile because it is still found by `stock_key`, so the
 *    removal sticks and is reversible.
 *
 * 3. Disable never touches the render gate.
 *    Disabling is about what a NEW deployment may choose. An existing live page
 *    on that template keeps serving and is warned about in the admin, because
 *    tidying a library is not a request to take pages down.
 */

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { canonicalTemplateId, resolveTemplate } from '@/lib/template-registry'
import { asSlotted } from '@/lib/lp-templates'
import { validateOverrides } from '@/lib/lp-slots/model'
import { QUIZ_TEMPLATE_ID_PATTERN } from '@/lib/template-records/id'

const LP_PATH = '/admin/landing-pages'
const QUIZ_PATH = '/admin/quizzes'

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'template'

/** A short suffix so a clone's id is stable, unique and readable in a log. */
const suffix = (): string => Math.random().toString(36).slice(2, 8)

/* ------------------------------------------------------- landing-page templates */

/**
 * What is standing in the way of deleting this landing-page template.
 *
 * Returns the deployments by name rather than a count. "3 deployments use this"
 * makes an operator go looking; naming them lets them act.
 */
const lpReferences = async (payload: unknown, id: string): Promise<string[]> => {
  const res = await (payload as { find: Function }).find({
    collection: 'funnel-lp-deployments',
    where: { landing_page: { equals: id } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs.map(
    (d: Record<string, unknown>) => String(d.name || '(unnamed)') + ` [${String(d.status ?? 'draft')}]`,
  )
}

export async function createLpTemplate(args: {
  name?: string
  rendererKey?: string
}): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // A blank template still has to name a renderer — there is no such thing as a
  // landing page drawn by nothing. The default is the library's first
  // long-form template, which is also the collection default.
  const rendererKey = args.rendererKey || 'editorial_investigation_v2'
  const template = canonicalTemplateId('lp', rendererKey)
  if (!template.ok) return { ok: false, error: template.error }

  const name = (args.name || '').trim() || 'Untitled template'
  const payload = await getPayload({ config })
  try {
    const created = await payload.create({
      collection: 'funnel-landing-pages',
      data: {
        name,
        slug: `${slugify(name)}-${suffix()}`,
        template_id: template.id,
        angle: 'pain',
        is_published: true,
        is_enabled: true,
        origin: 'blank',
        sections: [],
        slot_overrides: {},
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(LP_PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

export async function cloneLpTemplate(args: { id: string }): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({
      collection: 'funnel-landing-pages',
      id: args.id,
      depth: 0,
      overrideAccess: true,
    })
    if (!src) return { ok: false, error: 'template not found' }

    const name = `${String(src.name ?? 'Template')} copy`
    const created = await payload.create({
      collection: 'funnel-landing-pages',
      data: {
        name,
        slug: `${slugify(name)}-${suffix()}`,
        // The clone draws with the SAME renderer. A clone that changed what
        // draws it would be a different template wearing the original's name.
        template_id: src.template_id,
        angle: src.angle,
        is_published: true,
        is_enabled: true,
        origin: 'clone',
        // Never `stock_key`: a clone must not be adopted by reconcile as the
        // library's copy of that template.
        stock_key: null,
        sections: src.sections ?? [],
        slot_overrides: src.slot_overrides ?? {},
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(LP_PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' }
  }
}

export async function saveLpTemplate(args: {
  id: string
  patch: Record<string, unknown>
}): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const patch = args.patch || {}
  const data: Record<string, unknown> = {}

  if (typeof patch.name === 'string') data.name = patch.name
  if (typeof patch.slug === 'string' && patch.slug.trim()) data.slug = slugify(patch.slug)
  if (typeof patch.angle === 'string') data.angle = patch.angle
  if (Array.isArray(patch.sections)) data.sections = patch.sections

  if (patch.templateId != null) {
    const t = canonicalTemplateId('lp', patch.templateId)
    if (!t.ok) return { ok: false, error: t.error }
    data.template_id = t.id
  }

  /*
   * Template copy is validated against the template it belongs to, here, on the
   * way in. The publish preflight validates the MERGED map later, but a slot id
   * that names nothing should be refused by whoever typed it rather than
   * surviving until somebody tries to go live.
   */
  if (patch.slotOverrides != null) {
    const current = await payload
      .findByID({ collection: 'funnel-landing-pages', id: args.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!current) return { ok: false, error: 'template not found' }
    const targetId = (data.template_id as string) ?? current.template_id
    const res = resolveTemplate('lp', targetId)
    if (!res.ok || res.template.kind !== 'lp') return { ok: false, error: 'this template names no renderer' }
    if (res.template.template) {
      // Work in progress is saveable: completeness (every placeholder filled)
      // is the publish preflight's question, asked over the merged copy.
      const verdict = validateOverrides(asSlotted(res.template.template), patch.slotOverrides as never, { requireComplete: false })
      if (!verdict.ok) return { ok: false, error: verdict.problems.map((p) => p.detail).join('; ') }
    } else if (Object.keys(patch.slotOverrides as object).length > 0) {
      // The four identity templates have no slots. Accepting copy for them
      // would store text nothing can ever draw.
      return { ok: false, error: 'this template draws from sections, not slots' }
    }
    data.slot_overrides = patch.slotOverrides
  }

  try {
    await payload.update({
      collection: 'funnel-landing-pages',
      id: args.id,
      data: data as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(LP_PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function setLpTemplateEnabled(args: {
  id: string
  enabled: boolean
}): Promise<Result<{ warning: string | null }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    // Rule 3: enabling opens both gates, disabling touches only selectability.
    const data = args.enabled ? { is_enabled: true, is_published: true } : { is_enabled: false }
    await payload.update({
      collection: 'funnel-landing-pages',
      id: args.id,
      data: data as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(LP_PATH)

    let warning: string | null = null
    if (!args.enabled) {
      const refs = await lpReferences(payload, args.id)
      if (refs.length > 0) {
        warning = `${refs.length} deployment${refs.length === 1 ? '' : 's'} still render${refs.length === 1 ? 's' : ''} this template and will keep doing so: ${refs.join(', ')}`
      }
    }
    return { ok: true, warning }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'update failed' }
  }
}

export async function deleteLpTemplate(args: {
  id: string
}): Promise<Result<{ archived: boolean }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const row = await payload
      .findByID({ collection: 'funnel-landing-pages', id: args.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!row) return { ok: false, error: 'template not found' }

    // Rule 1.
    const refs = await lpReferences(payload, args.id)
    if (refs.length > 0) {
      return {
        ok: false,
        error: `This template cannot be deleted: ${refs.length} deployment${refs.length === 1 ? '' : 's'} still use${refs.length === 1 ? 's' : ''} it — ${refs.join(', ')}. Delete or repoint them first, or disable the template instead.`,
      }
    }

    // Rule 2.
    if (row.stock_key) {
      await payload.update({
        collection: 'funnel-landing-pages',
        id: args.id,
        data: { archived_at: new Date().toISOString(), is_enabled: false } as never,
        user: user as never,
        overrideAccess: false,
      })
      revalidatePath(LP_PATH)
      return { ok: true, archived: true }
    }

    await payload.delete({
      collection: 'funnel-landing-pages',
      id: args.id,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(LP_PATH)
    return { ok: true, archived: false }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

/* -------------------------------------------------------------- quiz templates */

const quizReferences = async (payload: unknown, templateId: string): Promise<string[]> => {
  const p = payload as { find: Function }
  const [standalone, embedded] = await Promise.all([
    p.find({
      collection: 'funnel-quiz-deployments',
      where: { template_id: { equals: templateId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
    // A landing page embedding a quiz stores the skin on its OWN deployment, so
    // checking only standalone deployments would let a delete break every
    // embedded quiz drawn in that skin.
    p.find({
      collection: 'funnel-lp-deployments',
      where: { embedded_quiz_template_id: { equals: templateId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  return [
    ...standalone.docs.map((d: Record<string, unknown>) => `${String(d.name || '(unnamed)')} [quiz]`),
    ...embedded.docs.map((d: Record<string, unknown>) => `${String(d.name || '(unnamed)')} [landing page]`),
  ]
}

export async function createQuizTemplate(args: {
  name?: string
  rendererKey?: string
}): Promise<Result<{ id: string; templateId: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const rendererKey = args.rendererKey || 'sq_editorial_inline'
  const res = resolveTemplate('quiz', rendererKey)
  if (!res.ok) return { ok: false, error: res.error }

  const name = (args.name || '').trim() || 'Untitled quiz template'
  const templateId = `${slugify(name).replace(/-/g, '_')}_${suffix()}`
  if (!QUIZ_TEMPLATE_ID_PATTERN.test(templateId)) {
    return { ok: false, error: `could not derive a valid template id from "${name}"` }
  }

  const payload = await getPayload({ config })
  try {
    const created = await payload.create({
      collection: 'funnel-quiz-templates',
      data: {
        name,
        template_id: templateId,
        renderer_key: res.template.id,
        code: 'CUSTOM',
        blurb: '',
        is_enabled: true,
        origin: 'blank',
        config_overrides: {},
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(QUIZ_PATH)
    return { ok: true, id: String(created.id), templateId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

export async function cloneQuizTemplate(args: {
  id: string
}): Promise<Result<{ id: string; templateId: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({
      collection: 'funnel-quiz-templates',
      id: args.id,
      depth: 0,
      overrideAccess: true,
    })
    if (!src) return { ok: false, error: 'template not found' }

    const name = `${String(src.name ?? 'Template')} copy`
    /*
     * A NEW template_id over the SAME renderer_key. This is the whole reason the
     * two fields are separate: the clone is a distinct thing a deployment can
     * select and rename, drawn by a renderer that already exists in code.
     */
    const templateId = `${String(src.renderer_key)}_copy_${suffix()}`
    const created = await payload.create({
      collection: 'funnel-quiz-templates',
      data: {
        name,
        template_id: templateId,
        renderer_key: src.renderer_key,
        code: src.code ?? 'CUSTOM',
        blurb: src.blurb ?? '',
        is_enabled: true,
        origin: 'clone',
        stock_key: null,
        config_overrides: src.config_overrides ?? {},
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(QUIZ_PATH)
    return { ok: true, id: String(created.id), templateId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' }
  }
}

export async function saveQuizTemplate(args: {
  id: string
  patch: Record<string, unknown>
}): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const data: Record<string, unknown> = {}
  const patch = args.patch || {}

  if (typeof patch.name === 'string') data.name = patch.name
  if (typeof patch.blurb === 'string') data.blurb = patch.blurb
  if (typeof patch.code === 'string') data.code = patch.code
  if (patch.configOverrides != null) data.config_overrides = patch.configOverrides

  if (patch.rendererKey != null) {
    const res = resolveTemplate('quiz', patch.rendererKey)
    if (!res.ok) return { ok: false, error: res.error }
    data.renderer_key = res.template.id
  }

  // `template_id` is deliberately absent: it is what deployments store, so
  // letting it be edited would silently unbind every deployment that chose it.

  const payload = await getPayload({ config })
  try {
    await payload.update({
      collection: 'funnel-quiz-templates',
      id: args.id,
      data: data as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(QUIZ_PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function setQuizTemplateEnabled(args: {
  id: string
  enabled: boolean
}): Promise<Result<{ warning: string | null }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const row = await payload
      .findByID({ collection: 'funnel-quiz-templates', id: args.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!row) return { ok: false, error: 'template not found' }

    await payload.update({
      collection: 'funnel-quiz-templates',
      id: args.id,
      data: { is_enabled: args.enabled } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(QUIZ_PATH)

    let warning: string | null = null
    if (!args.enabled) {
      const refs = await quizReferences(payload, String(row.template_id))
      if (refs.length > 0) {
        warning = `${refs.length} deployment${refs.length === 1 ? '' : 's'} still render${refs.length === 1 ? 's' : ''} this template and will keep doing so: ${refs.join(', ')}`
      }
    }
    return { ok: true, warning }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'update failed' }
  }
}

export async function deleteQuizTemplate(args: {
  id: string
}): Promise<Result<{ archived: boolean }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const row = await payload
      .findByID({ collection: 'funnel-quiz-templates', id: args.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!row) return { ok: false, error: 'template not found' }

    const refs = await quizReferences(payload, String(row.template_id))
    if (refs.length > 0) {
      return {
        ok: false,
        error: `This template cannot be deleted: ${refs.length} deployment${refs.length === 1 ? '' : 's'} still use${refs.length === 1 ? 's' : ''} it — ${refs.join(', ')}. Delete or repoint them first, or disable the template instead.`,
      }
    }

    if (row.stock_key) {
      await payload.update({
        collection: 'funnel-quiz-templates',
        id: args.id,
        data: { archived_at: new Date().toISOString(), is_enabled: false } as never,
        user: user as never,
        overrideAccess: false,
      })
      revalidatePath(QUIZ_PATH)
      return { ok: true, archived: true }
    }

    await payload.delete({
      collection: 'funnel-quiz-templates',
      id: args.id,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(QUIZ_PATH)
    return { ok: true, archived: false }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}
