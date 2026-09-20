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
    <QuizCanvas view={view} theme={theme} placement={placement} background={quizBandSurface(theme, CANVAS).bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{ backgroundColor: s.bg, border: `1px solid ${s.line}`, borderRadius: 16, padding: '18px 16px 16px', color: s.text, fontFamily: theme.fonts.body, width: '100%', maxWidth: 440, margin: '0 auto' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.muted }}>Quick check</span>
            <span style={{ fontSize: 11, fontWeight: 700, backgroundColor: s.accentFill, color: s.bg, borderRadius: 999, padding: '3px 8px' }}>~60s</span>
          </div>
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 14 }} />
              <P.Tagline view={view} style={{ fontSize: 11, color: s.muted, marginBottom: 6 }} />
              <P.Headline view={view} style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.25, color: s.text, marginBottom: 6 }} />
              <P.Question view={view} style={{ fontSize: 14, fontWeight: 600, color: s.text, marginBottom: 6 }} />
              <P.Subheadline view={view} style={{ fontSize: 12, color: s.muted, marginBottom: 12 }} />
              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={999} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={999} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={999} style={{ marginTop: 12 }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const sixtySecond: QuizComposition = {
  key: 'sixty_second',
  renders: COMPOSITION_CLAIMS.sixty_second,
  canvas: CANVAS,
  Root,
}
