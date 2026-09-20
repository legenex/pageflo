'use client'

import { quizBandSurface } from '@/lib/quiz-templates/theme'
import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

const CANVAS: QuizBand = 'alt'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const host = quizBandSurface(theme, CANVAS)
  const s = quizBandSurface(theme, 'page')
  const live = view.phase === 'question' || view.phase === 'form'
  const prior = view.step.labels.slice(0, view.step.index)
  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={host.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div className="preview-card" data-quiz-root="" data-quiz-node-type={view.node.type} style={{ width: '100%', color: s.text, fontFamily: theme.fonts.body }}>
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              {prior.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {prior.map((label, i) => (
                    <div key={`${label}-${i}`} style={{ backgroundColor: host.bg, border: `1px solid ${s.line}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: s.muted }}>
                      {i + 1}. {label}
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ backgroundColor: s.bg, border: `2px solid ${s.accentFill}`, borderRadius: 14, padding: 'clamp(18px, 3.5vw, 26px)' }}>
                <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 14 }} />
                <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8 }} />
                <P.Headline view={view} style={{ fontWeight: 700, fontSize: 'clamp(18px, 3.5vw, 22px)', color: s.text, marginBottom: 6 }} />
                <P.Question view={view} style={{ fontSize: 15, fontWeight: 600, color: s.text, marginBottom: 8 }} />
                <P.Subheadline view={view} style={{ fontSize: 13, color: s.muted, marginBottom: 14 }} />
                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={10} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={10} /> : null}
                <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={10} style={{ marginTop: 16 }} />
                <P.Consent view={view} theme={theme} surface={s} />
              </div>
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const answerFirst: QuizComposition = {
  key: 'answer_first',
  renders: COMPOSITION_CLAIMS.answer_first,
  canvas: CANVAS,
  Root,
}
