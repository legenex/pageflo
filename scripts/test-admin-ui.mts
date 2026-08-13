/**
 * The correction, proven in a browser against the running admin.
 *
 *   pnpm dev &                 # the app must be serving on :3000
 *   pnpm test:ui
 *
 * Everything else in the suite is a unit test, a source scan or a resolver
 * called directly. None of those can answer the question the correction brief
 * actually asks, which is about what an operator SEES: whether Landing Pages
 * still has two tabs, whether the template cards offer Preview and Select,
 * whether a selection survives a save and a reload.
 *
 * So this drives the real admin with a real login, clicks the real controls,
 * and reads the DOM back. It also writes the four screenshots the brief asks
 * for into `docs/screenshots/`.
 *
 * It asserts on `data-*` hooks rather than on visible text wherever a hook
 * exists, because a test that matches on copy fails when somebody improves the
 * wording and passes when somebody breaks the behaviour. The exceptions are the
 * tab labels themselves — those ARE the requirement, so they are matched as
 * text on purpose.
 */
import { chromium, type Browser, type Page } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
/*
 * `node:http`, not `fetch`.
 *
 * `Host` is a forbidden header in the fetch spec and undici drops it SILENTLY —
 * so every request went out as `Host: 127.0.0.1:3000`, resolved to the fallback
 * site, and this whole block measured the wrong pages while reporting success.
 * curl honours the header, which is how the discrepancy surfaced. A raw request
 * is the only way to ask the public router the question it actually answers.
 */
import { request as httpRequest } from 'node:http'

import { resolveTemplate } from '../src/lib/template-registry.ts'
import { asSlotted } from '../src/lib/lp-templates/index.ts'

const BASE = process.env.LEGALOS_UI_BASE ?? 'http://127.0.0.1:3000'
const EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'team@legenex.com'
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'local-dev-password-9c1f'
const SHOTS = new URL('../docs/screenshots/', import.meta.url).pathname

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

/** Visible text of everything matching a selector, trimmed. */
const texts = async (page: Page, selector: string): Promise<string[]> =>
  (await page.locator(selector).allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)

const bodyText = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ')

const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
  /*
   * A confirm dialog left open swallows every later click, so one missed step
   * reads as five unrelated timeouts somewhere else entirely. Anything still up
   * here is a step that did not finish, and it is reported rather than
   * dismissed silently.
   */
  const stray = page.locator('[data-confirm-dialog]')
  if (await stray.count()) {
    const label = await stray.first().getAttribute('aria-label')
    process.stdout.write(`  note: dismissing a confirm dialog left open — ${label}\n`)
    await stray.first().getByRole('button', { name: /cancel/i }).first().click().catch(() => {})
    await stray.first().waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  }
  /*
   * Toasts are absolutely positioned and sit over the row that produced them,
   * so the next click lands on the toast instead of the button. Waiting for it
   * to clear is the honest fix: forcing the click would dispatch an event the
   * user could not have produced, and would pass on a UI where a toast
   * permanently covers a control.
   */
  await page
    .locator('[data-toast], [role="status"], [role="alert"]')
    .first()
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => {})
}

/**
 * Wait for a list to reach a size rather than sleeping and hoping.
 *
 * A server action plus `router.refresh()` is two round trips, and a fixed delay
 * that is long enough on a warm dev server is not long enough on a cold one.
 * The first version of this file read the count too early and reported that
 * Clone had done nothing, while the row it created sat in the database.
 */
const waitForCount = async (page: Page, selector: string, expected: number): Promise<number> => {
  const deadline = Date.now() + 20_000
  let seen = await page.locator(selector).count()
  while (seen !== expected && Date.now() < deadline) {
    await page.waitForTimeout(500)
    seen = await page.locator(selector).count()
  }
  return seen
}

/**
 * Accept the app's own confirm dialog.
 *
 * Destructive actions here go through `ConfirmDialog`, not `window.confirm`, so
 * `page.on('dialog')` never fires and the modal simply stays up — swallowing
 * every later click, which is how a missing confirm step reads as five
 * unrelated timeouts.
 */
const confirmDialog = async (page: Page, button: RegExp): Promise<void> => {
  const dialog = page.locator('[data-confirm-dialog]')
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  if (!(await dialog.count())) return
  await dialog.getByRole('button', { name: button }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
}

/**
 * Open the first deployment in a list.
 *
 * The row itself is not the control — the name is a rename affordance and the
 * row carries several buttons — so this clicks whichever of Open/Edit/Configure
 * the list offers, falling back to the row.
 */
const openFirstDeployment = async (page: Page, rowSelector: string): Promise<void> => {
  const row = page.locator(rowSelector).first()
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  const open = row.getByRole('button', { name: /open|edit|configure|settings/i }).first()
  if (await open.count()) await open.click()
  else await row.click()
  await settle(page)
}

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true })
  console.log(`  shot docs/screenshots/${name}.png`)
}

const signIn = async (page: Page): Promise<void> => {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await settle(page)
}

const run = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } } as never)
  page.setDefaultTimeout(30_000)
  // A cold dev server compiles these routes on first hit and the admin bundles
  // are large. Navigation gets its own, longer budget so a slow compile reads
  // as slow rather than as a broken page.
  page.setDefaultNavigationTimeout(180_000)

  // A server exception renders as a Next error overlay rather than a failed
  // request, so a suite that only checked status codes would pass on a broken
  // page. Collected and asserted per screen.
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await signIn(page)
  t(!page.url().includes('sign-in'), 'signed in to the admin')

  /* ============================================ LANDING PAGES: the tabs */

  await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  const lpTabs = await texts(page, '[data-lp-tab]')
  const lpTabNames = lpTabs.map((s) => s.replace(/\s*\d+\s*$/, '').trim())

  t(lpTabs.length === 2, `Landing Pages has exactly two top-level tabs (found ${lpTabs.length}: ${lpTabs.join(' | ')})`)
  t(lpTabNames.some((s) => /^Templates$/i.test(s)), 'Landing Pages has a Templates tab')
  t(lpTabNames.some((s) => /^Deployments$/i.test(s)), 'Landing Pages has a Deployments tab')
  t(!lpTabNames.some((s) => /^Pages$/i.test(s)), 'the old Pages tab is GONE')

  /* -------------------------------------- the library is the real templates */

  const lpRows = await page.locator('[data-lp-template]').count()
  t(lpRows >= 12, `the Templates tab lists at least the twelve stock templates (found ${lpRows})`)

  const lpBody = await bodyText(page)
  t(!/MVA Pain First/i.test(lpBody), '"MVA Pain First" is not in the template library')
  t(!/Editorial Test/i.test(lpBody), '"Editorial Test" is not in the template library')
  t(/Editorial Investigation/i.test(lpBody), 'the real template "Editorial Investigation" is listed')
  t(/Human Recovery Story/i.test(lpBody), 'the real template "Human Recovery Story" is listed')
  t(/Case Value Dossier/i.test(lpBody), 'the real template "Case Value Dossier" is listed')

  await shot(page, 'landing-page-templates')

  /* ------------------------------------------------ per-template actions */

  /*
   * Asked by ACCESSIBLE NAME, not visible text.
   *
   * Clone and Delete are icon buttons carrying an `aria-label`, which is what
   * "offers Clone" means for a control with no glyph text — and a test that
   * demanded a visible word would be enforcing a design decision rather than
   * the requirement. `getByRole('button', {name})` matches the accessible name,
   * so it covers both treatments and would fail on an icon button with no label
   * at all, which is the case that actually matters.
   */
  const firstRow = page.locator('[data-lp-template]').first()
  const rowAction = (row: ReturnType<Page['locator']>, name: RegExp) =>
    row.getByRole('button', { name }).first()

  for (const [action, re] of [
    ['Preview', /preview/i],
    ['Edit', /edit/i],
    ['Clone', /clone/i],
    ['Delete', /delete/i],
  ] as const) {
    t((await rowAction(firstRow, re).count()) > 0, `a template row offers ${action}`)
  }
  t(
    (await rowAction(firstRow, /disable|enable/i).count()) > 0,
    'a template row offers Enable/Disable',
  )

  /*
   * Clone, then delete the clone, identified by ROW ID rather than by text.
   *
   * Filtering rows on /copy/i looked obvious and was wrong: several template
   * blurbs contain the word "copy", so the filter matched a STOCK row and the
   * suite spent three runs trying to delete the library and reporting the
   * failure three assertions downstream as an unrelated timeout. Diffing the id
   * set is exact and cannot be fooled by wording.
   */
  const rowIds = async (): Promise<string[]> =>
    (
      await page
        .locator('[data-lp-template]')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.lpTemplate ?? ''))
    ).filter(Boolean)

  const idsBefore = await rowIds()
  const beforeClone = idsBefore.length

  await rowAction(firstRow, /clone/i).click()
  const afterClone = await waitForCount(page, '[data-lp-template]', beforeClone + 1)
  t(afterClone === beforeClone + 1, `Clone adds one template (${beforeClone} -> ${afterClone})`)

  const newIds = (await rowIds()).filter((id) => !idsBefore.includes(id))
  t(newIds.length === 1, `the clone is a new row in the library (${newIds.join(',') || 'none'})`)

  const clonedRow = page.locator(`[data-lp-template="${newIds[0]}"]`)
  const cloneName = (await clonedRow.getAttribute('data-lp-template-name')) ?? ''
  t(/copy$/i.test(cloneName), `the clone is named after its source (${cloneName})`)
  t(
    (await clonedRow.getAttribute('data-lp-template-origin')) === 'clone',
    'and is recorded as a clone rather than as library stock',
  )

  /*
   * No `settle()` between the click and the confirmation. `settle()` dismisses a
   * stray dialog, which is right everywhere else and exactly wrong here: the
   * dialog this click opens is not stray, and cancelling it made the delete
   * never happen.
   */
  const dialog = page.locator('[data-confirm-dialog]')
  await rowAction(clonedRow, /delete/i).click()
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  const confirmLabel = (await dialog.first().getAttribute('aria-label')) ?? ''
  t(
    confirmLabel.includes(cloneName),
    `the delete confirmation is about the clone, not a stock template (${confirmLabel})`,
  )
  await dialog.first().getByRole('button', { name: /^delete$/i }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})

  const afterDelete = await waitForCount(page, '[data-lp-template]', beforeClone)
  t(afterDelete === beforeClone, `Delete removes an unreferenced clone (${afterDelete})`)
  t(!(await rowIds()).includes(newIds[0]), 'and the deleted row is gone from the library')

  /*
   * A STOCK template deletes differently, and the difference is the point:
   * reconcile rebuilds the library from code on every boot, so dropping the row
   * would resurrect it and the delete would look like it had silently failed.
   */
  const stockRow = page.locator('[data-lp-template][data-lp-template-origin="stock"]').first()
  const stockName = (await stockRow.getAttribute('data-lp-template-name')) ?? ''
  await rowAction(stockRow, /delete/i).click()
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  t(
    /archiv/i.test((await dialog.first().innerText()).replace(/\s+/g, ' ')),
    'deleting a STOCK template warns that it is archived rather than dropped',
  )
  await dialog.first().getByRole('button', { name: /cancel/i }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  t(
    (await page.locator(`[data-lp-template-name="${stockName}"]`).count()) === 1,
    'and cancelling leaves it in the library',
  )

  // Disable: state must be visible and must survive a reload.
  const target = page.locator('[data-lp-template]').first()
  const targetName = (await target.getAttribute('data-lp-template-name')) ?? ''
  await rowAction(target, /^disable/i).click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const disabledRow = targetName
    ? page.locator(`[data-lp-template-name="${targetName}"]`).first()
    : page.locator('[data-lp-template]').first()
  t(
    (await rowAction(disabledRow, /^enable/i).count()) > 0,
    'Disable persists across a reload (the row now offers Enable)',
  )
  await rowAction(disabledRow, /^enable/i).click()
  await settle(page)

  // Preview: opens something showing the template, and closes again.
  await rowAction(page.locator('[data-lp-template]').first(), /preview/i).click()
  await settle(page)
  t(
    (await page.locator('[data-preview-modal], [data-modal], [role="dialog"]').count()) > 0,
    'Preview opens a real rendered preview',
  )
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await settle(page)

  t(pageErrors.length === 0, `the Templates screen raised no client exception (${pageErrors.join(' | ')})`)

  /* ============================== LANDING PAGE DEPLOYMENT: General + gallery */

  await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)

  // Open an existing deployment if there is one, else create.
  if (await page.locator('[data-lp-deployment]').count()) {
    await openFirstDeployment(page, '[data-lp-deployment]')
  } else {
    await page.getByRole('button', { name: /New Deployment/i }).first().click()
    await settle(page)
  }

  const depTabs = await texts(page, '[data-deployment-tab]')
  t(depTabs.length === 3, `the LP deployment editor has three tabs (found ${depTabs.length}: ${depTabs.join(' | ')})`)
  t(depTabs.some((s) => /^General$/i.test(s)), 'LP deployment tab 1 is General (was Basics)')
  t(depTabs.some((s) => /Destination URL/i.test(s)), "LP deployment tab 2 is Destination URL's")
  t(depTabs.some((s) => /Tracking/i.test(s)), 'LP deployment tab 3 is Tracking & Pixels')
  t(!depTabs.some((s) => /Render/i.test(s)), 'Render & Embed is GONE from the LP deployment editor')
  t(!depTabs.some((s) => /Header|Footer/i.test(s)), 'Header / Footer is GONE from the LP deployment editor')
  t(!depTabs.some((s) => /Body Section/i.test(s)), 'Body Sections is GONE from the LP deployment editor')

  const genText = await bodyText(page)
  t(/Quiz Flow/i.test(genText), 'LP deployment General offers a Quiz Flow selector')
  /*
   * The brief forbids REQUIRING a standalone quiz deployment, not mentioning
   * one. A row migrated from the old binding still carries the pointer, and the
   * editor says so and offers to move it over — which is the migration fallback
   * the brief asks to preserve. What must not exist is a CONTROL that makes
   * picking one part of setting a landing page up.
   */
  const quizDepPicker = await page
    .locator('select')
    .evaluateAll((els) =>
      els.filter((e) => /quiz deployment/i.test((e as HTMLSelectElement).getAttribute('aria-label') ?? '')).length,
    )
  t(quizDepPicker === 0, 'and it offers no standalone Quiz Deployment picker')
  t(/Brand/i.test(genText), 'LP deployment General offers a Brand selector')
  t(/Domain/i.test(genText), 'LP deployment General offers a Domain')
  t(/Path/i.test(genText), 'LP deployment General offers a Path')
  t(/Status/i.test(genText), 'LP deployment General offers a Status')

  const lpGallery = page.locator('[data-template-gallery="lp"]')
  t(await lpGallery.count() > 0, 'LP deployment General shows a VISUAL landing-page template gallery')
  const lpCards = page.locator('[data-template-gallery="lp"] [data-template-card]')
  const lpCardCount = await lpCards.count()
  t(lpCardCount >= 12, `the LP gallery shows the real template library (${lpCardCount} cards)`)

  const lpCardText = await bodyText(page)
  t(!/MVA Pain First/i.test(lpCardText), 'the LP gallery does NOT offer old Page records')
  t((await lpCards.first().getByRole('button', { name: /preview/i }).count()) > 0, 'each LP template card offers Preview')
  t((await lpCards.first().getByRole('button', { name: /select/i }).count()) > 0, 'each LP template card offers Select')


  /*
   * The preview is checked by PIXELS, not by presence.
   *
   * The first version of this card mounted the template in an `<iframe srcdoc>`.
   * The iframe existed, had the right box, and its `contentDocument` reported
   * 1172px of content — so every structural assertion passed while the card
   * painted solid black. `docs/production-readiness.md` records this gallery
   * falling into the same trap once already. Counting distinct colours in a
   * screenshot of the thumbnail is the only check that would have caught it.
   */
  const thumbColours = async (card: ReturnType<Page['locator']>): Promise<number> => {
    const buf = await card.screenshot()
    const seen = new Set<number>()
    for (let i = 0; i < buf.length - 3; i += 997) seen.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2])
    return seen.size
  }
  const lpColours = await thumbColours(lpCards.first())
  t(lpColours > 8, `an LP template card actually PAINTS its preview (${lpColours} distinct samples)`)

  await shot(page, 'landing-page-deployment-general')

  // Select the SECOND card, save, reload, and prove it stuck.
  const chosen = lpCards.nth(1)
  const chosenId = await chosen.getAttribute('data-template-card')
  await chosen.getByRole('button', { name: /select/i }).first().click()
  await settle(page)
  t(
    (await chosen.getAttribute('data-selected')) === 'true',
    'selecting an LP template shows a clear selected state',
  )
  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)

  /*
   * Reload, then RE-OPEN the deployment.
   *
   * The deployment editor is client state rather than a route, so a reload
   * lands back on the list. Asserting straight after the reload measured an
   * empty page and called it a lost selection.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)
  await openFirstDeployment(page, '[data-lp-deployment]')
  const stillSelected = await page
    .locator(`[data-template-gallery="lp"] [data-template-card="${chosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(stillSelected === 'true', `the selected LP template persists after Save and reload (${chosenId})`)

  /* --------------------------------- headings on the other two LP tabs */

  for (const [id, label] of [['destinations', "Destination URL's"], ['tracking', 'Tracking & Pixels']] as const) {
    await page.locator(`[data-deployment-tab="${id}"]`).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `LP ${label} has prominent section headings (${headings.length})`)
  }

  /* ======================================= QUIZZES: templates are manageable */

  await page.goto(`${BASE}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  const quizTabs = await texts(page, '[data-quiz-tab]')
  t(quizTabs.length === 3, `Quizzes has three top-level tabs (found ${quizTabs.length}: ${quizTabs.join(' | ')})`)
  t(quizTabs.some((s) => /Flow/i.test(s)), 'Quizzes keeps a Quiz Flows tab — flows and templates are NOT merged')
  t(quizTabs.some((s) => /^Templates$/i.test(s)), 'Quizzes has a Templates tab')
  t(quizTabs.some((s) => /^Deployments$/i.test(s)), 'Quizzes has a Deployments tab')

  await page.locator('[data-quiz-tab="templates"]').first().click()
  await settle(page)

  const quizRows = await page.locator('[data-quiz-template]').count()
  t(quizRows >= 20, `the quiz Templates tab lists the twenty visual templates (found ${quizRows})`)

  const qRow = page.locator('[data-quiz-template]').first()
  for (const [action, re] of [
    ['Preview', /preview/i],
    ['Edit', /edit/i],
    ['Clone', /clone/i],
    ['Delete', /delete/i],
  ] as const) {
    t((await qRow.getByRole('button', { name: re }).count()) > 0, `a quiz template row offers ${action}`)
  }
  t(
    (await qRow.getByRole('button', { name: /disable|enable/i }).count()) > 0,
    'a quiz template row offers Enable/Disable',
  )

  await shot(page, 'quiz-templates')

  /* =============================== QUIZ DEPLOYMENT: General + gallery */

  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  if (await page.locator('[data-quiz-deployment]').count()) {
    await openFirstDeployment(page, '[data-quiz-deployment]')
  } else {
    await page.getByRole('button', { name: /New Deployment/i }).first().click()
    await settle(page)
  }

  const qDepTabs = await texts(page, '[data-deployment-tab]')
  t(qDepTabs.length === 3, `the quiz deployment editor has three tabs (found ${qDepTabs.length}: ${qDepTabs.join(' | ')})`)
  t(qDepTabs.some((s) => /^General$/i.test(s)), 'quiz deployment tab 1 is General (was Basics)')
  t(qDepTabs.some((s) => /Destination URL/i.test(s)), "quiz deployment tab 2 is Destination URL's (was Destinations)")
  t(qDepTabs.some((s) => /Tracking/i.test(s)), 'quiz deployment tab 3 is Tracking & Pixels')
  t(!qDepTabs.some((s) => /Render/i.test(s)), 'Render & Embed is GONE from the quiz deployment editor')
  t(!qDepTabs.some((s) => /Header|Footer/i.test(s)), 'Header / Footer is GONE from the quiz deployment editor')
  t(!qDepTabs.some((s) => /Body Section/i.test(s)), 'Body Sections is GONE from the quiz deployment editor')

  const qGenText = await bodyText(page)
  t(/Quiz Flow/i.test(qGenText), 'quiz deployment General offers a Quiz Flow selector')
  t(/Brand/i.test(qGenText), 'quiz deployment General offers a Brand selector')
  t(/Embed|Standalone/i.test(qGenText), 'the Embed / Standalone choice is on General, not a tab of its own')

  const qGallery = page.locator('[data-template-gallery="quiz"]')
  t(await qGallery.count() > 0, 'quiz deployment General shows a VISUAL quiz template gallery')
  const qCards = page.locator('[data-template-gallery="quiz"] [data-template-card]')
  const qCardCount = await qCards.count()
  t(qCardCount >= 20, `the quiz gallery shows the real template library (${qCardCount} cards)`)
  t((await qCards.first().getByRole('button', { name: /preview/i }).count()) > 0, 'each quiz template card offers Preview')
  t((await qCards.first().getByRole('button', { name: /select/i }).count()) > 0, 'each quiz template card offers Select')

  await shot(page, 'quiz-deployment-general')

  const qChosen = qCards.nth(2)
  const qChosenId = await qChosen.getAttribute('data-template-card')
  await qChosen.getByRole('button', { name: /select/i }).first().click()
  await settle(page)
  t((await qChosen.getAttribute('data-selected')) === 'true', 'selecting a quiz template shows a clear selected state')

  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  await openFirstDeployment(page, '[data-quiz-deployment]')
  const qStill = await page
    .locator(`[data-template-gallery="quiz"] [data-template-card="${qChosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(qStill === 'true', `the selected quiz template persists after Save and reload (${qChosenId})`)

  for (const [id, label] of [['destinations', "Destination URL's"], ['tracking', 'Tracking & Pixels']] as const) {
    await page.locator(`[data-deployment-tab="${id}"]`).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `quiz ${label} has prominent section headings (${headings.length})`)
  }

  t(pageErrors.length === 0, `no client exception across the whole run (${pageErrors.slice(0, 3).join(' | ')})`)

  /* ================================ the PUBLIC page renders the chosen template */

  /*
   * The admin can be entirely right and the visitor still get the wrong page,
   * because the admin and the public renderer are different code. So this asks
   * the public route directly, for two live deployments of the SAME brand on
   * DIFFERENT templates, and requires that they differ.
   *
   * Two templates rather than one: a single page proves only that something
   * rendered. The old fallback answered every id with the same template, and a
   * one-page check passes against it.
   */
  const publicTargets = await page.evaluate(async () => {
    const res = await fetch('/api/funnel-lp-deployments?limit=100&depth=1', { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    return (json.docs ?? []).map((d: Record<string, unknown>) => ({
      path: String(d.path ?? ''),
      status: String(d.status ?? ''),
      template: String((d.landing_page as { template_id?: string })?.template_id ?? ''),
      site: Number((d.site as { id?: number })?.id ?? 0),
      host: String((d.domain as { host?: string })?.host ?? ''),
    }))
  })

  /*
   * Fetched in NODE with a Host header, not in the page.
   *
   * The public router maps Host -> Domain -> Site, so a request to
   * 127.0.0.1 resolves to no tenant and falls through to the marketing site.
   * An earlier version of this check fetched from inside the browser, could not
   * set Host, and compared two copies of the marketing page — which differed by
   * 30 bytes and passed the "genuinely different" assertion while proving
   * nothing at all about the templates.
   */
  const fetchAs = (host: string, path: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const url = new URL(`${BASE}${path}`)
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET', headers: { Host: host } },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        },
      )
      req.on('error', reject)
      req.end()
    })

  const live = (publicTargets as Array<{ path: string; status: string; template: string; site: number; host: string }>)
    .filter((d) => d.status === 'live' && d.path && d.template && d.host)

  const byHost = new Map<string, typeof live>()
  for (const d of live) byHost.set(d.host, [...(byHost.get(d.host) ?? []), d])

  let compared = false
  for (const [host, list] of byHost) {
    const distinct = [...new Map(list.map((d) => [d.template, d])).values()]
    if (distinct.length < 2) continue
    const [one, two] = distinct

    const a = await fetchAs(host, one.path)
    const b = await fetchAs(host, two.path)

    t(a.status === 200 && b.status === 200, `both public pages serve on ${host} (${one.path} ${a.status}, ${two.path} ${b.status})`)
    t(a.body.length !== b.body.length, 'two deployments on DIFFERENT templates render genuinely different pages')

    /*
     * The assertion that actually pins renderer identity: each page must carry
     * ITS OWN template's wording and not the other's. The old fallback answered
     * every id with the same template, so a length comparison alone would not
     * have caught it — both pages would simply have been identical.
     */
    const markerFor = (slug: string): string => {
      const res = resolveTemplate('lp', slug)
      if (!res.ok || res.template.kind !== 'lp' || !res.template.template) return ''
      const slots = asSlotted(res.template.template).slots
      const headline = slots.find((x) => x.role === 'headline' && x.default.trim().length > 25)
      return (headline?.default ?? '').trim().slice(0, 60)
    }
    const markerA = markerFor(one.template)
    const markerB = markerFor(two.template)

    if (markerA && markerB && markerA !== markerB) {
      const has = (body: string, marker: string) => body.includes(marker.replace(/&/g, '&amp;'))
      t(has(a.body, markerA), `${one.path} renders ${one.template}'s own copy`)
      t(has(b.body, markerB), `${two.path} renders ${two.template}'s own copy`)
      t(!has(a.body, markerB), `${one.path} does NOT render ${two.template}'s copy`)
      t(!has(b.body, markerA), `${two.path} does NOT render ${one.template}'s copy`)
    }

    /*
     * A path belonging to another SITE must not be reachable here.
     *
     * Deliberately keyed on site rather than on host: the resolver matches
     * (site, path) on purpose, so a deployment IS reachable on every domain its
     * own Site owns — the preview host as well as the custom one. An earlier
     * version of this assertion keyed on host and failed against that documented
     * behaviour, which would have been a test asking for a regression.
     */
    const foreign = live.find((d) => d.site !== one.site)
    if (foreign) {
      const cross = await fetchAs(host, foreign.path)
      t(cross.status === 404, `another BRAND's path 404s on this host (${foreign.path} -> ${cross.status})`)
    } else {
      console.log('  note: only one brand has live deployments — cross-tenant check skipped')
    }

    compared = true
    break
  }
  if (!compared) {
    console.log('  note: no brand has two live deployments on different templates — public comparison skipped')
  }

  await page.close()
}

mkdirSync(SHOTS, { recursive: true })

/**
 * The pre-installed Chromium, when the pinned Playwright wants a different one.
 *
 * This environment ships a browser under `PLAYWRIGHT_BROWSERS_PATH` and blocks
 * the download, so a version bump in `package.json` makes Playwright look for a
 * revision that is not there. Pointing at the one that IS there beats skipping
 * the browser suite, which is the only place several of these claims can be
 * checked at all. `LEGALOS_CHROMIUM` overrides it.
 */
const CHROMIUM =
  process.env.LEGALOS_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)

const browser = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] },
)
try {
  await run(browser)
} catch (err) {
  fail++
  console.log('  FAIL suite threw: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)))
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
