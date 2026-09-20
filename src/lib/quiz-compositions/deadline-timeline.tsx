'use client'

import { quizBandSurface } from '@/lib/quiz-templates/theme'
import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

const CANVAS: QuizBand = 'dark'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const host = quizBandSurface(theme, CANVAS)
  const shell = quizBandSurface(theme, 'dark')
  const live = view.phase === 'question' || view.phase === 'form'
  return (
    <QuizCanvas view={view} theme={theme} placement={placement} background={host.bg}>
      <QuizColumn theme={theme} placement={placement}>
        <div
          className="preview-card"
          data-quiz-root=""
          data-quiz-node-type={view.node.type}
          style={{
            backgroundColor: shell.bg,
            border: `1px solid ${shell.line}`,
            borderRadius: 8,
            overflow: 'hidden',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <div style={{ backgroundColor: shell.accentFill, color: shell.bg, padding: '10px 18px', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Time-sensitive review
          </div>
          {live ? (
            <div style={{ padding: '14px 18px 0' }}>
              <P.Progress view={view} theme={theme} spec={spec} surface={shell} />
            </div>
          ) : null}
          <div style={{ padding: 'clamp(18px, 3.5vw, 26px)' }}>
            <P.Badges view={view} theme={theme} surface={shell} />
            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}
            {live ? (
              <>
                <P.Tagline view={view} style={{ fontSize: 11, color: shell.muted, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }} />
                <P.Headline view={view} style={{ fontWeight: 800, fontSize: 'clamp(20px, 4vw, 26px)', color: shell.text, marginBottom: 8 }} />
                <P.Question view={view} style={{ fontSize: 16, fontWeight: 600, color: shell.text, marginBottom: 8 }} />
                <P.Subheadline view={view} style={{ fontSize: 14, color: shell.muted, marginBottom: 18, lineHeight: 1.5 }} />
                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={6} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} radius={6} /> : null}
                <P.Nav view={view} actions={actions} theme={theme} surface={shell} radius={6} style={{ marginTop: 18 }} />
                <P.Consent view={view} theme={theme} surface={shell} />
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const deadlineTimeline: QuizComposition = {
  key: 'deadline_timeline',
  renders: COMPOSITION_CLAIMS.deadline_timeline,
  canvas: CANVAS,
  Root,
}
