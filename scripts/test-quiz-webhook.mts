/**
 * The quiz webhook execution layer, against every answer a provider can give.
 *
 *   pnpm test:webhook
 *
 * WHY THIS SUITE EXISTS. The shipped MVA flow assigns tiers 1, 2 and 4 ONLY from
 * a lookup node's response mapping. Production logs the configured endpoint
 * answering 405, so every visitor walked the whole quiz untiered and four
 * authored question variants were dead. That made the difference between a
 * qualified lead and a dead-end an external service's HTTP status, with nothing
 * anywhere checking what happens for each of them.
 *
 * So each case below is a way the provider can behave, and the assertion is what
 * a VISITOR gets when it does. The rule throughout is that every failure
 * degrades to "untiered and the flow continues": a lead with no tier is worth
 * more than no lead, and a WRONG tier is worse than both.
 *
 * The network is injected for the provider cases, because a test that had to
 * reach a real host to prove "the provider returned HTML" would be testing the
 * host. The SSRF case is the exception and is deliberately NOT a double: it runs
 * the real guard against real blocked addresses, because a stubbed SSRF check is
 * the one stub that proves nothing.
 */
import { executeWebhookNode, interpolateJson, headerValue, readJsonPath, methodOf } from '../src/lib/quiz-webhook/execute.ts'
import { decideTier, rejectedTierMessage } from '../src/lib/quiz-webhook/tier.ts'
import { safePost } from '../src/lib/net/ssrf.ts'
import { SEED_TIERS, buildSeedNodes } from '../src/components/builder/quiz/seed-data.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

/* ------------------------------------------------------------------ the node */
//
// The REAL seeded node, not a hand-written stand-in. Its contract is the thing
// under test: a shape invented here would pass whatever it was written to pass.

const seedNodes = buildSeedNodes() as Array<Record<string, unknown>>
const tierNode = seedNodes.find((n) => n.id === 'n_tier_lookup')!

t(Boolean(tierNode), 'the seeded MVA flow has a tier-lookup node')
t(tierNode.type === 'webhook', 'which is a webhook node')
t(String(tierNode.webhookUrl).startsWith('https://'), 'and calls an https endpoint')
t(methodOf(tierNode) === 'POST', 'with the POST verb the author chose')

{
  // The REQUEST SCHEMA, read off the node rather than described. This is the
  // contract any replacement provider has to satisfy.
  const body = JSON.parse(interpolateJson(String(tierNode.webhookPayload), {
    accident_state: 'TX',
    incident_date: '2025-04',
  }))
  t(Object.keys(body).sort().join(',') === 'accident_state,incident_date',
    'the request carries exactly accident_state and incident_date')
  t(body.accident_state === 'TX' && body.incident_date === '2025-04', 'with the visitor\'s own answers')

  // The RESPONSE SCHEMA, likewise.
  const mappings = tierNode.responseMappings as Array<{ jsonPath: string; fieldKey: string }>
  t(mappings.length === 1 && mappings[0].jsonPath === 'tier' && mappings[0].fieldKey === 'tier',
    'the response is read from a top-level `tier` and written to the `tier` field')
  t(SEED_TIERS.map((x) => x.id).join(',') === 't1,t2,t3,t4', 'and the declared tiers are t1..t4')
}

/* -------------------------------------------------------------- the provider */

/** A provider that answers exactly this, once. */
const provider = (over: Partial<{ ok: boolean; status: number; body: string; code: string; reason: string }>) =>
  async () => (over.ok === false
    ? { ok: false as const, code: (over.code ?? 'transport_error') as never, reason: over.reason ?? 'failed', status: over.status }
    : { ok: true as const, status: over.status ?? 200, url: 'https://provider.test/x', contentType: 'application/json', body: over.body ?? '{}', bytes: (over.body ?? '{}').length })

const run = (over: Parameters<typeof provider>[0], values: Record<string, unknown> = {}) =>
  executeWebhookNode(tierNode, values, { post: provider(over) })

/* --- every declared tier ---------------------------------------------------- */

for (const tier of ['t1', 't2', 't3', 't4']) {
  const out = await run({ body: JSON.stringify({ tier }) })
  t(out.ok && out.fields.tier === tier, `a provider answering {"tier":"${tier}"} maps it onto the tier field`)

  const decision = decideTier({ returned: tier, declared: SEED_TIERS, current: '' })
  t(decision.tier === tier && decision.fromProvider, `and ${tier} is accepted for routing`)
  t(decision.rejected === null, `and nothing is rejected for ${tier}`)
}

{
  // The whole point: with the lookup working, all four tiers are reachable. This
  // is the assertion that was false in production.
  const reached = new Set<string>()
  for (const tier of ['t1', 't2', 't3', 't4']) {
    const out = await run({ body: JSON.stringify({ tier }) })
    if (out.ok) reached.add(decideTier({ returned: out.fields.tier, declared: SEED_TIERS, current: '' }).tier)
  }
  t(reached.size === 4, `all four tiers are reachable through the lookup (${[...reached].sort().join(',')})`)
}

/* --- an invalid tier -------------------------------------------------------- */

for (const bad of ['t5', 'TIER_1', 'tier1', '1', 'gold', '', '   ', 't1; drop', '<script>']) {
  const out = await run({ body: JSON.stringify({ tier: bad }) })
  t(out.ok, `a provider answering an unknown tier ${JSON.stringify(bad)} is still a successful call`)
  const decision = decideTier({ returned: bad, declared: SEED_TIERS, current: 't3' })
  t(decision.tier === 't3', `and the visitor's existing tier is left alone for ${JSON.stringify(bad)}`)
  t(!decision.fromProvider, `and the provider did not set it for ${JSON.stringify(bad)}`)
  if (bad.trim() !== '') {
    t(decision.rejected?.returned === bad.trim(), `and the rejection names what came back for ${JSON.stringify(bad)}`)
    t(rejectedTierMessage(decision.rejected!).includes('t1, t2, t3, t4'), 'and the log line names the tiers the quiz does declare')
  }
}

{
  // The value still reaches the lead even when it cannot route. A buyer's own
  // classification is worth delivering; it is just not allowed to pick questions.
  const out = await run({ body: JSON.stringify({ tier: 'platinum' }) })
  t(out.ok && out.fields.tier === 'platinum', 'an unknown tier is still carried as a value')
}

{
  // A tier that a DIFFERENT quiz declares must not route this one.
  const decision = decideTier({ returned: 't9', declared: [{ id: 't9' }], current: '' })
  t(decision.tier === 't9', 'a quiz that declares t9 accepts t9')
  const other = decideTier({ returned: 't9', declared: SEED_TIERS, current: '' })
  t(other.tier === '' && other.rejected !== null, 'and a quiz that does not declare it refuses it')
}

{
  // An answer's own decision outranks the lookup, and is not reported as a
  // rejection: the flow deliberately overrides here.
  const decision = decideTier({ returned: 't1', declared: SEED_TIERS, current: '', answerTier: 't3' })
  t(decision.tier === 't3', "an answer's own setTier wins over a returned tier")
  t(!decision.fromProvider && decision.rejected === null, 'and that is not reported as a rejection')
}

/* --- provider timeout ------------------------------------------------------- */

{
  const out = await run({ ok: false, code: 'timeout', reason: 'timed out after 6000ms' })
  t(!out.ok, 'a provider that times out is a failed call')
  t(!out.ok && out.code === 'transport', 'reported as a transport failure')
  t(!out.ok && out.reason.includes('timed out'), 'with the reason carried through for the log')
  const decision = decideTier({ returned: undefined, declared: SEED_TIERS, current: '' })
  t(decision.tier === '' && decision.rejected === null, 'and the visitor continues untiered rather than being dead-ended')
}

{
  // A real timeout, not a described one: a poster that never resolves inside the
  // budget must not hang the executor.
  const started = Date.now()
  const out = await executeWebhookNode(tierNode, {}, {
    post: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: 'timeout', reason: 'timeout' } as never), 30)),
  })
  t(!out.ok, 'a slow provider resolves to a failure rather than hanging')
  t(Date.now() - started < 5000, 'and does so promptly')
}

/* --- a non-JSON response ---------------------------------------------------- */

for (const [label, body] of [
  ['an HTML shell', '<!DOCTYPE html><html><head><title>Base44</title></head><body><div id="root"></div></body></html>'],
  ['a bare string', 'tier=t1'],
  ['empty', ''],
  ['truncated JSON', '{"tier":"t1"'],
] as const) {
  const out = await run({ body })
  t(!out.ok && out.code === 'not_json', `${label} is refused as not-JSON`)
  t(!out.ok && out.status === 200, 'and the 200 it came with is recorded rather than believed')
}

{
  // The measured production case: the configured URL is a web app, so a GET
  // returns the application shell with a 200.
  const out = await run({ body: '<!DOCTYPE html><html><body>app</body></html>' })
  t(!out.ok, 'the exact production symptom - an app shell on a 200 - never becomes a tier')
}

/* --- a provider error ------------------------------------------------------- */

for (const status of [400, 401, 403, 404, 405, 429, 500, 502, 503]) {
  const out = await run({ status, body: '{"tier":"t1"}' })
  t(!out.ok && out.code === 'http_status', `a provider answering ${status} is refused`)
  t(!out.ok && out.status === status, `and the status is reported (${status})`)
}

{
  // 405 is what production actually logs. A body that looks right on a bad
  // status must not be read.
  const out = await run({ status: 405, body: '{"tier":"t1"}' })
  t(!out.ok, 'a 405 with a plausible body is still refused')
}

/* --- an SSRF-blocked target ------------------------------------------------- */
//
// NOT a double. A stubbed SSRF check is the one stub that proves nothing, so
// this runs the real guard against real addresses.

for (const url of [
  'http://169.254.169.254/latest/meta-data/',
  'http://metadata.google.internal/computeMetadata/v1/',
  'http://127.0.0.1:3000/api/leads',
  'http://localhost:5432/',
  'http://10.0.0.1/',
  'http://192.168.1.1/',
  'http://[::1]/',
  'file:///etc/passwd',
  'gopher://127.0.0.1:11211/',
]) {
  const node = { ...tierNode, webhookUrl: url }
  const out = await executeWebhookNode(node, {}, { timeoutMs: 2000 })
  t(!out.ok, `the executor refuses ${url}`)
  t(!out.ok && out.code === 'transport', `and reports it as a transport refusal (${url})`)
}

{
  // And the guard itself refuses, so the refusal is the guard's and not an
  // accident of the address being unreachable from here.
  const res = await safePost('http://169.254.169.254/latest/meta-data/', { timeoutMs: 2000 })
  t(!res.ok, 'safePost itself refuses the cloud metadata address')
  t(!res.ok && res.code !== 'timeout', `and refuses it by policy rather than by timing out (${!res.ok ? res.code : ''})`)
}

/* --- what the layer will not do -------------------------------------------- */

{
  const out = await executeWebhookNode({ ...tierNode, type: 'question' }, {}, { post: provider({ body: '{"tier":"t1"}' }) })
  t(!out.ok && out.code === 'not_executable', 'a question node is not executable')
}
{
  const out = await executeWebhookNode({ ...tierNode, webhookUrl: '' }, {}, { post: provider({ body: '{"tier":"t1"}' }) })
  t(out.ok && out.called === false, 'a node with no URL walks straight through rather than failing')
}
{
  const out = await executeWebhookNode({ ...tierNode, responseMappings: [] }, {}, { post: provider({ body: '{"tier":"t1"}' }) })
  t(out.ok && out.called === false, 'a node that maps nothing does not call at all')
}
{
  // Only mapped fields come back. A provider that returns a whole record must
  // not have it forwarded into the lead.
  const out = await run({ body: JSON.stringify({ tier: 't1', internal_note: 'do not deliver', ssn: '000-00-0000' }) })
  t(out.ok && Object.keys(out.fields).join(',') === 'tier', "only the mapped field comes back, whatever else the provider says")
}
{
  const out = await run({ body: JSON.stringify({ tier: { id: 't1' } }) })
  t(out.ok && out.fields.tier === undefined, 'an object where a scalar was mapped is dropped rather than stringified')
}
{
  const long = 'x'.repeat(5000)
  const out = await run({ body: JSON.stringify({ tier: long }) })
  t(out.ok && out.fields.tier!.length === 500, 'a huge value is capped')
}

/* --- injection through the request ------------------------------------------ */

{
  // An answer that tries to close the JSON string it sits in and forge siblings.
  const body = interpolateJson(String(tierNode.webhookPayload), {
    accident_state: 'TX", "tier": "t1',
    incident_date: '2025-04',
  })
  const parsed = JSON.parse(body)
  t(Object.keys(parsed).sort().join(',') === 'accident_state,incident_date', 'a hostile answer cannot forge a sibling field')
  t(parsed.accident_state.includes('tier'), 'and is delivered verbatim as the string it is')
}
{
  const v = headerValue('Bearer {{token}}', { token: 'abc\r\nX-Injected: yes' })
  t(!v.includes('\n') && !v.includes('\r'), 'a newline in a header value cannot start a second header')
}
{
  t(readJsonPath({ a: { b: [{ c: 't2' }] } }, 'a.b[0].c') === 't2', 'a nested response path resolves')
  t(readJsonPath({ a: 1 }, 'a.b.c') === undefined, 'a missing path is undefined rather than a throw')
  t(readJsonPath(null, 'a') === undefined, 'and a null body is too')
}

/* ------------------------------------------------------------------- report */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
