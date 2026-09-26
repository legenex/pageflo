/**
 * BUGSY follow-up: isolation mutation, draft-vs-live pin, lead 13 detail.
 * Does not print passwords.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import type { Page } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CRED = '/home/legenex/.pageflo-admin-credentials'
const APP = 'https://app.pageflo.io'
const PREVIEW = 'https://pageflo-rescue-acceptance-944138.preview.pageflo.io'
const PIN = `${PREVIEW}/adv/pinmugkkmjl`
const RUN = 'bugsymugkw2g5'
const ISO_EMAIL = `bugsy-iso-${RUN}@legenex.test`
const ISO_PASSWORD = process.env.PAGEFLO_ISO_PASSWORD || ''
if (!ISO_PASSWORD) throw new Error('PAGEFLO_ISO_PASSWORD not set')
const MARKER = `BUGSY-PIN-FOLLOWUP-${Date.now().toString(36)}`

mkdirSync(HERE, { recursive: true })

const creds = () => {
  const text = readFileSync(CRED, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  return { email: fields['admin email'], password: fields['temporary password'] }
}

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(HERE, `${name}.png`), fullPage: true }).catch(() => null)
}

const vis = async (page: Page) => ((await page.locator('body').innerText().catch(() => '')) || '')

const login = async (page: Page, email: string, password: string) => {
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 25000 })
}

const notes: string[] = []
const findings: Array<{ id: string; sev: string; title: string; detail: string }> = []
const log = (s: string) => {
  console.log(s)
  notes.push(s)
}

const browser = await launchChromium({ headless: true })
const adminCreds = creds()

try {
  /* ---- isolation user, FRESH context ---- */
  const isoCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const iso = await isoCtx.newPage()
  iso.setDefaultTimeout(25000)
  await login(iso, ISO_EMAIL, ISO_PASSWORD)
  await shot(iso, 'f01-iso-admin')
  log(`iso login url=${iso.url()} sidebar=${(await vis(iso)).slice(0, 120)}`)

  await iso.goto(`${APP}/admin/sites`, { waitUntil: 'networkidle' })
  await shot(iso, 'f02-iso-brands')
  const brands = await vis(iso)
  log(`iso brands sees Dont Settle=${/Dont Settle/i.test(brands)} ACH=${/Accident Compensation/i.test(brands)} count8=${/All 8/.test(brands)}`)

  const dsLink = iso.locator('a[href="/admin/sites/dont-settle"]').first()
  log(`dont-settle link count=${await dsLink.count()}`)
  if (await dsLink.count()) {
    await dsLink.click({ force: true }).catch((e) => log(`dont-settle click err ${e instanceof Error ? e.message : String(e)}`))
    await iso.waitForTimeout(1500)
    await shot(iso, 'f03-iso-click-dont-settle')
    log(`after click Dont Settle url=${iso.url()} text=${(await vis(iso)).slice(0, 240).replace(/\s+/g, ' ')}`)
  }
  await iso.goto(`${APP}/admin/sites/dont-settle`, { waitUntil: 'networkidle' })
  await shot(iso, 'f03b-iso-dont-settle-direct')
  log(`direct /admin/sites/dont-settle url=${iso.url()} text=${(await vis(iso)).slice(0, 240).replace(/\s+/g, ' ')}`)

  await iso.goto(`${APP}/admin/leads`, { waitUntil: 'networkidle' })
  await shot(iso, 'f04-iso-leads')
  const leads = await vis(iso)
  log(`iso leads has Dont Settle=${/Dont Settle/i.test(leads)} has Ada=${/Ada Lovelace/i.test(leads)} has Bugsy=${/Bugsy/i.test(leads)}`)

  await iso.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  const depTab = iso.getByRole('button', { name: /Deployments/i }).first()
  if (await depTab.count()) {
    await depTab.click()
    await iso.waitForTimeout(800)
  }
  await shot(iso, 'f05-iso-adv-deps')
  const deps = await vis(iso)
  log(`iso advertorial deployments has Dont Settle=${/Dont Settle/i.test(deps)} has /adv/letter=${/\/adv\/letter/.test(deps)}`)

  // Try to unpublish Dont Settle /adv/letter if a pause/unpublish control is on that row
  const letterRow = iso.locator('div').filter({ hasText: '/adv/letter' }).first()
  if (await letterRow.count()) {
    const pause = letterRow.getByRole('button', { name: /Unpublish|Pause/i }).first()
    if (await pause.count()) {
      await pause.click()
      await iso.waitForTimeout(2000)
      await shot(iso, 'f06-iso-tried-unpublish-letter')
      log(`clicked unpublish on /adv/letter as iso user. vis=${(await vis(iso)).slice(0, 300).replace(/\s+/g, ' ')}`)
    } else {
      log('iso user sees /adv/letter row but no Unpublish/Pause control found on it')
    }
  }

  await iso.goto(`${APP}/admin/brands/domains`, { waitUntil: 'networkidle' })
  await shot(iso, 'f07-iso-domains')
  log(`iso domains vis=${(await vis(iso)).slice(0, 300).replace(/\s+/g, ' ')}`)

  // REST: can they read other sites?
  const cookie = (await isoCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  const apiSites = await fetch(`${APP}/api/sites?limit=50`, { headers: { cookie } })
  const apiBody = await apiSites.text()
  writeFileSync(path.join(HERE, 'f-api-sites.json'), apiBody.slice(0, 8000))
  log(`GET /api/sites ${apiSites.status} has dont-settle=${/dont-settle/i.test(apiBody)} docs=${(apiBody.match(/"slug"/g) || []).length}`)

  const apiLeads = await fetch(`${APP}/api/leads?limit=50`, { headers: { cookie } })
  const apiLeadsBody = await apiLeads.text()
  writeFileSync(path.join(HERE, 'f-api-leads.json'), apiLeadsBody.slice(0, 8000))
  log(`GET /api/leads ${apiLeads.status} has Lovelace=${/Lovelace/i.test(apiLeadsBody)} has Bugsy=${/Bugsy/i.test(apiLeadsBody)}`)

  await isoCtx.close()

  /* ---- admin: lead 13 + draft vs live ---- */
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await adminCtx.newPage()
  page.setDefaultTimeout(25000)
  await login(page, adminCreds.email!, adminCreds.password!)

  await page.goto(`${APP}/admin/leads`, { waitUntil: 'networkidle' })
  const leadRow = page.getByText('Bugsy QA Closeout').first()
  if (await leadRow.count()) {
    await leadRow.click()
    await page.waitForTimeout(1500)
    await shot(page, 'f10-lead-13')
    log(`lead 13 detail: ${(await vis(page)).slice(0, 600).replace(/\s+/g, ' ')}`)
  } else {
    log('could not click Bugsy QA Closeout row')
  }

  const before = await fetch(PIN, { cache: 'no-store' }).then(async (r) => ({ status: r.status, body: await r.text() }))
  log(`pin before status=${before.status} hasMarker=${before.body.includes(MARKER)} headline=${/Snapshot after PINTEST/.test(before.body)}`)

  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  const edit = page.getByRole('button', { name: /Edit advertorial|^Edit$/i }).first()
  log(`edit buttons=${await edit.count()}`)
  if (await edit.count()) {
    await edit.click()
    await page.waitForTimeout(1500)
    await shot(page, 'f11-master-open')
    const box = page.getByPlaceholder('The $4,200 check that cost her $186,000').first()
    const ta = page.locator('textarea').first()
    if (await box.count()) await box.fill(MARKER)
    else if (await ta.count()) await ta.fill(MARKER)
    const save = page.getByRole('button', { name: /^Save$/i }).first()
    if (await save.count()) {
      await save.click()
      await page.waitForTimeout(2000)
    }
    await shot(page, 'f12-master-saved')
    const after = await fetch(PIN, { cache: 'no-store' }).then(async (r) => ({ status: r.status, body: await r.text() }))
    const leaked = after.body.includes(MARKER)
    log(`pin after save-no-republish leaked=${leaked} stillHasOld=${/Snapshot after PINTEST/.test(after.body)}`)
    if (leaked) findings.push({ id: 'BUGSY-P0-007', sev: 'P0', title: 'master edit silently changed live pin advertorial', detail: MARKER })
    // restore
    if (await box.count()) await box.fill('Snapshot after PINTEST-pinmugkkmjl')
    else if (await ta.count()) await ta.fill('Snapshot after PINTEST-pinmugkkmjl')
    if (await save.count()) {
      await save.click()
      await page.waitForTimeout(1500)
    }
  }

  await adminCtx.close()
} catch (err) {
  log(`uncaught ${err instanceof Error ? err.message : String(err)}`)
  findings.push({ id: 'BUGSY-P0-XXX', sev: 'P0', title: 'follow-up uncaught', detail: String(err) })
} finally {
  await browser.close()
}

writeFileSync(path.join(HERE, 'followup.json'), JSON.stringify({ notes, findings }, null, 2))
console.log('\nFOLLOWUP DONE findings=' + findings.length)
for (const f of findings) console.log(f.id, f.sev, f.title)
