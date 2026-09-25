/**
 * Production proof: master edit does not change live until Republish.
 *
 *   pnpm exec tsx scripts/test-production-snapshot.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChromium } from './lib/browser.ts'
import type { Page } from 'playwright'

const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const EVIDENCE = path.resolve('docs/rescue-audit/evidence/closeout')
const RUN = `pin${Date.now().toString(36)}`
const MARKER = `PINTEST-${RUN}`
const ADV_PATH = `/adv/${RUN}`
const HEADLINE_BEFORE = `Snapshot before ${RUN}`
const HEADLINE_AFTER = `Snapshot after ${MARKER}`

mkdirSync(EVIDENCE, { recursive: true })

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): boolean => {
  if (cond) {
    pass++
    console.log('  PASS ' + label)
    return true
  }
  fail++
  console.log('  FAIL ' + label)
  return false
}

const creds = () => {
  const text = readFileSync(CRED, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  const email = fields['admin email']
  const password = fields['temporary password']
  if (!email || !password) throw new Error('missing credentials')
  return { email, password }
}

const fetchText = async (url: string) => {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  return { status: res.status, body: await res.text() }
}

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true }).catch(() => null)
}

const fillHeadline = async (page: Page, value: string) => {
  const section = page.getByText('Your compelling headline here').first()
  if (await section.count()) await section.click()
  else {
    const label = page.getByText('Headline', { exact: true }).first()
    if (await label.count()) await label.click()
  }
  await page.waitForTimeout(400)
  const box = page.getByPlaceholder('The $4,200 check that cost her $186,000').first()
  if (await box.count()) {
    await box.fill(value)
    return true
  }
  const ta = page.locator('textarea').nth(0)
  if (await ta.count()) {
    await ta.fill(value)
    return true
  }
  return false
}

const { email, password } = creds()
const browser = await launchChromium({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(25000)

try {
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 })

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /New Advertorial/i }).click()
  await page.waitForTimeout(1500)
  t(await fillHeadline(page, HEADLINE_BEFORE), 'typed the before headline on the new master')
  await page.getByRole('button', { name: /^Save$/i }).first().click()
  await page.waitForTimeout(1800)
  const pubMaster = page.getByRole('button', { name: /^Publish$/i }).first()
  if (await pubMaster.count()) {
    await pubMaster.click()
    await page.waitForTimeout(1800)
  }
  await shot(page, 'snap-02-master-saved')

  await page.getByRole('button', { name: /^Back$/i }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /New Deployment/i }).click()
  await page.waitForTimeout(1200)

  const selects = page.locator('select')
  const n = await selects.count()
  for (let i = 0; i < n; i++) {
    const sel = selects.nth(i)
    const options = await sel.locator('option').allTextContents()
    const brand = options.find((o) => o.includes('PageFlo Rescue Acceptance'))
    const domain = options.find((o) => o.includes(BRAND_SLUG) && o.includes('preview.pageflo.io'))
    const untitled = options.find((o) => o.includes('Untitled Advertorial'))
    if (brand) await sel.selectOption({ label: brand }).catch(() => null)
    else if (domain) await sel.selectOption({ label: domain }).catch(() => null)
    else if (untitled) await sel.selectOption({ label: untitled }).catch(() => null)
  }
  const pathField = page.getByPlaceholder(/\/adv\//).first()
  if (await pathField.count()) await pathField.fill(ADV_PATH)
  await page.getByRole('button', { name: /Create deployment|Save changes/i }).first().click()
  await page.waitForTimeout(2500)
  await shot(page, 'snap-03-deployment')

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(800)
  const pinRow = page.locator('div').filter({ hasText: ADV_PATH }).first()
  t(await pinRow.count() > 0, `deployment row for ${ADV_PATH} is listed`)
  const publishOnRow = pinRow.getByRole('button', { name: /^Publish$/i }).first()
  if (await publishOnRow.count()) {
    await publishOnRow.click()
    await page.waitForTimeout(2500)
  }

  const liveUrl = `${PREVIEW}${ADV_PATH}`
  const beforeEdit = await fetchText(liveUrl)
  t(beforeEdit.status === 200, `live URL 200 (${liveUrl})`)
  t(beforeEdit.body.includes(HEADLINE_BEFORE), 'live serves the before headline')
  t(!beforeEdit.body.includes(MARKER), 'live does not contain the after marker yet')
  writeFileSync(path.join(EVIDENCE, 'snap-before.html'), beforeEdit.body.slice(0, 40000))

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Advertorials$/i }).first().click().catch(() => null)
  await page.waitForTimeout(800)
  await shot(page, 'snap-03b-masters')
  const firstEdit = page.getByText('Edit', { exact: true }).first()
  t(await firstEdit.count() > 0, 'Edit control on master list')
  await firstEdit.click()
  await page.waitForTimeout(1500)
  t(await fillHeadline(page, HEADLINE_AFTER), 'typed the after headline on the master')
  await page.getByRole('button', { name: /^Save$/i }).first().click()
  await page.waitForTimeout(1800)
  await shot(page, 'snap-04-master-edited')

  const afterEdit = await fetchText(liveUrl)
  t(afterEdit.status === 200, 'live URL still 200 after master edit')
  t(afterEdit.body.includes(HEADLINE_BEFORE), 'live still serves the before headline')
  t(!afterEdit.body.includes(MARKER), 'live is unchanged after master edit (pin holds)')

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(800)
  const row = page.locator('div').filter({ hasText: ADV_PATH }).first()
  const republish = row.getByLabel('Republish deployment').first()
  t(await republish.count() > 0, 'Republish control exists on the pin deployment')
  await republish.click()
  await page.waitForTimeout(3000)
  await shot(page, 'snap-05-republish')

  const afterRepub = await fetchText(liveUrl)
  t(afterRepub.status === 200, 'live URL 200 after republish')
  t(afterRepub.body.includes(MARKER), 'live contains the new master after explicit republish')
  writeFileSync(path.join(EVIDENCE, 'snap-after.html'), afterRepub.body.slice(0, 40000))
} catch (err) {
  fail++
  console.log('  FAIL uncaught', err)
  await shot(page, 'snap-zz')
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed  run=${RUN} path=${ADV_PATH}`)
if (fail > 0) process.exit(1)
