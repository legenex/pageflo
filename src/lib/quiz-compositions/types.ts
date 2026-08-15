/**
 * The composition contract.
 *
 * A composition is a component plus the `sq_*` ids it draws, and it owns the
 * WHOLE render — the canvas included. That is the difference between this and
 * what came before it: `getTemplateConfig` returned a bag of style tokens
 * consumed by one hard-coded card, so twenty designs that differ structurally
 * in the handoff could differ only in colour, radius, face, and the interior of
 * a progress widget and a button. Measured, that produced eight distinguishable
 * groups at 390px where the source produces fourteen
 * (`docs/quiz-fidelity-baseline.md`).
 *
 * WHAT A COMPOSITION CANNOT DO is the load-bearing half, and it is enforced by
 * this file rather than by discipline. The props carry:
 *
 *   - `view`, which is DATA. No `node`, no `quiz`, no `deployment`, no graph
 *     function. Copy arrives interpolated; steps arrive counted and filtered to
 *     the ones a visitor sees.
 *   - `actions` and `option.select`, which are BOUND. `select` already carries
 *     auto-advance policy, multi-select toggling, field mappings, DQ and tier.
 *     There is no `onAnswer(answer)` and no answer object to hand it, so a
 *     composition physically cannot assemble an answer, apply a mapping, set a
 *     tier or choose a next step.
 *   - `P`, the shared input controls. A composition that wants a text question
 *     renders `<P.Field/>`; it never writes an `<input>` bound to its own
 *     state, which is what keeps honeypot handling, validation and
 *     `nav.canSubmit` single-implementation across every design.
 *
 * The naive alternative — copying the one card seven times — would give each
 * copy its own `canSubmit`, its own honeypot, its own auto-advance branch and
 * its own submit. Seven places for a required-field rule to be wrong, and a
 * lead lost on the seventh invisible on the other six. This repo already
 * demonstrated that failure at scale=2 (see `machine.ts`'s header).
 *
 * `scripts/test-quiz-compositions.mts` fails the build if a file under
 * `src/lib/quiz-compositions/` imports the graph, the lead client, the webhook
 * route, destinations or payload, or calls `fetch` — so a composition that
 * starts to grow a runtime fails on the import, before the logic exists.
 */

import type { ComponentType, CSSProperties, ReactNode } from 'react'

import type { Surface } from '@/lib/lp-nodes/surface'
import type { QuizTemplate } from '@/lib/quiz-templates/model'
import type { QuizBand, QuizTheme } from '@/lib/quiz-templates/theme'

export type { QuizBand }

/** Who is driving. Only the effects differ; the composition cannot tell. */
export type QuizRenderMode = 'live' | 'preview' | 'still'

/** Where the composition is mounted. Chrome is the composition's to place. */
export type QuizPlacement = 'page' | 'inline' | 'embed'

/**
 * One selectable answer, fully resolved.
 *
 * `select` is bound. A composition draws it and calls it; it can neither
 * construct an answer nor route one.
 */
export type QuizOption = {
  readonly id: string
  readonly index: number
  readonly label: string
  /** Small supporting text a few answer forms show. Null when unauthored. */
  readonly meta: string | null
  readonly selected: boolean
  readonly select: () => void
}

/** One input control, with its value and its setter already bound. */
export type QuizFieldModel = {
  readonly key: string
  readonly label: string
  readonly type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select'
  readonly placeholder: string
  readonly required: boolean
  readonly value: string
  /** Only for `select`. */
  readonly options: ReadonlyArray<{ value: string; label: string }>
  readonly set: (value: string) => void
}

export type PartialDate = { year?: number | null; month?: number | null; day?: number | null }

/**
 * How an input control is drawn.
 *
 * A real axis of the source set rather than a knob invented here: the lead form
 * is the least differentiated screen in the product (five distinguishable
 * groups of twenty at 390px), and the twenty designs vary it exactly three
 * ways — boxed in fourteen, underlined in one (SQ-01, the only one), and
 * mono-labelled record rows with a fixed label column in another (SQ-16).
 */
export type QuizFieldVariant = 'box' | 'underline' | 'record'

/**
 * What the current node asks for.
 *
 * A composition switches on `kind` to decide where the control goes; it never
 * decides what the control IS.
 */
export type QuizInputModel =
  | {
    readonly kind: 'options'
    readonly multi: boolean
    readonly options: readonly QuizOption[]
    /** How many columns fit the space the composition's card actually has. */
    readonly columns: number
  }
  | { readonly kind: 'fields'; readonly fields: readonly QuizFieldModel[]; readonly honeypot: QuizFieldModel | null }
  | { readonly kind: 'date'; readonly value: PartialDate; readonly dayRequired: boolean; readonly set: (v: PartialDate) => void }
  | { readonly kind: 'text'; readonly field: QuizFieldModel }
  | { readonly kind: 'select'; readonly field: QuizFieldModel }
  | { readonly kind: 'none' }

export type QuizViewModel = {
  /** Which shape of screen this is. Drives nothing else. */
  readonly phase: 'question' | 'form' | 'working' | 'endpoint' | 'complete'
  readonly step: {
    /** Zero-based, VISIBLE steps only. */
    readonly index: number
    readonly total: number
    readonly percent: number
    /** The authored label of each visible step, in order. */
    readonly labels: readonly string[]
  }
  readonly node: {
    readonly id: string
    readonly type: string
    /** Already interpolated against the answers collected so far. */
    readonly tagline: string | null
    readonly headline: string | null
    readonly question: string | null
    readonly subheadline: string | null
    /** True when the author hid this node from live; draw the builder badge. */
    readonly hiddenInLive: boolean
    /** True when dynamic content is substituting copy; draw the builder badge. */
    readonly dynamic: boolean
  }
  readonly input: QuizInputModel
  readonly nav: {
    readonly canGoBack: boolean
    readonly canSubmit: boolean
    /** True when tapping an answer advances on its own; no submit is drawn. */
    readonly autoAdvance: boolean
    readonly showSubmit: boolean
    readonly submitLabel: string
    readonly backLabel: string
  }
  readonly endpoint: {
    readonly mode: 'none' | 'immediate' | 'button'
    readonly url: string | null
    readonly buttonLabel: string
  } | null
  readonly legal: { readonly tcpa: string | null }
  /**
   * Brand-owned page chrome, pre-resolved.
   *
   * Null on every surface that draws none (a still, an embed, an inline mount).
   * They are elements rather than configuration because chrome is identical
   * under all twenty templates — a composition chooses WHERE it sits, never
   * what it says.
   */
  readonly chrome: {
    readonly header: ReactNode | null
    readonly body: ReactNode | null
    readonly footer: ReactNode | null
  }
}

export type QuizActions = {
  /** Submit the current node's input. Bound; the predicate is `nav.canSubmit`. */
  readonly submit: () => void
  readonly back: () => void
  /** Preview/builder only; a no-op in `live`. */
  readonly restart: () => void
}

/**
 * The shared visual primitives.
 *
 * Every one is a module-scope component taking explicit props — never a closure
 * built per render — so a composition holding `P` across renders cannot cause a
 * remount, which is what would drop focus out of a half-typed phone number.
 */
export type QuizPrimitives = {
  /**
   * The four copy slots, each carrying the test hook the e2e suite addresses.
   *
   * They exist as primitives rather than as markup a composition writes so that
   * `data-quiz-headline` and `data-quiz-question` cannot be forgotten by the
   * seventh composition — `scripts/test-e2e-lead.mts` reads the question text to
   * prove the flow advanced, and a design that omitted the attribute would make
   * the suite pass by finding nothing. Typography is entirely the caller's.
   */
  readonly Tagline: ComponentType<{ view: QuizViewModel; style?: CSSProperties }>
  readonly Headline: ComponentType<{ view: QuizViewModel; style?: CSSProperties }>
  readonly Question: ComponentType<{ view: QuizViewModel; style?: CSSProperties }>
  readonly Subheadline: ComponentType<{ view: QuizViewModel; style?: CSSProperties }>
  /** The template's progress form, wrapped with the `data-quiz-progress` hook. */
  readonly Progress: ComponentType<{ view: QuizViewModel; theme: QuizTheme; spec: QuizTemplate; surface?: Surface; style?: CSSProperties }>
  /** One answer, in the template's answer form. */
  readonly Answer: ComponentType<{ option: QuizOption; theme: QuizTheme; spec: QuizTemplate; surface?: Surface; multi?: boolean }>
  /** Every answer, arranged by the form's own layout. */
  readonly AnswerList: ComponentType<{ view: QuizViewModel; theme: QuizTheme; spec: QuizTemplate; surface?: Surface; style?: CSSProperties }>
  readonly Field: ComponentType<{ model: QuizFieldModel; theme: QuizTheme; surface?: Surface; radius?: number; variant?: QuizFieldVariant; style?: CSSProperties }>
  /** Every field of a form node, plus the honeypot. Carries `data-quiz-form`. */
  readonly Fields: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface; radius?: number; columns?: number; variant?: QuizFieldVariant; style?: CSSProperties }>
  readonly DatePicker: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface }>
  readonly Back: ComponentType<{ view: QuizViewModel; actions: QuizActions; theme: QuizTheme; surface?: Surface; radius?: number; label?: string; style?: CSSProperties }>
  readonly Submit: ComponentType<{ view: QuizViewModel; actions: QuizActions; theme: QuizTheme; surface?: Surface; radius?: number; block?: boolean; label?: string; style?: CSSProperties }>
  /** Back left, submit right. The composition may place the two itself instead. */
  readonly Nav: ComponentType<{ view: QuizViewModel; actions: QuizActions; theme: QuizTheme; surface?: Surface; radius?: number; align?: 'between' | 'center' | 'end'; style?: CSSProperties }>
  /** The consent line. THE only place consent is rendered, in any composition. */
  readonly Consent: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface; style?: CSSProperties }>
  readonly Endpoint: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface; mode: QuizRenderMode }>
  /** A node the visitor never sees — the machine is resolving or calling out. */
  readonly Working: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface }>
  /** The flow ended without an endpoint node. */
  readonly Complete: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface }>
  readonly Spinner: ComponentType<{ theme: QuizTheme; surface?: Surface; size?: number }>
  /** The builder-only badges: hidden node, dynamic content. */
  readonly Badges: ComponentType<{ view: QuizViewModel; theme: QuizTheme; surface?: Surface }>
}

export type QuizCompositionProps = {
  readonly view: QuizViewModel
  readonly actions: QuizActions
  /** Brand-derived, contrast-verified. A composition never invents a colour. */
  readonly theme: QuizTheme
  /** The cosmetic axes of the specific id being drawn. */
  readonly spec: QuizTemplate
  readonly mode: QuizRenderMode
  readonly placement: QuizPlacement
  readonly P: QuizPrimitives
}

/** A composition is a component plus the ids it draws. Nothing else. */
export type QuizComposition = {
  /** Stable composition key, e.g. 'authority_console'. */
  readonly key: string
  /**
   * The `sq_*` ids this composition draws, CANONICAL. Read from
   * `COMPOSITION_CLAIMS` rather than restated, so the health check and the
   * renderer cannot disagree about who draws what. Resolution runs after
   * `template-registry`, so the six legacy aliases never appear here.
   */
  readonly renders: readonly string[]
  /**
   * Which ground the composition paints its canvas with.
   *
   * Declared as well as drawn because a thumbnail has to know: the gallery
   * scales a still into a fixed-height box and fades the cut, and a fade to a
   * colour the still is not painting is a visible seam. The Root reads this
   * same constant, so the two cannot drift.
   */
  readonly canvas: QuizBand
  /** The whole render, canvas included. There is no second component. */
  readonly Root: ComponentType<QuizCompositionProps>
}
