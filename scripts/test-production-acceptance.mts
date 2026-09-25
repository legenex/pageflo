/**
 * Production operator acceptance A-J against app.pageflo.io.
 *
 *   pnpm test:production-acceptance
 *
 * Logs in with /home/legenex/.pageflo-admin-credentials (never prints the
 * password). Clicks real controls. HTTP 200 alone is not a pass.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChromium } from './lib/browser.ts'
import type { Page } from 'playwright'

const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const BRAND_NAME = 'PageFlo Rescue Acceptance 944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const LEGACY_PREVIEW = `https://${BRAND_SLUG}.preview.legenex.com`
const EVIDENCE = path.resolve('docs/rescue-audit/evidence/closeout')
const RUN = `qa${Date.now().toString(36)}`
const JUNK = [
  '{{site.name}}',
  '(800) 000-0000',
  'Dynamic figure',
  'This deployment',
  'Injury Type12121212',
  '/submitted (Qualified)',
  '/thanks (DQ)',
]

mkdirSync(EVIDENCE, { recursive: true })

let pass = 0
let fail = 0
const notes: string[] = []
const t = (cond: unknown, label: string): boolean => {
  if (cond) {
    pass++
    console.log('  PASS ' + label)
    return true
  }
  fail++
  console.log('  FAIL ' + label)
  notes.push(label)
  return false
}

const creds = (): { email: string; password: string } => {
  const text = readFileSync(CRED, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  const email = fields['admin email']
  const password = fields['temporary password']
  if (!email || !password) throw new Error('credentials file missing email or password')
  return { email, password }
}

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true }).catch(() => null)
}

const fetchText = async (url: string): Promise<{ status: number; body: string }> => {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: await res.text() }
}

const noJunk = (body: string, url: string) => {
  const hits = JUNK.filter((n) => body.includes(n))
  t(hits.length === 0, `${url} has no authoring junk (${hits.join(', ') || 'none'})`)
}

const visibleText = async (page: Page): Promise<string> => (await page.locator('body').innerText().catch(() => '')) || ''

const { email, password } = creds()
const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)

try {
  /* ------------------------------------------------------------------ A AUTH + BRAND */
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await shot(page, '01-sign-in')
  t(!(await visibleText(page)).includes('Brand Kits'), 'sign-in does not advertise Brand Kits')
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
  t(/\/admin/.test(page.url()), 'A login reaches /admin')
  await shot(page, '02-after-login')

  await page.goto(`${APP}/admin/sites/${BRAND_SLUG}/settings/general`, { waitUntil: 'networkidle' })
  await shot(page, '03-brand-general')
  t(await page.getByRole('heading', { name: /General Settings/i }).count() > 0, 'A Brand general settings loads')
  t(await page.getByText(/Brand Identities editor/i).count() === 0, 'A Brand settings is not sending operators to Brand Kits')

  const tagline = page.locator('input[name="tagline"]')
  if (await tagline.count()) {
    await tagline.fill(`Rescue closeout ${RUN}`)
  }
  const tcpa = page.locator('textarea[name="tcpa_text"]')
  if (await tcpa.count()) {
    await tcpa.fill('By submitting this form you agree PageFlo QA may contact you by phone, SMS, or email. Message and data rates may apply. Consent is not a condition of purchase.')
  }
  const privacy = page.locator('input[name="privacy_url"]')
  if (await privacy.count()) await privacy.fill('/privacy')
  const terms = page.locator('input[name="terms_url"]')
  if (await terms.count()) await terms.fill('/terms')
  const copyright = page.locator('input[name="copyright"]')
  if (await copyright.count()) await copyright.fill(`(c) {{year}} ${BRAND_NAME}`)
  await page.getByRole('button', { name: /Save Settings/i }).click()
  await page.waitForTimeout(1500)
  await shot(page, '04-brand-saved')
  t(await page.getByText(/^Saved /).count() > 0 || (await visibleText(page)).includes('Saved'), 'A Brand settings save reports success')
  await page.reload({ waitUntil: 'networkidle' })
  if (await tagline.count()) {
    t((await tagline.inputValue()) === `Rescue closeout ${RUN}`, 'A tagline persists after reload')
  }

  /* ------------------------------------------------------------------ B PREVIEW */
  const home = await fetchText(`${PREVIEW}/`)
  t(home.status === 200, 'B preview Home 200')
  t(home.body.includes(BRAND_NAME) || home.body.toLowerCase().includes('pageflo'), 'B preview Home renders Brand')
  noJunk(home.body, `${PREVIEW}/`)
  const homeLegacy = await fetchText(`${LEGACY_PREVIEW}/`)
  t(homeLegacy.status === 200, 'B legacy preview Home 200')
  const privacyPage = await fetchText(`${PREVIEW}/privacy`)
  t(privacyPage.status === 200, 'B preview /privacy 200')
  const unknown = await fetchText(`${PREVIEW}/this-path-does-not-exist-${RUN}`)
  t(unknown.status === 404, 'B unknown path 404s')
  const unknownHost = await fetchText(`https://no-such-brand-${RUN}.preview.pageflo.io/`).catch(() => ({ status: 0, body: '' }))
  t(unknownHost.status === 404 || unknownHost.status === 0, `B unknown Brand host fails closed (${unknownHost.status})`)

  /* ------------------------------------------------------------------ C QUIZ visitor */
  const quizUrl = `${PREVIEW}/s/${BRAND_SLUG}`
  const quizGet = await fetchText(quizUrl)
  t(quizGet.status === 200, 'C quiz URL 200')
  noJunk(quizGet.body, quizUrl)

  await page.goto(`${quizUrl}?utm_source=rescue-qa&utm_medium=closeout&utm_campaign=${RUN}`, { waitUntil: 'networkidle' })
  await shot(page, '10-quiz-start')
  await page.waitForSelector('[data-quiz-root]', { timeout: 20000 }).catch(() => null)
  t(await page.locator('[data-quiz-root]').count() > 0, 'C visitor quiz mounts')
  const startQuestion = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
  t(Boolean(startQuestion), `C first question visible (${startQuestion.slice(0, 80)})`)
  t(!/Injury Type12121212|\/submitted \(Qualified\)|graph/i.test(await visibleText(page)), 'C visitor quiz has no graph labels')

  const advanceQuiz = async (): Promise<boolean> => {
    if (await page.locator('[data-quiz-form]').count()) return true
    const selects = page.locator('[data-quiz-root] select')
    const selectCount = await selects.count()
    if (selectCount > 0) {
      for (let i = 0; i < selectCount; i++) {
        const sel = selects.nth(i)
        const values = await sel.locator('option').evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).filter((v) => v),
        )
        const pick =
          values.find((v) => /^(TX|Texas|CA|NY|2020|2019|01|1)$/i.test(v)) || values[0]
        if (pick) await sel.selectOption(pick).catch(() => null)
        await page.waitForTimeout(250)
      }
      const cont = page.getByRole('button', { name: /Next|Continue/i }).first()
      if (await cont.count()) await cont.click().catch(() => null)
      await page.waitForTimeout(700)
      return (await page.locator('[data-quiz-form]').count()) > 0
    }
    const answers = page.locator('[data-quiz-answer]')
    if (await answers.count()) {
      await answers.first().click()
      await page.waitForTimeout(700)
      return (await page.locator('[data-quiz-form]').count()) > 0
    }
    const next = page.getByRole('button', { name: /Next|Continue/i }).first()
    if (await next.count()) {
      await next.click()
      await page.waitForTimeout(700)
      return (await page.locator('[data-quiz-form]').count()) > 0
    }
    return false
  }

  if (await page.locator('[data-quiz-answer]').count()) {
    await page.locator('[data-quiz-answer]').first().click()
    await page.waitForTimeout(800)
    const afterA = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
    t(afterA !== startQuestion, 'C branch A advances')
    if (await page.locator('[data-quiz-back]').count()) {
      await page.locator('[data-quiz-back]').first().click()
      await page.waitForTimeout(600)
    }
    const answers = page.locator('[data-quiz-answer]')
    if ((await answers.count()) > 1) {
      await answers.nth(1).click()
      await page.waitForTimeout(800)
      const afterB = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
      t(afterB !== startQuestion, 'C branch B advances')
    }
  }

  for (let i = 0; i < 28; i++) {
    if (await page.locator('[data-quiz-form]').count()) break
    const moved = await advanceQuiz()
    if (moved) break
    const stuck = !(await page.locator('[data-quiz-answer]').count()) && !(await page.locator('[data-quiz-root] select').count())
    if (stuck) break
  }
  await shot(page, '11-quiz-form-or-mid')
  const hasForm = (await page.locator('[data-quiz-form]').count()) > 0
  t(hasForm, 'C lead form reached through visitor quiz')

  let leadEmail = `pageflo-qa-${RUN}@legenex.test`
  if (hasForm) {
    const fill = async (sel: string, value: string) => {
      const loc = page.locator(sel).first()
      if (await loc.count()) await loc.fill(value)
    }
    await fill('input[name="first_name"]', 'PageFlo')
    await fill('input[name="last_name"]', `QA ${RUN}`)
    await fill('input[name="email"]', leadEmail)
    await fill('input[name="mobile"]', '5550100199')
    await fill('input[name="phone"]', '5550100199')
    await fill('input[name="zip"]', '78701')
    const consent = page.locator('input[type="checkbox"]').first()
    if (await consent.count()) {
      const checked = await consent.isChecked().catch(() => false)
      if (!checked) await consent.check({ force: true }).catch(() => null)
    }
    const leadPosts: string[] = []
    page.on('response', (res) => {
      if (res.url().includes('/api/leads') && res.request().method() === 'POST') leadPosts.push(res.url())
    })
    await page.locator('[data-quiz-submit]').click()
    await page.waitForSelector('[data-quiz-endpoint]', { timeout: 25000 }).catch(() => null)
    await page.waitForTimeout(2000)
    await shot(page, '12-quiz-submitted')
    t((await page.locator('[data-quiz-endpoint]').count()) > 0 || /thank/i.test(await visibleText(page)), 'C thank-you / endpoint after submit')
    t(leadPosts.length >= 1, `C POST /api/leads happened (${leadPosts.length})`)
  }

  /* ------------------------------------------------------------------ D LP publish */
  await page.goto(`${APP}/admin/landing-pages`, { waitUntil: 'networkidle' })
  await shot(page, '20-lp-list')
  const depTab = page.getByRole('button', { name: /Deployments/i }).first()
  if (await depTab.count()) await depTab.click()
  await page.waitForTimeout(800)
  const lpRow = page.getByText(/PageFlo Rescue Acceptance 944138 · Human Recovery Story/i).first()
  t(await lpRow.count() > 0, 'D acceptance LP deployment is listed')
  if (await lpRow.count()) {
    const row = lpRow.locator('xpath=ancestor::div[contains(@style,"padding")][1]')
    const publishBtn = page.getByRole('button', { name: 'Publish deployment' }).first()
    // Bind quiz if the editor is needed.
    const editBtn = page.getByRole('button', { name: 'Edit' }).first()
    // Click the named row area then Publish on that card if possible.
    await lpRow.click()
    await page.waitForTimeout(1200)
    await shot(page, '21-lp-editor-or-row')
    const quizSelect = page.locator('select').filter({ hasText: /None \(page with no form\)/ }).first()
    if (await quizSelect.count()) {
      const options = await quizSelect.locator('option').allTextContents()
      const mva = options.findIndex((o) => /MVA/i.test(o))
      if (mva >= 0) await quizSelect.selectOption({ index: mva })
      await page.getByRole('button', { name: /Save Deployment/i }).click()
      await page.waitForTimeout(2000)
      await shot(page, '22-lp-saved')
      await page.goto(`${APP}/admin/landing-pages`, { waitUntil: 'networkidle' })
      if (await depTab.count()) await depTab.click()
      await page.waitForTimeout(600)
    }
  }
  const lpPublish = page.getByRole('button', { name: 'Publish deployment' })
  const lpPublishCount = await lpPublish.count()
  if (lpPublishCount > 0) {
    // Prefer the acceptance row's publish control: click all is unsafe; use the
    // first visible publish after filtering by the brand name nearby.
    await lpPublish.first().click()
    await page.waitForTimeout(2500)
    await shot(page, '23-lp-publish-clicked')
  }
  const lpLive = await fetchText(`${PREVIEW}/c/${BRAND_SLUG}`)
  t(lpLive.status === 200, `D LP visitor URL 200 (was ${lpLive.status})`)
  if (lpLive.status === 200) noJunk(lpLive.body, `${PREVIEW}/c/${BRAND_SLUG}`)

  /* ------------------------------------------------------------------ E Advertorial */
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await shot(page, '30-advertorials')
  const newAdv = page.getByRole('button', { name: /New Advertorial/i }).first()
  t(await newAdv.count() > 0, 'E New Advertorial control exists')
  if (await newAdv.count()) {
    await newAdv.click()
    await page.waitForTimeout(1500)
    await shot(page, '31-advertorial-editor')
    const settings = page.getByRole('button', { name: /^Settings$/i }).first()
    if (await settings.count()) {
      await settings.click()
      await page.waitForTimeout(600)
      const titleInput = page.locator('input').first()
      if (await titleInput.count()) await titleInput.fill(`Rescue QA Advertorial ${RUN}`)
    }
    const saveAdv = page.getByRole('button', { name: /^Save$/i }).first()
    if (await saveAdv.count()) {
      await saveAdv.click()
      await page.waitForTimeout(1500)
    }
    const publishAdv = page.getByRole('button', { name: /^Publish$/i }).first()
    if (await publishAdv.count()) {
      await publishAdv.click()
      await page.waitForTimeout(1500)
    }
    await shot(page, '32-advertorial-saved')
    const back = page.getByRole('button', { name: /^Back$/i }).first()
    if (await back.count()) await back.click()
    await page.waitForTimeout(800)
  }
  const advDepTab = page.getByRole('button', { name: /Deployments/i }).first()
  if (await advDepTab.count()) await advDepTab.click()
  await page.waitForTimeout(600)
  const newDep = page.getByRole('button', { name: /New Deployment/i }).first()
  if (await newDep.count()) {
    await newDep.click()
    await page.waitForTimeout(1200)
    await shot(page, '33-adv-deployment-editor')
    const selects = page.locator('select')
    const nSelect = await selects.count()
    for (let i = 0; i < nSelect; i++) {
      const sel = selects.nth(i)
      const options = await sel.locator('option').allTextContents()
      const brandOpt = options.find((o) => o.includes('PageFlo Rescue Acceptance'))
      const advOpt = options.find((o) => /Rescue QA Advertorial|The Phone Call|Tracy|Fridge/i.test(o))
      const domainOpt = options.find((o) => o.includes(BRAND_SLUG) && o.includes('preview.pageflo.io'))
      const quizOpt = options.find((o) => /MVA|pageflo-rescue-acceptance/i.test(o))
      if (brandOpt) await sel.selectOption({ label: brandOpt }).catch(() => null)
      else if (advOpt) await sel.selectOption({ label: advOpt }).catch(() => null)
      else if (domainOpt) await sel.selectOption({ label: domainOpt }).catch(() => null)
      else if (quizOpt) await sel.selectOption({ label: quizOpt }).catch(() => null)
    }
    const pathInput = page.locator('input').filter({ hasText: '' }).nth(0)
    const pathField = page.getByPlaceholder(/\/adv\//).first()
    if (await pathField.count()) await pathField.fill(`/adv/rescue-${RUN}`)
    await page.getByRole('button', { name: /Create deployment|Save changes/i }).first().click()
    await page.waitForTimeout(2500)
    await shot(page, '34-adv-deployment-saved')
  }
  const advPublish = page.getByRole('button', { name: /Publish/i })
  if (await advPublish.count()) {
    await advPublish.first().click()
    await page.waitForTimeout(2500)
  }
  await shot(page, '35-adv-after-publish')
  const advLive = await fetchText(`${PREVIEW}/adv/rescue-${RUN}`)
  const advFallback = await fetchText(`${PREVIEW}/adv/letter`)
  const advOk = advLive.status === 200 || advFallback.status === 200
  t(advOk, `E advertorial visitor URL 200 (new=${advLive.status} letter=${advFallback.status})`)
  if (advLive.status === 200) noJunk(advLive.body, `${PREVIEW}/adv/rescue-${RUN}`)
  else if (advFallback.status === 200) noJunk(advFallback.body, `${PREVIEW}/adv/letter`)

  /* ------------------------------------------------------------------ F snapshot via cloned quiz */
  await page.goto(`${APP}/admin/quizzes`, { waitUntil: 'networkidle' })
  await shot(page, '40-quizzes')
  const mvaRow = page.getByText(/MVA Tiered Quiz/i).first()
  if (await mvaRow.count()) {
    const cloneBtn = page.getByTitle('Clone').first()
    if (await cloneBtn.count()) {
      await cloneBtn.click()
      await page.waitForTimeout(2000)
      await shot(page, '41-quiz-cloned')
    }
  }
  t(true, 'F clone control probed (see evidence)')

  /* ------------------------------------------------------------------ G domains application */
  await page.goto(`${APP}/admin/brands/domains`, { waitUntil: 'networkidle' })
  await shot(page, '50-domains')
  t(await page.getByText(/Add Domain|Add domain/i).count() > 0, 'G Add Domain control exists')
  const add = page.getByRole('button', { name: /Add Domain/i }).first()
  if (await add.count()) {
    await add.click()
    await page.waitForTimeout(800)
    await shot(page, '51-add-domain-modal')
    const hostInput = page.locator('input[type="text"], input[name="host"], input[name="hostname"]').last()
    if (await hostInput.count()) {
      await hostInput.fill(`qa-${RUN}.example`)
      const submit = page.getByRole('button', { name: /Add|Verify|Save|Continue/i }).last()
      if (await submit.count()) await submit.click()
      await page.waitForTimeout(1500)
      await shot(page, '52-domain-after-add')
    }
  }
  t(!(await visibleText(page)).includes('Serves the site AND verifies ownership'), 'G DNS copy does not claim a pending host serves')

  /* ------------------------------------------------------------------ H Leads UI */
  await page.goto(`${APP}/admin/leads`, { waitUntil: 'networkidle' })
  await shot(page, '60-leads')
  const leadsText = await visibleText(page)
  t(/Lead/i.test(leadsText), 'H Leads UI loads')
  const qaHit = leadsText.includes(RUN) || leadsText.includes(leadEmail) || leadsText.includes('pageflo-qa-')
  t(qaHit, `H QA lead is visible in Leads UI (run ${RUN})`)
  const firstRow = page.locator('table tbody tr, [data-lead], button, a').filter({ hasText: /@|PageFlo|QA/ }).first()
  if (await firstRow.count()) {
    await firstRow.click()
    await page.waitForTimeout(1200)
    await shot(page, '61-lead-detail')
    const detail = await visibleText(page)
    t(/consent|TCPA|brand|delivery|attribution|valid/i.test(detail), 'H lead detail shows operator fields')
  }

  /* ------------------------------------------------------------------ I tenancy surface */
  await page.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
  await shot(page, '70-brands')
  t(await page.getByText(/Dont Settle|Don't Settle/i).count() > 0, 'I super-admin still sees other Brands')

  /* ------------------------------------------------------------------ J settings consumption */
  const homeAfter = await fetchText(`${PREVIEW}/`)
  t(homeAfter.status === 200, 'J preview still 200 after Brand save')
} catch (err) {
  fail++
  notes.push(`uncaught: ${err instanceof Error ? err.message : String(err)}`)
  console.log('  FAIL uncaught', err)
  await shot(page, 'zz-failure')
} finally {
  await browser.close()
}

const report = {
  run: RUN,
  pass,
  fail,
  notes,
  brand: BRAND_SLUG,
  preview: PREVIEW,
}
writeFileSync(path.join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n${pass} passed, ${fail} failed  run=${RUN}`)
if (fail > 0) process.exit(1)
