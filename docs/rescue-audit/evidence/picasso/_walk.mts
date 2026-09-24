/**
 * Picasso production UX walk. Screenshots + structured notes only.
 * Never prints passwords. Never deletes production data.
 */
import { chromium, type BrowserContext, type Page } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/picasso'
mkdirSync(SHOTS, { recursive: true })

const creds: Record<string, string> = {}
for (const line of readFileSync('/tmp/pf-picasso-creds.env', 'utf8').split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) creds[line.slice(0, i)] = line.slice(i + 1)
}
const SUPER_EMAIL = creds.SUPER_ADMIN_EMAIL
const SUPER_PASSWORD = creds.SUPER_ADMIN_PASSWORD
const CAPTURE_EMAIL = creds.BUILDLOG_CAPTURE_EMAIL
const CAPTURE_PASSWORD = creds.BUILDLOG_CAPTURE_PASSWORD
if (!SUPER_EMAIL || !SUPER_PASSWORD || !CAPTURE_EMAIL || !CAPTURE_PASSWORD) {
  throw new Error('missing creds')
}

type Viewport = { width: number; height: number }
const VP = {
  desktop: { width: 1440, height: 900 } satisfies Viewport,
  tablet: { width: 768, height: 1024 } satisfies Viewport,
  mobile: { width: 375, height: 812 } satisfies Viewport,
}

const notes: Array<Record<string, unknown>> = []
const consoleErrors: Array<{ url: string; text: string }> = []
const note = (id: string, title: string, detail: unknown, extra?: Record<string, unknown>) => {
  const row = { id, title, detail, ...extra }
  notes.push(row)
  const preview = typeof detail === 'string' ? detail.slice(0, 240) : JSON.stringify(detail).slice(0, 240)
  console.log(`[${id}] ${title} :: ${preview}`)
}

const LEAK_RE =
  /LegalOS|legalos|Payload|Brand Kit|collection['"]|funnel-|preview\.legenex|os\.legenex|Wired in next|TODO|FIXME|not implemented|coming soon|Site\b|Sites\b/gi

const bodyText = async (page: Page) =>
  (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

const shot = async (page: Page, name: string, fullPage = true) => {
  const path = `${SHOTS}/${name}.png`
  await page.screenshot({ path, fullPage, timeout: 20000 }).catch(async () => {
    await page.screenshot({ path, fullPage: false, timeout: 10000 })
  })
  note(`SHOT-${name}`, name, page.url(), { evidence: [`${name}.png`], viewport: page.viewportSize() })
}

const inspect = async (page: Page, name: string) => {
  const url = page.url()
  const title = await page.title().catch(() => '')
  const heading = await page
    .locator('h1, h2')
    .first()
    .innerText()
    .catch(() => 'NO-HEADING')
  const text = (await bodyText(page)).slice(0, 1400)
  const buttons = await page
    .locator('button, a, [role="button"]')
    .evaluateAll((els) =>
      els
        .slice(0, 80)
        .map((el) => {
          const e = el as HTMLElement
          const label = (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()
          return {
            tag: e.tagName.toLowerCase(),
            label: label.slice(0, 80),
            disabled: (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true',
            href: (e as HTMLAnchorElement).href || '',
          }
        })
        .filter((x) => x.label),
    )
    .catch(() => [])
  const nav = await page
    .locator('nav, [aria-label="Console"], aside')
    .first()
    .innerText()
    .catch(() => '')
  const alerts = await page
    .locator('[role="alert"], [data-toast], .toast')
    .allInnerTexts()
    .catch(() => [])
  const overflow = await page.evaluate(() => {
    const vw = window.innerWidth
    const sw = document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth
    const extras: Array<{ tag: string; cls: string; right: number }> = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.right > vw + 4 && r.width > 24 && r.height > 8) {
        extras.push({
          tag: el.tagName.toLowerCase(),
          cls: String((el as HTMLElement).className || '').slice(0, 70),
          right: Math.round(r.right),
        })
        if (extras.length >= 6) break
      }
    }
    return { innerWidth: vw, scrollWidth: sw, overflowPx: Math.max(0, sw - vw), extras }
  })
  const leaks = [...new Set(text.match(LEAK_RE) || [])]
  note(`PAGE-${name}`, heading, {
    url,
    title,
    heading,
    text: text.slice(0, 900),
    nav: nav.replace(/\s+/g, ' ').slice(0, 500),
    buttons: buttons.slice(0, 40),
    disabled: buttons.filter((b) => b.disabled).map((b) => b.label),
    alerts,
    overflow,
    leaks,
  })
  await shot(page, name)
}

const goto = async (page: Page, path: string, wait = 800) => {
  const res = await page.goto(`https://app.pageflo.io${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(wait)
  return res
}

const clickText = async (page: Page, text: string | RegExp, timeout = 4000) => {
  const loc = page.getByRole('button', { name: text }).first()
  if (await loc.count()) {
    await loc.click({ timeout }).catch(() => {})
    return true
  }
  const fallback = page.locator('button, a, [role="button"]').filter({ hasText: text }).first()
  if (await fallback.count()) {
    await fallback.click({ timeout }).catch(() => {})
    return true
  }
  return false
}

const attachConsole = (page: Page) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text().slice(0, 400) })
  })
  page.on('pageerror', (err) => {
    consoleErrors.push({ url: page.url(), text: String(err).slice(0, 400) })
  })
}

const loginViaApi = async (context: BrowserContext, email: string, password: string) => {
  const res = await context.request.post('https://app.pageflo.io/api/users/login', {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })
  const status = res.status()
  const json = await res.json().catch(() => ({}))
  return {
    status,
    ok: status === 200 && Boolean((json as { token?: string }).token),
    message: String((json as { errors?: Array<{ message: string }> }).errors?.[0]?.message || (json as { message?: string }).message || ''),
    email: (json as { user?: { email?: string } }).user?.email,
    super: (json as { user?: { super_admin?: boolean } }).user?.super_admin,
  }
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  // ------------------------------------------------------------------ sign-in surfaces
  const anon = await browser.newContext({ viewport: VP.desktop, ignoreHTTPSErrors: true })
  const sign = await anon.newPage()
  attachConsole(sign)
  sign.setDefaultTimeout(25000)
  await sign.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  await sign.waitForTimeout(600)
  await inspect(sign, '01-signin-desktop')
  await sign.setViewportSize(VP.tablet)
  await sign.waitForTimeout(300)
  await inspect(sign, '01b-signin-tablet')
  await sign.setViewportSize(VP.mobile)
  await sign.waitForTimeout(300)
  await inspect(sign, '01c-signin-mobile')

  await sign.setViewportSize(VP.desktop)
  const forgot = await sign.locator('a', { hasText: 'Forgot password' }).getAttribute('href')
  note('OBS-forgot-href', 'Forgot password href', forgot)
  await sign.goto('https://app.pageflo.io/cms/forgot', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
  await sign.waitForTimeout(800)
  await inspect(sign, '01d-forgot-password')

  // One SUPER_ADMIN attempt: document lockout. Do not retry.
  await sign.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  await sign.fill('input[name="email"]', SUPER_EMAIL)
  await sign.fill('input[name="password"]', SUPER_PASSWORD)
  await sign.click('button[type="submit"]')
  await sign.waitForTimeout(2500)
  const superAlert = (await sign.locator('[role="alert"]').innerText().catch(() => '')).trim()
  note('OBS-super-admin-form', 'SUPER_ADMIN form result', {
    url: sign.url(),
    alert: superAlert,
    stillOnSignIn: sign.url().includes('sign-in'),
  })
  await shot(sign, '01e-super-admin-locked')
  await anon.close()

  // ------------------------------------------------------------------ authenticated session
  const context = await browser.newContext({ viewport: VP.desktop, ignoreHTTPSErrors: true })
  const apiLogin = await loginViaApi(context, CAPTURE_EMAIL, CAPTURE_PASSWORD)
  note('OBS-login-api', 'Capture super-admin API login', {
    status: apiLogin.status,
    ok: apiLogin.ok,
    email: apiLogin.email,
    super: apiLogin.super,
    message: apiLogin.message,
  })
  if (!apiLogin.ok) throw new Error('capture API login failed')

  const page = await context.newPage()
  attachConsole(page)
  page.setDefaultTimeout(35000)

  // Also prove the operator form works for an unlocked super-admin.
  await page.goto('https://app.pageflo.io/sign-in', { waitUntil: 'domcontentloaded' })
  // Cookie from API login may already bounce us in.
  if (page.url().includes('sign-in')) {
    await page.fill('input[name="email"]', CAPTURE_EMAIL)
    await page.fill('input[name="password"]', CAPTURE_PASSWORD)
    await Promise.all([
      page.waitForURL(/\/admin\//, { timeout: 40000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(1200)
  }
  note('OBS-after-login', 'Landed after login', page.url())
  if (page.url().includes('sign-in')) {
    await page.goto('https://app.pageflo.io/admin/overview', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
  }
  await inspect(page, '02-overview-desktop')

  const routes: Array<{ path: string; name: string; wait?: number }> = [
    { path: '/admin/sites', name: '03-brands' },
    { path: '/admin/websites', name: '04-websites' },
    { path: '/admin/quizzes', name: '05-quizzes', wait: 2500 },
    { path: '/admin/landing-pages', name: '06-landing-pages', wait: 2500 },
    { path: '/admin/advertorials', name: '07-advertorials', wait: 2000 },
    { path: '/admin/deployments', name: '08-deployments' },
    { path: '/admin/brands/domains', name: '09-domains' },
    { path: '/admin/brands/brand-identities', name: '10-brand-identities', wait: 2000 },
    { path: '/admin/leads', name: '11-leads' },
    { path: '/admin/analytics', name: '12-analytics' },
    { path: '/admin/integrity', name: '13-integrity' },
    { path: '/admin/system', name: '14-system' },
    { path: '/admin/settings', name: '15-settings-index' },
    { path: '/admin/settings/integrations', name: '16-integrations' },
    { path: '/admin/settings/users', name: '17-users' },
    { path: '/admin/settings/system', name: '18-system-health' },
    { path: '/admin/profile', name: '19-profile' },
    { path: '/admin/plan', name: '20-agent-plan' },
    { path: '/admin/buildlog', name: '21-buildlog' },
    { path: '/admin/handbook', name: '22-handbook' },
    { path: '/cms', name: '23-payload-cms', wait: 1500 },
  ]

  for (const r of routes) {
    try {
      const res = await goto(page, r.path, r.wait ?? 900)
      note(`ROUTE-${r.name}`, r.path, {
        status: res?.status(),
        bounced: page.url().includes('sign-in'),
        final: page.url(),
      })
      await inspect(page, r.name)
    } catch (err) {
      note(`ERR-${r.name}`, r.path, String(err))
      await shot(page, `${r.name}-error`)
    }
  }

  // ------------------------------------------------------------------ Brands: create wizard + existing brand
  await goto(page, '/admin/sites', 800)
  await clickText(page, /New Brand/)
  await page.waitForTimeout(500)
  await inspect(page, '24-new-brand-wizard')
  const wizardText = await bodyText(page)
  note('OBS-wizard-terms', 'New Brand wizard copy', wizardText.slice(0, 700))
  await page.keyboard.press('Escape').catch(() => {})
  await clickText(page, /^Close$|^Cancel$/).catch(() => {})
  await page.waitForTimeout(300)

  const brandHrefs = await page.locator('a[href^="/admin/sites/"]').evaluateAll((els) =>
    els
      .map((el) => ({ href: (el as HTMLAnchorElement).pathname, text: (el.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => /^\/admin\/sites\/[^/]+$/.test(x.href)),
  )
  note('OBS-brand-links', 'Brand list links', brandHrefs.slice(0, 15))
  const brandPath = brandHrefs[0]?.href || '/admin/sites/dont-settle'
  await goto(page, brandPath, 1000)
  await inspect(page, '25-brand-overview')

  const brandSlug = brandPath.split('/').pop() || ''
  for (const sub of [
    { path: `/admin/sites/${brandSlug}/pages`, name: '26-brand-pages' },
    { path: `/admin/sites/${brandSlug}/pages/new`, name: '27-brand-new-page' },
    { path: `/admin/sites/${brandSlug}/blog`, name: '28-brand-blog' },
    { path: `/admin/sites/${brandSlug}/numbers`, name: '29-brand-numbers' },
    { path: `/admin/sites/${brandSlug}/settings/general`, name: '30-brand-general' },
    { path: `/admin/sites/${brandSlug}/settings/domains`, name: '31-brand-domains' },
    { path: `/admin/sites/${brandSlug}/settings/paths`, name: '32-brand-paths' },
    { path: `/admin/sites/${brandSlug}/settings/seo`, name: '33-brand-seo' },
    { path: `/admin/sites/${brandSlug}/settings/tracking`, name: '34-brand-tracking' },
    { path: `/admin/sites/${brandSlug}/settings/users`, name: '35-brand-users' },
    { path: `/admin/sites/${brandSlug}/settings/danger-zone`, name: '36-brand-danger' },
  ]) {
    try {
      await goto(page, sub.path, 800)
      await inspect(page, sub.name)
    } catch (err) {
      note(`ERR-${sub.name}`, sub.path, String(err))
    }
  }

  // Open first page editor if a page row exists. Do not save.
  await goto(page, `/admin/sites/${brandSlug}/pages`, 800)
  const pageEdit = page.locator('a[href*="/pages/"]').filter({ hasNotText: 'new' }).first()
  if (await pageEdit.count()) {
    await pageEdit.click().catch(() => {})
    await page.waitForTimeout(1200)
    await inspect(page, '37-page-editor')
  }

  // ------------------------------------------------------------------ Quizzes: tabs, create, first row, deployment
  await goto(page, '/admin/quizzes', 2000)
  await inspect(page, '38-quiz-flows')
  await clickText(page, /Templates/)
  await page.waitForTimeout(700)
  await inspect(page, '39-quiz-templates')
  await clickText(page, /Deployments/)
  await page.waitForTimeout(700)
  await inspect(page, '40-quiz-deployments')
  await clickText(page, /Quiz Flows/)
  await page.waitForTimeout(400)
  const createdQuiz = await clickText(page, /New Quiz Flow/)
  if (createdQuiz) {
    await page.waitForTimeout(800)
    await inspect(page, '41-quiz-create')
    await clickText(page, /Back|Cancel|Close/)
    await page.keyboard.press('Escape').catch(() => {})
  }
  await goto(page, '/admin/quizzes', 1500)
  const quizRow = page.locator('button, a, [role="button"]').filter({ hasText: /Edit|Open|Untitled|Quiz/ }).first()
  // Click first substantial list row.
  const firstQuizCard = page.locator('[data-quiz-id], [data-id]').first()
  if (await firstQuizCard.count()) {
    await firstQuizCard.click().catch(() => {})
    await page.waitForTimeout(1000)
    await inspect(page, '42-quiz-editor')
  } else {
    // Try clicking a row that is not a tab.
    const rows = page.locator('div, button, a').filter({ hasText: /deployment|live|draft/i })
    if (await rows.count()) {
      await rows.nth(0).click().catch(() => {})
      await page.waitForTimeout(1000)
      await inspect(page, '42-quiz-row')
    }
  }

  await goto(page, '/admin/quizzes', 1500)
  await clickText(page, /Deployments/)
  await page.waitForTimeout(600)
  const newDep = await clickText(page, /New Deployment/)
  if (newDep) {
    await page.waitForTimeout(900)
    await inspect(page, '43-quiz-new-deployment')
    await clickText(page, /Back|Cancel/)
  } else {
    const editDep = page.locator('button[aria-label*="Edit" i], button, a').filter({ hasText: /^Edit$/ }).first()
    if (await editDep.count()) {
      await editDep.click().catch(() => {})
      await page.waitForTimeout(900)
      await inspect(page, '43-quiz-edit-deployment')
      await clickText(page, /Back|Cancel/)
    }
  }

  // ------------------------------------------------------------------ Landing pages
  await goto(page, '/admin/landing-pages', 2000)
  await inspect(page, '44-lp-templates')
  await clickText(page, /New template with Claude|New blank template/)
  await page.waitForTimeout(700)
  await inspect(page, '45-lp-create')
  await page.keyboard.press('Escape').catch(() => {})
  await clickText(page, /Cancel|Close|Back/)
  await clickText(page, /Deployments/)
  await page.waitForTimeout(800)
  await inspect(page, '46-lp-deployments')
  await clickText(page, /New Deployment/)
  await page.waitForTimeout(900)
  await inspect(page, '47-lp-new-deployment')
  await clickText(page, /Back|Cancel/)
  // Existing deployment editor if present
  const lpEdit = page.locator('button[aria-label*="Edit" i], button').filter({ hasText: /^Edit$/ }).first()
  if (await lpEdit.count()) {
    await lpEdit.click().catch(() => {})
    await page.waitForTimeout(1000)
    await inspect(page, '48-lp-edit-deployment')
    await clickText(page, /Tracking & Pixels|Destination/)
    await page.waitForTimeout(400)
    await inspect(page, '48b-lp-deployment-tab')
    await clickText(page, /Back|Cancel/)
  }

  // ------------------------------------------------------------------ Advertorials
  await goto(page, '/admin/advertorials', 1800)
  await clickText(page, /New |Create /)
  await page.waitForTimeout(700)
  await inspect(page, '49-advertorial-create')
  await page.keyboard.press('Escape').catch(() => {})
  await clickText(page, /Deployments/)
  await page.waitForTimeout(600)
  await inspect(page, '50-advertorial-deployments')

  // ------------------------------------------------------------------ Deployments bulk form (do not submit)
  await goto(page, '/admin/deployments', 900)
  await inspect(page, '51-bulk-deploy')

  // ------------------------------------------------------------------ Leads detail
  await goto(page, '/admin/leads', 900)
  const leadRow = page.locator('table tbody tr, [data-lead-id], button, a').filter({ hasText: /@|\+1|lead/i }).first()
  if (await leadRow.count()) {
    await leadRow.click().catch(() => {})
    await page.waitForTimeout(800)
    await inspect(page, '52-lead-detail')
    await page.keyboard.press('Escape').catch(() => {})
  }

  // ------------------------------------------------------------------ Domains add modal
  await goto(page, '/admin/brands/domains', 800)
  await clickText(page, /Add domain|Attach|New domain/i)
  await page.waitForTimeout(500)
  await inspect(page, '53-add-domain')
  await page.keyboard.press('Escape').catch(() => {})

  // ------------------------------------------------------------------ Sidebar IA
  await goto(page, '/admin/overview', 600)
  const sidebar = await page.locator('[data-pageflo-sidebar], aside').first().innerText().catch(() => '')
  note('OBS-sidebar', 'Desktop sidebar labels', sidebar.replace(/\s+/g, ' | ').slice(0, 1200))
  const soon = await page.locator('text=Soon').allInnerTexts().catch(() => [])
  note('OBS-soon', 'Soon badges', soon)

  // Expand Integrations + Settings groups
  await clickText(page, /^Integrations$/)
  await page.waitForTimeout(250)
  await clickText(page, /^Settings$/)
  await page.waitForTimeout(250)
  await inspect(page, '54-nav-expanded')

  // ------------------------------------------------------------------ tablet
  await page.setViewportSize(VP.tablet)
  await goto(page, '/admin/overview', 600)
  await inspect(page, '60-overview-tablet')
  await goto(page, '/admin/sites', 600)
  await inspect(page, '61-brands-tablet')
  await goto(page, '/admin/quizzes', 1800)
  await inspect(page, '62-quizzes-tablet')
  await goto(page, '/admin/landing-pages', 1800)
  await inspect(page, '63-lp-tablet')
  await goto(page, '/admin/deployments', 700)
  await inspect(page, '64-deployments-tablet')
  await goto(page, brandPath, 800)
  await inspect(page, '65-brand-tablet')

  // ------------------------------------------------------------------ mobile
  await page.setViewportSize(VP.mobile)
  await goto(page, '/admin/overview', 700)
  await inspect(page, '70-overview-mobile')
  const hamburger = page.getByRole('button', { name: 'Open navigation' })
  if (await hamburger.count()) {
    await hamburger.click()
    await page.waitForTimeout(400)
    await inspect(page, '71-nav-drawer-mobile')
    await page.keyboard.press('Escape').catch(() => {})
  }
  await goto(page, '/admin/sites', 700)
  await inspect(page, '72-brands-mobile')
  await clickText(page, /New Brand/)
  await page.waitForTimeout(400)
  await inspect(page, '73-new-brand-mobile')
  await page.keyboard.press('Escape').catch(() => {})
  await goto(page, '/admin/quizzes', 1800)
  await inspect(page, '74-quizzes-mobile')
  await goto(page, '/admin/landing-pages', 1800)
  await inspect(page, '75-lp-mobile')
  await goto(page, '/admin/leads', 700)
  await inspect(page, '76-leads-mobile')
  await goto(page, '/admin/deployments', 700)
  await inspect(page, '77-deployments-mobile')
  await goto(page, brandPath, 800)
  await inspect(page, '78-brand-mobile')
  await goto(page, `/admin/sites/${brandSlug}/settings/danger-zone`, 700)
  await inspect(page, '79-danger-mobile')
  await goto(page, '/admin/settings/integrations', 700)
  await inspect(page, '80-integrations-mobile')

  note('OBS-console-errors', 'Collected console/page errors', consoleErrors.slice(0, 40))
  note('OBS-done', 'Walk complete', { notes: notes.length, errors: consoleErrors.length })
} catch (err) {
  note('OBS-crash', 'Walk threw', String(err))
  console.error(err)
} finally {
  writeFileSync(`${SHOTS}/_notes.json`, JSON.stringify({ notes, consoleErrors }, null, 2))
  const lines = notes.map((n) => `${n.id}\t${n.title}\t${JSON.stringify(n.detail).slice(0, 400)}`)
  writeFileSync(`${SHOTS}/walk-notes.txt`, lines.join('\n') + '\n')
  await browser.close()
}

console.log('DONE notes=', notes.length, 'errors=', consoleErrors.length)
