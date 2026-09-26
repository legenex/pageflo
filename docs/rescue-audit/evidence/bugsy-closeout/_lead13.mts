import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const text = readFileSync(CRED, 'utf8')
const fields: Record<string, string> = {}
for (const line of text.split('\n')) {
  const i = line.indexOf(': ')
  if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
}

const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)
await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').first().fill(fields['admin email'])
await page.locator('input[type="password"]').first().fill(fields['temporary password'])
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(/\/admin/, { timeout: 25000 })
await page.goto(`${APP}/admin/leads`, { waitUntil: 'networkidle' })
const open = page.getByRole('button', { name: 'Open lead 13' }).first()
console.log('open lead 13 count', await open.count())
await open.click()
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(HERE, 'f10-lead-13.png'), fullPage: true })
const v = ((await page.locator('body').innerText().catch(() => '')) || '')
console.log('detail', v.slice(0, 1500).replace(/\s+/g, ' '))
await browser.close()
