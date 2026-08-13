// @ts-nocheck -- new funnel-* collection slugs are not in the committed
// payload-types yet; run `pnpm generate:types` on the server to restore typing.
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { invokeLLM } from '@/lib/ai/invoke'
import { canonicalTemplateId, resolveTemplate } from '@/lib/template-registry'
import { relationId, requireDeploymentSiteAdmin } from '@/lib/authz'
import { asSlotted } from '@/lib/lp-templates'
import { validateOverrides } from '@/lib/lp-slots/model'

const PATH = '/admin/landing-pages'

type LP = Record<string, unknown>

const numFromBrandId = (brandId: unknown): number | null => {
  if (typeof brandId !== 'string') return null
  const n = Number(brandId.replace('site_', ''))
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Landing pages (brandless)
// ---------------------------------------------------------------------------
export async function createLP(args: { lp: LP }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const lp = args.lp || {}
  const payload = await getPayload({ config })

  // `'bold_modern'` is the collection default and names no template. It is an
  // explicit alias now, so it still resolves, and it is canonicalised on the way
  // in so a page created today does not need the alias tomorrow.
  const template = canonicalTemplateId('lp', (lp.templateId as string) || 'bold_modern')
  if (!template.ok) return { ok: false, error: template.error }

  try {
    const created = (await payload.create({
      collection: 'funnel-landing-pages',
      data: {
        name: (lp.name as string) || 'Untitled LP',
        slug: (lp.slug as string) || `lp-${Date.now().toString(36)}`,
        template_id: template.id,
        angle: (lp.angle as string) || 'pain',
        is_published: Boolean(lp.isPublished),
        sections: lp.sections ?? [],
      } as never,
      user: user as never,
      overrideAccess: false,
    })) as { id: number | string }
    revalidatePath(PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

export async function saveLP(args: { id: string; patch: Record<string, unknown> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  // A patch may or may not carry a template. When it does, it goes through the
  // same gate a create does; a partial update is not a way around validation.
  const patch = { ...(args.patch || {}) }
  if ('template_id' in patch) {
    const template = canonicalTemplateId('lp', patch.template_id)
    if (!template.ok) return { ok: false, error: template.error }
    patch.template_id = template.id
  }

  try {
    await payload.update({ collection: 'funnel-landing-pages', id: args.id, data: patch as never, user: user as never, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function cloneLP(args: { id: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = (await payload.findByID({ collection: 'funnel-landing-pages', id: args.id, overrideAccess: true })) as Record<string, unknown>
    if (!src) return { ok: false, error: 'not found' }
    // A clone is a new row, so it gets the canonical id rather than inheriting a
    // legacy one. A source row whose template no longer resolves cannot be
    // cloned into the same broken state: the clone is refused and names the id.
    const template = canonicalTemplateId('lp', src.template_id)
    if (!template.ok) return { ok: false, error: `cannot clone: ${template.error}` }
    const created = (await payload.create({
      collection: 'funnel-landing-pages',
      data: {
        name: `${src.name} (copy)`,
        slug: `${src.slug}-copy-${Date.now().toString(36).slice(-4)}`,
        template_id: template.id,
        angle: src.angle,
        is_published: false,
        sections: src.sections ?? [],
      } as never,
      user: user as never,
      overrideAccess: false,
    })) as { id: number | string }
    revalidatePath(PATH)
    return { ok: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' }
  }
}

export async function deleteLP(args: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    // Remove deployments that reference this page first.
    const deps = await payload.find({ collection: 'funnel-lp-deployments', where: { landing_page: { equals: args.id } }, limit: 500, overrideAccess: true })
    for (const d of deps.docs) {
      await payload.delete({ collection: 'funnel-lp-deployments', id: d.id, user: user as never, overrideAccess: false })
    }
    await payload.delete({ collection: 'funnel-landing-pages', id: args.id, user: user as never, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------
export async function saveDeployment(args: { deployment: Record<string, unknown> }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const dep = args.deployment || {}
  const payload = await getPayload({ config })

  const siteId = numFromBrandId(dep.brandId)
  const isExisting = typeof dep.id === 'string' && /^\d+$/.test(dep.id)

  const gate = await requireDeploymentSiteAdmin(payload, user, {
    collection: 'funnel-lp-deployments',
    existingId: isExisting ? dep.id : undefined,
    incomingSiteId: siteId,
  })
  if (!gate.ok) return gate

  // The template lives on the brandless page, not on the deployment, so this is
  // where a deployment learns its page's template does not resolve. Publishing
  // that would put a page nobody chose on a real host; refusing at save is the
  // earliest point the operator can be told which id is wrong.
  const lpId = dep.landingPageId ? Number(dep.landingPageId) : null
  let overrides: Record<string, string> = {}
  if (lpId !== null && Number.isFinite(lpId)) {
    const lpDoc = (await payload
      .findByID({ collection: 'funnel-landing-pages', id: lpId, overrideAccess: true })
      .catch(() => null)) as Record<string, unknown> | null
    if (!lpDoc) return { ok: false, error: 'landing page not found' }
    const template = canonicalTemplateId('lp', lpDoc.template_id)
    if (!template.ok) return { ok: false, error: `landing page template: ${template.error}` }

    // Deployment copy is validated against the template it deploys, here, at the
    // point the operator can still fix it. An override naming a slot that does
    // not exist is copy that will never appear on the page; accepting it
    // silently is how a deployment ends up saying something nobody can find in
    // the editor.
    const raw = (dep.contentOverrides ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') overrides[k] = v
      else return { ok: false, error: `content override "${k}" is not text` }
    }
    // Through the registry, not by indexing the library's own map. The map is a
    // second lookup with a second idea of which ids exist, which is what the
    // registry exists to remove - and `pnpm test:registry` fails on any module
    // outside it that reaches for one.
    const entry = resolveTemplate('lp', template.id)
    const ported = entry.ok && entry.template.kind === 'lp' ? entry.template.template : null
    if (ported) {
      const v = validateOverrides(asSlotted(ported), overrides)
      if (!v.ok) return { ok: false, error: v.problems.map((p) => p.detail).join('; ') }
    } else if (Object.keys(overrides).length > 0) {
      // A legacy identity template has no slots: its copy travels as nodes on
      // the page itself. Overrides would silently do nothing.
      return { ok: false, error: `template "${template.id}" has no content slots to override` }
    }
  }

  // The embedded quiz's skin. Validated exactly as the standalone one is: a
  // skin that names nothing would draw the embed in a template nobody chose.
  let embeddedTemplateId = ''
  if (dep.embeddedQuizTemplateId) {
    const t = canonicalTemplateId('quiz', dep.embeddedQuizTemplateId)
    if (!t.ok) return { ok: false, error: `embedded quiz template: ${t.error}` }
    embeddedTemplateId = t.id
  }

  // A quiz flow this deployment names must belong to nobody in particular — the
  // flows are brandless — but it must EXIST, or the page renders without the
  // thing it is for.
  const quizId = dep.quizId ? Number(dep.quizId) : null
  if (quizId !== null) {
    if (!Number.isFinite(quizId)) return { ok: false, error: 'quiz flow id is not a number' }
    const q = await payload.findByID({ collection: 'funnel-quizzes', id: quizId, overrideAccess: true }).catch(() => null)
    if (!q) return { ok: false, error: 'quiz flow not found' }
  }

  // Resolve the host string from the editor back to a domain record id.
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

  /*
   * `quiz_deployment_id` IS A MIGRATION FALLBACK AND NOTHING ELSE.
   *
   * It is never read from the request. The comment above this object used to
   * say exactly that while the line below it wrote the client's value straight
   * through, which is how three of four live rows ended up pointing at
   * standalone quiz deployments that had since been deleted: the id was carried
   * forward by every save, and nothing ever checked the target still existed.
   *
   * On CREATE it is not written at all — a new deployment binds a flow, and
   * requiring a second published quiz page first is the thing this replaced.
   * On UPDATE it is CLEARED once the row names a flow, because the flow is now
   * the answer and a stale pointer beside it is a second one. A row that still
   * names no flow keeps its pointer untouched: it is the only binding that row
   * has, and dropping it would take the page's funnel away.
   */
  const data: Record<string, unknown> = {
    name: (dep.name as string) || '',
    landing_page: lpId,
    site: gate.siteId,
    domain: domainId,
    path: (dep.path as string) || '',
    quiz: quizId,
    embedded_quiz_template_id: embeddedTemplateId,
    embedded_progress_form: (dep.embeddedProgressForm as string) || null,
    content_overrides: overrides,
    status: (dep.status as string) || 'draft',
  }
  if (quizId !== null) data.quiz_deployment_id = ''

  try {
    let id: string
    if (isExisting) {
      await payload.update({ collection: 'funnel-lp-deployments', id: dep.id as string, data: data as never, user: user as never, overrideAccess: false })
      id = dep.id as string
    } else {
      const created = (await payload.create({ collection: 'funnel-lp-deployments', data: data as never, user: user as never, overrideAccess: false })) as { id: number | string }
      id = String(created.id)
    }
    revalidatePath(PATH)
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}

export async function deleteDeployment(args: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  // No gate at all before this: the collections are `isAuthenticated` on every
  // verb, so any logged-in user could delete any tenant's deployment. A delete
  // carries no incoming Site, so the record's own is the subject.
  const gate = await requireDeploymentSiteAdmin(payload, user, { collection: 'funnel-lp-deployments', existingId: args.id })
  if (!gate.ok) return gate
  try {
    await payload.delete({ collection: 'funnel-lp-deployments', id: args.id, user: user as never, overrideAccess: false })
    revalidatePath(PATH)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}

// ---------------------------------------------------------------------------
// AI: generate a full LP copy set + rewrite a single section. Routed through
// invokeLLM so the banned-vocab / em-dash guards apply.
// ---------------------------------------------------------------------------
const LPCopySchema = z.object({
  hero: z.object({
    eyebrow: z.string(), headline: z.string(), accent_phrase: z.string(), subheadline: z.string(),
    stat1_num: z.string(), stat1_label: z.string(), stat2_num: z.string(), stat2_label: z.string(),
    stat3_num: z.string(), stat3_label: z.string(), trust_line: z.string(),
  }),
  story: z.object({ eyebrow: z.string(), headline: z.string(), paragraphs: z.array(z.string()) }),
  eligibility: z.object({ eyebrow: z.string(), headline: z.string(), criteria: z.array(z.string()) }),
  how_it_works: z.object({ eyebrow: z.string(), headline: z.string(), steps: z.array(z.object({ title: z.string(), desc: z.string() })) }),
  guarantee: z.object({ headline: z.string(), subhead: z.string(), lines: z.array(z.string()) }),
  faq: z.object({ eyebrow: z.string(), headline: z.string(), items: z.array(z.object({ q: z.string(), a: z.string() })) }),
  final_cta: z.object({ headline: z.string(), cta_label: z.string(), secondary_line: z.string() }),
})

export async function generateLPCopy(args: { angle: string; templateId: string; notes?: string }): Promise<
  { ok: true; copy: z.infer<typeof LPCopySchema> } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  try {
    const copy = await invokeLLM({
      system:
        'You are an expert direct-response copywriter for Motor Vehicle Accident (MVA) legal lead-gen landing pages in the United States. Write attorney-advertising-compliant copy with no guaranteed-result claims. Never use em dashes. Use {{brand.callNumber}} placeholders where a phone would appear. US English.',
      user: `Angle: ${args.angle}\nTemplate: ${args.templateId}\nOperator notes: ${args.notes || 'none'}\n\nGenerate the landing page copy.`,
      schema: LPCopySchema,
      schemaName: 'lp_copy',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      enforceNoBannedVocab: true,
    })
    return { ok: true, copy }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'generation failed' }
  }
}

/**
 * Write or rewrite one section, element by element.
 *
 * The older `aiRewriteSection` below returns a bag of named copy keys, which
 * only made sense while a section WAS a bag of named copy keys. A section is
 * now a list of nodes, so the model is given the nodes - their ids, their types
 * and the exact fields each type accepts - and must answer with the same ids.
 *
 * Ids are the contract. Anything the model invents is dropped by the caller
 * rather than merged, so a hallucinated element cannot appear on a page, and a
 * field name outside the element's spec cannot be written into it. That keeps a
 * generated section structurally identical to the one the operator laid out:
 * the model fills the skeleton, it does not get to change it.
 */
const NodeCopySchema = z.object({
  elements: z.array(
    z.object({
      id: z.string(),
      fields: z.record(z.string()),
    }),
  ),
})

export async function aiWriteSectionNodes(args: {
  sectionType: string
  instruction: string
  elements: Array<{ id: string; type: string; fields: string[]; current: Record<string, string> }>
}): Promise<{ ok: true; elements: Array<{ id: string; fields: Record<string, string> }> } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!Array.isArray(args.elements) || args.elements.length === 0) {
    return { ok: false, error: 'This section has no elements to write into.' }
  }
  try {
    const result = await invokeLLM({
      system:
        'You are an expert direct-response copywriter for Motor Vehicle Accident legal lead-gen landing pages in the United States. Write attorney-advertising-compliant copy with no guaranteed-result claims and no implication that you are a law firm. Never use em dashes. Use the {{brand.callNumber}} placeholder wherever a phone number belongs, and {{brand.displayName}} for the brand name, because the page is written once and deployed under several brands. US English.',
      user: [
        `Section layout: ${args.sectionType}`,
        `Operator instruction: ${args.instruction || 'Write this section.'}`,
        '',
        'Write copy for each element below. Return every id exactly as given. Do not invent elements, do not drop elements, and only use the field names listed for each one. Keep each field to the length its role implies: a heading is one line, a paragraph is one or two sentences, a card body is short.',
        '',
        JSON.stringify(args.elements, null, 2),
      ].join('\n'),
      schema: NodeCopySchema,
      schemaName: 'section_nodes',
      model: 'claude-sonnet-4-6',
      maxTokens: 3000,
      enforceNoBannedVocab: true,
    })

    // Only ids the caller asked about survive, and within them only fields the
    // element's spec declares. The model does not get to widen the shape.
    const allowed = new Map(args.elements.map((e) => [e.id, new Set(e.fields)]))
    const elements = (result.elements || [])
      .filter((e) => allowed.has(e.id))
      .map((e) => {
        const keys = allowed.get(e.id)!
        const fields: Record<string, string> = {}
        for (const [k, v] of Object.entries(e.fields || {})) if (keys.has(k) && typeof v === 'string') fields[k] = v
        return { id: e.id, fields }
      })
      .filter((e) => Object.keys(e.fields).length > 0)

    if (elements.length === 0) return { ok: false, error: 'Claude returned nothing that matched this section.' }
    return { ok: true, elements }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'write failed' }
  }
}

export async function aiRewriteSection(args: { sectionType: string; currentCopy: Record<string, unknown>; instruction: string }): Promise<
  { ok: true; copy: Record<string, unknown> } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  try {
    const copy = await invokeLLM({
      system:
        'You are an expert direct-response copywriter editing one section of a US Motor Vehicle Accident legal landing page. Return ONLY a JSON object with the same keys as the current copy. Never use em dashes. Attorney-advertising compliant, no guaranteed results. Keep {{brand.*}} placeholders intact.',
      user: `Section type: ${args.sectionType}\nOperator instruction: ${args.instruction}\n\nCurrent copy (JSON):\n${JSON.stringify(args.currentCopy, null, 2)}\n\nReturn the revised copy with the same shape and keys.`,
      schema: z.record(z.any()),
      schemaName: 'section_copy',
      model: 'claude-sonnet-4-6',
      maxTokens: 2000,
      enforceNoBannedVocab: true,
    })
    return { ok: true, copy: copy as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'rewrite failed' }
  }
}
