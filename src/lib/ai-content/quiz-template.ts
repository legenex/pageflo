/**
 * The one place AI is allowed to propose a quiz template record.
 *
 * `adapter.ts` beside this governs what a model may write INTO a deployment:
 * text for slot ids that already exist. This module governs what a model may
 * propose AS a template: a name, a one-line blurb, one of the twenty stock
 * renderers as the base, and the visual configuration the record collection
 * actually supports. That last clause is the point. A quiz template is
 * presentation only - layout, progress, answer form and icons are the
 * RENDERER's, colour is the BRAND's, and questions, routing and consent are
 * the DEPLOYMENT's - so the only knob a record turns today is
 * `config_overrides.progressForm`, and the only knob the model may turn is
 * therefore exactly that.
 *
 * The output schema is the boundary rather than a description of it: there is
 * no field that could carry markup, a colour, a URL, a question or a line of
 * code, so a model that proposes one has nowhere to put it. And because zod
 * strips keys the schema does not name, `filterQuizTemplateProposal` re-checks
 * the RAW shape independently - the guarantee must not depend on that
 * stripping behaviour staying the same. A config key outside the supported set
 * refuses the whole proposal rather than being dropped, because a model that
 * invents configuration has misunderstood what a template is, and an operator
 * shown a record that quietly ignored half the answer would trust both less.
 *
 * WHY THE LLM IS INJECTED: same reason as `adapter.ts` - there is no API key
 * in a local checkout, and a contract that can only be exercised against a
 * live provider is a contract nobody exercises. The model is a parameter, so
 * the same code path runs under a deterministic double in `pnpm test:ai` and
 * under `invokeLLM` in production.
 */
import { z } from 'zod'

import { PROGRESS_FORM_LABELS } from '@/lib/quiz-templates/model'
import { listQuizTemplates, resolveTemplate } from '@/lib/template-registry'

/* ---------------------------------------------------------------- the sets */

/**
 * The renderer keys the model may pick from: the twenty stock ids, and only
 * those. The six legacy aliases resolve in the registry too, but an alias is a
 * NAME for one of the twenty rather than a base of its own, and a record built
 * on one would store a key every other surface canonicalises differently.
 */
export const AI_QUIZ_RENDERER_KEYS = listQuizTemplates().map((t) => t.id)

const RENDERER_KEY_SET = new Set(AI_QUIZ_RENDERER_KEYS)

/** The values `progressForm` may take - the whole supported visual config. */
export const AI_QUIZ_PROGRESS_FORMS: string[] = PROGRESS_FORM_LABELS.map((p) => p.id)

const PROGRESS_FORM_SET = new Set(AI_QUIZ_PROGRESS_FORMS)

/**
 * `createQuizTemplate` mints `template_id` as `slugify(name)_suffix`, and the
 * stored-id pattern caps the whole thing at 64 characters. 48 name characters
 * slugify to at most 48; with the underscore and six-character suffix the
 * minted id is at most 55 - so a name this schema accepts can never mint an id
 * the pattern refuses.
 */
export const AI_QUIZ_NAME_MAX = 48
export const AI_QUIZ_BLURB_MAX = 200

/* ------------------------------------------------------------------ output */

/**
 * The only shape a model may return. Four fields, none of which can hold a
 * design: the renderer and progress form are closed enums, and the two free
 * strings are display copy that the filter below refuses markup and URLs in.
 */
export const QuizTemplateProposalSchema = z.object({
  name: z.string().min(3).max(AI_QUIZ_NAME_MAX),
  blurb: z.string().min(1).max(AI_QUIZ_BLURB_MAX),
  rendererKey: z.enum(AI_QUIZ_RENDERER_KEYS as [string, ...string[]]),
  configOverrides: z.object({
    progressForm: z.enum(AI_QUIZ_PROGRESS_FORMS as [string, ...string[]]).optional(),
  }),
})

export type QuizTemplateProposal = z.infer<typeof QuizTemplateProposalSchema>

export type QuizTemplateRequest = {
  /** The operator's brief. Refused when blank - see `proposeQuizTemplate`. */
  instruction: string
}

/**
 * What the action stores, and nothing else. Exactly the fields the create and
 * save verbs in `template-actions.ts` accept; the row id and `template_id` are
 * minted server-side by the same path every other creation door uses.
 */
export type ProposedQuizTemplateRecord = {
  name: string
  blurb: string
  /** The registry id of the code renderer the record starts from. */
  rendererKey: string
  /** The supported visual configuration, already narrowed to known keys. */
  configOverrides: { progressForm?: string }
}

export type QuizTemplateResult =
  | { ok: true; record: ProposedQuizTemplateRecord }
  | { ok: false; error: string }

/** How the model is called. Injected so the contract is testable with no key. */
export type QuizTemplateModel = (args: { system: string; user: string }) => Promise<QuizTemplateProposal>

/* -------------------------------------------------------------- the filter */

/**
 * Markup, code or a URL, in any of the ways a model produces them. A template
 * name is a label and a blurb is one line of prose; both are printed verbatim
 * in the admin, and neither has any business carrying either.
 */
const LOOKS_LIKE_MARKUP =
  /<\/?[a-zA-Z][\w-]*[\s/>]|&[a-z]+;|&#\d+;|\{\{|\bstyle\s*=|https?:\/\/|^\s*[{[]/

/**
 * Turn a raw proposal into what may actually be stored.
 *
 * Takes `unknown` on purpose: the schema above describes the contract to the
 * model, but THIS is the gate, and it must hold even for a proposal that never
 * went through zod. Unknown top-level keys are ignored - there is no field in
 * the record for them to land in - while unknown CONFIG keys refuse the whole
 * proposal, because a key there is a claim about what the record does.
 */
export const filterQuizTemplateProposal = (raw: unknown): QuizTemplateResult => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'the writing assistant returned something that was not a template proposal' }
  }
  const p = raw as Record<string, unknown>

  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (!name) return { ok: false, error: 'the proposal names no template' }
  if (name.length > AI_QUIZ_NAME_MAX) {
    return { ok: false, error: `the proposed name is longer than ${AI_QUIZ_NAME_MAX} characters` }
  }
  // A name of punctuation would slugify to the generic fallback id, so the row
  // would be called something no operator can tell apart or search for.
  if (!/[a-z]/i.test(name)) return { ok: false, error: 'the proposed name contains no letters' }
  if (LOOKS_LIKE_MARKUP.test(name)) return { ok: false, error: 'the proposed name contains markup or a URL' }

  const blurb = typeof p.blurb === 'string' ? p.blurb.trim() : ''
  if (blurb.length > AI_QUIZ_BLURB_MAX) {
    return { ok: false, error: `the proposed blurb is longer than ${AI_QUIZ_BLURB_MAX} characters` }
  }
  if (blurb && LOOKS_LIKE_MARKUP.test(blurb)) {
    return { ok: false, error: 'the proposed blurb contains markup or a URL' }
  }

  const rendererKey = typeof p.rendererKey === 'string' ? p.rendererKey.trim() : ''
  // Membership in the closed set FIRST. `resolveTemplate` alone would also
  // accept the six legacy aliases, which are names for these twenty rather
  // than bases of their own.
  if (!RENDERER_KEY_SET.has(rendererKey)) {
    return {
      ok: false,
      error: `"${rendererKey || '(none)'}" is not one of the ${AI_QUIZ_RENDERER_KEYS.length} stock quiz renderers`,
    }
  }
  // Belt and braces: the set above is derived from the registry, so this
  // cannot fail today. It exists so a registry regression is reported here, as
  // a refusal with a reason, rather than as a row that will not validate.
  const res = resolveTemplate('quiz', rendererKey)
  if (!res.ok) return { ok: false, error: res.error }

  const configOverrides: { progressForm?: string } = {}
  if (p.configOverrides != null) {
    if (typeof p.configOverrides !== 'object' || Array.isArray(p.configOverrides)) {
      return { ok: false, error: 'the visual configuration is not an object' }
    }
    for (const [key, value] of Object.entries(p.configOverrides as Record<string, unknown>)) {
      // The load-bearing line. This allow-list IS the supported visual
      // configuration schema: a key outside it is the model designing rather
      // than configuring - a colour, a width, a css string - and the whole
      // proposal is refused with the key named rather than the key silently
      // dropped.
      if (key !== 'progressForm') {
        return {
          ok: false,
          error: `"${key}" is not part of the supported visual configuration (only progressForm is)`,
        }
      }
      if (typeof value !== 'string' || !PROGRESS_FORM_SET.has(value)) {
        return {
          ok: false,
          error: `"${String(value)}" is not one of the ${AI_QUIZ_PROGRESS_FORMS.length} progress forms`,
        }
      }
      configOverrides.progressForm = value
    }
  }

  return { ok: true, record: { name, blurb, rendererKey, configOverrides } }
}

/* -------------------------------------------------------------- the prompt */

export const buildQuizTemplateSystemPrompt = (): string =>
  [
    'You configure ONE new quiz visual template for a US legal lead-generation funnel library.',
    'A quiz template is presentation only. The renderer you pick owns layout, answer form and icons; colour always comes from the brand; questions, routing, consent and destinations live on the deployment. You are choosing and describing, not designing.',
    '',
    'ABSOLUTE RULES. Breaking any of these makes your answer unusable:',
    '- Pick rendererKey from the catalogue you are given. Never invent one.',
    '- Return PLAIN TEXT in name and blurb. No HTML, no markdown, no URLs, no braces, no code.',
    '- configOverrides may carry progressForm only, and only a listed value. Omit it to keep the renderer default.',
    '- Never name a colour, a font, a price, an outcome or a guarantee.',
    '- Never use em dashes.',
    `- The name is at most ${AI_QUIZ_NAME_MAX} characters. The blurb is one line, at most ${AI_QUIZ_BLURB_MAX}.`,
  ].join('\n')

export const buildQuizTemplateUserPrompt = (req: QuizTemplateRequest): string =>
  [
    `Operator instruction: ${req.instruction}`,
    '',
    'Pick the ONE stock renderer whose presentation is closest to what the operator asked for, name the new template, and write a one-line blurb saying what it is for. Set configOverrides.progressForm only when the operator asked for a different progress presentation than the renderer default shown.',
    '',
    'The renderer catalogue (rendererKey is the id):',
    JSON.stringify(
      listQuizTemplates().map((t) => ({
        id: t.id,
        name: t.name,
        blurb: t.blurb,
        use: t.template.use,
        defaultProgress: t.template.progress,
        answers: t.template.answers,
      })),
      null,
      2,
    ),
    '',
    'The progress forms configOverrides.progressForm may name:',
    JSON.stringify(PROGRESS_FORM_LABELS.map((f) => ({ id: f.id, label: f.label })), null, 2),
  ].join('\n')

/* ------------------------------------------------------------- the service */

export const proposeQuizTemplate = async (
  req: QuizTemplateRequest,
  invokeQuizTemplateModel: QuizTemplateModel,
): Promise<QuizTemplateResult> => {
  const instruction = typeof req.instruction === 'string' ? req.instruction.trim() : ''
  // Refused before the model runs: with nothing to go on it would invent a
  // brief, and the operator would get a confident template about nothing they
  // asked for.
  if (!instruction) {
    return { ok: false, error: 'say what the template should feel like and where it will run' }
  }

  let raw: unknown
  try {
    raw = await invokeQuizTemplateModel({
      system: buildQuizTemplateSystemPrompt(),
      user: buildQuizTemplateUserPrompt({ instruction }),
    })
  } catch (err) {
    // An unavailable model - no key, an outage, three failed validations - is
    // a normal operating condition, not a stack trace. Nothing was created.
    return {
      ok: false,
      error:
        err instanceof Error
          ? `the writing assistant is unavailable: ${err.message}`
          : 'the writing assistant is unavailable',
    }
  }

  return filterQuizTemplateProposal(raw)
}
