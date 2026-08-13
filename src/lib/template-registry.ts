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
import { LP_IDENTITIES } from '@/lib/lp-identities'

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
    /*
     * The collection default since the funnel port. It named no template.
     *
     * The obvious mapping is `editorial_investigation_v2`, because
     * `templateFor('bold_modern')` returned `TEMPLATES[0]` and that is what it
     * is. That mapping is WRONG, and an adversarial pass caught it before it
     * reached a live page.
     *
     * `templateFor` decided the builder's LABEL. The RENDER branched separately,
     * on the raw id, through `isPortedTemplate('bold_modern')` — which was false,
     * because it is not a ported slug. So the page took the node path and drew
     * the operator's own authored sections, under identity `a`'s look (the
     * fallback `getLpIdentity` returns for an unknown id).
     *
     * Aliasing to a ported template would therefore have replaced every such
     * page's real copy with the stock Editorial Investigation reference copy.
     * The seeded `mva-pain-first` page is published and deployed live at
     * `/c/pain`, so that was a live page silently losing its content.
     *
     * `'a'` is the legacy identity template: node-rendered, identity `a`. It is
     * what these pages have always been, and now they say so.
     */
    bold_modern: 'a',
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

/**
 * Which code path draws a landing-page template.
 *
 * `ported` is the twelve: the handoff's own markup, mounted as-is with the
 * brand supplied through CSS variables. `identity` is the four that predate
 * them: a skeleton of nodes drawn by `SectionNode`, carrying an `LpIdentity`.
 *
 * They are genuinely different renderers, not two skins, which is why the four
 * are registered rather than aliased onto a ported template. An alias would
 * silently move every page built by the AI wizard onto markup it has no copy
 * for, and the failure would look like an empty page rather than a bad mapping.
 */
export type LpRenderer = 'ported' | 'identity'

export type RegisteredLpTemplate = {
  kind: 'lp'
  id: string
  code: string
  name: string
  blurb: string
  family: PortedTemplate['family'] | 'legacy'
  channels: string
  /** Where this template puts the quiz, in the library's own words. */
  quizPlacement: string
  ground: string
  /**
   * The quiz visual template to offer when this landing page embeds a quiz.
   * A recommendation, never a constraint — the operator may pick any of the 20.
   */
  recommendedQuizTemplateId: string
  renderer: LpRenderer
  /**
   * True for the twelve the stock library offers. The four legacy identity
   * templates resolve, render and keep their pages working, but they are not
   * what the Templates tab is a catalogue of, and counting them there would
   * make the library's own count a lie.
   */
  stock: boolean
  /** The ported markup and token table. Null for an identity template. */
  template: PortedTemplate | null
  /** The identity id this template carries. Null for a ported template. */
  identityId: string | null
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
  renderer: 'ported',
  stock: true,
  template: t,
  identityId: null,
})

/**
 * The four identity templates, registered rather than aliased.
 *
 * They are stored on real rows and they are what the AI wizard builds into,
 * because they are the only landing-page templates whose copy travels as nodes.
 * Leaving them out of the registry would mean either that `resolveTemplate`
 * rejects a page the product can still create, or that the save path has to keep
 * a second list of "ids that are also fine" — which is precisely the hidden
 * second registry this module exists to remove.
 */
const identityEntry = (identity: { id: string; name: string; position: string; tagline: string }): RegisteredLpTemplate => ({
  kind: 'lp',
  id: identity.id,
  code: `LEG-${identity.id.toUpperCase()}`,
  name: identity.name,
  blurb: `${identity.position} - ${identity.tagline}`,
  family: 'legacy',
  channels: 'Legacy - kept resolvable for pages already built on it',
  quizPlacement: 'Per skeleton',
  ground: 'IDENTITY',
  recommendedQuizTemplateId: NEUTRAL_QUIZ_TEMPLATE,
  renderer: 'identity',
  stock: false,
  template: null,
  identityId: identity.id,
})

/** Every quiz visual template, in library order. */
export const listQuizTemplates = (): RegisteredQuizTemplate[] => QUIZ_TEMPLATES.map(quizEntry)

/**
 * The stock landing-page library: the twelve, in library order.
 *
 * This is what a Templates tab is a catalogue of. `listAllLpTemplates` is what a
 * resolver iterates.
 */
export const listLpTemplates = (): RegisteredLpTemplate[] => PORTED_TEMPLATES.map(lpEntry)

/** The four legacy identity templates. Resolvable, never offered as stock. */
export const listLegacyLpTemplates = (): RegisteredLpTemplate[] => LP_IDENTITIES.map(identityEntry)

/** Every landing-page id that resolves: the twelve stock, then the four legacy. */
export const listAllLpTemplates = (): RegisteredLpTemplate[] => [
  ...listLpTemplates(),
  ...listLegacyLpTemplates(),
]

const LP_BY_ID = (): Record<string, RegisteredLpTemplate> =>
  Object.fromEntries(listAllLpTemplates().map((t) => [t.id, t]))

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

  if (kind === 'quiz') {
    const hit = QUIZ_TEMPLATE_BY_ID[id]
    // Naming the id is the difference between a report somebody can act on and
    // one they can only escalate.
    if (!hit) return { ok: false, error: `unknown quiz template id "${requestedId}"`, requestedId }
    return { ok: true, template: quizEntry(hit), usedAlias: alias ? requestedId : null }
  }

  const ported = PORTED_BY_SLUG[id]
  if (ported) return { ok: true, template: lpEntry(ported), usedAlias: alias ? requestedId : null }

  const legacy = LP_BY_ID()[id]
  if (legacy) return { ok: true, template: legacy, usedAlias: alias ? requestedId : null }

  return { ok: false, error: `unknown lp template id "${requestedId}"`, requestedId }
}

/**
 * The id to STORE for a raw operator or import value.
 *
 * Aliases are resolved forward here, so a row saved today carries the id of the
 * template it actually renders as. That is the difference between an alias table
 * that shrinks and one that grows: the mapping stays for rows nobody touches,
 * and every row somebody does touch stops needing it. `bold_modern` is the case
 * that matters — it is the stored default on every landing page and names no
 * template, so leaving it in place means the alias is load-bearing forever.
 */
export const canonicalTemplateId = (
  kind: TemplateKind,
  rawId: unknown,
): { ok: true; id: string } | { ok: false; error: string } => {
  const r = resolveTemplate(kind, rawId)
  return r.ok ? { ok: true, id: r.template.id } : { ok: false, error: r.error }
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

/**
 * Say out loud that a render fell back.
 *
 * `resolveForRender` returning `usedFallback` is only worth having if somebody
 * reads it, and the render paths are the ones that cannot throw. One reporter,
 * one grep-able prefix, so a page rendering as a template nobody chose leaves a
 * trace in the server log instead of only in how the page looks.
 *
 * Returns the resolution so a caller can inline it:
 *   const { template } = reportTemplateFallback('quiz deployment 12', resolveForRender(...))
 */
export const TEMPLATE_FALLBACK_LOG_PREFIX = '[template-registry] fallback'

export const reportTemplateFallback = <R extends RenderResolution>(context: string, res: R): R => {
  if (res.usedFallback) {
    console.warn(
      `${TEMPLATE_FALLBACK_LOG_PREFIX}: ${context} requested "${res.requestedId}" (${res.error}); rendered "${res.template.id}" instead`,
    )
  }
  return res
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
  // Across stock AND legacy: a legacy identity id colliding with a ported slug
  // would make one of them unreachable, and which one wins is an ordering
  // accident rather than a decision.
  dupe(listAllLpTemplates().map((t) => t.id), 'landing-page')

  // An alias pointing at nothing is worse than a missing alias: it resolves to
  // the fallback while looking deliberate.
  const lpById = LP_BY_ID()
  for (const kind of ['quiz', 'lp'] as TemplateKind[]) {
    for (const [from, to] of Object.entries(TEMPLATE_ALIASES[kind])) {
      const target = kind === 'quiz' ? QUIZ_TEMPLATE_BY_ID[to] : lpById[to]
      if (!target) problems.push(`${kind} alias "${from}" points at unknown template "${to}"`)
      // An alias whose source is also a real id is unreachable by definition:
      // the alias table is consulted first, so the real template it names can
      // never be resolved under its own name again.
      const shadowed = kind === 'quiz' ? QUIZ_TEMPLATE_BY_ID[from] : lpById[from]
      if (shadowed) problems.push(`${kind} alias "${from}" shadows a real template of the same id`)
    }
  }

  // Every legacy identity template must actually have an identity behind it, or
  // the render path it names has nothing to draw with.
  for (const t of listLegacyLpTemplates()) {
    if (t.renderer !== 'identity' || !t.identityId) {
      problems.push(`legacy landing-page template "${t.id}" names no identity`)
    }
  }

  return { ok: problems.length === 0, problems }
}
