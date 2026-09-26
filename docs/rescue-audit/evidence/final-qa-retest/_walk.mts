/**
 * Final QA retest after production SHA d605006.
 * Clicks: login, lead 14/13 Delivery Log, live quiz thank-you / hidden-in-live.
 * HTTP 200 is not a pass. Never prints passwords.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium, browserProvenance } from '../../../../scripts/lib/browser.ts'
import type { Page, Response } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const QUIZ =
  'https://pageflo-rescue-acceptance-944138.preview.pageflo.io/s/pageflo-rescue-acceptance-944138'
const RUN = `retest${Date.now().toString(36)}`
const LEAD_EMAIL = `finalqa-${RUN}@legenex.test`

mkdirSync(HERE, { recursive: true })

type Step = { id: string; ok: boolean | null; detail: string; url?: string }
const steps: Step[] = []
const notes: string[] = []
const failures: string[] = []
const consoleHits: string[] = []
let leadIdOpened: string | null = null
let newLeadId: string | null = null
let leadPost: { status: number; body: string } | null = null

const note = (s: string) => {
  notes.push(s)
  console.log(s)
}
const record = (id: string, ok: boolean | null, detail: string, url?: string) => {
  steps.push({ id, ok, detail, url })
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'
  note(`${mark} [${id}] ${detail}${url ? ` @ ${url}` : ''}`)
  if (ok === false) failures.push(`${id}: ${detail}`)
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
  const dest = path.join(HERE, `${name}.png`)
  await page.screenshot({ path: dest, fullPage: true }).catch((e) => note(`SHOT FAIL ${name} ${e}`))
  note(`SHOT ${name} ${page.url()}`)
}

const bodyText = async (page: Page): Promise<string> =>
  ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()

const waitIdle = async (page: Page, ms = 800) => {
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(ms)
}

const { email, password } = creds()
note(`browser: ${browserProvenance()}`)
note(`run=${RUN} operator=${email} sha-target=d605006`)

const browser = await launchChromium({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
const admin = await adminCtx.newPage()
const visitor = await visitorCtx.newPage()
admin.setDefaultTimeout(20000)
visitor.setDefaultTimeout(25000)
admin.on('console', (m) => {
  if (m.type() === 'error') note(`ADMIN-CONSOLE ${m.text().slice(0, 240)}`)
})
visitor.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || /502|Hidden in live|LeadByte/i.test(t)) {
    consoleHits.push(t.slice(0, 240))
    note(`VISITOR-CONSOLE ${t.slice(0, 240)}`)
  }
})
visitor.on('response', async (res: Response) => {
  if (res.url().includes('/api/leads') && res.request().method() === 'POST') {
    const status = res.status()
    const body = await res.text().catch(() => '')
    leadPost = { status, body }
    note(`LEAD POST ${status} ${body.slice(0, 400)}`)
    try {
      const json = JSON.parse(body)
      if (json.lead_id != null) newLeadId = String(json.lead_id)
    } catch {
      /* ignore */
    }
  }
})

const leakCheck = (text: string, where: string) => {
  const leadByte = /LeadByte/i.test(text)
  const capiFire = /CAPI fire here/i.test(text)
  const hidden = /Hidden in live quiz/i.test(text)
  if (leadByte || capiFire) record(`${where}.leadbyte`, false, `visible authoring leftover: ${text.slice(0, 220)}`)
  else record(`${where}.leadbyte`, true, 'no LeadByte / CAPI-fire copy in visible text')
  if (hidden) record(`${where}.hiddenLive`, false, `visible builder badge: ${text.slice(0, 220)}`)
  else record(`${where}.hiddenLive`, true, 'no Hidden-in-live badge in visible text')
  return { leadByte, capiFire, hidden }
}

try {
  /* ------------------------------------------------------------------ LOGIN */
  await admin.goto(`${APP}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitIdle(admin, 600)
  await shot(admin, '01-sign-in')
  record('login.page', /sign in/i.test(await admin.title()), `title=${await admin.title()}`, admin.url())
  await admin.locator('input[type="email"]').first().fill(email)
  await admin.locator('input[type="password"]').first().fill(password)
  await admin.locator('button[type="submit"]').first().click()
  await admin.waitForURL(/\/admin/, { timeout: 25000 })
  await waitIdle(admin, 900)
  await shot(admin, '02-after-login')
  record('login', /\/admin/.test(admin.url()), `reached ${admin.url()}`)

  /* ------------------------------------------------------------------ LEADS: prefer 14 FinalQA, else 13 */
  await admin.goto(`${APP}/admin/leads?q=FinalQA&range=24h`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1400)
  await shot(admin, '03-leads')
  let listText = await bodyText(admin)
  note(`leads list slice: ${listText.slice(0, 400)}`)

  const openNamed = (n: number) => admin.getByRole('button', { name: `Open lead ${n}` })
  let opened: number | null = null
  if ((await openNamed(14).count()) > 0) {
    await openNamed(14).first().click()
    opened = 14
  } else if (/FinalQA/i.test(listText)) {
    const row = admin.locator('table tbody tr, [role="row"]').filter({ hasText: /FinalQA/i }).first()
    const btn = row.getByRole('button', { name: /Open lead/i }).first()
    if (await btn.count()) {
      const label = ((await btn.getAttribute('aria-label')) || (await btn.innerText()) || '').trim()
      await btn.click()
      const m = label.match(/(\d+)/)
      opened = m ? Number(m[1]) : null
    }
  }
  if (opened == null) {
    await admin.goto(`${APP}/admin/leads`, { waitUntil: 'domcontentloaded' })
    await waitIdle(admin, 1200)
    await shot(admin, '03b-leads-all')
    if ((await openNamed(14).count()) > 0) {
      await openNamed(14).first().click()
      opened = 14
    } else if ((await openNamed(13).count()) > 0) {
      await openNamed(13).first().click()
      opened = 13
    }
  }
  await waitIdle(admin, 1000)
  const dialog = admin.locator('[role="dialog"]')
  const hasDialog = (await dialog.count()) > 0
  const summaryText = hasDialog ? ((await dialog.innerText()) || '') : ''
  leadIdOpened = opened != null ? String(opened) : (summaryText.match(/\b(1[234])\b/)?.[1] ?? null)
  await shot(admin, '04-lead-summary')
  writeFileSync(path.join(HERE, '04-lead-summary.txt'), summaryText)
  record(
    'leads.detail',
    hasDialog && Boolean(leadIdOpened),
    hasDialog ? `dialog opened id=${leadIdOpened} slice=${summaryText.replace(/\s+/g, ' ').slice(0, 280)}` : 'no lead detail dialog',
  )

  const deliveryHeader = (summaryText.match(/Delivery:\s*([A-Za-z ]+)/) || [])[1]?.trim() || ''
  const statusLabel = (summaryText.match(/\b(New|Contacted|Qualified|Soft DQ|Hard DQ|Sold|Archived)\b/) || [])[1] || ''
  const consentLine = (summaryText.match(/Consent[\s\S]{0,80}/) || [])[0] || ''
  note(`header delivery="${deliveryHeader}" status="${statusLabel}" consent="${consentLine.replace(/\s+/g, ' ')}"`)
  record('leads.consent', true, consentLine ? consentLine.replace(/\s+/g, ' ').slice(0, 120) : 'Consent field not visible (noted, not a fail)')

  const delTab = admin.getByRole('button', { name: /^Delivery Log$/i })
  if ((await delTab.count()) === 0) {
    record('leads.delivery.tab', false, 'Delivery Log tab missing')
  } else {
    await delTab.click()
    await waitIdle(admin, 600)
    await shot(admin, '05-lead-delivery')
    const del = ((await dialog.innerText()) || '').replace(/\s+/g, ' ').trim()
    writeFileSync(path.join(HERE, '05-lead-delivery.txt'), del)
    note(`delivery body: ${del.slice(0, 600)}`)
    const hasCompleted = /downstream\.completed/i.test(del)
    const dqEmpty =
      /disqualified lead is never dispatched/i.test(del) ||
      /disqualified lead is not dispatched/i.test(del) ||
      /A disqualified lead is never dispatched/i.test(del)
    const pendingAsDq = /Delivery:\s*Pending/i.test(del) && (dqEmpty || /No delivery attempts were recorded/i.test(del))
    record('leads.delivery.completed', hasCompleted, hasCompleted ? 'Delivery Log lists downstream.completed' : `missing downstream.completed: ${del.slice(0, 240)}`)
    record('leads.delivery.notDq', !dqEmpty, dqEmpty ? `DQ empty-state copy still shown: ${del.slice(0, 240)}` : 'no disqualified empty-state copy')
    record(
      'leads.delivery.notPendingDq',
      !pendingAsDq && !/Delivery:\s*Pending/i.test(del),
      pendingAsDq
        ? `status is pending-as-DQ: ${del.slice(0, 240)}`
        : /Delivery:\s*Pending/i.test(del)
          ? `Delivery still Pending (not DQ copy): ${del.slice(0, 240)}`
          : `Delivery header=${deliveryHeader || (del.match(/Delivery:\s*[A-Za-z ]+/) || ['?'])[0]}`,
    )
  }

  /* ------------------------------------------------------------------ QUIZ VISITOR */
  const quizUrl = `${QUIZ}?utm_source=finalqa&utm_medium=retest&utm_campaign=${RUN}`
  const res = await visitor.goto(quizUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
    note(`GOTO-ERR quiz ${e}`)
    return null
  })
  await visitor.waitForSelector('[data-quiz-root]', { timeout: 20000 }).catch(() => null)
  await waitIdle(visitor, 1200)
  await shot(visitor, '06-quiz-start')
  const startText = await bodyText(visitor)
  note(`PUBLIC ${res?.status() ?? null} ${quizUrl} body=${startText.slice(0, 280)}`)
  record('quiz.mount', (await visitor.locator('[data-quiz-root]').count()) > 0, `status=${res?.status() ?? null} node=${await visitor.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)}`, quizUrl)
  leakCheck(startText, 'quiz.start')

  const pickSelect = async (sel: ReturnType<Page['locator']>) => {
    const disabled = await sel.isDisabled().catch(() => true)
    if (disabled) return false
    const current = await sel.inputValue().catch(() => '')
    if (current) return false
    const options = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent || '').trim() })).filter((o) => o.value),
    )
    const prefer =
      options.find((o) => /texas|^TX$|2024|March|^3$/i.test(`${o.label} ${o.value}`)) ||
      options.find((o) => o.value === '2024') ||
      options[0]
    if (!prefer) return false
    await sel.selectOption(prefer.value).catch(async () => {
      await sel.selectOption({ label: prefer.label }).catch(() => null)
    })
    note(`quiz select -> ${prefer.label || prefer.value}`)
    return true
  }

  let sawHidden = false
  let sawLeadByte = false
  let walkOutcome: 'form' | 'endpoint' | 'stuck' = 'stuck'
  for (let i = 0; i < 45; i++) {
    const vis = await bodyText(visitor)
    if (/Hidden in live quiz/i.test(vis)) {
      sawHidden = true
      await shot(visitor, `07-hidden-live-${i}`)
      note(`HIDDEN LIVE at step ${i}: ${vis.slice(0, 220)}`)
    }
    if (/LeadByte|CAPI fire here/i.test(vis)) {
      sawLeadByte = true
      await shot(visitor, `07-leadbyte-${i}`)
      note(`LEADBYTE at step ${i}: ${vis.slice(0, 220)}`)
    }
    if ((await visitor.locator('[data-quiz-form]:visible').count()) > 0) {
      walkOutcome = 'form'
      break
    }
    if ((await visitor.locator('[data-quiz-endpoint]:visible').count()) > 0) {
      walkOutcome = 'endpoint'
      break
    }
    const nodeType = await visitor.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)
    const headline = ((await visitor.locator('[data-quiz-headline]:visible, [data-quiz-question]:visible').first().textContent().catch(() => '')) || '').trim()
    note(`quiz step ${i} type=${nodeType} "${headline.slice(0, 70)}"`)

    const year = visitor.getByLabel('Year')
    if ((await year.count()) && !(await year.isDisabled().catch(() => true))) {
      await pickSelect(year.first())
      await waitIdle(visitor, 350)
    }
    const month = visitor.getByLabel('Month')
    if ((await month.count()) && !(await month.isDisabled().catch(() => true))) {
      await pickSelect(month.first())
      await waitIdle(visitor, 350)
    }
    const day = visitor.getByLabel('Day')
    if ((await day.count()) && (await day.isVisible().catch(() => false)) && !(await day.isDisabled().catch(() => true))) {
      await pickSelect(day.first())
      await waitIdle(visitor, 350)
    }

    const textarea = visitor.locator('[data-quiz-root] textarea:visible').first()
    if (await textarea.count()) {
      await textarea.click().catch(() => null)
      const cur = await textarea.inputValue().catch(() => '')
      if (!cur.trim()) {
        await textarea.pressSequentially('FinalQA retest rear-end collision, neck pain, ER same day.', { delay: 4 }).catch(() => null)
      }
      await waitIdle(visitor, 200)
    }

    const otherSelects = visitor.locator('[data-quiz-root] select:visible')
    const nSel = await otherSelects.count()
    let filledSelect = false
    for (let s = 0; s < nSel; s++) {
      const did = await pickSelect(visitor.locator('[data-quiz-root] select:visible').nth(s))
      if (did) filledSelect = true
      await waitIdle(visitor, 400)
    }
    if (filledSelect) {
      await waitIdle(visitor, 500)
      continue
    }

    const ans = visitor.locator('[data-quiz-answer]:visible')
    if (await ans.count()) {
      await ans.first().click()
      await waitIdle(visitor, 900)
      continue
    }

    const next = visitor.getByRole('button', { name: /Next|Continue/i }).or(visitor.locator('[data-quiz-submit]:visible'))
    if (await next.count()) {
      const btn = next.first()
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click()
        await waitIdle(visitor, 900)
        continue
      }
    }

    const hasVisitorControls =
      (await visitor.locator('[data-quiz-form]:visible, [data-quiz-answer]:visible, [data-quiz-endpoint]:visible, [data-quiz-root] select:visible, [data-quiz-root] textarea:visible, [data-quiz-submit]:visible').count()) > 0
    if (!hasVisitorControls) {
      note(`quiz working/spinner hiddenLive=${/Hidden in live quiz/i.test(vis)}`)
      await shot(visitor, `07-quiz-working-${i}`)
      await visitor
        .waitForSelector('[data-quiz-form], [data-quiz-answer], [data-quiz-endpoint], [data-quiz-root] select, [data-quiz-submit]', { timeout: 12000 })
        .catch(() => null)
      await waitIdle(visitor, 800)
      continue
    }
    if (nSel > 0 && i < 40) {
      note(`quiz waiting on filled selects nSel=${nSel}`)
      await waitIdle(visitor, 600)
      continue
    }
    const btns = await visitor.locator('button:visible').allTextContents().catch(() => [])
    note(`quiz stuck controls buttons=${JSON.stringify(btns.slice(0, 12))}`)
    await shot(visitor, `07-quiz-stuck-${i}`)
    walkOutcome = 'stuck'
    break
  }

  await shot(visitor, '08-quiz-form-or-mid')
  record('quiz.walk', walkOutcome !== 'stuck', `walk outcome=${walkOutcome} hidden=${sawHidden} leadByte=${sawLeadByte}`)
  record('quiz.hiddenLive.during', !sawHidden, sawHidden ? 'visitor live quiz showed Hidden in live quiz' : 'no Hidden-in-live badge during walk')
  record('quiz.leadbyte.during', !sawLeadByte, sawLeadByte ? 'visitor live quiz showed LeadByte leftover' : 'no LeadByte leftover during walk')

  if (walkOutcome === 'form') {
    const fill = async (sel: string, value: string) => {
      const loc = visitor.locator(sel).first()
      if (await loc.count()) await loc.fill(value)
    }
    await fill('[data-quiz-form] input[name="first_name"], [data-quiz-form] #first_name', 'FinalQA')
    await fill('[data-quiz-form] input[name="last_name"], [data-quiz-form] #last_name', `Retest ${RUN}`)
    await fill('[data-quiz-form] input[name="email"], [data-quiz-form] #email', LEAD_EMAIL)
    await fill('[data-quiz-form] input[name="mobile"], [data-quiz-form] input[name="phone"], [data-quiz-form] #mobile, [data-quiz-form] #phone', '5125550199')
    await fill('[data-quiz-form] input[name="zip"], [data-quiz-form] #zip', '78701')
    const checks = visitor.locator('[data-quiz-form] input[type="checkbox"]')
    const nCheck = await checks.count()
    for (let i = 0; i < nCheck; i++) {
      const c = checks.nth(i)
      if (!(await c.isChecked().catch(() => false))) await c.check({ force: true }).catch(() => null)
    }
    await shot(visitor, '09-quiz-form-filled')
    await visitor.locator('[data-quiz-submit]').first().click().catch((e) => note(`CLICK-FAIL submit ${e}`))
    note('CLICKED quiz submit')
    await visitor.waitForSelector('[data-quiz-endpoint]', { timeout: 25000 }).catch(() => null)
    await waitIdle(visitor, 1800)
    await shot(visitor, '10-quiz-thankyou')
    const thanksText = await bodyText(visitor)
    writeFileSync(path.join(HERE, '10-quiz-thankyou.txt'), thanksText)
    const thanks = (await visitor.locator('[data-quiz-endpoint]').count()) > 0 || /thank/i.test(thanksText)
    record('quiz.submit', thanks && !!leadPost && leadPost.status === 200, `thanks=${thanks} post=${leadPost ? leadPost.status : 'none'} leadId=${newLeadId}`)
    leakCheck(thanksText, 'quiz.thankyou')
  } else if (walkOutcome === 'endpoint') {
    const thanksText = await bodyText(visitor)
    writeFileSync(path.join(HERE, '10-quiz-thankyou.txt'), thanksText)
    record('quiz.submit', null, 'reached endpoint without a new POST (optional submit skipped)')
    leakCheck(thanksText, 'quiz.thankyou')
  } else {
    record('quiz.submit', null, 'did not reach form; optional new lead not submitted')
    leakCheck(await bodyText(visitor), 'quiz.end')
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  record('uncaught', false, msg)
  await shot(admin, 'zz-admin-failure').catch(() => null)
  await shot(visitor, 'zz-visitor-failure').catch(() => null)
} finally {
  writeFileSync(path.join(HERE, 'notes.txt'), notes.join('\n') + '\n')
  writeFileSync(
    path.join(HERE, 'report.json'),
    JSON.stringify(
      {
        run: RUN,
        shaTarget: 'd605006',
        operator: email,
        leadIdOpened,
        newLeadId,
        leadEmail: LEAD_EMAIL,
        consoleHits,
        steps,
        failures,
      },
      null,
      2,
    ),
  )
  await browser.close()
}

note(`DONE steps=${steps.length} failures=${failures.length} opened=${leadIdOpened} newLead=${newLeadId}`)
console.log('WALK_COMPLETE')
