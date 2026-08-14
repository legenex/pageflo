// @ts-nocheck -- mounts the ported quiz surface, whose brand and node shapes are
// untyped. Run `pnpm generate:types` on the server to restore typing.
'use client'

/**
 * A quiz template, frozen.
 *
 * This is the admin's driver for the ONE quiz surface: same page ground, same
 * card, same progress form, same answer form, same selected state - driven by a
 * scripted position instead of by a visitor. Every gallery thumbnail, every
 * preview modal and the Templates tab mount this, so what an operator picks a
 * template from is the design they will get.
 *
 * It replaces `TemplatePreview`, which drew its own two-element swatch: a
 * progress widget, one hard-coded question string and two sample answers, with
 * no card, no header, no width, no nav and no chrome. Twenty templates that
 * differ in composition all looked alike in it - and the landing-page branch
 * twenty lines above it in the same gallery file mounted the real renderer, so
 * the asymmetry was the bug rather than the budget. That file is deleted; there
 * is no longer any component in the repository that can draw an approximation
 * of a quiz template.
 *
 * Chrome is deliberately absent from a still: the header, footer and body
 * sections are authored on the BRAND and are identical under all twenty
 * templates, so in a template preview they add height and answer nothing.
 */

import { QuizSurface } from '@/components/public/quiz/QuizSurface'
import { useStillQuizMachine, STILL_FIXTURE_QUIZ } from '@/components/public/quiz/machine'
import { getTemplateConfig } from './templates'
import { PREVIEW_BRAND_DEFAULT } from '@/components/builder/preview-brand'

/**
 * @param templateId   the RENDERER key. A template record's own `templateId` is
 *                     an identity and names no renderer; `rendererKey` does.
 * @param progressForm the record's or the draft's progress override, so the
 *                     picture follows the choice before it is saved.
 * @param node         draw this node instead of the sample. Used by the node
 *                     preview modal, which is a still of one real question.
 */
export const QuizStill = ({
  templateId,
  progressForm = null,
  brand = null,
  node = null,
  quiz = null,
  customFields = null,
  stepIndex = 1,
  selectedAnswerIndex = 0,
}) => {
  const fixture = quiz ?? STILL_FIXTURE_QUIZ
  const machine = useStillQuizMachine({ quiz: fixture, node, stepIndex, selectedAnswerIndex })

  return (
    <QuizSurface
      machine={machine}
      quiz={customFields ? { ...fixture, customFields } : fixture}
      brand={brand ?? PREVIEW_BRAND_DEFAULT}
      deployment={{ templateId, progressForm }}
      mode="still"
      placement="page"
    />
  )
}

/**
 * The same still, shrunk into a fixed-height card slot.
 *
 * Scaled rather than re-specified, for the reason a thumbnail exists at all: a
 * template whose answer targets are oversized has to LOOK oversized here, and
 * re-stating sizes for the small version is how a picker starts lying about
 * what it is offering. Containment is three-deep because `overflow` alone does
 * not stop a transformed descendant painting over the card around it.
 */
export const QuizStillThumb = ({ height = 190, scale = 0.55, width = '100%', ...still }) => {
  // The ground the still will paint, so the fade at the cut matches the page
  // instead of introducing a colour of its own.
  const ground = getTemplateConfig(still.templateId, still.progressForm).pageBg(still.brand ?? PREVIEW_BRAND_DEFAULT)

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        overflow: 'hidden',
        contain: 'paint',
        isolation: 'isolate',
        height,
        width,
        flexShrink: 0,
        backgroundColor: ground,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        <QuizStill {...still} />
      </div>
      {/* The still is taller than its window for the templates with rails and
          tile grids; this fades the cut rather than slicing it. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, background: `linear-gradient(to bottom, transparent, ${ground})`, pointerEvents: 'none' }} />
    </div>
  )
}

export default QuizStill
