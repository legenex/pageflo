'use client'

import { quizBandSurface } from '@/lib/quiz-templates/theme'
import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

const CANVAS: QuizBand = 'page'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const s = quizBandSurface(theme, CANVAS)
  const live = view.phase === 'question' || view.phase === 'form'
  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={s.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 'clamp(12px, 3vw, 24px) 0',
            color: s.text,
            fontFamily: theme.fonts.body,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 28 }} />
              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 800, fontSize: 'clamp(26px, 5.5vw, 40px)', lineHeight: 1.15, color: s.text, marginBottom: 10 }} />
              <P.Question view={view} style={{ fontSize: 18, fontWeight: 600, color: s.text, marginBottom: 10 }} />
              <P.Subheadline view={view} style={{ fontSize: 15, color: s.muted, marginBottom: 28, lineHeight: 1.5 }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <div style={{ maxWidth: 480, margin: '0 auto' }}><P.Field model={view.input.field} theme={theme} surface={s} radius={12} /></div> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={12} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={12} align="center" style={{ marginTop: 28 }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const quizFirst: QuizComposition = {
  key: 'quiz_first',
  renders: COMPOSITION_CLAIMS.quiz_first,
  canvas: CANVAS,
  Root,
}
