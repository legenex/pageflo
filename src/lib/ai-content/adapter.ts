/**
 * The one place AI is allowed to write deployment copy.
 *
 * There were three AI writers before this — `generateLPCopy`, `aiWriteSectionNodes`
 * and `aiRewriteSection` — each with its own prompt, its own idea of what a
 * section is, and no shared statement of what the model may not touch. Two of
 * them returned a free-form record, so "the model may only change copy" was a
 * sentence in a system prompt rather than a property of the code.
 *
 * THE RULE THIS MODULE EXISTS TO MAKE STRUCTURAL: the model proposes TEXT FOR
 * SLOT IDS THAT ALREADY EXIST, and nothing else can come back. Not markup, not
 * a colour, not a template id, not a route, not an answer value, not a tier,
 * not a consent line, not a destination. The output schema is a list of
 * `{ id, text }` where every id must already be in the request, and anything
 * outside that set is DROPPED by the caller rather than merged — so a
 * hallucinated field cannot reach a page even if the model is confidently wrong
 * about the shape of the world.
 *
 * That is a stronger guarantee than instructing the model, and it is the reason
 * the boundary is here and not in a prompt: a prompt is advice, a filter is a
 * fact. `aiWriteSectionNodes` already had the right instinct — it filtered ids —
 * and this generalises it and adds the rest of the immutables.
 *
 * WHAT IT CONSUMES: brand identity and voice, approved facts, the chosen visual
 * template, the valid content slots (or quiz node text fields), a summary of the
 * quiz flow, the deployment's existing overrides, and the operator's
 * instruction. The flow summary is there so copy can refer to what the quiz
 * actually asks; it is READ ONLY and no part of it is writable.
 *
 * WHY THE LLM IS INJECTED: there is no API key in a local checkout, and a
 * contract that can only be exercised against a live provider is a contract
 * nobody exercises. `invokeContentModel` is a parameter, so the same code path
 * runs under a deterministic double in the test suite and under `invokeLLM` in
 * production, and the guarantees above are proven rather than asserted.
 */
import { z } from 'zod'

import { SLOT_ROLES, type LpSlot, type SlotRole } from '@/lib/lp-slots/model'

/* ------------------------------------------------------------------ inputs */

/**
 * The brand, as this module needs it.
 *
 * A narrow structural type rather than an import of the full Brand Identity
 * profile: this needs a voice and a set of approved facts, and depending on the
 * whole profile would make the copy writer break whenever an unrelated part of
 * the profile changed shape. Anything satisfying this can be passed, which
 * includes a full profile.
 */
export type ContentBrand = {
  displayName: string
  voice?: {
    formality?: number
    directness?: number
    empathy?: number
    authority?: number
    urgency?: number
    reassurance?: number
    sentenceLength?: 'short' | 'medium' | 'long'
    headlineStyle?: string
    ctaStyle?: string
    preferredVocabulary?: string[]
    disallowedVocabulary?: string[]
    readingLevel?: string
    claimSensitivity?: 'low' | 'medium' | 'high'
    legalCaution?: 'low' | 'medium' | 'high'
  }
  approvedFacts?: {
    organization?: string
    audience?: string
    services?: string[]
    geographicScope?: string
    contact?: string
    approvedClaims?: string[]
    proofPoints?: string[]
    prohibitedClaims?: string[]
    requiredDisclaimers?: string[]
  }
}

/** What the quiz asks, as read-only context. Nothing here can be written. */
export type QuizFlowSummary = {
  name: string
  stepCount: number
  /** The visible questions, in order, so copy can promise what is actually asked. */
  questions: string[]
  tiers: string[]
}

export type ContentTarget = {
  id: string
  role: SlotRole
  /** The stock template's own wording. The model sees it as context. */
  stockText: string
  /** The deployment's current override, when it has one. */
  currentText: string | null
  maxChars: number
  sectionLabel: string
}

export type ContentRequest = {
  brand: ContentBrand
  templateId: string
  templateName: string
  targets: ContentTarget[]
  flow: QuizFlowSummary | null
  instruction: string
}

/* ------------------------------------------------------------------ output */

/**
 * The only shape a model may return.
 *
 * `id` and `text`, nothing else. No style, no colour, no route, no confidence
 * score that a caller might then act on. Widening this type is how the boundary
 * erodes, so the schema is the boundary rather than a description of it.
 */
export const ContentProposalSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
})

export type ContentProposal = z.infer<typeof ContentProposalSchema>

export type AcceptedItem = {
  id: string
  text: string
  role: SlotRole
  /** What it replaces, so a diff can be shown before anything is written. */
  previous: string
}

export type RejectedItem = {
  id: string
  reason:
    | 'unknown-slot'
    | 'not-text'
    | 'empty'
    | 'too-long'
    | 'contains-markup'
    | 'prohibited-claim'
    | 'disallowed-vocabulary'
    | 'missing-required-disclaimer'
}

export type ContentResult = {
  ok: boolean
  accepted: AcceptedItem[]
  rejected: RejectedItem[]
  /** Why the whole call failed, when it did. Empty on a partial success. */
  error: string
}

/* ------------------------------------------------------------- the filter */

/**
 * Markup, in any of the ways a model produces it.
 *
 * The composer escapes overrides, so markup here cannot execute. It would still
 * be WRONG — the operator would see `<b>` printed on their page — and a model
 * that returns markup has misunderstood the task, so it is rejected rather than
 * silently escaped and shipped.
 */
const LOOKS_LIKE_MARKUP = /<\/?[a-zA-Z][\w-]*[\s/>]|&[a-z]+;|&#\d+;|\{\{|\bstyle\s*=|\bhttps?:\/\/[^\s]*<|^\s*[{[]/

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Turn a raw proposal into what may actually be written.
 *
 * Every rejection is REPORTED rather than dropped silently. An operator who
 * asked for eight lines and got six needs to know which two were refused and
 * why, or the tool looks unreliable instead of careful.
 */
export const filterProposal = (req: ContentRequest, proposal: ContentProposal): ContentResult => {
  const byId = new Map(req.targets.map((t) => [t.id, t]))
  const accepted: AcceptedItem[] = []
  const rejected: RejectedItem[] = []
  const seen = new Set<string>()

  const prohibited = (req.brand.approvedFacts?.prohibitedClaims ?? []).map(norm).filter(Boolean)
  const disallowed = (req.brand.voice?.disallowedVocabulary ?? []).map((w) => w.toLowerCase()).filter(Boolean)

  for (const item of proposal.items ?? []) {
    const target = byId.get(item.id)
    // The load-bearing line. An id the request did not ask about is a field the
    // model invented, and merging it would let a model widen the page.
    if (!target) { rejected.push({ id: String(item.id), reason: 'unknown-slot' }); continue }
    if (seen.has(item.id)) continue
    seen.add(item.id)

    if (typeof item.text !== 'string') { rejected.push({ id: item.id, reason: 'not-text' }); continue }
    const text = item.text.trim()
    if (text === '') { rejected.push({ id: item.id, reason: 'empty' }); continue }
    if (LOOKS_LIKE_MARKUP.test(text)) { rejected.push({ id: item.id, reason: 'contains-markup' }); continue }
    // A generous ceiling: the point is to catch a model returning an essay for
    // a button label, not to police a sentence by a few characters.
    if (text.length > Math.max(target.maxChars * 2, 120)) { rejected.push({ id: item.id, reason: 'too-long' }); continue }

    const flat = norm(text)
    if (prohibited.some((p) => p && flat.includes(p))) { rejected.push({ id: item.id, reason: 'prohibited-claim' }); continue }
    if (disallowed.some((w) => flat.includes(norm(w)))) { rejected.push({ id: item.id, reason: 'disallowed-vocabulary' }); continue }

    // A required disclaimer may be reworded but not removed. Checked on the
    // slot whose role IS the disclaimer, because that is the only place it can
    // legitimately live and the only place its loss is material.
    if (target.role === 'disclaimer') {
      const required = req.brand.approvedFacts?.requiredDisclaimers ?? []
      const kept = required.every((d) => {
        // Presence by content words, not by exact string: an operator asking for
        // a rewrite expects the sentence to change, and demanding the literal
        // text back would make the disclaimer slot uneditable rather than
        // protected.
        const words = norm(d).split(' ').filter((w) => w.length > 4)
        if (words.length === 0) return true
        const hits = words.filter((w) => flat.includes(w)).length
        return hits / words.length >= 0.5
      })
      if (!kept) { rejected.push({ id: item.id, reason: 'missing-required-disclaimer' }); continue }
    }

    accepted.push({ id: item.id, text, role: target.role, previous: target.currentText ?? target.stockText })
  }

  return { ok: accepted.length > 0, accepted, rejected, error: accepted.length > 0 ? '' : 'nothing the model returned could be applied' }
}

/* -------------------------------------------------------------- the prompt */

const scale = (n: number | undefined, low: string, high: string): string =>
  n == null ? '' : n <= 2 ? low : n >= 4 ? high : `balanced between ${low} and ${high}`

export const buildSystemPrompt = (req: ContentRequest): string => {
  const v = req.brand.voice ?? {}
  const f = req.brand.approvedFacts ?? {}
  const lines = [
    `You write marketing copy for "${req.brand.displayName}", a US legal lead-generation brand.`,
    'You are filling NAMED SLOTS in a page that already exists. You are not designing anything.',
    '',
    'ABSOLUTE RULES. Breaking any of these makes your entire answer unusable:',
    '- Return ONLY the slot ids you were given. Never invent one, never drop one silently.',
    '- Return PLAIN TEXT. No HTML, no markdown, no CSS, no braces, no URLs.',
    '- Never write a colour, a font, a template name, a link, or a phone number.',
    '- Never contradict, remove or soften a required disclaimer.',
    '- Never make a claim about outcomes, amounts, or guarantees.',
    '- Never use em dashes.',
  ]
  if (f.organization) lines.push(`Organization: ${f.organization}`)
  if (f.audience) lines.push(`Audience: ${f.audience}`)
  if (f.services?.length) lines.push(`Services: ${f.services.join(', ')}`)
  if (f.geographicScope) lines.push(`Geographic scope: ${f.geographicScope}`)
  if (f.approvedClaims?.length) lines.push(`Claims you MAY make: ${f.approvedClaims.join(' | ')}`)
  if (f.proofPoints?.length) lines.push(`Approved proof points: ${f.proofPoints.join(' | ')}`)
  if (f.prohibitedClaims?.length) lines.push(`Claims you MUST NOT make: ${f.prohibitedClaims.join(' | ')}`)
  if (f.requiredDisclaimers?.length) lines.push(`Disclaimers that must survive any rewrite: ${f.requiredDisclaimers.join(' | ')}`)

  const voice = [
    scale(v.formality, 'plain and conversational', 'formal and precise'),
    scale(v.directness, 'gentle and indirect', 'direct and unhedged'),
    scale(v.empathy, 'matter of fact', 'warm and empathetic'),
    scale(v.authority, 'peer to peer', 'authoritative'),
    scale(v.urgency, 'unhurried', 'time sensitive without pressure'),
    scale(v.reassurance, 'neutral', 'reassuring'),
  ].filter(Boolean)
  if (voice.length) lines.push('', `Voice: ${voice.join('; ')}.`)
  if (v.sentenceLength) lines.push(`Sentence length: ${v.sentenceLength}.`)
  if (v.readingLevel) lines.push(`Reading level: ${v.readingLevel}.`)
  if (v.headlineStyle) lines.push(`Headlines: ${v.headlineStyle}.`)
  if (v.ctaStyle) lines.push(`Calls to action: ${v.ctaStyle}.`)
  if (v.preferredVocabulary?.length) lines.push(`Prefer these words: ${v.preferredVocabulary.join(', ')}.`)
  if (v.disallowedVocabulary?.length) lines.push(`NEVER use these words: ${v.disallowedVocabulary.join(', ')}.`)
  if (v.legalCaution === 'high') lines.push('Legal caution is HIGH: prefer the more conservative wording every time.')

  return lines.join('\n')
}

export const buildUserPrompt = (req: ContentRequest): string => {
  const parts = [
    `Template: ${req.templateName}`,
    `Operator instruction: ${req.instruction || 'Rewrite these lines for this brand.'}`,
  ]
  if (req.flow) {
    parts.push(
      '',
      // The flow is context so the copy can promise what the quiz actually asks.
      // Explicitly read-only, because a model told about a graph will otherwise
      // offer to change it.
      `The quiz on this page is "${req.flow.name}": ${req.flow.stepCount} steps. You cannot change it. Its questions are:`,
      ...req.flow.questions.slice(0, 12).map((q) => `  - ${q}`),
    )
  }
  parts.push(
    '',
    'Write each slot below. Return every id exactly as given. Keep each to roughly the length shown, which is the length the design was drawn for.',
    '',
    JSON.stringify(
      req.targets.map((t) => ({
        id: t.id,
        kind: t.role,
        section: t.sectionLabel,
        approxMaxChars: t.maxChars,
        current: t.currentText ?? t.stockText,
      })),
      null,
      2,
    ),
  )
  return parts.join('\n')
}

/* -------------------------------------------------------------- the service */

/**
 * How the model is called. Injected so the contract is testable with no key.
 *
 * Returning a rejected promise is the "AI unavailable" case and is handled by
 * the service rather than by every call site, because an outage that surfaces
 * as an unhandled rejection in a server action is an outage that looks like a
 * bug in whatever the operator was doing.
 */
export type ContentModel = (args: { system: string; user: string }) => Promise<ContentProposal>

export const generateContent = async (
  req: ContentRequest,
  invokeContentModel: ContentModel,
): Promise<ContentResult> => {
  if (req.targets.length === 0) {
    return { ok: false, accepted: [], rejected: [], error: 'there are no slots to write into' }
  }

  let raw: unknown
  try {
    raw = await invokeContentModel({ system: buildSystemPrompt(req), user: buildUserPrompt(req) })
  } catch (err) {
    // An unavailable model is a normal operating condition, not an exception the
    // operator should see a stack trace for. The page keeps whatever it had.
    return {
      ok: false,
      accepted: [],
      rejected: [],
      error: err instanceof Error ? `the writing assistant is unavailable: ${err.message}` : 'the writing assistant is unavailable',
    }
  }

  const parsed = ContentProposalSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, accepted: [], rejected: [], error: 'the writing assistant returned something that was not a list of slot texts' }
  }

  return filterProposal(req, parsed.data)
}

/* ---------------------------------------------------------- override maths */

/**
 * Apply accepted items to a deployment's overrides.
 *
 * Returns a NEW map. The stock defaults are never touched — a deployment stores
 * overrides only — and an accepted item whose text equals the stock wording is
 * REMOVED from the overrides rather than stored, so "the model wrote what was
 * already there" leaves the deployment tracking the template instead of pinning
 * a copy of it.
 */
export const applyAccepted = (
  current: Record<string, string>,
  accepted: AcceptedItem[],
  targets: ContentTarget[],
): Record<string, string> => {
  const stock = new Map(targets.map((t) => [t.id, t.stockText]))
  const next = { ...current }
  for (const a of accepted) {
    if (stock.get(a.id) === a.text) delete next[a.id]
    else next[a.id] = a.text
  }
  return next
}

/**
 * Put slots back to the stock template's own words.
 *
 * Deleting the override rather than writing the default into it: they look the
 * same on the page today and behave differently tomorrow, because a deployment
 * with no override follows a corrected template and one pinned to a copy of the
 * old text does not.
 */
export const resetToDefault = (
  current: Record<string, string>,
  slotIds: string[],
): Record<string, string> => {
  const next = { ...current }
  for (const id of slotIds) delete next[id]
  return next
}

/** Build write targets from a template's slots and a deployment's overrides. */
export const targetsFromSlots = (
  slots: LpSlot[],
  overrides: Record<string, string>,
  opts: { roles?: SlotRole[]; ids?: string[] } = {},
): ContentTarget[] => {
  const roles = new Set<SlotRole>(opts.roles ?? SLOT_ROLES.filter((r) => r !== 'image_src'))
  const ids = opts.ids ? new Set(opts.ids) : null
  return slots
    .filter((s) => (ids ? ids.has(s.id) : roles.has(s.role)))
    // An image URL is not copy and must never be written by a language model:
    // it would invent a plausible-looking asset path that resolves to nothing.
    .filter((s) => s.role !== 'image_src')
    /*
     * Neither is a case result, and for a much worse reason.
     *
     * A `mustSupply` slot is one the design left EMPTY because the handoff had
     * no honest content for it — the case-result cards in `authority_network`
     * and `case_value_dossier`. Asked to write one, a model produces
     * "$1.4M · trucking · Cook County · 2023", which is a fabricated legal
     * outcome on an attorney-advertising page. Only the firm can say what
     * belongs there, which is the whole reason those slots ship blank. Excluded
     * unconditionally, including when an operator names the id, for the same
     * reason `image_src` is: "the caller asked for it" is not a defence.
     */
    .filter((s) => !s.mustSupply)
    .map((s) => ({
      id: s.id,
      role: s.role,
      stockText: s.default,
      currentText: Object.prototype.hasOwnProperty.call(overrides, s.id) ? overrides[s.id] : null,
      maxChars: s.maxChars,
      sectionLabel: s.sectionLabel,
    }))
}
