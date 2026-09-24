/**
 * Attach the audit pool domain to rescue-odin and click Verify DNS.
 * Does not change public DNS.
 */
import { chromium } from 'playwright'
import { readFileSync, appendFileSync } from 'node:fs'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/odin'
const loadEnv = (path: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1)
  }
  return out
}
const capture = loadEnv('/tmp/pf-odin-capture.env')
const note = (s: string) => {
  console.log(s)
  appendFileSync(`${SHOTS}/walk-notes.txt`, `${new Date().toISOString()} ${s}\n`)
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.setDefaultTimeout(45000)
const shot = async (name: string) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
  note(`SHOT ${name} ${page.url()}`)
}

try {
  await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', capture.BUILDLOG_CAPTURE_EMAIL)
  await page.fill('input[name="password"]', capture.BUILDLOG_CAPTURE_PASSWORD)
  await Promise.all([
    page.waitForURL(/\/admin/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.goto('https://app.pageflo.io/admin/brands/domains', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const host = page.locator('text=rescue-odin-20260923.example').first()
  const card = host.locator('xpath=ancestor::div[contains(@class,"rounded-app")]').first()
  await card.getByLabel(/Expand/).click()
  await page.waitForTimeout(300)
  await shot('20-before-attach')

  await card.locator('select').selectOption({ label: 'Rescue Odin 20260923' }).catch(async () => {
    const opts = await card.locator('select option').allTextContents()
    note(`attach options: ${JSON.stringify(opts)}`)
    const match = await card.locator('select option').evaluateAll((els) =>
      els
        .map((e) => ({ value: (e as HTMLOptionElement).value, text: e.textContent }))
        .find((o) => (o.text || '').includes('Rescue Odin')),
    )
    note(`match ${JSON.stringify(match)}`)
    if (match?.value) await card.locator('select').selectOption(match.value)
  })
  await shot('21-attach-selected')
  await card.getByRole('button', { name: /^Attach$/ }).click()
  await page.waitForTimeout(4000)
  await shot('22-after-attach')
  note(`after attach body: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500)}`)

  await page.goto('https://app.pageflo.io/admin/brands/domains', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const host2 = page.locator('text=rescue-odin-20260923.example').first()
  const card2 = host2.locator('xpath=ancestor::div[contains(@class,"rounded-app")]').first()
  await card2.getByLabel(/Expand/).click()
  await page.waitForTimeout(400)
  await shot('23-attached-expanded')
  const verify = card2.getByRole('button', { name: /Verify DNS/ })
  note(`verify visible: ${await verify.count()}`)
  if (await verify.count()) {
    await verify.click()
    await page.waitForTimeout(5000)
    await shot('24-after-verify')
    note(`after verify: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500)}`)
  }
} catch (err) {
  note(`ATTACH ERROR ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  await shot('zz-attach-failure').catch(() => {})
  throw err
} finally {
  await browser.close()
}
