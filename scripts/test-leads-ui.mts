/**
 * Leads console read models: delivery state, consent, phone validation.
 *
 *   pnpm test:leads-ui
 *
 * Behavioural, over the same pure functions the pipeline, the retry action and
 * the console all call. Every assertion has a case that would FAIL under the
 * previous behaviour (`downstream.completed` read as "Delivered", a failed
 * phone lookup read as "Not checked", TrustedForm read as consent).
 */
import { readFileSync } from 'node:fs'

import { certificateEvidence, consentState, deliveryState, isDeliveryStep, phoneState } from '../src/app/(app)/admin/(top)/leads/model.ts'
import { passAlreadyCompleted, readDelivery, settledSteps, STALL_AFTER_MS } from '../src/lib/lead-pipeline/delivery-state.ts'
import { disclosureMatchesBrand, CONSENT_METHOD, CONSENT_METHOD_UNVERIFIED, buildConsentRecord, consentView, extractQuizConsent, QUIZ_CONSENT_KEYS, validConsentSubmission } from '../src/lib/lead-consent.ts'
import { consentPlainText, safeConsentHtml } from '../src/lib/safe-consent-html.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString()
const e = (step: string, ok: boolean, detail?: string, minutesAgo = 1) => ({ at: at(minutesAgo), step, ok, detail })

/* ------------------------------------------------------------- delivery */

t(deliveryState([]) === 'not-attempted', 'an empty log is "no delivery record", not a fake pending')
t(deliveryState(null) === 'not-attempted', 'a null log is the same')

t(
  deliveryState([e('lead.captured', true), e('delivery.queued', true)]) === 'queued',
  'a stored lead waiting for the worker reads as queued, so a queued lead is never invisible',
)
t(
  deliveryState([e('lead.captured', true), e('delivery.queued', true), e('delivery.processing', true)]) === 'processing',
  'a worker pass in flight reads as processing',
)

const noDestination = [
  e('lead.captured', true), e('delivery.queued', true), e('delivery.processing', true),
  e('meta.capi', true), e('slack.notify', true), e('downstream.completed', true, 'no destination configured'),
]
t(deliveryState(noDestination) === 'no-destination', 'a finished pass with no configured destination is "no destination", NOT delivered')
t(readDelivery(noDestination).retryable === false, 'and nothing is retryable there')
t(deliveryState([e('downstream.completed', true)]) === 'no-destination', 'a legacy log whose only entry is downstream.completed is not "Delivered" either')
t(
  deliveryState([e('slack.notify', true), e('meta.capi', true), e('downstream.completed', true)]) === 'no-destination',
  'notifications and conversion events are not deliveries',
)

const delivered = [e('delivery.processing', true), e('webhook.buyer-a', true, '200'), e('downstream.completed', true)]
t(deliveryState(delivered) === 'delivered', 'a successful destination step is delivered')
t(readDelivery(delivered).destinations.delivered === 1, 'with the destination counted')

const failed = [e('delivery.processing', true), e('webhook.buyer-a', false, 'status 500'), e('downstream.completed', true)]
t(deliveryState(failed) === 'failed', 'a failed destination is failed even though the pass "completed"')
t(readDelivery(failed).retryable === true, 'and it is retryable')

const partial = [e('webhook.a', true), e('webhook.b', false, 'timeout'), e('downstream.completed', true)]
t(deliveryState(partial) === 'partial', 'one destination up and one down is partial')
t(readDelivery(partial).retryable === true, 'and retryable')

const retryPending = [...failed, e('delivery.retry_requested', true, 'requested by qa')]
t(deliveryState(retryPending) === 'retry-pending', 'a requested retry reads as retry pending')
t(readDelivery(retryPending).retryable === false, 'and cannot be requested again while pending: a double click cannot double-send')
t(readDelivery(retryPending).retryCount === 1, 'the retry is counted')

const retried = [...retryPending, e('delivery.processing', true), e('webhook.buyer-a', true, '200'), e('downstream.completed', true)]
t(deliveryState(retried) === 'delivered', 'a retry that succeeds supersedes the earlier failure')
t(readDelivery(retried).retryable === false, 'and a delivered lead is not retryable')

t(
  deliveryState([e('lead.captured', true), e('delivery.queued', true), e('delivery.processing', true), e('delivery.error', false, 'attempt 1 of 5: boom')]) === 'retry-pending',
  'a queue attempt that errored, with attempts left, is retry pending',
)
const exhausted = [e('delivery.processing', true), e('delivery.error', false, 'attempt 1'), e('delivery.failed', false, 'attempt 5 of 5: boom')]
t(deliveryState(exhausted) === 'failed', 'exhausted queue attempts read as failed')
t(readDelivery(exhausted).retryable === true, 'and are retryable')

const stalled = [e('lead.captured', true, undefined, 90), e('delivery.queued', true, undefined, 90)]
t(readDelivery(stalled, Date.now()).state === 'stalled', `a job queued for over ${STALL_AFTER_MS / 60000} minutes with no progress reads as stalled`)
t(readDelivery(stalled).retryable === true, 'and can be retried')

// Redelivery of a queue job must not re-send; a retry the operator asked for must run.
t(passAlreadyCompleted(delivered) === true, 'a redelivered job for a finished pass is deduplicated')
t(passAlreadyCompleted(retryPending) === false, 'a retry requested after completion is a new pass')
t(passAlreadyCompleted([e('delivery.queued', true)]) === false, 'a queued pass that has not run is not complete')

// Idempotency: what a retry must not repeat.
const settled = settledSteps([e('webhook.a', true), e('webhook.b', false), e('meta.capi', true), e('delivery.processing', true)])
t(settled.has('webhook.a') && settled.has('meta.capi'), 'steps that succeeded are settled and will not be repeated')
t(!settled.has('webhook.b'), 'a step that failed is not settled and will be tried again')
t(!settled.has('delivery.processing'), 'lifecycle markers are never "settled" steps')

t(isDeliveryStep('delivery.queued') && isDeliveryStep('delivery.retry_requested') && isDeliveryStep('downstream.completed'), 'the lifecycle appears in delivery history')
t(isDeliveryStep('webhook.buyer-a'), 'destinations appear in delivery history')

/* ---------------------------------------------------------------- phone */

t(phoneState(null).kind === 'not-checked', 'no result at all is "not checked"')
t(phoneState({}).kind === 'not-checked', 'an empty object is "not checked"')
t(phoneState({ ok: true, state: 'valid', provider: 'plivo' }).kind === 'valid', 'a resolved number is valid')
t(phoneState({ ok: false, state: 'invalid', provider: 'plivo', error: 'plivo returned 404' }).kind === 'invalid', 'a rejected number is invalid')
const noCreds = phoneState({ ok: false, state: 'not_configured', provider: 'plivo', error: 'missing plivo credentials' })
t(noCreds.kind === 'not-configured' && /not configured/i.test(noCreds.label), 'missing credentials is an unavailable/configuration state')
t(noCreds.label !== 'Not checked' && noCreds.kind !== 'valid', 'and never "Not checked" or a fabricated success')
const provErr = phoneState({ ok: false, state: 'provider_error', provider: 'plivo', error: 'plivo returned 503' })
t(provErr.kind === 'provider-error' && provErr.label !== 'Not checked', 'a provider failure is not "Not checked"')
// Rows stored before `state` existed have only ok + error.
t(phoneState({ ok: false, provider: 'plivo', error: 'missing plivo credentials' }).kind === 'not-configured', 'a legacy failed row with no credentials is a configuration state')
t(phoneState({ ok: false, provider: 'plivo', error: 'plivo returned 500' }).kind === 'provider-error', 'a legacy failed row is a provider error, not "Not checked"')
t(phoneState({ ok: true, provider: 'plivo' }).kind === 'valid', 'a legacy ok row is valid')

/* -------------------------------------------------------------- consent */

t(consentState({}).recorded === false && consentState({}).label === 'Not recorded', 'a lead with no consent record reads "Not recorded"')
t(consentState({ consent: null }).recorded === false, 'an old row (null consent) stays readable and honest')
t(consentState({ consent: { accepted: false } }).recorded === false, 'accepted:false is not consent')
t(consentState({ consent: { accepted: true, disclosure_text: '   ' } }).recorded === false, 'accepted without any disclosure text is not evidence')
t(consentState({ consent: { accepted: true, disclosure_text: 'I agree.' } }).recorded === true, 'an affirmative record with its disclosure reads as accepted')
t(
  consentState({ trustedform_cert_url: 'https://cert.trustedform.com/x', jornaya_lead_id: 'j1' } as never).recorded === false,
  'a TrustedForm / Jornaya reference is NOT consent',
)
t(certificateEvidence({ trustedform_cert_url: 'https://cert.trustedform.com/x' }) === 'TrustedForm', 'certificates are reported separately')

const submission = { accepted: true as const, disclosure_text: '  By submitting you agree.  ', client_accepted_at: '2026-09-26T10:00:00Z' }
t(validConsentSubmission(submission), 'a literal true with text is a valid submission')
t(!validConsentSubmission({ accepted: false, disclosure_text: 'x' }), 'false is rejected')
t(!validConsentSubmission({ accepted: 'yes', disclosure_text: 'x' }), 'a truthy non-boolean is rejected')
t(!validConsentSubmission({ accepted: true, disclosure_text: '   ' }), 'blank disclosure is rejected')
const record = buildConsentRecord(
  submission,
  { site_slug: 'brand-a', site_name: 'Brand A', host: 'a.example', funnel_type: 'quiz', funnel_id: 'q1', funnel_path: '/s/q1', deployment_id: '42' },
  new Date('2026-09-26T10:00:05Z'),
)
t(record.accepted === true && record.disclosure_text === 'By submitting you agree.', 'the record stores the exact disclosure, trimmed')
t(record.accepted_at === '2026-09-26T10:00:05.000Z', 'with a server timestamp')
t(record.source_site_slug === 'brand-a' && record.source_deployment_id === '42' && record.source_host === 'a.example', 'and the collecting Brand, host and deployment')
t(consentView(record).recorded === true, 'and the console reads it back as recorded')

const quizValues = {
  first_name: 'Ada',
  [QUIZ_CONSENT_KEYS.accepted]: 'yes',
  [QUIZ_CONSENT_KEYS.text]: 'I agree to be contacted.',
  [QUIZ_CONSENT_KEYS.at]: '2026-09-26T10:00:00Z',
}
const lifted = extractQuizConsent(quizValues)
t(lifted.consent?.accepted === true && lifted.consent.disclosure_text === 'I agree to be contacted.', 'quiz consent is lifted out of the answer map')
t(Object.keys(lifted.values).join(',') === 'first_name', 'and never left behind in the stored answers')
t(extractQuizConsent({ first_name: 'Ada' }).consent === undefined, 'no consent keys, no consent')
t(extractQuizConsent({ [QUIZ_CONSENT_KEYS.accepted]: 'no', [QUIZ_CONSENT_KEYS.text]: 'x' }).consent === undefined, 'a value other than yes is not consent')

/* ---------------------------------------------- forged consent over the API */
const BRAND = 'By checking this box I agree {{brand.displayName}} may call me. <a href="/tcpa">TCPA terms</a>'
t(disclosureMatchesBrand('By checking this box I agree Acme may call me. TCPA terms', BRAND), 'the Brand text, with its {{token}} filled in and its link as plain text, is verified')
t(!disclosureMatchesBrand('I agree to anything at all', BRAND), 'arbitrary text is NOT verified against the Brand')
t(!disclosureMatchesBrand('x', ''), 'a Brand with no text verifies nothing')
const src = { site_slug: 'a', site_name: 'A', host: 'h', funnel_type: 'quiz', funnel_id: null, funnel_path: null, deployment_id: null }
const now = new Date('2026-09-26T10:00:00Z')
const forged = buildConsentRecord({ accepted: true, disclosure_text: 'I agree <script>alert(1)</script>', client_accepted_at: '1999-01-01T00:00:00Z' }, src, now, BRAND)
t(forged.method === CONSENT_METHOD_UNVERIFIED, 'a forged disclosure is recorded as unverified')
t(forged.client_accepted_at === null, 'a 1999 device clock is discarded')
t(!/script|alert/.test(forged.disclosure_text), 'and a script body is never stored')
const good = buildConsentRecord({ accepted: true, disclosure_text: 'By checking this box I agree Acme may call me. TCPA terms', client_accepted_at: '2026-09-26T09:59:00Z' }, src, now, BRAND)
t(good.method === CONSENT_METHOD && good.client_accepted_at !== null, 'the genuine text is verified and keeps a plausible device clock')

/* ----------------------------------------------------- disclosure safety */

const hostile = 'I agree. <script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">click</a> <a href="/tcpa" onclick="y()">TCPA terms</a> <img src=x onerror=z()>'
const html = safeConsentHtml(hostile)
t(!/<script/i.test(html) && !/javascript:/i.test(html), 'hostile disclosure HTML has no script element and no javascript: URL')
t(!/<[^>]*\son\w+=/i.test(html), 'and no tag carries an event handler')
t(/<a href="\/tcpa">TCPA terms<\/a>/.test(html), 'a legitimate /tcpa link survives, without its handler')
const plain = consentPlainText(hostile)
t(!/<script|<a |<\/a>/i.test(plain) && plain.includes('TCPA terms') && plain.startsWith('I agree.'), 'the stored evidence is plain text of what the visitor saw, no active markup')
t(!plain.includes('alert(1)'), 'a script body is never recorded as something the visitor read')

/* ---------------------------------------------------------- wiring smoke */
// Structural, and few: that the worker and boot path exist. Behaviour is above.
const worker = readFileSync(new URL('../src/workers/lead-delivery.ts', import.meta.url), 'utf8')
t(worker.includes('deliverStoredLead'), 'the worker delivers a stored lead, it does not recapture one')
const nodeBoot = readFileSync(new URL('../src/instrumentation.node.ts', import.meta.url), 'utf8')
t(nodeBoot.includes('ensureLeadDeliveryWorker'), 'the Next node process starts the lead-delivery worker')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
