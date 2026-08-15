'use client'

/**
 * SQ-05 Direct Panel — the framed direct-response panel.
 *
 * Transcribed from `quizzes/Standalone-Quiz-05-Split-Direct.html` (unbundled).
 * The design's one structural move is that the headline and the progress live
 * INSIDE the shell, on a tall brand-dark band, and only the answers sit on
 * white:
 *
 *   - shell, `overflow:hidden`, soft radius;
 *   - a `{{brDark}}` band, `padding:20px 24px 18px`, carrying a caps eyebrow, a
 *     900-weight 22px headline in white, and an 8px pill bar with a white
 *     percentage chip beside it;
 *   - a white body: a caps question label, the sub, full-width bold buttons
 *     with 2px borders and a trailing chevron, min-height 56;
 *   - a CENTERED back control, which no other design in the set has.
 *
 * Measured, this was the template furthest from its own source design in the
 * whole library — 0.1522 desktop, 0.2177 mobile — for exactly one reason: the
 * band is roughly a third of the card and the implementation drew none of it.
 * The band is also the axis that survives a phone, because a tall dark mass at
 * the top of a 390px screen is unmistakable at any resolution.
 *
 * The band carries the NODE's headline rather than page-level brand copy, which
 * is the one deviation from the source and is forced: the reference's band copy
 * is a static marketing line the artifact hardcodes, and the quiz model has no
 * field for it. Drawing an empty band, or inventing a sentence, would both be
 * worse than putting the question where the design puts its largest type.
 */

import { quizBandSurface } from '@/lib/quiz-templates/theme'

import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'page'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const shell = quizBandSurface(theme, 'page')
  const band = quizBandSurface(theme, 'dark')

  const banded = view.phase === 'question' || view.phase === 'form'

  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={quizBandSurface(theme, CANVAS).bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            backgroundColor: shell.bg,
            border: `1px solid ${shell.line}`,
            borderRadius: 6,
            overflow: 'hidden',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          {banded ? (
            <div style={{ backgroundColor: band.bg, padding: 'clamp(18px, 4vw, 24px) clamp(18px, 4vw, 24px) 18px' }}>
              <P.Tagline view={view} style={{ fontFamily: theme.fonts.display, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: band.muted, marginBottom: 6 }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 800, fontSize: 'clamp(21px, 4.4vw, 26px)', lineHeight: 1.2, letterSpacing: '-0.015em', color: band.text }} />
              <div style={{ marginTop: 16 }}>
                <P.Progress view={view} theme={theme} spec={spec} surface={band} />
              </div>
            </div>
          ) : null}

          <div style={{ padding: 'clamp(18px, 3.5vw, 26px)' }}>
            <P.Badges view={view} theme={theme} surface={shell} />

            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}

            {banded ? (
              <>
                <P.Question view={view} style={{ fontFamily: theme.fonts.display, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: shell.muted, marginBottom: 8 }} />
                <P.Subheadline view={view} style={{ fontSize: 13, color: shell.muted, lineHeight: 1.55, marginBottom: 16 }} />

                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} style={{ gap: 9 }} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={6} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} radius={6} /> : null}

                {/* Centered nav, which is this design's own and no other's. The
                    submit runs the full width because a direct-response panel
                    has exactly one thing it wants you to do. */}
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <P.Submit view={view} actions={actions} theme={theme} surface={shell} radius={6} block />
                  <P.Back view={view} actions={actions} theme={theme} surface={shell} radius={6} style={{ border: 'none', fontWeight: 600 }} />
                </div>
                <P.Consent view={view} theme={theme} surface={shell} />
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const directPanel: QuizComposition = {
  key: 'direct_panel',
  renders: COMPOSITION_CLAIMS.direct_panel,
  canvas: CANVAS,
  Root,
}
