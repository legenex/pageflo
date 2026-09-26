// READ-ONLY production spot check. Opens leads and reads text. Clicks nothing that mutates.
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import { APP, login, norm } from '../../../../scripts/lib/production.mts'
import { writeFileSync } from 'node:fs'
const out: string[] = []
const log = (s: string) => { out.push(s); console.log(s) }
const browser = await launchChromium({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
await login(page)
await page.goto(`${APP}/admin/leads?range=all&test=1`, { waitUntil: 'networkidle' })
const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 260)))
log(`ROWS ${rows.length}`)
rows.forEach((r) => log('ROW ' + r))
const ids = await page.locator('button[aria-label^="Open lead "]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')!.replace('Open lead ', '')))
log('IDS ' + ids.join(','))
for (const id of ids.filter((i) => ['33','35'].includes(i))) {
  await page.goto(`${APP}/admin/leads?range=all&test=1`, { waitUntil: 'networkidle' })
  await page.locator(`button[aria-label="Open lead ${id}"]`).first().click()
  const d = page.locator('[role="dialog"]')
  await d.waitFor()
  const main = norm(await d.innerText())
  await d.getByRole('button', { name: 'Delivery Log' }).click()
  const del = norm(await d.innerText())
  await d.getByRole('button', { name: 'HLR Trace' }).click()
  const hlr = norm(await d.innerText())
  log(`--- LEAD ${id}\nMAIN: ${main.slice(0, 1400)}\nDELIVERY: ${del.slice(0, 1600)}\nHLR: ${hlr.slice(0, 500)}`)
  await page.keyboard.press('Escape')
}
writeFileSync(new URL('./_spot-output-3.txt', import.meta.url), out.join('\n'))
await browser.close()
