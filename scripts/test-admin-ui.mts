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
import { mkdirSync } from 'node:fs'

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

  const firstRow = page.locator('[data-lp-template]').first()
  const rowText = (await firstRow.innerText()).replace(/\s+/g, ' ')
  for (const action of ['Preview', 'Edit', 'Clone', 'Delete']) {
    t(new RegExp(action, 'i').test(rowText), `a template row offers ${action}`)
  }
  t(/Disable|Enable/i.test(rowText), 'a template row offers Enable/Disable')

  // Clone: the library must grow by one and the copy must be listed.
  const beforeClone = await page.locator('[data-lp-template]').count()
  await firstRow.getByText(/^Clone$/i).first().click()
  await settle(page)
  const afterClone = await page.locator('[data-lp-template]').count()
  t(afterClone === beforeClone + 1, `Clone adds one template (${beforeClone} -> ${afterClone})`)
  t(/copy/i.test(await bodyText(page)), 'and the clone is listed')

  // Delete the clone again: an unreferenced non-stock template deletes for real.
  const clonedRow = page.locator('[data-lp-template]').filter({ hasText: /copy/i }).first()
  page.once('dialog', (d) => d.accept())
  await clonedRow.getByText(/^Delete$/i).first().click()
  await settle(page)
  t(
    (await page.locator('[data-lp-template]').count()) === beforeClone,
    'Delete removes an unreferenced clone',
  )

  // Disable: state must be visible and must survive a reload.
  const target = page.locator('[data-lp-template]').first()
  const targetName = (await target.locator('[data-lp-template-name]').first().innerText().catch(() => '')).trim()
  await target.getByText(/^Disable$/i).first().click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const disabledRow = targetName
    ? page.locator('[data-lp-template]').filter({ hasText: targetName }).first()
    : page.locator('[data-lp-template]').first()
  t(
    /Enable/i.test(await disabledRow.innerText()),
    'Disable persists across a reload (the row now offers Enable)',
  )
  await disabledRow.getByText(/^Enable$/i).first().click()
  await settle(page)

  // Preview: opens something showing the template, and closes again.
  await page.locator('[data-lp-template]').first().getByText(/^Preview$/i).first().click()
  await settle(page)
  t(
    (await page.locator('[data-preview-modal], [role="dialog"], iframe').count()) > 0,
    'Preview opens a real rendered preview',
  )
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await settle(page)

  t(pageErrors.length === 0, `the Templates screen raised no client exception (${pageErrors.join(' | ')})`)

  /* ============================== LANDING PAGE DEPLOYMENT: General + gallery */

  await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.getByText(/^Deployments$/i).first().click()
  await settle(page)

  // Open an existing deployment if there is one, else create.
  const existing = page.locator('[data-lp-deployment]').first()
  if (await existing.count()) {
    await existing.click()
  } else {
    await page.getByRole('button', { name: /New Deployment/i }).first().click()
  }
  await settle(page)

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
  t(!/Quiz Deployment/i.test(genText), 'and it does NOT ask for a standalone Quiz Deployment')
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
  const firstCardText = (await lpCards.first().innerText()).replace(/\s+/g, ' ')
  t(/Preview/i.test(firstCardText), 'each LP template card offers Preview')
  t(/Select/i.test(firstCardText), 'each LP template card offers Select')
  t(await lpCards.first().locator('iframe').count() > 0, 'each LP template card shows a real rendered preview')

  await shot(page, 'landing-page-deployment-general')

  // Select the SECOND card, save, reload, and prove it stuck.
  const chosen = lpCards.nth(1)
  const chosenId = await chosen.getAttribute('data-template-card')
  await chosen.getByText(/^Select$/i).first().click()
  await settle(page)
  t(
    (await chosen.getAttribute('data-selected')) === 'true',
    'selecting an LP template shows a clear selected state',
  )
  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const stillSelected = await page
    .locator(`[data-template-gallery="lp"] [data-template-card="${chosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(stillSelected === 'true', `the selected LP template persists after Save and reload (${chosenId})`)

  /* --------------------------------- headings on the other two LP tabs */

  for (const [tab, label] of [['Destination', "Destination URL's"], ['Tracking', 'Tracking & Pixels']] as const) {
    await page.locator('[data-deployment-tab]').filter({ hasText: new RegExp(tab, 'i') }).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `${label} has prominent section headings (${headings.length})`)
  }

  /* ======================================= QUIZZES: templates are manageable */

  await page.goto(`${BASE}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  const quizTabs = await texts(page, '[data-quiz-tab]')
  t(quizTabs.length === 3, `Quizzes has three top-level tabs (found ${quizTabs.length}: ${quizTabs.join(' | ')})`)
  t(quizTabs.some((s) => /Flow/i.test(s)), 'Quizzes keeps a Quiz Flows tab — flows and templates are NOT merged')
  t(quizTabs.some((s) => /^Templates$/i.test(s)), 'Quizzes has a Templates tab')
  t(quizTabs.some((s) => /^Deployments$/i.test(s)), 'Quizzes has a Deployments tab')

  await page.locator('[data-quiz-tab]').filter({ hasText: /^Templates$/i }).first().click()
  await settle(page)

  const quizRows = await page.locator('[data-quiz-template]').count()
  t(quizRows >= 20, `the quiz Templates tab lists the twenty visual templates (found ${quizRows})`)

  const qRowText = (await page.locator('[data-quiz-template]').first().innerText()).replace(/\s+/g, ' ')
  for (const action of ['Preview', 'Edit', 'Clone', 'Delete']) {
    t(new RegExp(action, 'i').test(qRowText), `a quiz template row offers ${action}`)
  }
  t(/Disable|Enable/i.test(qRowText), 'a quiz template row offers Enable/Disable')

  await shot(page, 'quiz-templates')

  /* =============================== QUIZ DEPLOYMENT: General + gallery */

  await page.locator('[data-quiz-tab]').filter({ hasText: /^Deployments$/i }).first().click()
  await settle(page)
  const qExisting = page.locator('[data-quiz-deployment]').first()
  if (await qExisting.count()) await qExisting.click()
  else await page.getByRole('button', { name: /New Deployment/i }).first().click()
  await settle(page)

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
  const qFirstCard = (await qCards.first().innerText()).replace(/\s+/g, ' ')
  t(/Preview/i.test(qFirstCard), 'each quiz template card offers Preview')
  t(/Select/i.test(qFirstCard), 'each quiz template card offers Select')

  await shot(page, 'quiz-deployment-general')

  const qChosen = qCards.nth(2)
  const qChosenId = await qChosen.getAttribute('data-template-card')
  await qChosen.getByText(/^Select$/i).first().click()
  await settle(page)
  t((await qChosen.getAttribute('data-selected')) === 'true', 'selecting a quiz template shows a clear selected state')

  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const qStill = await page
    .locator(`[data-template-gallery="quiz"] [data-template-card="${qChosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(qStill === 'true', `the selected quiz template persists after Save and reload (${qChosenId})`)

  for (const [tab, label] of [['Destination', "Destination URL's"], ['Tracking', 'Tracking & Pixels']] as const) {
    await page.locator('[data-deployment-tab]').filter({ hasText: new RegExp(tab, 'i') }).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `quiz ${label} has prominent section headings (${headings.length})`)
  }

  t(pageErrors.length === 0, `no client exception across the whole run (${pageErrors.slice(0, 3).join(' | ')})`)

  await page.close()
}

mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()
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
