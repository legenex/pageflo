/**
 * A dead third party cannot hold a visitor's lead submission open.
 *
 *   pnpm test:timeouts             # no database, no network, ~1s
 *
 * WHAT WAS WRONG. `runLeadPipeline` runs SYNCHRONOUSLY inside the public POST —
 * there is no queue and no worker. Five outbound calls on that path used a bare
 * `fetch` with no `AbortSignal`, and Node's fetch (undici) defaults to a ~300s
 * headers timeout:
 *
 *   src/lib/integrations/meta-capi.ts     Meta CAPI
 *   src/lib/integrations/jornaya.ts       LeadiD verification
 *   src/lib/integrations/truecall.ts      TrueCall push
 *   src/lib/lead-pipeline/run.ts          TikTok Events API
 *   src/lib/lead-pipeline/run.ts          GA4 Measurement Protocol
 *
 * So one unresponsive vendor did not degrade a step — it held the form open for
 * five minutes, pinned a server connection for the whole time, and handed the
 * visitor a failure they would then retry. `src/lib/net/ssrf.ts` had already
 * bounded the user-supplied addresses (`safePost`, 8s); these fixed vendor URLs
 * were the ones nobody had bounded.
 *
 * TWO THINGS ARE ASSERTED, because either alone is a false pass: that the
 * deadline WORKS (against a real socket that accepts and never answers), and
 * that every call site is actually ON it — a bounded helper nobody calls is the
 * same bug as no helper.
 */
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchWithTimeout, OUTBOUND_TIMEOUT_MS } from '../src/lib/net/outbound.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8')

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return `http://127.0.0.1:${port}/`
}

/* -------------------------------------------------------------------------- */
/*  The deadline, against a socket that accepts and never answers              */
/* -------------------------------------------------------------------------- */

// Loopback only. This is the shape of the failure that matters — not a refused
// connection (which fails fast anyway) but a vendor that takes the request and
// goes quiet, which is what undici waits ~300s for.
const dead = createServer(() => {})
const live = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{"ok":true}')
})

const deadUrl = await listen(dead)
const liveUrl = await listen(live)

const started = Date.now()
let caught: unknown = null
try {
  await fetchWithTimeout(deadUrl, { method: 'POST', body: '{}' }, 400)
} catch (err) {
  caught = err
}
const elapsed = Date.now() - started

t(caught instanceof Error, 'a silent endpoint rejects with a real Error')
t(
  /timed out after 400ms/.test(caught instanceof Error ? caught.message : ''),
  `and the message names the deadline rather than "The operation was aborted" (got "${caught instanceof Error ? caught.message : caught}")`,
)
t(elapsed < 1500, `and it gave up after ${elapsed}ms, not undici's ~300s default`)

// The exact shape every call site wraps it in. This is what turns a deadline
// into a failed PipelineStep instead of a throw out of runLeadPipeline.
const asCallSiteWouldHandleIt = async (): Promise<{ ok: boolean; error?: string }> => {
  try {
    await fetchWithTimeout(deadUrl, { method: 'POST' }, 250)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' }
  }
}
const step = await asCallSiteWouldHandleIt()
t(step.ok === false && /timed out/.test(step.error ?? ''), 'the call-site catch degrades it to a failed step, never a throw')

const healthy = await fetchWithTimeout(liveUrl, {}, 2000)
t(healthy.ok && ((await healthy.json()) as { ok?: boolean }).ok === true, 'a healthy endpoint is unaffected by the deadline')

t(
  OUTBOUND_TIMEOUT_MS >= 5000 && OUTBOUND_TIMEOUT_MS <= 8000,
  `the default ceiling sits in the 5-8s band beside safePost's 8s (${OUTBOUND_TIMEOUT_MS}ms)`,
)

dead.close()
live.close()

/* -------------------------------------------------------------------------- */
/*  Every call site is on it                                                   */
/* -------------------------------------------------------------------------- */

const BOUNDED_CALLERS = [
  'src/lib/integrations/meta-capi.ts',
  'src/lib/integrations/jornaya.ts',
  'src/lib/integrations/truecall.ts',
  'src/lib/integrations/hlr.ts',
  'src/lib/lead-pipeline/run.ts',
]

for (const file of BOUNDED_CALLERS) {
  const text = src(file)
  t(/fetchWithTimeout\(/.test(text), `${file} calls fetchWithTimeout`)
  t(
    !/[^a-zA-Z]fetch\(/.test(text.replace(/fetchWithTimeout\(/g, 'X(')),
    `${file} has no unbounded bare fetch( left on the lead path`,
  )
}

// `trustedform.ts` is bounded through a different door and must stay there: it
// posts credentials to a user-supplied URL, so it needs safePost's admission
// control, not just a deadline.
t(/safePost\(/.test(src('src/lib/integrations/trustedform.ts')), 'TrustedForm still goes through safePost (bounded AND host-guarded)')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
process.exit(0)
