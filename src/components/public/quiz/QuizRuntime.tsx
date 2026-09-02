// @ts-nocheck -- shares the ported quiz components, which are not yet typed
// (see the funnel @ts-nocheck note in CLAUDE.md). Run `pnpm generate:types` on
// the server to restore typing across the funnel builder.
'use client'

/**
 * The public quiz runtime: the LIVE driver.
 *
 * It owns nothing about how a quiz looks and nothing about how a quiz flows.
 * The composition is `QuizSurface` - the same one the builder preview, the node
 * modal and every template thumbnail mount - and the state machine is
 * `useQuizMachine`, the same one the builder preview drives. What is left here,
 * and the only thing that is, is what "live" MEANS:
 *
 *  - Non-visual nodes execute for real. Webhook and verification nodes POST to
 *    `/api/pageflo/quiz-webhook`, which reads the URL and payload out of the
 *    stored node and hands back only the fields the author mapped. AI nodes POST
 *    to `/api/pageflo/quiz-ai` for the same reason: the prompt lives in the
 *    database, so a visitor can never post an arbitrary prompt to our key.
 *  - The lead is submitted, exactly once, with a stable idempotency key and one
 *    retry, and the pixel fires on the shared `event_id`.
 *  - URL parameters are captured into the answer set on mount.
 *
 * The machine decides WHEN each of those happens and what the result means for
 * routing; this file decides only how the call is made. That split is what
 * closed the drift between the two hand-written machines that used to exist -
 * the builder's copy never executed webhook nodes at all, so a flow whose tiers
 * come from a lookup behaved one way in the builder and another in production.
 */

import { useMemo, useRef } from 'react'

import { QuizSurface } from './QuizSurface'
import { useQuizMachine } from './machine'
import {
  captureAttribution, newClientSubmissionId, readTrustedFormCert, readJornayaLeadId, firePixelEvents, submitLead,
} from '@/lib/lead-capture-client'
import { splitQuizAnswers, isDeliverableContact } from '@/lib/quiz-lead'
import { SEED_CUSTOM_FIELDS } from '@/components/builder/quiz/seed-data'

/**
 * A stable idempotency key, minted ONCE per mounted runtime and never cleared -
 * not even when the submit guard is released after a failure. The server dedupes
 * on it, so a retry after a lost response, or a re-submit by a later endpoint,
 * returns the same lead instead of writing a second one. Minted through the
 * shared helper the block lead form also uses: two public surfaces spelling an
 * idempotency key two ways is how one of them stops having one.
 *
 * A ref rather than `useMemo`: React is allowed to discard a memo and recompute
 * it, and an idempotency key that can change is not one.
 */
const useSubmissionId = () => {
  const submissionIdRef = useRef(null)
  if (!submissionIdRef.current) submissionIdRef.current = newClientSubmissionId()
  return submissionIdRef.current
}

export function QuizRuntime({
  quiz,
  brand,
  deployment,
  site,
  embed = false,
  inline = false,
  surfaceColor = null,
  previewMode = false,
}) {
  const submissionId = useSubmissionId()
  const customFields = quiz?.customFields?.length ? quiz.customFields : SEED_CUSTOM_FIELDS
  const live = !previewMode

  const effects = useMemo(() => ({
    initialValues: () => {
      if (typeof window === 'undefined') return {}
      const captured = {}
      try {
        const params = new URLSearchParams(window.location.search)
        customFields.forEach((cf) => {
          if (params.has(cf.key)) captured[cf.key] = params.get(cf.key)
        })
      } catch {}
      return captured
    },

    // Suppressed in preview: a builder click must not post to our Anthropic key
    // on a real deployment's behalf.
    runAiNode: live && deployment?.id
      ? async (node, values) => {
        const resp = await fetch('/api/pageflo/quiz-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deployment_id: String(deployment.id), node_id: node.id, values }),
        })
        const out = await resp.json()
        return out?.ok && typeof out.text === 'string' ? { [node.ai.outputField]: out.text } : null
      }
      : null,

    // Suppressed in preview: a builder click must not deliver to a buyer.
    runWebhookNode: live && deployment?.id
      ? async (node, values) => {
        const resp = await fetch('/api/pageflo/quiz-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deployment_id: String(deployment.id), node_id: node.id, values }),
        })
        const out = await resp.json()
        return out?.ok && out.fields && typeof out.fields === 'object' ? out.fields : null
      }
      : null,

    // Suppressed in preview: the one guard between "designing a landing page"
    // and "a fake person in the dashboard, a fired pixel, and a webhook
    // delivered to a buyer".
    submitLead: live
      ? async (values) => {
        const { contact, quizAnswers } = splitQuizAnswers(values)
        if (!isDeliverableContact(contact)) {
          // Nothing to deliver: the visitor dropped before any contact question,
          // or this quiz collects none. Persisting an empty lead would put junk
          // in the dashboard, so the flow simply completes.
          return true
        }

        const body = {
          site_slug: site?.slug,
          funnel_type: 'quiz',
          funnel_id: quiz.slug || String(quiz.id),
          funnel_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
          source_entity_id: deployment?.id ? String(deployment.id) : undefined,
          client_submission_id: submissionId,
          contact,
          quiz_answers: quizAnswers,
          attribution: captureAttribution(),
          trustedform_cert_url: readTrustedFormCert() || undefined,
          jornaya_lead_id: readJornayaLeadId() || undefined,
        }

        // Retry once on failure. A completed quiz is the most expensive thing to
        // drop, and the common failure here is a transient network blip on
        // mobile, not a rejected payload. Two attempts and roughly a second of
        // delay is invisible next to the endpoint's own redirect timer.
        let result = await submitLead(body)
        if (!result.ok) {
          await new Promise((r) => setTimeout(r, 1200))
          result = await submitLead(body)
        }

        if (result.ok) {
          firePixelEvents(result.event_id ?? '', site?.name || site?.slug || quiz.name)
          return true
        }
        // The visitor has already finished; an error message would not help them
        // and would cost the conversion. The failure is logged for the operator
        // and the guard is released so a later endpoint can try again.
        // eslint-disable-next-line no-console
        console.error('[pageflo] lead submit failed:', result.error)
        return false
      }
      : null,
  }), [live, deployment, site, quiz, submissionId, customFields])

  const machine = useQuizMachine({ quiz, mode: live ? 'live' : 'preview', effects })

  return (
    <QuizSurface
      machine={machine}
      quiz={quiz}
      brand={brand}
      deployment={deployment}
      mode={live ? 'live' : 'preview'}
      placement={embed ? 'embed' : inline ? 'inline' : 'page'}
      surfaceColor={surfaceColor}
    />
  )
}

export default QuizRuntime
