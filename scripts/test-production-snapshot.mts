/**
 * Production proof: master edit does not change live until Republish.
 *
 *   pnpm exec tsx scripts/test-production-snapshot.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChromium } from './lib/browser.ts'

const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const EVIDENCE = path.resolve('docs/rescue-audit/evidence/closeout')
const RUN = `pin${Date.now().toString(36)}`
const MARKER = `PINTEST-${RUN}`
const PATH = `/adv/${RUN}`

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
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: await res.text() }
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
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-01-new-adv.png'), fullPage: true }).catch(() => null)

  const settings = page.getByRole('button', { name: /^Settings$/i }).first()
  if (await settings.count()) {
    await settings.click()
    await page.waitForTimeout(500)
    const title = page.locator('input').first()
    if (await title.count()) await title.fill(`Snapshot pin ${RUN}`)
  }
  // Seed a distinctive headline in the first text-ish control we can find.
  const headline = page.locator('textarea, [contenteditable="true"], input').filter({ hasText: /headline|compelling/i }).first()
  if (await headline.count()) await headline.fill(`Before pin ${RUN}`)
  const save = page.getByRole('button', { name: /^Save$/i }).first()
  if (await save.count()) {
    await save.click()
    await page.waitForTimeout(1500)
  }
  const publish = page.getByRole('button', { name: /^Publish$/i }).first()
  if (await publish.count()) {
    await publish.click()
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-02-master-saved.png'), fullPage: true }).catch(() => null)

  const back = page.getByRole('button', { name: /^Back$/i }).first()
  if (await back.count()) await back.click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /New Deployment/i }).click()
  await page.waitForTimeout(1200)

  const selects = page.locator('select')
  const n = await selects.count()
  for (let i = 0; i < n; i++) {
    const sel = selects.nth(i)
    const options = await sel.locator('option').allTextContents()
    const brand = options.find((o) => o.includes('PageFlo Rescue Acceptance'))
    const adv = options.find((o) => o.includes(`Snapshot pin ${RUN}`) || o.includes('Untitled Advertorial'))
    const domain = options.find((o) => o.includes(BRAND_SLUG) && o.includes('preview.pageflo.io'))
    if (brand) await sel.selectOption({ label: brand }).catch(() => null)
    else if (adv) await sel.selectOption({ label: adv }).catch(() => null)
    else if (domain) await sel.selectOption({ label: domain }).catch(() => null)
  }
  const pathField = page.getByPlaceholder(/\/adv\//).first()
  if (await pathField.count()) await pathField.fill(PATH)
  await page.getByRole('button', { name: /Create deployment|Save changes/i }).first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-03-deployment.png'), fullPage: true }).catch(() => null)

  const pubDep = page.getByRole('button', { name: /Publish/i }).first()
  if (await pubDep.count()) {
    await pubDep.click()
    await page.waitForTimeout(2500)
  }
  // List view publish
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(800)
  const livePublish = page.getByRole('button', { name: /Publish/i })
  if (await livePublish.count()) await livePublish.first().click().catch(() => null)
  await page.waitForTimeout(2000)

  const liveUrl = `${PREVIEW}${PATH}`
  const beforeEdit = await fetchText(liveUrl)
  t(beforeEdit.status === 200, `live URL 200 before master edit (${liveUrl})`)
  const beforeHasMarker = beforeEdit.body.includes(MARKER)
  t(!beforeHasMarker, 'live does not already contain the post-edit marker')
  writeFileSync(path.join(EVIDENCE, 'snap-before.html'), beforeEdit.body.slice(0, 40000))

  // Edit the master we just made.
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  const row = page.getByText(`Snapshot pin ${RUN}`).first()
  if (await row.count()) await row.click()
  else {
    const untitled = page.getByText(/Untitled Advertorial/i).first()
    if (await untitled.count()) await untitled.click()
  }
  await page.waitForTimeout(1200)
  // Type the marker into a visible editor field.
  const fields = page.locator('textarea, [contenteditable="true"]')
  const fieldCount = await fields.count()
  if (fieldCount > 0) {
    const first = fields.first()
    const current = await first.inputValue().catch(async () => (await first.innerText()) || '')
    await first.fill(`${current} ${MARKER}`.trim()).catch(async () => {
      await first.click()
      await page.keyboard.type(` ${MARKER}`)
    })
  }
  if (await save.count()) {
    await page.getByRole('button', { name: /^Save$/i }).first().click()
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-04-master-edited.png'), fullPage: true }).catch(() => null)

  const afterEdit = await fetchText(liveUrl)
  t(afterEdit.status === 200, 'live URL still 200 after master edit')
  t(!afterEdit.body.includes(MARKER), 'live is unchanged after master edit (pin holds)')

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Deployments/i }).first().click()
  await page.waitForTimeout(800)
  const republish = page.getByRole('button', { name: /Republish/i }).first()
  t(await republish.count() > 0, 'Republish control exists on a live deployment')
  if (await republish.count()) {
    await republish.click()
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-05-republish.png'), fullPage: true }).catch(() => null)

  const afterRepub = await fetchText(liveUrl)
  t(afterRepub.status === 200, 'live URL 200 after republish')
  t(afterRepub.body.includes(MARKER), 'live contains the new master after explicit republish')
  writeFileSync(path.join(EVIDENCE, 'snap-after.html'), afterRepub.body.slice(0, 40000))
} catch (err) {
  fail++
  console.log('  FAIL uncaught', err)
  await page.screenshot({ path: path.join(EVIDENCE, 'snap-zz.png'), fullPage: true }).catch(() => null)
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed  run=${RUN} path=${PATH}`)
if (fail > 0) process.exit(1)
