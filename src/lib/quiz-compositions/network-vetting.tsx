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
          style={{ backgroundColor: s.bg, border: `1px solid ${s.line}`, borderRadius: 0, padding: 'clamp(22px, 4vw, 32px)', color: s.text, fontFamily: theme.fonts.body, width: '100%', maxWidth: 580, margin: '0 auto' }}
        >
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 20 }} />
              <P.Tagline view={view} style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: s.muted, marginBottom: 10 }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 600, fontSize: 'clamp(20px, 3.6vw, 24px)', color: s.text, marginBottom: 8 }} />
              <P.Question view={view} style={{ fontFamily: theme.fonts.question, fontSize: 16, fontWeight: 600, color: s.text, marginBottom: 8 }} />
              <P.Subheadline view={view} style={{ fontSize: 13, color: s.muted, marginBottom: 18, lineHeight: 1.6 }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={0} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={0} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={0} style={{ marginTop: 18 }} />
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${s.line}`, fontSize: 11, color: s.muted, letterSpacing: '0.04em' }}>
                Matching is reviewed before any introduction.
              </div>
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const networkVetting: QuizComposition = {
  key: 'network_vetting',
  renders: COMPOSITION_CLAIMS.network_vetting,
  canvas: CANVAS,
  Root,
}
