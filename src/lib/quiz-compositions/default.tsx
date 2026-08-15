'use client'

/**
 * The shared card, as a composition.
 *
 * This is what fourteen of the twenty still draw as, and it is a real design
 * rather than a placeholder: a single card on the page ground, the template's
 * own progress form at the top, the question stack, the answers in the layout
 * the answer form implies, and a nav row. It is the honest baseline the
 * structural compositions are measured against.
 *
 * ONE THING WAS REMOVED IN THE MOVE, and it is the point of the move. The card
 * used to draw `renderHeader` — a `STEP N OF M` label and a `Confidential` pill,
 * byte-identical above all twenty templates, immediately above whichever of the
 * twenty progress forms the template had chosen. It was the largest single
 * element every template shared, and no reference design draws a strip common
 * to all twenty: each states its progress in its own words and its own place,
 * which is the entire point of having twenty progress forms. The step count is
 * not lost — sixteen of the twenty progress forms already print one.
 */

import { QuizCanvas, QuizColumn } from './frame'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'page'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const s = theme.surface
  const squared = spec.answers === 'squared_rows' || spec.answers === 'document_stamps' || spec.answers === 'field_rows'
  const radius = squared ? 2 : 12
  const buttonRadius = spec.answers === 'pill_chips' || spec.answers === 'reply_pills' ? 999 : 8

  return (
    <QuizCanvas view={view} theme={theme} placement={placement}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            backgroundColor: s.bg,
            border: `1px solid ${s.line}`,
            borderRadius: radius,
            padding: 'clamp(22px, 4vw, 40px) clamp(18px, 3.5vw, 34px)',
            color: s.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <P.Badges view={view} theme={theme} />

          {view.phase === 'working' ? <P.Working view={view} theme={theme} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} mode={mode} /> : null}

          {view.phase === 'question' || view.phase === 'form' ? (
            <>
              <P.Progress view={view} theme={theme} spec={spec} style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }} />
              <P.Tagline view={view} style={{ fontSize: 'clamp(12px, 2.5vw, 13px)', color: s.muted, marginBottom: 10, fontWeight: 500, letterSpacing: '0.04em' }} />
              <P.Headline view={view} style={{ fontSize: spec.answers === 'oversized_letters' ? 'clamp(28px, 6vw, 44px)' : 'clamp(21px, 4vw, 30px)', fontWeight: spec.serifQuestion ? 600 : 700, marginBottom: 8, letterSpacing: '-0.015em', lineHeight: 1.18, color: s.text, fontFamily: theme.fonts.question }} />
              <P.Question view={view} style={{ fontSize: 'clamp(15px, 3vw, 18px)', fontWeight: 600, marginBottom: 8, color: s.text }} />
              <P.Subheadline view={view} style={{ fontSize: 'clamp(13px, 2.7vw, 15px)', color: s.muted, marginBottom: 'clamp(16px, 3vw, 24px)', lineHeight: 1.5 }} />

              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} /> : null}
              {view.input.kind === 'select' ? <div style={{ maxWidth: 480, margin: '0 auto' }}><P.Field model={view.input.field} theme={theme} radius={buttonRadius} /></div> : null}
              {view.input.kind === 'text' ? <div style={{ maxWidth: 520, margin: '0 auto' }}><P.Field model={view.input.field} theme={theme} radius={buttonRadius} /></div> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} radius={buttonRadius} style={{ maxWidth: 480, margin: '0 auto' }} /> : null}

              <P.Nav view={view} actions={actions} theme={theme} radius={buttonRadius} style={{ marginTop: 'clamp(18px, 3vw, 28px)' }} />
              <P.Consent view={view} theme={theme} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const defaultCard: QuizComposition = {
  key: 'default_card',
  // Claims nothing explicitly: the registry routes every id no structural
  // composition has taken here, so a new `sq_*` id can never fail to draw.
  renders: [],
  canvas: CANVAS,
  Root,
}
