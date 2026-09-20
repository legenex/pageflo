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
  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={host.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            backgroundColor: s.bg,
            border: `1px solid ${s.line}`,
            borderRadius: 10,
            padding: 'clamp(16px, 3vw, 24px)',
            color: s.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <div style={{ flex: '0 0 min(100%, 200px)' }}>
            {live ? <P.Progress view={view} theme={theme} spec={spec} surface={s} /> : null}
          </div>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <P.Badges view={view} theme={theme} surface={s} />
            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
            {live ? (
              <>
                <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8 }} />
                <P.Headline view={view} style={{ fontWeight: 700, fontSize: 'clamp(18px, 3.4vw, 22px)', color: s.text, marginBottom: 6 }} />
                <P.Question view={view} style={{ fontSize: 15, fontWeight: 600, color: s.text, marginBottom: 8 }} />
                <P.Subheadline view={view} style={{ fontSize: 13, color: s.muted, marginBottom: 16 }} />
                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={8} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={8} /> : null}
                <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={8} style={{ marginTop: 16 }} />
                <P.Consent view={view} theme={theme} surface={s} />
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const timelineJourney: QuizComposition = {
  key: 'timeline_journey',
  renders: COMPOSITION_CLAIMS.timeline_journey,
  canvas: CANVAS,
  Root,
}
