/**
 * Security reviewer production boundary walk.
 * Screenshots + HTTP probes only. Never prints passwords or session tokens.
 * Does not delete data, change DNS, or send exploit payloads.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/security'
mkdirSync(SHOTS, { recursive: true })

const creds: Record<string, string> = {}
for (const line of readFileSync('/tmp/pf-sec-capture.env', 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) creds[line.slice(0, i)] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const EMAIL = creds.BUILDLOG_CAPTURE_EMAIL
const PASSWORD = creds.BUILDLOG_CAPTURE_PASSWORD
if (!EMAIL || !PASSWORD) throw new Error('missing capture creds')

const ORIGIN = 'https://app.pageflo.io'
const BRANDS = [
  { name: 'Rescue Sec A', slug: 'rescue-sec-a-20260923' },
  { name: 'Rescue Sec B', slug: 'rescue-sec-b-20260923' },
] as const

const notes: string[] = []
const note = (s: string) => {
  notes.push(s)
  console.log(s)
}

const redactHost = (raw: string): string => {
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname}${u.search}`
  } catch {
    return raw
  }
}

const jsonProbe = async (
  label: string,
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string; json: unknown }> => {
  const res = await fetch(url, {
    redirect: 'manual',
    ...init,
    headers: { accept: 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  const snippet = text.replace(/\s+/g, ' ').slice(0, 280)
  note(`HTTP ${label} ${res.status} ${redactHost(url)} body=${snippet}`)
  return { status: res.status, body: text, json: parsed }
}

const collectionSummary = (json: unknown): string => {
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  if (!obj) return 'non-json'
  const docs = Array.isArray(obj.docs) ? obj.docs : []
  const total = typeof obj.totalDocs === 'number' ? obj.totalDocs : docs.length
  const brands = new Set<string>()
  const names: string[] = []
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue
    const row = d as Record<string, unknown>
    const site = row.site
    if (site && typeof site === 'object' && 'name' in site) brands.add(String((site as { name: unknown }).name))
    else if (site && typeof site === 'object' && 'slug' in site) brands.add(String((site as { slug: unknown }).slug))
    else if (typeof site === 'number' || typeof site === 'string') brands.add(`site:${site}`)
    const n = row.name || row.title || row.slug || row.host || row.id
    if (n != null) names.push(String(n).slice(0, 60))
  }
  return `totalDocs=${total} uniqueSiteRefs=${brands.size || 'n/a'} sample=${names.slice(0, 8).join(' | ')}`
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
})
const page = await context.newPage()
page.setDefaultTimeout(45000)

const shot = async (name: string) => {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  note(`SHOT ${name} ${page.url()}`)
}

const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()

const cookieHeader = async (): Promise<string> => {
  const cookies = await context.cookies(ORIGIN)
  return cookies.map((c) => `${c.name}=<redacted len=${c.value.length}>`).join('; ')
}

try {
  note(`operator=${EMAIL} (fallback: production SUPER_ADMIN_PASSWORD does not authenticate team@legenex.com)`)
  note('--- unauthenticated REST / public probes ---')

  await jsonProbe('GET /api/funnel-lp-deployments', `${ORIGIN}/api/funnel-lp-deployments?limit=5`)
  await jsonProbe('GET /api/funnel-quiz-deployments', `${ORIGIN}/api/funnel-quiz-deployments?limit=5`)
  await jsonProbe('GET /api/funnel-advertorial-deployments', `${ORIGIN}/api/funnel-advertorial-deployments?limit=5`)
  await jsonProbe('GET /api/funnel-landing-pages', `${ORIGIN}/api/funnel-landing-pages?limit=5`)
  await jsonProbe('GET /api/funnel-quizzes', `${ORIGIN}/api/funnel-quizzes?limit=5`)
  await jsonProbe('GET /api/sites', `${ORIGIN}/api/sites?limit=5`)
  await jsonProbe('GET /api/leads', `${ORIGIN}/api/leads?limit=5`)
  await jsonProbe('GET /api/users', `${ORIGIN}/api/users?limit=5`)
  await jsonProbe('GET /api/audit-log', `${ORIGIN}/api/audit-log?limit=5`)
  await jsonProbe('GET /api/tracking-configs', `${ORIGIN}/api/tracking-configs?limit=5`)
  await jsonProbe('GET /api/domains', `${ORIGIN}/api/domains?limit=5`)
  await jsonProbe('GET /api/media', `${ORIGIN}/api/media?limit=5`)
  await jsonProbe('GET /cms', `${ORIGIN}/cms`, { headers: { accept: 'text/html' } })
  await jsonProbe('GET /admin/deployments', `${ORIGIN}/admin/deployments`, { headers: { accept: 'text/html' } })
  await jsonProbe('GET /api/pageflo/health', `${ORIGIN}/api/pageflo/health`)
  await jsonProbe('GET /api/graphql', `${ORIGIN}/api/graphql`)
  await jsonProbe('POST /api/leads no host site_slug', `${ORIGIN}/api/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      site_slug: 'rescue-sec-a-20260923',
      funnel_type: 'contact-form',
      contact: { email: 'sec-probe@example.test' },
    }),
  })
  await jsonProbe('POST /api/leads spoof x-pageflo-host', `${ORIGIN}/api/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pageflo-host': 'rescue-sec-a-20260923.preview.pageflo.io',
      'x-legalos-host': 'rescue-sec-a-20260923.preview.pageflo.io',
      'x-forwarded-host': 'rescue-sec-a-20260923.preview.pageflo.io',
    },
    body: JSON.stringify({
      funnel_type: 'contact-form',
      contact: { email: 'sec-probe@example.test' },
    }),
  })
  await jsonProbe('GET preview ?site= unauth', `${ORIGIN}/?site=rescue-sec-a-20260923`, {
    headers: { accept: 'text/html' },
  })
  await jsonProbe('GET preview ?site=&preview=1 unauth', `${ORIGIN}/?site=rescue-sec-a-20260923&preview=1`, {
    headers: { accept: 'text/html' },
  })

  note('--- sign-in ---')
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded' })
  await shot('01-sign-in')
  note(`sign-in title: ${await page.title()}`)

  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL(/\/admin\//, { timeout: 45000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(1500)
  const afterLogin = page.url()
  note(`after submit: ${afterLogin}`)
  if (afterLogin.includes('sign-in')) {
    const alert = page.locator('[role="alert"]')
    const reason = (await alert.count()) ? (await alert.first().innerText()).trim() : '(no alert)'
    note(`LOGIN FAILED form said: ${reason}`)
    await shot('01b-sign-in-failed')
    throw new Error('login failed')
  }
  await shot('02-after-login')
  note(`session cookies: ${await cookieHeader()}`)

  note('--- brands list before create ---')
  await page.goto(`${ORIGIN}/admin/sites`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shot('03-brands-before')
  const brandsBefore = await bodyText()
  for (const b of BRANDS) {
    note(`brand ${b.slug} already listed: ${brandsBefore.includes(b.slug) || brandsBefore.includes(b.name)}`)
  }

  const createBrand = async (name: string, slug: string, shotPrefix: string) => {
    await page.goto(`${ORIGIN}/admin/sites`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const listed = await bodyText()
    if (listed.includes(slug) || listed.includes(name)) {
      note(`CREATE skip ${slug} already present`)
      return 'exists'
    }
    await page.getByRole('button', { name: /new brand/i }).click()
    await page.waitForTimeout(500)
    await shot(`${shotPrefix}-wizard`)
    const nameInput = page.locator('input[placeholder="Claim Checker"]')
    const slugInput = page.locator('input[placeholder="claim-checker"]')
    await nameInput.fill(name)
    await slugInput.fill('')
    await slugInput.fill(slug)
    await shot(`${shotPrefix}-filled`)
    await page.getByRole('button', { name: /create site/i }).click()
    const landed = await page.waitForURL(new RegExp(`/admin/sites/${slug}`), { timeout: 120000 }).then(() => true).catch(() => false)
    await page.waitForTimeout(1500)
    await shot(`${shotPrefix}-after`)
    const url = page.url()
    const err = await page.locator('p, [role="alert"]').filter({ hasText: /already exists|unauthenticated|forbidden|failed/i }).first().innerText().catch(() => '')
    note(`CREATE ${slug} landed=${landed} url=${url} err=${err || 'none'}`)
    return landed ? 'created' : 'failed'
  }

  const aResult = await createBrand(BRANDS[0].name, BRANDS[0].slug, '04a')
  const bResult = await createBrand(BRANDS[1].name, BRANDS[1].slug, '04b')
  note(`brand-a=${aResult} brand-b=${bResult}`)

  await page.goto(`${ORIGIN}/admin/sites`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shot('05-brands-after')
  const brandsAfter = await bodyText()
  note(`brands-after has A: ${brandsAfter.includes(BRANDS[0].slug) || brandsAfter.includes(BRANDS[0].name)}`)
  note(`brands-after has B: ${brandsAfter.includes(BRANDS[1].slug) || brandsAfter.includes(BRANDS[1].name)}`)

  note('--- deployments UI (ARCH-P1-006) ---')
  await page.goto(`${ORIGIN}/admin/deployments`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await shot('06-deployments')
  const depText = await bodyText()
  note(`deployments has A: ${depText.includes(BRANDS[0].name) || depText.includes(BRANDS[0].slug)}`)
  note(`deployments has B: ${depText.includes(BRANDS[1].name) || depText.includes(BRANDS[1].slug)}`)
  const brandMentions = Array.from(
    new Set(
      (depText.match(/Rescue Sec [AB]|Check My Claim|Crash Claim|Settlement|Brand/gi) || []).slice(0, 20),
    ),
  )
  note(`deployments brand-like tokens: ${brandMentions.join(', ') || '(none captured)'}`)
  note(`deployments length=${depText.length} has Bulk: ${/bulk/i.test(depText)}`)

  note('--- landing pages / quizzes / advertorials builders ---')
  await page.goto(`${ORIGIN}/admin/landing-pages`, { waitUntil: 'networkidle' }).catch(() =>
    page.goto(`${ORIGIN}/admin/landing-pages`, { waitUntil: 'domcontentloaded' }),
  )
  await page.waitForTimeout(4000)
  await shot('07-landing-pages')
  const lpText = await bodyText()
  note(`lp builder has A: ${lpText.includes(BRANDS[0].name) || lpText.includes(BRANDS[0].slug)}`)
  note(`lp builder has B: ${lpText.includes(BRANDS[1].name) || lpText.includes(BRANDS[1].slug)}`)
  note(`lp builder snippet: ${lpText.slice(0, 400)}`)

  await page.goto(`${ORIGIN}/admin/quizzes`, { waitUntil: 'networkidle' }).catch(() =>
    page.goto(`${ORIGIN}/admin/quizzes`, { waitUntil: 'domcontentloaded' }),
  )
  await page.waitForTimeout(4000)
  await shot('08-quizzes')
  const quizText = await bodyText()
  note(`quiz builder has A: ${quizText.includes(BRANDS[0].name) || quizText.includes(BRANDS[0].slug)}`)
  note(`quiz builder has B: ${quizText.includes(BRANDS[1].name) || quizText.includes(BRANDS[1].slug)}`)

  await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'networkidle' }).catch(() =>
    page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' }),
  )
  await page.waitForTimeout(4000)
  await shot('09-advertorials')

  await page.goto(`${ORIGIN}/admin/brands/domains`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await shot('10-domains')
  const domText = await bodyText()
  note(`domains has A: ${domText.includes(BRANDS[0].slug)}`)
  note(`domains has B: ${domText.includes(BRANDS[1].slug)}`)

  await page.goto(`${ORIGIN}/admin/leads`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shot('11-leads')
  const leadsText = await bodyText()
  note(`leads snippet: ${leadsText.slice(0, 350)}`)

  await page.goto(`${ORIGIN}/admin/cms`.replace('/admin/cms', '/cms'), { waitUntil: 'domcontentloaded' }).catch(() => null)
  await page.goto(`${ORIGIN}/cms/collections/funnel-lp-deployments`, { waitUntil: 'domcontentloaded' }).catch(() => null)
  await page.waitForTimeout(2500)
  await shot('12-cms-lp-deployments')
  note(`cms url: ${page.url()}`)
  note(`cms snippet: ${(await bodyText()).slice(0, 350)}`)

  note('--- authenticated REST (super_admin; expect global lists) ---')
  const authed = page.request
  const restGets = [
    '/api/funnel-lp-deployments?limit=50&depth=1',
    '/api/funnel-quiz-deployments?limit=50&depth=1',
    '/api/funnel-advertorial-deployments?limit=50&depth=1',
    '/api/funnel-landing-pages?limit=20',
    '/api/funnel-quizzes?limit=20',
    '/api/sites?limit=50',
    '/api/domains?limit=50',
    '/api/leads?limit=5',
    '/api/users?limit=5',
    '/api/audit-log?limit=5',
    '/api/tracking-configs?limit=5',
  ]
  for (const path of restGets) {
    const res = await authed.get(`${ORIGIN}${path}`)
    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    note(`AUTH ${res.status()} ${path} ${collectionSummary(parsed)}`)
  }

  note('--- draft brand anonymous preview hosts ---')
  for (const host of [
    `https://${BRANDS[0].slug}.preview.pageflo.io/`,
    `https://${BRANDS[0].slug}.preview.legenex.com/`,
    `https://${BRANDS[1].slug}.preview.pageflo.io/`,
  ]) {
    try {
      const res = await fetch(host, { redirect: 'manual', headers: { accept: 'text/html' } })
      const t = (await res.text()).replace(/\s+/g, ' ').slice(0, 180)
      note(`PREVIEW ${res.status} ${host} ${t}`)
    } catch (err) {
      note(`PREVIEW ERR ${host} ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await page.goto(`${ORIGIN}/?site=${BRANDS[0].slug}`, { waitUntil: 'domcontentloaded' })
  await shot('13-authed-site-query')
  note(`authed ?site= url=${page.url()} snippet=${(await bodyText()).slice(0, 250)}`)

  await page.goto(`${ORIGIN}/admin/sites/${BRANDS[0].slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('14-brand-a-overview')
  note(`brand A overview url=${page.url()} snippet=${(await bodyText()).slice(0, 300)}`)

  await page.goto(`${ORIGIN}/admin/sites/${BRANDS[1].slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('15-brand-b-overview')
  note(`brand B overview url=${page.url()} snippet=${(await bodyText()).slice(0, 300)}`)
} catch (err) {
  note(`WALK ERROR ${err instanceof Error ? err.stack || err.message : String(err)}`)
  await shot('zz-failure').catch(() => null)
  throw err
} finally {
  writeFileSync(`${SHOTS}/walk-notes.txt`, notes.join('\n') + '\n')
  await browser.close()
}
