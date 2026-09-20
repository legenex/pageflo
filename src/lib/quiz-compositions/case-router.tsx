'use client'

import { quizBandSurface } from '@/lib/quiz-templates/theme'
import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

const CANVAS: QuizBand = 'page'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const s = quizBandSurface(theme, 'page')
  const live = view.phase === 'question' || view.phase === 'form'
  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={s.bg}>
      <QuizColumn theme={theme} placement={placement}>
        {live ? (
          <div style={{ marginBottom: 14, overflowX: 'auto' }}>
            <P.Progress view={view} theme={theme} spec={spec} surface={s} />
          </div>
        ) : null}
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{ backgroundColor: s.bg, border: `1px solid ${s.line}`, borderRadius: 12, padding: 'clamp(18px, 3.5vw, 26px)', color: s.text, fontFamily: theme.fonts.body, width: '100%' }}
        >
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8, fontFamily: theme.fonts.question, fontStyle: 'italic' }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 600, fontSize: 'clamp(20px, 4vw, 24px)', color: s.text, marginBottom: 8 }} />
              <P.Question view={view} style={{ fontSize: 16, fontWeight: 600, color: s.text, marginBottom: 8 }} />
              <P.Subheadline view={view} style={{ fontSize: 14, color: s.muted, marginBottom: 16 }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={10} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={10} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={10} style={{ marginTop: 16 }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const caseRouter: QuizComposition = {
  key: 'case_router',
  renders: COMPOSITION_CLAIMS.case_router,
  canvas: CANVAS,
  Root,
}
