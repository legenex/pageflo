/**
 * Odin production domain walk. Not a product test. Writes screenshots and notes.
 * Never prints passwords. Never changes public DNS, nginx, or certificates.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/odin'
mkdirSync(SHOTS, { recursive: true })

const loadEnv = (path: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1)
  }
  return out
}
const superCreds = loadEnv('/tmp/pf-odin-creds.env')
const captureCreds = loadEnv('/tmp/pf-odin-capture.env')
const LOGIN_ATTEMPTS: Array<{ label: string; email: string; password: string }> = [
  { label: 'SUPER_ADMIN', email: superCreds.SUPER_ADMIN_EMAIL, password: superCreds.SUPER_ADMIN_PASSWORD },
  {
    label: 'BUILDLOG_CAPTURE',
    email: captureCreds.BUILDLOG_CAPTURE_EMAIL,
    password: captureCreds.BUILDLOG_CAPTURE_PASSWORD,
  },
].filter((a) => a.email && a.password)

const notes: string[] = []
const note = (s: string) => {
  notes.push(`${new Date().toISOString()} ${s}`)
  console.log(s)
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: false,
})
const page = await context.newPage()
page.setDefaultTimeout(45000)
page.on('console', (msg) => {
  if (msg.type() === 'error') note(`CONSOLE ${msg.type()} ${msg.text()}`)
})
page.on('pageerror', (err) => note(`PAGEERROR ${err.message}`))

const shot = async (name: string) => {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  note(`SHOT ${name} ${page.url()}`)
}

const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 1200)

try {
  await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  await shot('01-sign-in')
  note(`sign-in title: ${await page.title()}`)

  let loggedIn = false
  for (const attempt of LOGIN_ATTEMPTS) {
    await page.fill('input[name="email"]', attempt.email)
    await page.fill('input[name="password"]', attempt.password)
    await Promise.all([
      page.waitForURL(/\/admin(\/|$)/, { timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(1500)
    const afterLogin = page.url()
    note(`after submit (${attempt.label} ${attempt.email}): ${afterLogin}`)
    if (!afterLogin.includes('sign-in')) {
      loggedIn = true
      note(`LOGIN_OK via ${attempt.label}`)
      break
    }
    const reason = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400)
    note(`LOGIN FAILED ${attempt.label}: ${reason}`)
    await shot(`01b-sign-in-failed-${attempt.label.toLowerCase()}`)
    await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  }
  if (!loggedIn) throw new Error('login failed for all production env accounts')
  await shot('02-after-login')

  await page.goto('https://app.pageflo.io/admin/sites', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await shot('03-brands-list')
  note(`brands body: ${await bodyText()}`)

  const existing = await page.getByText('rescue-odin-20260923').count()
  if (existing > 0) {
    note('brand slug already present; skipping create')
    await page.goto('https://app.pageflo.io/admin/sites/rescue-odin-20260923', { waitUntil: 'domcontentloaded' })
  } else {
    await page.getByRole('button', { name: /New Brand/i }).click()
    await page.waitForTimeout(400)
    await shot('04-new-brand-modal')
    await page.getByPlaceholder('Claim Checker').fill('Rescue Odin 20260923')
    const slug = page.locator('input[placeholder="claim-checker"]')
    await slug.fill('rescue-odin-20260923')
    note(`wizard preview host text: ${(await page.locator('body').innerText()).match(/preview\.[a-z.]+/g)?.join(',') ?? 'none'}`)
    await shot('05-new-brand-filled')
    await page.getByRole('button', { name: /Create Brand|Create site|Create/i }).click()
    await page.waitForURL(/\/admin\/sites\/rescue-odin-20260923/, { timeout: 90000 }).catch(() => null)
    await page.waitForTimeout(2000)
    note(`after create url: ${page.url()}`)
    if (!page.url().includes('rescue-odin-20260923')) {
      note(`CREATE DID NOT NAVIGATE body: ${await bodyText()}`)
      await shot('05b-create-failed')
    }
  }
  await shot('06-brand-dashboard')
  note(`dashboard body: ${await bodyText()}`)

  await page.goto('https://app.pageflo.io/admin/sites/rescue-odin-20260923/settings/domains', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(800)
  await shot('07-site-settings-domains')
  note(`site domains: ${await bodyText()}`)

  await page.goto('https://app.pageflo.io/admin/brands/domains', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await shot('08-brands-domains')
  note(`pool/domains page: ${await bodyText()}`)

  // Expand the new brand's first domain row if present
  const rows = page.locator('#domain-70, [id^="domain-"]')
  const rowCount = await rows.count()
  note(`domain row count: ${rowCount}`)
  if (rowCount > 0) {
    const last = rows.last()
    const expand = last.getByLabel(/Expand|Collapse/)
    if (await expand.count()) await expand.click()
    await page.waitForTimeout(300)
    await shot('09-domain-row-expanded')
  }

  // Add Domain UI: invalid / duplicate
  await page.getByRole('button', { name: /Add Domain/i }).click()
  await page.waitForTimeout(300)
  await shot('10-add-domain-modal')

  const hostInput = page.getByPlaceholder('example.com')
  const addBtn = page.getByRole('button', { name: /Add to pool/i })

  const tryHost = async (label: string, value: string) => {
    await hostInput.fill(value)
    await addBtn.click()
    await page.waitForTimeout(900)
    const err = (await page.locator('p.text-\\[13px\\].text-\\[var\\(--color-neg\\)\\]').innerText().catch(() => '')) || ''
    const modalText = await page.locator('h2:has-text("Add Domain")').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]').innerText().catch(async () => page.locator('body').innerText())
    note(`ADD_DOMAIN ${label} input=${JSON.stringify(value)} error=${JSON.stringify(err)} modal=${String(modalText).replace(/\s+/g, ' ').slice(0, 400)}`)
    await shot(`11-add-${label}`)
  }

  await tryHost('empty-submit', '')
  await tryHost('noperiod', 'noperiod')
  await tryHost('localhost', 'localhost')
  await tryHost('duplicate-preview', 'dont-settle.preview.legenex.com')
  await tryHost('duplicate-with-scheme', 'https://dont-settle.preview.legenex.com/foo')
  await tryHost('audit-example', 'rescue-odin-20260923.example')

  // If modal still open after successful add, close it
  const close = page.getByLabel('Close')
  if (await close.count()) await close.click().catch(() => {})
  await page.waitForTimeout(800)
  await page.goto('https://app.pageflo.io/admin/brands/domains', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await shot('12-domains-after-add')
  note(`after add page: ${await bodyText()}`)

  // Expand the example domain if listed
  const exampleRow = page.locator('text=rescue-odin-20260923.example').first()
  if (await exampleRow.count()) {
    const card = exampleRow.locator('xpath=ancestor::div[contains(@class,"rounded-app")]').first()
    await card.getByLabel(/Expand/).click().catch(() => {})
    await page.waitForTimeout(400)
    await shot('13-example-dns-records')
    note(`example row: ${(await card.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800)}`)
  }

  // Authenticated preview of new brand (draft: bound user should see it)
  await page.goto('https://rescue-odin-20260923.preview.pageflo.io/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('14-preview-pageflo-authed')
  note(`authed pageflo preview status-ish title=${await page.title()} url=${page.url()} body=${await bodyText()}`)

  await page.goto('https://rescue-odin-20260923.preview.legenex.com/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('15-preview-legenex-authed')
  note(`authed legenex preview title=${await page.title()} url=${page.url()} body=${await bodyText()}`)

  // dont-settle both suffixes
  await page.goto('https://dont-settle.preview.pageflo.io/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('16-dont-settle-pageflo')
  note(`dont-settle pageflo title=${await page.title()} body=${await bodyText()}`)

  await page.goto('https://dont-settle.preview.legenex.com/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('17-dont-settle-legenex')
  note(`dont-settle legenex title=${await page.title()} body=${await bodyText()}`)

  // Anonymous context for draft 404 vs published 200
  const anon = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  })
  const ap = await anon.newPage()
  ap.setDefaultTimeout(20000)
  for (const [name, url] of [
    ['anon-odin-pageflo', 'https://rescue-odin-20260923.preview.pageflo.io/'],
    ['anon-odin-legenex', 'https://rescue-odin-20260923.preview.legenex.com/'],
    ['anon-dont-settle-pageflo', 'https://dont-settle.preview.pageflo.io/'],
    ['anon-dont-settle-legenex', 'https://dont-settle.preview.legenex.com/'],
    ['anon-getwhatyoureowed', 'https://getwhatyoureowed.co/'],
    ['anon-crashclaim', 'https://crashclaim.co/'],
  ] as const) {
    const resp = await ap.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => {
      note(`ANON ${name} NAVFAIL ${e}`)
      return null
    })
    await ap.waitForTimeout(800)
    const path = `${SHOTS}/18-${name}.png`
    await ap.screenshot({ path, fullPage: true })
    note(
      `ANON ${name} status=${resp?.status()} title=${await ap.title()} url=${ap.url()} body=${(await ap.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400)}`,
    )
  }
  await anon.close()

  await page.goto('https://app.pageflo.io/admin/quizzes', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await shot('19-quizzes')
  note(`quizzes: ${await bodyText()}`)
} catch (err) {
  note(`WALK ERROR ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  await shot('zz-failure').catch(() => {})
  throw err
} finally {
  writeFileSync(`${SHOTS}/walk-notes.txt`, notes.join('\n') + '\n')
  await browser.close()
}
