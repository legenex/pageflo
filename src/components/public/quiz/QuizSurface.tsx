// @ts-nocheck -- shares the ported quiz card and brand shapes, which are not yet
// typed (see the funnel @ts-nocheck note in CLAUDE.md). Run `pnpm generate:types`
// on the server to restore typing across the funnel builder.
'use client'

/**
 * THE quiz surface. Every place a quiz is drawn draws it here.
 *
 * Public page, iframe embed, landing-page hero, the builder's flow preview, the
 * node preview modal, the deployment gallery's thumbnail and its preview modal,
 * and the Templates tab - eight surfaces, one composition. They differ in TWO
 * declared ways and no others:
 *
 *   - WHO DRIVES: a live machine (a visitor), a preview machine (an operator
 *     clicking, side effects suppressed) or a scripted still (a fixture, frozen).
 *     All three are `useQuizMachine` / `useStillQuizMachine` and return the same
 *     shape, so this component cannot tell which it is holding.
 *   - WHERE IT SITS: `placement` decides page chrome. `page` draws the brand's
 *     header, body sections and footer; `inline` and `embed` draw none, because
 *     the host already drew a page.
 *
 * This exists because the gallery used to mount `TemplatePreview` - a hard-coded
 * question, two sample answers, no card, no header, no nav - while the landing
 * page branch twenty lines above mounted the real renderer. An operator picked a
 * quiz template from a picture no live page would ever produce. `TemplatePreview`
 * is deleted; there is no longer a component in the repository capable of
 * drawing an approximation of a quiz template, which is the only durable way to
 * keep that true.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { getTemplateConfig } from '@/components/builder/quiz/templates'
import { SEED_CUSTOM_FIELDS } from '@/components/builder/quiz/seed-data'
import { PreviewQuestionCard } from './QuizCard'
import { renderBodySection, resolvePagePalette } from './chrome'
import { withHostSurface } from '@/lib/quiz-theme'

/**
 * Narrowest an answer button can get before its label starts wrapping badly.
 * Used to decide how many columns fit the space the card ACTUALLY has, which is
 * not the same question as how wide the window is - a quiz card in a landing
 * page hero is narrow on a wide desktop screen.
 */
const MIN_OPTION_WIDTH = 210

export function QuizSurface({
  machine,
  quiz,
  brand: brandIn,
  deployment,
  mode = 'live',
  placement = 'page',
  surfaceColor = null,
}) {
  const customFields = quiz?.customFields?.length ? quiz.customFields : SEED_CUSTOM_FIELDS
  // The deployment resolver already canonicalises this, so on a real page it is
  // a pass-through. The registry call is what covers the embed, preview and
  // still paths that construct a deployment object by hand - a private
  // `|| 'minimal'` here silently disagreed with the resolver's own answer.
  const templateId = reportTemplateFallback('quiz surface', resolveForRender('quiz', deployment?.templateId)).template.id
  // The deployment may override the template's progress treatment; everything
  // else about the template is unchanged by it. Carried as a value rather than
  // baked into `tc` because the CARD has to resolve the same override - it used
  // to resolve its own config without it, which is how an operator's
  // `progress_form` choice reached the page background and never the widget.
  const progressForm = deployment?.progressForm ?? null
  const tc = getTemplateConfig(templateId, progressForm)

  const embed = placement === 'embed'
  const inline = placement === 'inline'
  // Both embed (iframe on someone else's site) and inline (a card inside one of
  // our own landing pages) drop the page chrome. They differ only in that an
  // embed also has to tell its parent frame how tall it is.
  const chromeless = embed || inline
  const still = mode === 'still'

  // When the quiz is dropped into a host surface - a landing-page hero card, a
  // section with its own background - the host tells us the OPAQUE colour the
  // quiz will sit on. Every text colour is then derived against that real
  // backdrop instead of against the quiz's own page background, which is what
  // keeps a dark-brand quiz readable inside a light landing page.
  const brand = withHostSurface(brandIn, surfaceColor)

  const rootRef = useRef(null)
  const cardAreaRef = useRef(null)
  // Width of the space the card has, not the window. Drives how many answer
  // columns are shown, so the same quiz reads correctly full-page and squeezed
  // into a landing-page hero.
  const [cardWidth, setCardWidth] = useState(0)

  useEffect(() => {
    const el = cardAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setCardWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Embed: report height to the parent frame.
  useEffect(() => {
    if (!embed || still || typeof window === 'undefined' || !rootRef.current) return
    const post = () => {
      const h = Math.ceil(rootRef.current?.getBoundingClientRect().height ?? 0)
      if (h > 0) {
        window.parent?.postMessage(
          { type: 'legalos:quiz-height', deploymentId: String(deployment?.id ?? ''), height: h },
          '*',
        )
      }
    }
    post()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(post) : null
    if (ro && rootRef.current) ro.observe(rootRef.current)
    window.addEventListener('resize', post)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', post)
    }
  }, [embed, still, deployment?.id])

  const C = brand.colors
  const pagePal = resolvePagePalette(brand, templateId, progressForm)
  const standalone = !chromeless
  /*
   * Page chrome comes from the BRAND, never from the placement. Two deployments
   * of one quiz under one brand cannot disagree about whose logo, whose call
   * button and whose copyright line the page shows, because there is only one
   * place to author it.
   *
   * A STILL draws none of it. The header, footer and body sections are
   * brand-owned and template-blind - identical under all twenty templates - so
   * in a template preview they add height and answer nothing. What a still must
   * show is the quiz, and that part is the real render.
   */
  const showChrome = standalone && !still
  const sections = deployment?.bodySectionOverrides || brand?.defaultBodySections || []
  const headerConfig = brand?.defaultHeader
  const footerConfig = brand?.defaultFooter

  // Destinations resolve deployment -> brand -> site page. Computed here and
  // handed to the card so the card never has to know where a URL came from.
  const destinationCtx = {
    deployment: deployment?.destinationOverrides,
    brand: brand?.urls,
  }

  const currentNode = machine.currentNode

  // How many answer columns actually fit. The author's setting is the ceiling,
  // never the floor: a two-column layout squeezed into a 320px landing-page
  // card becomes one column rather than two unreadable ones.
  const authorCols = currentNode?.answerColumns || (currentNode?.questionType === 'button_grid' ? 2 : 1)
  const fitCols = cardWidth > 0 ? Math.max(1, Math.floor(cardWidth / MIN_OPTION_WIDTH)) : authorCols
  const columns = Math.max(1, Math.min(authorCols, fitCols))

  // Chromeless renders sit inside someone else's layout, so they contribute no
  // background of their own and no page-height floor.
  const pageBackground = chromeless ? 'transparent' : tc.pageBg(brand)
  const pageOverlay = chromeless ? 'none' : tc.pageOverlay(brand)
  const pagePattern = chromeless ? 'none' : tc.pagePattern(brand)

  return (
    <div
      ref={rootRef}
      className={inline ? 'quiz-public-root quiz-inline' : 'quiz-public-root'}
      aria-hidden={still ? 'true' : undefined}
      data-quiz-surface={mode}
      style={{
        minHeight: chromeless || still ? undefined : '100vh',
        background: pageBackground,
        position: 'relative',
        fontFamily: `"${brand.typography.headlineFont}", system-ui, sans-serif`,
        // A still is a picture of the real thing, not a second implementation
        // of it: the same handlers are attached and simply never reachable.
        pointerEvents: still ? 'none' : undefined,
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .quiz-btn-outlined-box:hover { background-color: var(--quiz-primary) !important; }
        /* Inline: the host already drew the card. Drawing a second one inside it
           reads as a box in a box, so the quiz gives up its own surface and
           borrows the host's. Colours are already derived against surfaceColor,
           so removing the background here cannot strand text on the wrong tone. */
        .quiz-inline .preview-card {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        @media (max-width: 640px) {
          .quiz-public-root .preview-card { padding: 24px 18px !important; border-radius: 14px !important; margin: 16px 12px !important; }
          .quiz-public-root [style*="grid-template-columns"], .quiz-public-root [style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; gap: 10px !important; }
          .quiz-inline .preview-card { padding: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {pageOverlay !== 'none' && (
        <div style={{ position: 'absolute', inset: 0, background: pageOverlay, pointerEvents: 'none' }} />
      )}
      {pagePattern !== 'none' && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: pagePattern, backgroundSize: tc.patternSize || '24px 24px', pointerEvents: 'none', opacity: 0.5 }} />
      )}

      <div style={{ position: 'relative' }}>
        {showChrome && headerConfig ? (
          <header style={{ padding: '14px 24px', borderBottom: `1px solid ${C.primary}33`, display: 'flex', alignItems: 'center', backgroundColor: 'var(--site-tint)' }}>
            <div style={{ flex: 1 }}>
              {headerConfig.logoEnabled && brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt={brand.displayName} style={{ height: 28 }} />
              ) : headerConfig.logoEnabled ? (
                <div style={{ fontSize: 18, color: pagePal.text, fontWeight: 700 }}>{brand.displayName}</div>
              ) : null}
            </div>
            {headerConfig.ctaButton?.enabled && headerConfig.ctaButton?.url ? (
              <a
                href={headerConfig.ctaButton.url}
                style={{ padding: '8px 16px', backgroundColor: C.primary, color: pagePal.onPrimary, borderRadius: brand.contact.callCtaStyle === 'pill' ? 999 : 8, fontSize: headerConfig.ctaButton.fontSize || 11, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.02em' }}
              >
                {headerConfig.ctaButton.text}
              </a>
            ) : null}
          </header>
        ) : null}

        <main style={{ padding: chromeless ? (inline ? 0 : '16px 12px') : '40px 20px' }}>
          {/*
            * The column is the TEMPLATE's declared maximum, not a constant.
            *
            * It was a hard 760px, so the eight templates that declare 820-900
            * were silently clamped to something narrower than their design, and
            * `sq_fullscreen_focus` - which declares full bleed - could not reach
            * the edge of anything. `cardMaxWidth` is null for a full-bleed
            * template and is passed through as such.
            *
            * There is no generic progress bar above this any more. One was drawn
            * for EVERY template in brand primary, four pixels tall, immediately
            * above whichever of the twenty progress forms the template had
            * chosen. That single element did more to make the twenty look alike
            * than anything else on the page. The template's own form, drawn
            * inside the card, is now the only progress on the page.
            */}
          <div ref={cardAreaRef} style={{ maxWidth: chromeless ? '100%' : (tc.cardMaxWidth ?? '100%'), margin: '0 auto' }}>
            {machine.showSpinner ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Loader2 size={30} color={C.primary} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : currentNode && !machine.finished ? (
              <PreviewQuestionCard
                node={currentNode}
                brand={brand}
                customFields={customFields}
                onAnswer={machine.answer}
                fieldValues={machine.fieldValues}
                templateId={templateId}
                progressForm={progressForm}
                stepIdx={machine.progress.index}
                totalSteps={machine.progress.total}
                stepLabels={machine.progress.labels}
                onBack={machine.back}
                canGoBack={machine.canGoBack}
                destinationCtx={destinationCtx}
                columns={columns}
                previewMode={mode !== 'live'}
                selectedAnswerId={machine.selectedAnswerId}
              />
            ) : (
              <div style={{ padding: 48, textAlign: 'center', color: pagePal.text }}>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Thank you</div>
                <div style={{ fontSize: 15, color: pagePal.muted }}>Your answers have been received.</div>
              </div>
            )}
          </div>
        </main>

        {showChrome && currentNode?.type !== 'endpoint' && !machine.finished
          ? sections.map((s) => renderBodySection(s, brand, deployment, pagePal))
          : null}

        {showChrome && footerConfig ? (
          <footer style={{ padding: '28px 24px', borderTop: `1px solid ${C.primary}22`, textAlign: 'center', backgroundColor: 'var(--site-tint)' }}>
            {footerConfig.logoEnabled && brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.displayName} style={{ height: footerConfig.logoSize || 32, marginBottom: 12 }} />
            ) : null}
            {footerConfig.showCopyright && brand.legal?.copyright ? (
              <div style={{ fontSize: footerConfig.fontSize || 12, color: pagePal.muted }}>{brand.legal.copyright}</div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export default QuizSurface
