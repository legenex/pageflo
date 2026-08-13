/**
 * One typed seam over both stock template libraries.
 *
 * The libraries themselves stay where they are — `quiz-templates/model.ts` and
 * `lp-templates/index.ts` are the source of truth for what a template IS. What
 * did not exist is a single place that answers "does this id resolve", and that
 * absence has a specific shape:
 *
 *   resolveQuizTemplate('typo')  -> sq_editorial_inline, silently
 *   templateFor('bold_modern')   -> TEMPLATES[0], silently
 *
 * Both fall back without a word, and `'bold_modern'` is the DEFAULT stored on
 * every `funnel-landing-pages` row, so the silent path is the common path. A
 * deployment can therefore be saved, published and served under a template
 * nobody chose, and the only evidence is that the page looks wrong.
 *
 * The rule here: **resolution either succeeds or says why.** `resolveTemplate`
 * returns a discriminated result and never guesses. Render paths that must not
 * throw use `resolveForRender`, which still falls back — a live page must not
 * 500 because of a bad id — but returns `usedFallback` and `requestedId` so the
 * caller can surface it instead of absorbing it. The difference between those
 * two functions is the whole point of this module.
 *
 * Legacy ids are mapped explicitly rather than by accident of fallback, because
 * three live quiz deployments are still on `'default'` and a fallback that
 * happens to land somewhere reasonable is not the same as a mapping somebody
 * chose. Every alias is asserted in `scripts/test-template-registry.mts`.
 */
import {
  QUIZ_TEMPLATES,
  QUIZ_TEMPLATE_BY_ID,
  LEGACY_TEMPLATE_IDS,
  type QuizTemplate,
} from '@/lib/quiz-templates/model'
import { PORTED_TEMPLATES, PORTED_BY_SLUG, type PortedTemplate } from '@/lib/lp-templates'

export type TemplateKind = 'quiz' | 'lp'

/**
 * The counts the stock libraries are expected to hold.
 *
 * Asserted by the test suite, which fails on any change. That is deliberate
 * friction: the libraries are ported design work, so a count moving on its own
 * means an extraction went wrong, and a count moving on purpose is a decision
 * worth writing down. Changing these numbers without changing the libraries is
 * how a gate stops gating.
 */
export const EXPECTED_QUIZ_TEMPLATE_COUNT = 20
export const EXPECTED_LP_TEMPLATE_COUNT = 12

/* ------------------------------------------------------------------ aliases */

/**
 * Ids that resolve to a template under a different name.
 *
 * `quiz` mirrors `LEGACY_TEMPLATE_IDS` rather than redefining it, so the two
 * cannot drift. `lp` is new: `'bold_modern'` is the stored default on every
 * landing-page row and resolves to nothing, which is why the LP fallback fires
 * so often that it stopped looking like a fallback.
 */
export const TEMPLATE_ALIASES: Record<TemplateKind, Record<string, string>> = {
  quiz: { ...LEGACY_TEMPLATE_IDS },
  lp: {
    // The collection default since the funnel port. It never named a real
    // template, so every page carrying it has been rendering TEMPLATES[0] —
    // `editorial_investigation_v2` — by accident. Mapping it there makes the
    // accident explicit and keeps every existing page rendering as it does now.
    bold_modern: 'editorial_investigation_v2',
  },
}

/* ----------------------------------------------------------------- registry */

export type RegisteredQuizTemplate = {
  kind: 'quiz'
  id: string
  code: string
  name: string
  blurb: string
  template: QuizTemplate
}

export type RegisteredLpTemplate = {
  kind: 'lp'
  id: string
  code: string
  name: string
  blurb: string
  family: PortedTemplate['family']
  channels: string
  /** Where this template puts the quiz, in the library's own words. */
  quizPlacement: string
  ground: string
  /**
   * The quiz visual template to offer when this landing page embeds a quiz.
   * A recommendation, never a constraint — the operator may pick any of the 20.
   */
  recommendedQuizTemplateId: string
  template: PortedTemplate
}

export type RegisteredTemplate = RegisteredQuizTemplate | RegisteredLpTemplate

/**
 * Which quiz skin reads as part of which landing page.
 *
 * Both libraries were ported from the same handoff, and 11 of the 20 quiz
 * templates carry an `origin` naming the LP they were drawn for. This is that
 * relationship written down so the LP deployment flow can pre-select rather than
 * making the operator guess. An LP with no entry falls to the library's most
 * neutral skin, which is the honest answer to "we do not know".
 */
const NEUTRAL_QUIZ_TEMPLATE = 'sq_editorial_inline'

const RECOMMENDED_QUIZ_BY_LP: Record<string, string> = {
  editorial_investigation_v2: 'sq_editorial_inline',
  human_recovery_story: 'sq_recovery_soft',
  authority_network: 'sq_authority_console',
  case_value_dossier: 'sq_case_dossier',
  split_screen_direct: 'sq_direct_panel',
  quiz_first: 'sq_quiz_first',
  deadline_signal: 'sq_deadline_timeline',
  insurer_vs_claimant: 'sq_insurer_context',
  sixty_second_check: 'sq_sixty_second',
  answer_first: 'sq_answer_first',
  case_type_router: 'sq_case_router',
  network_authority: 'sq_network_vetting',
}

const quizEntry = (t: QuizTemplate): RegisteredQuizTemplate => ({
  kind: 'quiz',
  id: t.id,
  code: t.code,
  name: t.name,
  blurb: t.blurb,
  template: t,
})

const lpEntry = (t: PortedTemplate): RegisteredLpTemplate => ({
  kind: 'lp',
  id: t.slug,
  code: t.code,
  name: t.name,
  blurb: t.blurb,
  family: t.family,
  channels: t.channels,
  quizPlacement: t.quiz,
  ground: t.ground,
  recommendedQuizTemplateId: RECOMMENDED_QUIZ_BY_LP[t.slug] ?? NEUTRAL_QUIZ_TEMPLATE,
  template: t,
})

/** Every quiz visual template, in library order. */
export const listQuizTemplates = (): RegisteredQuizTemplate[] => QUIZ_TEMPLATES.map(quizEntry)

/** Every landing-page visual template, in library order. */
export const listLpTemplates = (): RegisteredLpTemplate[] => PORTED_TEMPLATES.map(lpEntry)

export const listTemplates = (kind: TemplateKind): RegisteredTemplate[] =>
  kind === 'quiz' ? listQuizTemplates() : listLpTemplates()

/* --------------------------------------------------------------- resolution */

export type TemplateResolution =
  | { ok: true; template: RegisteredTemplate; usedAlias: string | null }
  | { ok: false; error: string; requestedId: string }

/**
 * Strict resolution. Use this anywhere a wrong answer should stop the operation:
 * saving a deployment, the publish preflight, a migration.
 */
export const resolveTemplate = (kind: TemplateKind, rawId: unknown): TemplateResolution => {
  const requestedId = typeof rawId === 'string' ? rawId.trim() : ''
  if (!requestedId) {
    return { ok: false, error: `no ${kind} template id was given`, requestedId: '' }
  }

  const alias = TEMPLATE_ALIASES[kind][requestedId]
  const id = alias ?? requestedId

  const hit = kind === 'quiz' ? QUIZ_TEMPLATE_BY_ID[id] : PORTED_BY_SLUG[id]
  if (!hit) {
    // Naming the id is the difference between a report somebody can act on and
    // one they can only escalate.
    return { ok: false, error: `unknown ${kind} template id "${requestedId}"`, requestedId }
  }

  return {
    ok: true,
    template: kind === 'quiz' ? quizEntry(hit as QuizTemplate) : lpEntry(hit as PortedTemplate),
    usedAlias: alias ? requestedId : null,
  }
}

export type RenderResolution = {
  template: RegisteredTemplate
  /** True when the requested id did not resolve and a stand-in was used. */
  usedFallback: boolean
  requestedId: string
  /** Present only when `usedFallback` — the message the strict resolver gave. */
  error: string | null
}

/**
 * Resolution for a render path, which must produce something.
 *
 * Still falls back, because a visitor should not get a 500 over a bad id in a
 * database row. The difference from the old behaviour is that it SAYS SO: the
 * caller gets `usedFallback` and the id that failed, and can log it, badge it in
 * the builder, or fail a preflight. A fallback nobody can observe is
 * indistinguishable from a template choice nobody made.
 */
export const resolveForRender = (kind: TemplateKind, rawId: unknown): RenderResolution => {
  const strict = resolveTemplate(kind, rawId)
  if (strict.ok) {
    return { template: strict.template, usedFallback: false, requestedId: strict.template.id, error: null }
  }
  const list = listTemplates(kind)
  const fallback = kind === 'quiz' ? (list.find((t) => t.id === NEUTRAL_QUIZ_TEMPLATE) ?? list[0]) : list[0]
  return { template: fallback, usedFallback: true, requestedId: strict.requestedId, error: strict.error }
}

/** The quiz skin to offer for a landing page, by LP id. Never throws. */
export const recommendedQuizTemplateFor = (lpId: unknown): string => {
  const lp = resolveTemplate('lp', lpId)
  return lp.ok && lp.template.kind === 'lp' ? lp.template.recommendedQuizTemplateId : NEUTRAL_QUIZ_TEMPLATE
}

/**
 * Health of the registry itself.
 *
 * A registry that has silently emptied — a bad extraction, a failed import —
 * would otherwise make every strict resolution fail and every render fall back,
 * which reads as "all the templates are broken" rather than "there are none".
 */
export const registryHealth = (): { ok: boolean; problems: string[] } => {
  const problems: string[] = []
  const quiz = listQuizTemplates()
  const lp = listLpTemplates()

  if (quiz.length === 0) problems.push('the quiz template registry is empty')
  if (lp.length === 0) problems.push('the landing-page template registry is empty')
  if (quiz.length !== EXPECTED_QUIZ_TEMPLATE_COUNT) {
    problems.push(`expected ${EXPECTED_QUIZ_TEMPLATE_COUNT} quiz templates, found ${quiz.length}`)
  }
  if (lp.length !== EXPECTED_LP_TEMPLATE_COUNT) {
    problems.push(`expected ${EXPECTED_LP_TEMPLATE_COUNT} landing-page templates, found ${lp.length}`)
  }

  const dupe = (ids: string[], label: string): void => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${label} template id "${id}"`)
      seen.add(id)
    }
  }
  dupe(quiz.map((t) => t.id), 'quiz')
  dupe(lp.map((t) => t.id), 'landing-page')

  // An alias pointing at nothing is worse than a missing alias: it resolves to
  // the fallback while looking deliberate.
  for (const kind of ['quiz', 'lp'] as TemplateKind[]) {
    for (const [from, to] of Object.entries(TEMPLATE_ALIASES[kind])) {
      const target = kind === 'quiz' ? QUIZ_TEMPLATE_BY_ID[to] : PORTED_BY_SLUG[to]
      if (!target) problems.push(`${kind} alias "${from}" points at unknown template "${to}"`)
    }
  }

  return { ok: problems.length === 0, problems }
}
