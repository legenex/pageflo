/**
 * One lead from the standalone quiz, one from the landing-page quiz, in a real
 * browser, against a real database.
 *
 *   pnpm build && pnpm test:e2e
 *
 * WHAT THIS EXISTS TO CATCH. Production measurement, 2026-08-13:
 *
 *     standalone /s/don-t-settle   button type=button  React props: YES
 *     LP-embedded /c/don-t-settle  button type=submit  React props: NO
 *     "Clicking an answer changes nothing in the DOM. Seven clicks produced
 *      zero lead POSTs."
 *
 * The quiz card on a landing page was static markup from the template's HTML
 * string. It looked exactly like the working one, and the page it was on
 * captured nothing. No unit test could see that, and no unit test can see it
 * coming back: the claim is about a click in a browser, so the instrument has to
 * be a browser.
 *
 * WHAT IS ASSERTED, ON BOTH PATHS:
 *
 *   · clicking an answer ADVANCES the quiz (the question text changes)
 *   · a conditional route is taken (answer A and answer B reach different steps)
 *   · progress moves
 *   · the lead form renders and accepts input
 *   · consent text is present on the form
 *   · the destination renders after submission
 *   · EXACTLY ONE POST to /api/leads, and EXACTLY ONE row in the database
 *   · the same runtime: identical component markers on both pages
 *
 * WHAT THIS IS NOT. It is a local proof against a local server and a local
 * database. It says nothing about production, about DNS, or about TLS, and it
 * is not evidence for any of those.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { CollectionSlug } from 'payload'

import { launchChromium, browserProvenance } from './lib/browser.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const RUN = `e2e${Date.now()}`
// Varies per run, because a killed run can leave `next start` holding a fixed
// port and the next run then reports "the production build boots" as a failure.
const PORT = Number(process.env.LEGALOS_E2E_PORT ?? 3200 + (process.pid % 500))
const ORIGIN = `http://127.0.0.1:${PORT}`
const HOST = '127.0.0.1'

/* ------------------------------------------------------------------ fixtures */
//
// A small flow with the REAL node shapes: two questions, a conditional route
// between them, a lead form and two endpoints. Small enough to drive reliably,
// and every construct on it is one the shipped MVA quiz uses.

/**
 * One answer, in the shape the runtime reads.
 *
 * `nextStepKey` and `fieldMappings` spelled out rather than abbreviated: an
 * earlier version of this file used the seed helper's `next`/`fm` shorthand,
 * which the NODE does not have, so every answer silently routed sequentially
 * and the routing assertion passed by accident.
 */
const answer = (
  label: string,
  nextStepKey: string,
  fieldMappings: Array<{ key: string; value: string }> = [],
): Record<string, unknown> => ({
  id: `a_${label.toLowerCase().replace(/\W+/g, '_')}`,
  label,
  isDQ: false,
  fieldMappings,
  nextStepKey,
  setTier: '',
})

/*
 * The step ORDER is deliberately not the answer order.
 *
 * `treated` is second and `not_treated` third, while the FIRST answer routes to
 * `not_treated` and the second to `treated`. So a runtime that ignored
 * `nextStepKey` and simply advanced would land on the wrong question, and the
 * assertion below would catch it. Routing that agrees with document order
 * proves nothing.
 */
const STEPS = [
  { key: 'injury', label: 'Injury' },
  { key: 'treated', label: 'Treated' },
  { key: 'not_treated', label: 'Not treated' },
  { key: 'form', label: 'Lead form' },
  { key: 'done', label: 'Done' },
]

const NODES = [
  {
    id: 'n_injury', stepKey: 'injury', tiers: [], type: 'question', fieldName: 'injury_type',
    questionType: 'button_grid', isVisible: true,
    headline: 'Were you injured?', question: 'HOW WERE YOU INJURED',
    subheadline: 'Select what happened',
    answers: [
      // Two answers, two destinations, NEITHER of them the sequential next step
      // for the first one. This is the conditional-routing assertion.
      answer('I was treated by a doctor', 'not_treated', [{ key: 'injury_type', value: 'treated' }]),
      answer('I was not treated', 'treated', [{ key: 'injury_type', value: 'none' }]),
    ],
    enterScript: '', exitScript: '',
  },
  {
    id: 'n_treated', stepKey: 'treated', tiers: [], type: 'question', fieldName: 'fault',
    questionType: 'single_select', isVisible: true,
    headline: 'Second answer landed here', question: 'ROUTE BRAVO',
    subheadline: '', answers: [answer('Continue', 'form')], enterScript: '', exitScript: '',
  },
  {
    id: 'n_not_treated', stepKey: 'not_treated', tiers: [], type: 'question', fieldName: 'fault',
    questionType: 'single_select', isVisible: true,
    headline: 'First answer landed here', question: 'ROUTE ALPHA',
    subheadline: '', answers: [answer('Continue', 'form')], enterScript: '', exitScript: '',
  },
  {
    id: 'n_form', stepKey: 'form', tiers: [], type: 'form', fieldName: 'lead_form',
    questionType: 'lead_form', isVisible: true,
    headline: 'Where should we send it?', question: 'YOUR DETAILS', subheadline: '',
    formFields: [
      { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'First Name', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Last Name', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'Email Address', required: true },
      { key: 'mobile', label: 'Cell Number', type: 'tel', placeholder: 'Cell Number', required: true },
      { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: '5 Digit Zip', required: true },
    ],
    answers: [answer('Submitted', 'done')], enterScript: '', exitScript: '',
  },
  {
    id: 'n_done', stepKey: 'done', tiers: [], type: 'endpoint', fieldName: 'submitted',
    questionType: 'qualified_result', isVisible: true,
    headline: 'Thank you, we will be in touch', question: '/submitted', subheadline: '',
    answers: [], enterScript: '', exitScript: '',
  },
]

const payload = await getPayload({ config })
const created: Array<{ collection: CollectionSlug; id: number | string }> = []
const track = <T extends { id: number | string }>(collection: string, doc: T): T => {
  created.push({ collection: collection as CollectionSlug, id: doc.id })
  return doc
}

let server: ChildProcess | null = null

const waitForServer = async (): Promise<boolean> => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${ORIGIN}/api/legalos/self-check`, { headers: { host: HOST } })
      if (res.status < 500) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

try {
  const site = track('sites', await payload.create({
    collection: 'sites',
    data: {
      name: `${RUN} brand`, slug: RUN, vertical: 'multi', status: 'active',
      default_phone: '(555) 010-0100',
      brand: { display_name: 'E2E Brand', short_name: 'E2', primary: '#0B1F3A', cta: '#0B1F3A', bg: '#ffffff', ink: '#0E1116' },
      // The consent line the form must show. A quiz that collects a phone number
      // without one is a compliance problem, not a styling one.
      legal: { tcpa_text: 'By submitting you agree to be contacted. Message and data rates may apply.', default_disclaimer: 'Not a law firm.' },
    } as never,
    overrideAccess: true,
  }))

  /*
   * The host is a unique key, and a run that is killed mid-way leaves its row
   * behind - so the NEXT run fails to create a fixture and reports it as a
   * product failure. Cleared first. `127.0.0.1` is not a host any real tenant
   * can hold, so this cannot remove somebody's data.
   */
  const stale = await payload.find({
    collection: 'domains', where: { host: { equals: HOST } }, limit: 10, depth: 0, overrideAccess: true,
  })
  for (const row of stale.docs) {
    await payload.delete({ collection: 'domains', id: row.id, overrideAccess: true }).catch(() => null)
  }

  track('domains', await payload.create({
    collection: 'domains',
    data: { site: site.id, host: HOST, primary: true, kind: 'custom', status: 'active', ssl_status: 'active' } as never,
    overrideAccess: true,
  }))

  const quiz = track('funnel-quizzes', await payload.create({
    collection: 'funnel-quizzes' as CollectionSlug,
    data: {
      name: `${RUN} flow`, slug: `${RUN}-flow`, is_published: true, is_archived: false,
      tiers: [], steps: STEPS, nodes: NODES, custom_fields: [],
    } as never,
    overrideAccess: true,
  }))

  track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments' as CollectionSlug,
    data: {
      name: `${RUN} standalone`, quiz: quiz.id, site: site.id, path: `/s/${RUN}`,
      render_mode: 'standalone', template_id: 'sq_quiz_first', status: 'live',
    } as never,
    overrideAccess: true,
  }))

  const lp = track('funnel-landing-pages', await payload.create({
    collection: 'funnel-landing-pages' as CollectionSlug,
    data: {
      name: `${RUN} lp`, slug: `${RUN}-lp`, template_id: 'quiz_first', angle: 'pain',
      is_published: true, sections: [{ type: 'hero' }],
    } as never,
    overrideAccess: true,
  }))

  track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments' as CollectionSlug,
    data: {
      name: `${RUN} lp dep`, landing_page: lp.id, site: site.id, path: `/c/${RUN}`,
      // The binding the product prefers: a FLOW, not a second published page.
      quiz: quiz.id, embedded_quiz_template_id: 'sq_quiz_first',
      content_overrides: {}, status: 'live',
    } as never,
    overrideAccess: true,
  }))

  /* ------------------------------------------------------------- the server */

  console.log(`  starting the app on ${ORIGIN}`)
  const serverLog: string[] = []
  server = spawn('pnpm', ['start'], {
    // `detached` puts the server in its own process GROUP so it can be killed
    // whole. `pnpm start` spawns `next start`, which spawns `next-server`;
    // killing only the pnpm wrapper leaves the real server holding the port
    // and its memory, and a suite run repeatedly leaves a pile of orphans
    // behind that later runs then collide with. See the identical fix in
    // scripts/test-console-walk.mts.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
  })
  server.stdout?.on('data', (c) => serverLog.push(String(c)))
  server.stderr?.on('data', (c) => serverLog.push(String(c)))

  const booted = await waitForServer()
  t(booted, `the production build boots and answers${booted ? '' : '\n' + serverLog.join('').slice(-1200)}`)
  if (!booted) throw new Error('the app did not start')

  /* ------------------------------------------------------------- the browser */

  const browser = await launchChromium()
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })

  /** Drive one URL end to end and report what happened. */
  const runFunnel = async (path: string, label: string) => {
    const page = await context.newPage()

    /*
     * The templates load their faces from Google Fonts. This environment's
     * network policy refuses outbound hosts, so that request hangs rather than
     * failing, `networkidle` never arrives, and the run becomes a coin flip
     * between "passed" and "timed out" - which is worse than a red suite,
     * because a flaky proof gets re-run until it agrees with you.
     *
     * Aborted outright, and the test waits on the RUNTIME being present instead
     * of on the network going quiet. The subject here is behaviour; typography
     * is `pnpm test:dom`'s job and it renders without a network at all.
     */
    await page.route('**://fonts.googleapis.com/**', (route) => route.abort())
    await page.route('**://fonts.gstatic.com/**', (route) => route.abort())

    const leadPosts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/leads')) leadPosts.push(req.url())
    })
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => consoleErrors.push(String(err)))

    await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' })
    // The quiz is portalled in after hydration on a landing page, so the wait is
    // for the RUNTIME rather than for a document event.
    await page.waitForSelector('[data-quiz-root]', { timeout: 20_000 })
    await page.waitForSelector('[data-quiz-answer]', { timeout: 20_000 })

    // The quiz is present AS A RUNTIME, not as a picture of one. `data-quiz-root`
    // is set by QuizRuntime itself; the static card never had it.
    const root = page.locator('[data-quiz-root]')
    t((await root.count()) === 1, `${label}: exactly one live quiz runtime is mounted`)

    const questionOne = (await page.locator('[data-quiz-question]').first().textContent()) ?? ''
    t(questionOne.trim().length > 0, `${label}: the first question renders (${questionOne.trim().slice(0, 40)})`)

    const optionsOne = page.locator('[data-quiz-answer]')
    t((await optionsOne.count()) === 2, `${label}: its two answers render as answer controls`)

    // No bracketed placeholder label anywhere on a public page.
    const bodyText = (await page.locator('body').innerText()) ?? ''
    t(!/\[[A-Z0-9 ·/_-]{3,}\]/.test(bodyText), `${label}: no placeholder label is on the page`)

    const progressAtStart = await page.locator('[data-quiz-progress]').first().getAttribute('data-quiz-progress')

    // CLICK. This is the assertion the production defect failed.
    await optionsOne.first().click()
    await page.waitForFunction(
      `document.querySelector('[data-quiz-question]')?.textContent?.trim() !== ${JSON.stringify(questionOne.trim())}`,
      { timeout: 15_000 },
    ).catch(() => null)
    const questionTwo = (await page.locator('[data-quiz-question]').first().textContent()) ?? ''
    t(questionTwo.trim() !== questionOne.trim(), `${label}: clicking an answer ADVANCES the quiz`)
    // ALPHA is the THIRD step; the sequential next is BRAVO. So this fails if the
    // runtime advances by position instead of following the answer.
    t(/ALPHA/.test(questionTwo), `${label}: and follows the answer's route rather than the step order (${questionTwo.trim()})`)

    const progress = await page.locator('[data-quiz-progress]').first().getAttribute('data-quiz-progress')
    t(progress !== null && Number(progress) > Number(progressAtStart ?? 0), `${label}: progress advanced (${progressAtStart} -> ${progress})`)

    // Back, then the OTHER answer, to the OTHER destination. One flow, two
    // routes, which is what makes it conditional rather than linear.
    await page.locator('[data-quiz-back]').first().click()
    await page.waitForFunction(
      `document.querySelector('[data-quiz-question]')?.textContent?.trim() === ${JSON.stringify(questionOne.trim())}`,
      { timeout: 15_000 },
    ).catch(() => null)
    t(
      ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim() === questionOne.trim(),
      `${label}: Back returns to the question that was asked`,
    )
    await page.locator('[data-quiz-answer]').nth(1).click()
    await page.waitForFunction(
      `document.querySelector('[data-quiz-question]')?.textContent?.trim() !== ${JSON.stringify(questionOne.trim())}`,
      { timeout: 15_000 },
    ).catch(() => null)
    const questionAlt = (await page.locator('[data-quiz-question]').first().textContent()) ?? ''
    t(/BRAVO/.test(questionAlt), `${label}: the other answer reaches the other step (${questionAlt.trim()})`)

    await page.locator('[data-quiz-answer]').first().click()
    await page.waitForSelector('[data-quiz-form]', { timeout: 15_000 }).catch(() => null)

    // The lead form.
    const form = page.locator('[data-quiz-form]')
    t((await form.count()) === 1, `${label}: the lead form renders`)
    t(
      /message and data rates/i.test((await page.locator('body').innerText()) ?? ''),
      `${label}: and the consent line is on it`,
    )

    await page.fill('input[name="first_name"]', 'Ada')
    await page.fill('input[name="last_name"]', 'Lovelace')
    await page.fill('input[name="email"]', `${label}@example.test`)
    await page.fill('input[name="mobile"]', '5550100100')
    await page.fill('input[name="zip"]', '78701')
    await page.locator('[data-quiz-submit]').click()

    // The destination.
    await page.waitForSelector('[data-quiz-endpoint]', { timeout: 15_000 }).catch(() => null)
    t((await page.locator('[data-quiz-endpoint]').count()) === 1, `${label}: the destination renders after submitting`)

    // Settle, so a late duplicate would be counted rather than missed.
    await page.waitForTimeout(2000)
    t(leadPosts.length === 1, `${label}: EXACTLY ONE POST to /api/leads (saw ${leadPosts.length})`)
    t(consoleErrors.length === 0, `${label}: and the page threw nothing${consoleErrors.length ? ` — ${consoleErrors[0].slice(0, 120)}` : ''}`)

    const markers = await page.evaluate(() => ({
      answersAreButtons: Array.from(document.querySelectorAll('[data-quiz-answer]')).every((el) => el.tagName === 'BUTTON'),
      reactMounted: Boolean(
        Object.keys(document.querySelector('[data-quiz-root]') ?? {}).some((k) => k.startsWith('__react')),
      ),
    }))

    await page.close()
    return { leadPosts: leadPosts.length, markers }
  }

  const standalone = await runFunnel(`/s/${RUN}`, 'standalone')
  const embedded = await runFunnel(`/c/${RUN}`, 'landing-page')

  /* --------------------------------------------------- the two are one thing */

  t(
    standalone.markers.reactMounted && embedded.markers.reactMounted,
    'BOTH pages mount React on the quiz root - the production symptom was that the LP one did not',
  )
  t(
    standalone.markers.answersAreButtons && embedded.markers.answersAreButtons,
    'and the answer controls are the same element on both',
  )

  /* --------------------------------------------------------- the leads exist */

  const leads = await payload.find({
    collection: 'leads',
    where: { site: { equals: site.id } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of leads.docs) created.push({ collection: 'leads', id: doc.id })

  t(leads.totalDocs === 2, `exactly two leads persisted, one per funnel (saw ${leads.totalDocs})`)
  const emails = leads.docs
    .map((d) => String((d as { contact?: { email?: unknown } }).contact?.email ?? ''))
    .sort()
  t(emails.join(',') === 'landing-page@example.test,standalone@example.test', `and one is from each path (${emails.join(', ')})`)

  const eventIds = new Set(leads.docs.map((d) => String((d as { attribution?: { event_id?: unknown } }).attribution?.event_id ?? '')))
  t(eventIds.size === 2, 'with distinct event ids, so the pixel dedupe contract is not broken by the embed')

  await context.close()
  await browser.close()
} catch (err) {
  fail++
  console.log(`  FAIL the end-to-end walk completed — ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill('SIGTERM')
    }
    await new Promise((r) => setTimeout(r, 500))
    if (!server.killed) {
      try {
        process.kill(-server.pid, 'SIGKILL')
      } catch {
        server.kill('SIGKILL')
      }
    }
  }
  for (const row of created.reverse()) {
    await payload.delete({ collection: row.collection, id: row.id, overrideAccess: true }).catch(() => null)
  }
}

console.log(`\n${pass} passed, ${fail} failed  [${browserProvenance()}]`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
process.exit(0)
