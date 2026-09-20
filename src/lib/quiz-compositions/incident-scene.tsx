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
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{ backgroundColor: s.bg, border: 'none', padding: '8px 0 0', color: s.text, fontFamily: theme.fonts.body, width: '100%' }}
        >
          <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 18 }} />
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8, textAlign: 'center' }} />
              <P.Headline view={view} style={{ fontWeight: 800, fontSize: 'clamp(20px, 4vw, 26px)', color: s.text, marginBottom: 8, textAlign: 'center' }} />
              <P.Question view={view} style={{ fontSize: 16, fontWeight: 600, color: s.text, marginBottom: 8, textAlign: 'center' }} />
              <P.Subheadline view={view} style={{ fontSize: 14, color: s.muted, marginBottom: 20, textAlign: 'center' }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={10} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={10} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={10} align="center" style={{ marginTop: 20 }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const incidentScene: QuizComposition = {
  key: 'incident_scene',
  renders: COMPOSITION_CLAIMS.incident_scene,
  canvas: CANVAS,
  Root,
}
