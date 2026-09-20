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
          style={{ backgroundColor: 'transparent', border: 'none', color: s.text, fontFamily: theme.fonts.body, width: '100%' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <P.Progress view={view} theme={theme} spec={spec} surface={s} />
          </div>
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Tagline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 8, textAlign: 'center' }} />
              <P.Headline view={view} style={{ fontWeight: 800, fontSize: 'clamp(20px, 4vw, 26px)', color: s.text, marginBottom: 8, textAlign: 'center' }} />
              <P.Question view={view} style={{ fontSize: 16, fontWeight: 600, color: s.text, marginBottom: 16, textAlign: 'center' }} />
              <P.Subheadline view={view} style={{ fontSize: 14, color: s.muted, marginBottom: 18, textAlign: 'center' }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={16} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={16} /> : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 22 }}>
                <P.Back view={view} actions={actions} theme={theme} surface={s} radius={12} />
                <P.Submit view={view} actions={actions} theme={theme} surface={s} radius={12} />
              </div>
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const cardDeck: QuizComposition = {
  key: 'card_deck',
  renders: COMPOSITION_CLAIMS.card_deck,
  canvas: CANVAS,
  Root,
}
