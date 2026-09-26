// READ-ONLY: the Leads delivery filter, read from the console.
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import { APP, login } from '../../../../scripts/lib/production.mts'
const browser = await launchChromium({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await login(page)
for (const f of ['delivered', 'failed', 'no-destination', 'not-sent', 'queued']) {
  await page.goto(`${APP}/admin/leads?range=all&test=1&delivery=${f}`, { waitUntil: 'networkidle' })
  const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 30) + ' || ' + ((tr as HTMLElement).querySelector('[data-lead-delivery-state]')?.getAttribute('data-lead-delivery-state') ?? '?')))
  console.log(`FILTER ${f}: ${rows.length} rows`); rows.forEach((r) => console.log('   ' + r))
}
await browser.close()
