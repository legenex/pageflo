/**
 * Visual QA capture for a PageFlo surface.
 *
 * Usage: node scripts/qa/shot.mjs <url> <out.png> <width> <height> [cookie]
 *
 * Hostnames used for host-role QA (pageflo.test, app.pageflo.test) are mapped to
 * the local server with Chromium's host resolver rather than /etc/hosts, so the
 * capture works in a container with no write access to system name resolution.
 */
import { chromium } from 'playwright'

const [url, out, w = '1440', h = '900', cookie = ''] = process.argv.slice(2)

const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--host-resolver-rules=MAP pageflo.test 127.0.0.1, MAP app.pageflo.test 127.0.0.1, MAP www.pageflo.test 127.0.0.1, MAP legacy.pageflo.test 127.0.0.1',
  ],
})
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })
if (cookie) {
  const [name, value] = cookie.split('=')
  const u = new URL(url)
  await ctx.addCookies([{ name, value, domain: u.hostname, path: '/' }])
}
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(500)
await page.screenshot({ path: out, fullPage: true })

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
console.log(JSON.stringify({ url, status: res?.status() ?? 0, viewport: `${w}x${h}`, horizontalOverflow: overflow, consoleErrors: errors.slice(0, 6) }))
await browser.close()
