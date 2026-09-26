import { getPayload } from 'payload'
import config from '@payload-config'

import { claimTrustedFormCert } from '@/lib/integrations/trustedform'
import { verifyJornayaLead } from '@/lib/integrations/jornaya'
import { sendMetaCAPIEvent } from '@/lib/integrations/meta-capi'
import { resolveTrueCallCampaignId, pushTrueCallLead } from '@/lib/integrations/truecall'
import { enrichPhone } from '@/lib/integrations/hlr'
import { fetchWithTimeout } from '@/lib/net/outbound'
import { dispatchWebhooks, type WebhookConfig } from './dispatch-webhooks'
import { sendSlackNotification } from './slack'
import { deriveFbc, type Attribution } from './attribution'
import { newEventId } from './event-id'
import { reportError } from '@/lib/observability/report'
import { appOrigin } from '@/lib/pageflo/hosts'
import { enqueueLeadDelivery, LeadLockedError, withLeadLock } from '@/queues/lead-delivery'
import type { LeadConsentRecord } from '@/lib/lead-consent'
import { appendDeliveryLog } from './log'
import {
  DELIVERY_STEPS,
  passAlreadyCompleted,
  readDelivery,
  settledSteps,
  type DeliveryEntry,
} from './delivery-state'

let leadAfterPersistHook: ((leadId: number) => Promise<void>) | null = null

export const setLeadAfterPersistHook = (hook: ((leadId: number) => Promise<void>) | null): void => {
  leadAfterPersistHook = hook
}

export type LeadCaptureInput = {
  // Resolved server-side
  siteId: number
  siteSlug: string
  siteName: string
  primaryHost: string | null

  funnel_type: 'quiz' | 'landing-page' | 'contact-form' | 'page' | 'advertorial'
  funnel_id?: string
  funnel_path?: string
  source_entity_id?: string

  /**
   * Idempotency key, minted once by the client per completed submission and
   * resent on every retry. When present, a submission whose key already has a
   * lead returns that lead instead of writing a second one — so a retry after a
   * lost response, or a re-submit by a later endpoint in the flow, cannot
   * duplicate the row or re-fire CAPI/webhooks. Absent for the test harness and
   * legacy forms, which then behave exactly as before (always insert).
   */
  client_submission_id?: string

  test_capture?: boolean

  contact: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    state?: string
    zip?: string
  }
  quiz_answers?: Record<string, unknown>
  attribution?: Attribution

  trustedform_cert_url?: string
  jornaya_lead_id?: string

  /**
   * Explicit consent evidence, built by the route from the visitor's submission
   * and the server's own view of where it was collected. Absent when the visitor
   * gave none: the Lead then carries no consent record and is shown as such.
   */
  consent?: LeadConsentRecord
}

export type PipelineStep = {
  step: string
  ok: boolean
  detail?: string
  duration_ms?: number
}

export type LeadPipelineResult = {
  ok: boolean
  lead_id: number | null
  event_id: string
  steps: PipelineStep[]
  error?: string
}

const t = (started: number): number => Date.now() - started

/**
 * The lead capture pipeline. Sequential write of the Lead row, parallel fan-out
 * to TrustedForm + CAPIs + webhooks + Slack, fire-and-forget HLR async update.
 *
 * Hard rules:
 *  - Lead row is created BEFORE any third-party calls, so loss of a downstream
 *    service never loses the lead itself.
 *  - Pixel and CAPI share the same `event_id` (returned to the caller so client
 *    pixels can match).
 *  - TrustedForm cert claim and HLR run server-side only.
 *  - HLR never blocks the response.
 */
export const runLeadPipeline = async (
  input: LeadCaptureInput,
  opts?: { resumeLeadId?: number; trigger?: 'queue' | 'retry' | 'inline' },
): Promise<LeadPipelineResult> => {
  const payload = await getPayload({ config })
  let event_id = newEventId()
  const steps: PipelineStep[] = []
  let leadId: number | null = opts?.resumeLeadId ?? null

  // ---------- 0. Idempotency ----------
  //
  // A submission that already has a lead returns that lead, so a retried or
  // re-fired submit (a lost response, a later endpoint in the flow trying
  // again) does not write a second row or re-fire CAPI/webhooks to a buyer.
  // Only when the client sent a key: the test harness and legacy forms send
  // none and keep their always-insert behaviour. The database's partial unique
  // index is the real guarantee; this read makes the common (serial retry)
  // case cheap and lets the pipeline short-circuit before any side effect.
  const submissionKey =
    typeof input.client_submission_id === 'string' && input.client_submission_id.trim()
      ? input.client_submission_id.trim()
      : null
  if (!opts?.resumeLeadId && submissionKey) {
    const existing = await payload
      .find({
        collection: 'leads',
        where: { and: [{ site: { equals: input.siteId } }, { client_submission_id: { equals: submissionKey } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const prior = existing?.docs?.[0] as { id: number | string; attribution?: { event_id?: string } } | undefined
    if (prior) {
      return {
        ok: true,
        lead_id: Number(prior.id),
        event_id: prior.attribution?.event_id ?? event_id,
        steps: [{ step: 'lead.deduplicated', ok: true, detail: `existing id=${prior.id}`, duration_ms: 0 }],
      }
    }
  }

  if (opts?.resumeLeadId) {
    leadId = opts.resumeLeadId
    const existing = await payload.findByID({
      collection: 'leads',
      id: leadId,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null)
    const priorEvent = (existing as { attribution?: { event_id?: string } } | null)?.attribution?.event_id
    if (priorEvent) event_id = priorEvent
  }

  // ---------- 1. Write Lead row ----------
  const writeStarted = Date.now()
  const attribution: Attribution = {
    ...(input.attribution ?? {}),
    captured_at: new Date().toISOString(),
  }
  if (attribution.fbclid && !attribution.fbc) {
    attribution.fbc = deriveFbc(attribution.fbclid, Date.now())
  }

  let lead: { id: string | number } | null = null
  if (opts?.resumeLeadId) {
    lead = { id: opts.resumeLeadId }
    leadId = opts.resumeLeadId
  } else {
    try {
    lead = (await payload.create({
      collection: 'leads',
      data: {
        site: input.siteId,
        source_entity_type: input.funnel_type,
        source_entity_id: input.source_entity_id ?? input.funnel_id ?? null,
        status: 'new',
        test_capture: Boolean(input.test_capture),
        contact: input.contact,
        quiz_answers: input.quiz_answers ?? null,
        attribution: { ...attribution, event_id },
        trustedform_cert_url: input.trustedform_cert_url ?? null,
        jornaya_lead_id: input.jornaya_lead_id ?? null,
        client_submission_id: submissionKey,
        ...(input.consent ? { consent: input.consent } : {}),
        status_history: [
          {
            status: 'new',
            changed_at: new Date().toISOString(),
            note: input.test_capture ? 'Created via Test Capture' : 'Created via lead capture',
          },
        ],
        // The lifecycle starts here, in the same write as the Lead. `queued` is
        // written optimistically: a worker that picks the job up instantly must
        // find it already in the log, or its own entries would sort before it.
        // If the queue turns out to be unavailable the next entry says so.
        delivery_log: [
          { at: new Date().toISOString(), step: DELIVERY_STEPS.captured, ok: true, detail: 'lead row stored' },
          { at: new Date().toISOString(), step: DELIVERY_STEPS.queued, ok: true, detail: 'waiting for the delivery worker' },
        ],
        delivery_state: 'queued',
      } as never,
      overrideAccess: true,
    })) as { id: number }
    leadId = Number(lead.id)
    steps.push({ step: 'lead.created', ok: true, detail: `id=${leadId}`, duration_ms: t(writeStarted) })
  } catch (err) {
    // A concurrent retry that lost the race to the partial unique index throws
    // here. That is not a failure — the OTHER attempt wrote the lead — so
    // return that row rather than telling the visitor their submission failed
    // (which would send them into yet another retry). Only when we have a key
    // to look it up by; any other write error is the real thing.
    if (submissionKey && /unique|duplicate/i.test(err instanceof Error ? err.message : '')) {
      const raced = await payload
        .find({
          collection: 'leads',
          where: { and: [{ site: { equals: input.siteId } }, { client_submission_id: { equals: submissionKey } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)
      const won = raced?.docs?.[0] as { id: number | string; attribution?: { event_id?: string } } | undefined
      if (won) {
        return {
          ok: true,
          lead_id: Number(won.id),
          event_id: won.attribution?.event_id ?? event_id,
          steps: [{ step: 'lead.deduplicated', ok: true, detail: `concurrent, existing id=${won.id}`, duration_ms: t(writeStarted) }],
        }
      }
    }
    steps.push({
      step: 'lead.created',
      ok: false,
      detail: err instanceof Error ? err.message : 'unknown',
      duration_ms: t(writeStarted),
    })
    // The one failure a visitor actually feels: the lead did not persist.
    reportError('pipeline', err, { siteId: input.siteId, route: 'lead-pipeline', operation: 'lead-pipeline:lead.create', extra: { event_id } })
    return { ok: false, lead_id: null, event_id, steps, error: 'lead write failed' }
    }
    if (leadId != null) {
      const queued = await enqueueLeadDelivery(leadId)
      if (leadAfterPersistHook) {
        try {
          await leadAfterPersistHook(leadId)
        } catch {
          steps.push({ step: 'delivery.queued', ok: true, detail: 'interrupted after persist' })
          return { ok: true, lead_id: leadId, event_id, steps }
        }
      }
      // A queued job is the in-process worker's to finish. Returning here keeps
      // the visitor off the submit spinner while Slack/CAPI/webhooks run, and
      // stops this request from racing the worker on the same lead row.
      if (queued === 'queued') {
        steps.push({ step: 'delivery.queued', ok: true, detail: `lead ${leadId}` })
        return { ok: true, lead_id: leadId, event_id, steps }
      }
      // No queue: say so on the Lead, then deliver in this request. The
      // `queued` entry written with the row was optimistic and is corrected here.
      await appendDeliveryLog(leadId, [
        { step: DELIVERY_STEPS.queueUnavailable, ok: true, detail: 'no delivery queue available; delivering inline' },
      ]).catch(() => null)
      // "Unavailable" includes an enqueue that merely timed out, where the job may
      // still land. Deliver under the per-Lead lock, as the worker does: whichever
      // pass runs second finds the first one's completion and does nothing, and if
      // the worker already holds the lock the inline pass stands down.
      try {
        const inline = await withLeadLock(leadId, () =>
          runLeadPipeline(input, { resumeLeadId: leadId!, trigger: 'inline' }),
        )
        return { ...inline, event_id, steps: [...steps, ...inline.steps] }
      } catch (err) {
        if (err instanceof LeadLockedError) {
          steps.push({ step: 'delivery.deferred', ok: true, detail: 'the queue worker holds this lead' })
          return { ok: true, lead_id: leadId, event_id, steps }
        }
        throw err
      }
    }
  }

  // Snapshot of update payload — patched as integrations complete.
  // Declared before the TrackingConfig read so that read's own failure can be
  // recorded on the lead like any other step.
  const prior = await payload
    .findByID({ collection: 'leads', id: leadId!, depth: 0, overrideAccess: true })
    .catch(() => null)
  const priorLog = ((prior as { delivery_log?: DeliveryEntry[] } | null)?.delivery_log ?? [])
  // A redelivered queue job for a pass that already finished must not send
  // again. A retry the operator asked for AFTER that completion is a new pass.
  if (passAlreadyCompleted(priorLog)) {
    steps.push({ step: 'delivery.deduplicated', ok: true, detail: `lead ${leadId}` })
    return { ok: true, lead_id: leadId, event_id, steps }
  }
  // Steps that already succeeded are never repeated. On a first pass this set is
  // empty; on a retry it is what keeps a buyer who already has the lead from
  // receiving it twice while a failed one is tried again.
  const settled = settledSteps(priorLog)
  const priorHlr = (prior as { hlr_result?: { state?: string } | null } | null)?.hlr_result ?? null

  const trigger = opts?.trigger ?? (opts?.resumeLeadId ? 'queue' : 'inline')
  await appendDeliveryLog(leadId!, [
    { step: DELIVERY_STEPS.processing, ok: true, detail: `${trigger} pass ${readDelivery(priorLog).retryCount + 1}` },
  ]).catch(() => null)

  const leadPatch: Record<string, unknown> = {}
  const deliveryLog: Array<{ at: string; step: string; ok: boolean; detail?: string }> = []
  const logDelivery = (step: string, ok: boolean, detail?: string) => {
    deliveryLog.push({ at: new Date().toISOString(), step, ok, detail })
  }

  // ---------- 2. Load TrackingConfig ----------
  //
  // GUARDED, because everything from here on runs AFTER the lead row is
  // committed. Unguarded, a database hiccup on this one read threw out of the
  // pipeline and the route answered 500 with the lead already written: the
  // visitor is told their submission failed and retries it, and the client never
  // receives the `event_id`, so the browser pixel has nothing to dedupe the CAPI
  // event against. Degrading costs this lead its integrations — every consumer
  // below reads `tc?.…`, so they each report `skipped` — and keeps the row, the
  // response and the trace, which is the right trade at this point in the run.
  const tcStarted = Date.now()
  const tcRes = await payload
    .find({
      collection: 'tracking-configs',
      where: { site: { equals: input.siteId } },
      limit: 1,
      overrideAccess: true,
    })
    .catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'unknown'
      steps.push({ step: 'tracking_config.load', ok: false, detail, duration_ms: t(tcStarted) })
      logDelivery('tracking_config.load', false, detail)
      return null
    })
  const tc = tcRes?.docs?.[0]

  // ---------- 3. Fan-out: synchronous integrations ----------

  // TrustedForm claim
  const tfTask = (async () => {
    const started = Date.now()
    if (settled.has('trustedform.claim')) return
    const tf = tc?.trustedform
    if (!tf?.enabled || !input.trustedform_cert_url) {
      steps.push({ step: 'trustedform.claim', ok: true, detail: 'skipped', duration_ms: t(started) })
      return
    }
    if (!tf.account_id || !tf.api_key) {
      steps.push({ step: 'trustedform.claim', ok: false, detail: 'missing credentials', duration_ms: t(started) })
      logDelivery('trustedform.claim', false, 'missing credentials')
      return
    }
    const res = await claimTrustedFormCert({
      certUrl: input.trustedform_cert_url,
      accountId: tf.account_id,
      apiKey: tf.api_key,
      reference: String(leadId),
      vendor: input.siteSlug,
      retainCert: Boolean(tf.retain_certs),
    })
    if (res.ok) {
      leadPatch.trustedform_cert_url = input.trustedform_cert_url
    }
    steps.push({ step: 'trustedform.claim', ok: res.ok, detail: res.error ?? (res.cert_id ?? 'claimed'), duration_ms: t(started) })
    logDelivery('trustedform.claim', res.ok, res.error ?? res.cert_id)
  })()

  // Jornaya verification
  const jorTask = (async () => {
    const started = Date.now()
    if (settled.has('jornaya.verify')) return
    const j = tc?.jornaya
    if (!j?.enabled || !input.jornaya_lead_id) {
      steps.push({ step: 'jornaya.verify', ok: true, detail: 'skipped', duration_ms: t(started) })
      return
    }
    if (!j.account_id) {
      steps.push({ step: 'jornaya.verify', ok: false, detail: 'missing account id', duration_ms: t(started) })
      logDelivery('jornaya.verify', false, 'missing account id')
      return
    }
    const res = await verifyJornayaLead({
      accountId: j.account_id,
      campaignId: j.campaign_id ?? undefined,
      leadId: input.jornaya_lead_id,
    })
    steps.push({ step: 'jornaya.verify', ok: res.ok, detail: res.error ?? res.audit_token ?? 'verified', duration_ms: t(started) })
    logDelivery('jornaya.verify', res.ok, res.error ?? res.audit_token)
  })()

  // Meta CAPI
  const metaTask = (async () => {
    const started = Date.now()
    if (settled.has('meta.capi')) return
    const m = tc?.meta_pixel
    if (!m?.enabled) {
      steps.push({ step: 'meta.capi', ok: true, detail: 'skipped', duration_ms: t(started) })
      return
    }
    if (!m.id || !m.capi_token) {
      steps.push({ step: 'meta.capi', ok: false, detail: 'missing credentials', duration_ms: t(started) })
      logDelivery('meta.capi', false, 'missing credentials')
      return
    }
    const res = await sendMetaCAPIEvent({
      pixelId: m.id,
      accessToken: m.capi_token,
      testEventCode: m.test_event_code ?? undefined,
      event: {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        action_source: 'website',
        event_source_url: input.primaryHost ? `https://${input.primaryHost}${input.funnel_path ?? ''}` : undefined,
        user_data: {
          email: input.contact.email,
          phone: input.contact.phone,
          first_name: input.contact.first_name,
          last_name: input.contact.last_name,
          state: input.contact.state,
          zip: input.contact.zip,
          client_ip_address: attribution.ip,
          client_user_agent: attribution.user_agent,
          fbc: attribution.fbc,
          fbp: attribution.fbp,
        },
        custom_data: {
          lead_id: String(leadId),
          test_capture: Boolean(input.test_capture),
        },
      },
    })
    steps.push({ step: 'meta.capi', ok: res.ok, detail: res.error ?? 'sent', duration_ms: t(started) })
    logDelivery('meta.capi', res.ok, res.error)
  })()

  // TikTok Events API (simplified — Meta-style POST)
  const tiktokTask = (async () => {
    const started = Date.now()
    if (settled.has('tiktok.events_api')) return
    const tk = tc?.tiktok
    if (!tk?.enabled || !tk.pixel_code || !tk.access_token) {
      steps.push({ step: 'tiktok.events_api', ok: true, detail: tk?.enabled ? 'missing credentials' : 'skipped', duration_ms: t(started) })
      return
    }
    try {
      // Bounded: this runs inside the visitor's lead POST, and the catch below
      // turns a deadline into a failed step. See lib/net/outbound.
      const resp = await fetchWithTimeout('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: {
          'Access-Token': tk.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_source: 'web',
          event_source_id: tk.pixel_code,
          test_event_code: tk.test_event_code ?? undefined,
          data: [
            {
              event: 'SubmitForm',
              event_time: Math.floor(Date.now() / 1000),
              event_id,
              user: {
                email: input.contact.email,
                phone_number: input.contact.phone,
                ttclid: attribution.ttclid,
                ip: attribution.ip,
                user_agent: attribution.user_agent,
              },
              properties: { lead_id: String(leadId) },
            },
          ],
        }),
      })
      const ok = resp.ok
      steps.push({ step: 'tiktok.events_api', ok, detail: ok ? 'sent' : `status ${resp.status}`, duration_ms: t(started) })
      logDelivery('tiktok.events_api', ok, ok ? undefined : `status ${resp.status}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      steps.push({ step: 'tiktok.events_api', ok: false, detail: msg, duration_ms: t(started) })
      logDelivery('tiktok.events_api', false, msg)
    }
  })()

  // GA4 Measurement Protocol
  const ga4Task = (async () => {
    const started = Date.now()
    if (settled.has('ga4.mp')) return
    const ga = tc?.ga4
    if (!ga?.enabled || !ga.measurement_id || !ga.api_secret) {
      steps.push({ step: 'ga4.mp', ok: true, detail: ga?.enabled ? 'missing credentials' : 'skipped', duration_ms: t(started) })
      return
    }
    try {
      const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(ga.measurement_id)}&api_secret=${encodeURIComponent(ga.api_secret)}`
      // Bounded, as above. See lib/net/outbound.
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: attribution.session_id ?? event_id,
          events: [
            {
              name: 'generate_lead',
              params: {
                transaction_id: event_id,
                value: 1,
                lead_id: String(leadId),
                test_capture: Boolean(input.test_capture),
              },
            },
          ],
        }),
      })
      steps.push({ step: 'ga4.mp', ok: resp.ok, detail: resp.ok ? 'sent' : `status ${resp.status}`, duration_ms: t(started) })
      logDelivery('ga4.mp', resp.ok, resp.ok ? undefined : `status ${resp.status}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      steps.push({ step: 'ga4.mp', ok: false, detail: msg, duration_ms: t(started) })
      logDelivery('ga4.mp', false, msg)
    }
  })()

  // TrueCall push
  const truecallTask = (async () => {
    const started = Date.now()
    if (settled.has('truecall.push')) return
    const tk = tc?.truecall
    if (!tk?.enabled || !tk.api_key || !tk.account_id) {
      steps.push({ step: 'truecall.push', ok: true, detail: tk?.enabled ? 'missing credentials' : 'skipped', duration_ms: t(started) })
      return
    }
    const path = input.funnel_path ?? '/'
    const mapping = (tk.page_path_mapping ?? []) as Array<{ path: string; campaign_id: string }>
    const campaignId = resolveTrueCallCampaignId({ path, mapping })
    if (!campaignId) {
      steps.push({ step: 'truecall.push', ok: true, detail: 'no campaign match', duration_ms: t(started) })
      return
    }
    if (!input.contact.phone) {
      steps.push({ step: 'truecall.push', ok: true, detail: 'no phone on lead', duration_ms: t(started) })
      return
    }
    const res = await pushTrueCallLead({
      apiKey: tk.api_key,
      accountId: tk.account_id,
      campaignId,
      phone: input.contact.phone,
      firstName: input.contact.first_name,
      lastName: input.contact.last_name,
      state: input.contact.state,
      zip: input.contact.zip,
      customFields: {
        lead_id: String(leadId),
        test_capture: Boolean(input.test_capture),
        event_id,
      },
    })
    steps.push({ step: 'truecall.push', ok: res.ok, detail: res.error ?? 'pushed', duration_ms: t(started) })
    logDelivery('truecall.push', res.ok, res.error)
  })()

  // Custom webhooks
  const webhookTask = (async () => {
    const started = Date.now()
    const webhooks = ((tc?.custom_webhooks ?? []) as WebhookConfig[]).filter((w) => !settled.has(`webhook.${w.name}`))
    if (webhooks.length === 0) {
      steps.push({ step: 'webhooks.dispatch', ok: true, detail: 'none configured', duration_ms: t(started) })
      return
    }
    const results = await dispatchWebhooks({
      webhooks,
      event: 'lead.created',
      testCapture: input.test_capture,
      payload: {
        lead_id: leadId,
        event_id,
        site: { id: input.siteId, slug: input.siteSlug, name: input.siteName },
        funnel: { type: input.funnel_type, id: input.funnel_id, path: input.funnel_path },
        contact: input.contact,
        quiz_answers: input.quiz_answers ?? null,
        attribution,
        trustedform_cert_url: input.trustedform_cert_url ?? null,
        jornaya_lead_id: input.jornaya_lead_id ?? null,
        consent: input.consent ?? null,
      },
    })
    for (const r of results) {
      steps.push({
        step: `webhook.${r.webhook}`,
        ok: r.ok,
        detail: r.ok ? `${r.status}` : (r.error ?? `status ${r.status}`),
        duration_ms: r.duration_ms,
      })
      logDelivery(`webhook.${r.webhook}`, r.ok, r.error ?? String(r.status))
    }
  })()

  // Slack notification (LegalOS-wide IntegrationConfig)
  const slackTask = (async () => {
    const started = Date.now()
    if (settled.has('slack.notify')) return
    try {
      const integration = await payload.findGlobal({ slug: 'integration-config', overrideAccess: true })
      const webhooks = ((integration?.slack?.webhooks ?? []) as Array<{ label?: string; url: string; events?: string }>) ?? []
      const matching = webhooks.filter((w) => {
        if (!w.url) return false
        if (!w.events) return true
        const list = w.events.split(',').map((s) => s.trim()).filter(Boolean)
        return list.length === 0 || list.includes('lead.created')
      })
      if (matching.length === 0) {
        steps.push({ step: 'slack.notify', ok: true, detail: 'no webhook configured', duration_ms: t(started) })
        return
      }
      for (const w of matching) {
        const res = await sendSlackNotification({
          webhookUrl: w.url,
          siteName: input.siteName,
          leadId: leadId ?? '',
          contact: input.contact,
          funnelType: input.funnel_type,
          testCapture: input.test_capture,
          // appOrigin() resolves PAGEFLO_SERVER_URL, then the configured app
          // host, then localhost. Reading NEXT_PUBLIC_SERVER_URL directly here
          // was the one place a Slack link would still point at the pre-rebrand
          // console after the environment had been migrated.
          adminUrl: `${appOrigin()}/cms/collections/leads/${leadId}`,
        })
        steps.push({ step: 'slack.notify', ok: res.ok, detail: res.error ?? w.label ?? 'sent', duration_ms: t(started) })
        logDelivery('slack.notify', res.ok, res.error)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      steps.push({ step: 'slack.notify', ok: false, detail: msg, duration_ms: t(started) })
      logDelivery('slack.notify', false, msg)
    }
  })()

  // allSettled, not all: the Lead row is already persisted, so a single
  // integration task throwing must never abort the run (which would skip the
  // delivery-log update below and 500 the request without returning event_id,
  // so the client pixel would never fire). Each task also logs its own outcome.
  await Promise.allSettled([tfTask, jorTask, metaTask, tiktokTask, ga4Task, truecallTask, webhookTask, slackTask])

  // ---------- 4. Persist delivery log + integration patches on the Lead row ----------
  //
  // `downstream.completed` says the PASS finished. It is not a delivery claim:
  // whether a buyer got the lead is read from the destination steps above, and
  // the detail here states that reading in words.
  const passReading = readDelivery([
    ...priorLog,
    ...deliveryLog,
  ])
  const dest = passReading.destinations
  logDelivery(
    DELIVERY_STEPS.completed,
    true,
    dest.total === 0
      ? 'no destination configured: nothing was sent to an outside party'
      : `destinations: ${dest.delivered} delivered, ${dest.failed} failed of ${dest.total}`,
  )
  try {
    await appendDeliveryLog(leadId!, deliveryLog, {
      data: { ...leadPatch, attribution: { ...attribution, event_id } },
    })
  } catch (err) {
    steps.push({ step: 'lead.update', ok: false, detail: err instanceof Error ? err.message : 'unknown', duration_ms: 0 })
  }

  // ---------- 5. Fire-and-forget HLR enrichment (never blocks) ----------
  //
  // Every outcome is STORED, failures included. A lookup that failed used to be
  // swallowed, leaving no `hlr_result`, which the console read as "not checked":
  // an operator could not tell an unconfigured provider from one that never ran.
  const hlrSettled = priorHlr?.state === 'valid' || priorHlr?.state === 'invalid'
  if (input.contact.phone && !hlrSettled) {
    const phone = input.contact.phone
    const lid = leadId!
    void (async () => {
      let res: unknown
      try {
        res = await enrichPhone(phone)
      } catch (err) {
        res = {
          ok: false,
          state: 'provider_error',
          provider: (process.env.HLR_PROVIDER ?? 'plivo').toLowerCase(),
          checked_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'unknown error',
        }
      }
      try {
        await payload.update({ collection: 'leads', id: lid, data: { hlr_result: res as never } as never, overrideAccess: true })
      } catch {
        // the lead row is the record; a failed enrichment write loses only the enrichment
      }
    })()
    steps.push({ step: 'hlr.enqueue', ok: true, detail: 'fired async' })
  } else {
    steps.push({ step: 'hlr.enqueue', ok: true, detail: input.contact.phone ? 'already resolved' : 'no phone, skipped' })
  }

  /*
   * EVERY FAILED STEP, REPORTED ONCE, HERE.
   *
   * A step's outcome was already persisted onto the lead's `delivery_log`, which
   * is the right record and the wrong instrument: nothing reads it until
   * somebody opens that lead, and nobody opens a lead they do not know went
   * wrong. A CAPI post that stops working fails silently on every lead until a
   * buyer complains about volume.
   *
   * Reported at the END rather than per step, so one visitor's submission
   * produces one report per failed step and not one per retry, and so the report
   * can name how far the pipeline got. The contact details are NOT included -
   * `reportError` redacts anyway, and a lead's identity has no business in an
   * error stream.
   */
  const failed = steps.filter((s) => s.ok === false)
  for (const step of failed) {
    reportError('pipeline', `${step.step}: ${step.detail ?? 'failed'}`, {
      siteId: input.siteId,
      route: 'lead-pipeline',
      operation: `lead-pipeline:${step.step}`,
      extra: { lead_id: leadId, event_id, steps_total: steps.length, steps_failed: failed.length },
    })
  }

  return { ok: true, lead_id: leadId, event_id, steps }
}

export const deliverStoredLead = async (
  leadId: number,
  opts?: { trigger?: 'queue' | 'retry' | 'inline' },
): Promise<LeadPipelineResult> => {
  const payload = await getPayload({ config })
  const lead = await payload.findByID({ collection: 'leads', id: leadId, depth: 1, overrideAccess: true })
  const siteRaw = (lead as { site?: unknown }).site
  const site = siteRaw && typeof siteRaw === 'object' ? (siteRaw as { id: number; slug: string; name: string }) : null
  const siteId = Number(site?.id ?? siteRaw)
  const attribution = ((lead as { attribution?: Attribution }).attribution ?? {}) as Attribution
  const consent = (lead as { consent?: Partial<LeadConsentRecord> | null }).consent ?? null
  const input: LeadCaptureInput = {
    siteId,
    siteSlug: site?.slug ?? '',
    siteName: site?.name ?? '',
    funnel_type: ((lead as { source_entity_type?: LeadCaptureInput['funnel_type'] }).source_entity_type ?? 'quiz'),
    primaryHost: consent?.source_host ?? null,
    funnel_path: consent?.source_funnel_path ?? attribution.landing_path ?? undefined,
    consent: consent?.accepted === true ? (consent as LeadConsentRecord) : undefined,
    funnel_id: (lead as { source_entity_id?: string }).source_entity_id ?? undefined,
    contact: ((lead as { contact?: LeadCaptureInput['contact'] }).contact ?? {}) as LeadCaptureInput['contact'],
    quiz_answers: (lead as { quiz_answers?: Record<string, unknown> }).quiz_answers,
    attribution,
    trustedform_cert_url: (lead as { trustedform_cert_url?: string }).trustedform_cert_url,
    jornaya_lead_id: (lead as { jornaya_lead_id?: string }).jornaya_lead_id,
    test_capture: Boolean((lead as { test_capture?: boolean }).test_capture),
  }
  return runLeadPipeline(input, { resumeLeadId: leadId, trigger: opts?.trigger ?? 'queue' })
}
