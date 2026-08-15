'use client'

/**
 * SQ-01 Editorial Inline — the article-set assessment.
 *
 * Transcribed from `quizzes/Standalone-Quiz-01-Editorial.html` (unbundled).
 * This is the measured CONTROL of the library: at 0.0375 desktop it is already
 * the closest reproduction of its own source in the set, so the job here is to
 * keep it that way while giving it the details that separate it from a generic
 * card. Every one of them is in the source:
 *
 *   - a 3px brand rule along the TOP of the shell (`border-top:3px solid
 *     {{brPrimary}}`), which no other design has;
 *   - a label row above the progress: the step name in the display face on the
 *     left, an italic serif line on the right;
 *   - a serif 24px/600 question, and serif for the answer letter badges;
 *   - answer rows with NO box and NO gap: a `border-top` on the run and a
 *     `border-bottom` per row, so the answers read as a table rather than as a
 *     stack of buttons;
 *   - a 26px SQUARE letter badge with a 1px border that fills with the brand
 *     when the row is chosen;
 *   - an italic serif hint opposite the back control.
 *
 * Its inputs are the only UNDERLINED ones in the twenty. That matters more than
 * it sounds: the lead form is the least differentiated screen in the product
 * (five distinguishable groups of twenty at 390px) and a rule-under-the-value
 * form against fourteen boxed ones is one of the few structural moves left on
 * it.
 *
 * The italic hint is UI copy about the control, not a claim about the brand,
 * which is why it is drawn while the reference's `Licensed · vetted · monitored`
 * style trust lines elsewhere in the set are not. It appears only while nothing
 * is chosen, so it never contradicts the state it is describing.
 */

import { quizBandSurface } from '@/lib/quiz-templates/theme'

import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'alt'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  // The source runs a near-white shell (`shellBg:'#FCFBF7'`) on a warm host —
  // the page is the darker of the two. The implementation had it the other way
  // round, a grey card on a white page, which is the tonal arrangement of the
  // fourteen templates that still draw as the shared card; a paper-on-desk
  // design that reads as desk-on-paper is both wrong and indistinguishable.
  const host = quizBandSurface(theme, CANVAS)
  const s = quizBandSurface(theme, 'page')
  const live = view.phase === 'question' || view.phase === 'form'
  const nothingChosen = view.input.kind === 'options' && !view.input.options.some((o) => o.selected)

  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={host.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            backgroundColor: s.bg,
            border: `1px solid ${s.line}`,
            borderTop: `3px solid ${s.accentFill}`,
            borderRadius: 6,
            padding: 'clamp(20px, 4vw, 30px) clamp(18px, 3.5vw, 28px)',
            color: s.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <P.Badges view={view} theme={theme} surface={s} />

          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}

          {live ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 5, fontSize: 11 }}>
                <span style={{ fontFamily: theme.fonts.display, fontWeight: 600, color: s.text }}>
                  {view.step.labels[view.step.index] ?? `Question ${view.step.index + 1}`}
                </span>
                <span style={{ fontFamily: theme.fonts.question, fontStyle: 'italic', color: s.muted }}>The assessment</span>
              </div>
              <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 22 }} />

              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8, letterSpacing: '0.04em' }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 600, fontSize: 'clamp(21px, 4vw, 24px)', lineHeight: 1.3, color: s.text, marginBottom: 6 }} />
              <P.Question view={view} style={{ fontFamily: theme.fonts.question, fontSize: 17, fontWeight: 600, color: s.text, marginBottom: 6 }} />
              <P.Subheadline view={view} style={{ fontSize: 13, color: s.muted, lineHeight: 1.6, marginBottom: 16 }} />

              {view.input.kind === 'options' ? (
                <P.AnswerList view={view} theme={theme} spec={spec} surface={s} style={{ borderTop: `1px solid ${s.line}` }} />
              ) : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} variant="underline" /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} variant="underline" columns={2} style={{ gap: '2px 18px' }} /> : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <P.Back view={view} actions={actions} theme={theme} surface={s} style={{ border: 'none', padding: '10px 2px', fontSize: 13 }} />
                {nothingChosen && !view.nav.showSubmit ? (
                  <span style={{ fontSize: 11, color: s.muted, fontStyle: 'italic', fontFamily: theme.fonts.question }}>
                    Select an answer to continue
                  </span>
                ) : (
                  <P.Submit view={view} actions={actions} theme={theme} surface={s} radius={4} />
                )}
              </div>
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const editorialInline: QuizComposition = {
  key: 'editorial_inline',
  renders: COMPOSITION_CLAIMS.editorial_inline,
  canvas: CANVAS,
  Root,
}
