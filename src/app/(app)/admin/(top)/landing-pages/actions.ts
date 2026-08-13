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
import { DESTINATION_KEYS, DESTINATION_LABELS, isSafeDestinationUrl, type DestinationKey } from '@/lib/quiz-destinations'

const PATH = '/admin/landing-pages'

const numFromBrandId = (brandId: unknown): number | null => {
  if (typeof brandId !== 'string') return null
  const n = Number(brandId.replace('site_', ''))
  return Number.isFinite(n) ? n : null
}

/**
 * A jsonb config bag, or an empty one.
 *
 * Arrays and scalars are rejected rather than stored: every reader of these
 * columns indexes them by key, so a string that reached the column would read
 * as an object with no keys everywhere except in the editor that wrote it.
 */
const asConfigObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/*
 * `createLP`, `saveLP`, `cloneLP` and `deleteLP` lived here and are gone.
 *
 * They were written when a row was one brand's page. A row is now the TEMPLATE
 * every brand deploys, and `deleteLP` cascade-deleted every referencing
 * deployment — on a collection that is `isAuthenticated` with no Site on it, so
 * one operator tidying the library would have taken down other tenants' live
 * pages without being asked to confirm anything.
 *
 * The four verbs in ../template-actions.ts replace them, with the reference
 * check, the archive-instead-of-drop rule for stock rows, and validation of
 * template copy against the slots the chosen renderer actually has. All four are
 * deleted rather than kept as thin wrappers: every export of a `'use server'`
 * module is a live endpoint, so an unused `saveLP` is not dead code, it is a
 * second write path into the template library that skips those checks — and a
 * wrapper is one refactor away from being called directly.
 */

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
  if (dep.quizId) {
    const q = await payload.findByID({ collection: 'funnel-quizzes', id: Number(dep.quizId), overrideAccess: true }).catch(() => null)
    if (!q) return { ok: false, error: 'quiz flow not found' }
  }

  /*
   * Where this placement sends people.
   *
   * Validated HERE, not only at render. `normalizeDestinations` drops an unsafe
   * value on the way out, which is the right thing for the visitor and the wrong
   * thing for the operator: the URL they typed disappears with no word, and the
   * page silently falls back to the brand's. Worse, the scheme allow-list is a
   * security boundary - a destination ends up in an href and in
   * `window.location` - so `javascript:` reaching the column at all is a stored
   * sink waiting for a reader that forgets to normalize.
   */
  const destinationOverrides: Record<string, string> = {}
  for (const [key, value] of Object.entries(asConfigObject(dep.destinationOverrides))) {
    if (!DESTINATION_KEYS.includes(key as DestinationKey)) {
      return { ok: false, error: `unknown destination "${key}"` }
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `destination "${key}" is not text` }
    }
    const url = value.trim()
    // Empty means inherit the brand's URL. Storing '' would be an override to
    // nothing, which resolves to the site default and looks like a lost setting.
    if (!url) continue
    if (!isSafeDestinationUrl(url)) {
      return {
        ok: false,
        error: `${DESTINATION_LABELS[key as DestinationKey]} must be an https:// address, a tel:/mailto: link, or a path starting with /`,
      }
    }
    destinationOverrides[key] = url
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

  const data = {
    name: (dep.name as string) || '',
    landing_page: lpId,
    site: gate.siteId,
    domain: domainId,
    path: (dep.path as string) || '',
    // The flow this page runs. `quiz_deployment_id` is kept for rows that still
    // carry it and is never written from here any more: embedding a quiz must
    // not require publishing a separate standalone quiz page first.
    quiz: dep.quizId ? Number(dep.quizId) : null,
    embedded_quiz_template_id: embeddedTemplateId,
    embedded_progress_form: (dep.embeddedProgressForm as string) || null,
    quiz_deployment_id: (dep.quizDeploymentId as string) || '',
    content_overrides: overrides,
    // Null rather than {} so "this placement overrides nothing" is one value
    // rather than two, matching what the quiz side stores.
    destination_overrides: Object.keys(destinationOverrides).length > 0 ? destinationOverrides : null,
    utm: asConfigObject(dep.utm),
    pixels: asConfigObject(dep.pixels),
    status: (dep.status as string) || 'draft',
  }

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
