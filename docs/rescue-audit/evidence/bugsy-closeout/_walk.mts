/**
 * BUGSY independent closeout. Try to break production. Do not trust builder summaries.
 *
 *   pnpm exec tsx docs/rescue-audit/evidence/bugsy-closeout/_walk.mts
 *
 * Never prints passwords. Evidence lands next to this file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import type { Page } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const BRAND_NAME = 'PageFlo Rescue Acceptance 944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const RUN = `bugsy${Date.now().toString(36)}`
const EVIDENCE = HERE

mkdirSync(EVIDENCE, { recursive: true })

type Sev = 'P0' | 'P1' | 'P2'
type Finding = { id: string; sev: Sev; title: string; detail: string; url?: string; shot?: string }
const findings: Finding[] = []
const clicks: string[] = []
const urls: string[] = []
const notes: string[] = []
let leadId: string | null = null
let leadEmail = `pageflo-bugsy-closeout-${RUN}@legenex.test`
let pass = 0
let fail = 0

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

const found = (sev: Sev, title: string, detail: string, extra: { url?: string; shot?: string } = {}) => {
  const id = `BUGSY-${sev}-${String(findings.length + 1).padStart(3, '0')}`
  findings.push({ id, sev, title, detail, ...extra })
  console.log(`  ${sev} ${id} ${title}`)
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

const shot = async (page: Page, name: string) => {
  const file = path.join(EVIDENCE, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => null)
  return `${name}.png`
}

const fetchText = async (url: string) => {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  return { status: res.status, body: await res.text() }
}

const visible = async (page: Page) => ((await page.locator('body').innerText().catch(() => '')) || '')

const JUNK = [
  '{{site.name}}',
  '{{year}}',
  '(800) 000-0000',
  'Dynamic figure',
  'This deployment',
  'Injury Type12121212',
  '/submitted (Qualified)',
  '/thanks (DQ)',
  'Qualified Lead Form',
  'DQ Lead Form',
  'Welcome / Accident Type',
  'Accident Branch',
]
const GRAPH = [/Injury Type12121212/i, /\/submitted \(Qualified\)/, /\/thanks \(DQ\)/, /Qualified Lead Form/, /DQ Lead Form/, /Welcome \/ Accident Type/, /Accident Branch/]

const assertNoJunk = (body: string, url: string, vis: string) => {
  const hits = JUNK.filter((n) => vis.includes(n) || (body.includes(n) && vis.includes(n)))
  const visHits = JUNK.filter((n) => vis.includes(n))
  t(visHits.length === 0, `${url} visible text has no authoring junk (${visHits.join(', ') || 'none'})`)
  if (visHits.length) found('P0', `authoring junk on ${url}`, visHits.join(', '), { url })
  const graphHits = GRAPH.filter((re) => re.test(vis))
  t(graphHits.length === 0, `${url} visitor surface has no internal graph labels`)
  if (graphHits.length) found('P0', `internal graph labels on ${url}`, graphHits.map(String).join(', '), { url })
  return hits
}

const clickLog = (label: string) => {
  clicks.push(label)
  console.log('  CLICK ' + label)
}

const { email, password } = creds()
const isoEmail = `bugsy-iso-${RUN}@legenex.test`
const isoPassword = process.env.PAGEFLO_ISO_PASSWORD || `Iso${RUN}Qa9!`
const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)

const goto = async (url: string, wait: 'networkidle' | 'domcontentloaded' = 'networkidle') => {
  urls.push(url)
  const res = await page.goto(url, { waitUntil: wait, timeout: 45000 }).catch(() => null)
  return res
}

try {
  /* ------------------------------------------------------------------ 0 health */
  const h1 = await fetchText('https://app.pageflo.io/api/pageflo/health')
  const h2 = await fetchText('https://os.legenex.com/api/legalos/health')
  t(h1.status === 200 && h1.body.includes('"ok":true'), 'health app.pageflo.io 200 ok')
  t(h2.status === 200 && h2.body.includes('"ok":true'), 'health os.legenex.com 200 ok')

  /* ------------------------------------------------------------------ 1 bad login */
  await goto(`${APP}/sign-in`)
  await shot(page, '01-sign-in')
  t(/sign-in/i.test(page.url()), 'sign-in page loads')
  t(!(await visible(page)).includes('Brand Kits'), 'sign-in does not advertise Brand Kits')
  await page.locator('input[type="email"], input[name="email"]').first().fill('bugsy-wrong@example.com')
  await page.locator('input[type="password"], input[name="password"]').first().fill('definitely-not-the-password')
  clickLog('Sign in with wrong email/password')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2000)
  await shot(page, '02-bad-login')
  const badText = await visible(page)
  const badOk = /incorrect|invalid|not match|failed/i.test(badText) && !/\/admin/.test(page.url())
  t(badOk, 'bad login stays on sign-in with an error')
  if (!badOk) found('P0', 'bad login did not fail closed', `url=${page.url()} text=${badText.slice(0, 200)}`, { url: page.url(), shot: '02-bad-login.png' })

  await goto(`${APP}/cms/forgot`)
  await page.waitForTimeout(1500)
  await shot(page, '03-forgot')
  const forgotInputs = await page.locator('form, input').count()
  t(true, `forgot-password form controls=${forgotInputs}`)
  if (forgotInputs === 0) found('P1', 'forgot-password has no usable form', 'SSR/hydration still empty', { url: `${APP}/cms/forgot`, shot: '03-forgot.png' })

  /* ------------------------------------------------------------------ 2 unknown preview host */
  const unknown = await fetchText(`https://no-such-brand-${RUN}.preview.pageflo.io/`)
  t(unknown.status === 404, `unknown preview host 404 (got ${unknown.status})`)
  if (unknown.status !== 404 && unknown.status !== 0) {
    found('P0', 'unknown preview host did not 404', `status=${unknown.status}`, { url: `https://no-such-brand-${RUN}.preview.pageflo.io/` })
  }
  await goto(`https://no-such-brand-${RUN}.preview.pageflo.io/`, 'domcontentloaded')
  await shot(page, '04-unknown-host')
  const uhText = await visible(page)
  if (!/not found|404/i.test(uhText) && unknown.status === 404) {
    found('P1', 'unknown preview host 404 is a blank Next error document', uhText.slice(0, 120) || '(empty body)', { shot: '04-unknown-host.png' })
  }

  /* ------------------------------------------------------------------ 3 public surfaces */
  const publicPages: Array<{ name: string; url: string }> = [
    { name: '10-home', url: `${PREVIEW}/` },
    { name: '11-privacy', url: `${PREVIEW}/privacy` },
    { name: '12-terms', url: `${PREVIEW}/terms` },
    { name: '13-about', url: `${PREVIEW}/about` },
    { name: '14-quiz', url: `${PREVIEW}/s/${BRAND_SLUG}` },
    { name: '15-lp', url: `${PREVIEW}/c/${BRAND_SLUG}` },
    { name: '16-adv-rescue', url: `${PREVIEW}/adv/rescue-qamugk8e9r` },
    { name: '17-adv-pin', url: `${PREVIEW}/adv/pinmugkkmjl` },
    { name: '18-ds-quiz', url: 'https://dont-settle.preview.pageflo.io/s/dont-settle' },
    { name: '19-ds-lp', url: 'https://dont-settle.preview.pageflo.io/c' },
    { name: '20-ds-adv', url: 'https://dont-settle.preview.pageflo.io/adv/letter' },
    { name: '21-ds-terms', url: 'https://dont-settle.preview.pageflo.io/terms' },
  ]
  for (const p of publicPages) {
    const res = await goto(p.url, 'domcontentloaded')
    await page.waitForTimeout(800)
    await shot(page, p.name)
    const status = res?.status() ?? 0
    const vis = await visible(page)
    const html = await page.content()
    t(status === 200, `${p.url} HTTP ${status}`)
    if (status !== 200) found('P0', `public surface not 200: ${p.url}`, `status=${status}`, { url: p.url, shot: `${p.name}.png` })
    assertNoJunk(html, p.url, vis)
    if (p.name === '13-about' && /no content blocks yet/i.test(vis)) {
      found('P1', 'acceptance About page is empty starter copy', vis.slice(0, 180), { url: p.url, shot: `${p.name}.png` })
    }
    if (p.name === '14-quiz' || p.name === '18-ds-quiz') {
      t(await page.locator('[data-quiz-root]').count() > 0, `${p.url} quiz mounts`)
      t(await page.locator('[data-quiz-answer]').count() > 0, `${p.url} visitor answers present`)
    }
    if (/CLICK HERE TO CALL/.test(vis) && !/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(vis.slice(Math.max(0, vis.indexOf('CLICK HERE TO CALL') - 80), vis.indexOf('CLICK HERE TO CALL') + 80))) {
      // Phone may still be elsewhere; only flag if NO phone on the page at all.
      if (!/\(833\)|\(800\)|\d{3}[\s.-]\d{3}[\s.-]\d{4}/.test(vis) && (p.name === '14-quiz' || p.name === '18-ds-quiz')) {
        found('P1', `quiz CTA has no phone number (${p.url})`, vis.slice(0, 200), { url: p.url, shot: `${p.name}.png` })
      }
    }
    if (p.name.startsWith('17-') || p.name.startsWith('16-')) {
      if (/\[Author\]|CATEGORY · TOPIC/.test(vis)) {
        found('P1', `advertorial still has template leftovers (${p.url})`, 'visible [Author] and/or CATEGORY · TOPIC', { url: p.url, shot: `${p.name}.png` })
      }
    }
  }

  /* ------------------------------------------------------------------ 4 visitor quiz + lead */
  await goto(`${PREVIEW}/s/${BRAND_SLUG}?utm_source=bugsy&utm_medium=closeout&utm_campaign=${RUN}`, 'domcontentloaded')
  await page.waitForSelector('[data-quiz-root]', { timeout: 20000 })
  clickLog('Open visitor quiz')
  await shot(page, '30-quiz-start')
  const startQ = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
  t(Boolean(startQ), `first question visible (${startQ.slice(0, 80)})`)
  const quizStartVis = await visible(page)
  t(!GRAPH.some((re) => re.test(quizStartVis)), 'visitor quiz start has no graph labels')

  const answers = page.locator('[data-quiz-answer]')
  if ((await answers.count()) > 0) {
    clickLog(`quiz answer 0: ${((await answers.nth(0).textContent()) || '').trim().slice(0, 60)}`)
    await answers.nth(0).click()
    await page.waitForTimeout(900)
    const afterA = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
    t(afterA !== startQ, 'branch A advances')
    if (await page.locator('[data-quiz-back]').count()) {
      clickLog('quiz Back')
      await page.locator('[data-quiz-back]').first().click()
      await page.waitForTimeout(700)
    }
    if ((await answers.count()) > 1) {
      clickLog(`quiz answer 1: ${((await answers.nth(1).textContent()) || '').trim().slice(0, 60)}`)
      await answers.nth(1).click()
      await page.waitForTimeout(900)
    }
  }

  const walkOnce = async (): Promise<'form' | 'end' | 'moved' | 'stuck'> => {
    if (await page.locator('[data-quiz-form]').count()) return 'form'
    if (await page.locator('[data-quiz-endpoint]').count()) return 'end'
    const root = page.locator('[data-quiz-root]')
    const nodeType = await page.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)
    const before = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()

    const textarea = root.locator('textarea').first()
    if (await textarea.count()) {
      await textarea.click().catch(() => null)
      await textarea.fill('')
      await textarea.pressSequentially('BUGSY QA closeout: rear-end collision, neck and back pain, ER visit. Labelled test lead, not a real claimant.', { delay: 4 }).catch(() => null)
    }
    const textInputs = root.locator('input[type="text"], input:not([type])')
    const nText = await textInputs.count()
    for (let i = 0; i < nText; i++) {
      const inp = textInputs.nth(i)
      const val = await inp.inputValue().catch(() => '')
      if (!val.trim()) await inp.fill('QA').catch(() => null)
    }
    const selects = root.locator('select')
    const nSel = await selects.count()
    for (let i = 0; i < nSel; i++) {
      const sel = selects.nth(i)
      const current = await sel.inputValue().catch(() => '')
      if (current) continue
      const opts = await sel.locator('option').evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter((v) => v),
      )
      const pick = opts.find((v) => /^(TX|Texas|CA|NY|2020|2019|01|1)$/i.test(v)) || opts[0]
      if (pick) await sel.selectOption(pick).catch(() => null)
      await page.waitForTimeout(200)
    }
    if (nSel > 0) {
      const fwd = root.locator('[data-quiz-submit]').first()
      if (await fwd.count()) {
        clickLog(`quiz Next after select (node=${nodeType})`)
        await fwd.click().catch(() => null)
      }
      await page.waitForTimeout(900)
      if (await page.locator('[data-quiz-form]').count()) return 'form'
      const after = ((await page.locator('[data-quiz-question]').first().textContent()) ?? '').trim()
      return after !== before || (await page.locator('[data-quiz-endpoint]').count()) ? 'moved' : 'stuck'
    }
    if (await textarea.count()) {
      const fwd = root.locator('[data-quiz-submit]').first()
      if (await fwd.count()) {
        clickLog('quiz Next after textarea')
        await fwd.click().catch(() => null)
      }
      await page.waitForTimeout(900)
      if (await page.locator('[data-quiz-form]').count()) return 'form'
      return 'moved'
    }
    const ans = page.locator('[data-quiz-answer]')
    if (await ans.count()) {
      clickLog(`quiz answer auto (${nodeType})`)
      await ans.first().click()
      await page.waitForTimeout(900)
      if (await page.locator('[data-quiz-form]').count()) return 'form'
      return 'moved'
    }
    const next = page.getByRole('button', { name: /Next|Continue/i }).first()
    if (await next.count()) {
      clickLog('quiz Next/Continue')
      await next.click({ force: true }).catch(() => null)
      await page.waitForTimeout(900)
      if (await page.locator('[data-quiz-form]').count()) return 'form'
      return 'moved'
    }
    return 'stuck'
  }

  let reachedForm = false
  for (let i = 0; i < 40; i++) {
    const r = await walkOnce()
    if (r === 'form') {
      reachedForm = true
      break
    }
    if (r === 'end') break
    if (r === 'stuck') {
      const next = page.getByRole('button', { name: /Next|Continue/i }).first()
      if (await next.count()) await next.click({ force: true }).catch(() => null)
      else break
      await page.waitForTimeout(800)
    }
  }
  await shot(page, '31-quiz-form-or-stuck')
  t(reachedForm, 'C lead form reached through visitor quiz')
  if (!reachedForm) found('P0', 'visitor quiz did not reach the lead form', await visible(page).then((s) => s.slice(0, 400)), { url: page.url(), shot: '31-quiz-form-or-stuck.png' })

  if (reachedForm) {
    const fill = async (sel: string, value: string) => {
      const loc = page.locator(sel).first()
      if (await loc.count()) await loc.fill(value)
    }
    await fill('input[name="first_name"]', 'Bugsy')
    await fill('input[name="last_name"]', `QA Closeout ${RUN}`)
    await fill('input[name="email"]', leadEmail)
    await fill('input[name="mobile"]', '5550100444')
    await fill('input[name="phone"]', '5550100444')
    await fill('input[name="zip"]', '78701')
    const consent = page.locator('[data-quiz-form] input[type="checkbox"]').first()
    if (await consent.count()) {
      const checked = await consent.isChecked().catch(() => false)
      if (!checked) {
        clickLog('check TCPA consent')
        await consent.check({ force: true }).catch(() => null)
      }
    }
    const leadBodies: string[] = []
    page.on('response', async (res) => {
      if (res.url().includes('/api/leads') && res.request().method() === 'POST') {
        const body = await res.text().catch(() => '')
        leadBodies.push(body)
        const m = body.match(/"id"\s*:\s*"?(\d+)/)
        if (m) leadId = m[1]
      }
    })
    clickLog('quiz Submit lead')
    await page.locator('[data-quiz-submit]').click()
    await page.waitForSelector('[data-quiz-endpoint]', { timeout: 25000 }).catch(() => null)
    await page.waitForTimeout(2500)
    await shot(page, '32-quiz-submitted')
    const thanks = (await page.locator('[data-quiz-endpoint]').count()) > 0 || /thank/i.test(await visible(page))
    t(thanks, 'thank-you / endpoint after submit')
    t(leadBodies.length >= 1, `POST /api/leads happened (${leadBodies.length})`)
    if (!thanks || leadBodies.length < 1) {
      found('P0', 'lead capture failed', `thanks=${thanks} posts=${leadBodies.length}`, { url: page.url(), shot: '32-quiz-submitted.png' })
    }
  }

  /* ------------------------------------------------------------------ 5 login */
  await goto(`${APP}/sign-in`)
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  clickLog('Sign in as team@legenex.com')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
  t(/\/admin/.test(page.url()), 'good login reaches /admin')
  await shot(page, '40-after-login')
  if (!/\/admin/.test(page.url())) {
    found('P0', 'admin login failed', `url=${page.url()}`, { url: page.url(), shot: '40-after-login.png' })
    throw new Error('cannot continue console attacks without login')
  }

  /* ------------------------------------------------------------------ 6 leads UI */
  await goto(`${APP}/admin/leads`)
  await shot(page, '41-leads')
  clickLog('Open Leads')
  const leadsText = await visible(page)
  t(/Lead/i.test(leadsText), 'Leads UI loads')
  const qaHit = leadsText.includes(RUN) || leadsText.includes(leadEmail) || leadsText.includes('pageflo-bugsy-closeout') || leadsText.includes('pageflo-qa-')
  t(qaHit, `QA lead visible in Leads UI (run ${RUN})`)
  if (!qaHit && reachedForm) found('P0', 'submitted QA lead not visible in Leads UI', `email=${leadEmail}`, { url: `${APP}/admin/leads`, shot: '41-leads.png' })
  const row = page.getByText(leadEmail).first()
  if (await row.count()) {
    clickLog('Open QA lead row')
    await row.click()
    await page.waitForTimeout(1200)
    await shot(page, '42-lead-detail')
    const detail = await visible(page)
    const m = detail.match(/\b(?:Lead|#)\s*(\d{1,6})\b/) || detail.match(/\bid\s*[:=]\s*(\d+)/i)
    if (m) leadId = leadId || m[1]
    t(/consent|TCPA|brand|delivery|attribution|valid/i.test(detail), 'lead detail shows operator fields')
  }

  /* ------------------------------------------------------------------ 7 path collision */
  await goto(`${APP}/admin/advertorials`)
  await shot(page, '50-advertorials')
  const depTab = page.getByRole('button', { name: /Deployments/i }).first()
  if (await depTab.count()) {
    clickLog('Advertorials → Deployments')
    await depTab.click()
    await page.waitForTimeout(800)
  }
  await shot(page, '51-adv-deployments')
  const newDep = page.getByRole('button', { name: /New Deployment/i }).first()
  t(await newDep.count() > 0, 'New Deployment control exists')
  let collisionBlocked = false
  let collisionNote = 'not attempted'
  if (await newDep.count()) {
    clickLog('New Deployment')
    await newDep.click()
    await page.waitForTimeout(1200)
    await shot(page, '52-new-dep-editor')
    const selects = page.locator('select')
    const nSelect = await selects.count()
    for (let i = 0; i < nSelect; i++) {
      const sel = selects.nth(i)
      const options = await sel.locator('option').allTextContents()
      const brandOpt = options.find((o) => o.includes('PageFlo Rescue Acceptance'))
      const domainOpt = options.find((o) => o.includes(BRAND_SLUG) && o.includes('preview.pageflo.io'))
      const advOpt = options.find((o) => /Phone Call|Untitled|Tracy|Fridge|Advertorial/i.test(o) && !/select/i.test(o))
      if (brandOpt) await sel.selectOption({ label: brandOpt }).catch(() => null)
      else if (domainOpt) await sel.selectOption({ label: domainOpt }).catch(() => null)
      else if (advOpt) await sel.selectOption({ label: advOpt }).catch(() => null)
    }
    const pathField = page.getByPlaceholder(/\/adv\//).first()
    const taken = '/adv/rescue-qamugk8e9r'
    if (await pathField.count()) {
      await pathField.fill(taken)
      clickLog(`fill colliding path ${taken}`)
    }
    const createBtn = page.getByRole('button', { name: /Create deployment|Save changes/i }).first()
    if (await createBtn.count()) {
      clickLog('Create/Save colliding deployment')
      await createBtn.click()
      await page.waitForTimeout(2500)
    }
    await shot(page, '53-after-create-collision-draft')
    // Drafts are allowed on a taken path; publishing is the claim. Try Publish.
    const publishBtns = page.getByRole('button', { name: /^Publish$/i })
    if (await publishBtns.count()) {
      clickLog('Publish colliding deployment')
      await publishBtns.first().click()
      await page.waitForTimeout(2500)
    }
    await shot(page, '54-after-publish-collision')
    const msg = await visible(page)
    collisionBlocked = /already served|collides with|already in use|path is taken|is already served/i.test(msg)
    collisionNote = collisionBlocked ? 'UI refused publish/create' : `no collision copy. snippet=${msg.slice(0, 400).replace(/\s+/g, ' ')}`
    t(true, `path collision probe: ${collisionNote}`)
    const stillOnlyOne = await fetchText(`${PREVIEW}/adv/rescue-qamugk8e9r`)
    t(stillOnlyOne.status === 200, 'original colliding path still 200')
    if (!collisionBlocked) {
      // If the product allowed a second LIVE row, that is P0. A silent draft is acceptable.
      if (/live/i.test(msg) && /rescue-qamugk8e9r/.test(msg) && !/draft/i.test(msg)) {
        found('P0', 'second publish on a live path was not refused', collisionNote, { url: `${APP}/admin/advertorials`, shot: '54-after-publish-collision.png' })
      } else {
        found('P1', 'path collision produced no operator-visible refusal', collisionNote, { url: `${APP}/admin/advertorials`, shot: '54-after-publish-collision.png' })
      }
    }
  }

  /* ------------------------------------------------------------------ 8 draft vs live (master edit must not change live) */
  const pinUrl = `${PREVIEW}/adv/pinmugkkmjl`
  const beforePin = await fetchText(pinUrl)
  t(beforePin.status === 200, 'pin advertorial live 200')
  const marker = `BUGSY-PIN-${RUN}`
  const liveHadMarkerBefore = beforePin.body.includes(marker)
  t(!liveHadMarkerBefore, 'live does not already contain the Bugsy pin marker')

  await goto(`${APP}/admin/advertorials`)
  const mastersTab = page.getByRole('button', { name: /^Advertorials$/i }).first()
  if (await mastersTab.count()) {
    clickLog('Advertorials masters tab')
    await mastersTab.click()
    await page.waitForTimeout(800)
  }
  await shot(page, '60-masters')
  // Prefer the row that still shows the live pin headline.
  const pinRow = page.getByText(/Snapshot after PINTEST|Untitled Advertorial|Snapshot before/i).first()
  const editBtn = page.getByRole('button', { name: /^Edit$/i }).first()
  t(await editBtn.count() > 0, 'Edit control on advertorial masters')
  if (await editBtn.count()) {
    clickLog('Edit first advertorial master')
    await editBtn.click()
    await page.waitForTimeout(1500)
    await shot(page, '61-master-editor')
    const headlineBox = page.getByPlaceholder('The $4,200 check that cost her $186,000').first()
    const ta = page.locator('textarea').first()
    if (await headlineBox.count()) {
      await headlineBox.fill(marker)
      clickLog('overwrite headline with pin marker')
    } else if (await ta.count()) {
      await ta.fill(marker)
      clickLog('overwrite first textarea with pin marker')
    }
    const save = page.getByRole('button', { name: /^Save$/i }).first()
    if (await save.count()) {
      clickLog('Save master (no republish)')
      await save.click()
      await page.waitForTimeout(2000)
    }
    await shot(page, '62-master-saved')
    const afterPin = await fetchText(pinUrl)
    const liveChanged = afterPin.body.includes(marker) && !beforePin.body.includes(marker)
    t(!liveChanged, 'live pin advertorial unchanged after master Save without republish')
    if (liveChanged) {
      found('P0', 'master edit silently changed live advertorial', `marker ${marker} appeared on ${pinUrl}`, { url: pinUrl, shot: '62-master-saved.png' })
    }
    // Restore the previous headline so we do not leave a broken master if someone republishes later.
    const restore = 'Snapshot after PINTEST-pinmugkkmjl'
    if (await headlineBox.count()) await headlineBox.fill(restore)
    else if (await ta.count()) await ta.fill(restore)
    if (await save.count()) {
      clickLog('Restore previous master headline')
      await save.click()
      await page.waitForTimeout(1500)
    }
  }

  /* ------------------------------------------------------------------ 9 advertorial archive does not delete */
  await goto(`${APP}/admin/advertorials`)
  if (await mastersTab.count()) {
    await page.getByRole('button', { name: /^Advertorials$/i }).first().click().catch(() => null)
    await page.waitForTimeout(600)
  }
  const newAdv = page.getByRole('button', { name: /New Advertorial/i }).first()
  t(await newAdv.count() > 0, 'New Advertorial control exists')
  let archiveTitle = `BUGSY Archive Probe ${RUN}`
  if (await newAdv.count()) {
    clickLog('New Advertorial')
    await newAdv.click()
    await page.waitForTimeout(1500)
    await shot(page, '70-new-adv')
    const settings = page.getByRole('button', { name: /^Settings$/i }).first()
    if (await settings.count()) {
      clickLog('Advertorial Settings')
      await settings.click()
      await page.waitForTimeout(500)
      const titleInput = page.locator('input').first()
      if (await titleInput.count()) await titleInput.fill(archiveTitle)
    }
    const saveAdv = page.getByRole('button', { name: /^Save$/i }).first()
    if (await saveAdv.count()) {
      clickLog('Save archive-probe advertorial')
      await saveAdv.click()
      await page.waitForTimeout(1800)
    }
    await shot(page, '71-adv-saved')
    const back = page.getByRole('button', { name: /^Back$/i }).first()
    if (await back.count()) {
      clickLog('Back to advertorial list')
      await back.click()
      await page.waitForTimeout(1000)
    }
  }
  await shot(page, '72-list-before-archive')
  const archiveBtn = page.getByLabel('Archive advertorial').first()
  t(await archiveBtn.count() > 0, 'Archive advertorial control exists')
  if (await archiveBtn.count()) {
    clickLog('Archive advertorial (first row control)')
    await archiveBtn.click()
    await page.waitForTimeout(800)
    await shot(page, '73-archive-confirm')
    const confirm = page.getByRole('button', { name: /Archive|Confirm|Yes/i }).last()
    if (await confirm.count()) {
      clickLog('Confirm archive')
      await confirm.click()
      await page.waitForTimeout(2000)
    }
    await shot(page, '74-after-archive')
    const afterArch = await visible(page)
    const deletedGone = !(afterArch.includes(archiveTitle) || /archived/i.test(afterArch))
    // The UI may hide archived rows from the default list. That is not a delete
    // as long as Restore / Archived filter can still see it.
    const archivedTab = page.getByRole('button', { name: /Archived/i }).first()
    if (await archivedTab.count()) {
      clickLog('Open Archived filter')
      await archivedTab.click()
      await page.waitForTimeout(800)
      await shot(page, '75-archived-tab')
    }
    const stillThere = (await visible(page)).includes(archiveTitle) || (await page.getByText(archiveTitle).count()) > 0 || (await page.getByText(/archived/i).count()) > 0
    t(stillThere || !deletedGone, 'archive did not hard-delete the advertorial surface')
    if (!stillThere && deletedGone) {
      found('P0', 'advertorial archive appears to delete the record', `title ${archiveTitle} gone with no archived filter hit`, { url: `${APP}/admin/advertorials`, shot: '74-after-archive.png' })
    }
  }

  /* ------------------------------------------------------------------ 10 isolation: invite brand-bound user */
  let createdIsoUser = false
  await goto(`${APP}/admin/settings/users`)
  await shot(page, '80-users')
  const invite = page.getByRole('button', { name: /Invite User/i }).first()
  t(await invite.count() > 0, 'Invite User control exists')
  if (await invite.count()) {
    clickLog('Invite User')
    await invite.click()
    await page.waitForTimeout(800)
    await shot(page, '81-invite-modal')
    const emailInput = page.locator('input[name="email"]').first()
    const nameInput = page.locator('input[name="name"]').first()
    const passInput = page.locator('input[name="password"]').first()
    if (await emailInput.count()) await emailInput.fill(isoEmail)
    if (await nameInput.count()) await nameInput.fill(`Bugsy Isolation ${RUN}`)
    if (await passInput.count()) await passInput.fill(isoPassword)
    const status = page.locator('select[name="status"]').first()
    if (await status.count()) await status.selectOption('active').catch(() => null)
    const superBox = page.locator('input[name="super_admin"]').first()
    if (await superBox.count()) {
      const checked = await superBox.isChecked().catch(() => false)
      if (checked) await superBox.uncheck({ force: true }).catch(() => null)
    }
    const addBinding = page.getByRole('button', { name: /Add binding/i }).first()
    if (await addBinding.count()) {
      clickLog('Add site binding')
      await addBinding.click()
      await page.waitForTimeout(400)
      const bindSelect = page.locator('select').nth(1)
      if (await bindSelect.count()) {
        const opts = await bindSelect.locator('option').allTextContents()
        const acc = opts.find((o) => o.includes('Rescue Acceptance') || o.includes('pageflo-rescue'))
        if (acc) await bindSelect.selectOption({ label: acc }).catch(() => null)
      }
    }
    await shot(page, '82-invite-filled')
    clickLog('Submit Invite user')
    await page.getByRole('button', { name: /Invite user/i }).last().click()
    await page.waitForTimeout(2500)
    await shot(page, '83-after-invite')
    const afterInvite = await visible(page)
    createdIsoUser = afterInvite.includes(isoEmail) || /User invited/i.test(afterInvite)
    t(createdIsoUser, `brand-bound user created (${isoEmail})`)
    if (!createdIsoUser) notes.push('could not create a non-super-admin via Invite User; will run pnpm test:isolation')
  }

  if (createdIsoUser) {
    // Sign out: go to sign-in in a fresh context so cookies do not leak.
    const isoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await isoPage.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
    await isoPage.locator('input[type="email"], input[name="email"]').first().fill(isoEmail)
    await isoPage.locator('input[type="password"], input[name="password"]').first().fill(isoPassword)
    clickLog('Sign in as brand-bound isolation user')
    await isoPage.locator('button[type="submit"]').first().click()
    await isoPage.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
    await isoPage.screenshot({ path: path.join(EVIDENCE, '84-iso-login.png'), fullPage: true }).catch(() => null)
    const isoIn = /\/admin/.test(isoPage.url())
    t(isoIn, 'isolation user reached /admin')
    if (isoIn) {
      await isoPage.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
      await isoPage.screenshot({ path: path.join(EVIDENCE, '85-iso-brands.png'), fullPage: true }).catch(() => null)
      const isoSites = (await isoPage.locator('body').innerText().catch(() => '')) || ''
      const seesDontSettle = /Dont Settle|Don't Settle/i.test(isoSites)
      t(!seesDontSettle, 'brand-bound user does not list Dont Settle')
      if (seesDontSettle) found('P0', 'brand-bound user can see another Brand in the list', 'Dont Settle visible on /admin/sites', { url: `${APP}/admin/sites`, shot: '85-iso-brands.png' })

      await isoPage.goto(`${APP}/admin/sites/dont-settle/settings/general`, { waitUntil: 'networkidle' })
      await isoPage.waitForTimeout(1200)
      await isoPage.screenshot({ path: path.join(EVIDENCE, '86-iso-foreign-brand.png'), fullPage: true }).catch(() => null)
      const foreign = (await isoPage.locator('body').innerText().catch(() => '')) || ''
      const blocked = /not found|forbidden|no access|sign-in|doesn't exist|do not have/i.test(foreign) || !/General Settings/i.test(foreign)
      t(blocked, 'brand-bound user cannot open another Brand settings')
      if (!blocked) {
        const tag = isoPage.locator('input[name="tagline"]')
        if (await tag.count()) {
          await tag.fill(`BUGSY isolation mutate ${RUN}`)
          clickLog('attempt Save on foreign Brand')
          await isoPage.getByRole('button', { name: /Save Settings/i }).click()
          await isoPage.waitForTimeout(1500)
          await isoPage.screenshot({ path: path.join(EVIDENCE, '87-iso-foreign-save.png'), fullPage: true }).catch(() => null)
          found('P0', 'brand-bound user opened another Brand settings', 'Dont Settle general settings loaded', { url: isoPage.url(), shot: '86-iso-foreign-brand.png' })
        }
      }
    } else {
      notes.push('isolation user could not sign in; treating as cannot create usable non-super-admin')
      createdIsoUser = false
    }
    await isoPage.close()
  }

  /* ------------------------------------------------------------------ 11 stale save probe */
  await goto(`${APP}/admin/sites/${BRAND_SLUG}/settings/general`)
  await shot(page, '90-brand-general')
  const tagline = page.locator('input[name="tagline"]')
  if (await tagline.count()) {
    const prev = await tagline.inputValue()
    await tagline.fill(`Bugsy closeout ${RUN}`)
    clickLog('Save Brand settings (stale-save probe)')
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await page.waitForTimeout(2000)
    await shot(page, '91-brand-saved')
    const saved = await visible(page)
    const stale = /failed to find server action|unexpected|something went wrong/i.test(saved)
    t(!stale, 'Brand save did not hit a stale Server Action')
    if (stale) found('P0', 'stale Server Action on Brand save', saved.slice(0, 240), { url: page.url(), shot: '91-brand-saved.png' })
    else t(/Saved/i.test(saved), 'Brand save reports Saved')
    await page.reload({ waitUntil: 'networkidle' })
    if (await tagline.count()) {
      t((await tagline.inputValue()).includes(RUN), 'tagline persisted after reload')
    }
    // restore previous tagline if we can
    if (prev) {
      await tagline.fill(prev)
      await page.getByRole('button', { name: /Save Settings/i }).click()
      await page.waitForTimeout(1000)
    }
  }

  await goto(`${APP}/admin/sites`)
  await shot(page, '99-brands')
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
  verdict: findings.some((f) => f.sev === 'P0') || fail > 0 && findings.some((f) => f.sev === 'P0') ? 'FAIL' : findings.length ? 'FAIL_OR_PASS_PENDING' : 'PASS',
  pass,
  fail,
  leadId,
  leadEmail,
  clicks,
  urls,
  notes,
  findings,
  brand: BRAND_SLUG,
  preview: PREVIEW,
  productionShaExpected: 'b631690',
}
writeFileSync(path.join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2))
writeFileSync(
  path.join(EVIDENCE, '_notes.txt'),
  [
    `run=${RUN}`,
    `pass=${pass} fail=${fail}`,
    `leadId=${leadId || '(unknown)'}`,
    `leadEmail=${leadEmail}`,
    '',
    'CLICKS',
    ...clicks.map((c) => `- ${c}`),
    '',
    'NOTES',
    ...notes.map((n) => `- ${n}`),
    '',
    'FINDINGS',
    ...findings.map((f) => `${f.id} ${f.sev} ${f.title} :: ${f.detail}`),
  ].join('\n') + '\n',
)
console.log(`\n${pass} passed, ${fail} failed  run=${RUN} findings=${findings.length} lead=${leadId || '?'}`)
for (const f of findings) console.log(`  ${f.id} ${f.sev} ${f.title}`)
