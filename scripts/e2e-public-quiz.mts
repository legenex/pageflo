/**
 * Drive a LIVE public landing page's embedded quiz to completion in a real
 * browser, and prove exactly one lead was created.
 *
 *   pnpm tsx scripts/e2e-public-quiz.mts --url https://host/path
 *   pnpm tsx scripts/e2e-public-quiz.mts --url ... --keep-open   # leave the browser up
 *
 * WHY A BROWSER. Every cheaper proof answers a different question. POSTing
 * `/api/leads` directly proves the pipeline accepts a payload; it cannot prove
 * the page mounted, that the quiz resolved its template, that routing reached a
 * form, or that the form the RUNTIME renders sends what the pipeline expects.
 * Those are exactly the seams that broke: a landing page served with no form on
 * it converts at zero and nothing in the funnel reports that as an error.
 *
 * WHAT IT ASSERTS
 *   1. the page responds and mounts a quiz (`[data-quiz-root]`)
 *   2. the flow can be walked from the first question to an endpoint
 *   3. no reference placeholder text is anywhere on the live page
 *   4. exactly ONE lead exists afterwards that did not exist before
 *
 * The lead count is read by the CALLER (it needs the database); this script
 * prints a machine-readable summary line so a harness can pair them.
 *
 * It is deliberately generic about the flow. It does not encode quiz 5's
 * questions, because a proof that only works for one authored graph stops being
 * a gate the moment somebody edits it. It reads `data-quiz-node-type` and acts
 * on the KIND of step in front of it.
 */
import { type Browser, type Page } from 'playwright'
import { launchChromium, browserProvenance } from './lib/browser.ts'

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const url = arg('url')
const keepOpen = process.argv.includes('--keep-open')
const maxSteps = Number(arg('max-steps') ?? 40)
if (!url) {
  console.error('usage: pnpm tsx scripts/e2e-public-quiz.mts --url <https://host/path>')
  process.exit(2)
}

/**
 * Reference placeholders that must never reach a public page.
 *
 * Deliberately the LITERAL strings the design handoff left behind, not loose
 * tokens. An earlier version also matched `{{` and `undefined`, which fire on
 * ordinary inline script and report a leak that is not one — a gate that cries
 * wolf gets switched off.
 */
const FORBIDDEN = [
  '[CASE RESULT PLACEHOLDER]',
  '$ ———',
  'Case type · jurisdiction · year',
  '{{brand.',
  '{{site.',
  '{{deployment.',
]

const CONTACT = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: `e2e+${process.env.LEGALOS_E2E_TAG ?? 'run'}@example.com`,
  mobile: '5125550142',
  zip: '78701',
}

const log = (s: string): void => console.log(s)

const step = async (page: Page, i: number): Promise<'advanced' | 'endpoint' | 'stuck'> => {
  const root = page.locator('[data-quiz-root]')
  if ((await root.count()) === 0) return 'stuck'

  const nodeType = await page.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)
  const headline = (await page.locator('[data-quiz-headline]').first().textContent().catch(() => ''))?.trim() ?? ''
  log(`  ${String(i).padStart(2)}  ${(nodeType ?? 'unknown').padEnd(10)} ${headline.slice(0, 62)}`)

  if (nodeType === 'endpoint') return 'endpoint'

  // A FORM step: fill every field it declares, then submit. Field keys are the
  // authored `formFields[].key`, so this follows the graph rather than a fixture.
  if (nodeType === 'form') {
    for (const [key, value] of Object.entries(CONTACT)) {
      const input = page.locator(`[data-quiz-form] [name="${key}"], [data-quiz-form] #${key}`).first()
      if ((await input.count()) > 0) await input.fill(value).catch(() => {})
    }
    const submit = page.locator('[data-quiz-submit]').first()
    if ((await submit.count()) === 0) return 'stuck'
    await submit.click()
    await page.waitForTimeout(1500)
    return 'advanced'
  }

  /*
   * A free-text step. Typed as REAL KEYSTROKES, not `fill()`.
   *
   * `fill()` sets the value and fires one `input` event; a controlled React
   * field whose Next button is gated on its own state can miss that and stay
   * un-advanceable while looking filled in the DOM — which is exactly how this
   * walk dead-ended on the details step with a visibly populated textarea and
   * an enabled Next button that did nothing.
   */
  const textarea = page.locator('[data-quiz-root] textarea').first()
  if ((await textarea.count()) > 0) {
    await textarea.click().catch(() => {})
    await textarea.pressSequentially('Rear-ended at a stop light; treated at urgent care the same week.', { delay: 8 }).catch(() => {})
    await page.waitForTimeout(200)
  }

  // Dropdown / date steps render real selects. Choose the first REAL option;
  // index 0 is the "- Select -" placeholder on every one of them. Selecting is
  // itself the answer on these steps — they auto-advance and draw NO forward
  // button, so nothing further must be clicked.
  const selects = page.locator('[data-quiz-root] select')
  const selectCount = await selects.count()
  for (let s = 0; s < selectCount; s++) {
    const sel = selects.nth(s)
    const options = await sel.locator('option').count()
    if (options > 1) await sel.selectOption({ index: 1 }).catch(() => {})
  }
  /*
   * The forward button. `[data-quiz-submit]` is NOT only the lead form's submit
   * — the card uses it for every step that does not auto-advance: textarea,
   * smart_date, multi_select, text/number input. An earlier version of this
   * walk excluded it as "the form submit", so on those steps the only button it
   * could see was "← Back" and it reported a perfectly healthy flow as stuck.
   * Kept as a note because the mistake looked exactly like a product defect.
   */
  const forward = page.locator('[data-quiz-root] [data-quiz-submit]').first()
  const hasForward = (await forward.count()) > 0 && (await forward.isEnabled().catch(() => false))
  if (selectCount > 0 || (await textarea.count()) > 0) {
    if (hasForward) await forward.click().catch(() => {})
    await page.waitForTimeout(1800)
    return 'advanced'
  }

  /*
   * Then whatever advances. BACK IS EXCLUDED and that exclusion is the whole
   * reason this walk terminates: on a dropdown step the only <button> on the
   * page is "← Back", so a naive "click the first button" driver walks
   * backwards forever and reports the flow as stuck when it is not.
   */
  const answers = page.locator(
    '[data-quiz-root] [data-quiz-answer], [data-quiz-root] button:not([data-quiz-submit])',
  )
  const n = await answers.count()
  for (let a = 0; a < n; a++) {
    const btn = answers.nth(a)
    const text = ((await btn.textContent().catch(() => '')) ?? '').trim()
    if (/back|previous|start over/i.test(text)) continue
    // The FIRST non-back answer, deliberately: it is the non-DQ branch on every
    // authored node here, so the walk reaches the qualified form rather than
    // the DQ one.
    await btn.click().catch(() => {})
    // Auto-advance is ~290ms; give the webhook step room too.
    await page.waitForTimeout(1800)
    return 'advanced'
  }

  if (hasForward) {
    await forward.click().catch(() => {})
    await page.waitForTimeout(1800)
    return 'advanced'
  }
  return 'stuck'
}

const main = async (): Promise<void> => {
  log(`e2e: ${url}`)
  log(`browser: ${browserProvenance()}`)
  let browser: Browser | null = null
  try {
    browser = await launchChromium({ headless: !keepOpen })
    // The preview host serves without a verified certificate by design
    // (PREVIEW_REQUIRES_SSL is false); refusing here would test the certificate,
    // not the funnel.
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    const consoleErrors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    log(`HTTP ${resp?.status() ?? '?'}`)
    if (!resp || resp.status() >= 400) throw new Error(`page returned ${resp?.status()}`)

    await page.waitForSelector('[data-quiz-root]', { timeout: 20000 })
    log('quiz mounted')

    const body = (await page.locator('body').innerText()) ?? ''
    const leaked = FORBIDDEN.filter((f) => body.includes(f))
    log(leaked.length === 0 ? 'no placeholder text on the page' : `PLACEHOLDER LEAK: ${leaked.join(' | ')}`)

    log('walking the flow:')
    let outcome: 'advanced' | 'endpoint' | 'stuck' = 'advanced'
    let i = 0
    let lastHeadline = ''
    let repeats = 0
    for (; i < maxSteps && outcome === 'advanced'; i++) {
      outcome = await step(page, i + 1)
      const hl = ((await page.locator('[data-quiz-headline]').first().textContent().catch(() => '')) ?? '').trim()
      /*
       * A step that does not change the headline twice running is stuck, and
       * guessing why from the outside wastes a run each time. Dump what the
       * page actually offers so the next change is informed rather than
       * another hypothesis.
       */
      repeats = hl && hl === lastHeadline ? repeats + 1 : 0
      lastHeadline = hl
      if (repeats >= 2) {
        log(`  stuck on "${hl.slice(0, 60)}" — controls the page is offering:`)
        const ctrls = await page
          .locator('[data-quiz-root] input, [data-quiz-root] select, [data-quiz-root] textarea, [data-quiz-root] button, [data-quiz-root] [role="button"]')
          .all()
        for (const c of ctrls.slice(0, 20)) {
          const d = await c.evaluate((e) => ({
            tag: e.tagName.toLowerCase(),
            type: (e as HTMLInputElement).type ?? null,
            name: (e as HTMLInputElement).name || null,
            disabled: (e as HTMLButtonElement).disabled ?? null,
            text: (e.textContent ?? '').trim().slice(0, 40),
          })).catch(() => null)
          if (d) log(`     ${JSON.stringify(d)}`)
        }
        outcome = 'stuck'
      }
    }

    const endHeadline = (await page.locator('[data-quiz-headline]').first().textContent().catch(() => ''))?.trim() ?? ''
    log(`outcome: ${outcome} after ${i} step(s) — "${endHeadline.slice(0, 70)}"`)
    if (consoleErrors.length) {
      log(`console errors (${consoleErrors.length}):`)
      for (const e of consoleErrors.slice(0, 5)) log(`   ${e.slice(0, 160)}`)
    }
    log(`E2E_RESULT outcome=${outcome} steps=${i} placeholders=${leaked.length} consoleErrors=${consoleErrors.length}`)
    if (outcome !== 'endpoint') process.exitCode = 1
    if (leaked.length > 0) process.exitCode = 1
  } finally {
    if (browser && !keepOpen) await browser.close()
  }
}

await main()
