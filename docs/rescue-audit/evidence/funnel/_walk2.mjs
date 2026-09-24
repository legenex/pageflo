/**
 * Focused follow-up: editors the first walk missed (sidebar tab collisions),
 * website page SEO, brand identities, live Dont Settle render.
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
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
const EMAIL = cap.BUILDLOG_CAPTURE_EMAIL
const PASSWORD = cap.BUILDLOG_CAPTURE_PASSWORD
const ORIGIN = 'https://app.pageflo.io'
const BRAND_SLUG = 'rescue-funnel-20260923'
const EVIDENCE = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/funnel'
mkdirSync(EVIDENCE, { recursive: true })

const findings = []
const note = (id, severity, title, detail, extra = {}) => {
  findings.push({ id, severity, title, detail, ...extra, at: new Date().toISOString() })
}
const shot = async (page, name) => {
  await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true }).catch(() => {})
}
const waitSettle = async (page, ms = 800) => {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const visibleText = async (page) => page.evaluate(() => (document.body?.innerText || '').slice(0, 10000))
const inventory = async (page) =>
  page.evaluate(() => {
    const textOf = (el) => (el.getAttribute('aria-label') || el.title || el.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      url: location.href,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      buttons: [...document.querySelectorAll('button,[role="button"]')].map((el) => textOf(el).slice(0, 70)).filter(Boolean).slice(0, 50),
      fields: [...document.querySelectorAll('input,select,textarea')].map((el) => ({
        name: el.getAttribute('name') || '',
        ph: el.getAttribute('placeholder') || '',
        type: el.getAttribute('type') || el.tagName.toLowerCase(),
      })).slice(0, 60),
      labels: [...document.querySelectorAll('label')].map((l) => l.textContent.trim().slice(0, 60)).filter(Boolean).slice(0, 40),
    }
  })

const main = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux/chrome',
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  try {
    await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('input[name="email"]').fill(EMAIL)
    await page.locator('input[name="password"]').fill(PASSWORD)
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 40000 }),
      page.locator('button[type="submit"]').click(),
    ])
    await waitSettle(page, 800)

    // ----- LP deployments via data-lp-tab -----
    await page.goto(`${ORIGIN}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 1200)
    await page.locator('[data-lp-tab="deployments"]').click()
    await waitSettle(page, 1200)
    await shot(page, '62-lp-deployments')
    const lpList = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-lp-deployment]')]
      return rows.map((r) => ({
        id: r.getAttribute('data-lp-deployment'),
        status: r.getAttribute('data-lp-deployment-status'),
        text: r.innerText.replace(/\s+/g, ' ').slice(0, 220),
      }))
    })
    note('FUN-OBS-LP-DEP-LIST', 'info', 'LP deployments tab rows', JSON.stringify(lpList.slice(0, 12)))
    const cloneDep = await page.getByLabel('Duplicate deployment').count()
    const pause = await page.getByLabel(/Pause deployment|Publish deployment/).count()
    const del = await page.getByLabel('Delete deployment').count()
    note('FUN-P1-001', cloneDep === 0 ? 'P1' : 'info', 'LP deployments Duplicate control', `cloneDep=${cloneDep} pausePublish=${pause} delete=${del}`)

    const our = page.locator('[data-lp-deployment]').filter({ hasText: /Rescue Funnel/i }).first()
    if (await our.count()) {
      await our.getByLabel('Edit deployment').click()
      await waitSettle(page, 1400)
      await shot(page, '63-lp-deployment-editor-general')
      const inv = await inventory(page)
      const text = await visibleText(page)
      note('FUN-OBS-LP-DEP-EDITOR', 'info', 'LP deployment editor general', JSON.stringify({ ...inv, seo: /SEO title|Open Graph|meta description/i.test(text) }))
      if (!/SEO title|Open Graph|meta description/i.test(text)) {
        note('FUN-P1-002', 'P1', 'LP deployments have no SEO title/description/OG fields', 'derived from hero/slots + brand')
      }
      for (const [re, name] of [[/Destination/i, '64-lp-deployment-destinations'], [/Tracking/i, '65-lp-deployment-tracking']]) {
        const b = page.getByRole('button', { name: re }).first()
        if (await b.count()) {
          await b.click()
          await waitSettle(page, 400)
          await shot(page, name)
          note('FUN-OBS-LP-TAB', 'info', name, (await visibleText(page)).slice(0, 700))
        }
      }
      const prev = page.getByRole('button', { name: /Preview/i }).first()
      if (await prev.count()) {
        await prev.click()
        await waitSettle(page, 1800)
        await shot(page, '66-lp-deployment-preview')
        const fp = await page.evaluate(() => ({
          h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).filter((t) => t && t !== 'Landing Pages').slice(0, 3),
          quiz: /How Were You Injured|Continue|question/i.test(document.body.innerText),
          urlBar: [...document.querySelectorAll('div,span')].map((el) => el.textContent.trim()).find((t) => /https?:\/\//.test(t) && t.length < 140) || '',
        }))
        note('REN-OBS-LP-PREVIEW', 'info', 'LP deployment in-app preview', JSON.stringify(fp))
        await page.keyboard.press('Escape').catch(() => {})
        const close = page.getByRole('button', { name: /Close/i }).first()
        if (await close.count()) await close.click().catch(() => {})
      }
    }

    // ----- Quiz templates + deployments via data-quiz-tab -----
    await page.goto(`${ORIGIN}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 1200)
    await page.locator('[data-quiz-tab="templates"]').click()
    await waitSettle(page, 1200)
    await shot(page, '71-quiz-templates')
    const tplText = await visibleText(page)
    note('REN-OBS-QUIZ-TEMPLATES', 'info', 'Quiz templates tab', tplText.slice(0, 900))

    await page.locator('[data-quiz-tab="deployments"]').click()
    await waitSettle(page, 1200)
    await shot(page, '72b-quiz-deployments')
    const qRows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-quiz-deployment]')].map((r) => ({
        id: r.getAttribute('data-quiz-deployment'),
        status: r.getAttribute('data-quiz-deployment-status'),
        text: r.innerText.replace(/\s+/g, ' ').slice(0, 240),
      })),
    )
    note('FUN-OBS-QUIZ-DEP-LIST', 'info', 'Quiz deployments tab rows', JSON.stringify(qRows.slice(0, 12)))
    const fake = qRows.filter((r) => /preview\.legenex\.com\/q\//.test(r.text) || /\/q\/qdep_/.test(r.text))
    if (fake.length) note('FUN-P0-003', 'P0', 'Quiz list prints artifact /q/{id} URLs', fake.map((f) => f.text).join(' | '))
    const dup = await page.getByLabel('Duplicate deployment').count()
    note('FUN-OBS-QUIZ-DEP-DUP', 'info', 'Quiz deployment duplicate', `count=${dup}`)

    const qOur = page.locator('[data-quiz-deployment]').filter({ hasText: /Rescue Funnel/i }).first()
    if (await qOur.count()) {
      await qOur.getByLabel('Edit deployment').click()
      await waitSettle(page, 1400)
      await shot(page, '73-quiz-deployment-editor')
      const text = await visibleText(page)
      const inv = await inventory(page)
      note('FUN-OBS-QUIZ-DEP-EDITOR', 'info', 'Quiz deployment editor', JSON.stringify({ ...inv, seo: /SEO title|Open Graph/i.test(text) }))
      if (!/SEO title|Open Graph|meta description/i.test(text)) {
        note('FUN-P1-004', 'P1', 'Quiz deployments have no SEO/OG fields', 'derived from first question + brand')
      }
      for (const [re, name] of [[/Destination/i, '74-quiz-deployment-destinations'], [/Tracking/i, '75-quiz-deployment-tracking']]) {
        const b = page.getByRole('button', { name: re }).first()
        if (await b.count()) {
          await b.click()
          await waitSettle(page, 400)
          await shot(page, name)
          note('FUN-OBS-QUIZ-TAB', 'info', name, (await visibleText(page)).slice(0, 700))
        }
      }
    }

    // MVA live quiz preview (in-app)
    await page.goto(`${ORIGIN}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 900)
    const mva = page.locator('div').filter({ hasText: /^MVA Tiered Quiz T4/ }).first()
    const mvaPreview = page.getByRole('button', { name: /Preview/i }).nth(2)
    if (await mvaPreview.count()) {
      await mvaPreview.click()
      await waitSettle(page, 1800)
      await shot(page, '76-quiz-inapp-preview')
      note('REN-OBS-QUIZ-PREVIEW', 'info', 'Quiz in-app preview', (await visibleText(page)).slice(0, 700))
    }

    // ----- Advertorial in-builder Deployments (not sidebar) -----
    await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 1000)
    await page.locator('button').filter({ hasText: /^Deployments$/ }).first().click()
    await waitSettle(page, 1000)
    // If we landed on sidebar deployments, go back and click the tab next to Advertorials
    if (page.url().includes('/admin/deployments') && !page.url().includes('advertorials')) {
      await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
      await waitSettle(page, 900)
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')]
        const tab = btns.find((b) => b.textContent.trim() === 'Deployments' && b.closest('[style]') && !b.textContent.includes('Soon'))
        // prefer the one sitting next to an Advertorials tab
        const inner = btns.find((b) => {
          const t = b.textContent.replace(/\s+/g, ' ').trim()
          return t === 'Deployments' || t.endsWith('Deployments')
        })
        const sibling = btns.find((b) => {
          const parent = b.parentElement
          if (!parent) return false
          const texts = [...parent.querySelectorAll('button')].map((x) => x.textContent.trim())
          return texts.includes('Advertorials') && b.textContent.trim() === 'Deployments'
        })
        ;(sibling || inner)?.click()
      })
      await waitSettle(page, 1000)
    }
    await shot(page, '82b-advertorial-deployments')
    note('FUN-OBS-ADV-DEP-URL', 'info', 'After clicking advertorial Deployments', `url=${page.url()} snippet=${(await visibleText(page)).slice(0, 800)}`)
    const fakeA = (await visibleText(page)).match(/preview\.legenex\.com\/a\/[^\s]+/g) || []
    if (fakeA.length) note('FUN-P0-004', 'P0', 'Advertorial list prints artifact /a/{id} URLs', fakeA.slice(0, 5).join(' | '))

    const advEdit = page.getByRole('button', { name: /^Edit$/i }).first()
    if (await advEdit.count() && page.url().includes('advertorials')) {
      await advEdit.click()
      await waitSettle(page, 1200)
      await shot(page, '83-advertorial-deployment-or-master')
      note('FUN-OBS-ADV-EDIT', 'info', 'Advertorial first Edit', JSON.stringify(await inventory(page)))
    }

    await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 900)
    const publishedRow = page.locator('div').filter({ hasText: /The Settlement Letter That Sat/ }).first()
    if (await publishedRow.getByRole('button', { name: /^Edit$/i }).count()) {
      await publishedRow.getByRole('button', { name: /^Edit$/i }).click()
    } else {
      await page.getByRole('button', { name: /^Edit$/i }).nth(1).click()
    }
    await waitSettle(page, 1400)
    await shot(page, '84-advertorial-editor')
    const aInv = await inventory(page)
    const aText = await visibleText(page)
    note('FUN-OBS-ADV-EDITOR', 'info', 'Advertorial master editor', JSON.stringify({ ...aInv, hasPublish: /Publish|Unpublish/.test(aText) }))
    const settings = page.getByRole('button', { name: /Settings|Article Settings/i }).first()
    if (await settings.count()) {
      await settings.click()
      await waitSettle(page, 500)
      await shot(page, '85-advertorial-settings')
      const s = await visibleText(page)
      note('FUN-OBS-ADV-SETTINGS', 'info', 'Advertorial settings panel', s.slice(0, 900))
      if (/\[domain\]\/a\/|Live URL:/.test(s)) note('FUN-P0-005', 'P0', 'Advertorial settings invent Live URL [domain]/a/{slug}', s.slice(0, 400))
    }
    const prev = page.getByRole('button', { name: /Preview/i }).first()
    if (await prev.count()) {
      await prev.click()
      await waitSettle(page, 1600)
      await shot(page, '86-advertorial-preview')
      const fp = await page.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
        header: document.querySelector('[data-adv-header]')?.getAttribute('data-adv-header') || '',
        footer: document.querySelector('[data-adv-footer]')?.getAttribute('data-adv-footer') || '',
        phone: /tel:|\(\d{3}\)/.test(document.body.innerText),
      }))
      note('REN-OBS-ADV-PREVIEW', 'info', 'Advertorial preview fingerprint', JSON.stringify(fp))
    }

    // ----- Website Home page editor SEO -----
    await page.goto(`${ORIGIN}/admin/sites/${BRAND_SLUG}/pages`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 800)
    await page.getByRole('link', { name: /^Home$/ }).click()
    await waitSettle(page, 1500)
    await shot(page, '33b-home-page-editor')
    const pInv = await inventory(page)
    const pText = await visibleText(page)
    note('SET-OBS-PAGE-EDITOR', 'info', 'Home page editor', JSON.stringify({ ...pInv, seo: /Meta title|Open Graph|SEO/i.test(pText) }))

    // ----- Brand Identities editor for audit brand -----
    await page.goto(`${ORIGIN}/admin/brands/brand-identities`, { waitUntil: 'domcontentloaded' })
    await waitSettle(page, 1000)
    const card = page.locator('div').filter({ hasText: /Rescue Funnel 20260923/ }).filter({ has: page.getByRole('button', { name: /Edit/i }) }).first()
    if (await card.getByRole('button', { name: /Edit/i }).count()) {
      await card.getByRole('button', { name: /Edit/i }).click()
      await waitSettle(page, 1400)
      await shot(page, '50b-brand-identity-editor')
      note('SET-OBS-BRAND-ID-EDITOR', 'info', 'Brand Identities editor fields', JSON.stringify(await inventory(page)))
      note('SET-OBS-BRAND-ID-TEXT', 'info', 'Brand Identities editor text', (await visibleText(page)).slice(0, 1200))
    }

    // ----- Live Dont Settle (active brand) -----
    const live = await context.newPage()
    const liveUrls = [
      'https://dont-settle.preview.pageflo.io/',
      'https://dont-settle.preview.pageflo.io/s/dont-settle',
      'https://dont-settle.preview.pageflo.io/c/dont-settle',
      'https://dont-settle.preview.pageflo.io/adv/letter',
      'https://dont-settle.preview.legenex.com/',
      'https://dont-settle.preview.legenex.com/s/dont-settle',
      'https://dont-settle.preview.legenex.com/c/dont-settle',
      'https://dont-settle.preview.legenex.com/adv/letter',
    ]
    for (const u of liveUrls) {
      let status = 0
      try {
        const r = await live.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 })
        status = r?.status?.() ?? 0
      } catch (e) {
        note('REN-LIVE-NAV', 'P2', `nav fail ${u}`, String(e).slice(0, 160))
        continue
      }
      await waitSettle(live, 900)
      const key = '99-' + u.replace(/https?:\/\//, '').replace(/[^\w]+/g, '_').slice(0, 80)
      await live.screenshot({ path: `${EVIDENCE}/${key}.png`, fullPage: true }).catch(() => {})
      const info = await live.evaluate(() => ({
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
        text: document.body.innerText.slice(0, 280),
        quiz: !!document.querySelector('form') || /question|Continue/i.test(document.body.innerText),
        favicon: document.querySelector('link[rel~="icon"]')?.href || '',
        fonts: [...document.querySelectorAll('link[href*="font"]')].map((l) => l.href).slice(0, 4),
        phone: /tel:|\(\d{3}\)/.test(document.body.innerText),
        privacy: [...document.querySelectorAll('a')].some((a) => /privacy/i.test(a.textContent || a.href)),
      }))
      note('REN-LIVE-ACTIVE', status >= 400 ? 'P1' : 'info', `Live ${u}`, JSON.stringify({ status, ...info }))
    }
    await live.close()
  } catch (err) {
    note('AUD-CRASH2', 'P0', 'walk2 threw', String(err?.stack || err))
    await shot(page, 'zz-crash2')
  } finally {
    const prev = JSON.parse(readFileSync(`${EVIDENCE}/findings.json`, 'utf8'))
    const merged = { findings: [...(prev.findings || []), ...findings], consoleErrors: prev.consoleErrors || [] }
    writeFileSync(`${EVIDENCE}/findings.json`, JSON.stringify(merged, null, 2))
    writeFileSync(`${EVIDENCE}/findings-walk2.json`, JSON.stringify(findings, null, 2))
    await browser.close()
    console.log(`walk2 wrote ${findings.length} findings`)
  }
}

await main()
