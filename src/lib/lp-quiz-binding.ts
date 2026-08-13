/**
 * What a landing-page deployment runs, and whether it still runs anything.
 *
 * A landing page used to embed a quiz by naming a STANDALONE QUIZ DEPLOYMENT —
 * a second published page at its own URL — through a bare text id with no
 * foreign key behind it. Deleting that page left the pointer intact and
 * dangling. Production inspection found three of four live LP deployments in
 * exactly that state, and nothing anywhere said so: the row looked bound, the
 * page rendered, and the funnel was gone.
 *
 * The binding is a FLOW now. This module is the one place that decides what a
 * given row is, so the resolver, the admin list, the publish preflight and the
 * reconciliation report cannot disagree about it — which is how the production
 * rows stayed broken through several passes that each looked at one of those.
 *
 * It is a pure function over two records on purpose. The database work belongs
 * to the caller; the judgement is testable with fixtures, including the states
 * that only exist in production.
 */

export type LpQuizBindingVerdict =
  /** Already on the flow binding. Nothing to do. */
  | 'flow'
  /** Legacy pointer, resolves, same tenant, carries nothing a landing page cannot. */
  | 'legacy-migratable'
  /** Legacy pointer, resolves, but carries configuration a landing page cannot hold. */
  | 'legacy-needs-decision'
  /** Legacy pointer at a deployment belonging to ANOTHER brand. */
  | 'legacy-cross-tenant'
  /** Legacy pointer at a deployment that no longer exists, or that names no flow. */
  | 'legacy-dangling'
  /** No flow and no pointer. The page has no funnel. */
  | 'unbound'

export type LpQuizMigration = {
  quiz: string
  embedded_quiz_template_id: string
  embedded_progress_form: string | null
  quiz_deployment_id: ''
}

export type LpQuizBinding = {
  verdict: LpQuizBindingVerdict
  detail: string
  /**
   * What a safe migration would write, or null when there is nothing safe to
   * write. Null is the answer for every verdict that needs a person: this
   * module never invents a flow for a row that has lost one.
   */
  migration: LpQuizMigration | null
  /** True when the row currently serves a quiz to visitors. */
  servesAQuiz: boolean
}

/**
 * Configuration a STANDALONE deployment can carry and a landing page cannot.
 *
 * `destination_overrides` is the one that matters: it decides where the lead is
 * delivered. Migrating a row that has one would silently redeliver its leads,
 * which is the single mistake in this area that costs money rather than a page.
 */
export const LOSSY_QUIZ_DEPLOYMENT_FIELDS = [
  'destination_overrides',
  'header_config',
  'footer_config',
  'body_section_overrides',
  'utm',
  'pixels',
] as const

export const relationIdOf = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? String((v as { id: unknown }).id ?? '') : String(v)

/** True when a jsonb column holds something rather than null, `{}` or `[]`. */
export const isConfigured = (v: unknown): boolean => {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  if (typeof v === 'string') return v.trim() !== ''
  return true
}

/**
 * Classify one landing-page deployment.
 *
 * `quizDeployment` is the row its legacy pointer names, or null when the
 * pointer resolves to nothing — which the caller must distinguish from "there
 * is no pointer", because those are the difference between a page with no
 * funnel and a page that never claimed to have one.
 */
export const classifyLpQuizBinding = (
  deployment: Record<string, unknown>,
  quizDeployment: Record<string, unknown> | null,
): LpQuizBinding => {
  const siteId = relationIdOf(deployment.site)
  const quizId = relationIdOf(deployment.quiz)
  const legacyId = String(deployment.quiz_deployment_id ?? '')

  if (quizId) {
    return {
      verdict: 'flow',
      detail: legacyId
        ? `runs flow ${quizId}; a stale pointer to ${legacyId} sits beside it and is never read`
        : `runs flow ${quizId}`,
      // Nothing to migrate — but a row carrying an unread pointer has one thing
      // to clean, and clearing it is lossless by definition because the
      // resolver already ignores it.
      migration: legacyId
        ? {
            quiz: quizId,
            embedded_quiz_template_id: String(deployment.embedded_quiz_template_id ?? ''),
            embedded_progress_form: (deployment.embedded_progress_form as string) || null,
            quiz_deployment_id: '',
          }
        : null,
      servesAQuiz: true,
    }
  }

  if (!legacyId) {
    return {
      verdict: 'unbound',
      detail: 'no flow and no legacy pointer: this page has no funnel',
      migration: null,
      servesAQuiz: false,
    }
  }

  if (!quizDeployment) {
    return {
      verdict: 'legacy-dangling',
      detail: `points at quiz deployment ${legacyId}, which does not exist`,
      migration: null,
      servesAQuiz: false,
    }
  }

  if (relationIdOf(quizDeployment.site) !== siteId) {
    return {
      verdict: 'legacy-cross-tenant',
      detail: `points at quiz deployment ${legacyId}, which belongs to brand ${relationIdOf(quizDeployment.site)} and not to ${siteId}`,
      // Refused by the resolver too, so this row already serves nothing. Left
      // for a person: the fix is to pick this brand's own flow, and guessing
      // which is how one brand's leads end up in another's dashboard.
      migration: null,
      servesAQuiz: false,
    }
  }

  const targetQuiz = relationIdOf(quizDeployment.quiz)
  if (!targetQuiz) {
    return {
      verdict: 'legacy-dangling',
      detail: `quiz deployment ${legacyId} exists but names no flow`,
      migration: null,
      servesAQuiz: false,
    }
  }

  const lossy = LOSSY_QUIZ_DEPLOYMENT_FIELDS.filter((f) => isConfigured(quizDeployment[f]))
  if (lossy.length > 0) {
    return {
      verdict: 'legacy-needs-decision',
      detail: `quiz deployment ${legacyId} carries ${lossy.join(', ')}, which a landing page cannot; migrating would drop it`,
      migration: null,
      servesAQuiz: true,
    }
  }

  return {
    verdict: 'legacy-migratable',
    detail: `quiz deployment ${legacyId} -> flow ${targetQuiz}, skin ${String(quizDeployment.template_id ?? '')}`,
    migration: {
      quiz: targetQuiz,
      // The standalone deployment's own skin and progress treatment travel with
      // it. Dropping them would be a migration that changes how the page looks,
      // which is a different thing from a migration that changes how it is
      // wired.
      embedded_quiz_template_id: String(quizDeployment.template_id ?? ''),
      embedded_progress_form: (quizDeployment.progress_form as string) || null,
      quiz_deployment_id: '',
    },
    servesAQuiz: true,
  }
}

/** Verdicts a person has to resolve. Everything else is either fine or automatic. */
export const NEEDS_A_DECISION: ReadonlySet<LpQuizBindingVerdict> = new Set<LpQuizBindingVerdict>([
  'legacy-dangling',
  'legacy-cross-tenant',
  'legacy-needs-decision',
  'unbound',
])
