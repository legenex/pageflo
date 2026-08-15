'use client'

/**
 * SQ-03 Authority Console — the institutional assessment console.
 *
 * Transcribed from `quizzes/Standalone-Quiz-03-Authority-Assessment.html`
 * (unbundled). What that design actually is, in order down the page:
 *
 *   - a squared shell with `overflow:hidden`, sitting on a warm host that is a
 *     tone off the shell rather than the same colour;
 *   - a DARK BAND across the full width of the shell: a mark and a caps title on
 *     the left, a zero-padded mono `STEP 03 / 08` on the right;
 *   - eight 4px segmented blocks in their own padded row under the band, on the
 *     shell rather than in it;
 *   - a mono section eyebrow, a 19px Archivo question, a 12.5px sub;
 *   - squared answer rows with a LEADING square check marker;
 *   - a quiet back control.
 *
 * The band is the identity, and it is the axis that survives a phone: a
 * full-width dark strip is roughly a tenth of the visible height at 390px and
 * reads at any resolution. The implementation drew none of it — the same
 * rounded neutral card as everything else — which is why this template appeared
 * in five of the eight worst measured collapses and sat 0.1702 from its own
 * source design on mobile.
 *
 * NOT PORTED, deliberately: the reference's `Licensed · vetted · monitored`
 * footer line. It is a claim about the deployed brand's network, and no field on
 * the quiz or the brand carries it, so drawing it would put an unverifiable
 * assertion on a client's page.
 */

import { quizBandSurface } from '@/lib/quiz-templates/theme'

import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'alt'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  // Host one tone off the shell, as the design has it — the shell reads as a
  // document ON something rather than as the page itself.
  const host = quizBandSurface(theme, CANVAS)
  const shell = quizBandSurface(theme, 'page')
  const band = quizBandSurface(theme, 'primary')

  const bandText = { fontFamily: theme.fonts.display, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: band.text }
  const mono = { fontFamily: theme.fonts.utility, fontSize: 10, letterSpacing: '0.08em', color: band.muted }

  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={host.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            backgroundColor: shell.bg,
            border: `1px solid ${shell.line}`,
            borderRadius: 4,
            overflow: 'hidden',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          {/* The band. Drawn on every phase, exactly as the design draws it on
              every step, so the console never stops looking like a console. */}
          <div style={{ backgroundColor: band.bg, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 14, height: 14, backgroundColor: band.accentFill, display: 'inline-block' }} />
              <span style={bandText}>Assessment</span>
            </span>
            <span style={mono}>
              Step {String(Math.min(view.step.index + 1, view.step.total)).padStart(2, '0')} / {String(view.step.total).padStart(2, '0')}
            </span>
          </div>

          {view.phase === 'question' || view.phase === 'form' ? (
            <div style={{ padding: '14px 18px 0' }}>
              <P.Progress view={view} theme={theme} spec={spec} surface={shell} />
            </div>
          ) : null}

          <div style={{ padding: 'clamp(18px, 3.5vw, 26px)' }}>
            <P.Badges view={view} theme={theme} surface={shell} />

            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}

            {view.phase === 'question' || view.phase === 'form' ? (
              <>
                <P.Tagline view={view} style={{ fontFamily: theme.fonts.utility, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: shell.muted, marginBottom: 8 }} />
                <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 700, fontSize: 'clamp(17px, 3vw, 19px)', lineHeight: 1.35, letterSpacing: '-0.01em', color: shell.text, marginBottom: 4 }} />
                <P.Question view={view} style={{ fontSize: 14, fontWeight: 600, color: shell.text, marginBottom: 4 }} />
                <P.Subheadline view={view} style={{ fontSize: 12.5, color: shell.muted, lineHeight: 1.6, marginBottom: 16 }} />

                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} style={{ gap: 7 }} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={4} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
                {/* The lead form runs two-up on the record, matching the squared
                    console rows above it rather than becoming a soft column. */}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} radius={4} columns={2} /> : null}

                <P.Nav view={view} actions={actions} theme={theme} surface={shell} radius={4} style={{ marginTop: 16 }} />
                <P.Consent view={view} theme={theme} surface={shell} />
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const authorityConsole: QuizComposition = {
  key: 'authority_console',
  renders: COMPOSITION_CLAIMS.authority_console,
  canvas: CANVAS,
  Root,
}
