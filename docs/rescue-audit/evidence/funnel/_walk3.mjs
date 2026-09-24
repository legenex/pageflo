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
const cap = loadEnv('/tmp/pf-funnel-capture.env')
const ORIGIN = 'https://app.pageflo.io'
const BRAND_SLUG = 'rescue-funnel-20260923'
const EVIDENCE = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/funnel'
mkdirSync(EVIDENCE, { recursive: true })
const findings = []
const note = (id, severity, title, detail) => findings.push({ id, severity, title, detail, at: new Date().toISOString() })
const shot = async (page, name) => { await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true }).catch(() => {}) }
const waitSettle = async (page, ms = 800) => {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const text = async (page) => page.evaluate(() => (document.body?.innerText || '').slice(0, 9000))
const inv = async (page) => page.evaluate(() => ({
  url: location.href,
  h1: document.querySelector('h1')?.textContent?.trim() || '',
  buttons: [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
  fields: [...document.querySelectorAll('input,select,textarea')].map((el) => ({
    name: el.getAttribute('name') || '', ph: el.getAttribute('placeholder') || '', type: el.getAttribute('type') || el.tagName.toLowerCase(),
  })).slice(0, 50),
}))

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux/chrome',
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const run = async (name, fn) => {
    try { await fn() } catch (e) { note('AUD-SECTION', 'P1', name, String(e?.message || e).slice(0, 400)); await shot(page, `zz-${name}`) }
  }
  try {
    await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('input[name="email"]').fill(cap.BUILDLOG_CAPTURE_EMAIL)
    await page.locator('input[name="password"]').fill(cap.BUILDLOG_CAPTURE_PASSWORD)
    await Promise.all([page.waitForURL(/\/admin/, { timeout: 40000 }), page.locator('button[type="submit"]').click()])
    await waitSettle(page, 600)

    await run('adv-list', async () => {
      await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 1000)
      await shot(page, '80b-advertorials')
      const archive = await page.getByLabel('Archive advertorial').count()
      const dup = await page.getByLabel('Duplicate advertorial').count()
      note('FUN-OBS-ADV-LIST-ACTIONS', 'info', 'Advertorial list verbs', `archive=${archive} duplicate=${dup}`)
      await page.evaluate(() => {
        const parent = [...document.querySelectorAll('div')].find((d) => {
          const btns = [...d.querySelectorAll(':scope > button')]
          return btns.length >= 2 && btns.some((b) => b.textContent.includes('Advertorials')) && btns.some((b) => b.textContent.includes('Deployments'))
        })
        const dep = parent && [...parent.querySelectorAll('button')].find((b) => b.textContent.includes('Deployments'))
        dep?.click()
      })
      await waitSettle(page, 1000)
      await shot(page, '82c-advertorial-builder-deployments')
      const t = await text(page)
      note('FUN-OBS-ADV-DEP-TAB', 'info', 'Advertorial builder deployments tab', `url=${page.url()} ${t.slice(0, 900)}`)
      const fake = t.match(/preview\.legenex\.com\/a\/\S+/g) || []
      if (fake.length) note('FUN-P0-004', 'P0', 'Advertorial prints /a/{id} URLs', fake.join(' | '))
      if (page.url().includes('/admin/advertorials')) {
        const edit = page.getByRole('button', { name: /^Edit$/i }).first()
        if (await edit.count()) {
          await edit.click()
          await waitSettle(page, 1200)
          await shot(page, '83-advertorial-deployment-editor')
          const it = await inv(page)
          const tt = await text(page)
          note('FUN-OBS-ADV-DEP-EDITOR', 'info', 'Advertorial deployment editor', JSON.stringify({ ...it, liveOption: /Live \(publicly accessible\)/.test(tt), pixels: /Meta Pixel ID/.test(tt), seo: /SEO title|Open Graph/.test(tt) }))
          if (/Live \(publicly accessible\)/.test(tt)) note('FUN-P0-002', 'P0', 'Advertorial deployment status is a generic select without preflight', 'draft/live/paused select')
          if (/Meta Pixel ID/.test(tt)) note('FUN-P1-006', 'P1', 'Advertorial pixels use flat metaPixelId keys', 'unlike Quiz/LP PIXEL_PROVIDERS')
          if (!/SEO title|Open Graph/.test(tt)) note('FUN-P1-007', 'P1', 'Advertorial deployments have no SEO/OG fields', 'derived from headline/lede')
        }
      }
    })

    await run('adv-master', async () => {
      await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 900)
      await page.getByRole('button', { name: /^Edit$/i }).nth(1).click()
      await waitSettle(page, 1400)
      await shot(page, '84-advertorial-editor')
      note('FUN-OBS-ADV-EDITOR', 'info', 'Advertorial master editor', JSON.stringify(await inv(page)))
      const settings = page.getByRole('button', { name: /Settings/i }).first()
      if (await settings.count()) {
        await settings.click()
        await waitSettle(page, 400)
        await shot(page, '85-advertorial-settings')
        const s = await text(page)
        note('FUN-OBS-ADV-SETTINGS', 'info', 'Advertorial settings', s.slice(0, 1000))
        if (/\[domain\]\/a\//.test(s) || /Live URL:/.test(s)) note('FUN-P0-005', 'P0', 'Advertorial settings invent Live URL [domain]/a/{slug}', s.slice(0, 400))
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
        }))
        note('REN-OBS-ADV-PREVIEW', 'info', 'Advertorial preview', JSON.stringify(fp))
      }
    })

    await run('page-seo', async () => {
      await page.goto(`${ORIGIN}/admin/sites/${BRAND_SLUG}/pages`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 800)
      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await waitSettle(page, 1500)
      await shot(page, '33b-home-page-editor')
      const t = await text(page)
      note('SET-OBS-PAGE-EDITOR', 'info', 'Home page editor', JSON.stringify({ ...(await inv(page)), seo: /Meta title|Open Graph|SEO/i.test(t), snippet: t.slice(0, 800) }))
    })

    await run('brand-id', async () => {
      await page.goto(`${ORIGIN}/admin/brands/brand-identities`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 1000)
      await page.locator('div').filter({ hasText: /^Rescue Funnel 20260923/ }).getByRole('button', { name: /Edit/i }).first().click()
      await waitSettle(page, 1400)
      await shot(page, '50b-brand-identity-editor')
      note('SET-OBS-BRAND-ID-EDITOR', 'info', 'Brand Identities editor', JSON.stringify(await inv(page)))
      note('SET-OBS-BRAND-ID-TEXT', 'info', 'Brand Identities text', (await text(page)).slice(0, 1400))
    })

    await run('live-dont-settle', async () => {
      const live = await context.newPage()
      const urls = [
        'https://dont-settle.preview.pageflo.io/',
        'https://dont-settle.preview.pageflo.io/s/dont-settle',
        'https://dont-settle.preview.pageflo.io/c/dont-settle',
        'https://dont-settle.preview.pageflo.io/adv/letter',
        'https://dont-settle.preview.legenex.com/',
        'https://dont-settle.preview.legenex.com/s/dont-settle',
        'https://dont-settle.preview.legenex.com/c/dont-settle',
        'https://dont-settle.preview.legenex.com/adv/letter',
      ]
      for (const u of urls) {
        let status = 0
        try {
          const r = await live.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 })
          status = r?.status?.() ?? 0
        } catch (e) {
          note('REN-LIVE-NAV', 'P2', u, String(e).slice(0, 160))
          continue
        }
        await waitSettle(live, 900)
        const key = '99-' + u.replace(/https?:\/\//, '').replace(/[^\w]+/g, '_').slice(0, 90)
        await live.screenshot({ path: `${EVIDENCE}/${key}.png`, fullPage: true }).catch(() => {})
        const info = await live.evaluate(() => ({
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
          text: document.body.innerText.slice(0, 300),
          quiz: !!document.querySelector('form'),
          phone: /tel:|\(\d{3}\)/.test(document.body.innerText),
          privacy: [...document.querySelectorAll('a')].some((a) => /privacy/i.test(a.textContent || a.href)),
        }))
        note(status >= 400 ? 'REN-LIVE-ACTIVE' : 'REN-LIVE-OK', status >= 400 ? 'P1' : 'info', `Live ${u}`, JSON.stringify({ status, ...info }))
      }
      await live.close()
    })
  } finally {
    const prev = JSON.parse(readFileSync(`${EVIDENCE}/findings.json`, 'utf8'))
    writeFileSync(`${EVIDENCE}/findings.json`, JSON.stringify({ findings: [...(prev.findings || []), ...findings], consoleErrors: prev.consoleErrors || [] }, null, 2))
    writeFileSync(`${EVIDENCE}/findings-walk3.json`, JSON.stringify(findings, null, 2))
    await browser.close()
    console.log(`walk3 wrote ${findings.length} findings`)
  }
}
await main()
