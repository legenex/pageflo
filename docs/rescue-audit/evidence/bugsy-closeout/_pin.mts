import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const PIN = 'https://pageflo-rescue-acceptance-944138.preview.pageflo.io/adv/pinmugkkmjl'
const MARKER = `BUGSY-MUST-NOT-LEAK-${Date.now().toString(36)}`
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
await page.waitForURL(/\/admin/, { timeout: 45000 }).catch(async () => {
  await page.screenshot({ path: path.join(HERE, 'p00-login.png'), fullPage: true })
  console.log('login url', page.url(), (await page.locator('body').innerText()).slice(0, 200))
})

const before = await fetch(PIN, { cache: 'no-store' }).then((r) => r.text())
console.log('before has Snapshot after', before.includes('Snapshot after PINTEST-pinmugkkmjl'), 'has marker', before.includes(MARKER))

await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Deployments/i }).first().click()
await page.waitForTimeout(800)
const pinRow = page.locator('div').filter({ hasText: '/adv/pinmugkkmjl' }).first()
console.log('pin row', await pinRow.count())
await pinRow.getByRole('button', { name: /Edit/i }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(HERE, 'p01-dep-editor.png'), fullPage: true })
// Open the bound master from the deployment editor if there's a link; otherwise go to masters
const openMaster = page.getByRole('button', { name: /Edit advertorial|Open advertorial|Edit article/i }).first()
console.log('open master ctrl', await openMaster.count())
if (await openMaster.count()) await openMaster.click()
await page.waitForTimeout(800)

await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
const twoDep = page.locator('div').filter({ hasText: '2 deployments' }).first()
console.log('2-deployments row', await twoDep.count())
if (await twoDep.count()) {
  await twoDep.getByRole('button', { name: /Edit advertorial|^Edit$/i }).first().click()
} else {
  // skip archived first row: click second Edit
  await page.getByRole('button', { name: /Edit advertorial/i }).nth(1).click()
}
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(HERE, 'p02-master.png'), fullPage: true })
const title = await page.locator('body').innerText()
console.log('editor header', title.slice(0, 200).replace(/\s+/g, ' '))
const box = page.getByPlaceholder('The $4,200 check that cost her $186,000').first()
console.log('headline box', await box.count(), 'current', await box.inputValue().catch(() => ''))
if (await box.count()) await box.fill(MARKER)
const save = page.getByRole('button', { name: /^Save$/i }).first()
await save.click()
await page.waitForTimeout(2000)
await page.screenshot({ path: path.join(HERE, 'p03-saved.png'), fullPage: true })
const after = await fetch(PIN, { cache: 'no-store' }).then((r) => r.text())
console.log('after has marker', after.includes(MARKER), 'still old headline', after.includes('Snapshot after PINTEST-pinmugkkmjl'))
if (await box.count()) await box.fill('Snapshot after PINTEST-pinmugkkmjl')
await save.click()
await page.waitForTimeout(1200)
await browser.close()
console.log('MARKER', MARKER)
