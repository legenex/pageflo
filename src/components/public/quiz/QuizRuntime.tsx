// @ts-nocheck -- shares the ported quiz preview components, which are not yet
// typed (see the funnel @ts-nocheck note in CLAUDE.md). Run `pnpm generate:types`
// on the server to restore typing across the funnel builder.
'use client'

/**
 * The public quiz runtime.
 *
 * This is what a visitor and a crawler actually get when they open a quiz
 * deployment. It deliberately renders through the SAME components the builder
 * preview uses (PreviewQuestionCard, renderBodySection) and walks the flow with
 * the SAME pure functions the builder edits with (quiz-graph). "What you built
 * is what visitors get" is enforced by there being one implementation, not by
 * two implementations being kept in agreement by hand.
 *
 * What this file adds on top of the preview:
 *
 *  - Non-visual nodes execute instead of rendering a debug button. Decision,
 *    webhook, verification and transition nodes are builder concepts; a visitor
 *    must never see one, so they advance on their own behind a neutral spinner.
 *  - The lead is submitted BEFORE the endpoint renders. An endpoint can be
 *    configured to redirect 800ms after it appears, so persisting the lead
 *    afterwards would race the redirect and lose leads on slow connections.
 *    The endpoint card is held back until the submit settles.
 *  - Exactly one submit per session, guarded by a ref rather than by state, so
 *    a re-render (or React StrictMode's double effect invocation in dev) cannot
 *    produce a duplicate lead.
 *  - Embed mode drops all page chrome and reports its height to the parent
 *    frame, so the same deployment can be a standalone page or an iframe.
 */

import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  resolveNodeForStep, nextSequentialStepIndex, explicitStepIndex, entryStepIndex,
} from '@/lib/quiz-graph'
import { getTemplateConfig } from '@/components/builder/quiz/templates'
import { PreviewQuestionCard, renderBodySection } from '@/components/builder/quiz/preview'
import { isNodeVisible, SEED_CUSTOM_FIELDS } from '@/components/builder/quiz/seed-data'
import { getSafeTextColor, getSafeMutedColor, deriveBrandSurface, onPrimaryText } from '@/lib/builder/color-system'
import {
  captureAttribution, readTrustedFormCert, readJornayaLeadId, firePixelEvents, submitLead,
} from '@/lib/lead-capture-client'
import { splitQuizAnswers, isDeliverableContact } from '@/lib/quiz-lead'
import { withHostSurface } from '@/lib/quiz-theme'

// Node types that exist for the flow author, not for the visitor. They resolve
// and advance without ever painting a question card.
const INVISIBLE_NODE_TYPES = new Set(['decision', 'webhook', 'verification', 'transition'])

// Page-level palette for the standalone chrome. Mirrors resolvePagePalette in
// the builder preview so the live page and the preview shade identically.
const resolvePagePalette = (brand, templateId) => {
  // The ground comes from the template's OWN resolver, which is brand-derived.
  // This used to hardcode a cream page for the editorial template and fall back
  // to a navy for everything else, so a brand's background was ignored twice
  // over: once by the template and once by the fallback.
  const tc = getTemplateConfig(templateId)
  const base = tc.pageBg(brand)
  const text = getSafeTextColor(base).hex
  const muted = getSafeMutedColor(text, base).hex
  const cardSurface = deriveBrandSurface(brand?.colors?.cardBg || base, brand?.colors?.primary || base, { hueBlend: 0.05 })
  const cardText = getSafeTextColor(cardSurface).hex
  const cardMuted = getSafeMutedColor(cardText, cardSurface).hex
  return { base, text, muted, cardSurface, cardText, cardMuted, onPrimary: onPrimaryText(brand?.colors?.primary || base) }
}

/**
 * Narrowest an answer button can get before its label starts wrapping badly.
 * Used to decide how many columns fit the space the card ACTUALLY has, which is
 * not the same question as how wide the window is - a quiz card in a landing
 * page hero is narrow on a wide desktop screen.
 */
const MIN_OPTION_WIDTH = 210

export function QuizRuntime({
  quiz,
  brand: brandIn,
  deployment,
  site,
  embed = false,
  inline = false,
  surfaceColor = null,
  previewMode = false,
}) {
  const customFields = quiz.customFields?.length ? quiz.customFields : SEED_CUSTOM_FIELDS
  // The deployment resolver already canonicalises this, so on a real page it is
  // a pass-through. The registry call is what covers the embed and preview paths
  // that construct a deployment object by hand - a private `|| 'minimal'` here
  // silently disagreed with the resolver's own answer.
  const templateId = reportTemplateFallback('quiz runtime', resolveForRender('quiz', deployment?.templateId)).template.id
  // The deployment may override the template's progress treatment; everything
  // else about the template is unchanged by it.
  const tc = getTemplateConfig(templateId, deployment?.progressForm)
  // Both embed (iframe on someone else's site) and inline (a card inside one of
  // our own landing pages) drop the page chrome. They differ only in that an
  // embed also has to tell its parent frame how tall it is.
  const chromeless = embed || inline

  // When the quiz is dropped into a host surface - a landing-page hero card, a
  // section with its own background - the host tells us the OPAQUE colour the
  // quiz will sit on. Every text colour is then derived against that real
  // backdrop instead of against the quiz's own page background, which is what
  // keeps a dark-brand quiz readable inside a light landing page. This is the
  // same "derive from the surface it actually sits on" rule the colour system
  // enforces everywhere else; passing the host surface through is what lets it
  // apply across the boundary.
  const brand = withHostSurface(brandIn, surfaceColor)

  const [stepIdx, setStepIdx] = useState(() => Math.max(entryStepIndex(quiz, null), 0))
  const [currentTier, setCurrentTier] = useState(null)
  const [fieldValues, setFieldValues] = useState({})
  const [history, setHistory] = useState([])
  const [finished, setFinished] = useState(false)
  const [busy, setBusy] = useState(false)
  // 'idle' | 'sending' | 'done' - gates the endpoint card so a redirecting
  // endpoint cannot fire before the lead is persisted.
  const [submitState, setSubmitState] = useState('idle')
  const submittedRef = useRef(false)
  const rootRef = useRef(null)
  const cardAreaRef = useRef(null)
  // Width of the space the card has, not the window. Drives how many answer
  // columns are shown, so the same quiz reads correctly full-page and squeezed
  // into a landing-page hero.
  const [cardWidth, setCardWidth] = useState(0)
  // Consecutive nodes resolved that the visitor never saw. Reset whenever a
  // real question renders; see the skip effect for why it is bounded.
  const autoAdvanceRef = useRef(0)

  const currentNode = useMemo(
    () => resolveNodeForStep(quiz, quiz.steps[stepIdx]?.key, currentTier),
    [quiz, stepIdx, currentTier],
  )

  // Capture ?utm_source=... style params into the answer set on mount, so they
  // ride along with the lead and are available to {{interpolation}} in copy.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const captured = {}
    try {
      const params = new URLSearchParams(window.location.search)
      customFields.forEach((cf) => {
        if (params.has(cf.key)) captured[cf.key] = params.get(cf.key)
      })
    } catch {}
    if (Object.keys(captured).length) setFieldValues((prev) => ({ ...captured, ...prev }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Lead submission
  // ---------------------------------------------------------------------------
  const submitOnce = useCallback(async (values) => {
    if (submittedRef.current) return
    submittedRef.current = true

    // Clicking through a builder preview must not create a lead. This is the
    // one guard between "designing a landing page" and "a fake person in the
    // dashboard, a fired pixel, and a webhook delivered to a buyer".
    if (previewMode) {
      setSubmitState('done')
      return
    }

    const { contact, quizAnswers } = splitQuizAnswers(values)
    if (!isDeliverableContact(contact)) {
      // Nothing to deliver: the visitor dropped before any contact question, or
      // this quiz collects none. Persisting an empty lead would put junk in the
      // dashboard, so the flow simply completes.
      setSubmitState('done')
      return
    }

    setSubmitState('sending')
    const body = {
      site_slug: site?.slug,
      funnel_type: 'quiz',
      funnel_id: quiz.slug || String(quiz.id),
      funnel_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      source_entity_id: deployment?.id ? String(deployment.id) : undefined,
      contact,
      quiz_answers: quizAnswers,
      attribution: captureAttribution(),
      trustedform_cert_url: readTrustedFormCert() || undefined,
      jornaya_lead_id: readJornayaLeadId() || undefined,
    }

    // Retry once on failure. A completed quiz is the most expensive thing to
    // drop, and the common failure here is a transient network blip on mobile,
    // not a rejected payload. Two attempts and roughly a second of delay is
    // invisible next to the endpoint's own redirect timer.
    let result = await submitLead(body)
    if (!result.ok) {
      await new Promise((r) => setTimeout(r, 1200))
      result = await submitLead(body)
    }

    if (result.ok) {
      firePixelEvents(result.event_id ?? '', site?.name || site?.slug || quiz.name)
    } else {
      // The visitor has already finished; an error message would not help them
      // and would cost the conversion. The failure is logged for the operator.
      // The guard is released so a later endpoint in the flow can try again
      // rather than the session being permanently marked as submitted.
      // eslint-disable-next-line no-console
      console.error('[legalos] lead submit failed:', result.error)
      submittedRef.current = false
    }
    setSubmitState('done')
  }, [quiz, site, deployment, previewMode])

  // ---------------------------------------------------------------------------
  // Flow advance
  // ---------------------------------------------------------------------------
  const advance = useCallback(async (answer, node, valuesIn) => {
    let newValues = { ...valuesIn }
    ;(answer.fieldMappings || []).forEach((m) => { if (m.key) newValues[m.key] = m.value })
    if (answer.isDQ) newValues.dq_lead = 'yes'
    if (answer.setTier) newValues.tier = answer.setTier

    // AI nodes run server-side: the prompt lives in the database and is looked
    // up from the deployment, so a visitor can never post an arbitrary prompt
    // to our Anthropic key.
    if (node?.ai?.enabled && node.ai.outputField && deployment?.id && !previewMode) {
      setBusy(true)
      try {
        const resp = await fetch('/api/legalos/quiz-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deployment_id: String(deployment.id), node_id: node.id, values: newValues }),
        })
        const out = await resp.json()
        if (out?.ok && typeof out.text === 'string') newValues[node.ai.outputField] = out.text
      } catch {
        // An AI enrichment failure must not dead-end the visitor mid-funnel.
      } finally {
        setBusy(false)
      }
    }

    setFieldValues(newValues)

    const nextTier = answer.setTier || currentTier
    if (answer.setTier) setCurrentTier(answer.setTier)

    if (node?.type === 'decision' && node.conditions) {
      for (const cond of node.conditions) {
        const v = newValues[cond.field] || ''
        const ok = cond.operator === 'eq' ? v === cond.value
          : cond.operator === 'neq' ? v !== cond.value
          : cond.operator === 'contains' ? String(v).includes(cond.value)
          : cond.operator === 'is_empty' ? !v
          : cond.operator === 'is_not_empty' ? Boolean(v)
          : false
        if (ok) {
          const ti = explicitStepIndex(quiz, cond.nextStepKey)
          if (ti >= 0) { setStepIdx(ti); return }
        }
      }
      const di = explicitStepIndex(quiz, node.defaultNextStepKey)
      if (di >= 0) { setStepIdx(di); return }
    }

    const ei = explicitStepIndex(quiz, answer.nextStepKey)
    if (ei >= 0) { setStepIdx(ei); return }

    const seq = nextSequentialStepIndex(quiz, stepIdx, nextTier)
    if (seq >= 0) {
      setStepIdx(seq)
    } else {
      // Ran out of steps without hitting an endpoint. That is still the end of
      // the funnel, so the lead is delivered here too.
      setFinished(true)
      void submitOnce(newValues)
    }
  }, [quiz, stepIdx, currentTier, deployment, submitOnce])

  const handleAnswer = useCallback((answer) => {
    if (!currentNode) return
    setHistory((h) => [...h, { stepIdx, tier: currentTier, values: { ...fieldValues } }])
    void advance(answer, currentNode, fieldValues)
  }, [currentNode, stepIdx, currentTier, fieldValues, advance])

  const goBack = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setStepIdx(last.stepIdx)
      setCurrentTier(last.tier)
      setFieldValues(last.values)
      return h.slice(0, -1)
    })
  }, [])

  // Nodes the visitor must never see: execute and move on. Also covers a node
  // the author has hidden (isVisible === false).
  useEffect(() => {
    if (!currentNode || finished) return
    const mustSkip = INVISIBLE_NODE_TYPES.has(currentNode.type) || !isNodeVisible(currentNode)
    if (!mustSkip) {
      autoAdvanceRef.current = 0
      return
    }

    // A routing mistake can send the flow between nodes the visitor never sees.
    // Because the skip effect is keyed on the node id, a cycle would not spin
    // the CPU - it would leave the visitor on a loading spinner forever, which
    // is worse. Past the point where every step could legitimately have been
    // skipped once, the funnel ends and whatever was collected is delivered.
    autoAdvanceRef.current += 1
    if (autoAdvanceRef.current > quiz.steps.length + 5) {
      // eslint-disable-next-line no-console
      console.error('[legalos] quiz flow made no visible progress; ending the session')
      setFinished(true)
      void submitOnce(fieldValues)
      return
    }

    // A short beat so a transition node reads as a transition rather than a flash.
    const delay = currentNode.type === 'transition' ? 700 : 0
    const t = setTimeout(() => { void advance({ nextStepKey: '' }, currentNode, fieldValues) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode?.id, finished])

  // Reaching an endpoint IS the conversion. Submit before the endpoint card is
  // allowed to render, because an endpoint can redirect on a timer.
  useEffect(() => {
    if (!currentNode || currentNode.type !== 'endpoint') return
    void submitOnce(fieldValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode?.id])

  // ---------------------------------------------------------------------------
  // Measure the card area so the answer grid fits its container
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = cardAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setCardWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---------------------------------------------------------------------------
  // Embed: report height to the parent frame
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!embed || typeof window === 'undefined' || !rootRef.current) return
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
  }, [embed, deployment?.id])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const C = brand.colors
  const pagePal = resolvePagePalette(brand, templateId)
  const standalone = !chromeless
  const sections = deployment?.bodySectionOverrides || brand?.defaultBodySections || []
  const headerConfig = deployment?.headerConfig
  const footerConfig = deployment?.footerConfig
  const progress = quiz.steps.length ? Math.min(100, ((stepIdx + 1) / quiz.steps.length) * 100) : 0

  // Destinations resolve deployment -> brand -> site page. Computed here and
  // handed to the card so the card never has to know where a URL came from.
  const destinationCtx = {
    deployment: deployment?.destinationOverrides,
    brand: brand?.urls,
  }

  // How many answer columns actually fit. The author's setting is the ceiling,
  // never the floor: a two-column layout squeezed into a 320px landing-page
  // card becomes one column rather than two unreadable ones.
  const authorCols = currentNode?.answerColumns || (currentNode?.questionType === 'button_grid' ? 2 : 1)
  const fitCols = cardWidth > 0 ? Math.max(1, Math.floor(cardWidth / MIN_OPTION_WIDTH)) : authorCols
  const columns = Math.max(1, Math.min(authorCols, fitCols))

  const showSpinner =
    busy ||
    (currentNode && INVISIBLE_NODE_TYPES.has(currentNode.type)) ||
    (currentNode?.type === 'endpoint' && submitState === 'sending')

  // Chromeless renders sit inside someone else's layout, so they contribute no
  // background of their own and no page-height floor.
  const pageBackground = chromeless ? 'transparent' : tc.pageBg(brand)
  const pageOverlay = chromeless ? 'none' : tc.pageOverlay(brand)
  const pagePattern = chromeless ? 'none' : tc.pagePattern(brand)

  return (
    <div
      ref={rootRef}
      className={inline ? 'quiz-public-root quiz-inline' : 'quiz-public-root'}
      style={{
        minHeight: chromeless ? undefined : '100vh',
        background: pageBackground,
        position: 'relative',
        fontFamily: `"${brand.typography.headlineFont}", system-ui, sans-serif`,
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
        {standalone && headerConfig ? (
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
          <div ref={cardAreaRef} style={{ maxWidth: chromeless ? '100%' : 760, margin: '0 auto' }}>
            {quiz.steps.length > 1 ? (
              <div style={{ height: 4, backgroundColor: `${C.primary}22`, borderRadius: 999, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, backgroundColor: C.primary, transition: 'width 0.3s' }} />
              </div>
            ) : null}

            {showSpinner ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Loader2 size={30} color={C.primary} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : currentNode && !finished ? (
              <PreviewQuestionCard
                node={currentNode}
                brand={brand}
                customFields={customFields}
                onAnswer={handleAnswer}
                fieldValues={fieldValues}
                templateId={templateId}
                stepIdx={stepIdx}
                totalSteps={quiz.steps.length}
                onBack={goBack}
                canGoBack={history.length > 0}
                destinationCtx={destinationCtx}
                columns={columns}
                previewMode={previewMode}
              />
            ) : (
              <div style={{ padding: 48, textAlign: 'center', color: pagePal.text }}>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Thank you</div>
                <div style={{ fontSize: 15, color: pagePal.muted }}>Your answers have been received.</div>
              </div>
            )}
          </div>
        </main>

        {standalone && currentNode?.type !== 'endpoint' && !finished
          ? sections.map((s) => renderBodySection(s, brand, deployment, pagePal))
          : null}

        {standalone && footerConfig ? (
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

export default QuizRuntime
