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
