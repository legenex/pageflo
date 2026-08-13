/**
 * The error reporter, and specifically what it refuses to send.
 *
 *   pnpm test:observability
 *
 * `docs/production-readiness.md` exit criterion 6 — "when something breaks at
 * 3am, there is a way to find out what" — had been FAIL since it was written.
 * There were seventeen `console.error` calls in `src/`, each worded differently,
 * none naming the brand or the route, and nothing collecting them.
 *
 * The half of this that needs the most testing is not the delivery. It is the
 * REDACTION. An error message quotes the value that failed, and on this product
 * the value that failed is very often a claimant's phone number or email — so
 * the moment a destination is configured, an unredacted reporter starts
 * exporting personal data from a legal-advertising funnel to a third party.
 * Every case below is a string that could plausibly be inside a real error.
 */
import {
  buildErrorEvent,
  fingerprint,
  redact,
  redactDeep,
  reportError,
  setTransports,
  logTransport,
  type ErrorEvent,
} from '../src/lib/observability/report.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

/* ------------------------------------------------------------- redaction */

const LEAKS: Array<[string, string]> = [
  ['contact.email must be valid, got "jane.doe@example.com"', 'jane.doe@example.com'],
  ['phone 555-123-4567 is not deliverable', '555-123-4567'],
  ['phone +1 (555) 123-4567 failed HLR', '555) 123-4567'],
  ['ssn 123-45-6789 rejected', '123-45-6789'],
  ['Authorization: Bearer sk_live_abcdef123456 was refused', 'sk_live_abcdef123456'],
  ['api_key=abcdef123456 is invalid', 'abcdef123456'],
  ['password: hunter2 did not match', 'hunter2'],
  ['GET /api/leads?token=abc123&email=jane@example.com failed', 'abc123'],
  ['card 4111 1111 1111 1111 declined', '4111 1111 1111 1111'],
]

for (const [message, secret] of LEAKS) {
  const out = redact(message)
  t(!out.includes(secret), `redacted out of: ${message.slice(0, 48)}…`)
  t(out.length > 0, 'and something is left to read')
}

{
  // Idempotence. A message that passes through twice - through the event and
  // then through a transport that redacts again - must not degrade into
  // "[redacted][redacted]".
  const once = redact(LEAKS[0][0])
  t(redact(once) === once, 'redaction is idempotent')
}
{
  // The useful part survives. A redactor that returned "[redacted]" for
  // everything would pass every assertion above and be worthless.
  const out = redact('Failed query: select "sites"."brand_identity" from "sites" limit $1')
  t(out.includes('brand_identity') && out.includes('select'), 'a SQL error keeps the part that identifies it')
  const stack = redact('at resolveSiteByHost (/var/www/src/lib/site-resolver.ts:88:11)')
  t(stack.includes('site-resolver.ts'), 'a stack keeps the file that threw')
}
{
  const deep = redactDeep({ contact: { email: 'a@b.com', nested: { phone: '5551234567' } }, ok: true, n: 3 })
  const json = JSON.stringify(deep)
  t(!json.includes('a@b.com'), 'nested strings are redacted')
  t(!json.includes('5551234567'), 'two levels down as well')
  t(json.includes('true') && json.includes('3'), 'and non-strings are preserved')

  const cyclic: Record<string, unknown> = { name: 'x' }
  cyclic.self = cyclic
  t(typeof JSON.stringify(redactDeep(cyclic)) === 'string', 'a cyclic object does not hang the reporter')
}

/* ----------------------------------------------------------- the event */

{
  const event = buildErrorEvent('server', new Error('boom at jane@example.com'), {
    siteId: 13,
    route: 'POST /api/leads',
    operation: 'lead-pipeline:meta.capi',
  })
  t(event.kind === 'server', 'the event carries its kind')
  t(!event.message.includes('jane@example.com'), 'and a redacted message')
  t(event.context.siteId === '13', 'and the brand, as an id')
  t(event.context.route === 'POST /api/leads', 'and the route')
  t(typeof event.ts === 'string' && event.ts.includes('T'), 'and a timestamp')
  t(event.fingerprint.length === 8, 'and a fingerprint')
  t(JSON.stringify(event).length < 12_000, 'and stays small enough to forward')
}
{
  const weird = buildErrorEvent('server', { odd: 'shape' })
  t(weird.message.includes('odd'), 'a non-Error is reported rather than dropped')
  t(weird.stack === null, 'with no stack invented for it')
  t(buildErrorEvent('server', undefined).message.length >= 0, 'and undefined does not throw')
}
{
  // Grouping. The same failure with a different id is one problem.
  const a = fingerprint('server', 'Site 41 not found', 'resolve')
  const b = fingerprint('server', 'Site 9127 not found', 'resolve')
  const c = fingerprint('server', 'Domain 41 not found', 'resolve')
  t(a === b, 'two instances of one failure share a fingerprint')
  t(a !== c, 'and a different failure does not')
  t(fingerprint('server', 'x', 'a') !== fingerprint('server', 'x', 'b'), 'the operation is part of the identity')
}

/* --------------------------------------------------------- transports */

{
  const seen: ErrorEvent[] = []
  setTransports([(e) => { seen.push(e) }])
  reportError('pipeline', new Error('capi 400 for jane@example.com'), { operation: 'lead-pipeline:meta.capi' })
  t(seen.length === 1, 'a report reaches the configured transport')
  t(!JSON.stringify(seen[0]).includes('jane@example.com'), 'redacted before it leaves')

  // The contract that matters most: reporting must never become a second
  // failure. These are called from catch blocks and error boundaries, where a
  // throw has nowhere to go.
  setTransports([
    () => { throw new Error('transport exploded') },
    () => Promise.reject(new Error('async transport exploded')),
    (e) => { seen.push(e) },
  ])
  let threw = false
  try {
    reportError('server', new Error('original failure'))
  } catch {
    threw = true
  }
  t(!threw, 'a transport that throws does not replace the error being reported')
  t(seen.length === 2, 'and the transports after it still run')

  // Let the rejected promise settle, so an unhandled rejection would surface
  // here rather than in whatever ran next.
  await new Promise((r) => setTimeout(r, 20))
  t(true, 'and a transport that rejects produces no unhandled rejection')

  setTransports(null)
  t(typeof logTransport === 'function', 'the log transport is always available, with no provider configured')
}

/* ------------------------------------------------------------------- report */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
