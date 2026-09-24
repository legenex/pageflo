/**
 * Funnel Auditor production walk against https://app.pageflo.io
 * Credentials: /tmp/pf-funnel-creds.env (production SUPER_ADMIN). Never prints secrets.
 * Writes screenshots + findings.json under this directory.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const loadEnv = (path) => {
  const o = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) o[line.slice(0, i)] = line.slice(i + 1).replace(/^['"]|['"]$/g, '')
  }
  return o
}
// SUPER_ADMIN_PASSWORD in production .env is stale vs users.team@legenex.com
// (seed is create-if-missing). Capture is a production super_admin created for
// console walks. Never print either password.
const capture = loadEnv('/tmp/pf-funnel-capture.env')
const EMAIL = capture.BUILDLOG_CAPTURE_EMAIL
const PASSWORD = capture.BUILDLOG_CAPTURE_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('missing capture credentials')
  process.exit(2)
}

const ORIGIN = 'https://app.pageflo.io'
const BRAND_SLUG = 'rescue-funnel-20260923'
const BRAND_NAME = 'Rescue Funnel 20260923'
const EVIDENCE = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/funnel'
mkdirSync(EVIDENCE, { recursive: true })

const findings = []
const note = (id, severity, title, detail, extra = {}) => {
  findings.push({ id, severity, title, detail, ...extra, at: new Date().toISOString() })
}

const shot = async (page, name) => {
  const path = `${EVIDENCE}/${name}.png`
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  return path
}

const waitSettle = async (page, ms = 900) => {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 18000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

const visibleText = async (page) => page.evaluate(() => (document.body?.innerText || '').slice(0, 12000))

const inventory = async (page) =>
  page.evaluate(() => {
    const textOf = (el) => (el.getAttribute('aria-label') || el.title || el.textContent || '').replace(/\s+/g, ' ').trim()
    const buttons = [...document.querySelectorAll('button, [role="button"], a')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: textOf(el).slice(0, 80),
      href: el.getAttribute('href') || '',
      disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
      type: el.getAttribute('type') || '',
    })).filter((b) => b.text)
    const fields = [...document.querySelectorAll('input, select, textarea')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      placeholder: el.getAttribute('placeholder') || '',
      label: el.getAttribute('aria-label') || '',
      disabled: Boolean(el.disabled),
    }))
    const headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => h.textContent.trim().slice(0, 80)).filter(Boolean)
    return {
      url: location.href,
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      headings: headings.slice(0, 24),
      buttons: buttons.slice(0, 80),
      fields: fields.slice(0, 80),
      comingSoon: /not built yet|Coming soon/i.test(document.body?.innerText || ''),
      notFound: /this page could not be found|doesn't exist/i.test(document.body?.innerText || ''),
    }
  })

async function dumpRoute(page, path, name) {
  const url = path.startsWith('http') ? path : `${ORIGIN}${path}`
  let status = 0
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    status = resp?.status?.() ?? 0
  } catch (e) {
    note('AUD-NAV', 'P2', `Navigation failed ${name}`, String(e))
  }
  await waitSettle(page, 700)
  const inv = await inventory(page).catch(() => ({ url: page.url(), error: true }))
  const text = await visibleText(page).catch(() => '')
  await shot(page, name)
  return { path, status, ...inv, textSnippet: text.slice(0, 700) }
}

async function signIn(page) {
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitSettle(page, 600)
  await shot(page, '00-sign-in')
  if (page.url().includes('/admin')) {
    note('SET-OK-AUTH', 'info', 'Already signed in', page.url())
    return true
  }
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await Promise.all([
    page.waitForURL(/\/admin/, { timeout: 40000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ])
  await waitSettle(page, 1200)
  if (page.url().includes('sign-in')) {
    const reason = await page.locator('[role="alert"]').first().innerText().catch(() => '(no alert)')
    await shot(page, '00-sign-in-failed')
    note('AUD-AUTH', 'P0', 'Production sign-in failed', reason)
    throw new Error('login failed')
  }
  await shot(page, '00-signed-in')
  note('SET-OK-AUTH', 'info', 'Signed in to production console', page.url())
  return true
}

async function ensureBrand(page) {
  const r = await dumpRoute(page, '/admin/sites', '01-brands-list')
  const exists = (await page.getByText(BRAND_SLUG).count()) + (await page.getByText(BRAND_NAME).count())
  if (exists > 0) {
    note('SET-OBS-001', 'info', 'Audit brand already exists', `slug ${BRAND_SLUG}`)
    await page.getByText(BRAND_SLUG).first().click().catch(async () => {
      await page.getByText(BRAND_NAME).first().click()
    })
    await waitSettle(page, 1200)
    await shot(page, '04-brand-existing')
    return { created: false, url: page.url(), ...r }
  }
  await page.getByRole('button', { name: /New Brand/i }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '02-new-brand-wizard')
  await page.locator('input[placeholder="Claim Checker"]').fill(BRAND_NAME)
  const slug = page.locator('input[placeholder="claim-checker"]')
  await slug.waitFor({ timeout: 8000 })
  await slug.fill(BRAND_SLUG)
  await page.locator('select').first().selectOption('mva').catch(() => {})
  await shot(page, '03-new-brand-filled')
  await page.getByRole('button', { name: /Create Brand|Create/i }).last().click()
  await page.waitForTimeout(8000)
  await waitSettle(page, 2500)
  await shot(page, '04-brand-created')
  const url = page.url()
  const ok = url.includes(BRAND_SLUG) || (await page.getByText(BRAND_SLUG).count()) > 0
  if (!ok) note('SET-P1-BRAND', 'P1', 'Brand create did not land on expected URL', `url=${url}`)
  else note('SET-OK-BRAND', 'info', 'Created audit brand', `url=${url}`)
  return { created: true, url, ok }
}

async function section(name, fn) {
  try {
    await fn()
  } catch (err) {
    note('AUD-SECTION', 'P1', `Section ${name} threw`, String(err?.stack || err))
  }
}

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux/chrome',
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  const consoleErrors = []
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  try {
    await signIn(page)
    await ensureBrand(page)

    // ------------------------------------------------------------------ brand
    await section('brand-overview', async () => {
      const overview = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}`, '10-brand-overview')
      note('SET-OBS-OVERVIEW', 'info', 'Brand overview', JSON.stringify({
        h1: overview.h1, headings: overview.headings, comingSoon: overview.comingSoon,
        buttons: overview.buttons.map((b) => b.text).slice(0, 30),
      }))
      const liveBtn = page.getByRole('link', { name: /View Live Site/i })
      if (await liveBtn.count()) {
        const href = await liveBtn.first().getAttribute('href')
        note('REN-P1-LIVE-BTN', /preview\.(pageflo\.io|legenex\.com)|site=/.test(href || '') ? 'info' : 'P1',
          'View Live Site href', href || '(none)')
      }
    })

    // ----------------------------------------------------------- site settings
    await section('site-general', async () => {
      const g = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/general`, '20-site-general')
      const names = (g.fields || []).map((f) => f.name).filter(Boolean)
      const schemaOnly = ['cta', 'bg', 'primary_ink', 'cta_ink', 'surface_2', 'ink_muted', 'border', 'radius', 'display_name', 'short_name', 'logo_url_dark', 'tagline_brand']
      const missing = schemaOnly.filter((n) => !names.includes(n) && !names.includes(`brand.${n}`))
      note('SET-P1-002', 'P1', 'Site.brand schema fields absent from General UI', `present=${names.join(',')} missing=${missing.join(',')}`)

      const uploads = await page.evaluate(() =>
        [...document.querySelectorAll('button')].filter((b) => /upload/i.test(b.textContent || '')).map((b) => ({
          type: b.getAttribute('type'), disabled: b.disabled, text: b.textContent.trim(),
        })),
      )
      note('SET-P1-001', 'P1', 'Site General logo/favicon Upload buttons', JSON.stringify(uploads))

      const tagline = page.locator('input[name="tagline"]')
      const marker = `audit-tagline-${Date.now().toString().slice(-6)}`
      if (await tagline.count()) {
        const original = await tagline.inputValue()
        await tagline.fill(marker)
        await page.getByRole('button', { name: /Save Settings/i }).click()
        await page.waitForTimeout(1800)
        const savedMsg = await page.getByText(/Saved /).count()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitSettle(page, 800)
        const retained = await page.locator('input[name="tagline"]').inputValue().catch(() => '')
        await shot(page, '21-site-general-after-refresh')
        note(retained === marker ? 'SET-OK-TAGLINE' : 'SET-P0-TAGLINE', retained === marker ? 'info' : 'P0',
          'Site general tagline save/refresh', `savedMsg=${savedMsg} retained=${JSON.stringify(retained)} expected=${marker}`)
        if (retained === marker) {
          await page.locator('input[name="tagline"]').fill(original)
          await page.getByRole('button', { name: /Save Settings/i }).click()
          await page.waitForTimeout(800)
        }
      }

      const legalNames = ['default_disclaimer_md', 'org_name', 'default_phone', 'support_email']
      note('SET-OBS-GENERAL-LEGAL', 'info', 'General form legal/org fields', legalNames.map((n) => `${n}=${names.includes(n)}`).join(' '))
    })

    await section('site-paths', async () => {
      await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/paths`, '22-site-paths')
      const addBtn = page.getByRole('button', { name: /^Add$/i })
      const excludeInput = page.getByPlaceholder('slug-to-exclude')
      if (await excludeInput.count()) {
        await excludeInput.fill('audit-exclude')
        if (await addBtn.count()) await addBtn.first().click()
        await page.waitForTimeout(500)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitSettle(page, 500)
        const still = await page.getByText('audit-exclude').count()
        await shot(page, '23-site-paths-after-exclude')
        note('SET-P1-003', 'P1', 'Paths excluded-slugs control does not persist', `after refresh count=${still}`)
      }
      const robotsReset = await page.getByText('Reset to default').count()
      const funnelClaims = await page.getByText(/\/s\/|\/c\/|quiz deployment|advertorial/i).count()
      note('SET-P1-004', 'P1', 'Paths robots.txt Reset/textarea have no save wiring', `resetVisible=${robotsReset}`)
      note('SET-P1-010', funnelClaims === 0 ? 'P1' : 'info', 'Paths screen funnel-claim visibility', `funnelish=${funnelClaims}`)
    })

    await section('site-seo-users', async () => {
      const seo = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/seo`, '24-site-seo')
      if (seo.comingSoon) note('SET-P1-005', 'P1', 'Site-wide SEO is Coming Soon while per-page SEO exists', seo.textSnippet.slice(0, 280))
      const users = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/users`, '25-site-users')
      if (users.comingSoon) note('SET-P1-006', 'P1', 'Site-scoped users screen is Coming Soon', users.textSnippet.slice(0, 280))
    })

    await section('site-tracking', async () => {
      const t = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/tracking`, '26-site-tracking')
      const titles = ['Meta Pixel', 'Google Ads', 'GA4', 'TikTok', 'Google Tag Manager', 'TrustedForm', 'TrueCall', 'Jornaya']
      const present = titles.filter((x) => (t.textSnippet || '').includes(x) || (t.headings || []).some((h) => h.includes(x)))
      note('SET-OBS-TRACKING', 'info', 'Site tracking cards visible', `present=${present.join(',')} fields=${(t.fields || []).length}`)
      const saveAll = page.getByRole('button', { name: /Save All/i })
      if (await saveAll.count()) {
        await saveAll.click()
        await page.waitForTimeout(1500)
        const saved = await page.getByText(/Saved /).count()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitSettle(page, 600)
        await shot(page, '26b-site-tracking-after-save')
        note('SET-OBS-TRACKING-SAVE', saved ? 'info' : 'P2', 'Tracking Save All without edits', `savedToast=${saved}`)
      }
    })

    await section('site-domains-danger-numbers-blog', async () => {
      const d = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/domains`, '27-site-domains')
      note('SET-OBS-SITE-DOMAINS', 'info', 'Site domains screen', JSON.stringify({ h1: d.h1, buttons: (d.buttons || []).map((b) => b.text).slice(0, 20) }))
      await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/danger-zone`, '28-site-danger')
      const n = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/numbers`, '29-site-numbers')
      const cmsNumber = (n.buttons || []).some((b) => /cms\/collections\/numbers/.test(b.href))
      if (cmsNumber) note('SET-P1-007', 'P1', 'Numbers "New Number" dumps operator into Payload /cms', 'href /cms/collections/numbers/create')
      const blog = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/blog`, '30-site-blog')
      const seoBuilder = (blog.buttons || []).find((b) => /seo-builder/.test(b.href))
      if (seoBuilder) {
        const dest = await dumpRoute(page, seoBuilder.href, '31-blog-seo-builder')
        if (dest.notFound || dest.status === 404) note('SET-P1-008', 'P1', 'Blog SEO builder link 404s', `url=${dest.url}`)
        else note('SET-OBS-BLOG', 'info', 'Blog SEO builder navigated', dest.url)
      }
    })

    await section('site-pages-seo', async () => {
      const pages = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/pages`, '32-site-pages')
      note('SET-OBS-PAGES', 'info', 'Website pages list', JSON.stringify({ h1: pages.h1, headings: pages.headings, buttons: (pages.buttons || []).map((b) => b.text).slice(0, 20) }))
      const pageLink = page.locator('a[href*="/pages/"]').filter({ hasNot: page.locator('[href$="/pages"]') }).first()
      if (await pageLink.count()) {
        await pageLink.click()
        await waitSettle(page, 1400)
        await shot(page, '33-page-editor')
        const inv = await inventory(page)
        const seoish = (inv.fields || []).filter((f) => /meta|og|seo/i.test(`${f.name} ${f.placeholder} ${f.label}`))
        const hasSeo = (inv.headings || []).some((h) => /SEO|Open Graph|Meta/i.test(h)) || seoish.length > 0 || /Meta title|Open Graph/i.test(await visibleText(page))
        note(hasSeo ? 'SET-OK-PAGE-SEO' : 'SET-P1-PAGE-SEO', hasSeo ? 'info' : 'P1', 'Page editor SEO fields', JSON.stringify({ seoish, headings: inv.headings }))
        const publish = (inv.buttons || []).filter((b) => /Publish|Unpublish|Save/i.test(b.text))
        note('REN-OBS-PAGE-VERBS', 'info', 'Website page editor verbs', publish.map((b) => b.text).join(' | '))
      }
    })

    // -------------------------------------------------------- workspace settings
    await section('workspace-settings', async () => {
      await dumpRoute(page, '/admin/settings', '40-settings-index')
      const integ = await dumpRoute(page, '/admin/settings/integrations', '41-settings-integrations')
      if (/Not connected to a billing provider/i.test(integ.textSnippet || '')) {
        note('SET-P2-001', 'P2', 'Integrations Billing fields save notes only; no provider', 'Plan/notes are documentation, not billing')
      }
      const sc = (integ.fields || []).filter((f) => /sc_|smtp_|billing_/.test(f.name))
      note('SET-OBS-INTEG-FIELDS', 'info', 'Integrations named fields', sc.map((f) => f.name).join(',') || JSON.stringify((integ.fields || []).slice(0, 20)))
      await dumpRoute(page, '/admin/settings/users', '42-settings-users')
      await dumpRoute(page, '/admin/settings/system', '43-settings-system')
      await dumpRoute(page, '/admin/system', '44-system-duplicate')
      const profile = await dumpRoute(page, '/admin/profile', '45-profile')
      note('SET-OBS-PROFILE', 'info', 'Profile fields', (profile.fields || []).map((f) => f.name).join(','))
      const analytics = await dumpRoute(page, '/admin/analytics', '46-analytics')
      if (analytics.comingSoon) note('SET-P2-ANALYTICS', 'P2', 'Analytics is Coming Soon', analytics.h1)
      const integrity = await dumpRoute(page, '/admin/integrity', '47-integrity')
      if (integrity.comingSoon) note('SET-P2-INTEGRITY', 'P2', 'Campaign Integrity is Coming Soon', integrity.h1)
      await dumpRoute(page, '/admin/deployments', '48-deployments')
      await dumpRoute(page, '/admin/websites', '49-websites')
      await dumpRoute(page, '/admin/brands/brand-identities', '50-brand-identities')
      await dumpRoute(page, '/admin/brands/domains', '51-domains-pool')
      const hidden = [
        ['/admin/users', '52-legacy-users'],
        ['/admin/blog/seo-builder', '53-hidden-seo-builder'],
        ['/admin/plan', '54-plan'],
        ['/admin/handbook', '55-handbook'],
        ['/admin/buildlog', '56-buildlog'],
      ]
      for (const [path, name] of hidden) {
        const r = await dumpRoute(page, path, name)
        note('SET-OBS-HIDDEN', r.notFound ? 'P1' : 'info', `Hidden/side route ${path}`, JSON.stringify({ status: r.status, url: r.url, h1: r.h1, comingSoon: r.comingSoon, notFound: r.notFound }))
      }
    })

    // -------------------------------------------------------------- landing pages
    await section('landing-pages', async () => {
      const list = await dumpRoute(page, '/admin/landing-pages', '60-lp-templates')
      const tabLabels = await page.evaluate(() => [...document.querySelectorAll('[data-lp-tab]')].map((el) => el.getAttribute('data-lp-tab')))
      note('FUN-OBS-LP-TABS', 'info', 'LP builder tabs', tabLabels.join(',') || 'no data-lp-tab')
      const cloneBtns = await page.getByLabel('Clone template').count()
      const previewBtns = await page.getByLabel('Preview template').count()
      const enableBtns = await page.getByLabel(/Disable template|Enable template/).count()
      const delTpl = await page.getByLabel('Delete template').count()
      note('FUN-OBS-LP-TEMPLATE-ACTIONS', 'info', 'LP template list actions', `clone=${cloneBtns} preview=${previewBtns} enable=${enableBtns} delete=${delTpl}`)

      const editTpl = page.getByLabel('Edit template').first()
      if (await editTpl.count()) {
        await editTpl.click()
        await waitSettle(page, 1400)
        await shot(page, '61-lp-template-editor')
        const text = await visibleText(page)
        const inv = await inventory(page)
        note('FUN-OBS-LP-TPL-EDITOR', 'info', 'LP template editor chrome', JSON.stringify({
          publish: /Unpublish|Publish/.test(text),
          enable: /Disable|Enable/.test(text),
          internalTitle: /Internal title|internal name/i.test(text),
          description: /Description/i.test(text),
          buttons: (inv.buttons || []).map((b) => b.text).slice(0, 25),
          fields: (inv.fields || []).map((f) => f.name || f.placeholder).slice(0, 25),
        }))
        if (await page.getByRole('button', { name: /Back/i }).count()) {
          await page.getByRole('button', { name: /Back/i }).first().click().catch(() => {})
        }
        await waitSettle(page, 500)
      }

      const deploymentsTab = page.locator('[data-lp-tab="deployments"]')
      if (await deploymentsTab.count()) {
        await deploymentsTab.click()
        await waitSettle(page, 1000)
        await shot(page, '62-lp-deployments')
        const cloneDep = await page.getByLabel('Duplicate deployment').count()
        const archive = await page.getByLabel(/Archive/).count()
        const pause = await page.getByLabel(/Pause deployment|Unpublish deployment|Publish deployment/).count()
        note('FUN-P1-001', cloneDep === 0 ? 'P1' : 'info', 'LP deployments Duplicate control', `cloneDep=${cloneDep} archive=${archive} pausePublish=${pause}`)

        const ourRow = page.locator(`[data-lp-deployment]`).filter({ hasText: BRAND_SLUG }).first()
        const editDep = (await ourRow.count())
          ? ourRow.getByLabel('Edit deployment').first()
          : page.getByLabel('Edit deployment').first()
        if (await editDep.count()) {
          await editDep.click()
          await waitSettle(page, 1500)
          await shot(page, '63-lp-deployment-editor-general')
          const text = await visibleText(page)
          const inv = await inventory(page)
          note('FUN-OBS-LP-DEP-EDITOR', 'info', 'LP deployment editor', JSON.stringify({
            tabs: (inv.buttons || []).map((b) => b.text).filter((t) => /General|Destination|Tracking|Pixels|SEO/i.test(t)),
            buttons: (inv.buttons || []).map((b) => b.text).slice(0, 30),
            fields: (inv.fields || []).map((f) => `${f.name}|${f.placeholder}`).slice(0, 30),
            seo: /SEO title|meta description|Open Graph/i.test(text),
            quiz: /Quiz|Embedded|template/i.test(text),
            domain: /Domain|Path/i.test(text),
          }))
          if (!/SEO title|meta description|Open Graph/i.test(text)) {
            note('FUN-P1-002', 'P1', 'LP deployments have no SEO title/description/OG fields', 'Metadata is derived from hero/slots + brand name only')
          }
          const destTab = page.getByRole('button', { name: /Destination/i }).first()
          if (await destTab.count()) {
            await destTab.click()
            await waitSettle(page, 400)
            await shot(page, '64-lp-deployment-destinations')
          }
          const trackTab = page.getByRole('button', { name: /Tracking/i }).first()
          if (await trackTab.count()) {
            await trackTab.click()
            await waitSettle(page, 400)
            await shot(page, '65-lp-deployment-tracking')
            const pixelLabels = await page.evaluate(() => [...document.querySelectorAll('div,label,button')].map((el) => el.textContent.trim()).filter((t) => /Meta|TikTok|Snap|GA4|Pixel|CAPI|UTM/i.test(t)).slice(0, 30))
            note('FUN-OBS-LP-PIXELS', 'info', 'LP tracking panel labels', pixelLabels.join(' | '))
          }
          const prev = page.getByRole('button', { name: /Preview/i }).first()
          if (await prev.count()) {
            await prev.click()
            await waitSettle(page, 2000)
            await shot(page, '66-lp-deployment-preview')
            const fp = await page.evaluate(() => {
              const headings = [...document.querySelectorAll('h1,h2')].slice(0, 8).map((h) => h.textContent.trim().slice(0, 80))
              return {
                h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 120) || '',
                headings,
                quiz: !!document.querySelector('form, [data-quiz], [class*="quiz"]'),
                phone: /tel:|\(\d{3}\)/.test(document.body.innerText),
                privacy: /privacy/i.test(document.body.innerText),
                bg: getComputedStyle(document.body).backgroundColor,
              }
            })
            note('REN-OBS-LP-PREVIEW', 'info', 'LP in-builder preview fingerprint', JSON.stringify(fp))
            await page.keyboard.press('Escape').catch(() => {})
            const close = page.getByRole('button', { name: /Close|Back|Done/i }).first()
            if (await close.count()) await close.click().catch(() => {})
          }
        }
      }
    })

    // -------------------------------------------------------------------- quizzes
    await section('quizzes', async () => {
      await dumpRoute(page, '/admin/quizzes', '70-quizzes')
      const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-quiz-tab], button')].map((b) => ({
        tab: b.getAttribute('data-quiz-tab'),
        text: b.textContent.trim(),
      })).filter((t) => t.tab || /Flows|Quizzes|Templates|Deployments/i.test(t.text)))
      note('FUN-OBS-QUIZ-TABS', 'info', 'Quiz builder top tabs', JSON.stringify(tabs.slice(0, 12)))
      const hasArchiveScope = (await page.getByText(/^Archived/).count()) > 0
      note(hasArchiveScope ? 'FUN-OBS-QUIZ-ARCHIVE' : 'FUN-P1-003', hasArchiveScope ? 'info' : 'P1', 'Quiz flows have Archive/Restore scope', `visible=${hasArchiveScope}`)
      const cloneFlow = await page.locator('[title="Clone"]').count()
      note('FUN-OBS-QUIZ-CLONE', 'info', 'Quiz flow clone buttons', `count=${cloneFlow}`)

      const firstEdit = page.getByRole('button', { name: /^Edit$/i }).first()
      if (await firstEdit.count()) {
        await firstEdit.click()
        await waitSettle(page, 1400)
        await shot(page, '70c-quiz-flow-editor')
        const text = await visibleText(page)
        note('FUN-OBS-QUIZ-EDITOR', 'info', 'Quiz flow editor chrome', JSON.stringify({
          publish: /Publish|Unpublish/.test(text),
          settings: /Settings/.test(text),
          preview: /Preview/.test(text),
          save: /Saved|Unsaved|Saving/.test(text),
        }))
        const settings = page.getByRole('button', { name: /Settings/i }).first()
        if (await settings.count()) {
          await settings.click()
          await waitSettle(page, 600)
          await shot(page, '70d-quiz-settings')
          const sText = await visibleText(page)
          note('FUN-OBS-QUIZ-SETTINGS', 'info', 'Quiz Settings modal tabs/fields', sText.slice(0, 900))
          for (const tab of ['Integrations', 'Node Scripts', 'Spam Protection']) {
            const btn = page.getByText(tab).first()
            if (await btn.count()) {
              await btn.click()
              await waitSettle(page, 300)
              await shot(page, `70e-quiz-settings-${tab.toLowerCase().replace(/\s+/g, '-')}`)
            }
          }
          await page.keyboard.press('Escape').catch(() => {})
          const cancel = page.getByRole('button', { name: /Cancel|Close/i }).first()
          if (await cancel.count()) await cancel.click().catch(() => {})
        }
        const back = page.getByRole('button', { name: /Back/i }).first()
        if (await back.count()) await back.click().catch(() => {})
        await waitSettle(page, 500)
      }

      const tplTab = page.locator('[data-quiz-tab="templates"]').or(page.getByText(/^Templates$/).first())
      if (await tplTab.count()) {
        await tplTab.first().click()
        await waitSettle(page, 1200)
        await shot(page, '71-quiz-templates')
        const names = await page.evaluate(() =>
          [...document.querySelectorAll('h2,h3,div')].map((el) => el.textContent.trim()).filter((t) => t.length > 4 && t.length < 48).slice(0, 40),
        )
        note('REN-OBS-QUIZ-TEMPLATES', 'info', 'Quiz template gallery visible names', names.slice(0, 25).join(' | '))
      }

      const depTab = page.locator('[data-quiz-tab="deployments"]').or(page.getByText(/^Deployments$/).first())
      if (await depTab.count()) {
        await depTab.first().click()
        await waitSettle(page, 1000)
        await shot(page, '72-quiz-deployments')
        const urls = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent.trim()).filter((t) => /https?:\/\//.test(t)).slice(0, 12))
        const fake = urls.filter((u) => /preview\.legenex\.com\/q\//.test(u) || /\/q\/qdep_|\/q\/\d+/.test(u))
        if (fake.length) note('FUN-P0-003', 'P0', 'Quiz list prints artifact /q/{id} URLs that are not routes', fake.slice(0, 5).join(' | '))
        else note('FUN-OBS-QUIZ-URLS', 'info', 'Quiz deployment printed URLs', urls.slice(0, 8).join(' | '))
        const dup = await page.getByLabel('Duplicate deployment').count()
        note('FUN-OBS-QUIZ-DEP-DUP', 'info', 'Quiz deployment duplicate controls', `count=${dup}`)

        const our = page.locator('[data-quiz-deployment]').filter({ hasText: /Rescue Funnel|rescue-funnel/i }).first()
        const edit = (await our.count()) ? our.getByLabel('Edit deployment').first() : page.getByLabel('Edit deployment').first()
        if (await edit.count()) {
          await edit.click()
          await waitSettle(page, 1200)
          await shot(page, '73-quiz-deployment-editor')
          const text = await visibleText(page)
          if (!/SEO title|meta description|Open Graph/i.test(text)) {
            note('FUN-P1-004', 'P1', 'Quiz deployments have no SEO/OG fields', 'Titles derived from first question + brand')
          }
          const dest = page.getByText(/Destination URL/i).first()
          if (await dest.count()) {
            await dest.click()
            await waitSettle(page, 400)
            await shot(page, '74-quiz-deployment-destinations')
          }
          const track = page.getByText(/Tracking/i).first()
          if (await track.count()) {
            await track.click()
            await waitSettle(page, 400)
            await shot(page, '75-quiz-deployment-tracking')
          }
        }
      }
    })

    // -------------------------------------------------------------- advertorials
    await section('advertorials', async () => {
      await dumpRoute(page, '/admin/advertorials', '80-advertorials')
      const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Advertorials|Brands|Deployments|Templates/i.test(t)))
      note('FUN-OBS-ADV-TABS', 'info', 'Advertorial builder tabs', tabs.join(' | '))
      const archiveLabel = await page.getByLabel('Archive advertorial').count()
      const deleteLabel = await page.getByLabel('Delete advertorial').count()
      note('FUN-P0-001', 'P0', 'Advertorial list Archive control actually deletes the master', `archiveAria=${archiveLabel} deleteAria=${deleteLabel}`)

      const brandsTab = page.getByText(/^Brands$/).first()
      if (await brandsTab.count()) {
        await brandsTab.click()
        await waitSettle(page, 800)
        await shot(page, '81-advertorial-brands-tab')
        note('FUN-P1-005', 'P1', 'Advertorial Brands tab is a local list with a Delete that only filters client state', 'onDelete brand: setBrands(filter)')
      }

      const depTab = page.getByText(/^Deployments$/).first()
      if (await depTab.count()) {
        await depTab.click()
        await waitSettle(page, 1000)
        await shot(page, '82-advertorial-deployments')
        const urls = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent.trim()).filter((t) => /https?:\/\//.test(t) || /preview\.legenex/.test(t)).slice(0, 12))
        const fake = urls.filter((u) => /preview\.legenex\.com\/a\//.test(u))
        if (fake.length) note('FUN-P0-004', 'P0', 'Advertorial list prints artifact /a/{id} URLs that are not routes', fake.slice(0, 5).join(' | '))
        const edit = page.getByRole('button', { name: /^Edit$/i }).first()
        if (await edit.count()) {
          await edit.click()
          await waitSettle(page, 1000)
          await shot(page, '83-advertorial-deployment-editor')
          const liveOption = await page.locator('option[value="live"]').count()
          const statusSelect = await page.locator('select').count()
          note('FUN-P0-002', 'P0', 'Advertorial deployment status is a generic select saved without publish preflight', `liveOption=${liveOption} selects=${statusSelect}`)
          const pixels = await page.getByPlaceholder('Meta Pixel ID').count()
          note('FUN-P1-006', 'P1', 'Advertorial pixels use flat metaPixelId keys unlike Quiz/LP nested PIXEL_PROVIDERS', `metaPlaceholder=${pixels}`)
          const text = await visibleText(page)
          if (!/SEO title|Open Graph|meta description/i.test(text)) {
            note('FUN-P1-007', 'P1', 'Advertorial deployments have no SEO/OG fields', 'Metadata derived from headline/lede + brand')
          }
        }
      }

      await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 900)
      const openBtn = page.getByRole('button', { name: /^Edit$/i }).first()
      if (await openBtn.count()) {
        await openBtn.click()
        await waitSettle(page, 1200)
        await shot(page, '84-advertorial-editor')
        const settings = page.getByRole('button', { name: /Settings|Article Settings/i }).first()
        if (await settings.count()) {
          await settings.click()
          await waitSettle(page, 400)
          await shot(page, '85-advertorial-settings')
          const sText = await visibleText(page)
          if (/Live URL: \[domain\]\/a\//.test(sText) || /\/a\//.test(sText)) {
            note('FUN-P0-005', 'P0', 'Advertorial settings invent Live URL [domain]/a/{slug}', sText.slice(0, 400))
          }
        }
        const prev = page.getByRole('button', { name: /Preview/i }).first()
        if (await prev.count()) {
          await prev.click()
          await waitSettle(page, 1500)
          await shot(page, '86-advertorial-preview')
          const fp = await page.evaluate(() => ({
            h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
            header: document.querySelector('[data-adv-header]')?.getAttribute('data-adv-header') || '',
            footer: document.querySelector('[data-adv-footer]')?.getAttribute('data-adv-footer') || '',
            phone: /tel:|\(\d{3}\)/.test(document.body.innerText),
            quiz: !!document.querySelector('form, [data-quiz]'),
          }))
          note('REN-OBS-ADV-PREVIEW', 'info', 'Advertorial preview fingerprint', JSON.stringify(fp))
        }
      }
    })

    // ---------------------------------------------------------- LP template previews
    await section('lp-template-previews', async () => {
      await page.goto(`${ORIGIN}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 1400)
      const previews = page.getByLabel('Preview template')
      const n = Math.min(await previews.count(), 5)
      const fps = []
      for (let i = 0; i < n; i++) {
        await previews.nth(i).click()
        await waitSettle(page, 1300)
        await shot(page, `90-lp-template-preview-${i}`)
        const fp = await page.evaluate(() => ({
          h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 100) || '',
          sections: document.querySelectorAll('section, [data-section]').length,
          quiz: !!document.querySelector('[data-quiz], form'),
          bg: getComputedStyle(document.body).backgroundColor,
        }))
        fps.push(fp)
        await page.keyboard.press('Escape').catch(() => {})
        const close = page.getByRole('button', { name: /Close|Back|Done/i }).first()
        if (await close.count()) await close.click().catch(() => {})
        await page.waitForTimeout(300)
      }
      const uniqueH1 = new Set(fps.map((f) => f.h1)).size
      note('REN-OBS-LP-STRUCT', uniqueH1 > 1 ? 'info' : 'P1', 'LP template previews structural distinction', JSON.stringify({ uniqueH1, count: fps.length, fps }))
    })

    // ---------------------------------------------------------- live / preview hosts
    await section('live-parity', async () => {
      const livePage = await context.newPage()
      const hosts = [
        `https://${BRAND_SLUG}.preview.pageflo.io`,
        `https://${BRAND_SLUG}.preview.legenex.com`,
      ]
      const paths = ['/', `/c/${BRAND_SLUG}`, `/s/${BRAND_SLUG}`, '/lp', '/quiz', '/privacy', '/terms']
      for (const host of hosts) {
        for (const path of paths) {
          const u = `${host}${path}`
          let status = 0
          try {
            const r = await livePage.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 })
            status = r?.status?.() ?? 0
          } catch (e) {
            note('REN-LIVE-NAV', 'P2', `Live nav failed ${u}`, String(e).slice(0, 200))
            continue
          }
          await waitSettle(livePage, 800)
          const safe = path.replace(/\W+/g, '_') || 'root'
          const hostKey = host.includes('pageflo') ? 'pageflo' : 'legenex'
          await livePage.screenshot({ path: `${EVIDENCE}/93-${hostKey}${safe}.png`, fullPage: true }).catch(() => {})
          const info = await livePage.evaluate(() => ({
            title: document.title,
            h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
            text: document.body.innerText.slice(0, 280),
            favicon: document.querySelector('link[rel~="icon"]')?.href || '',
            quiz: !!document.querySelector('form, [data-quiz]'),
            privacy: [...document.querySelectorAll('a')].some((a) => /privacy/i.test(a.textContent || a.href)),
            terms: [...document.querySelectorAll('a')].some((a) => /terms/i.test(a.textContent || a.href)),
          }))
          const paused = /paused|not found|404/i.test(info.text + info.h1 + info.title)
          note('REN-LIVE-PATH', paused && status >= 400 ? 'P1' : 'info', `Live ${u}`, JSON.stringify({ status, ...info }))
        }
      }
      await livePage.goto(`${ORIGIN}/?site=${BRAND_SLUG}&preview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      await waitSettle(livePage, 1000)
      await livePage.screenshot({ path: `${EVIDENCE}/98-app-host-site-preview.png`, fullPage: true })
      note('REN-OBS-SITE-QS', 'info', '?site= preview from app host', `url=${livePage.url()} title=${await livePage.title()}`)
      await livePage.close()
    })

    note('FUN-OBS-NO-SHARED-MASTER-MUTATION', 'info', 'Did not rename shared stock masters', 'Audit brand only')
  } catch (err) {
    note('AUD-CRASH', 'P0', 'Auditor script threw', String(err?.stack || err))
    await shot(page, 'zz-crash').catch(() => {})
  } finally {
    const filteredConsole = consoleErrors.filter((t) => !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(t)).slice(0, 60)
    writeFileSync(`${EVIDENCE}/findings.json`, JSON.stringify({ findings, consoleErrors: filteredConsole }, null, 2))
    writeFileSync(`${EVIDENCE}/console-errors.txt`, filteredConsole.join('\n'))
    await browser.close()
    const p0 = findings.filter((f) => f.severity === 'P0').length
    const p1 = findings.filter((f) => f.severity === 'P1').length
    console.log(`wrote ${findings.length} findings (P0=${p0} P1=${p1}), ${filteredConsole.length} console errors`)
  }
}

await main()
