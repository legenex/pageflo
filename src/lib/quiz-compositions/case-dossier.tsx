'use client'

import { quizBandSurface } from '@/lib/quiz-templates/theme'
import { QuizCanvas, QuizColumn } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

const CANVAS: QuizBand = 'alt'

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const host = quizBandSurface(theme, CANVAS)
  const shell = quizBandSurface(theme, 'page')
  const live = view.phase === 'question' || view.phase === 'form'
  const recorded = view.input.kind === 'options' && view.input.options.some((o) => o.selected)
  const mono = { fontFamily: theme.fonts.utility, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
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
            borderRadius: 2,
            overflow: 'hidden',
            color: shell.text,
            fontFamily: theme.fonts.body,
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${shell.line}` }}>
            <div style={{ width: 10, backgroundColor: shell.accentFill }} />
            <div style={{ flex: 1, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...mono, color: shell.text }}>File / assessment</span>
              <span style={{ ...mono, color: recorded ? shell.accentFill : shell.muted }}>{recorded ? 'Recorded' : 'Open'}</span>
            </div>
          </div>
          {live ? (
            <div style={{ padding: '10px 16px 0', borderBottom: `1px solid ${shell.line}` }}>
              <P.Progress view={view} theme={theme} spec={spec} surface={shell} />
            </div>
          ) : null}
          <div style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
            <P.Badges view={view} theme={theme} surface={shell} />
            {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={shell} /> : null}
            {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={shell} mode={mode} /> : null}
            {live ? (
              <>
                <P.Tagline view={view} style={{ ...mono, color: shell.muted, marginBottom: 8 }} />
                <P.Headline view={view} style={{ fontFamily: theme.fonts.display, fontWeight: 700, fontSize: 'clamp(18px, 3vw, 22px)', color: shell.text, marginBottom: 6 }} />
                <P.Question view={view} style={{ fontSize: 15, fontWeight: 600, color: shell.text, marginBottom: 6 }} />
                <P.Subheadline view={view} style={{ fontSize: 13, color: shell.muted, marginBottom: 16, lineHeight: 1.5 }} />
                {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={shell} /> : null}
                {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={shell} radius={2} /> : null}
                {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={shell} /> : null}
                {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={shell} radius={2} columns={2} /> : null}
                <P.Nav view={view} actions={actions} theme={theme} surface={shell} radius={2} style={{ marginTop: 18 }} />
                <P.Consent view={view} theme={theme} surface={shell} />
              </>
            ) : null}
          </div>
        </div>
      </QuizColumn>
    </QuizCanvas>
  )
}

export const caseDossier: QuizComposition = {
  key: 'case_dossier',
  renders: COMPOSITION_CLAIMS.case_dossier,
  canvas: CANVAS,
  Root,
}
