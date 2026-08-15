'use client'

/**
 * SQ-16 Case File Console — the tabbed case file.
 *
 * Transcribed from `quizzes/Standalone-Quiz-16-Case-File-Console.html`
 * (unbundled). Three horizontal bands and a card inside a card:
 *
 *   - a dark titlebar: a mark and a mono console title on the left, a bordered
 *     status chip on the right;
 *   - a light TAB STRIP on its own warm band, bottom-bordered, `overflow-x:auto`
 *     so a long section list scrolls rather than clipping the current tab;
 *   - a body holding a NESTED bordered record card, whose own header row prints
 *     `FIELD n/N` and the entry status before the question appears inside it;
 *   - document field rows with an `ON FILE` marker, and a quiet back control
 *     BELOW the nested card rather than inside it.
 *
 * It shares a dark top band with Authority Console and is distinguished from it
 * structurally rather than by colour: a second (light) band, a nested outline
 * with its own header, hairline field rows with a right-hand mono column, and
 * two hundred more pixels of declared width. That is deliberate — those two were
 * 0.0272 apart on desktop, and a difference that rests on tone alone is a
 * difference a phone can erase.
 *
 * Both status strings are read off the machine (`FIELD n/N`, and whether this
 * step has been answered yet), not invented: the reference's `REF SMP-2209` is a
 * fabricated case number and is not ported.
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
  const band = quizBandSurface(theme, 'primary')

  const live = view.phase === 'question' || view.phase === 'form'
  const recorded = view.input.kind === 'options' && view.input.options.some((o) => o.selected)
  const mono = { fontFamily: theme.fonts.utility, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' as const }

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
            borderRadius: 5,
            overflow: 'hidden',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <div style={{ backgroundColor: band.bg, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 12, height: 14, border: `1.5px solid ${band.accentFill}`, borderRadius: 2, display: 'inline-block' }} />
              <span style={{ ...mono, fontSize: 10.5, color: band.text }}>Case assessment</span>
            </span>
            <span style={{ ...mono, fontSize: 9, color: band.muted, border: `1px solid ${band.line}`, padding: '3px 9px', borderRadius: 3 }}>
              Open &middot; unverified
            </span>
          </div>

          {live ? (
            <div style={{ backgroundColor: host.bg, borderBottom: `1px solid ${shell.line}` }}>
              <P.Progress view={view} theme={theme} spec={spec} surface={host} style={{ padding: '4px 10px' }} />
            </div>
          ) : null}

          <div style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
            <P.Badges view={view} theme={theme} surface={shell} />

            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}

            {live ? (
              <>
                {/* The record: a card inside a card, with its own header row.
                    This is the one shape in the library that nests. */}
                <div style={{ border: `1px solid ${shell.line}`, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: host.bg, borderBottom: `1px solid ${shell.line}`, padding: '10px 15px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ ...mono, fontSize: 9, color: host.muted }}>
                      Field {view.step.index + 1}/{view.step.total}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: recorded ? host.accent : host.muted }}>
                      {recorded ? 'Recorded' : 'Awaiting entry'}
                    </span>
                  </div>
                  <div style={{ padding: 15 }}>
                    <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 700, fontSize: 'clamp(16px, 2.8vw, 17px)', lineHeight: 1.4, color: shell.text, marginBottom: 3 }} />
                    <P.Question view={view} style={{ fontSize: 13.5, fontWeight: 600, color: shell.text, marginBottom: 3 }} />
                    <P.Subheadline view={view} style={{ fontSize: 12, color: shell.muted, lineHeight: 1.6, marginBottom: 13 }} />

                    {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} style={{ gap: 6 }} /> : null}
                    {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={5} /> : null}
                    {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
                    {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} variant="record" /> : null}

                    <P.Consent view={view} theme={theme} surface={shell} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <P.Back view={view} actions={actions} theme={theme} surface={shell} radius={4} label={'← Previous field'} style={{ border: 'none', padding: '9px 2px', fontSize: 12.5 }} />
                  <P.Submit view={view} actions={actions} theme={theme} surface={shell} radius={4} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const caseFileConsole: QuizComposition = {
  key: 'case_file_console',
  renders: COMPOSITION_CLAIMS.case_file_console,
  canvas: CANVAS,
  Root,
}
