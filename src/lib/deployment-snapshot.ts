/**
 * The live pin for a funnel deployment.
 *
 * Decision 9: master edits stay off live URLs until an operator republishes.
 * A deployment row's working copy (and the brandless master it points at) is
 * what the builder edits. Public render reads `published_snapshot`, captured
 * the last time go-live or republish passed preflight.
 *
 * Unpublishing the parent master still takes the live URL down (the parent is
 * a traffic valve). Resume of a paused deployment keeps this snapshot; it does
 * not silently pick up HEAD. Only an explicit republish recaptures.
 */
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const asStringMap = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

const relId = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object' && 'id' in (v as Record<string, unknown>)) {
    return String((v as { id: unknown }).id ?? '')
  }
  return String(v)
}

export type QuizMasterSnap = {
  id: string
  name: string
  slug: string
  tiers: unknown[]
  steps: unknown[]
  nodes: unknown[]
  customFields: unknown[]
}

export type LpMasterSnap = {
  id: string
  name: string
  slug: string
  templateId: string
  angle: string
  sections: unknown[]
  slotOverrides: Record<string, string>
}

export type AdvertorialMasterSnap = {
  id: string
  title: string
  slug: string
  templateId: string
  sections: unknown[]
}

export type QuizDeploymentSnapshot = {
  kind: 'quiz'
  capturedAt: string
  master: QuizMasterSnap
  templateId: string
  progressForm: string | null
}

export type LpDeploymentSnapshot = {
  kind: 'lp'
  capturedAt: string
  master: LpMasterSnap
  quizId: string
  embeddedQuizTemplateId: string
  embeddedProgressForm: string | null
  quizDeploymentId: string
  quizMaster: QuizMasterSnap | null
}

export type AdvertorialDeploymentSnapshot = {
  kind: 'advertorial'
  capturedAt: string
  master: AdvertorialMasterSnap
  ctaMode: 'button' | 'embed'
  quizDeploymentId: string
}

export type DeploymentSnapshot =
  | QuizDeploymentSnapshot
  | LpDeploymentSnapshot
  | AdvertorialDeploymentSnapshot

export const quizMasterSnapFromDoc = (quiz: Record<string, unknown> | null | undefined): QuizMasterSnap | null => {
  if (!quiz || quiz.id == null) return null
  return {
    id: str(quiz.id),
    name: str(quiz.name),
    slug: str(quiz.slug),
    tiers: asArray(quiz.tiers),
    steps: asArray(quiz.steps),
    nodes: asArray(quiz.nodes),
    customFields: asArray(quiz.custom_fields ?? quiz.customFields),
  }
}

export const lpMasterSnapFromDoc = (lp: Record<string, unknown> | null | undefined): LpMasterSnap | null => {
  if (!lp || lp.id == null) return null
  return {
    id: str(lp.id),
    name: str(lp.name),
    slug: str(lp.slug),
    templateId: str(lp.template_id ?? lp.templateId),
    angle: str(lp.angle) || 'pain',
    sections: asArray(lp.sections),
    slotOverrides: asStringMap(lp.slot_overrides ?? lp.slotOverrides),
  }
}

export const advertorialMasterSnapFromDoc = (
  adv: Record<string, unknown> | null | undefined,
): AdvertorialMasterSnap | null => {
  if (!adv || adv.id == null) return null
  return {
    id: str(adv.id),
    title: str(adv.title),
    slug: str(adv.slug),
    templateId: str(adv.template_id ?? adv.templateId) || 'personal_story',
    sections: asArray(adv.sections),
  }
}

export const captureQuizSnapshot = (
  deployment: Record<string, unknown>,
  quiz: Record<string, unknown> | null,
  capturedAt = new Date().toISOString(),
): QuizDeploymentSnapshot | null => {
  const master = quizMasterSnapFromDoc(quiz)
  if (!master) return null
  const progress = deployment.progress_form ?? deployment.progressForm
  return {
    kind: 'quiz',
    capturedAt,
    master,
    templateId: str(deployment.template_id ?? deployment.templateId),
    progressForm: typeof progress === 'string' && progress ? progress : null,
  }
}

export const captureLpSnapshot = (
  deployment: Record<string, unknown>,
  landingPage: Record<string, unknown> | null,
  quiz: Record<string, unknown> | null,
  capturedAt = new Date().toISOString(),
): LpDeploymentSnapshot | null => {
  const master = lpMasterSnapFromDoc(landingPage)
  if (!master) return null
  const progress = deployment.embedded_progress_form ?? deployment.embeddedProgressForm
  return {
    kind: 'lp',
    capturedAt,
    master,
    quizId: relId(deployment.quiz),
    embeddedQuizTemplateId: str(deployment.embedded_quiz_template_id ?? deployment.embeddedQuizTemplateId),
    embeddedProgressForm: typeof progress === 'string' && progress ? progress : null,
    quizDeploymentId: str(deployment.quiz_deployment_id ?? deployment.quizDeploymentId),
    quizMaster: quizMasterSnapFromDoc(quiz),
  }
}

export const captureAdvertorialSnapshot = (
  deployment: Record<string, unknown>,
  advertorial: Record<string, unknown> | null,
  capturedAt = new Date().toISOString(),
): AdvertorialDeploymentSnapshot | null => {
  const master = advertorialMasterSnapFromDoc(advertorial)
  if (!master) return null
  return {
    kind: 'advertorial',
    capturedAt,
    master,
    ctaMode: deployment.cta_mode === 'embed' || deployment.ctaMode === 'embed' ? 'embed' : 'button',
    quizDeploymentId: str(deployment.quiz_deployment_id ?? deployment.quizDeploymentId),
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

const parseQuizMaster = (v: unknown): QuizMasterSnap | null => {
  if (!isRecord(v) || v.id == null) return null
  return {
    id: str(v.id),
    name: str(v.name),
    slug: str(v.slug),
    tiers: asArray(v.tiers),
    steps: asArray(v.steps),
    nodes: asArray(v.nodes),
    customFields: asArray(v.customFields ?? v.custom_fields),
  }
}

/**
 * Read a stored snapshot. Unknown or truncated JSON is treated as absent so a
 * corrupt pin 404s into HEAD rather than crashing the public router.
 */
export const parseDeploymentSnapshot = (raw: unknown): DeploymentSnapshot | null => {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return null
  if (raw.kind === 'quiz') {
    const master = parseQuizMaster(raw.master)
    if (!master) return null
    return {
      kind: 'quiz',
      capturedAt: str(raw.capturedAt),
      master,
      templateId: str(raw.templateId),
      progressForm: typeof raw.progressForm === 'string' && raw.progressForm ? raw.progressForm : null,
    }
  }
  if (raw.kind === 'lp') {
    if (!isRecord(raw.master) || raw.master.id == null) return null
    return {
      kind: 'lp',
      capturedAt: str(raw.capturedAt),
      master: {
        id: str(raw.master.id),
        name: str(raw.master.name),
        slug: str(raw.master.slug),
        templateId: str(raw.master.templateId),
        angle: str(raw.master.angle) || 'pain',
        sections: asArray(raw.master.sections),
        slotOverrides: asStringMap(raw.master.slotOverrides),
      },
      quizId: str(raw.quizId),
      embeddedQuizTemplateId: str(raw.embeddedQuizTemplateId),
      embeddedProgressForm:
        typeof raw.embeddedProgressForm === 'string' && raw.embeddedProgressForm ? raw.embeddedProgressForm : null,
      quizDeploymentId: str(raw.quizDeploymentId),
      quizMaster: parseQuizMaster(raw.quizMaster),
    }
  }
  if (raw.kind === 'advertorial') {
    if (!isRecord(raw.master) || raw.master.id == null) return null
    return {
      kind: 'advertorial',
      capturedAt: str(raw.capturedAt),
      master: {
        id: str(raw.master.id),
        title: str(raw.master.title),
        slug: str(raw.master.slug),
        templateId: str(raw.master.templateId) || 'personal_story',
        sections: asArray(raw.master.sections),
      },
      ctaMode: raw.ctaMode === 'embed' ? 'embed' : 'button',
      quizDeploymentId: str(raw.quizDeploymentId),
    }
  }
  return null
}

/**
 * Public live render uses the snapshot. Admin preview (`includeUnpublished`)
 * uses HEAD so the operator can see unpublished work. A live row with no
 * snapshot (pre-migration) falls through to HEAD; the migration backfills
 * live rows so that window is one deploy long.
 */
export const shouldUsePublishedSnapshot = (includeUnpublished: boolean, raw: unknown): boolean =>
  !includeUnpublished && parseDeploymentSnapshot(raw) !== null

/** True when go-live should recapture the pin. Resume with an existing pin does not. */
export const shouldCapturePublishedSnapshot = (args: {
  goingTo: string
  current: string
  republish?: boolean
  existingSnapshot: unknown
}): boolean => {
  if (args.goingTo !== 'live') return false
  if (args.republish) return true
  if (args.current === 'draft') return true
  return parseDeploymentSnapshot(args.existingSnapshot) === null
}
