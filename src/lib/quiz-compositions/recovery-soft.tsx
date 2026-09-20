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
            backgroundColor: s.bg,
            border: `1px solid ${s.line}`,
            borderRadius: 28,
            padding: 'clamp(28px, 5vw, 44px) clamp(22px, 4vw, 36px)',
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
              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 10, letterSpacing: '0.06em' }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 600, fontSize: 'clamp(22px, 4.2vw, 28px)', lineHeight: 1.25, color: s.text, marginBottom: 8 }} />
              <P.Question view={view} style={{ fontFamily: theme.fonts.question, fontSize: 17, fontWeight: 600, color: s.text, marginBottom: 8 }} />
              <P.Subheadline view={view} style={{ fontSize: 14, color: s.muted, lineHeight: 1.6, marginBottom: 18 }} />
              <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ margin: '0 auto 22px', maxWidth: 280 }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} style={{ textAlign: 'left' }} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={999} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={999} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={999} style={{ marginTop: 22, justifyContent: 'center' }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const recoverySoft: QuizComposition = {
  key: 'recovery_soft',
  renders: COMPOSITION_CLAIMS.recovery_soft,
  canvas: CANVAS,
  Root,
}
