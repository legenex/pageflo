/**
 * Critic isolation re-proof. Reset existing brand-bound editor via Users UI
 * (password never printed) and check Brands list tenancy.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import type { Page } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const ISO_EMAIL = 'bugsy-iso-bugsymugkw2g5@legenex.test'
const ISO_PASSWORD = `IsoCritic2${Date.now().toString(36)}Qa9!`

const creds = () => {
  const text = readFileSync(CRED, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  return { email: fields['admin email'], password: fields['temporary password'] }
}

const visible = async (page: Page) => ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(HERE, `${name}.png`), fullPage: true }).catch(() => null)
  console.log(`SHOT ${name} ${page.url()}`)
}

const { email, password } = creds()
if (!email || !password) throw new Error('missing operator credentials')

const notes: string[] = []
const log = (s: string) => {
  notes.push(s)
  console.log(s)
}

const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)

try {
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 })

  await page.goto(`${APP}/admin/settings/users`, { waitUntil: 'networkidle' })
  await shot(page, 'v2-20-users')
  const row = page.locator('li').filter({ hasText: ISO_EMAIL }).first()
  log(`iso row count=${await row.count()}`)
  if ((await row.count()) === 0) throw new Error('iso user row not found')
  await row.getByRole('button', { name: 'Row actions' }).click()
  await page.getByText('Edit user', { exact: true }).click()
  await page.waitForTimeout(600)
  await shot(page, 'v2-21-iso-edit')
  const pw = page.locator('input[name="password"]').first()
  await pw.fill(ISO_PASSWORD)
  const status = page.locator('select[name="status"]').first()
  if (await status.count()) await status.selectOption('active').catch(() => null)
  await page.getByRole('button', { name: /Save changes|Save/i }).last().click()
  await page.waitForTimeout(2000)
  await shot(page, 'v2-22-iso-saved')
  log(`save toast/body has Saved or updated=${/saved|updated/i.test(await visible(page))}`)

  const iso = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  iso.setDefaultTimeout(25000)
  await iso.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await iso.locator('input[type="email"], input[name="email"]').first().fill(ISO_EMAIL)
  await iso.locator('input[type="password"], input[name="password"]').first().fill(ISO_PASSWORD)
  await iso.locator('button[type="submit"]').first().click()
  await iso.waitForURL(/\/admin/, { timeout: 25000 }).catch(() => null)
  log(`iso login url=${iso.url()}`)
  await shot(iso, 'v2-23-iso-login')
  if (!/\/admin/.test(iso.url())) throw new Error('iso login failed after password reset')

  await iso.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
  await shot(iso, 'v2-24-iso-brands')
  const sites = await visible(iso)
  const foreign = ['Dont Settle', "Don't Settle", 'Accident Compensation Helper', 'Rescue QA 20260924', 'Rescue Funnel', 'Rescue Sec A', 'Rescue Sec B', 'Rescue Odin']
  const hits = foreign.filter((n) => sites.includes(n))
  log(`iso brands foreignHits=${JSON.stringify(hits)} hasAcceptance=${/Rescue Acceptance|pageflo-rescue-acceptance/i.test(sites)}`)
  log(`iso brands snippet=${sites.slice(0, 700)}`)

  await iso.goto(`${APP}/admin/sites/dont-settle`, { waitUntil: 'networkidle' })
  await shot(iso, 'v2-25-iso-dont-settle')
  log(`direct dont-settle url=${iso.url()} text=${(await visible(iso)).slice(0, 280)}`)

  const api = await iso.request.get(`${APP}/api/sites`)
  const apiBody = await api.text()
  log(`GET /api/sites status=${api.status()} hasDontSettle=${/dont-settle/i.test(apiBody)}`)
  await iso.close()
} catch (err) {
  log(`FAIL ${err instanceof Error ? err.message : String(err)}`)
  await shot(page, 'v2-iso-zz')
} finally {
  await browser.close()
}

writeFileSync(path.join(HERE, 'iso-notes.txt'), notes.join('\n') + '\n')
