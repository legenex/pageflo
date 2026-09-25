/**
 * Lead delivery lifecycle: queue visibility, honest delivery state, safe retry.
 *
 *   pnpm test:delivery
 *
 * Drives the REAL pipeline against the real database with the outbound webhook
 * transport stubbed (the SSRF guard correctly forbids the loopback a local
 * receiver would need, and no test may contact a real buyer). What is proved:
 *
 *   - a Lead is visibly `queued` from the moment it is stored
 *   - a finished pass with NO configured destination is `no-destination`, not
 *     "delivered": `downstream.completed` is not a delivery claim
 *   - one destination up and one down is `partial`; all down is `failed`
 *   - a retry sends ONLY to what failed. A destination that already has the lead
 *     is not sent it again, and a redelivered queue job for a finished pass is a no-op
 *   - the request and the retry pass are both in the Lead's delivery history
 *   - a retry is authorised as the user: an analyst, or an editor of another
 *     Brand, is refused before anything is sent
 *   - consent evidence written at capture survives every later log write
 */
import 'dotenv/config'

// No Redis: the queue is unavailable, so capture delivers inline and the test
// is deterministic. (The queue path is proved in the browser suite, where the
// real server runs its worker.)
process.env.REDIS_URL = ''

import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { runLeadPipeline, deliverStoredLead } from '../src/lib/lead-pipeline/run.ts'
import { appendDeliveryLog } from '../src/lib/lead-pipeline/log.ts'
import { readDelivery, DELIVERY_STEPS } from '../src/lib/lead-pipeline/delivery-state.ts'
import { setWebhookPostForTests } from '../src/lib/lead-pipeline/dispatch-webhooks.ts'
import { buildConsentRecord } from '../src/lib/lead-consent.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const RUN = `dlv_${process.pid}_${Math.floor(process.uptime() * 1000)}`
const created: Array<{ collection: string; id: string | number }> = []

type Log = Array<{ step?: string; ok?: boolean; detail?: string }>

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const mkSite = async (slug: string) => {
    const s = await payload.create({
      collection: 'sites',
      data: { name: `${slug} brand`, slug, status: 'active', vertical: 'mva', default_phone: '(800) 555-0100' } as never,
      overrideAccess: true,
    })
    created.push({ collection: 'sites', id: s.id })
    return s
  }
  const site = await mkSite(RUN)
  const otherSite = await mkSite(`${RUN}-other`)
  const siteId = Number(site.id)

  const logOf = async (id: number | string): Promise<Log> =>
    ((await payload.findByID({ collection: 'leads', id, depth: 0, overrideAccess: true })) as { delivery_log?: Log }).delivery_log ?? []
  const leadDoc = async (id: number | string) =>
    (await payload.findByID({ collection: 'leads', id, depth: 0, overrideAccess: true })) as Record<string, any>

  const base = {
    siteId, siteSlug: RUN, siteName: `${RUN} brand`, primaryHost: 'qa.example',
    funnel_type: 'quiz' as const, funnel_id: `${RUN}-flow`, funnel_path: '/s/x', source_entity_id: '77',
    contact: { first_name: 'Del', last_name: 'Ivery', email: `${RUN}@example.test`, phone: '5551234567' },
  }
  const consent = buildConsentRecord(
    { accepted: true, disclosure_text: 'I agree to be contacted.', client_accepted_at: new Date().toISOString() },
    { site_slug: RUN, site_name: `${RUN} brand`, host: 'qa.example', funnel_type: 'quiz', funnel_id: `${RUN}-flow`, funnel_path: '/s/x', deployment_id: '77' },
  )

  /* ---- 1. no destination configured ---------------------------------------- */
  let calls: Record<string, number> = {}
  setWebhookPostForTests(async (url) => {
    calls[url] = (calls[url] ?? 0) + 1
    return { ok: false, code: 'blocked_address', reason: 'no transport in this case' } as never
  })

  const r1 = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-a`, consent })
  t(r1.ok && r1.lead_id != null, 'capture persists a lead')
  created.push({ collection: 'leads', id: r1.lead_id! })
  const doc1 = await leadDoc(r1.lead_id!)
  const steps1 = (doc1.delivery_log as Log).map((e) => e.step)
  t(steps1[0] === DELIVERY_STEPS.captured, `the log starts at capture (${steps1.join(' > ')})`)
  t(steps1.includes(DELIVERY_STEPS.queued), 'the lead was recorded as queued when it was stored')
  t(steps1.includes(DELIVERY_STEPS.queueUnavailable), 'and says so when the queue turned out to be unavailable, rather than staying "queued"')
  t(steps1.includes(DELIVERY_STEPS.processing) && steps1.includes(DELIVERY_STEPS.completed), 'then processing and completion')
  t(doc1.delivery_state === 'no-destination', `with no configured destination the state is no-destination, not delivered (was ${doc1.delivery_state})`)
  t(/no destination configured/.test(String((doc1.delivery_log as Log).find((e) => e.step === DELIVERY_STEPS.completed)?.detail)), 'and the completion entry says nothing was sent to an outside party')
  t(readDelivery(doc1.delivery_log).state === 'no-destination', 'the console reading agrees with the persisted state')
  t(doc1.consent?.accepted === true && doc1.consent?.disclosure_text === 'I agree to be contacted.', 'consent evidence is stored on the lead')
  t(doc1.consent?.source_deployment_id === '77' && doc1.consent?.source_host === 'qa.example', 'with the collecting deployment and host')
  t(Array.isArray(doc1.status_history) && doc1.status_history.length === 1 && doc1.status_history[0].status === 'new', 'status history starts with exactly one entry')

  /* ---- 2. two destinations, one fails, retry sends only to the failed one ---- */
  const tc = await payload.create({
    collection: 'tracking-configs',
    data: {
      site: siteId,
      custom_webhooks: [
        { name: 'buyer-a', url: 'https://buyer-a.qa.invalid/hook', enabled: true },
        { name: 'buyer-b', url: 'https://buyer-b.qa.invalid/hook', enabled: true },
      ],
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'tracking-configs', id: tc.id })

  let bMode: 'fail' | 'ok' = 'fail'
  setWebhookPostForTests(async (url) => {
    calls[url] = (calls[url] ?? 0) + 1
    if (url.includes('buyer-b') && bMode === 'fail') return { ok: false, code: 'upstream', reason: 'status 500', status: 500 } as never
    return { ok: true, status: 200, url, contentType: 'application/json', body: '{}', bytes: 2 } as never
  })
  calls = {}
  const r2 = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-b`, consent })
  const id2 = r2.lead_id!
  created.push({ collection: 'leads', id: id2 })
  const A = 'https://buyer-a.qa.invalid/hook'
  const B = 'https://buyer-b.qa.invalid/hook'
  t(calls[A] === 1 && calls[B] === 1, `first pass contacts each destination once (A=${calls[A]}, B=${calls[B]})`)
  const d2 = await leadDoc(id2)
  t(d2.delivery_state === 'partial', `one destination up and one down is partial (was ${d2.delivery_state})`)
  const reading2 = readDelivery(d2.delivery_log)
  t(reading2.retryable && reading2.destinations.delivered === 1 && reading2.destinations.failed === 1, 'and it is retryable, with the split counted')

  // The operator's request is written first, then the pass runs.
  bMode = 'ok'
  const requested = await appendDeliveryLog(id2, [{ step: DELIVERY_STEPS.retryRequested, ok: true, detail: 'requested by qa' }])
  t(requested.state === 'retry-pending' && requested.retryCount === 1, 'a requested retry reads as retry pending and is counted')
  t(!requested.retryable, 'so a second request while pending is not eligible')

  await deliverStoredLead(id2, { trigger: 'retry' })
  t(calls[A] === 1, `the retry does NOT resend to the destination that already has the lead (A=${calls[A]})`)
  t(calls[B] === 2, `and does retry the one that failed (B=${calls[B]})`)
  const d2b = await leadDoc(id2)
  t(d2b.delivery_state === 'delivered', `both now have it: delivered (was ${d2b.delivery_state})`)
  const steps2 = (d2b.delivery_log as Log).map((e) => e.step)
  t(steps2.includes(DELIVERY_STEPS.retryRequested), 'the retry request is in the delivery history')
  t(steps2.filter((s) => s === DELIVERY_STEPS.processing).length === 2, 'and so is the second pass')
  t(steps2.indexOf('webhook.buyer-b') < steps2.lastIndexOf('webhook.buyer-b'), 'with the failure and the later success both kept, not overwritten')
  t(d2b.consent?.accepted === true, 'consent evidence survives the retry')
  t(d2b.status_history?.length === 1, 'and so does status history')

  // A queue redelivering the finished job must not send again.
  const before = { ...calls }
  const redelivered = await deliverStoredLead(id2, { trigger: 'queue' })
  t(redelivered.steps.some((s) => s.step === 'delivery.deduplicated'), 'a redelivered job for a finished pass is deduplicated')
  t(calls[A] === before[A] && calls[B] === before[B], 'and contacts nobody')
  t(readDelivery((await leadDoc(id2)).delivery_log).retryable === false, 'a delivered lead offers no retry')

  /* ---- 3. everything fails: failed, retry attempts again, history grows ------ */
  const r3 = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-c`, consent })
  const id3 = r3.lead_id!
  created.push({ collection: 'leads', id: id3 })
  bMode = 'fail'
  await payload.update({
    collection: 'tracking-configs', id: tc.id, overrideAccess: true,
    data: { custom_webhooks: [{ name: 'buyer-b', url: B, enabled: true }] } as never,
  })
  // A fresh lead against the failing destination only.
  calls = {}
  const r4 = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-d`, consent })
  const id4 = r4.lead_id!
  created.push({ collection: 'leads', id: id4 })
  t((await leadDoc(id4)).delivery_state === 'failed', 'every destination down is failed')
  await appendDeliveryLog(id4, [{ step: DELIVERY_STEPS.retryRequested, ok: true }])
  await deliverStoredLead(id4, { trigger: 'retry' })
  const d4 = await leadDoc(id4)
  t(calls[B] === 2, `a failed destination is tried again on retry (B=${calls[B]})`)
  t(d4.delivery_state === 'failed', 'and a retry that fails again is honestly still failed')
  t(readDelivery(d4.delivery_log).retryable && readDelivery(d4.delivery_log).retryCount === 1, 'and can be retried again, with the count kept')

  /* ---- 4. authorisation: the write is the user's, not the pipeline's --------- */
  const mkUser = async (name: string, siteBindings: unknown[]) => {
    const u = await payload.create({
      collection: 'users',
      data: { email: `${RUN}-${name}@example.test`, password: `pw-${RUN}-${name}`, name, status: 'active', siteBindings } as never,
      overrideAccess: true,
    })
    created.push({ collection: 'users', id: u.id })
    return payload.findByID({ collection: 'users', id: u.id, depth: 2, overrideAccess: true })
  }
  const editor = await mkUser('editor', [{ site: siteId, role: 'editor' }])
  const analyst = await mkUser('analyst', [{ site: siteId, role: 'analyst' }])
  const stranger = await mkUser('stranger', [{ site: otherSite.id, role: 'admin' }])

  const attempt = async (user: unknown, id: number | string): Promise<'ok' | 'refused'> => {
    try {
      await appendDeliveryLog(id, [{ step: DELIVERY_STEPS.retryRequested, ok: true }], { user })
      return 'ok'
    } catch {
      return 'refused'
    }
  }
  const countBefore = readDelivery(await logOf(id4)).retryCount
  t((await attempt(analyst, id4)) === 'refused', 'an analyst (read-only) cannot request a retry')
  t((await attempt(stranger, id4)) === 'refused', 'an admin of ANOTHER Brand cannot request a retry')
  t(readDelivery(await logOf(id4)).retryCount === countBefore, 'and neither left anything in the delivery history')
  t((await attempt(editor, id4)) === 'ok', 'an editor of the lead\'s own Brand can')
  t(readDelivery(await logOf(id4)).retryCount === countBefore + 1, 'and it is recorded')

  /* ---- 5. old leads stay readable ------------------------------------------- */
  const old = await payload.create({
    collection: 'leads',
    data: { site: siteId, source_entity_type: 'quiz', status: 'new', contact: { email: `${RUN}-old@example.test` } } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'leads', id: old.id })
  const oldDoc = await leadDoc(old.id)
  t(!oldDoc.consent?.accepted && !oldDoc.consent?.disclosure_text, 'a lead written without consent carries no consent record')
  t(readDelivery(oldDoc.delivery_log).state === 'not-attempted', 'and reads as "no delivery record", not as delivered or pending')
}

main()
  .catch((err) => { fail++; console.error(err) })
  .finally(async () => {
    setWebhookPostForTests(null)
    try {
      const payload = await getPayload({ config })
      for (const row of created.reverse()) {
        await payload.delete({ collection: row.collection as never, id: row.id, overrideAccess: true }).catch(() => null)
      }
    } catch { /* cleanup is best effort */ }
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
  })
