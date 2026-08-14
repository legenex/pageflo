/**
 * Server-side checks that run before anything becomes publicly reachable.
 *
 * The rule this module exists to enforce: **publishing is the last place a
 * wrong answer is cheap.** After it, a bad template id is a live page rendering
 * as something nobody chose, and a bad path is somebody else's URL. Every check
 * here is one that could in principle be skipped by a caller that "knows" its
 * data is fine, which is exactly why none of them is optional.
 *
 * Two shapes, deliberately:
 *
 *  - a `PreflightCheck` is one named verdict with a reason, so a UI can list
 *    what passed as well as what failed. A single boolean tells an operator
 *    that publishing is refused and nothing about what to fix.
 *  - `blocking` separates "this must not go live" from "somebody should look at
 *    this". A warning that blocks is a warning nobody reports; a block that
 *    warns is an outage.
 *
 * And one derived shape, `groupPreflight`, which files each failed check under
 * the AREA that fixes it. See the group table below for why that mapping lives
 * here and not in each surface that draws it.
 *
 * This file starts as the template half. The remaining checks — authorization,
 * parent publication state, graph validation, consent, destinations, domain
 * eligibility, path claims, renderer hydration — attach to the same list rather
 * than to a second mechanism, because a preflight that is split across two
 * modules is a preflight with a hole in whichever one the caller forgets.
 */
import { resolveTemplate, type TemplateKind } from '@/lib/template-registry'

export type PreflightSeverity = 'block' | 'warn'

export type PreflightCheck = {
  /** Stable machine name, so a UI and a test can both refer to one check. */
  id: string
  /** What was checked, in the operator's words. */
  label: string
  ok: boolean
  severity: PreflightSeverity
  /** Why it failed. Empty when it passed. */
  detail: string
}

export type PreflightResult = {
  /** True only when no `block` check failed. Warnings never gate. */
  ok: boolean
  checks: PreflightCheck[]
  /** The failed blocking checks, in the order they were run. */
  blocking: PreflightCheck[]
  /** The failed non-blocking checks. */
  warnings: PreflightCheck[]
}

export const pass = (id: string, label: string, severity: PreflightSeverity = 'block'): PreflightCheck => ({
  id,
  label,
  ok: true,
  severity,
  detail: '',
})

export const fail = (
  id: string,
  label: string,
  detail: string,
  severity: PreflightSeverity = 'block',
): PreflightCheck => ({ id, label, ok: false, severity, detail })

/** Collapse a list of checks into a verdict. The only place `ok` is decided. */
export const summarize = (checks: PreflightCheck[]): PreflightResult => {
  const failed = checks.filter((c) => !c.ok)
  const blocking = failed.filter((c) => c.severity === 'block')
  return {
    ok: blocking.length === 0,
    checks,
    blocking,
    warnings: failed.filter((c) => c.severity === 'warn'),
  }
}

/* ------------------------------------------------------------------ groups */

/**
 * WHERE a failed check lives, so a refusal points at a control instead of a wall
 * of text.
 *
 * Every check already carries a stable `id`, a `label` and a `detail`. The last
 * step threw all of that away: `decideTransition` joined `label: detail` with
 * semicolons and handed the operator one paragraph naming six unrelated
 * problems, in the order the server happened to run them, with no indication
 * which tab any of them was on. Four fixable problems read as one catastrophe,
 * and the usual response to a paragraph like that is to ask for the gate to be
 * turned off.
 *
 * ONE MAPPING, HERE. The alternative — each surface deciding which of its tabs a
 * check belongs to — is the same defect the template registry and
 * `domainEligibility` exist to remove: two readers of one fact, drifting. The
 * editor, the list and any future surface all read this table.
 */
export type PreflightGroupId =
  | 'general'
  | 'content'
  | 'quiz'
  | 'destinations'
  | 'tracking'
  | 'brand'
  | 'domain'

/**
 * The tabs a deployment editor has, and what a deep link switches to.
 *
 * These three ids are shared by BOTH deployment editors — `LPDeploymentEditor`
 * and the quiz builder's deployment tab bar use the same `data-deployment-tab`
 * values — so one table serves both. A future editor with a different tab set
 * needs its own mapping rather than a silent reinterpretation of these names.
 */
export type DeploymentEditorTab = 'general' | 'destinations' | 'tracking'

export type PreflightGroupMeta = {
  id: PreflightGroupId
  /** The area, in the operator's words. */
  label: string
  /** The editor tab whose controls fix this group. */
  tab: DeploymentEditorTab
  /** Where on that tab to look. Named controls, not a category. */
  where: string
}

/**
 * Display order, chosen as a repair order rather than alphabetically: a brand
 * with no phone number breaks three checks downstream of it, and a path
 * conflict is worth seeing last because it is usually a one-character fix.
 */
export const PREFLIGHT_GROUPS: readonly PreflightGroupMeta[] = [
  { id: 'general', label: 'General', tab: 'general', where: 'this deployment and who may publish it' },
  { id: 'brand', label: 'Brand', tab: 'general', where: 'the Brand picker, and Edit brand beside it' },
  { id: 'content', label: 'Template & content', tab: 'general', where: 'the landing page template gallery and its copy' },
  { id: 'quiz', label: 'Quiz flow', tab: 'general', where: 'the Quiz flow picker and the embedded quiz appearance' },
  { id: 'destinations', label: 'Destinations', tab: 'destinations', where: "the Destination URL's fields" },
  { id: 'tracking', label: 'Tracking & pixels', tab: 'tracking', where: 'the UTM defaults and pixel providers' },
  { id: 'domain', label: 'Domain & path', tab: 'general', where: 'the Domain picker and the Path field' },
]

const GROUP_BY_ID = new Map(PREFLIGHT_GROUPS.map((g) => [g.id, g]))

/** Exact check ids. Kept beside the checks that mint them in publish-lifecycle. */
const CHECK_GROUPS: Readonly<Record<string, PreflightGroupId>> = {
  authz: 'general',
  parent: 'content',
  'lp-template': 'content',
  'lp-template-record': 'content',
  'quiz-template': 'content',
  overrides: 'content',
  supply_blocks: 'content',
  hydration: 'content',
  brand: 'brand',
  consent: 'quiz',
  graph: 'quiz',
  'graph-nonempty': 'quiz',
  'quiz-bound': 'quiz',
  destinations: 'destinations',
  utm: 'tracking',
  pixels: 'tracking',
  'domain-ownership': 'domain',
  'domain-eligibility': 'domain',
  'domain-ssl': 'domain',
  path: 'domain',
}

/**
 * Families minted with a computed id, so the table above cannot enumerate them:
 * `flow-*` is one line per check the quiz-flow validator ran, and `embedded-*`
 * is the landing page's view of the quiz it runs.
 */
const CHECK_GROUP_PREFIXES: ReadonlyArray<readonly [string, PreflightGroupId]> = [
  ['flow-', 'quiz'],
  ['embedded-', 'quiz'],
]

/**
 * The group a check belongs to. Total by construction.
 *
 * An id nobody mapped lands in General rather than being dropped: a check that
 * blocks publication and appears nowhere on screen is strictly worse than one
 * filed under the wrong heading, because the operator is refused with no reason
 * they can act on. The fallback is deliberately the tab the editor opens on.
 */
export const preflightGroupFor = (checkId: string): PreflightGroupMeta => {
  const exact = CHECK_GROUPS[checkId]
  if (exact) return GROUP_BY_ID.get(exact)!
  for (const [prefix, group] of CHECK_GROUP_PREFIXES) {
    if (checkId.startsWith(prefix)) return GROUP_BY_ID.get(group)!
  }
  return GROUP_BY_ID.get('general')!
}

export type PreflightGroupResult = {
  group: PreflightGroupMeta
  /** Failed checks that refuse publication. */
  blocking: PreflightCheck[]
  /** Failed checks worth seeing that do not refuse it. */
  warnings: PreflightCheck[]
}

/**
 * A preflight, grouped by area, keeping only the groups with something to say.
 *
 * Passed checks are deliberately absent: they belong in the diagnostics view,
 * not in the panel an operator reads at the moment they are blocked. The full
 * `PreflightResult` travels alongside so nothing is lost.
 */
export const groupPreflight = (result: PreflightResult): PreflightGroupResult[] => {
  const byGroup = new Map<PreflightGroupId, PreflightGroupResult>()
  const bucket = (check: PreflightCheck): PreflightGroupResult => {
    const group = preflightGroupFor(check.id)
    let entry = byGroup.get(group.id)
    if (!entry) {
      entry = { group, blocking: [], warnings: [] }
      byGroup.set(group.id, entry)
    }
    return entry
  }

  for (const check of result.blocking) bucket(check).blocking.push(check)
  for (const check of result.warnings) bucket(check).warnings.push(check)

  // PREFLIGHT_GROUPS order, not insertion order: the repair order is a property
  // of the areas, not of whichever check the server happened to run first.
  return PREFLIGHT_GROUPS.map((g) => byGroup.get(g.id)).filter((e): e is PreflightGroupResult => e !== undefined)
}

/**
 * One line an operator can read at a glance. NOT the error itself.
 *
 * Names the areas and the count, and stops. The details are the grouped list;
 * restating them here would rebuild the paragraph this replaced.
 */
export const preflightSummary = (result: PreflightResult): string => {
  if (result.blocking.length === 0) return 'Every publish check passed.'
  const areas = groupPreflight(result)
    .filter((g) => g.blocking.length > 0)
    .map((g) => g.group.label)
  const n = result.blocking.length
  return `${n} publish check${n === 1 ? '' : 's'} failed in ${areas.join(', ')}.`
}

/**
 * The template a record names must resolve, strictly.
 *
 * Strict, not the render resolver: a render must draw something, and publishing
 * must not. The two differ on exactly this case and conflating them is how a
 * deployment goes live under `TEMPLATES[0]`.
 */
export const checkTemplateResolves = (
  kind: TemplateKind,
  rawId: unknown,
  opts: { id?: string; label?: string } = {},
): PreflightCheck => {
  const id = opts.id ?? `${kind}-template`
  const label = opts.label ?? (kind === 'quiz' ? 'Quiz visual template resolves' : 'Landing-page visual template resolves')
  const r = resolveTemplate(kind, rawId)
  return r.ok ? pass(id, label) : fail(id, label, r.error)
}

/**
 * A render path already fell back, and the record says so.
 *
 * Distinct from the check above because they catch different mistakes: this one
 * fires when a resolved object was built from a stored id that did not resolve,
 * which is the state a row is in RIGHT NOW rather than what a save would do to
 * it. A deployment can be published from a resolved object without the raw row
 * ever being re-read, so both are needed.
 */
export const checkNoTemplateFallback = (
  record: { templateFellBack?: boolean; requestedTemplateId?: string },
  opts: { id?: string; label?: string } = {},
): PreflightCheck => {
  const id = opts.id ?? 'template-fallback'
  const label = opts.label ?? 'Template rendered is the template chosen'
  return record.templateFellBack
    ? fail(id, label, `stored template id "${record.requestedTemplateId ?? ''}" does not resolve, so a stand-in was drawn`)
    : pass(id, label)
}
