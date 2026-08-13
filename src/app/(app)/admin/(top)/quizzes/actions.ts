// @ts-nocheck -- new funnel-* collection slugs are not in committed payload-types
// yet; run `pnpm generate:types` on the server to restore typing.
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { invokeLLM } from '@/lib/ai/invoke'
import { canonicalTemplateId } from '@/lib/template-registry'
import { getQuizTemplateRecordByTemplateId, selectabilityProblem } from '@/lib/template-records'
import { relationId, requireDeploymentSiteAdmin } from '@/lib/authz'

const PATH = '/admin/quizzes'

const numFromBrandId = (brandId) => {
  if (typeof brandId !== 'string') return null
  const n = Number(brandId.replace('site_', ''))
  return Number.isFinite(n) ? n : null
}

/**
 * The template id this deployment is allowed to STORE.
 *
 * Records first, code registry second, and never a silent default.
 *
 * The records are asked first because a quiz template is a row now: a clone
 * carries its own `template_id` and deliberately names no code renderer, so
 * resolving against the registry alone - which is what this did - refuses every
 * template an operator created and accepts only the twenty stock ids.
 *
 * The registry is still consulted when no row matches, for two real cases: the
 * six legacy aliases still stored on live deployments, and the window between a
 * deploy and the first `ensureTemplateRecords` run, where the stock ids resolve
 * in code before their rows exist.
 *
 * Selectability (disabled / deleted) is enforced only when the id is CHANGING.
 * Disabling a template is a statement about what new deployments may choose;
 * blocking an unrelated path or status edit on a deployment that was already on
 * it would make tidying the library take working pages hostage.
 */
const resolveDeploymentTemplateId = async (payload, requestedRaw, currentStoredId) => {
  const requested = typeof requestedRaw === 'string' ? requestedRaw.trim() : ''
  if (!requested) return { ok: false, error: 'pick a visual template for this deployment first' }

  // Tolerates the table not existing (the funnel_* schema drift): a missing
  // library falls through to the registry rather than failing every save.
  const record = await getQuizTemplateRecordByTemplateId(payload, requested).catch(() => null)
  if (record) {
    if (record.rendererError) {
      return { ok: false, error: `that template is broken: ${record.rendererError}` }
    }
    if (requested !== currentStoredId) {
      const problem = selectabilityProblem(record)
      if (problem) return { ok: false, error: `that template cannot be selected: ${problem}` }
    }
    return { ok: true, id: record.templateId }
  }

  return canonicalTemplateId('quiz', requested)
}

// ---------------------------------------------------------------------------
// Quizzes (brandless)
// ---------------------------------------------------------------------------
export async function createQuiz(args: { quiz: Record<string, unknown> }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const q = args.quiz || {}
  const payload = await getPayload({ config })
  try {
    const created = await payload.create({
      collection: 'funnel-quizzes',
      data: {
        name: q.name || 'New Quiz',
        slug: q.slug || `quiz-${Date.now().toString(36)}`,
        is_published: Boolean(q.isPublished),
        is_archived: false,
        tiers: q.tiers ?? [],
        steps: q.steps ?? [],
        nodes: q.nodes ?? [],
        custom_fields: q.customFields ?? [],
      },
      user,
      overrideAccess: false,
    })
    revalidatePath(PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

export async function saveQuiz(args: { id: string; patch: Record<string, unknown> }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    await payload.update({ collection: 'funnel-quizzes', id: args.id, data: args.patch, user, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function cloneQuiz(args: { id: string }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({ collection: 'funnel-quizzes', id: args.id, overrideAccess: true })
    if (!src) return { ok: false, error: 'not found' }
    const created = await payload.create({
      collection: 'funnel-quizzes',
      data: {
        name: `${src.name} (copy)`,
        slug: `${src.slug}-copy-${Date.now().toString(36).slice(-4)}`,
        is_published: false,
        // A clone starts active even when cloned from an archived quiz: the
        // point of cloning an archive is to bring the work back into use.
        is_archived: false,
        tiers: src.tiers ?? [],
        steps: src.steps ?? [],
        nodes: src.nodes ?? [],
        custom_fields: src.custom_fields ?? [],
      },
      user,
      overrideAccess: false,
    })
    revalidatePath(PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' }
  }
}

/**
 * Archive or restore a quiz.
 *
 * Archiving always forces `is_published: false` in the same write. Archive means
 * retired, and a retired quiz that is still published would keep serving traffic
 * from its deployments - so the two flags are set together rather than trusting
 * the caller to remember. Restoring deliberately does NOT re-publish: it comes
 * back as a draft so republishing is an explicit decision.
 */
export async function setQuizArchived(args: { id: string; archived: boolean }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const archived = Boolean(args.archived)
    await payload.update({
      collection: 'funnel-quizzes',
      id: args.id,
      data: archived
        ? { is_archived: true, archived_at: new Date().toISOString(), is_published: false }
        : { is_archived: false, archived_at: null },
      user,
      overrideAccess: false,
    })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'archive failed' }
  }
}

export async function deleteQuiz(args: { id: string }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const deps = await payload.find({ collection: 'funnel-quiz-deployments', where: { quiz: { equals: args.id } }, limit: 500, overrideAccess: true })
    for (const d of deps.docs) await payload.delete({ collection: 'funnel-quiz-deployments', id: d.id, user, overrideAccess: false })
    await payload.delete({ collection: 'funnel-quizzes', id: args.id, user, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

// ---------------------------------------------------------------------------
// Quiz deployments
// ---------------------------------------------------------------------------
export async function saveQuizDeployment(args: { deployment: Record<string, unknown> }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const dep = args.deployment || {}
  const payload = await getPayload({ config })

  const siteId = numFromBrandId(dep.brandId)
  const isExisting = typeof dep.id === 'string' && /^\d+$/.test(dep.id)

  // The three funnel deployment collections are `isAuthenticated` on every verb,
  // so `overrideAccess: false` alone lets any logged-in user write any tenant's
  // deployment. Both the incoming Site and, on an update, the one already on the
  // row must belong to the caller.
  const gate = await requireDeploymentSiteAdmin(payload, user, {
    collection: 'funnel-quiz-deployments',
    existingId: isExisting ? dep.id : undefined,
    incomingSiteId: siteId,
  })
  if (!gate.ok) return gate

  // What the row already stores, so a template that has since been disabled does
  // not block an edit that leaves the choice alone. Read separately from the
  // authz gate on purpose: that helper derives the Site and returns nothing else,
  // and widening it for one caller's convenience is how a gate grows a bypass.
  let currentTemplateId = ''
  if (isExisting) {
    const existing = await payload
      .findByID({ collection: 'funnel-quiz-deployments', id: dep.id, depth: 0, overrideAccess: true })
      .catch(() => null)
    currentTemplateId = typeof existing?.template_id === 'string' ? existing.template_id : ''
  }

  // A template id that names nothing must stop the save. It used to default to
  // `'default'` and resolve silently at render time, so a typo produced a page
  // that looked wrong with nothing anywhere saying why.
  const template = await resolveDeploymentTemplateId(payload, dep.templateId, currentTemplateId)
  if (!template.ok) return { ok: false, error: template.error }

  // The host is resolved with `overrideAccess: true`, so the row it finds may
  // belong to ANY tenant. Binding a deployment to another brand's domain wrote a
  // cross-tenant reference that the resolver happens to ignore today; a check
  // here is cheaper than relying on that staying true.
  let domainId = null
  if (typeof dep.domain === 'string' && dep.domain) {
    const dr = await payload.find({ collection: 'domains', where: { host: { equals: dep.domain } }, limit: 1, overrideAccess: true })
    const found = dr.docs[0]
    if (found) {
      if (relationId(found.site) !== gate.siteId) return { ok: false, error: 'that domain belongs to a different brand' }
      domainId = Number(found.id)
    }
  }

  const data = {
    name: dep.name || '',
    quiz: dep.quizId ? Number(dep.quizId) : null,
    site: gate.siteId,
    domain: domainId,
    path: dep.path || '',
    render_mode: dep.renderMode || 'standalone',
    // Canonical, so the alias table is consulted once here rather than on every
    // read for the rest of the row's life.
    template_id: template.id,
    // Null rather than '' so "use the template's" is one value, not two.
    progress_form: (dep.progressForm as string) || null,
    status: dep.status || 'draft',
    embed_preview_bg: dep.embedPreviewBg || '',
    destination_overrides: dep.destinationOverrides ?? null,
    // header_config / footer_config / body_section_overrides are deliberately
    // absent. The columns are deprecated (Brand Identity owns page chrome and
    // body sections); writing `{}` into them on every save kept resurrecting an
    // empty header strip and would overwrite what an author wrote before the
    // move. Omitting the keys leaves the stored values untouched.
    utm: dep.utm ?? {},
    pixels: dep.pixels ?? {},
  }

  try {
    let id
    if (isExisting) {
      await payload.update({ collection: 'funnel-quiz-deployments', id: dep.id, data, user, overrideAccess: false })
      id = dep.id
    } else {
      const created = await payload.create({ collection: 'funnel-quiz-deployments', data, user, overrideAccess: false })
      id = String(created.id)
    }
    revalidatePath(PATH)
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function deleteQuizDeployment(args: { id: string }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  // No gate at all before this: the collections are `isAuthenticated` on every
  // verb, so any logged-in user could delete any tenant's deployment. A delete
  // carries no incoming Site, so the record's own is the subject.
  const gate = await requireDeploymentSiteAdmin(payload, user, { collection: 'funnel-quiz-deployments', existingId: args.id })
  if (!gate.ok) return gate
  try {
    await payload.delete({ collection: 'funnel-quiz-deployments', id: args.id, user, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

// ---------------------------------------------------------------------------
// Per-node AI test (AIEditor + preview runtime). Plain-text result via invokeLLM.
// ---------------------------------------------------------------------------
export async function aiTestPrompt(args: { prompt: string; model?: string }) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  try {
    const out = await invokeLLM({
      system: 'You process quiz answer data. Follow the user instruction exactly and return only the result string. Do not use em dashes.',
      user: args.prompt,
      schema: z.object({ result: z.string() }),
      schemaName: 'ai_result',
      model: 'claude-sonnet-4-6',
      maxTokens: 1000,
      enforceNoBannedVocab: true,
    })
    return { ok: true, text: out.result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'AI failed' }
  }
}
