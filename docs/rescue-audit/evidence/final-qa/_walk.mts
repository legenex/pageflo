/**
 * Final QA: operate production PageFlo as a human would.
 * Clicks real controls. HTTP 200 is not a pass.
 * Never prints passwords.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchChromium, browserProvenance } from '../../../../scripts/lib/browser.ts'
import type { Browser, BrowserContext, Page, Response } from 'playwright'

const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const BRAND_SLUG = 'pageflo-rescue-acceptance-944138'
const BRAND_NAME = 'PageFlo Rescue Acceptance 944138'
const PREVIEW = `https://${BRAND_SLUG}.preview.pageflo.io`
const LEGACY_PREVIEW = `https://${BRAND_SLUG}.preview.legenex.com`
const EVIDENCE = path.resolve('docs/rescue-audit/evidence/final-qa')
const RUN = `finalqa${Date.now().toString(36)}`
const LEAD_EMAIL = `finalqa-${RUN}@legenex.test`
const LEAD_FIRST = 'FinalQA'
const LEAD_LAST = `Browser ${RUN}`

mkdirSync(EVIDENCE, { recursive: true })

type Step = {
  id: string
  ok: boolean | null
  detail: string
  url?: string
}

const steps: Step[] = []
const notes: string[] = []
const failures: string[] = []
const urls: Record<string, string> = {}
let leadId: string | null = null
let brandSlug = BRAND_SLUG
let brandName = BRAND_NAME

const note = (s: string) => {
  notes.push(s)
  console.log(s)
}

const record = (id: string, ok: boolean | null, detail: string, url?: string) => {
  steps.push({ id, ok, detail, url })
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'
  note(`${mark} [${id}] ${detail}${url ? ` @ ${url}` : ''}`)
  if (ok === false) failures.push(`${id}: ${detail}`)
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

const shot = async (page: Page, name: string) => {
  const dest = path.join(EVIDENCE, `${name}.png`)
  await page.screenshot({ path: dest, fullPage: true }).catch((e) => note(`SHOT FAIL ${name} ${e}`))
  note(`SHOT ${name} ${page.url()}`)
}

const bodyText = async (page: Page): Promise<string> =>
  ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()

const dumpControls = async (page: Page, label: string) => {
  const ctrls = await page
    .locator('button, a, input, select, textarea, [role="button"], [data-quiz-answer], [data-quiz-submit]')
    .evaluateAll((els) =>
      els.slice(0, 40).map((e) => ({
        tag: e.tagName.toLowerCase(),
        type: (e as HTMLInputElement).type || null,
        name: (e as HTMLInputElement).name || null,
        text: (e.textContent || '').trim().slice(0, 60),
        aria: e.getAttribute('aria-label'),
        href: (e as HTMLAnchorElement).href || null,
      })),
    )
    .catch(() => [])
  note(`CONTROLS ${label}: ${JSON.stringify(ctrls)}`)
}

const waitIdle = async (page: Page, ms = 800) => {
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.waitForTimeout(ms)
}

const clickFirst = async (page: Page, locator: ReturnType<Page['locator']>, label: string): Promise<boolean> => {
  const n = await locator.count()
  if (n === 0) {
    note(`NO-CLICK ${label} (count=0)`)
    return false
  }
  await locator.first().click({ timeout: 8000 }).catch(async (e) => {
    note(`CLICK-FAIL ${label} ${e}`)
    await locator.first().click({ force: true, timeout: 4000 }).catch((e2) => note(`CLICK-FORCE-FAIL ${label} ${e2}`))
  })
  note(`CLICKED ${label}`)
  return true
}

const { email, password } = creds()
note(`browser: ${browserProvenance()}`)
note(`run=${RUN} operator=${email} brand=${BRAND_SLUG}`)

const browser = await launchChromium({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const adminCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
})
const visitorCtx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ignoreHTTPSErrors: true,
})

const admin = await adminCtx.newPage()
admin.setDefaultTimeout(15000)
admin.on('console', (m) => {
  if (m.type() === 'error') note(`ADMIN-CONSOLE ${m.text().slice(0, 240)}`)
})

const visitor = await visitorCtx.newPage()
visitor.setDefaultTimeout(25000)
visitor.on('console', (m) => {
  if (m.type() === 'error') note(`VISITOR-CONSOLE ${m.text().slice(0, 240)}`)
})

const visitPublic = async (page: Page, url: string, shotName: string): Promise<{ status: number | null; text: string; title: string }> => {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
    note(`GOTO-ERR ${url} ${e}`)
    return null
  })
  await waitIdle(page, 1200)
  await shot(page, shotName)
  const text = await bodyText(page)
  const title = await page.title().catch(() => '')
  const status = res?.status() ?? null
  note(`PUBLIC ${status} ${url} title=${JSON.stringify(title)} body=${text.slice(0, 280)}`)
  return { status, text, title }
}

const looksBroken = (text: string, title: string): string | null => {
  if (/application error|this page could not|internal server error|something went wrong/i.test(text + ' ' + title)) {
    return 'error page'
  }
  if (/^404|not found|no site found|unknown host/i.test(text) && text.length < 400) return 'not found'
  if (/\{\{[a-z._]+\}\}/i.test(text)) return 'placeholder leak'
  if (/Injury Type12121212|\/submitted \(Qualified\)|This deployment/i.test(text)) return 'authoring junk'
  if (/\[Author\]|X min read|Opening paragraph that sets the scene|PINTEST/i.test(text)) return 'authoring junk / template leftovers'
  return null
}

try {
  /* ------------------------------------------------------------------ LOGIN */
  await admin.goto(`${APP}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitIdle(admin, 600)
  await shot(admin, '01-sign-in')
  urls.signIn = admin.url()
  record('login.page', /sign-in/.test(admin.url()), `sign-in loaded title=${await admin.title()}`, admin.url())

  await admin.locator('input[name="email"], input[type="email"]').first().fill(email)
  await admin.locator('input[name="password"], input[type="password"]').first().fill(password)
  await shot(admin, '01b-sign-in-filled')
  await Promise.all([
    admin.waitForURL(/\/admin/, { timeout: 30000 }).catch(() => null),
    admin.locator('button[type="submit"]').first().click(),
  ])
  await waitIdle(admin, 1500)
  await shot(admin, '02-after-login')
  urls.afterLogin = admin.url()
  if (admin.url().includes('sign-in')) {
    const alert = ((await admin.locator('[role="alert"]').first().innerText().catch(() => '')) || '').trim()
    record('login', false, `stayed on sign-in: ${alert || 'no alert'}`)
    throw new Error('LOGIN_FAILED')
  }
  record('login', /\/admin/.test(admin.url()), `reached ${admin.url()}`)

  /* ------------------------------------------------------------------ BRANDS */
  const brandsNav = admin.locator('a[href="/admin/sites"], a[href*="/admin/sites"]').filter({ hasText: /Brand/i }).first()
  if (await brandsNav.count()) {
    await brandsNav.click()
  } else {
    await admin.goto(`${APP}/admin/sites`, { waitUntil: 'domcontentloaded' })
  }
  await waitIdle(admin, 1000)
  await shot(admin, '03-brands')
  urls.brands = admin.url()
  const brandsText = await bodyText(admin)
  const existingVisible = brandsText.includes(BRAND_SLUG) || brandsText.includes(BRAND_NAME)
  record('brand.list', existingVisible, existingVisible ? `found ${BRAND_SLUG}` : 'acceptance brand not in list')

  const searchSites = admin.getByRole('searchbox', { name: /Search Sites/i }).or(admin.locator('input[type="search"]'))
  if (await searchSites.count()) {
    await searchSites.first().fill('pageflo-rescue-acceptance')
    await waitIdle(admin, 1200)
    await shot(admin, '03a-brands-searched')
  }

  if (!existingVisible) {
    const newBrand = admin.getByRole('button', { name: /New Brand/i }).first()
    if (await newBrand.count()) {
      await newBrand.click()
      await waitIdle(admin, 800)
      await shot(admin, '03b-new-brand-wizard')
      const qaName = `FinalQA ${RUN}`
      await admin.locator('input[placeholder="Claim Checker"], input').first().fill(qaName)
      await waitIdle(admin, 600)
      await shot(admin, '03c-new-brand-filled')
      const createBtn = admin.getByRole('button', { name: /Create Brand|Create/i }).last()
      await clickFirst(admin, createBtn, 'Create Brand')
      await waitIdle(admin, 2500)
      await shot(admin, '03d-brand-created')
      const m = admin.url().match(/\/admin\/sites\/([^/?#]+)/)
      if (m) {
        brandSlug = m[1]
        brandName = qaName
        record('brand.create', true, `created ${brandSlug}`, admin.url())
      } else {
        record('brand.create', false, `create did not land on brand dashboard ${admin.url()}`)
      }
    } else {
      record('brand.create', false, 'New Brand control missing and existing brand not found')
    }
  } else {
    const brandLink = admin.getByRole('link', { name: /PageFlo Rescue Acceptance 944138/i }).first()
    const clicked = await clickFirst(admin, brandLink, 'acceptance brand row')
    if (!clicked || !admin.url().includes(`/admin/sites/${BRAND_SLUG}`)) {
      const visible = admin.locator(`a[href="/admin/sites/${BRAND_SLUG}"]:visible`)
      if (await visible.count()) await visible.first().click({ force: true }).catch(() => null)
    }
    await waitIdle(admin, 1000)
    if (!admin.url().includes(`/admin/sites/${BRAND_SLUG}`)) {
      note('brand row click did not navigate; opening dashboard URL after observing the row')
      await admin.goto(`${APP}/admin/sites/${BRAND_SLUG}`, { waitUntil: 'domcontentloaded' })
      await waitIdle(admin, 800)
    }
  }

  await shot(admin, '04-brand-dashboard')
  urls.brandDashboard = admin.url()
  const dashText = await bodyText(admin)
  record(
    'brand.dashboard',
    admin.url().includes(`/admin/sites/${brandSlug}`),
    `heading/body has brand=${dashText.slice(0, 180)}`,
    admin.url(),
  )

  /* ------------------------------------------------------------------ SETTINGS SAVE / RELOAD */
  const editBrand = admin.getByRole('link', { name: /Edit Brand/i }).first()
  if (await editBrand.count()) {
    await editBrand.click()
  } else {
    await admin.goto(`${APP}/admin/sites/${brandSlug}/settings/general`, { waitUntil: 'domcontentloaded' })
  }
  await waitIdle(admin, 1000)
  await shot(admin, '05-settings-general')
  urls.settings = admin.url()
  const settingsHeading = await admin.getByRole('heading', { name: /General Settings/i }).count()
  record('settings.load', settingsHeading > 0, `general settings heading count=${settingsHeading}`)

  const taglineValue = `FinalQA tagline ${RUN}`
  const tagline = admin.locator('input[name="tagline"]')
  if (await tagline.count()) {
    await tagline.fill(taglineValue)
  } else {
    record('settings.tagline', false, 'no tagline input')
  }
  const tcpa = admin.locator('textarea[name="tcpa_text"]')
  if (await tcpa.count()) {
    const current = await tcpa.inputValue().catch(() => '')
    if (!current.trim()) {
      await tcpa.fill(
        'By submitting this form you agree PageFlo FinalQA may contact you by phone, SMS, or email. Message and data rates may apply. Consent is not a condition of purchase.',
      )
    }
  }
  await shot(admin, '05b-settings-filled')
  const saveBtn = admin.getByRole('button', { name: /Save Settings/i })
  const saved = await clickFirst(admin, saveBtn, 'Save Settings')
  await waitIdle(admin, 1800)
  await shot(admin, '06-settings-saved')
  const savedMsg = (await bodyText(admin)).includes('Saved')
  record('settings.save', saved && savedMsg, savedMsg ? 'Saved confirmation visible' : 'no Saved confirmation after click')

  await admin.reload({ waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1000)
  await shot(admin, '07-settings-reloaded')
  const afterReload = await tagline.inputValue().catch(() => '')
  record('settings.reload', afterReload === taglineValue, `tagline after reload=${JSON.stringify(afterReload)}`)

  /* ------------------------------------------------------------------ WEBSITE PREVIEW (click from brand) */
  await admin.goto(`${APP}/admin/sites/${brandSlug}`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 800)
  const previewBtn = admin.getByRole('link', { name: /Preview site|View Live Site/i }).first()
  let websitePreviewUrl = ''
  if (await previewBtn.count()) {
    const href = await previewBtn.getAttribute('href')
    websitePreviewUrl = href || ''
    urls.websitePreviewControl = websitePreviewUrl
    const popupPromise = adminCtx.waitForEvent('page', { timeout: 8000 }).catch(() => null)
    await previewBtn.click()
    const popup = await popupPromise
    if (popup) {
      await waitIdle(popup, 1500)
      await shot(popup, '08-website-preview-popup')
      const pText = await bodyText(popup)
      const pTitle = await popup.title().catch(() => '')
      const broken = looksBroken(pText, pTitle)
      urls.websitePreview = popup.url()
      record(
        'website.preview.click',
        !broken && pText.length > 40,
        broken ? `preview broken: ${broken}` : `popup rendered ${pText.slice(0, 160)}`,
        popup.url(),
      )
      await popup.close().catch(() => null)
    } else if (href) {
      const pub = await visitPublic(visitor, href, '08-website-preview-direct')
      const broken = looksBroken(pub.text, pub.title)
      urls.websitePreview = href
      record(
        'website.preview.click',
        !broken && (pub.status === 200) && pub.text.length > 40,
        broken ? `preview broken: ${broken}` : `visited href ${pub.text.slice(0, 160)}`,
        href,
      )
    } else {
      record('website.preview.click', false, 'Preview site click produced no popup and no href')
    }
  } else {
    record('website.preview.click', false, 'Preview site / View Live Site control missing')
  }

  /* Websites list -> Pages -> Preview page */
  await admin.goto(`${APP}/admin/websites`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 800)
  await shot(admin, '09-websites')
  const pagesRow = admin.locator('tr, [class*="Tr"]').filter({ hasText: brandName }).first()
  const pagesLink = pagesRow.getByRole('link', { name: /^Pages$/i }).or(
    admin.locator(`a[href="/admin/sites/${brandSlug}/pages"]:visible`),
  )
  if (await pagesLink.count()) {
    await pagesLink.first().click()
    await waitIdle(admin, 900)
  }
  if (!admin.url().includes(`/admin/sites/${brandSlug}/pages`)) {
    await admin.goto(`${APP}/admin/sites/${brandSlug}/pages`, { waitUntil: 'domcontentloaded' })
  }
  await waitIdle(admin, 900)
  await shot(admin, '10-website-pages')
  urls.websitePages = admin.url()
  const pageOptions = admin.getByRole('button', { name: /Page options/i })
  if (await pageOptions.count()) {
    await pageOptions.first().click()
    await waitIdle(admin, 400)
    await shot(admin, '10b-page-menu')
    const previewPage = admin.getByRole('link', { name: /Preview page/i }).or(admin.getByText('Preview page')).first()
    if (await previewPage.count()) {
      const href = await previewPage.getAttribute('href')
      note(`page-row preview href=${href}`)
      const popupPromise = adminCtx.waitForEvent('page', { timeout: 6000 }).catch(() => null)
      await previewPage.click()
      const popup = await popupPromise
      if (popup) {
        await waitIdle(popup, 1200)
        await shot(popup, '10c-page-preview-popup')
        urls.pageRowPreview = popup.url()
        record('website.pagePreview', true, `page preview opened ${popup.url()}`, popup.url())
        await popup.close().catch(() => null)
      } else if (href) {
        record('website.pagePreview', true, `preview href present ${href}`, href)
      } else {
        record('website.pagePreview', false, 'Preview page click did nothing')
      }
    } else {
      record('website.pagePreview', false, 'Preview page link missing in menu')
    }
  } else {
    record('website.pagePreview', null, 'no Page options menus; pages list may be empty')
  }

  /* ------------------------------------------------------------------ DEPLOYMENTS: extract public URLs by clicking tabs */
  const extractHostUrls = async (page: Page): Promise<string[]> => {
    const hrefs = await page.locator('a[href]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).href).filter(Boolean),
    )
    const text = await bodyText(page)
    const fromText = text.match(/https?:\/\/[^\s]+/g) || []
    const mono = await page.locator('code, [style*="JetBrains"], .font-mono').allTextContents().catch(() => [])
    const all = [...hrefs, ...fromText, ...mono]
    const uniq = [...new Set(all.map((u) => u.trim().replace(/[.,)]+$/, '')))]
    return uniq.filter((u) => /preview\.(pageflo\.io|legenex\.com)/i.test(u) || /^https?:\/\/[^/]+\/(s|c|adv|q|a)\//i.test(u))
  }

  const openDeploymentsTab = async (page: Page) => {
    const tab = page.getByRole('button', { name: /Deployments/i }).first()
    if (await tab.count()) {
      await tab.click()
      await waitIdle(page, 1100)
      return true
    }
    return false
  }

  await admin.goto(`${APP}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1000)
  await shot(admin, '20-quizzes')
  await openDeploymentsTab(admin)
  await shot(admin, '21-quiz-deployments')
  const quizUrls = await extractHostUrls(admin)
  note(`quiz deployment urls: ${JSON.stringify(quizUrls)}`)
  urls.quizAdmin = admin.url()

  const quizRow = admin.locator(`[data-quiz-deployment]`).filter({ hasText: new RegExp(brandSlug.split('-').slice(0, 3).join('|') + '|Rescue Acceptance|FinalQA', 'i') })
  const anyQuizDep = admin.locator('[data-quiz-deployment]')
  const quizDepCount = await anyQuizDep.count()
  record('quiz.deployments.list', quizDepCount > 0, `${quizDepCount} quiz deployments visible`)

  let quizPublicUrl = quizUrls.find((u) => u.includes(brandSlug) && /\/s\//.test(u)) || `${PREVIEW}/s/${brandSlug}`
  const quizAcc = admin.locator('[data-quiz-deployment]').filter({ hasText: /Rescue Acceptance/i }).first()
  if (await quizAcc.count()) {
    const qStatus = (await quizAcc.getAttribute('data-quiz-deployment-status')) || ''
    const qPub = quizAcc.getByRole('button', { name: /Publish deployment/i })
    if (qStatus === 'live') {
      record('deploy.quiz.publish', true, 'acceptance quiz deployment already LIVE')
    } else if (await qPub.count()) {
      await qPub.click()
      await waitIdle(admin, 2000)
      await shot(admin, '21c-quiz-publish-clicked')
      record('deploy.quiz.publish', true, `clicked Publish on acceptance quiz (was ${qStatus})`)
    } else {
      record('deploy.quiz.publish', false, `acceptance quiz status=${qStatus}, no publish button`)
    }
    const qPrev = quizAcc.getByRole('button', { name: /Preview/i })
    if (await qPrev.count()) {
      await qPrev.click()
      await waitIdle(admin, 800)
      await shot(admin, '21b-quiz-inapp-preview')
    }
  } else {
    record('deploy.quiz.publish', false, 'acceptance quiz deployment row not found')
  }

  /* Landing pages */
  await admin.goto(`${APP}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1000)
  await shot(admin, '30-landing-pages')
  await openDeploymentsTab(admin)
  await shot(admin, '31-lp-deployments')
  const lpUrls = await extractHostUrls(admin)
  note(`lp deployment urls: ${JSON.stringify(lpUrls)}`)
  let lpPublicUrl = lpUrls.find((u) => u.includes(brandSlug) && /\/c\//.test(u)) || `${PREVIEW}/c/${brandSlug}`
  urls.lpAdmin = admin.url()

  const lpRowText = await bodyText(admin)
  record('lp.deployments.list', /landing|deployment|LIVE|DRAFT/i.test(lpRowText), `lp deployments body=${lpRowText.slice(0, 200)}`)

  const lpAcc = admin.locator('[data-lp-deployment]').filter({ hasText: /Rescue Acceptance/i }).first()
  if (await lpAcc.count()) {
    const lpStatus = (await lpAcc.getAttribute('data-lp-deployment-status')) || ''
    const lpPub = lpAcc.getByRole('button', { name: /Publish deployment/i })
    if (lpStatus === 'live') {
      record('deploy.lp.publish', true, 'acceptance LP deployment already LIVE; did not toggle another brand')
    } else if (await lpPub.count()) {
      await lpPub.click()
      await waitIdle(admin, 2200)
      await shot(admin, '32-lp-publish-clicked')
      record('deploy.lp.publish', true, `clicked Publish on acceptance LP (was ${lpStatus})`)
    } else {
      record('deploy.lp.publish', false, `acceptance LP status=${lpStatus}, no publish button`)
    }
    const lpPrev = lpAcc.getByRole('button', { name: /Preview/i })
    if (await lpPrev.count()) {
      await lpPrev.click().catch(() => null)
      await waitIdle(admin, 800)
      await shot(admin, '33-lp-inapp-preview')
    }
  } else {
    record('deploy.lp.publish', false, 'acceptance LP deployment row not found')
  }

  /* Advertorials */
  await admin.goto(`${APP}/admin/advertorials`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1000)
  await shot(admin, '40-advertorials')
  await openDeploymentsTab(admin)
  await shot(admin, '41-adv-deployments')
  const advUrls = await extractHostUrls(admin)
  note(`adv deployment urls: ${JSON.stringify(advUrls)}`)
  let advPublicUrl =
    advUrls.find((u) => u.includes(brandSlug) && /\/adv\/rescue-qa/i.test(u)) ||
    advUrls.find((u) => u.includes(brandSlug) && /\/adv\//.test(u) && !/\/adv\/pin/i.test(u)) ||
    advUrls.find((u) => /\/adv\/letter/.test(u)) ||
    `${PREVIEW}/adv/letter`
  urls.advAdmin = admin.url()

  const advPublish = admin.getByRole('button', { name: /^Publish$/i }).or(admin.getByRole('button', { name: /Publish deployment/i }))
  if (await advPublish.count()) {
    await advPublish.first().click()
    await waitIdle(admin, 2200)
    await shot(admin, '42-adv-publish-clicked')
    record('deploy.adv.publish', true, 'clicked Publish on advertorial')
  } else {
    const live = await admin.getByText(/^LIVE$/i).count()
    record('deploy.adv.publish', live > 0 ? true : null, live > 0 ? 'advertorial already LIVE' : 'no advertorial publish control')
  }

  /* Deployments index */
  await admin.goto(`${APP}/admin/deployments`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 900)
  await shot(admin, '43-deployments-index')
  urls.deploymentsIndex = admin.url()
  record('deploy.index', /deploy/i.test(await bodyText(admin)), `deployments index ${admin.url()}`)

  /* ------------------------------------------------------------------ PUBLIC PREVIEW HOSTS (visitor, clicked navigation) */
  const previewHome = await visitPublic(visitor, PREVIEW + '/', '50-preview-pageflo-home')
  urls.previewPagefloHome = PREVIEW + '/'
  const homeBroken = looksBroken(previewHome.text, previewHome.title)
  record(
    'preview.pageflo.home',
    !homeBroken && previewHome.status === 200 && previewHome.text.length > 80,
    homeBroken ? homeBroken : `status=${previewHome.status} ${previewHome.text.slice(0, 140)}`,
    PREVIEW + '/',
  )

  const legacyHome = await visitPublic(visitor, LEGACY_PREVIEW + '/', '51-preview-legenex-home')
  urls.previewLegenexHome = LEGACY_PREVIEW + '/'
  const legacyBroken = looksBroken(legacyHome.text, legacyHome.title)
  record(
    'preview.legenex.home',
    !legacyBroken && legacyHome.status === 200 && legacyHome.text.length > 80,
    legacyBroken ? legacyBroken : `status=${legacyHome.status} ${legacyHome.text.slice(0, 140)}`,
    LEGACY_PREVIEW + '/',
  )

  /* Click a link on the website if present */
  const siteLink = visitor.locator('a[href]').filter({ hasNotText: /admin|sign-in|mailto/i }).first()
  if (await siteLink.count()) {
    const href = await siteLink.getAttribute('href')
    note(`clicked in-site link ${href}`)
    await siteLink.click().catch(() => null)
    await waitIdle(visitor, 1000)
    await shot(visitor, '52-website-inpage-click')
  }

  /* ------------------------------------------------------------------ QUIZ VISITOR: two branches + submit */
  urls.quizPublic = quizPublicUrl
  const quizWithUtm = `${quizPublicUrl}${quizPublicUrl.includes('?') ? '&' : '?'}utm_source=finalqa&utm_medium=browser&utm_campaign=${RUN}`
  const quizStart = await visitPublic(visitor, quizWithUtm, '60-quiz-start')
  await visitor.waitForSelector('[data-quiz-root]', { timeout: 20000 }).catch(() => null)
  const quizMounted = (await visitor.locator('[data-quiz-root]').count()) > 0
  record('quiz.mount', quizMounted, quizMounted ? `mounted node=${await visitor.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)}` : `no quiz root ${quizStart.text.slice(0, 160)}`, quizWithUtm)

  const firstQuestion = ((await visitor.locator('[data-quiz-question], [data-quiz-headline]').first().textContent().catch(() => '')) || '').trim()
  note(`quiz first question: ${firstQuestion}`)

  let branchA = ''
  let branchB = ''
  const answers = visitor.locator('[data-quiz-answer]')
  const answerCount = await answers.count()
  note(`quiz answers on start: ${answerCount}`)

  if (answerCount >= 1) {
    const labelA = ((await answers.nth(0).textContent()) || '').trim()
    await answers.nth(0).click()
    await waitIdle(visitor, 900)
    await shot(visitor, '61-quiz-branch-a')
    branchA = ((await visitor.locator('[data-quiz-question], [data-quiz-headline]').first().textContent().catch(() => '')) || '').trim()
    record('quiz.branchA', branchA !== firstQuestion || (await visitor.locator('[data-quiz-form]').count()) > 0, `clicked "${labelA}" now="${branchA.slice(0, 80)}"`)

    const back = visitor.locator('[data-quiz-back]')
    if (await back.count()) {
      await back.first().click()
      await waitIdle(visitor, 700)
      await shot(visitor, '62-quiz-back')
    } else {
      await visitPublic(visitor, quizWithUtm, '62-quiz-restart')
      await visitor.waitForSelector('[data-quiz-root]', { timeout: 15000 }).catch(() => null)
    }

    const answers2 = visitor.locator('[data-quiz-answer]')
    if ((await answers2.count()) > 1) {
      const labelB = ((await answers2.nth(1).textContent()) || '').trim()
      await answers2.nth(1).click()
      await waitIdle(visitor, 900)
      await shot(visitor, '63-quiz-branch-b')
      branchB = ((await visitor.locator('[data-quiz-question], [data-quiz-headline]').first().textContent().catch(() => '')) || '').trim()
      record('quiz.branchB', branchB !== firstQuestion, `clicked "${labelB}" now="${branchB.slice(0, 80)}"`)
    } else {
      record('quiz.branchB', null, 'second answer not available after return')
    }

    await visitPublic(visitor, quizWithUtm, '63b-quiz-restart-auto')
    await visitor.waitForSelector('[data-quiz-root]', { timeout: 15000 }).catch(() => null)
    const restartAnswers = visitor.locator('[data-quiz-answer]')
    if (await restartAnswers.count()) {
      const autoLabel = ((await restartAnswers.first().textContent()) || '').trim()
      await restartAnswers.first().click()
      await waitIdle(visitor, 900)
      note(`restarted quiz on qualified branch "${autoLabel}"`)
    }
  } else {
    record('quiz.branchA', null, 'start node has no [data-quiz-answer] buttons')
    record('quiz.branchB', null, 'cannot probe second branch without answers')
  }

  const visibleHeadline = async (): Promise<string> => {
    const loc = visitor.locator('[data-quiz-headline]:visible, [data-quiz-question]:visible').first()
    return ((await loc.textContent().catch(() => '')) || '').trim()
  }

  const pickSelect = async (sel: ReturnType<Page['locator']>) => {
    const disabled = await sel.isDisabled().catch(() => true)
    if (disabled) return false
    const current = await sel.inputValue().catch(() => '')
    if (current) return false
    const options = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o.textContent || '').trim() })).filter((o) => o.value),
    )
    const prefer =
      options.find((o) => /texas|^TX$|2024|March|^3$/i.test(`${o.label} ${o.value}`)) ||
      options.find((o) => o.value === '2024') ||
      options[0]
    if (!prefer) return false
    await sel.selectOption(prefer.value).catch(async () => {
      await sel.selectOption({ label: prefer.label }).catch(() => null)
    })
    note(`quiz select -> ${prefer.label || prefer.value}`)
    return true
  }

  const walkQuiz = async (): Promise<'form' | 'endpoint' | 'stuck'> => {
    let last = ''
    let repeats = 0
    let spinnerWaits = 0
    for (let i = 0; i < 45; i++) {
      if ((await visitor.locator('[data-quiz-form]:visible').count()) > 0) return 'form'
      if ((await visitor.locator('[data-quiz-endpoint]:visible').count()) > 0) return 'endpoint'
      const nodeType = await visitor.locator('[data-quiz-node-type]').first().getAttribute('data-quiz-node-type').catch(() => null)
      const headline = await visibleHeadline()
      note(`quiz step ${i} type=${nodeType} "${headline.slice(0, 70)}"`)
      if (headline && headline === last) repeats += 1
      else repeats = 0
      last = headline

      const year = visitor.getByLabel('Year')
      if ((await year.count()) && !(await year.isDisabled().catch(() => true))) {
        await pickSelect(year.first())
        await waitIdle(visitor, 350)
      }
      const month = visitor.getByLabel('Month')
      if ((await month.count()) && !(await month.isDisabled().catch(() => true))) {
        await pickSelect(month.first())
        await waitIdle(visitor, 350)
      }
      const day = visitor.getByLabel('Day')
      if ((await day.count()) && (await day.isVisible().catch(() => false)) && !(await day.isDisabled().catch(() => true))) {
        await pickSelect(day.first())
        await waitIdle(visitor, 350)
      }

      const textarea = visitor.locator('[data-quiz-root] textarea:visible').first()
      if (await textarea.count()) {
        await textarea.click().catch(() => null)
        const cur = await textarea.inputValue().catch(() => '')
        if (!cur.trim()) {
          await textarea.pressSequentially('FinalQA rear-end collision, neck pain, ER same day. Safe test submission.', { delay: 4 }).catch(() => null)
        }
        await waitIdle(visitor, 200)
      }

      const otherSelects = visitor.locator('[data-quiz-root] select:visible')
      const nSel = await otherSelects.count()
      for (let s = 0; s < nSel; s++) {
        const sel = visitor.locator('[data-quiz-root] select:visible').nth(s)
        await pickSelect(sel)
        await waitIdle(visitor, 400)
      }

      const ans = visitor.locator('[data-quiz-answer]:visible')
      if (await ans.count()) {
        await ans.first().click()
        await waitIdle(visitor, 900)
        continue
      }

      const next = visitor.getByRole('button', { name: /^(Next|Continue)/i }).or(visitor.locator('[data-quiz-submit]:visible'))
      if (await next.count()) {
        const btn = next.first()
        const enabled = await btn.isEnabled().catch(() => false)
        if (enabled) {
          await btn.click()
          await waitIdle(visitor, 900)
          continue
        }
      }

      const hasVisitorControls =
        (await visitor.locator('[data-quiz-form]:visible, [data-quiz-answer]:visible, [data-quiz-endpoint]:visible, [data-quiz-root] select:visible, [data-quiz-root] textarea:visible, [data-quiz-submit]:visible').count()) > 0
      if (!hasVisitorControls) {
        const hiddenLive = (await visitor.getByText(/Hidden in live quiz/i).count()) > 0
        note(`quiz working/spinner hiddenLive=${hiddenLive}; waiting for next node (${spinnerWaits + 1})`)
        spinnerWaits += 1
        if (hiddenLive) record('quiz.hiddenLiveBadge', false, 'visitor live quiz showed builder-only "Hidden in live quiz · preview only"')
        await shot(visitor, `64b-quiz-working-${i}`)
        if (spinnerWaits > 2) {
          await dumpControls(visitor, `quiz-spinner-${i}`)
          return 'stuck'
        }
        await visitor
          .waitForSelector('[data-quiz-form], [data-quiz-answer], [data-quiz-endpoint], [data-quiz-root] select, [data-quiz-submit]', { timeout: 12000 })
          .catch(() => null)
        await waitIdle(visitor, 800)
        continue
      }

      if (repeats < 2 && nSel > 0) {
        await waitIdle(visitor, 500)
        continue
      }
      await dumpControls(visitor, `quiz-stuck-${i}`)
      await shot(visitor, `64-quiz-stuck-${i}`)
      return 'stuck'
    }
    return 'stuck'
  }

  const walkOutcome = await walkQuiz()
  await shot(visitor, '65-quiz-form-or-mid')
  record('quiz.reachForm', walkOutcome === 'form', `walk outcome=${walkOutcome}`)

  let leadPost: { status: number; body: string } | null = null
  visitor.on('response', async (res: Response) => {
    if (res.url().includes('/api/leads') && res.request().method() === 'POST') {
      const status = res.status()
      const body = await res.text().catch(() => '')
      leadPost = { status, body }
      note(`LEAD POST ${status} ${body.slice(0, 400)}`)
      try {
        const json = JSON.parse(body)
        if (json.lead_id != null) leadId = String(json.lead_id)
      } catch {
        /* ignore */
      }
    }
  })

  if (walkOutcome === 'form') {
    const fill = async (sel: string, value: string) => {
      const loc = visitor.locator(sel).first()
      if (await loc.count()) await loc.fill(value)
    }
    await fill('[data-quiz-form] input[name="first_name"], [data-quiz-form] #first_name', LEAD_FIRST)
    await fill('[data-quiz-form] input[name="last_name"], [data-quiz-form] #last_name', LEAD_LAST)
    await fill('[data-quiz-form] input[name="email"], [data-quiz-form] #email', LEAD_EMAIL)
    await fill('[data-quiz-form] input[name="mobile"], [data-quiz-form] input[name="phone"], [data-quiz-form] #mobile, [data-quiz-form] #phone', '5125550199')
    await fill('[data-quiz-form] input[name="zip"], [data-quiz-form] #zip', '78701')
    const checks = visitor.locator('[data-quiz-form] input[type="checkbox"]')
    const nCheck = await checks.count()
    for (let i = 0; i < nCheck; i++) {
      const c = checks.nth(i)
      if (!(await c.isChecked().catch(() => false))) await c.check({ force: true }).catch(() => null)
    }
    await shot(visitor, '66-quiz-form-filled')
    const submit = visitor.locator('[data-quiz-submit]').first()
    await clickFirst(visitor, submit, 'quiz submit')
    await visitor.waitForSelector('[data-quiz-endpoint]', { timeout: 25000 }).catch(() => null)
    await waitIdle(visitor, 2000)
    await shot(visitor, '67-quiz-submitted')
    const thanks = (await visitor.locator('[data-quiz-endpoint]').count()) > 0 || /thank/i.test(await bodyText(visitor))
    record('quiz.submit', thanks && !!leadPost, `thanks=${thanks} post=${leadPost ? leadPost.status : 'none'} leadId=${leadId}`)
  } else {
    record('quiz.submit', false, `never reached form (outcome=${walkOutcome})`)
  }

  /* ------------------------------------------------------------------ LP PUBLIC URL as visitor, click through */
  urls.lpPublic = lpPublicUrl
  const lpPage = await visitPublic(visitor, lpPublicUrl, '70-lp-public')
  const lpBroken = looksBroken(lpPage.text, lpPage.title)
  const lpHasContent = lpPage.text.length > 80 && !lpBroken
  record(
    'lp.public',
    lpHasContent && lpPage.status === 200,
    lpBroken ? lpBroken : `status=${lpPage.status} ${lpPage.text.slice(0, 160)}`,
    lpPublicUrl,
  )
  const lpCta = visitor.locator('a, button').filter({ hasText: /start|check|begin|get|continue|claim/i }).first()
  if (await lpCta.count()) {
    await lpCta.click().catch(() => null)
    await waitIdle(visitor, 1000)
    await shot(visitor, '71-lp-cta-clicked')
    record('lp.cta', true, `clicked CTA now ${visitor.url()}`, visitor.url())
  } else {
    record('lp.cta', null, 'no obvious CTA to click')
  }

  const lpLegacy = lpPublicUrl.replace('preview.pageflo.io', 'preview.legenex.com')
  const lpLegacyPage = await visitPublic(visitor, lpLegacy, '72-lp-public-legenex')
  urls.lpPublicLegacy = lpLegacy
  record(
    'lp.public.legenex',
    lpLegacyPage.status === 200 && lpLegacyPage.text.length > 40 && !looksBroken(lpLegacyPage.text, lpLegacyPage.title),
    `status=${lpLegacyPage.status} ${lpLegacyPage.text.slice(0, 120)}`,
    lpLegacy,
  )

  /* ------------------------------------------------------------------ ADVERTORIAL PUBLIC URL */
  urls.advPublic = advPublicUrl
  const advPage = await visitPublic(visitor, advPublicUrl, '80-adv-public')
  const advBroken = looksBroken(advPage.text, advPage.title)
  record(
    'adv.public',
    advPage.status === 200 && advPage.text.length > 80 && !advBroken,
    advBroken ? advBroken : `status=${advPage.status} ${advPage.text.slice(0, 160)}`,
    advPublicUrl,
  )
  const advLink = visitor.locator('a').filter({ hasText: /continue|start|claim|read|call/i }).first()
  if (await advLink.count()) {
    await advLink.click().catch(() => null)
    await waitIdle(visitor, 900)
    await shot(visitor, '81-adv-click')
  }
  const advLegacy = advPublicUrl.replace('preview.pageflo.io', 'preview.legenex.com')
  const advLegacyPage = await visitPublic(visitor, advLegacy, '82-adv-public-legenex')
  urls.advPublicLegacy = advLegacy
  record(
    'adv.public.legenex',
    advLegacyPage.status === 200 && advLegacyPage.text.length > 40 && !looksBroken(advLegacyPage.text, advLegacyPage.title),
    `status=${advLegacyPage.status} ${advLegacyPage.text.slice(0, 120)}`,
    advLegacy,
  )

  /* ------------------------------------------------------------------ LEADS UI */
  await admin.goto(`${APP}/admin/leads?q=${encodeURIComponent('FinalQA')}&range=24h`, { waitUntil: 'domcontentloaded' })
  await waitIdle(admin, 1200)
  await shot(admin, '90-leads-search')
  urls.leads = admin.url()
  let leadsText = await bodyText(admin)
  let found = leadsText.includes(LEAD_FIRST) || leadsText.includes(LEAD_EMAIL) || (leadId ? leadsText.includes(leadId) : false)

  if (!found) {
    await admin.goto(`${APP}/admin/leads?q=${encodeURIComponent(LEAD_EMAIL)}`, { waitUntil: 'domcontentloaded' })
    await waitIdle(admin, 1000)
    await shot(admin, '90b-leads-email')
    leadsText = await bodyText(admin)
    found = leadsText.includes(LEAD_FIRST) || leadsText.includes(LEAD_EMAIL) || (leadId ? leadsText.includes(leadId) : false)
  }
  if (!found) {
    await admin.goto(`${APP}/admin/leads?range=24h`, { waitUntil: 'domcontentloaded' })
    await waitIdle(admin, 1000)
    await shot(admin, '90c-leads-24h')
    leadsText = await bodyText(admin)
    found = leadsText.includes(LEAD_FIRST) || leadsText.includes(RUN) || leadsText.includes(LEAD_EMAIL)
  }

  record('leads.list', found, found ? `lead visible (${LEAD_EMAIL})` : `lead not in UI body=${leadsText.slice(0, 240)}`)

  if (!found) {
    record('leads.detail', false, 'did not open a lead: FinalQA row is not in the table')
    record('leads.consent', false, 'no FinalQA lead to inspect')
    record('leads.attribution', false, 'no FinalQA lead to inspect')
    record('leads.delivery', false, 'no FinalQA lead to inspect')
  } else {
  const namedRow = admin.locator('table tbody tr, [role="row"]').filter({ hasText: /FinalQA/i }).first()
  const leadOpen = namedRow.getByRole('button', { name: /Open lead/i }).first()
  if (await leadOpen.count()) {
    await leadOpen.click()
  } else if (leadId) {
    await admin.getByText(leadId, { exact: true }).first().click().catch(() => null)
  } else {
    await namedRow.click().catch(() => null)
  }
  await waitIdle(admin, 1000)
  await shot(admin, '91-lead-detail-summary')
  const dialog = admin.locator('[role="dialog"]')
  const hasDialog = (await dialog.count()) > 0
  const detailText = hasDialog ? await dialog.innerText() : ''
  const isOurs = /FinalQA/i.test(detailText) || (leadId ? detailText.includes(leadId) : false) || detailText.includes(LEAD_EMAIL)
  if (hasDialog && !leadId) {
    const idMatch = detailText.match(/\b(\d{2,})\b/)
    if (idMatch) leadId = idMatch[1]
  }
  record('leads.detail', hasDialog && isOurs, hasDialog ? `dialog opened id=${leadId} ours=${isOurs}` : 'no lead detail dialog')

  const consentVisible = /consent/i.test(detailText)
  record('leads.consent', consentVisible, consentVisible ? detailText.match(/Consent[\s\S]{0,80}/)?.[0] || 'Consent present' : 'Consent field not visible on summary')

  const sysTab = admin.getByRole('button', { name: /System Response/i })
  if (await sysTab.count()) {
    await sysTab.click()
    await waitIdle(admin, 500)
    await shot(admin, '92-lead-response')
    const resp = await dialog.innerText()
    const hasAttr = /attribution/i.test(resp)
    const attrEmpty = /No attribution stored/i.test(resp)
    record('leads.attribution', hasAttr, attrEmpty ? 'Attribution tab present but empty' : `attribution=${resp.slice(0, 220)}`)
  } else {
    record('leads.attribution', false, 'System Response tab missing')
  }

  const delTab = admin.getByRole('button', { name: /^Delivery Log$/i })
  if (await delTab.count()) {
    await delTab.click()
    await waitIdle(admin, 500)
    await shot(admin, '93-lead-delivery')
    const del = await dialog.innerText()
    record('leads.delivery', /delivery/i.test(del), del.slice(0, 240))
  } else {
    record('leads.delivery', false, 'Delivery Log tab missing')
  }

  const hlrTab = admin.getByRole('button', { name: /HLR Trace/i })
  if (await hlrTab.count()) {
    await hlrTab.click()
    await waitIdle(admin, 400)
    await shot(admin, '94-lead-hlr')
  }
  const capiTab = admin.getByRole('button', { name: /CAPI Log/i })
  if (await capiTab.count()) {
    await capiTab.click()
    await waitIdle(admin, 400)
    await shot(admin, '95-lead-capi')
  }
  }

} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  record('uncaught', false, msg)
  await shot(admin, 'zz-admin-failure').catch(() => null)
  await shot(visitor, 'zz-visitor-failure').catch(() => null)
} finally {
  writeFileSync(path.join(EVIDENCE, 'notes.txt'), notes.join('\n') + '\n')
  writeFileSync(
    path.join(EVIDENCE, 'report.json'),
    JSON.stringify(
      {
        run: RUN,
        brandSlug,
        brandName,
        leadId,
        leadEmail: LEAD_EMAIL,
        urls,
        steps,
        failures,
      },
      null,
      2,
    ),
  )
  await browser.close()
}

note(`DONE steps=${steps.length} failures=${failures.length} leadId=${leadId}`)
console.log('WALK_COMPLETE')
