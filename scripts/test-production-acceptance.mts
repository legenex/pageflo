/**
 * Production operator acceptance A-J (plus K, the contained delivery retry)
 * against app.pageflo.io.
 *
 *   pnpm test:production-acceptance
 *
 * Logs in with /home/legenex/.pageflo-admin-credentials (never printed).
 * Clicks real controls. HTTP 200 alone is not a pass.
 *
 * TWO RULES, ENFORCED IN scripts/lib/production.mts AND BY test:harness-hygiene:
 *
 *  - Every assertion carries the evidence it was decided on, and none is a
 *    literal `true`. An earlier version of this file passed step F with a
 *    hard-coded `true` and step D by clicking whichever "Publish deployment"
 *    button came first on a list that mixed Brands, which republished a live
 *    Don't Settle deployment while it was "testing" another Brand.
 *
 *  - Every side effect names its record first. A control is only clicked after
 *    `actOn()` has proved that exactly one card contains the acceptance Brand's
 *    name and the path or id this run means to change, and that it does not
 *    mention a protected Brand. Nothing here uses `.first()` on a list that can
 *    hold another Brand's row.
 *
 * SIDE EFFECTS, ALL ON THE ACCEPTANCE BRAND (`pageflo-rescue-acceptance-944138`):
 *   A  saves the Brand's General Settings (tagline, TCPA text, legal links)
 *   C  submits a NEW, clearly identified QA lead through the visitor quiz
 *   D  publishes the acceptance Brand's landing-page deployment if it is not live
 *   E  creates ONE QA advertorial + deployment the first time, reuses them after
 *   F  edits that QA advertorial's master and republishes that one deployment
 *   K  adds a webhook to an unresolvable name (no buyer), submits a second QA
 *      lead, retries its failed delivery, and REMOVES the webhook again
 * It never clones a quiz, never adds a domain, never touches another Brand.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChromium } from './lib/browser.ts'
import { ACCEPTANCE, APP, Harness, TargetError, actOn, fetchText, junkIn, login, norm, only } from './lib/production.mts'
import type { Locator, Page, Request } from 'playwright'

const EVIDENCE = path.resolve('docs/rescue-audit/evidence/closeout')
const RUN = `qa${Date.now().toString(36)}`
const H = new Harness(EVIDENCE)
const t = H.t.bind(H)

const PREVIEW = ACCEPTANCE.preview
const TCPA =
  'By checking this box, I agree that PageFlo QA may contact me by phone, text message or email about my request. ' +
  'Message and data rates may apply. Consent is not a condition of purchase.'

const ADV_TITLE = 'QA Acceptance Advertorial'
const ADV_PATH = '/adv/qa-acceptance'
const QA_WEBHOOK_NAME = 'qa-unreachable-buyer'
const QA_WEBHOOK_URL = 'https://qa-buyer.pageflo-qa.invalid/hook'

const report: Record<string, unknown> = { run: RUN, brand: ACCEPTANCE.slug, preview: PREVIEW }
let webhookAdded = false

const visibleText = async (p: Page): Promise<string> => (await p.locator('body').innerText().catch(() => '')) || ''

const browser = await launchChromium({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(25_000)

/** Select an option by its EXACT text in whichever single <select> offers it. */
const selectExact = async (scope: Page, optionText: string, what: string): Promise<void> => {
  const selects = scope.locator('select')
  const owners: number[] = []
  for (let i = 0; i < (await selects.count()); i++) {
    const opts = (await selects.nth(i).locator('option').allTextContents()).map(norm)
    if (opts.includes(optionText)) owners.push(i)
  }
  if (owners.length !== 1) throw new TargetError(`${what}: option "${optionText}" is offered by ${owners.length} selects, expected exactly one`)
  await selects.nth(owners[0]).selectOption({ label: optionText })
}

/** Select the one option whose text starts with `prefix` (Brand / domain labels carry a suffix). */
const selectStartingWith = async (scope: Page, prefix: string, what: string): Promise<string> => {
  const selects = scope.locator('select')
  const hits: Array<{ i: number; text: string }> = []
  for (let i = 0; i < (await selects.count()); i++) {
    for (const o of (await selects.nth(i).locator('option').allTextContents()).map(norm)) {
      if (o.startsWith(prefix)) hits.push({ i, text: o })
    }
  }
  if (hits.length !== 1) throw new TargetError(`${what}: ${hits.length} options start with "${prefix}", expected exactly one`)
  await selects.nth(hits[0].i).selectOption({ label: hits[0].text })
  return hits[0].text
}

/** The visitor quiz, walked to its lead form. */
const walkQuizToForm = async (p: Page, url: string): Promise<{ startQuestion: string }> => {
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForSelector('[data-quiz-root]', { timeout: 30_000 })
  const startQuestion = norm((await p.locator('[data-quiz-question]').first().textContent()) ?? '')
  for (let i = 0; i < 40; i++) {
    if (await p.locator('[data-quiz-form]').count()) return { startQuestion }
    const root = p.locator('[data-quiz-root]')
    const textarea = root.locator('textarea').first()
    if ((await textarea.count()) && !(await textarea.inputValue().catch(() => '')).trim()) {
      await textarea.fill('QA test: rear-end collision, neck and back pain, treated at ER. PageFlo production acceptance.')
    }
    const texts = root.locator('input[type="text"], input:not([type])')
    for (let k = 0; k < (await texts.count()); k++) {
      if (!(await texts.nth(k).inputValue().catch(() => '')).trim()) await texts.nth(k).fill('QA').catch(() => null)
    }
    const selects = root.locator('select')
    for (let k = 0; k < (await selects.count()); k++) {
      const sel = selects.nth(k)
      if (await sel.inputValue().catch(() => '')) continue
      const values = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v))
      const pick = values.find((v) => /^(TX|Texas|CA|NY|2020|2019|01|1)$/i.test(v)) || values[0]
      if (pick) await sel.selectOption(pick).catch(() => null)
    }
    const answers = p.locator('[data-quiz-answer]')
    if (await answers.count()) {
      await answers.first().click()
    } else {
      const next = p.getByRole('button', { name: /Next|Continue/i })
      if (await next.count()) await next.first().click({ force: true }).catch(() => null)
    }
    await p.waitForTimeout(700)
  }
  throw new TargetError(`the quiz at ${url} did not reach its lead form in 40 steps`)
}

/** Fill and submit the lead form the way a visitor does, consent included. */
const submitQaLead = async (p: Page, label: string, tag: string): Promise<{ leadId: string; email: string; disclosure: string }> => {
  const email = `pageflo-qa-${tag}@legenex.test`
  const phone = '5550100199'
  const fill = async (sel: string, value: string) => {
    const loc = p.locator(sel)
    if (await loc.count()) await loc.first().fill(value)
  }
  await fill('input[name="first_name"]', 'PageFlo')
  await fill('input[name="last_name"]', `QA ${tag}`)
  await fill('input[name="email"]', email)
  await fill('input[name="mobile"]', phone)
  await fill('input[name="phone"]', phone)
  await fill('input[name="zip"]', '78701')

  const posts: string[] = []
  const onRequest = (r: Request) => {
    if (r.method() === 'POST' && r.url().includes('/api/leads')) posts.push(r.url())
  }
  p.on('request', onRequest)

  const box = await only(p.locator('[data-consent-checkbox]'), `${label}: the consent checkbox`)
  t((await box.isChecked()) === false, `${label}: the consent checkbox starts UNCHECKED`, `checked=${await box.isChecked()}`)
  const disclosure = norm(await p.locator('[data-consent-text]').innerText())
  t(disclosure === TCPA, `${label}: the Brand's TCPA text is displayed beside the checkbox`, `shown="${disclosure.slice(0, 70)}..."`)

  await p.locator('[data-quiz-submit]').click()
  await p.waitForTimeout(800)
  const err = p.locator('[data-consent-error]')
  t((await err.count()) === 1 && (await err.isVisible()), `${label}: submitting unchecked shows a visible validation message`, `error text="${norm(await err.innerText().catch(() => ''))}"`)
  t(posts.length === 0, `${label}: and sends nothing`, `POSTs to /api/leads before consent: ${posts.length}`)
  await H.shot(p, `k-${tag}-consent-blocked`)

  await box.check()
  const responsePromise = p.waitForResponse((r) => r.url().includes('/api/leads') && r.request().method() === 'POST', { timeout: 40_000 })
  await p.locator('[data-quiz-submit]').click()
  const res = await responsePromise
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; lead_id?: number }
  await p.waitForSelector('[data-quiz-endpoint]', { timeout: 30_000 }).catch(() => null)
  await p.waitForTimeout(1500)
  p.off('request', onRequest)
  t(res.status() === 200 && body.ok === true && typeof body.lead_id === 'number', `${label}: with consent the lead is accepted`, `HTTP ${res.status()} lead_id=${body.lead_id}`)
  t(posts.length === 1, `${label}: exactly one POST`, `POSTs: ${posts.length}`)
  t((await p.locator('[data-quiz-endpoint]').count()) > 0, `${label}: the thank-you endpoint renders`, `endpoint elements: ${await p.locator('[data-quiz-endpoint]').count()}`)
  return { leadId: String(body.lead_id), email, disclosure }
}

const openLead = async (p: Page, leadId: string): Promise<Locator> => {
  await p.goto(`${APP}/admin/leads?q=${encodeURIComponent('pageflo-qa-')}&range=all&test=1`, { waitUntil: 'networkidle' })
  const opener = p.locator(`button[aria-label="Open lead ${leadId}"]`)
  await opener.first().waitFor({ timeout: 30_000 })
  await opener.first().click()
  const dialog = p.locator('[role="dialog"]')
  await dialog.waitFor({ timeout: 15_000 })
  return dialog
}

/** Poll a lead's delivery panel until `done(state)`; reopens the lead each round. */
const awaitDelivery = async (p: Page, leadId: string, done: (state: string) => boolean): Promise<{ state: string; dialog: Locator }> => {
  let dialog = await openLead(p, leadId)
  await dialog.getByRole('button', { name: 'Delivery Log' }).click()
  let state = ''
  for (let i = 0; i < 20; i++) {
    state = (await dialog.locator('[data-lead-delivery-panel]').first().getAttribute('data-lead-delivery-panel')) ?? ''
    if (done(state)) break
    await p.waitForTimeout(3000)
    await p.keyboard.press('Escape')
    dialog = await openLead(p, leadId)
    await dialog.getByRole('button', { name: 'Delivery Log' }).click()
  }
  return { state, dialog }
}

try {
  /* ------------------------------------------------------------------ A AUTH + BRAND */
  await login(page)
  t(/\/admin/.test(page.url()), 'A login reaches /admin', `url=${page.url()}`)
  await H.shot(page, '02-after-login')

  await page.goto(`${APP}/admin/sites/${ACCEPTANCE.slug}/settings/general`, { waitUntil: 'networkidle' })
  await H.shot(page, '03-brand-general')
  const headingCount = await page.getByRole('heading', { name: /General Settings/i }).count()
  t(headingCount > 0, 'A Brand general settings loads for the acceptance Brand', `url=${page.url()} headings=${headingCount}`)
  const settingsText = await visibleText(page)
  const namesBrand = settingsText.includes(ACCEPTANCE.name)
  t(namesBrand, 'A and the page names the acceptance Brand, so the save cannot land elsewhere', `contains "${ACCEPTANCE.name}": ${namesBrand}`)
  if (!namesBrand) throw new TargetError('refusing to save Brand settings on a page that does not name the acceptance Brand')

  const fillIfPresent = async (sel: string, value: string): Promise<boolean> => {
    const loc = page.locator(sel)
    if ((await loc.count()) === 1) { await loc.fill(value); return true }
    return false
  }
  const tagline = `Rescue closeout ${RUN}`
  const gotTagline = await fillIfPresent('input[name="tagline"]', tagline)
  const gotTcpa = await fillIfPresent('textarea[name="tcpa_text"]', TCPA)
  await fillIfPresent('input[name="privacy_url"]', '/privacy')
  await fillIfPresent('input[name="terms_url"]', '/terms')
  await fillIfPresent('input[name="copyright"]', `(c) {{year}} ${ACCEPTANCE.name}`)
  t(gotTcpa, 'A the Brand TCPA field is present and was set', `textarea[name=tcpa_text] found=${gotTcpa}`)
  await page.getByRole('button', { name: /Save Settings/i }).click()
  await page.waitForTimeout(1800)
  await H.shot(page, '04-brand-saved')
  const savedShown = /Saved /.test(await visibleText(page))
  t(savedShown, 'A Brand settings save reports success', `page shows "Saved": ${savedShown}`)
  await page.reload({ waitUntil: 'networkidle' })
  if (gotTagline) {
    const v = await page.locator('input[name="tagline"]').inputValue()
    t(v === tagline, 'A the tagline persists after reload', `read back "${v}"`)
  }
  const tcpaBack = norm(await page.locator('textarea[name="tcpa_text"]').inputValue())
  t(tcpaBack === TCPA, 'A and so does the TCPA consent copy', `read back "${tcpaBack.slice(0, 60)}..."`)

  /* ------------------------------------------------------------------ B PREVIEW */
  const home = await fetchText(`${PREVIEW}/`)
  t(home.status === 200, 'B preview Home 200', `HTTP ${home.status}`)
  t(home.body.includes(ACCEPTANCE.name), 'B preview Home renders the Brand', `contains Brand name: ${home.body.includes(ACCEPTANCE.name)}`)
  t(junkIn(home.body).length === 0, 'B preview Home has no authoring junk', `hits: ${junkIn(home.body).join(', ') || 'none'}`)
  const legacyHome = await fetchText(`${ACCEPTANCE.legacyPreview}/`)
  t(legacyHome.status === 200, 'B legacy preview Home 200', `HTTP ${legacyHome.status}`)
  const privacy = await fetchText(`${PREVIEW}/privacy`)
  t(privacy.status === 200, 'B preview /privacy 200', `HTTP ${privacy.status}`)
  const unknown = await fetchText(`${PREVIEW}/this-path-does-not-exist-${RUN}`)
  t(unknown.status === 404, 'B an unknown path 404s', `HTTP ${unknown.status}`)
  const unknownHost = await fetchText(`https://no-such-brand-${RUN}.preview.pageflo.io/`).catch(() => ({ status: 0, body: '' }))
  t(unknownHost.status === 404 || unknownHost.status === 0, 'B an unknown Brand host fails closed', `HTTP ${unknownHost.status}`)

  /* ------------------------------------------------------------------ C QUIZ visitor + consent */
  const quizUrl = `${PREVIEW}/s/${ACCEPTANCE.slug}`
  const quizGet = await fetchText(quizUrl)
  t(quizGet.status === 200, 'C quiz URL 200', `HTTP ${quizGet.status}`)
  t(junkIn(quizGet.body).length === 0, 'C quiz URL has no authoring junk', `hits: ${junkIn(quizGet.body).join(', ') || 'none'}`)

  const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
  visitor.setDefaultTimeout(25_000)
  const utm = { utm_source: 'rescue-qa', utm_medium: 'closeout', utm_campaign: RUN }
  const { startQuestion } = await walkQuizToForm(visitor, `${quizUrl}?${new URLSearchParams(utm)}`)
  t(startQuestion.length > 0, 'C the first question is visible', `"${startQuestion.slice(0, 70)}"`)
  const graphLeak = /Injury Type12121212|\/submitted \(Qualified\)|graph/i.test(await visibleText(visitor))
  t(!graphLeak, 'C the visitor quiz shows no graph labels', `graph label leaked: ${graphLeak}`)
  await H.shot(visitor, '11-quiz-form')
  const lead1 = await submitQaLead(visitor, 'C quiz', RUN)
  await H.shot(visitor, '12-quiz-submitted')
  report.qaLeadId = lead1.leadId
  report.qaLeadEmail = lead1.email
  await visitor.context().close()

  /* ------------------------------------------------------------------ D LP: visitor, then the acceptance card only */
  const lpUrl = `${PREVIEW}/c/${ACCEPTANCE.slug}`
  const lpGet = await fetchText(lpUrl)
  t(lpGet.status === 200, 'D LP visitor URL 200', `HTTP ${lpGet.status}`)
  t(junkIn(lpGet.body).length === 0, 'D LP has no authoring junk', `hits: ${junkIn(lpGet.body).join(', ') || 'none'}`)
  const lpVisitor = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
  lpVisitor.setDefaultTimeout(25_000)
  await walkQuizToForm(lpVisitor, lpUrl)
  const lpBox = await only(lpVisitor.locator('[data-consent-checkbox]'), 'D embedded quiz consent checkbox')
  t((await lpBox.isChecked()) === false, 'D the embedded quiz starts UNCHECKED too', `checked=${await lpBox.isChecked()}`)
  const lpDisclosure = norm(await lpVisitor.locator('[data-consent-text]').innerText())
  t(lpDisclosure === lead1.disclosure, 'D and shows the identical disclosure as the standalone quiz', `"${lpDisclosure.slice(0, 60)}..."`)
  await H.shot(lpVisitor, '13-lp-embedded-quiz-form')
  await lpVisitor.context().close()

  await page.goto(`${APP}/admin/landing-pages`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(800)
  await H.shot(page, '20-lp-list')
  const lpCards = page.locator('[data-lp-deployment]').filter({ hasText: ACCEPTANCE.name }).filter({ hasText: `/c/${ACCEPTANCE.slug}` })
  await only(lpCards, 'D the acceptance Brand LP deployment card')
  const lpId = (await lpCards.getAttribute('data-lp-deployment')) ?? ''
  const lpStatus = (await lpCards.getAttribute('data-lp-deployment-status')) ?? ''
  t(lpId !== '', 'D the acceptance LP deployment is identified by id', `id=${lpId} status=${lpStatus}`)
  const lpCardText = norm(await lpCards.innerText())
  t(!/Quiz: none/i.test(lpCardText), 'D it is bound to a quiz flow', `card says "${lpCardText.match(/Quiz: [^·]+/)?.[0] ?? 'no quiz line'}"`)
  if (lpStatus !== 'live') {
    const publish = await actOn(lpCards, [ACCEPTANCE.name, `/c/${ACCEPTANCE.slug}`], (r) => r.getByRole('button', { name: 'Publish deployment' }), 'D publish the acceptance LP')
    await publish.click()
    await page.waitForFunction(
      (id) => document.querySelector(`[data-lp-deployment="${id}"]`)?.getAttribute('data-lp-deployment-status') === 'live',
      lpId,
      { timeout: 30_000 },
    ).catch(() => null)
    await H.shot(page, '23-lp-publish-clicked')
  }
  const lpNow = (await page.locator(`[data-lp-deployment="${lpId}"]`).getAttribute('data-lp-deployment-status')) ?? ''
  t(lpNow === 'live', 'D the acceptance LP deployment is live', `card ${lpId} status=${lpNow}${lpStatus !== 'live' ? ' (published this run)' : ' (already live, not touched)'}`)

  /* ------------------------------------------------------------------ E Advertorial (one QA record, reused) */
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await H.shot(page, '30-advertorials')
  let masters = page.locator('[data-adv-master]').filter({ hasText: ADV_TITLE })
  if ((await masters.count()) === 0) {
    await (await only(page.getByRole('button', { name: 'New advertorial' }), 'E the New Advertorial control')).click()
    await page.waitForTimeout(1500)
    // The editor that just opened belongs to the master this click created.
    await (await only(page.getByRole('button', { name: 'Article Settings' }), 'E Article Settings')).click()
    await page.waitForTimeout(500)
    const titleInput = await only(page.getByText('Title', { exact: true }).locator('xpath=following::input[1]'), 'E the Article Settings title field')
    await titleInput.fill(ADV_TITLE)
    await (await only(page.getByRole('button', { name: /^Save$/i }), 'E Save on the new advertorial')).click()
    await page.waitForTimeout(1800)
    const pubMaster = page.getByRole('button', { name: /^Publish$/i })
    if ((await pubMaster.count()) === 1) { await pubMaster.click(); await page.waitForTimeout(1800) }
    await H.shot(page, '32-advertorial-saved')
    await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
    masters = page.locator('[data-adv-master]').filter({ hasText: ADV_TITLE })
  }
  await only(masters, `E the QA advertorial master "${ADV_TITLE}"`)
  const masterId = (await masters.getAttribute('data-adv-master')) ?? ''
  t(masterId !== '', 'E the QA advertorial master exists and is identified', `id=${masterId}`)

  await page.getByRole('button', { name: /^Deployments$/i }).first().click()
  await page.waitForTimeout(700)
  let advDeps = page.locator('[data-adv-deployment]').filter({ hasText: ACCEPTANCE.name }).filter({ hasText: ADV_PATH })
  if ((await advDeps.count()) === 0) {
    await (await only(page.getByRole('button', { name: /New Deployment/i }), 'E the New Deployment control')).click()
    await page.waitForTimeout(1200)
    await selectExact(page, ADV_TITLE, 'E advertorial')
    const brandLabel = await selectStartingWith(page, `${ACCEPTANCE.name} - `, 'E brand')
    await page.waitForTimeout(500)
    const domainLabel = await selectStartingWith(page, `${ACCEPTANCE.slug}.preview.pageflo.io`, 'E domain')
    await page.locator('input[placeholder^="/adv/"]').fill(ADV_PATH)
    t(brandLabel.startsWith(ACCEPTANCE.name), 'E the new deployment is bound to the acceptance Brand', `brand="${brandLabel}" domain="${domainLabel}" path=${ADV_PATH}`)
    await (await only(page.getByRole('button', { name: /Create deployment/i }), 'E Create deployment')).click()
    await page.waitForTimeout(2500)
    await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /^Deployments$/i }).first().click()
    await page.waitForTimeout(700)
    advDeps = page.locator('[data-adv-deployment]').filter({ hasText: ACCEPTANCE.name }).filter({ hasText: ADV_PATH })
  }
  await only(advDeps, `E the QA advertorial deployment at ${ADV_PATH}`)
  const advDepId = (await advDeps.getAttribute('data-adv-deployment')) ?? ''
  let advStatus = (await advDeps.getAttribute('data-adv-deployment-status')) ?? ''
  if (advStatus !== 'live') {
    const publish = await actOn(advDeps, [ACCEPTANCE.name, ADV_PATH], (r) => r.getByRole('button', { name: 'Publish', exact: true }), 'E publish the QA advertorial deployment')
    await publish.click()
    await page.waitForFunction(
      (id) => document.querySelector(`[data-adv-deployment="${id}"]`)?.getAttribute('data-adv-deployment-status') === 'live',
      advDepId,
      { timeout: 30_000 },
    ).catch(() => null)
    advStatus = (await page.locator(`[data-adv-deployment="${advDepId}"]`).getAttribute('data-adv-deployment-status')) ?? ''
  }
  await H.shot(page, '35-adv-after-publish')
  t(advStatus === 'live', 'E the QA advertorial deployment is live', `deployment ${advDepId} status=${advStatus}`)
  const advLive = await fetchText(`${PREVIEW}${ADV_PATH}`)
  t(advLive.status === 200, 'E its visitor URL serves', `HTTP ${advLive.status} ${PREVIEW}${ADV_PATH}`)
  t(junkIn(advLive.body).length === 0, 'E and has no authoring junk', `hits: ${junkIn(advLive.body).join(', ') || 'none'}`)

  /* ------------------------------------------------------------------ F snapshot pin (that one deployment) */
  const MARKER = `PINTEST-${RUN}`
  t(!advLive.body.includes(MARKER), "F before the edit, live does not contain this run's marker", `marker ${MARKER} present: ${advLive.body.includes(MARKER)}`)
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  const masterCard = page.locator(`[data-adv-master="${masterId}"]`)
  const edit = await actOn(masterCard, [ADV_TITLE], (r) => r.getByRole('button', { name: 'Edit advertorial' }), 'F edit the QA advertorial master')
  await edit.click()
  await page.waitForTimeout(1500)
  if ((await page.getByPlaceholder('The $4,200 check that cost her $186,000').count()) === 0) {
    const label = page.getByText('Headline', { exact: true })
    if ((await label.count()) >= 1) await label.first().click()
    await page.waitForTimeout(400)
  }
  const headlineBox = await only(page.getByPlaceholder('The $4,200 check that cost her $186,000'), 'F the master headline field')
  await headlineBox.fill(`Snapshot after ${MARKER}`)
  await (await only(page.getByRole('button', { name: /^Save$/i }), 'F Save on the QA advertorial master')).click()
  await page.waitForTimeout(1800)
  await H.shot(page, 'snap-04-master-edited')
  const liveAfterEdit = await fetchText(`${PREVIEW}${ADV_PATH}`)
  t(liveAfterEdit.status === 200 && !liveAfterEdit.body.includes(MARKER), 'F editing the master does not change the live page (the pin holds)', `HTTP ${liveAfterEdit.status}, marker present: ${liveAfterEdit.body.includes(MARKER)}`)

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Deployments$/i }).first().click()
  await page.waitForTimeout(700)
  const depCard = page.locator(`[data-adv-deployment="${advDepId}"]`)
  const republish = await actOn(depCard, [ACCEPTANCE.name, ADV_PATH], (r) => r.getByRole('button', { name: 'Republish deployment' }), 'F republish the QA advertorial deployment')
  await republish.click()
  await page.waitForTimeout(3000)
  await H.shot(page, 'snap-05-republish')
  const liveAfterRepublish = await fetchText(`${PREVIEW}${ADV_PATH}`)
  t(liveAfterRepublish.body.includes(MARKER), 'F an explicit Republish publishes the edit', `HTTP ${liveAfterRepublish.status}, marker present: ${liveAfterRepublish.body.includes(MARKER)}`)

  /* ------------------------------------------------------------------ G domains (dialog only, nothing submitted) */
  await page.goto(`${APP}/admin/brands/domains`, { waitUntil: 'networkidle' })
  await H.shot(page, '50-domains')
  await (await only(page.getByRole('button', { name: /Add Domain/i }), 'G the Add Domain control')).click()
  await page.waitForTimeout(800)
  await H.shot(page, '51-add-domain-modal')
  const domainsText = await visibleText(page)
  const claimsServing = domainsText.includes('Serves the site AND verifies ownership')
  t(!claimsServing, 'G the DNS copy does not claim a pending host serves', `phrase present: ${claimsServing}`)
  const hostnameField = await page.getByPlaceholder('example.com').count()
  t(hostnameField === 1 && /Add Domain/.test(domainsText), 'G the Add Domain dialog offers exactly one hostname field (nothing is submitted in this run)', `hostname fields: ${hostnameField}`)
  await page.keyboard.press('Escape')

  /* ------------------------------------------------------------------ H Leads UI: the NEW QA lead */
  const dialog = await openLead(page, lead1.leadId)
  const detail = await dialog.innerText()
  await H.shot(page, '61-lead-detail')
  t(detail.includes(lead1.email) && detail.includes(`QA ${RUN}`), "H the QA lead's contact data is in the Leads UI", `email ${lead1.email} present: ${detail.includes(lead1.email)}`)
  t(detail.includes(ACCEPTANCE.name), 'H under the correct Brand', `contains "${ACCEPTANCE.name}": ${detail.includes(ACCEPTANCE.name)}`)
  t(detail.includes(`/s/${ACCEPTANCE.slug}`), 'H and the correct source path', `contains /s/${ACCEPTANCE.slug}: ${detail.includes(`/s/${ACCEPTANCE.slug}`)}`)
  const deploymentLine = detail.match(/Deployment\s*\n\s*(\S+)/i)?.[1] ?? ''
  t(deploymentLine !== '' && deploymentLine !== 'Not', 'H the collecting deployment is recorded', `deployment id "${deploymentLine}"`)
  const evidenceText = norm(await dialog.locator('[data-lead-consent-text]').innerText().catch(() => ''))
  t(evidenceText === TCPA, 'H the consent evidence is the EXACT disclosure shown to the visitor', `stored="${evidenceText.slice(0, 60)}..."`)
  const affirmative = /accepted/i.test(detail) && /unchecked box/i.test(detail)
  t(affirmative, 'H consent is recorded as an affirmative act', `mentions accepted + unchecked box: ${affirmative}`)
  const stamp = detail.match(/\b(20\d\d-\d\d-\d\dT[\d:.]+Z)\b/)?.[1] ?? ''
  t(stamp !== '' && Math.abs(Date.now() - Date.parse(stamp)) < 60 * 60_000, 'H with an accepted-at timestamp from this run', `timestamp ${stamp || 'none found'}`)
  t(/phone validation/i.test(detail), 'H and a phone validation state', `label present: ${/phone validation/i.test(detail)}`)
  await dialog.getByRole('button', { name: 'System Response' }).click()
  const sys = await dialog.innerText()
  t(sys.includes(RUN) && sys.includes('utm_source') && sys.includes('rescue-qa'), 'H UTMs and attribution are stored', `campaign ${RUN} present: ${sys.includes(RUN)}`)
  const hasAnswers = !/No answers stored/i.test(sys)
  t(hasAnswers, 'H the qualification answers are stored', `answers present: ${hasAnswers}`)
  await dialog.getByRole('button', { name: 'HLR Trace' }).click()
  const hlrPanel = dialog.locator('[data-lead-phone-state]')
  const phoneKind = (await hlrPanel.count()) ? ((await hlrPanel.first().getAttribute('data-lead-phone-state')) ?? 'missing') : 'missing'
  await H.shot(page, '62-lead-hlr')
  t(['valid', 'invalid', 'not-configured', 'provider-error'].includes(phoneKind), 'H the phone validation is an honest recorded state, not "not checked", after an attempt', `state=${phoneKind}`)
  await page.keyboard.press('Escape')
  const settled = await awaitDelivery(page, lead1.leadId, (s) => s !== '' && !['queued', 'processing', 'captured'].includes(s))
  const deliveryText = await settled.dialog.innerText()
  await H.shot(page, '63-lead-delivery')
  const hist = (re: RegExp) => re.test(deliveryText)
  t(hist(/lead\.captured/) && hist(/delivery\.queued/), 'H the queue state is in the delivery history', `captured+queued listed: ${hist(/lead\.captured/) && hist(/delivery\.queued/)}`)
  t(!hist(/queue_unavailable/), 'H the lead went through the real queue, not the inline fallback', `queue_unavailable listed: ${hist(/queue_unavailable/)}`)
  t(hist(/delivery\.processing/) && hist(/downstream\.completed/), "H and the worker's processing and completion", `processing+completed listed: ${hist(/delivery\.processing/) && hist(/downstream\.completed/)}`)
  t(settled.state === 'no-destination', 'H with no buyer configured the delivery state is "no destination", not "delivered"', `state=${settled.state}`)
  t(!hist(/retry delivery/i), 'H and no retry is offered where nothing failed', `retry control shown: ${hist(/retry delivery/i)}`)
  await page.keyboard.press('Escape')

  /* ------------------------------------------------------------------ I tenancy surface */
  await page.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
  await H.shot(page, '70-brands')
  const seesOthers = /Dont Settle|Don't Settle/i.test(await visibleText(page))
  t(seesOthers, 'I the super-admin sees the other Brands (read only in this run)', `Don't Settle listed: ${seesOthers}`)

  /* ------------------------------------------------------------------ J settings consumption */
  const homeAfter = await fetchText(`${PREVIEW}/`)
  t(homeAfter.status === 200, 'J preview Home is still 200 after the Brand save', `HTTP ${homeAfter.status}`)
  const year = String(new Date().getFullYear())
  const resolved = homeAfter.body.includes(`${year} ${ACCEPTANCE.name}`)
  t(resolved, 'J the saved copyright, with {{year}} resolved, is what the public page renders', `footer contains "${year} ${ACCEPTANCE.name}": ${resolved}`)
  t(!homeAfter.body.includes('{{year}}'), 'J and no template token reaches a visitor', `"{{year}}" present: ${homeAfter.body.includes('{{year}}')}`)

  /* ------------------------------------------------------------------ K contained delivery retry */
  await page.goto(`${APP}/admin/sites/${ACCEPTANCE.slug}/settings/tracking`, { waitUntil: 'networkidle' })
  const trackingNames = (await visibleText(page)).includes(ACCEPTANCE.name)
  t(trackingNames, 'K the tracking settings page names the acceptance Brand', `contains Brand name: ${trackingNames}`)
  if (!trackingNames) throw new TargetError('refusing to edit tracking on a page that does not name the acceptance Brand')
  const beforeWebhooks = await page.locator('input[placeholder="LeadByte"]').count()
  t(beforeWebhooks === 0, 'K the acceptance Brand has no webhook to begin with, so no real buyer can be involved', `existing webhooks: ${beforeWebhooks}`)
  if (beforeWebhooks !== 0) throw new TargetError('the acceptance Brand already has a webhook; refusing to add another or to submit a QA lead against it')
  await page.getByRole('button', { name: /Add Webhook/i }).click()
  await page.locator('input[placeholder="LeadByte"]').fill(QA_WEBHOOK_NAME)
  await page.locator('input[placeholder="https://example.com/leads"]').fill(QA_WEBHOOK_URL)
  webhookAdded = true
  await page.getByRole('button', { name: /Save All/i }).click()
  await page.waitForTimeout(2000)
  const webhookSaved = /Saved /.test(await visibleText(page))
  t(webhookSaved, 'K the unresolvable QA webhook is saved (its host is .invalid, it cannot reach anyone)', `url=${QA_WEBHOOK_URL} saved=${webhookSaved}`)

  const visitor2 = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage()
  visitor2.setDefaultTimeout(25_000)
  await walkQuizToForm(visitor2, `${quizUrl}?utm_source=rescue-qa&utm_medium=retry&utm_campaign=${RUN}`)
  const lead2 = await submitQaLead(visitor2, 'K quiz', `${RUN}-retry`)
  await visitor2.context().close()
  report.retryLeadId = lead2.leadId

  const failed = await awaitDelivery(page, lead2.leadId, (s) => s === 'failed')
  await H.shot(page, '64-lead-failed')
  t(failed.state === 'failed', "K the second QA lead's delivery failed honestly against the unresolvable name", `state=${failed.state}`)
  const retryButton = await only(failed.dialog.locator('[data-lead-retry]'), 'K the Retry control on the failed lead')
  await retryButton.click()
  await failed.dialog.locator('[data-lead-retry-note]').waitFor({ timeout: 40_000 })
  const noteKind = await failed.dialog.locator('[data-lead-retry-note]').getAttribute('data-lead-retry-note')
  const noteText = norm(await failed.dialog.locator('[data-lead-retry-note]').innerText())
  t(noteKind === 'ok' && /queued/i.test(noteText), 'K the operator gets a retry confirmation, and the retry went through the queue', `note=${noteKind}: ${noteText}`)
  let afterText = ''
  for (let i = 0; i < 20; i++) {
    const d = await openLead(page, lead2.leadId)
    await d.getByRole('button', { name: 'Delivery Log' }).click()
    afterText = await d.innerText()
    if ((afterText.match(/delivery\.processing/g) ?? []).length >= 2 && /delivery\.retry_requested/.test(afterText)) break
    await page.waitForTimeout(3000)
  }
  await H.shot(page, '65-lead-retried')
  const attempts = (afterText.match(/webhook\.qa-unreachable-buyer/g) ?? []).length
  t(/delivery\.retry_requested/.test(afterText), 'K the retry request is in the delivery history', `retry_requested listed: ${/delivery\.retry_requested/.test(afterText)}`)
  t(attempts >= 2, 'K and the second attempt sits next to the first, not over it', `attempts recorded: ${attempts}`)
  t(/lead\.captured/.test(afterText) && /delivery\.queued/.test(afterText), 'K and the original history is intact', `captured+queued listed: ${/lead\.captured/.test(afterText) && /delivery\.queued/.test(afterText)}`)
  await page.keyboard.press('Escape')
} catch (err) {
  H.fail++
  H.failures.push(`uncaught: ${err instanceof Error ? err.message : String(err)}`)
  console.log('  FAIL uncaught', err instanceof Error ? err.message : err)
  await H.shot(page, 'zz-failure')
} finally {
  // K must leave the Brand as it found it, even when the run failed half way.
  if (webhookAdded) {
    try {
      await page.goto(`${APP}/admin/sites/${ACCEPTANCE.slug}/settings/tracking`, { waitUntil: 'networkidle' })
      if ((await visibleText(page)).includes(ACCEPTANCE.name)) {
        const rows = page.locator('li').filter({ has: page.locator(`input[value="${QA_WEBHOOK_NAME}"]`) })
        if ((await rows.count()) === 1) {
          await rows.locator('button[aria-label="Remove"]').click()
          await page.getByRole('button', { name: /Save All/i }).click()
          await page.waitForTimeout(2000)
        }
        const left = await page.locator('input[placeholder="LeadByte"]').count()
        t(left === 0, 'K the QA webhook is removed again; the Brand is as it was found', `webhooks remaining: ${left}`)
      }
    } catch (e) {
      H.fail++
      H.failures.push(`cleanup of the QA webhook failed: ${e instanceof Error ? e.message : String(e)}. Remove "${QA_WEBHOOK_NAME}" from ${ACCEPTANCE.slug} tracking settings.`)
      console.log('  FAIL cleanup of the QA webhook failed; remove it by hand')
    }
  }
  await browser.close()
}

report.pass = H.pass
report.fail = H.fail
report.failures = H.failures
report.assertions = H.evidence
writeFileSync(path.join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n${H.pass} passed, ${H.fail} failed  run=${RUN}  qa lead=${String(report.qaLeadId ?? 'none')} retry lead=${String(report.retryLeadId ?? 'none')}`)
if (H.fail > 0) process.exit(1)
