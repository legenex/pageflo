// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * The builder's two preview surfaces: the flow runner and the node modal.
 *
 * What is NOT here any more, and why:
 *
 *  - THE QUESTION CARD moved to `public/quiz/QuizCard.tsx`. It was defined here
 *    and imported BY the public runtime, so drawing a question on a live page
 *    pulled the whole quiz editor - and a server-action import - into the
 *    public bundle. It is the same card either way; only its address changed.
 *  - THE PAGE SHELL moved to `public/quiz/QuizSurface.tsx`. This file drew its
 *    own header, its own body sections, its own footer and its own 760px column
 *    with its own progress bar above the card, all of which had to be kept in
 *    agreement with the public runtime by hand.
 *  - THE STATE MACHINE moved to `public/quiz/machine.ts`. `handleAnswer` here
 *    was a second copy of `QuizRuntime.advance`, and it had already drifted: it
 *    never executed webhook or verification nodes, so in the shipped MVA flow -
 *    where the tier lookup's response mapping is the ONLY thing that assigns
 *    tiers 1, 2 and 4 - the builder walked the quiz untiered and every
 *    tier-scoped variant read as dead while production routed on them.
 *
 * What is left is the two things that are genuinely the builder's: an operator
 * toolbar (which brand, which deployment, back, reset, what was captured), and
 * the decision that a preview click must not create a lead or deliver anything.
 */

import { useMemo, useState } from 'react'
import { Loader2, ChevronLeft, RotateCw, X } from 'lucide-react'

import { T, Btn, Pill, IconBtn } from '../ui'
import { SEED_CUSTOM_FIELDS } from './seed-data'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { QuizSurface } from '@/components/public/quiz/QuizSurface'
import { useQuizMachine } from '@/components/public/quiz/machine'
import { QuizStill } from './QuizStill'
import { getTemplateConfig } from './templates'
import { aiTestPrompt } from '@/app/(app)/admin/(top)/quizzes/actions'

export const captureURLParamsToFields = (customFields) => {
  if (typeof window === 'undefined' || !window.location) return {}
  const captured = {}
  try {
    const params = new URLSearchParams(window.location.search)
    customFields.forEach((cf) => { if (params.has(cf.key)) captured[cf.key] = params.get(cf.key) })
  } catch {}
  return captured
}

/**
 * One node, drawn as the deployed quiz would draw it.
 *
 * A still rather than a live card: it is a picture of one variant, and the only
 * question it answers is "what does this look like". Same surface as the page,
 * frozen, so it cannot answer that question differently from the page does.
 */
export const NodePreviewModal = ({ node, brand, customFields, templateId = 'minimal', progressForm = null, onClose }) => {
  if (!node) return null
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: T.textDim, fontFamily: '"JetBrains Mono", monospace' }}>Variant preview · {node.fieldName} · {templateId}</div>
        <div style={{ flex: 1 }} />
        <IconBtn icon={X} onClick={onClose} />
      </div>
      <div style={{ borderRadius: 12, overflow: 'auto', flex: 1 }}>
        <QuizStill
          templateId={templateId}
          progressForm={progressForm}
          brand={brand}
          node={node}
          customFields={customFields}
          selectedAnswerIndex={-1}
        />
      </div>
    </div>
  </div>
}

/**
 * The flow preview: an operator clicking through the real machine.
 *
 * `mode: 'preview'` is the ONLY difference from a visitor's session, and it
 * means exactly two things - no lead is written and no webhook is delivered.
 * Routing, field mappings, DQ, tier decisioning, the back stack and the
 * invisible-node skip are the same code the public page runs.
 */
export const QuizPreviewView = ({ quiz, brand, deployment, onBackToBuilder, brands, deployments }) => {
  const [selectedBrandId, setSelectedBrandId] = useState(brand?.id)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(deployment?.id)
  const customFields = quiz.customFields?.length ? quiz.customFields : SEED_CUSTOM_FIELDS

  const effectiveDeployment = deployments.find((d) => d.id === selectedDeploymentId) || deployment
  // The brand paints the quiz. A deployment picks the template; it does not
  // author colour, so there is nothing to layer on top here.
  const effectiveBrand = brands.find((b) => b.id === selectedBrandId) || brand
  const renderMode = effectiveDeployment?.renderMode || 'standalone'

  const effects = useMemo(() => ({
    // Stand-in attribution, so copy that interpolates a UTM has something to
    // interpolate. Never sent anywhere: this surface writes no lead.
    initialValues: () => {
      const captured = {}
      customFields.forEach((cf) => {
        if (/^(utm_|ad_|campaign|source|medium|gclid|fbclid)/i.test(cf.key)) captured[cf.key] = `preview_${cf.key}`
      })
      return captured
    },

    // The prompt is the AUTHOR's, typed into the node in front of them, so the
    // builder may run it through the same test action the editor uses. The
    // public path deliberately does not: there the prompt must come from the
    // database, keyed by deployment, so a visitor cannot post one.
    runAiNode: async (node, values) => {
      if (!node.ai?.prompt || !node.ai.outputField) return null
      const prompt = node.ai.prompt.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] || `{{${k}}}`)
      const res = await aiTestPrompt({ prompt, model: node.ai.model })
      return res.ok ? { [node.ai.outputField]: (res.text || '').trim() } : null
    },

    // NO WEBHOOK TRANSPORT, on purpose. A webhook or verification node posts
    // the visitor's answers to a buyer's endpoint, and an operator clicking
    // through a design must not deliver one. The flow still walks the node and
    // still reaches the same tier decision it reaches when a provider is down -
    // untiered - rather than skipping the node as if it did not exist.
    runWebhookNode: null,

    // NO LEAD SUBMISSION. The one guard between "designing a funnel" and "a
    // fake person in the dashboard, a fired pixel, and a webhook delivered".
    submitLead: null,
  }), [customFields])

  const machine = useQuizMachine({ quiz, mode: 'preview', effects })

  if (!effectiveBrand) return <div style={{ padding: 40, color: T.text }}>No brand selected</div>

  // ONE resolution, through the registry. There used to be three defaults in
  // this component and two named DIFFERENT templates - `'minimal'` resolves to
  // sq_editorial_inline and `'default'` to sq_quiz_first - so a quiz with no
  // deployment yet (every newly created one) painted its page chrome from one
  // template and its question card from another. Both were valid aliases, so
  // the registry set no fallback flag and nothing was logged.
  const previewTemplateId = reportTemplateFallback(
    'quiz builder preview',
    resolveForRender('quiz', effectiveDeployment?.templateId),
  ).template.id
  const tierMeta = machine.currentTier ? quiz.tiers.find((t) => t.id === machine.currentTier) : null
  const capturedKeys = Object.keys(machine.fieldValues).filter((k) => customFields.find((cf) => cf.key === k))
  // An embed has no page of its own, so the operator picks the backdrop it will
  // be dropped onto. Drawn HERE rather than inside the surface: the surface
  // renders an embed transparent precisely because the host owns the ground.
  const embedBg = renderMode === 'embed' ? (effectiveDeployment?.embedPreviewBg || '#1a1a1a') : undefined

  return <div style={{ flex: 1, overflowY: 'auto', backgroundColor: embedBg }}>
    <div style={{ position: 'sticky', top: 0, zIndex: 20, padding: '10px 20px', backgroundColor: 'rgba(37,46,57,0.95)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Brand:</span>
        <select value={selectedBrandId} onChange={(e) => setSelectedBrandId(e.target.value)} style={{ padding: '5px 8px', backgroundColor: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11.5 }}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name || b.displayName}</option>)}</select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Deploy:</span>
        <select value={selectedDeploymentId || ''} onChange={(e) => setSelectedDeploymentId(e.target.value)} style={{ padding: '5px 8px', backgroundColor: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11.5 }}><option value="">- none -</option>{deployments.filter((d) => d.quizId === quiz.id).map((d) => <option key={d.id} value={d.id}>{d.domain}{d.path} ({d.renderMode})</option>)}</select>
      </div>
      <Pill color={renderMode === 'embed' ? T.info : T.purple}>{renderMode.toUpperCase()}</Pill>
      <Pill color={tierMeta?.color || T.purple}>{tierMeta?.name || 'SHARED'}</Pill>
      {/* The operator addresses raw step rows in the builder, so this counter
          stays in raw index space. The visitor-facing count inside the card is
          the VISIBLE one, which is a different and equally correct number. */}
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>step {machine.stepIdx + 1}/{quiz.steps.length}</div>
      <div style={{ fontSize: 11, color: T.textLow, fontFamily: '"JetBrains Mono", monospace' }}>{getTemplateConfig(previewTemplateId, effectiveDeployment?.progressForm).name}</div>
      {capturedKeys.length > 0 && <Pill color={T.info}>{capturedKeys.length} UTM</Pill>}
      {machine.busyReason === 'ai' && <Pill color={T.purple}><Loader2 size={9} style={{ verticalAlign: '-1px', marginRight: 3, animation: 'spin 1s linear infinite' }} />AI</Pill>}
      <div style={{ flex: 1, minWidth: 100 }} />
      <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={machine.back} disabled={!machine.canGoBack} style={!machine.canGoBack ? { opacity: 0.4 } : {}}>Back</Btn>
      <Btn variant="secondary" size="sm" icon={RotateCw} onClick={machine.restart}>Reset</Btn>
    </div>

    <QuizSurface
      machine={machine}
      quiz={quiz}
      brand={effectiveBrand}
      deployment={effectiveDeployment}
      mode="preview"
      placement={renderMode === 'embed' ? 'embed' : 'page'}
    />
  </div>
}
