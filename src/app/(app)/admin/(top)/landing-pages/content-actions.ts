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
import { validateOverrides } from '@/lib/lp-slots/model'
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

  return { ok: true as const, deployment, lp, ported, overrides, siteId: gate.siteId }
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

  const stock = new Map(ctx.ported.slots.map((s) => [s.id, s.default]))
  let next = { ...ctx.overrides }
  for (const [id, value] of Object.entries(args.edits ?? {})) {
    if (value === null) { next = resetToDefault(next, [id]); continue }
    if (typeof value !== 'string') return { ok: false, error: `"${id}" is not text` }
    // Typing the stock wording back in is a reset, not a pin: the two look the
    // same today and behave differently when the template is corrected.
    if (stock.get(id) === value) next = resetToDefault(next, [id])
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

  // The quiz this page runs, as READ-ONLY context, so the copy can promise what
  // is actually asked. Nothing about it is writable and the prompt says so.
  let flow: QuizFlowSummary | null = null
  const quizDepId = typeof ctx.deployment.quiz_deployment_id === 'string' ? ctx.deployment.quiz_deployment_id : ''
  if (quizDepId) {
    const qd = await payload.findByID({ collection: 'funnel-quiz-deployments', id: quizDepId, depth: 0, overrideAccess: true }).catch(() => null)
    // Cross-tenant: the link is a bare text id, so the Site is re-checked here
    // rather than trusted, exactly as the publish preflight does.
    if (qd && relationId(qd.site) === ctx.siteId) {
      const quiz = await payload.findByID({ collection: 'funnel-quizzes', id: relationId(qd.quiz), depth: 0, overrideAccess: true }).catch(() => null)
      if (quiz) {
        const nodes = Array.isArray(quiz.nodes) ? quiz.nodes : []
        flow = {
          name: String(quiz.name ?? ''),
          stepCount: Array.isArray(quiz.steps) ? quiz.steps.length : 0,
          questions: nodes
            .filter((n) => n?.isVisible !== false && (n?.type === 'question' || n?.type === 'form'))
            .map((n) => String(n.question || n.headline || '').trim())
            .filter(Boolean),
          tiers: (Array.isArray(quiz.tiers) ? quiz.tiers : []).map((x) => String(x?.id ?? '')),
        }
      }
    }
  }

  const targets = targetsFromSlots(ctx.ported.slots, ctx.overrides, args.slotIds?.length ? { ids: args.slotIds } : {})

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
