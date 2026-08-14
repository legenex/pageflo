/**
 * Lead idempotency: a retried submission writes ONE lead, not two.
 *
 * The lead form retries on failure and releases its client guard so a later
 * endpoint can try again. Without a server-side idempotency key, a submit whose
 * write committed but whose response was lost came back through the pipeline and
 * created a SECOND lead — a duplicate row, a duplicate CAPI conversion, a second
 * webhook to a buyer (Reviewer E, F-E1). `client_submission_id` closes it: the
 * pipeline returns the existing lead for a key it has already written.
 *
 * This drives the real `runLeadPipeline` against the real database. Integrations
 * degrade without credentials, which is fine — the assertions are about the
 * lead ROW, and the dedupe short-circuits before any side effect anyway.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { runLeadPipeline } from '../src/lib/lead-pipeline/run.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const RUN = `idem_${process.pid}_${Math.floor(process.uptime() * 1000)}`
const created: Array<{ collection: string; id: string | number }> = []

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const site = await payload.create({
    collection: 'sites',
    data: { name: `${RUN} brand`, slug: RUN, status: 'active', vertical: 'mva', default_phone: '(800) 555-0100' } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'sites', id: site.id })
  const siteId = Number(site.id)

  const contact = { first_name: 'Idem', last_name: 'Probe', email: `${RUN}@example.test`, phone: '5551234567' }
  const base = {
    siteId, siteSlug: RUN, siteName: `${RUN} brand`, primaryHost: null,
    funnel_type: 'quiz' as const, funnel_id: `${RUN}-flow`, contact,
  }

  const leadsFor = async (key: string): Promise<number> => {
    const r = await payload.find({
      collection: 'leads',
      where: { and: [{ site: { equals: siteId } }, { client_submission_id: { equals: key } }] },
      limit: 10, depth: 0, overrideAccess: true,
    })
    return r.totalDocs
  }

  // --- same key twice: one row, same id returned -----------------------------
  const KEY = `${RUN}-key-A`
  const r1 = await runLeadPipeline({ ...base, client_submission_id: KEY })
  t(r1.ok && r1.lead_id != null, 'first submit creates a lead')
  if (r1.lead_id) created.push({ collection: 'leads', id: r1.lead_id })

  const r2 = await runLeadPipeline({ ...base, client_submission_id: KEY })
  t(r2.ok, 'the retry with the same key succeeds')
  t(r2.lead_id === r1.lead_id, `the retry returns the SAME lead (${r1.lead_id} vs ${r2.lead_id}), not a new one`)
  t(r2.steps.some((s) => s.step === 'lead.deduplicated'), 'and reports it as a deduplicated submission')
  t(await leadsFor(KEY) === 1, `exactly one lead row carries the key (found ${await leadsFor(KEY)})`)

  // A third attempt (a later endpoint re-firing) still does not duplicate.
  const r3 = await runLeadPipeline({ ...base, client_submission_id: KEY })
  t(r3.lead_id === r1.lead_id && await leadsFor(KEY) === 1, 'a third submit with the key still writes no new row')

  // --- a different key is a different lead ------------------------------------
  const KEY2 = `${RUN}-key-B`
  const r4 = await runLeadPipeline({ ...base, client_submission_id: KEY2 })
  if (r4.lead_id) created.push({ collection: 'leads', id: r4.lead_id })
  t(r4.ok && r4.lead_id !== r1.lead_id, 'a submission with a DIFFERENT key is a different lead')
  t(await leadsFor(KEY2) === 1, 'and stands as its own single row')

  // --- no key preserves the legacy always-insert behaviour -------------------
  const n1 = await runLeadPipeline({ ...base })
  const n2 = await runLeadPipeline({ ...base })
  if (n1.lead_id) created.push({ collection: 'leads', id: n1.lead_id })
  if (n2.lead_id) created.push({ collection: 'leads', id: n2.lead_id })
  t(
    n1.ok && n2.ok && n1.lead_id !== n2.lead_id,
    'two keyless submissions still create two rows (the test harness and legacy forms are unchanged)',
  )
}

try {
  await main()
} catch (err) {
  fail++
  console.log(`  FAIL the idempotency walk completed — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
} finally {
  const payload = await getPayload({ config })
  for (const row of created.reverse()) {
    await payload.delete({ collection: row.collection as never, id: row.id, overrideAccess: true }).catch(() => null)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
process.exit(0)
