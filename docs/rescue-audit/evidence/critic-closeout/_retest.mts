/**
 * Critic retest after SHA d605006. Independent of builder report.json.
 * Never prints passwords. Evidence lands next to this file.
 *
 *   pnpm exec tsx docs/rescue-audit/evidence/critic-closeout/_retest.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium, browserProvenance } from '../../../../scripts/lib/browser.ts'
import type { Page, Response } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const PIN = `${PREVIEW}/adv/pinmugkkmjl`
const QUIZ = `${PREVIEW}/s/${BRAND_SLUG}`
const ISO_EMAIL = 'bugsy-iso-bugsymugkw2g5@legenex.test'
const ISO_PASSWORD = 'Isobugsymugkw2g5Qa9!'
const RUN = `critic2${Date.now().toString(36)}`

mkdirSync(HERE, { recursive: true })

const notes: string[] = []
const checks: Array<{ id: string; ok: boolean | null; detail: string }> = []
const note = (s: string) => {
  notes.push(s)
  console.log(s)
}
const rec = (id: string, ok: boolean | null, detail: string) => {
  checks.push({ id, ok, detail })
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'
  note(`${mark} [${id}] ${detail}`)
}

const creds = () => {
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

const visible = async (page: Page) => ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(HERE, `${name}.png`), fullPage: true }).catch(() => null)
  note(`SHOT ${name} ${page.url()}`)
}

const { email, password } = creds()
note(`browser=${browserProvenance()} run=${RUN} operator=${email}`)

const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)

const dqCopy = /disqualified lead is never dispatched|never dispatched|Pending-for-DQ|No delivery attempts were recorded for this lead/i

try {
  /* ------------------------------------------------------------------ HTTP: forgot, pin */
  const forgot = await fetch(`${APP}/cms/forgot`, { redirect: 'manual', cache: 'no-store' })
  const loc = forgot.headers.get('location') || ''
  rec(
    'RU-P1-018.forgot',
    forgot.status === 308 && /\/sign-in$/.test(loc),
    `/cms/forgot status=${forgot.status} location=${loc}`,
  )

  const pinRes = await fetch(PIN, { cache: 'no-store' })
  const pinBody = await pinRes.text()
  rec('pin.live', pinRes.status === 200 && pinBody.includes('PINTEST'), `status=${pinRes.status} PINTEST=${pinBody.includes('PINTEST')} title=${/Snapshot after PINTEST-pinmugkkmjl/.test(pinBody)}`)
  writeFileSync(path.join(HERE, 'pin-live.html'), pinBody.slice(0, 20000))

  /* ------------------------------------------------------------------ LOGIN */
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await shot(page, 'v2-01-sign-in')
  const signText = await visible(page)
  const signHtml = await page.content()
  rec(
    'RU-P1-018.signin',
    !/Forgot password/i.test(signText) && !signHtml.includes('/cms/forgot') && /Password reset is done by a workspace owner/i.test(signText),
    `Forgot password=${/Forgot password/i.test(signText)} cms/forgot=${signHtml.includes('/cms/forgot')} owner-copy=${/Password reset is done by a workspace owner/i.test(signText)}`,
  )
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
  rec('login', /\/admin/.test(page.url()), `url=${page.url()}`)
  await shot(page, 'v2-02-after-login')

  /* ------------------------------------------------------------------ LEAD 14 then 13 */
  await page.goto(`${APP}/admin/leads`, { waitUntil: 'networkidle' })
  await shot(page, 'v2-03-leads')
  let leadOpened: 14 | 13 | null = null
  for (const id of [14, 13] as const) {
    const btn = page.getByRole('button', { name: `Open lead ${id}` }).first()
    if ((await btn.count()) > 0) {
      await btn.click()
      await page.waitForTimeout(1200)
      leadOpened = id
      break
    }
  }
  rec('lead.open', leadOpened != null, `opened=${leadOpened}`)
  await shot(page, 'v2-04-lead-modal')
  const summary = await visible(page)
  const pendingDq = /Delivery:\s*Pending/i.test(summary) && dqCopy.test(summary)
  rec('lead.not-dq-pending', !pendingDq, `has Pending=${/Delivery:\s*Pending/i.test(summary)} dqCopy=${dqCopy.test(summary)} deliveryLabel=${(summary.match(/Delivery:\s*[A-Za-z ]+/) || ['?'])[0]}`)

  const deliveryTab = page.getByRole('button', { name: /Delivery Log/i }).first()
  if (await deliveryTab.count()) {
    await deliveryTab.click()
    await page.waitForTimeout(800)
  }
  await shot(page, 'v2-05-lead-delivery')
  const deliveryText = await visible(page)
  const hasCompleted = /downstream\.completed|Delivered|completed/i.test(deliveryText)
  const dqOnDelivery = dqCopy.test(deliveryText)
  rec(
    'RU-LEAD-DELIVERY-UI',
    hasCompleted && !dqOnDelivery,
    `lead=${leadOpened} completed=${hasCompleted} dqCopy=${dqOnDelivery} snippet=${deliveryText.slice(deliveryText.indexOf('Delivery'), deliveryText.indexOf('Delivery') + 420)}`,
  )

  /* ------------------------------------------------------------------ LP legacy binding (RU-P1-014) */
  await page.goto(`${APP}/admin/landing-pages`, { waitUntil: 'networkidle' })
  const depTab = page.getByRole('button', { name: /Deployments/i }).first()
  if (await depTab.count()) {
    await depTab.click()
    await page.waitForTimeout(900)
  }
  await shot(page, 'v2-06-lp-deployments')
  const lpText = await visible(page)
  const accSlice = lpText.includes('Rescue Acceptance') ? lpText.slice(lpText.indexOf('Rescue Acceptance'), lpText.indexOf('Rescue Acceptance') + 500) : lpText.slice(0, 400)
  rec('RU-P1-014', !/legacy binding/i.test(lpText), `legacy binding present=${/legacy binding/i.test(lpText)} acc=${accSlice}`)

  /* ------------------------------------------------------------------ isolation user */
  const isoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  isoPage.setDefaultTimeout(25000)
  await isoPage.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await isoPage.locator('input[type="email"], input[name="email"]').first().fill(ISO_EMAIL)
  await isoPage.locator('input[type="password"], input[name="password"]').first().fill(ISO_PASSWORD)
  await isoPage.locator('button[type="submit"]').first().click()
  await isoPage.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
  const isoIn = /\/admin/.test(isoPage.url())
  rec('iso.login', isoIn, `url=${isoPage.url()} user=${ISO_EMAIL}`)
  await shot(isoPage, 'v2-07-iso-login')
  if (isoIn) {
    await isoPage.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
    await shot(isoPage, 'v2-08-iso-brands')
    const isoSites = await visible(isoPage)
    const seesForeign = /Dont Settle|Don't Settle|Accident Compensation Helper|Rescue QA 20260924|Rescue Funnel|Rescue Sec|Rescue Odin/i.test(isoSites)
    const brandCountHint = (isoSites.match(/\b\d+\s+Brands?\b/i) || [''])[0]
    rec(
      'BUGSY-P0-brand-list',
      !seesForeign,
      `seesForeign=${seesForeign} hint=${brandCountHint} hasAcceptance=${/Rescue Acceptance|pageflo-rescue-acceptance/i.test(isoSites)} snippet=${isoSites.slice(0, 500)}`,
    )
  } else {
    rec('BUGSY-P0-brand-list', null, 'isolation user exists but login failed; Brands list not re-proved in browser')
  }
  await isoPage.close()

  /* ------------------------------------------------------------------ live quiz thank-you */
  const visitor = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  visitor.setDefaultTimeout(25000)
  const quizUrl = `${QUIZ}?utm_source=critic2&utm_medium=retest&utm_campaign=${RUN}`
  await visitor.goto(quizUrl, { waitUntil: 'domcontentloaded' })
  await visitor.waitForSelector('[data-quiz-root]', { timeout: 20000 }).catch(() => null)
  rec('quiz.mount', (await visitor.locator('[data-quiz-root]').count()) > 0, `url=${visitor.url()}`)
  await shot(visitor, 'v2-10-quiz-start')

  const pickSelect = async (sel: ReturnType<Page['locator']>) => {
    const disabled = await sel.isDisabled().catch(() => true)
    if (disabled) return false
    const current = await sel.inputValue().catch(() => '')
    if (current) return false
    const options = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent || '').trim() })).filter((o) => o.value),
    )
    const prefer =
      options.find((o) => /texas|^TX$|2024|March|^3$/i.test(`${o.label} ${o.value}`)) || options[0]
    if (!prefer) return false
    await sel.selectOption(prefer.value).catch(async () => {
      await sel.selectOption({ label: prefer.label }).catch(() => null)
    })
    return true
  }

  let outcome: 'form' | 'endpoint' | 'stuck' = 'stuck'
  for (let i = 0; i < 40; i++) {
    if ((await visitor.locator('[data-quiz-form]:visible').count()) > 0) {
      outcome = 'form'
      break
    }
    if ((await visitor.locator('[data-quiz-endpoint]:visible').count()) > 0) {
      outcome = 'endpoint'
      break
    }
    const year = visitor.getByLabel('Year')
    if ((await year.count()) && !(await year.isDisabled().catch(() => true))) await pickSelect(year.first())
    const month = visitor.getByLabel('Month')
    if ((await month.count()) && !(await month.isDisabled().catch(() => true))) await pickSelect(month.first())
    const textarea = visitor.locator('[data-quiz-root] textarea:visible').first()
    if (await textarea.count()) {
      const cur = await textarea.inputValue().catch(() => '')
      if (!cur.trim()) {
        await textarea.fill('Critic retest rear-end collision, neck pain, ER same day.').catch(() => null)
      }
    }
    const otherSelects = visitor.locator('[data-quiz-root] select:visible')
    const nSel = await otherSelects.count()
    for (let s = 0; s < nSel; s++) await pickSelect(visitor.locator('[data-quiz-root] select:visible').nth(s))
    const ans = visitor.locator('[data-quiz-answer]:visible')
    if (await ans.count()) {
      await ans.first().click()
      await visitor.waitForTimeout(800)
      continue
    }
    const next = visitor.getByRole('button', { name: /^(Next|Continue)/i }).or(visitor.locator('[data-quiz-submit]:visible'))
    if ((await next.count()) && (await next.first().isEnabled().catch(() => false))) {
      await next.first().click()
      await visitor.waitForTimeout(800)
      continue
    }
    await visitor.waitForTimeout(700)
  }
  rec('quiz.form', outcome === 'form', `outcome=${outcome}`)
  await shot(visitor, 'v2-11-quiz-form-or-mid')

  let leadPost: { status: number; body: string } | null = null
  visitor.on('response', async (res: Response) => {
    if (res.url().includes('/api/leads') && res.request().method() === 'POST') {
      leadPost = { status: res.status(), body: await res.text().catch(() => '') }
    }
  })

  if (outcome === 'form') {
    const fill = async (sel: string, value: string) => {
      const loc = visitor.locator(sel).first()
      if (await loc.count()) await loc.fill(value)
    }
    await fill('[data-quiz-form] input[name="first_name"], [data-quiz-form] #first_name', 'Critic')
    await fill('[data-quiz-form] input[name="last_name"], [data-quiz-form] #last_name', `Retest ${RUN}`)
    await fill('[data-quiz-form] input[name="email"], [data-quiz-form] #email', `critic2-${RUN}@legenex.test`)
    await fill('[data-quiz-form] input[name="mobile"], [data-quiz-form] input[name="phone"], [data-quiz-form] #mobile', '5125550188')
    await fill('[data-quiz-form] input[name="zip"], [data-quiz-form] #zip', '78701')
    const checks = visitor.locator('[data-quiz-form] input[type="checkbox"]')
    const nCheck = await checks.count()
    for (let i = 0; i < nCheck; i++) {
      const c = checks.nth(i)
      if (!(await c.isChecked().catch(() => false))) await c.check({ force: true }).catch(() => null)
    }
    await shot(visitor, 'v2-12-quiz-form-filled')
    await visitor.locator('[data-quiz-submit]').first().click()
    await visitor.waitForSelector('[data-quiz-endpoint]', { timeout: 25000 }).catch(() => null)
    await visitor.waitForTimeout(1500)
  }
  await shot(visitor, 'v2-13-quiz-thanks')
  const thanksText = await visible(visitor)
  const thanksHtml = await visitor.locator('[data-quiz-endpoint]').innerHTML().catch(() => '')
  const pageHtml = await visitor.content()
  const leadByteVisible = /LeadByte/i.test(thanksText) || /LeadByte/i.test(thanksHtml)
  const leadByteAnywhere = /LeadByte/i.test(pageHtml)
  rec(
    'BUGSY-quiz-LeadByte',
    !leadByteVisible,
    `visible=${leadByteVisible} inRawHtml=${leadByteAnywhere} post=${leadPost ? leadPost.status : 'none'} thanks=${thanksText.slice(0, 400)}`,
  )
  writeFileSync(path.join(HERE, 'quiz-thanks.html'), (thanksHtml || pageHtml).slice(0, 20000))
  await visitor.close()
} catch (err) {
  rec('uncaught', false, err instanceof Error ? err.message : String(err))
  await shot(page, 'v2-zz-failure')
} finally {
  await browser.close()
}

const report = { run: RUN, shaExpected: 'd605006', browser: browserProvenance(), checks, notes }
writeFileSync(path.join(HERE, 'retest.json'), JSON.stringify(report, null, 2))
const failed = checks.filter((c) => c.ok === false).length
const passed = checks.filter((c) => c.ok === true).length
note(`\n${passed} passed, ${failed} failed, ${checks.length - passed - failed} info`)
if (failed > 0) process.exit(1)
