/**
 * `sq_*` id -> composition.
 *
 * Resolution runs AFTER `src/lib/template-registry.ts`, on the canonical id, so
 * the six legacy ids (`default`, `minimal`, `editorial`, `gradient`, `glass`,
 * `compact`) keep working with no second mapping table and no stored id is ever
 * rewritten. There is exactly one authority on which ids exist, and it is not
 * this file.
 *
 * `renders` is many-to-one on purpose: twenty ids do not need twenty files. The
 * rule is the one the old model got wrong by applying it globally — if two ids
 * differ only in their leaves (progress form, answer form, face, width) they
 * share a composition; if they differ in STRUCTURE they do not. The default
 * composition claims every id no structural composition has claimed, so nothing
 * can 404 and nothing silently falls back to a different design.
 */

import type { QuizComposition } from './types'

import { authorityConsole } from './authority-console'
import { answerFirst } from './answer-first'
import { cardDeck } from './card-deck'
import { caseDossier } from './case-dossier'
import { caseFileConsole } from './case-file-console'
import { caseRouter } from './case-router'
import { deadlineTimeline } from './deadline-timeline'
import { decisionPath } from './decision-path'
import { defaultCard } from './default'
import { directPanel } from './direct-panel'
import { editorialInline } from './editorial-inline'
import { evidenceChecklist } from './evidence-checklist'
import { fullscreenFocus } from './fullscreen-focus'
import { guidedConversation } from './guided-conversation'
import { incidentScene } from './incident-scene'
import { insurerContext } from './insurer-context'
import { networkVetting } from './network-vetting'
import { quizFirst } from './quiz-first'
import { recoverySoft } from './recovery-soft'
import { sixtySecond } from './sixty-second'
import { timelineJourney } from './timeline-journey'

/**
 * Order matters only for reporting. A duplicate claim is a startup-visible
 * problem rather than a silent last-one-wins, because "which composition draws
 * this template" is not a question that should have two answers.
 */
export const QUIZ_COMPOSITIONS: readonly QuizComposition[] = [
  authorityConsole,
  answerFirst,
  cardDeck,
  caseDossier,
  caseFileConsole,
  caseRouter,
  deadlineTimeline,
  decisionPath,
  directPanel,
  editorialInline,
  evidenceChecklist,
  fullscreenFocus,
  guidedConversation,
  incidentScene,
  insurerContext,
  networkVetting,
  quizFirst,
  recoverySoft,
  sixtySecond,
  timelineJourney,
  defaultCard,
]

/** Compositions that claim specific ids. The default claims none explicitly. */
export const STRUCTURAL_COMPOSITIONS: readonly QuizComposition[] =
  QUIZ_COMPOSITIONS.filter((c) => c !== defaultCard)

const BY_ID: ReadonlyMap<string, QuizComposition> = (() => {
  const map = new Map<string, QuizComposition>()
  for (const c of STRUCTURAL_COMPOSITIONS) {
    for (const id of c.renders) {
      const held = map.get(id)
      if (held) {
        throw new Error(
          `[pageflo] quiz template "${id}" is claimed by two compositions ("${held.key}" and "${c.key}")`,
        )
      }
      map.set(id, c)
    }
  }
  return map
})()

export type CompositionResolution =
  | { ok: true; composition: QuizComposition; requestedId: string }
  | { ok: false; error: string; requestedId: string }

/**
 * Strict. For save paths, the publish preflight and record selectability — the
 * places where "we do not draw that" is a better answer than a guess.
 */
export const resolveComposition = (templateId: unknown): CompositionResolution => {
  const id = typeof templateId === 'string' ? templateId.trim() : ''
  if (!id) return { ok: false, error: 'no template id was given', requestedId: '' }
  const hit = BY_ID.get(id)
  return hit
    ? { ok: true, composition: hit, requestedId: id }
    : { ok: false, error: `no composition claims quiz template "${id}"`, requestedId: id }
}

/**
 * The render path: it must draw something, and it says when it guessed.
 *
 * Unclaimed is not an error here. Every current `sq_*` id is claimed by a
 * structural composition. The default card remains the fallback for unknown
 * ids so a visitor never 404s over a bad stored key.
 */
export const resolveCompositionForRender = (templateId: unknown): {
  composition: QuizComposition
  usedFallback: boolean
  requestedId: string
} => {
  const r = resolveComposition(templateId)
  return r.ok
    ? { composition: r.composition, usedFallback: false, requestedId: r.requestedId }
    : { composition: defaultCard, usedFallback: true, requestedId: r.requestedId }
}

/**
 * Which ids each composition draws, for the health check and the audit script.
 * Deliberately derived from `renders` rather than restated.
 */
export const compositionClaims = (): Record<string, readonly string[]> =>
  Object.fromEntries(STRUCTURAL_COMPOSITIONS.map((c) => [c.key, c.renders]))
