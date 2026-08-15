'use client'

/**
 * SQ-17 Fullscreen Focus — one question per screen, and no card at all.
 *
 * Transcribed from `quizzes/Standalone-Quiz-17-Fullscreen-Focus.html`
 * (unbundled). It is the only one of the twenty with NO shell: grep the
 * unbundled document and there is no `{{shellBg}}`, `{{shellBd}}`, `{{shellSh}}`,
 * `{{qr}}` or `{{pad}}` anywhere in it. What it has instead:
 *
 *   - a full-bleed 5px progress line pinned to the very top of the canvas,
 *     outside any column, ahead of the content in the DOM;
 *   - a content area that takes the remaining height and CENTRES vertically
 *     (`flex:1` + `justify-content:center`);
 *   - centred type at `clamp(26px,4vw,36px)`, the largest in the set, and the
 *     only heading in the twenty bound to the host ink rather than to a card;
 *   - oversized buttons, `min-height:64px`, 2px borders, a 30px key-cap letter;
 *   - 16px inputs, the iOS no-zoom threshold, which no other design uses.
 *
 * The vertical centring is the axis that survives a phone. A card composition
 * puts its mass at the top of a 390px screen under whatever chrome it draws;
 * this one puts a band of empty canvas above and below the content, which is a
 * signature no bordered card can produce.
 *
 * WIDTH. The template declares `[440, 0]` — a zero maximum, meaning full bleed —
 * which `templateMaxWidth` correctly reports as "no maximum". Full bleed applies
 * to the CANVAS and the progress line; the reading measure does not follow it,
 * because a 1280px line of 36px type is not a design. The source's own width
 * ladder is `440/560/680/100%` and it renders at `standard`, so 560 is the
 * measure the design actually draws at.
 */

import { quizBandSurface } from '@/lib/quiz-templates/theme'

import { QuizCanvas } from './frame'
import { COMPOSITION_CLAIMS } from './claims'
import type { QuizBand, QuizComposition, QuizCompositionProps } from './types'

/** The ground this composition paints. Declared once; read by the Root and by
 *  the thumbnail, so a still and its backdrop cannot disagree. */
const CANVAS: QuizBand = 'page'

/** `widths.standard` from SQ-17's own `renderVals`. */
const READING_MEASURE = 560

const Root = ({ view, actions, theme, spec, mode, placement, P }: QuizCompositionProps) => {
  const s = quizBandSurface(theme, CANVAS)
  const live = view.phase === 'question' || view.phase === 'form'
  const chromeless = placement !== 'page'

  return (
    <QuizCanvas
      view={view}
      theme={theme}
      placement={placement}
      background={quizBandSurface(theme, CANVAS).bg}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Edge to edge, ahead of everything, touching the top of the viewport.
          Not a widget inside a card: this is the whole of the chrome. */}
      {live ? (
        <P.Progress view={view} theme={theme} spec={spec} surface={s} style={{ width: '100%' }} />
      ) : null}

      <div
        data-quiz-root=""
        data-quiz-node-type={view.node.type}
        className="preview-card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: chromeless ? '20px 12px' : 'clamp(28px, 6vw, 44px) clamp(16px, 5vw, 28px) clamp(40px, 8vw, 72px)',
          color: s.text,
          fontFamily: theme.fonts.body,
          // No card. No border, no background, no radius, no shadow — the
          // content sits on the bare canvas, which is the design.
          background: 'transparent',
        }}
      >
        <div style={{ width: '100%', maxWidth: READING_MEASURE, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <P.Badges view={view} theme={theme} surface={s} />

          {view.phase === 'working' ? <P.Working view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'complete' ? <P.Complete view={view} theme={theme} surface={s} /> : null}
          {view.phase === 'endpoint' ? <P.Endpoint view={view} theme={theme} surface={s} mode={mode} /> : null}

          {live ? (
            <>
              <P.Tagline view={view} style={{ fontFamily: theme.fonts.utility, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: s.muted, textAlign: 'center' }} />
              <P.Headline view={view} style={{ fontFamily: theme.fonts.question, fontWeight: 800, fontSize: 'clamp(26px, 4vw, 36px)', lineHeight: 1.15, letterSpacing: '-0.02em', color: s.text, textAlign: 'center' }} />
              <P.Question view={view} style={{ fontSize: 17, fontWeight: 600, color: s.text, textAlign: 'center', marginTop: -12 }} />
              <P.Subheadline view={view} style={{ fontSize: 15, color: s.muted, lineHeight: 1.6, textAlign: 'center', marginTop: -12 }} />

              {view.input.kind === 'options' ? <P.AnswerList view={view} theme={theme} spec={spec} surface={s} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} /> : null}
              {view.input.kind === 'select' || view.input.kind === 'text' ? <P.Field model={view.input.field} theme={theme} surface={s} radius={14} style={{ padding: '16px 20px', borderWidth: 2 }} /> : null}
              {view.input.kind === 'date' ? <P.DatePicker view={view} theme={theme} surface={s} /> : null}
              {view.input.kind === 'fields' ? <P.Fields view={view} theme={theme} surface={s} radius={14} style={{ gap: 12 }} /> : null}

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <P.Submit view={view} actions={actions} theme={theme} surface={s} radius={14} block style={{ padding: '18px 28px', fontSize: 17 }} />
                <P.Back view={view} actions={actions} theme={theme} surface={s} style={{ border: 'none', fontSize: 14, fontWeight: 600 }} />
              </div>
              <P.Consent view={view} theme={theme} surface={s} style={{ textAlign: 'center', marginTop: 0 }} />
            </>
          ) : null}
        </div>
      </div>
    </QuizCanvas>
  )
}

export const fullscreenFocus: QuizComposition = {
  key: 'fullscreen_focus',
  renders: COMPOSITION_CLAIMS.fullscreen_focus,
  canvas: CANVAS,
  Root,
}
