'use client'

/**
 * SQ-20 Evidence Checklist — the document ledger.
 *
 * Transcribed from `quizzes/Standalone-Quiz-20-Evidence-Checklist.html`
 * (unbundled). The design is a ledger rather than a question card:
 *
 *   - a near-white shell (`shellBg:'#FDFCF8'`) on a warmer host, which is the
 *     opposite tonal relationship to the rest of the library;
 *   - a ledger header row: a mono step label on the left, a brand-tinted count
 *     chip on the right;
 *   - rows carrying TWO left-hand marks — an 18px checkbox and a 32px tinted
 *     tray — before the label, so the run of answers reads as a column of
 *     records rather than as a column of buttons;
 *   - a full-width confirm button under the run, which is the only place in the
 *     twenty a primary action sits inside the answer list rather than beside a
 *     back control.
 *
 * That tonal inversion is the axis that survives a phone. Every other light
 * template in the library draws a grey-ish card on a white page; this draws a
 * near-white card on a grey page, which flips the whole 64x64 luminance grid
 * rather than rearranging elements inside it. It was the closest pair in the
 * entire measurement — 0.0112 from Authority Console at 390px against 0.1799 in
 * the source, a sixteen-fold compression.
 *
 * NOT PORTED: the reference's `This is a checklist, not an upload` footnote and
 * its eight hardcoded evidence options. Both are the artifact's own sample
 * content; the deployed quiz brings its own questions, and the note describes a
 * flow only that sample has.
 */

import { quizBandSurface } from '@/lib/quiz-templates/theme'

import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'alt'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const host = quizBandSurface(theme, CANVAS)
  const shell = quizBandSurface(theme, 'page')
  const live = view.phase === 'question' || view.phase === 'form'

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
            borderRadius: 8,
            padding: 'clamp(18px, 3.5vw, 28px)',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <P.Badges view={view} theme={theme} surface={shell} />

          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}

          {live ? (
            <>
              <P.Progress view={view} theme={theme} spec={spec} surface={shell} style={{ marginBottom: 14 }} />

              <P.Tagline view={view} style={{ fontFamily: theme.fonts.utility, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: shell.muted, marginBottom: 8 }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 800, fontSize: 'clamp(19px, 3.4vw, 21px)', lineHeight: 1.3, letterSpacing: '-0.01em', color: shell.text, marginBottom: 4 }} />
              <P.Question view={view} style={{ fontSize: 14, fontWeight: 600, color: shell.text, marginBottom: 4 }} />
              <P.Subheadline view={view} style={{ fontSize: 12.5, color: shell.muted, lineHeight: 1.6, marginBottom: 14 }} />

              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} style={{ display: 'flex', flexDirection: 'column', gap: 6 }} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={8} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} radius={8} /> : null}

              {/* The confirm runs the full width, under the run of records —
                  the ledger's own shape, not a nav row bolted to the bottom. */}
              <P.Submit view={view} actions={actions} theme={theme} surface={shell} radius={8} block style={{ marginTop: 14 }} />
              <P.Consent view={view} theme={theme} surface={shell} />
              <P.Back view={view} actions={actions} theme={theme} surface={shell} style={{ border: 'none', padding: '10px 2px', fontSize: 13, marginTop: 8 }} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const evidenceChecklist: QuizComposition = {
  key: 'evidence_checklist',
  renders: COMPOSITION_CLAIMS.evidence_checklist,
  canvas: CANVAS,
  Root,
}
