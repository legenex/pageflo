// @ts-nocheck -- the funnel-* collection slugs are not in the committed
// payload-types; everything this delegates to is fully typed and checked.
'use server'

/**
 * Writing a deployment's copy, with or without help.
 *
 * The AI path and the human path end in the SAME write, through the same
 * validation, into the same overrides map. That is deliberate: a separate
 * "AI-written" storage path would mean an operator's edit and an assistant's
 * edit could disagree about what the page says, and the last one to run would
 * win by accident rather than by decision. Here the overrides map is the single
 * source of truth and the last write wins on purpose.
 *
 * The model is called through `invokeLLM`, so the banned-vocab and em-dash
 * guards and the retry-on-invalid behaviour apply. It is passed to the adapter
 * as a function rather than called inside it, because the adapter's contract
 * has to be exercisable with no API key — see `scripts/test-ai-content.mts`.
 */

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'

import { getCurrentUser } from '@/lib/auth'
import { relationId, requireDeploymentSiteAdmin } from '@/lib/authz'
import { invokeLLM } from '@/lib/ai/invoke'
import { canonicalTemplateId, resolveTemplate } from '@/lib/template-registry'
import { asSlotted } from '@/lib/lp-templates'
import { validateOverrides, editableSlots, isInsideQuizMount } from '@/lib/lp-slots/model'
import {
  ContentProposalSchema,
  applyAccepted,
  generateContent,
  resetToDefault,
  targetsFromSlots,
  type ContentResult,
  type QuizFlowSummary,
} from '@/lib/ai-content/adapter'

const PATH = '/admin/landing-pages'

/** The deployment, its template's slots, and the Site — loaded and authorized once. */
const loadContext = async (payload, user, deploymentId: string) => {
  const deployment = await payload
    .findByID({ collection: 'funnel-lp-deployments', id: deploymentId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!deployment) return { ok: false as const, error: 'deployment not found' }

  const gate = await requireDeploymentSiteAdmin(payload, user, {
    collection: 'funnel-lp-deployments',
    existingId: deploymentId,
    incomingSiteId: deployment.site,
  })
  if (!gate.ok) return gate

  const lp = await payload
    .findByID({ collection: 'funnel-landing-pages', id: relationId(deployment.landing_page), depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!lp) return { ok: false as const, error: 'landing page not found' }

  const canonical = canonicalTemplateId('lp', lp.template_id)
  if (!canonical.ok) return { ok: false as const, error: canonical.error }
  const entry = resolveTemplate('lp', canonical.id)
  const ported = entry.ok && entry.template.kind === 'lp' ? entry.template.template : null
  if (!ported) {
    // A legacy identity template has no slots: its copy travels as nodes on the
    // page itself, so there is nothing here to write into and saying so beats
    // offering a control that does nothing.
    return { ok: false as const, error: `template "${canonical.id}" has no content slots` }
  }

  const overrides: Record<string, string> = {}
  for (const [k, v] of Object.entries((deployment.content_overrides ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') overrides[k] = v
  }

  /*
   * What this deployment INHERITS when it says nothing: the template's own copy
   * where it has any, else the reference's.
   *
   * This used to be the reference's wording alone, which was right while a
   * template had no copy of its own. Now that a template does, an operator who
   * types the template's wording into a deployment field would have had it
   * PINNED as a deployment override — so a later correction to the template
   * would reach every deployment except the ones that agreed with it.
   */
  const inherited = new Map<string, string>()
  const templateSlotOverrides = (lp.slot_overrides ?? {}) as Record<string, unknown>
  for (const slot of ported.slots) {
    const own = templateSlotOverrides[slot.id]
    inherited.set(slot.id, typeof own === 'string' ? own : slot.default)
  }

  return { ok: true as const, deployment, lp, ported, overrides, inherited, siteId: gate.siteId }
}

const writeOverrides = async (payload, user, deployment, ported, next: Record<string, string>) => {
  // The same validation the save path runs. An assistant is not exempt from the
  // rule that copy must name a slot that exists.
  const v = validateOverrides(asSlotted(ported), next)
  if (!v.ok) return { ok: false as const, error: v.problems.map((p) => p.detail).join('; ') }

  await payload.update({
    collection: 'funnel-lp-deployments',
    id: deployment.id,
    data: { content_overrides: next },
    user,
    overrideAccess: false,
  })
  revalidatePath(PATH)
  return { ok: true as const }
}

/* --------------------------------------------------------------- the human */

export async function setDeploymentCopy(args: {
  deploymentId: string
  /** Slot id to text. A slot set to null is reset to the template's own words. */
  edits: Record<string, string | null>
}): Promise<{ ok: true; overrides: Record<string, string> } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  const ctx = await loadContext(payload, user, args.deploymentId)
  if (!ctx.ok) return ctx

  let next = { ...ctx.overrides }
  for (const [id, value] of Object.entries(args.edits ?? {})) {
    if (value === null) { next = resetToDefault(next, [id]); continue }
    if (typeof value !== 'string') return { ok: false, error: `"${id}" is not text` }
    // Refused rather than stored. The quiz card is replaced by the live runtime,
    // so an override here would be written, validated, saved, and never appear.
    if (isInsideQuizMount(asSlotted(ctx.ported), id)) {
      return { ok: false, error: `"${id}" is inside the quiz card; that copy comes from the quiz flow` }
    }
    // Typing the INHERITED wording back in is a reset, not a pin: the two look
    // the same today and behave differently when the template is corrected.
    // Compared against what this deployment would inherit — the template's copy
    // where it has any — not against the reference, which is a different string
    // the moment somebody edits the template.
    if (ctx.inherited.get(id) === value) next = resetToDefault(next, [id])
    else next[id] = value
  }

  const written = await writeOverrides(payload, user, ctx.deployment, ctx.ported, next)
  return written.ok ? { ok: true, overrides: next } : written
}

/* ----------------------------------------------------------- the assistant */

export async function writeDeploymentCopy(args: {
  deploymentId: string
  instruction: string
  /** Which slots to write. Empty means every text slot the template has. */
  slotIds?: string[]
  /** Apply immediately, or return the proposal for the operator to accept. */
  apply?: boolean
}): Promise<{ ok: true; result: ContentResult; overrides: Record<string, string> | null } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })

  const ctx = await loadContext(payload, user, args.deploymentId)
  if (!ctx.ok) return ctx

  const site = await payload.findByID({ collection: 'sites', id: ctx.siteId, depth: 0, overrideAccess: true }).catch(() => null)
  const identity = (site?.brand_identity ?? {}) as Record<string, unknown>

  /*
   * The quiz this page runs, as READ-ONLY context, so the copy can promise what
   * is actually asked. Nothing about it is writable and the prompt says so.
   *
   * Resolved in the RESOLVER's order: the deployment's own flow first, the
   * legacy standalone pointer only when it has none. This file read the legacy
   * pointer first and nothing else, so a page moved onto a flow directly - the
   * binding the product now prefers - described its copy against no flow at
   * all, and a page whose legacy pointer had gone stale described it against a
   * deployment that no longer existed.
   */
  const summarize = (quiz: Record<string, unknown> | null): QuizFlowSummary | null => {
    if (!quiz) return null
    const nodes = Array.isArray(quiz.nodes) ? (quiz.nodes as Array<Record<string, unknown>>) : []
    return {
      name: String(quiz.name ?? ''),
      stepCount: Array.isArray(quiz.steps) ? quiz.steps.length : 0,
      questions: nodes
        .filter((n) => n?.isVisible !== false && (n?.type === 'question' || n?.type === 'form'))
        .map((n) => String(n.question || n.headline || '').trim())
        .filter(Boolean),
      tiers: (Array.isArray(quiz.tiers) ? (quiz.tiers as Array<Record<string, unknown>>) : []).map((x) => String(x?.id ?? '')),
    }
  }

  let flow: QuizFlowSummary | null = null
  const ownQuizId = relationId(ctx.deployment.quiz)
  const quizDepId = typeof ctx.deployment.quiz_deployment_id === 'string' ? ctx.deployment.quiz_deployment_id : ''
  if (ownQuizId !== null) {
    flow = summarize(
      await payload.findByID({ collection: 'funnel-quizzes', id: ownQuizId, depth: 0, overrideAccess: true }).catch(() => null),
    )
  } else if (quizDepId) {
    const qd = await payload.findByID({ collection: 'funnel-quiz-deployments', id: quizDepId, depth: 0, overrideAccess: true }).catch(() => null)
    // Cross-tenant: the link is a bare text id, so the Site is re-checked here
    // rather than trusted, exactly as the publish preflight does.
    if (qd && relationId(qd.site) === ctx.siteId) {
      flow = summarize(
        await payload.findByID({ collection: 'funnel-quizzes', id: relationId(qd.quiz), depth: 0, overrideAccess: true }).catch(() => null),
      )
    }
  }

  /*
   * Only the slots the QUIZ does not own — the card's question, its answers and
   * its Back/Continue labels are the flow's, so a model writing into them would
   * be writing copy no visitor is ever shown. And the assistant is shown what
   * this deployment currently SAYS, which for an un-overridden slot is the
   * template's copy rather than the reference's: on a template whose wording
   * has been edited, the reference is text nobody would ever see.
   */
  const inheritedSlots = editableSlots(asSlotted(ctx.ported)).map((s) => ({
    ...s,
    default: ctx.inherited.get(s.id) ?? s.default,
  }))
  const targets = targetsFromSlots(inheritedSlots, ctx.overrides, args.slotIds?.length ? { ids: args.slotIds } : {})

  const result = await generateContent(
    {
      brand: {
        displayName: String(site?.brand_display_name || site?.name || 'this brand'),
        voice: (identity.voice ?? undefined) as never,
        approvedFacts: (identity.approvedFacts ?? {
          organization: String(site?.name ?? ''),
          contact: String(site?.default_phone ?? ''),
          requiredDisclaimers: [String(site?.legal_default_disclaimer ?? '')].filter(Boolean),
        }) as never,
      },
      templateId: ctx.ported.slug,
      templateName: ctx.ported.name,
      targets,
      flow,
      instruction: String(args.instruction ?? ''),
    },
    async ({ system, user: userPrompt }) =>
      invokeLLM({
        system,
        user: userPrompt,
        schema: ContentProposalSchema,
        schemaName: 'deployment_copy',
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
        enforceNoBannedVocab: true,
      }),
  )

  if (!result.ok && result.accepted.length === 0) return { ok: true, result, overrides: null }
  if (!args.apply) return { ok: true, result, overrides: null }

  const next = applyAccepted(ctx.overrides, result.accepted, targets)
  const written = await writeOverrides(payload, user, ctx.deployment, ctx.ported, next)
  if (!written.ok) return written
  return { ok: true, result, overrides: next }
}
