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
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{ background: 'transparent', border: 'none', color: s.text, fontFamily: theme.fonts.body, width: '100%', maxWidth: 560, margin: '0 auto' }}
        >
          <div style={{ fontSize: 11, color: host.muted, marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Automated review, not a live person</div>
          <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ marginBottom: 16 }} />
          <P.Badges view={view} theme={theme} surface={s} />
          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}
          {live ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {prior.map((label, i) => (
                  <div key={`${label}-${i}`} style={{ alignSelf: 'flex-start', backgroundColor: host.bg, border: `1px solid ${s.line}`, borderRadius: '14px 14px 14px 4px', padding: '8px 12px', fontSize: 13, color: s.muted, maxWidth: '85%' }}>
                    {label}
                  </div>
                ))}
                <div style={{ alignSelf: 'flex-start', backgroundColor: s.bg, borderRadius: '4px 14px 14px 14px', padding: '14px 16px', maxWidth: '92%', boxShadow: `0 1px 0 ${s.line}` }}>
                  <P.Tagline view={view} style={{ fontSize: 11, color: s.muted, marginBottom: 6 }} />
                  <P.Headline view={view} style={{ fontWeight: 700, fontSize: 18, color: s.text, marginBottom: 6 }} />
                  <P.Question view={view} style={{ fontSize: 15, fontWeight: 600, color: s.text, marginBottom: 6 }} />
                  <P.Subheadline view={view} style={{ fontSize: 13, color: s.muted }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} style={{ width: '100%' }} /> : null}
              </div>
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={999} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={999} /> : null}
              <P.Nav view={view} actions={actions} theme={theme} surface={s} radius={999} align="end" style={{ marginTop: 14 }} />
              <P.Consent view={view} theme={theme} surface={s} />
            </>
          ) : null}
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const guidedConversation: QuizComposition = {
  key: 'guided_conversation',
  renders: COMPOSITION_CLAIMS.guided_conversation,
  canvas: CANVAS,
  Root,
}
