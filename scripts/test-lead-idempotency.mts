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
 *
 * THE PIPELINE HAVING A KEY IS NOT THE SAME AS THE SURFACES SENDING ONE. The
 * block `lead_form` — which ships on every seeded Site's home page — built its
 * POST body without a `client_submission_id` at all, and the unique index is
 * PARTIAL (`WHERE client_submission_id IS NOT NULL`), so a keyless submit opted
 * out of the guarantee entirely and the pipeline's `submissionKey` was `null`
 * on every one of them. The second half of this file therefore drives the REAL
 * `/api/leads` handler with the REAL body shape that form now sends, and pins
 * the form's own end of the contract in its source.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'

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
  //
  // `/api/legalos/test-capture` deliberately sends no key: it is an AUTHENTICATED
  // admin harness whose entire purpose is to fire a fresh lead on demand, and two
  // clicks mean two test leads. That absence is intentional and is pinned here so
  // a later change cannot quietly make the harness idempotent (which would make
  // "fire a second test capture" silently do nothing).
  const n1 = await runLeadPipeline({ ...base })
  const n2 = await runLeadPipeline({ ...base })
  if (n1.lead_id) created.push({ collection: 'leads', id: n1.lead_id })
  if (n2.lead_id) created.push({ collection: 'leads', id: n2.lead_id })
  t(
    n1.ok && n2.ok && n1.lead_id !== n2.lead_id,
    'two keyless submissions still create two rows (the test harness and legacy forms are unchanged)',
  )

  const h1 = await runLeadPipeline({ ...base, test_capture: true, funnel_type: 'contact-form', funnel_path: '/test-capture' })
  const h2 = await runLeadPipeline({ ...base, test_capture: true, funnel_type: 'contact-form', funnel_path: '/test-capture' })
  if (h1.lead_id) created.push({ collection: 'leads', id: h1.lead_id })
  if (h2.lead_id) created.push({ collection: 'leads', id: h2.lead_id })
  t(
    h1.ok && h2.ok && h1.lead_id !== h2.lead_id,
    'the test-capture shape (no key, test_capture: true) still writes one row per invocation — documented as intentional',
  )

  // --- the LeadForm shape, through the REAL route ----------------------------
  //
  // Everything above proves the pipeline dedupes. None of it proves the block
  // lead form participates, because that is decided by the body the browser
  // sends. So: a Domain the route can resolve, then the exact payload
  // `LeadForm.onSubmit` now builds, posted twice through the actual handler.
  const domainHost = `${RUN.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.lead-form.test`
  const domain = await payload.create({
    collection: 'domains',
    // active/active so the row is eligible under LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY,
    // which is on in production.
    data: { site: siteId, host: domainHost, kind: 'custom', status: 'active', ssl_status: 'active', primary: true } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'domains', id: domain.id })

  const { POST } = await import('../src/app/api/leads/route.ts')
  const postLead = async (body: unknown): Promise<{ ok: boolean; lead_id: number | null }> => {
    // Only `headers.get` and `json()` are touched by the handler, so a stub is
    // the honest request object here — no framework object built outside its
    // server, and nothing mocked that the assertion depends on.
    const res = await POST({ headers: new Headers({ host: domainHost, 'content-type': 'application/json' }), json: async () => body } as never)
    return (await res.json()) as { ok: boolean; lead_id: number | null }
  }

  const FORM_KEY = `${RUN}-leadform`
  const formBody = {
    site_slug: RUN,
    funnel_type: 'contact-form',
    funnel_path: '/',
    client_submission_id: FORM_KEY,
    contact: { first_name: 'Form', last_name: 'Probe', email: `${RUN}-form@example.test`, phone: '5551234568', state: '', zip: '' },
    extra: { case_type: 'mva', agreed_to_tcpa: '1' },
    attribution: { utm_source: 'test', landing_path: '/' },
  }

  const f1 = await postLead(formBody)
  if (f1.lead_id) created.push({ collection: 'leads', id: f1.lead_id })
  t(f1.ok && f1.lead_id != null, 'a LeadForm-shaped POST to /api/leads creates a lead')

  // The retry a visitor makes after a lost response: same key, same body.
  const f2 = await postLead(formBody)
  t(f2.ok && f2.lead_id === f1.lead_id, `the retry returns the SAME lead (${f1.lead_id} vs ${f2.lead_id})`)
  t(await leadsFor(FORM_KEY) === 1, `and EXACTLY ONE lead row exists for the form's key (found ${await leadsFor(FORM_KEY)})`)

  // --- the form's own end of the contract, pinned in its source --------------
  const leadForm = readFileSync(new URL('../src/components/blocks/LeadForm.tsx', import.meta.url), 'utf8')
  t(
    /client_submission_id:\s*submissionIdRef\.current/.test(leadForm),
    'LeadForm sends client_submission_id on every POST',
  )
  t(
    /submissionIdRef\.current\s*=\s*newClientSubmissionId\(\)/.test(leadForm),
    'and mints it through the one shared helper, not a second scheme of its own',
  )
  t(
    !/submissionIdRef\.current\s*=\s*(null|undefined|''|"")/.test(leadForm),
    'and NEVER clears it — a retry that re-mints the key is a second lead',
  )

  const quizRuntime = readFileSync(new URL('../src/components/public/quiz/QuizRuntime.tsx', import.meta.url), 'utf8')
  t(
    /submissionIdRef\.current\s*=\s*newClientSubmissionId\(\)/.test(quizRuntime),
    'the quiz runtime mints through the same helper, so the two public surfaces cannot drift',
  )

  const client = readFileSync(new URL('../src/lib/lead-capture-client.ts', import.meta.url), 'utf8')
  t(
    /crypto\.randomUUID/.test(client) && /sub_\$\{Date\.now\(\)/.test(client),
    'and that helper has a fallback for the insecure contexts where crypto.randomUUID is undefined',
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
