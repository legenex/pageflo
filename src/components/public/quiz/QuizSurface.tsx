// @ts-nocheck -- shares the ported brand and deployment shapes, which are not
// yet typed (see the funnel @ts-nocheck note in CLAUDE.md). Everything this file
// hands a composition is typed by `QuizViewModel`. Run `pnpm generate:types` on
// the server to restore typing across the funnel builder.
'use client'

/**
 * THE quiz surface. Every place a quiz is drawn draws it here.
 *
 * Public page, iframe embed, landing-page hero, the builder's flow preview, the
 * node preview modal, the deployment gallery's thumbnail and its preview modal,
 * and the Templates tab - eight surfaces, one mount. They differ in TWO declared
 * ways and no others:
 *
 *   - WHO DRIVES: a live machine (a visitor), a preview machine (an operator
 *     clicking, side effects suppressed) or a scripted still (a fixture,
 *     frozen). All three are `useQuizMachine` / `useStillQuizMachine` and return
 *     the same shape, so nothing downstream can tell which it is holding.
 *   - WHERE IT SITS: `placement` decides page chrome. `page` draws the brand's
 *     header, body sections and footer; `inline` and `embed` draw none, because
 *     the host already drew a page.
 *
 * WHAT IT NO LONGER DECIDES is the page itself. It used to own the canvas, the
 * column, the card, the header strip and the responsive rules for all twenty
 * templates, which is why twenty structurally different designs resolved into
 * eight distinguishable groups at 390px. It now resolves a COMPOSITION - a
 * component that owns its whole DOM, canvas included - builds the view model
 * and the bound actions, and mounts it. See `src/lib/quiz-compositions/`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { resolveCompositionForRender } from '@/lib/quiz-compositions/registry'
import { cleanProgressForm } from '@/lib/quiz-templates/model'
import { quizBandSurface, quizTheme } from '@/lib/quiz-templates/theme'
import { SEED_CUSTOM_FIELDS } from '@/components/builder/quiz/seed-data'
import { QUIZ_PRIMITIVES } from './primitives'
import { useQuizView } from './view-model'
import { renderBodySection, resolvePagePalette } from './chrome'
import { withHostSurface } from '@/lib/quiz-theme'

/**
 * Narrowest an answer button can get before its label starts wrapping badly.
 * Used to decide how many columns fit the space the card ACTUALLY has, which is
 * not the same question as how wide the window is - a quiz card in a landing
 * page hero is narrow on a wide desktop screen.
 */
const MIN_OPTION_WIDTH = 210

/**
 * The gutter each placement's column sits in, so the column measurement below
 * matches the space a composition actually gives its card.
 */
const GUTTER = { page: 40, embed: 24, inline: 0 }

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
  const resolved = reportTemplateFallback('quiz surface', resolveForRender('quiz', deployment?.templateId)).template
  const templateId = resolved.id
  // The deployment may override the template's progress treatment; everything
  // else about the template is unchanged by it. That is what keeps it a knob
  // rather than a twenty-first template.
  const progressForm = cleanProgressForm(deployment?.progressForm)
  // The spec comes off the RESOLUTION, never off `QUIZ_TEMPLATE_BY_ID`: the
  // registry is the only module allowed to index the raw table, so that a
  // second lookup cannot start disagreeing with it about aliases.
  const base = resolved.template
  const spec = useMemo(
    () => (progressForm ? { ...base, progress: progressForm } : base),
    [base, progressForm],
  )

  // Composition resolution runs AFTER the registry, on the canonical id, so the
  // six legacy ids keep working with no second mapping table.
  const { composition } = resolveCompositionForRender(templateId)

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
  const theme = useMemo(() => quizTheme(spec, brand, surfaceColor), [spec, brand, surfaceColor])

  const rootRef = useRef(null)
  const [rootWidth, setRootWidth] = useState(0)

  /*
   * The space the card has, not the window.
   *
   * Measured on the surface root rather than on a column this file owns,
   * because it no longer owns one: the column is the composition's. The
   * template's declared maximum and the placement's gutter are applied here so
   * the answer here is the same one the old cardArea measurement gave -
   * `min(root - gutter, template width)` - without this file having to be
   * inside the composition to ask.
   */
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setRootWidth(el.getBoundingClientRect().width)
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

  // The ground the COMPOSITION paints, so the brand chrome drawn inside it is
  // derived against the colour it actually lands on rather than against the
  // template's page colour, which four of the compositions do not use.
  const canvas = quizBandSurface(theme, composition.canvas)
  const pagePal = resolvePagePalette(brand, templateId, progressForm, canvas.bg)
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
  const showChrome = !chromeless && !still
  const sections = deployment?.bodySectionOverrides || brand?.defaultBodySections || []
  const headerConfig = brand?.defaultHeader
  const footerConfig = brand?.defaultFooter

  // Destinations resolve deployment -> brand -> site page. Computed here and
  // handed to the view model so no composition has to know where a URL came
  // from - or, more to the point, could choose one.
  const destinationCtx = {
    deployment: deployment?.destinationOverrides,
    brand: brand?.urls,
  }

  const currentNode = machine.currentNode
  const authorCols = currentNode?.answerColumns || (currentNode?.questionType === 'button_grid' ? 2 : 1)
  const available = rootWidth > 0 ? Math.max(0, rootWidth - (GUTTER[placement] ?? 40)) : 0
  const bounded = chromeless ? available : Math.min(available || Infinity, theme.width ?? Infinity)
  const fitCols = Number.isFinite(bounded) && bounded > 0 ? Math.max(1, Math.floor(bounded / MIN_OPTION_WIDTH)) : authorCols
  const columns = Math.max(1, Math.min(authorCols, fitCols))

  const chrome = {
    header: showChrome && headerConfig ? (
      <header key="h" style={{ padding: '14px 24px', borderBottom: `1px solid ${canvas.line}`, display: 'flex', alignItems: 'center', backgroundColor: 'var(--site-tint)' }}>
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
            style={{ padding: '8px 16px', backgroundColor: canvas.accentFill, color: pagePal.onPrimary, borderRadius: brand.contact.callCtaStyle === 'pill' ? 999 : 8, fontSize: headerConfig.ctaButton.fontSize || 11, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.02em' }}
          >
            {headerConfig.ctaButton.text}
          </a>
        ) : null}
      </header>
    ) : null,
    body: showChrome && currentNode?.type !== 'endpoint' && !machine.finished
      ? <>{sections.map((s) => renderBodySection(s, brand, deployment, pagePal))}</>
      : null,
    footer: showChrome && footerConfig ? (
      <footer key="f" style={{ padding: '28px 24px', borderTop: `1px solid ${canvas.line}`, textAlign: 'center', backgroundColor: 'var(--site-tint)' }}>
        {footerConfig.logoEnabled && brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.displayName} style={{ height: footerConfig.logoSize || 32, marginBottom: 12 }} />
        ) : null}
        {footerConfig.showCopyright && brand.legal?.copyright ? (
          <div style={{ fontSize: footerConfig.fontSize || 12, color: pagePal.muted }}>{brand.legal.copyright}</div>
        ) : null}
      </footer>
    ) : null,
  }

  const { view, actions } = useQuizView({
    machine,
    brand,
    customFields,
    columns,
    destinationCtx,
    chrome,
    mode,
  })

  const Root = composition.Root

  return (
    <div
      ref={rootRef}
      className={inline ? 'quiz-public-root quiz-inline' : 'quiz-public-root'}
      aria-hidden={still ? 'true' : undefined}
      data-quiz-surface={mode}
      data-quiz-composition={composition.key}
      style={{
        position: 'relative',
        fontFamily: `"${brand.typography.headlineFont}", system-ui, sans-serif`,
        // A still is a picture of the real thing, not a second implementation
        // of it: the same handlers are attached and simply never reachable.
        pointerEvents: still ? 'none' : undefined,
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* Inline: the host already drew the card. Drawing a second one inside it
           reads as a box in a box, so the quiz gives up its own surface and
           borrows the host's. Colours are already derived against surfaceColor,
           so removing the background here cannot strand text on the wrong tone. */
        .quiz-inline .preview-card {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        /*
         * There is no global responsive override here any more.
         *
         * One media query used to force EVERY grid to a single column and EVERY
         * card to the same 24px padding, 14px radius and 16px margin below
         * 640px. That single rule was one of the two largest homogenisers in the
         * library: at 390px it erased the geometry twenty designs differ by, and
         * the measurement showed the result - eight distinguishable groups where
         * the source has fourteen. Column counts are container-measured above,
         * every tile grid already auto-fits, and each composition states its own
         * padding and radius in clamp() so it stays its own shape on a phone.
         */
      `}</style>

      <Root
        view={view}
        actions={actions}
        theme={theme}
        spec={spec}
        mode={mode}
        placement={placement}
        P={QUIZ_PRIMITIVES}
      />
    </div>
  )
}

export default QuizSurface
