/**
 * Critic production spot-check. Not a product test. Writes screenshots only.
 * Never prints passwords.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/critic'
mkdirSync(SHOTS, { recursive: true })

const creds: Record<string, string> = {}
for (const line of readFileSync('/tmp/pf-critic-creds.env', 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) creds[line.slice(0, i)] = line.slice(i + 1)
}
const EMAIL = creds.SUPER_ADMIN_EMAIL
const PASSWORD = creds.SUPER_ADMIN_PASSWORD
if (!EMAIL || !PASSWORD) throw new Error('missing creds')

const notes: string[] = []
const note = (s: string) => {
  notes.push(s)
  console.log(s)
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
})
const page = await context.newPage()
page.setDefaultTimeout(30000)

const shot = async (name: string) => {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  note(`SHOT ${name} ${page.url()}`)
}

const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()

try {
  await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  await shot('01-sign-in')
  note(`sign-in title: ${await page.title()}`)
  note(`sign-in h1: ${await page.locator('h1').first().innerText().catch(() => 'NO-H1')}`)

  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL(/\/admin\//, { timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(1500)
  const afterLogin = page.url()
  note(`after submit: ${afterLogin}`)
  if (afterLogin.includes('sign-in')) {
    const alert = page.locator('[role="alert"]')
    const reason = (await alert.count()) ? (await alert.first().innerText()).trim() : '(no alert)'
    note(`LOGIN FAILED form said: ${reason}`)
    await shot('01b-sign-in-failed')
    throw new Error('login failed')
  }
  await shot('02-after-login')

  const routes: Array<{ path: string; name: string }> = [
    { path: '/admin/overview', name: '03-overview' },
    { path: '/admin/sites', name: '04-brands' },
    { path: '/admin/brands/domains', name: '05-domains' },
    { path: '/admin/deployments', name: '06-deployments' },
    { path: '/admin/websites', name: '07-websites' },
    { path: '/admin/leads', name: '08-leads' },
    { path: '/admin/quizzes', name: '09-quizzes' },
    { path: '/admin/landing-pages', name: '10-landing-pages' },
    { path: '/admin/advertorials', name: '11-advertorials' },
    { path: '/admin/analytics', name: '12-analytics' },
    { path: '/admin/integrity', name: '13-integrity' },
  ]

  for (const r of routes) {
    const res = await page.goto(`https://app.pageflo.io${r.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(800)
    const bounced = page.url().includes('sign-in')
    const heading = await page.locator('h1, h2').first().innerText().catch(() => 'NO-HEADING')
    const text = (await bodyText()).slice(0, 700)
    note(`ROUTE ${r.path} status=${res?.status()} bounced=${bounced} heading=${JSON.stringify(heading)}`)
    note(`  text: ${text}`)
    await shot(r.name)
  }

  // Brand detail for Dont Settle and ACH if links exist
  await page.goto('https://app.pageflo.io/admin/sites', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const brandLinks = await page.locator('a[href^="/admin/sites/"]').evaluateAll((els) =>
    els.map((el) => ({ href: (el as HTMLAnchorElement).href, text: (el.textContent || '').trim() })).filter((x) => x.href && !x.href.endsWith('/admin/sites')),
  )
  note(`brandLinks: ${JSON.stringify(brandLinks.slice(0, 20))}`)

  for (const slug of ['dont-settle', 'accident-compensation-helper']) {
    const res = await page.goto(`https://app.pageflo.io/admin/sites/${slug}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await page.waitForTimeout(700)
    note(`BRAND ${slug} status=${res?.status()} url=${page.url()} heading=${JSON.stringify(await page.locator('h1,h2').first().innerText().catch(() => 'NO'))}`)
    note(`  text: ${(await bodyText()).slice(0, 800)}`)
    await shot(`14-brand-${slug}`)
  }

  // Public previews in a fresh context (anonymous)
  const pub = await context.newPage()
  for (const url of [
    'https://dont-settle.preview.pageflo.io/',
    'https://dont-settle.preview.pageflo.io/terms',
    'https://dont-settle.preview.pageflo.io/privacy',
    'https://dont-settle.preview.pageflo.io/s/dont-settle',
    'https://accident-compensation-helper.preview.pageflo.io/',
    'https://accident-compensation-helper.preview.pageflo.io/s/accident-compensation-helper',
    'https://check-a-case.preview.pageflo.io/',
  ]) {
    const res = await pub.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => {
      note(`PUB ERR ${url} ${e}`)
      return null
    })
    const title = await pub.title().catch(() => 'NO-TITLE')
    const h1 = await pub.locator('h1').first().innerText().catch(() => 'NO-H1')
    const body = (await pub.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
    const placeholders = await pub.evaluate(() => (document.body?.innerText || '').match(/\{\{[^}]+\}\}/g) || [])
    note(`PUB ${res?.status()} ${url} title=${JSON.stringify(title)} h1=${JSON.stringify(h1)} placeholders=${JSON.stringify(placeholders)}`)
    note(`  body: ${body}`)
    const safe = url.replace(/https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 80)
    await pub.screenshot({ path: `${SHOTS}/pub-${safe}.png`, fullPage: true })
  }
  await pub.close()

  // Try creating a brand? Critic is audit-only; BOSSMAN allows uniquely named audit Brands.
  // Do NOT create one here — Bugsy owns rescue-qa-20260923. Observe only.

} finally {
  writeFileSync(`${SHOTS}/walk-notes.txt`, notes.join('\n') + '\n')
  await browser.close()
}

console.log('DONE notes=', notes.length)
