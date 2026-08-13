/* Probe 3: is the UA focus ring visible? + console error locations (string evaluate). */
import { chromium, type Page } from 'playwright'

const BASE = 'http://localhost:3000'
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''
const OUT = '/tmp/claude-0/-home-user-legalos/70ed803d-fc06-51b9-9a5f-a7221d3b37c4/scratchpad/'

const signIn = async (page: Page) => {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', 'team@legenex.com')
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
const errs: Array<{ text: string; url: string }> = []
page.on('console', (m) => { if (m.type() === 'error') errs.push({ text: m.text().slice(0, 90), url: m.location().url }) })

await signIn(page)
await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(1000)

await page.locator('[data-lp-tab="deployments"]').focus()
await page.waitForTimeout(200)
const box = await page.locator('[data-lp-tab="deployments"]').boundingBox()
if (box) {
  await page.screenshot({
    path: `${OUT}probe-focus-ring.png`,
    clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 },
  })
}
// Programmatic .focus() may not match :focus-visible; force keyboard focus too.
await page.evaluate('(document.activeElement && document.activeElement.blur(), undefined)')
for (let i = 0; i < 30; i++) {
  await page.keyboard.press('Tab')
  const onDep = await page.evaluate('document.activeElement && document.activeElement.getAttribute("data-lp-tab") === "deployments"')
  if (onDep) break
}
if (box) {
  await page.screenshot({
    path: `${OUT}probe-focus-ring-kbd.png`,
    clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 },
  })
}

// Public page console errors with locations (mobile-ish is irrelevant here).
const pub = await ctx.newPage()
const perrs: Array<{ text: string; url: string }> = []
pub.on('console', (m) => { if (m.type() === 'error') perrs.push({ text: m.text().slice(0, 90), url: m.location().url }) })
await pub.goto(`${BASE}/c/check-a-case?site=check-a-case`, { waitUntil: 'domcontentloaded' })
await pub.waitForLoadState('networkidle').catch(() => {})
await pub.waitForTimeout(1200)

console.log('admin console errors:', JSON.stringify(errs, null, 1))
console.log('public console errors:', JSON.stringify(perrs, null, 1))
await browser.close()
