/**
 * Production smoke after a rescue release.
 *
 *   pnpm exec tsx scripts/test-production-smoke.mts
 *
 * Reads `/home/legenex/.pageflo-admin-credentials` (mode 600). Never prints
 * the password. Hits public hosts and signs in at app.pageflo.io.
 */
import { readFileSync } from 'node:fs'
import { launchChromium } from './lib/browser.ts'

const CRED = '/home/legenex/.pageflo-admin-credentials'

const needles = [
  '{{site.name}}',
  '(800) 000-0000',
  'Dynamic figure',
  'This deployment',
  'Injury Type12121212',
  '/submitted (Qualified)',
  '/thanks (DQ)',
]

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const creds = (): { email: string; password: string } => {
  const text = readFileSync(CRED, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  const email = fields['admin email']
  const password = fields['temporary password']
  if (!email || !password) throw new Error('credentials file missing email or password')
  return { email, password }
}

const fetchText = async (url: string): Promise<{ status: number; body: string }> => {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: await res.text() }
}

const health = await fetch('https://app.pageflo.io/api/pageflo/health')
t(health.ok, 'app.pageflo.io health 200')
const legacy = await fetch('https://os.legenex.com/api/legalos/health')
t(legacy.ok, 'os.legenex.com health 200')

for (const url of [
  'https://dont-settle.preview.pageflo.io/',
  'https://dont-settle.preview.pageflo.io/terms',
  'https://dont-settle.preview.pageflo.io/s/dont-settle',
  'https://dont-settle.preview.pageflo.io/c',
  'https://dont-settle.preview.pageflo.io/adv/letter',
]) {
  const { status, body } = await fetchText(url)
  t(status === 200, `${url} 200`)
  const hits = needles.filter((n) => body.includes(n))
  t(hits.length === 0, `${url} has no authoring junk (${hits.join(', ') || 'none'})`)
}

const { email, password } = creds()
const browser = await launchChromium({ headless: true })
const page = await browser.newPage()
await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"]').first().fill(email)
await page.locator('input[type="password"], input[name="password"]').first().fill(password)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(/\/admin/, { timeout: 20000 }).catch(() => null)
t(/\/admin/.test(page.url()), 'signed in at app.pageflo.io reaches /admin')

await page.goto('https://app.pageflo.io/admin/sites/accident-compensation-helper', { waitUntil: 'networkidle' })
const createHome = page.getByRole('button', { name: /Create published Home/i })
if (await createHome.count()) {
  await createHome.click()
  await page.waitForTimeout(2500)
}
await browser.close()

const ach = await fetchText('https://accident-compensation-helper.preview.pageflo.io/')
t(ach.status === 200, 'ACH preview Home 200 after ensure-home')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
