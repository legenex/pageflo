// READ-ONLY: list advertorial deployments (status, path) and fetch their public URLs.
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import { APP, ACCEPTANCE, login, norm } from '../../../../scripts/lib/production.mts'
const browser = await launchChromium({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await login(page)
await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /^Deployments$/i }).first().click()
await page.waitForTimeout(800)
const cards = await page.locator('[data-adv-deployment]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-adv-deployment'), status: e.getAttribute('data-adv-deployment-status'), text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 400) })))
for (const c of cards) console.log(JSON.stringify(c))
await browser.close()
