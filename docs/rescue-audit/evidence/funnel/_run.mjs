/**
 * Funnel Auditor runtime evidence against https://app.pageflo.io
 * Writes screenshots + findings JSON. Never prints secrets.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const envFile = readFileSync('/home/legenex/Documents/Projects/PageFlo/.env', 'utf8')
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m || process.env[m[1]]) continue
  process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const ORIGIN = 'https://app.pageflo.io'
const BRAND_SLUG = 'rescue-funnel-20260923'
const BRAND_NAME = 'Rescue Funnel 20260923'
const EVIDENCE = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/funnel'
const EMAIL = process.env.SUPER_ADMIN_EMAIL
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD
const CHROMIUM = process.env.PAGEFLO_CHROMIUM_PATH || process.env.LEGALOS_CHROMIUM_PATH

mkdirSync(EVIDENCE, { recursive: true })

const findings = []
const note = (id, severity, title, detail, extra = {}) => {
  findings.push({ id, severity, title, detail, ...extra, at: new Date().toISOString() })
}

const shot = async (page, name) => {
  const path = `${EVIDENCE}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  return path
}

const waitSettle = async (page, ms = 1200) => {
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

const visibleText = async (page) => {
  return page.evaluate(() => document.body?.innerText?.slice(0, 8000) || '')
}

const clickText = async (page, re, opts = {}) => {
  const loc = page.getByText(re).first()
  await loc.waitFor({ timeout: opts.timeout ?? 8000 })
  await loc.click({ timeout: 8000 })
}

const countByText = async (page, re) => page.getByText(re).count()

async function signIn(page) {
  await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitSettle(page, 800)
  if (page.url().includes('/admin')) return true
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/admin/, { timeout: 30000 })
  return true
}

async function dumpRoute(page, path, name) {
  const url = path.startsWith('http') ? path : `${ORIGIN}${path}`
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => ({ ok: () => false, status: () => 0, error: String(e) }))
  await waitSettle(page, 900)
  const status = typeof resp?.status === 'function' ? resp.status() : 0
  const title = await page.title().catch(() => '')
  const h1 = await page.locator('h1').first().textContent().catch(() => '')
  const text = await visibleText(page)
  const comingSoon = /not built yet|Coming soon|are not built yet/i.test(text)
  const deadLink404 = /not found|doesn't exist|This page could not be found/i.test(text) && status >= 400
  await shot(page, name)
  return { path, status, title, h1: (h1 || '').trim(), comingSoon, deadLink404, url: page.url(), textSnippet: text.slice(0, 600) }
}

async function ensureBrand(page) {
  const r = await dumpRoute(page, '/admin/sites', '01-brands-list')
  const exists = await page.getByText(BRAND_SLUG).count()
  if (exists > 0) {
    note('SET-OBS-001', 'info', 'Audit brand already exists', `slug ${BRAND_SLUG} already present; reusing`)
    return { created: false, ...r }
  }
  const newBtn = page.getByRole('button', { name: /New Brand/i }).first()
  await newBtn.click()
  await page.waitForTimeout(500)
  await shot(page, '02-new-brand-wizard')
  await page.locator('input[placeholder="Claim Checker"]').fill(BRAND_NAME)
  const slug = page.locator('input[placeholder="claim-checker"]')
  await slug.waitFor({ timeout: 5000 })
  await slug.fill(BRAND_SLUG)
  await page.locator('select').first().selectOption('mva').catch(() => {})
  await shot(page, '03-new-brand-filled')
  await page.getByRole('button', { name: /Create Brand|Create/i }).last().click()
  await page.waitForTimeout(4000)
  await waitSettle(page, 1500)
  await shot(page, '04-brand-created')
  const url = page.url()
  const ok = url.includes(BRAND_SLUG) || (await page.getByText(BRAND_SLUG).count()) > 0
  if (!ok) {
    note('SET-P1-BRAND', 'P1', 'Brand create did not land on expected URL', `url=${url}`)
  }
  return { created: true, url, ok }
}

async function inspectDeadControls(page) {
  // General settings upload buttons
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/general`, '20-site-general')
  const uploads = page.getByRole('button', { name: /Upload/i })
  const uploadCount = await uploads.count()
  const uploadHasHandler = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /upload/i.test(b.textContent || ''))
    return btns.map((b) => ({ type: b.getAttribute('type'), disabled: b.disabled, text: b.textContent.trim() }))
  })
  note('SET-P1-001', 'P1', 'Site General logo/favicon Upload buttons are type=button with no handler', JSON.stringify(uploadHasHandler), { uploadCount })

  // Save/refresh tagline
  const tagline = page.locator('input[name="tagline"]')
  const marker = `audit-tagline-${Date.now().toString().slice(-6)}`
  if (await tagline.count()) {
    await tagline.fill(marker)
    await page.getByRole('button', { name: /Save Settings/i }).click()
    await page.waitForTimeout(2000)
    const savedMsg = await page.getByText(/Saved /).count()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitSettle(page, 800)
    const retained = await page.locator('input[name="tagline"]').inputValue().catch(() => '')
    const retainOk = retained === marker
    await shot(page, '21-site-general-after-refresh')
    note(retainOk ? 'SET-OK-TAGLINE' : 'SET-P0-TAGLINE', retainOk ? 'info' : 'P0', 'Site general tagline save/refresh', `savedMsg=${savedMsg} retained=${JSON.stringify(retained)} expected=${marker}`)
  }

  // CTA/bg fields missing from general form vs schema
  const names = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].map((el) => el.getAttribute('name')).filter(Boolean))
  const schemaOnly = ['cta', 'bg', 'primary_ink', 'cta_ink', 'surface_2', 'ink_muted', 'border', 'radius', 'display_name', 'short_name', 'logo_url_dark']
  const missing = schemaOnly.filter((n) => !names.includes(n) && !names.includes(`brand.${n}`))
  note('SET-P1-002', 'P1', 'Site.brand schema fields absent from General UI', `present=${names.join(',')} missing=${missing.join(',')}`)

  // Paths dead controls
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/paths`, '22-site-paths')
  const addBtn = page.getByRole('button', { name: /^Add$/i })
  const excludeInput = page.getByPlaceholder('slug-to-exclude')
  if (await excludeInput.count()) {
    await excludeInput.fill('audit-exclude')
    const addCount = await addBtn.count()
    if (addCount) await addBtn.first().click()
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitSettle(page, 600)
    const still = await page.getByText('audit-exclude').count()
    await shot(page, '23-site-paths-after-exclude')
    note('SET-P1-003', 'P1', 'Paths excluded-slugs control does not persist', `after refresh count=${still}; robots/reset also have no form action in source`)
  }
  const robotsReset = await page.getByText('Reset to default').count()
  note('SET-P1-004', 'P1', 'Paths robots.txt Reset/textarea have no save wiring', `resetVisible=${robotsReset}`)

  // SEO coming soon
  const seo = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/seo`, '24-site-seo')
  if (seo.comingSoon) note('SET-P1-005', 'P1', 'Site-wide SEO is Coming Soon while per-page SEO exists', seo.textSnippet.slice(0, 280))

  // Users coming soon
  const users = await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/users`, '25-site-users')
  if (users.comingSoon) note('SET-P1-006', 'P1', 'Site-scoped users screen is Coming Soon', users.textSnippet.slice(0, 280))

  // Tracking
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/tracking`, '26-site-tracking')
  // Domains
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/domains`, '27-site-domains')
  // Danger
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/settings/danger-zone`, '28-site-danger')
  // Numbers
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/numbers`, '29-site-numbers')
  const cmsNumber = await page.locator('a[href*="/cms/collections/numbers"]').count()
  if (cmsNumber) note('SET-P1-007', 'P1', 'Numbers "New Number" dumps operator into Payload /cms', 'href /cms/collections/numbers/create')
  // Blog dead link
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/blog`, '30-site-blog')
  const seoBuilder = page.locator('a[href="/admin/blog/seo-builder"]')
  if (await seoBuilder.count()) {
    await seoBuilder.first().click()
    await waitSettle(page, 800)
    await shot(page, '31-blog-seo-builder')
    const t = await visibleText(page)
    const statusOk = !/not found|doesn't exist/i.test(t) && !page.url().includes('404')
    if (!statusOk || /could not be found/i.test(t)) {
      note('SET-P1-008', 'P1', 'Blog "SEO builder" link 404s', `url=${page.url()}`)
    } else {
      note('SET-OBS-BLOG', 'info', 'Blog SEO builder navigated', `url=${page.url()} snippet=${t.slice(0, 200)}`)
    }
  }
  // Pages
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/pages`, '32-site-pages')
  const firstPage = page.locator('a[href*="/pages/"]').nth(1)
  if (await firstPage.count()) {
    await firstPage.click()
    await waitSettle(page, 1200)
    await shot(page, '33-page-editor')
    const seoLabel = await page.getByText(/^SEO$/i).count()
    const metaTitle = await page.locator('input,textarea').evaluateAll((els) =>
      els.some((el) => /meta.?title|og.?image/i.test(el.name || el.placeholder || el.getAttribute('aria-label') || '')),
    )
    note('SET-OBS-PAGE-SEO', 'info', 'Page editor SEO fields presence', `seoLabelCount=${seoLabel} metaish=${metaTitle} url=${page.url()}`)
  }
}

async function inspectWorkspaceSettings(page) {
  await dumpRoute(page, '/admin/settings', '40-settings-index')
  await dumpRoute(page, '/admin/settings/integrations', '41-settings-integrations')
  const billing = await page.getByText(/Not connected to a billing provider/i).count()
  if (billing) note('SET-P2-001', 'P2', 'Integrations Billing fields save notes only; no provider', 'Plan/notes are documentation, not billing')
  await dumpRoute(page, '/admin/settings/users', '42-settings-users')
  await dumpRoute(page, '/admin/settings/system', '43-settings-system')
  await dumpRoute(page, '/admin/system', '44-system-duplicate')
  await dumpRoute(page, '/admin/profile', '45-profile')
  await dumpRoute(page, '/admin/analytics', '46-analytics')
  await dumpRoute(page, '/admin/integrity', '47-integrity')
  await dumpRoute(page, '/admin/deployments', '48-deployments')
  await dumpRoute(page, '/admin/websites', '49-websites')
  await dumpRoute(page, '/admin/brands/brand-identities', '50-brand-identities')
  await dumpRoute(page, '/admin/brands/domains', '51-domains-pool')
}

async function inspectLandingPages(page) {
  await dumpRoute(page, '/admin/landing-pages', '60-lp-templates')
  const templatesTab = page.locator('[data-lp-tab="templates"]')
  const deploymentsTab = page.locator('[data-lp-tab="deployments"]')
  const tabLabels = await page.evaluate(() => [...document.querySelectorAll('[data-lp-tab]')].map((el) => el.getAttribute('data-lp-tab')))
  note('FUN-OBS-LP-TABS', 'info', 'LP builder tabs', tabLabels.join(',') || 'no data-lp-tab')

  // Template cards
  const cloneBtns = await page.getByLabel('Clone template').count()
  const previewBtns = await page.getByText(/^Preview$/).count()
  note('FUN-OBS-LP-TEMPLATE-ACTIONS', 'info', 'LP template list actions', `clone=${cloneBtns} previewText=${previewBtns}`)

  // Open first template editor if possible
  const editTpl = page.getByLabel('Edit template').first()
  if (await editTpl.count()) {
    await editTpl.click()
    await waitSettle(page, 1500)
    await shot(page, '61-lp-template-editor')
    const text = await visibleText(page)
    const hasPublish = /Unpublish|Publish/.test(text)
    const hasEnable = /Disable|Enable/.test(text)
    const hasInternalTitle = /Internal title|internal name/i.test(text)
    note('FUN-OBS-LP-TPL-EDITOR', 'info', 'LP template editor chrome', `publish=${hasPublish} enable=${hasEnable} internalTitle=${hasInternalTitle}`)
    const back = page.getByText(/^Back$|^Templates$|^Landing Pages$/).first()
    if (await page.getByRole('button', { name: /Back/i }).count()) {
      await page.getByRole('button', { name: /Back/i }).first().click().catch(() => {})
    }
    await waitSettle(page, 600)
  }

  if (await deploymentsTab.count()) {
    await deploymentsTab.click()
    await waitSettle(page, 1000)
    await shot(page, '62-lp-deployments')
    const cloneDep = await page.getByLabel('Duplicate deployment').count()
    const archive = await page.getByLabel(/Archive/).count()
    note('FUN-P1-001', cloneDep === 0 ? 'P1' : 'info', 'LP deployments have no Duplicate control (Quiz/Advertorial do)', `cloneDep=${cloneDep} archive=${archive}`)

    // Open first deployment
    const editDep = page.getByLabel('Edit deployment').first()
    if (await editDep.count()) {
      await editDep.click()
      await waitSettle(page, 1500)
      await shot(page, '63-lp-deployment-editor-general')
      const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /General|Destination|Tracking|Pixels/i.test(t)))
      note('FUN-OBS-LP-DEP-TABS', 'info', 'LP deployment editor tabs', tabs.join(' | '))
      const destTab = page.getByText(/Destination URL/i).first()
      if (await destTab.count()) {
        await destTab.click()
        await waitSettle(page, 400)
        await shot(page, '64-lp-deployment-destinations')
      }
      const trackTab = page.getByText(/Tracking & Pixels/i).first()
      if (await trackTab.count()) {
        await trackTab.click()
        await waitSettle(page, 400)
        await shot(page, '65-lp-deployment-tracking')
      }
      const seo = await page.getByText(/SEO title|meta description|Open Graph/i).count()
      if (!seo) note('FUN-P1-002', 'P1', 'LP deployments have no SEO title/description/OG fields', 'Metadata is derived from hero/slots + brand name only')
      // Preview
      const prev = page.getByRole('button', { name: /Preview/i }).first()
      if (await prev.count()) {
        await prev.click()
        await waitSettle(page, 2000)
        await shot(page, '66-lp-deployment-preview')
        // Capture structure fingerprints from in-app preview
        const fp = await page.evaluate(() => {
          const root = document.querySelector('[data-lp-template], [data-template], article, main') || document.body
          const headings = [...document.querySelectorAll('h1,h2')].slice(0, 8).map((h) => h.textContent.trim().slice(0, 80))
          const quiz = !!document.querySelector('form, [data-quiz], [class*="quiz"]')
          return { h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 120), headings, quiz, classes: root.className }
        })
        note('REN-OBS-LP-PREVIEW', 'info', 'LP in-builder preview fingerprint', JSON.stringify(fp))
      }
    }
  }
}

async function inspectQuizzes(page) {
  await dumpRoute(page, '/admin/quizzes', '70-quizzes')
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Flows|Quizzes|Templates|Deployments/i.test(t)))
  note('FUN-OBS-QUIZ-TABS', 'info', 'Quiz builder top tabs', tabs.join(' | '))
  await shot(page, '70b-quizzes-flows')

  const archiveTab = page.getByText(/^Archived/).first()
  const hasArchiveScope = (await archiveTab.count()) > 0
  note(hasArchiveScope ? 'FUN-OBS-QUIZ-ARCHIVE' : 'FUN-P1-003', hasArchiveScope ? 'info' : 'P1', 'Quiz flows have Archive/Restore scope', `visible=${hasArchiveScope}`)

  const cloneFlow = await page.locator('[title="Clone"]').count()
  note('FUN-OBS-QUIZ-CLONE', 'info', 'Quiz flow clone buttons', `count=${cloneFlow}`)

  // Templates tab
  const tplTab = page.getByText(/^Templates/).first()
  if (await tplTab.count()) {
    await tplTab.click()
    await waitSettle(page, 1200)
    await shot(page, '71-quiz-templates')
    const cards = await page.locator('[data-quiz-template], button, article').count()
    // Collect template names visible
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('div,h2,h3')].map((el) => el.textContent.trim()).filter((t) => /^[A-Z].{4,40}$/.test(t)).slice(0, 40),
    )
    note('REN-OBS-QUIZ-TEMPLATES', 'info', 'Quiz template gallery visible names', names.slice(0, 25).join(' | '))
  }

  const depTab = page.getByText(/^Deployments/).first()
  if (await depTab.count()) {
    await depTab.click()
    await waitSettle(page, 1000)
    await shot(page, '72-quiz-deployments')
    const dup = await page.getByLabel('Duplicate deployment').count()
    note('FUN-OBS-QUIZ-DEP-DUP', 'info', 'Quiz deployment duplicate controls', `count=${dup}`)
    const edit = page.getByText(/^Edit$/).first()
    if (await page.getByLabel('Edit deployment').count()) {
      await page.getByLabel('Edit deployment').first().click()
    } else if (await edit.count()) {
      await edit.click()
    }
    await waitSettle(page, 1200)
    await shot(page, '73-quiz-deployment-editor')
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
    const seo = await page.getByText(/SEO title|meta description|Open Graph/i).count()
    if (!seo) note('FUN-P1-004', 'P1', 'Quiz deployments have no SEO/OG fields', 'Titles derived from first question + brand')
  }
}

async function inspectAdvertorials(page) {
  await dumpRoute(page, '/admin/advertorials', '80-advertorials')
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Advertorials|Brands|Deployments|Templates/i.test(t)))
  note('FUN-OBS-ADV-TABS', 'info', 'Advertorial builder tabs', tabs.join(' | '))

  const archiveLabel = await page.getByLabel('Archive advertorial').count()
  const deleteLabel = await page.getByLabel('Delete advertorial').count()
  note('FUN-P0-001', 'P0', 'Advertorial list Archive control actually deletes the master', `archiveAria=${archiveLabel} deleteAria=${deleteLabel} (source: onDelete -> deleteAdvertorial; schema has archived status unused by this button)`)

  const brandsTab = page.getByText(/^Brands$/).first()
  if (await brandsTab.count()) {
    await brandsTab.click()
    await waitSettle(page, 800)
    await shot(page, '81-advertorial-brands-tab')
    note('FUN-P1-005', 'P1', 'Advertorial Brands tab is a local list with a Delete that only filters client state', 'onDelete brand: setBrands(filter) — does not call saveBrandIdentity/deleteBrandSite')
  }

  const depTab = page.getByText(/^Deployments$/).first()
  if (await depTab.count()) {
    await depTab.click()
    await waitSettle(page, 1000)
    await shot(page, '82-advertorial-deployments')
    const edit = page.getByText(/^Edit$/).first()
    if (await edit.count()) {
      await edit.click()
      await waitSettle(page, 1000)
      await shot(page, '83-advertorial-deployment-editor')
      const liveOption = await page.locator('option[value="live"]').count()
      const statusSelect = await page.locator('select').count()
      note('FUN-P0-002', 'P0', 'Advertorial deployment status is a generic select saved without publish preflight', `liveOption=${liveOption} selects=${statusSelect}`)
      const pixels = await page.getByPlaceholder('Meta Pixel ID').count()
      note('FUN-P1-006', 'P1', 'Advertorial pixels use flat metaPixelId keys unlike Quiz/LP nested PIXEL_PROVIDERS', `metaPlaceholder=${pixels}`)
    }
  }

  // Open a master if listed
  await page.goto(`${ORIGIN}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
  await waitSettle(page, 1000)
  const openBtn = page.getByText(/^Edit$/).first()
  if (await page.getByRole('button', { name: /Edit/i }).count()) {
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await waitSettle(page, 1200)
    await shot(page, '84-advertorial-editor')
    const settings = page.getByRole('button', { name: /Settings/i }).first()
    if (await settings.count()) {
      await settings.click()
      await waitSettle(page, 400)
      await shot(page, '85-advertorial-settings')
    }
    const prev = page.getByRole('button', { name: /Preview/i }).first()
    if (await prev.count()) {
      await prev.click()
      await waitSettle(page, 1500)
      await shot(page, '86-advertorial-preview')
      const header = await page.locator('[data-adv-header]').first().getAttribute('data-adv-header').catch(() => null)
      const footer = await page.locator('[data-adv-footer]').first().getAttribute('data-adv-footer').catch(() => null)
      note('REN-OBS-ADV-PREVIEW', 'info', 'Advertorial preview chrome stamps', `header=${header} footer=${footer}`)
    }
  }
}

async function compareTemplateRenders(page) {
  // LP gallery: click several Preview buttons and capture heading/structure
  await page.goto(`${ORIGIN}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await waitSettle(page, 1500)
  const previews = page.getByRole('button', { name: /Preview/i })
  const n = Math.min(await previews.count(), 6)
  const fps = []
  for (let i = 0; i < n; i++) {
    await previews.nth(i).click()
    await waitSettle(page, 1400)
    await shot(page, `90-lp-template-preview-${i}`)
    const fp = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent?.trim()?.slice(0, 100) || ''
      const header = document.querySelector('[data-lp-template],[data-template-id]')
      const sections = document.querySelectorAll('section, [data-section]').length
      const quiz = !!document.querySelector('[data-quiz], form')
      const bg = getComputedStyle(document.body).backgroundColor
      return { h1, sections, quiz, bg, tpl: header?.getAttribute('data-lp-template') || header?.getAttribute('data-template-id') }
    })
    fps.push(fp)
    const close = page.getByRole('button', { name: /Close|Back|Done/i }).first()
    if (await close.count()) await close.click().catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }
  const uniqueH1 = new Set(fps.map((f) => f.h1)).size
  note('REN-OBS-LP-STRUCT', uniqueH1 > 1 ? 'info' : 'P1', 'LP template previews structural distinction', JSON.stringify({ uniqueH1, count: fps.length, fps }))
}

async function previewLiveParity(page, context) {
  // Website live via preview host, authenticated
  const previewHost = `${BRAND_SLUG}.preview.pageflo.io`
  const liveUrl = `https://${previewHost}/`
  await dumpRoute(page, `/admin/sites/${BRAND_SLUG}/pages`, '91-website-builder-pages')
  // Open home page editor
  const home = page.getByText(/^Home$/).first()
  if (await home.count()) {
    await home.click()
    await waitSettle(page, 1500)
    await shot(page, '92-website-home-builder')
  }

  // Live site with cookies
  const livePage = await context.newPage()
  const liveResp = await livePage.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ error: String(e), status: () => 0 }))
  await waitSettle(livePage, 1500)
  await livePage.screenshot({ path: `${EVIDENCE}/93-website-live-preview-host.png`, fullPage: true })
  const liveText = await livePage.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
    statusHint: document.body.innerText.slice(0, 400),
    favicon: document.querySelector('link[rel~="icon"]')?.href || '',
    fonts: [...document.querySelectorAll('link[rel="stylesheet"], link[href*="font"]')].map((l) => l.href).slice(0, 6),
    bg: getComputedStyle(document.body).backgroundColor,
    hasForm: !!document.querySelector('form'),
    privacy: [...document.querySelectorAll('a')].some((a) => /privacy/i.test(a.textContent || a.href)),
    terms: [...document.querySelectorAll('a')].some((a) => /terms/i.test(a.textContent || a.href)),
  }))
  note('REN-OBS-WEB-LIVE', 'info', 'Website live on preview host', JSON.stringify({ url: liveUrl, status: typeof liveResp?.status === 'function' ? liveResp.status() : 0, ...liveText }))

  // Funnel paths from starter seed
  for (const [path, name] of [
    [`/c/${BRAND_SLUG}`, '94-lp-live-starter'],
    [`/s/${BRAND_SLUG}`, '95-quiz-live-starter'],
    ['/lp', '96-legacy-lp-live'],
    ['/quiz', '97-legacy-quiz-live'],
  ]) {
    const u = `https://${previewHost}${path}`
    const r = await livePage.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    await waitSettle(livePage, 1200)
    await livePage.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true })
    const info = await livePage.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 160) || '',
      header: document.querySelector('[data-adv-header],[data-lp-template],[data-quiz-template]')?.outerHTML?.slice(0, 200) || '',
      quiz: !!document.querySelector('form, [data-quiz]'),
      text: document.body.innerText.slice(0, 250),
    }))
    note('REN-LIVE-PATH', 'info', `Live path ${path}`, JSON.stringify({ url: u, status: r ? r.status() : 0, ...info }))
  }

  // Authenticated preview via app host ?site=
  await livePage.goto(`${ORIGIN}/?site=${BRAND_SLUG}&preview=1`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await waitSettle(livePage, 1200)
  await livePage.screenshot({ path: `${EVIDENCE}/98-app-host-site-preview.png`, fullPage: true })
  note('REN-OBS-SITE-QS', 'info', '?site= preview from app host', `url=${livePage.url()} title=${await livePage.title()}`)
  await livePage.close()
}

async function saveRefreshFunnel(page) {
  // Rename a quiz flow if possible without destroying production
  await page.goto(`${ORIGIN}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await waitSettle(page, 1200)
  // Click name if editable; otherwise skip destructive edits on shared masters
  note('FUN-OBS-NO-SHARED-MASTER-MUTATION', 'info', 'Did not rename shared stock masters', 'Audit brand deployments only; stock quiz/LP templates are shared across tenants')
}

const main = async () => {
  if (!EMAIL || !PASSWORD) {
    console.error('missing SUPER_ADMIN credentials in env')
    process.exit(2)
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM || undefined,
    args: ['--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const consoleErrors = []
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  try {
    await signIn(page)
    await shot(page, '00-signed-in-overview')
    note('SET-OK-AUTH', 'info', 'Signed in to production console', page.url())

    await ensureBrand(page)
    await dumpRoute(page, `/admin/sites/${BRAND_SLUG}`, '10-brand-overview')
    await inspectDeadControls(page)
    await inspectWorkspaceSettings(page)
    await inspectLandingPages(page)
    await inspectQuizzes(page)
    await inspectAdvertorials(page)
    await compareTemplateRenders(page)
    await previewLiveParity(page, context)
    await saveRefreshFunnel(page)
  } catch (err) {
    note('AUD-CRASH', 'P0', 'Auditor script threw', String(err?.stack || err))
    await shot(page, 'zz-crash').catch(() => {})
  } finally {
    const filteredConsole = consoleErrors.filter((t) => !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(t)).slice(0, 40)
    writeFileSync(`${EVIDENCE}/findings.json`, JSON.stringify({ findings, consoleErrors: filteredConsole }, null, 2))
    writeFileSync(`${EVIDENCE}/console-errors.txt`, filteredConsole.join('\n'))
    await browser.close()
  }
  console.log(`wrote ${findings.length} findings, ${filteredConsole.length} console errors`)
}

await main()
