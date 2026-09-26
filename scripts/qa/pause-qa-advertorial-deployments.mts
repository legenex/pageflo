/**
 * One-off, guarded cleanup: pause the QA "pin proof" advertorial deployments
 * that earlier acceptance runs left LIVE on the acceptance Brand, serving
 * starter copy ("[Author]", "X min read", "Opening paragraph...").
 *
 *   pnpm exec tsx scripts/qa/pause-qa-advertorial-deployments.mts
 *
 * Pausing is reversible (Publish brings a deployment back) and nothing is
 * deleted. It acts ONLY on cards that (a) name the acceptance Brand and (b) have
 * a path of the form /adv/pinmug*, which the removed pin harness minted. Every
 * card is proved with actOn() before its control is clicked.
 */
import path from 'node:path'
import { launchChromium } from '../lib/browser.ts'
import { ACCEPTANCE, APP, Harness, actOn, fetchText, login } from '../lib/production.mts'

const H = new Harness(path.resolve('docs/rescue-audit/evidence/closeout'))
const browser = await launchChromium({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.setDefaultTimeout(25_000)

try {
  await login(page)
  await page.goto(`${APP}/admin/advertorials`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Deployments$/i }).first().click()
  await page.waitForTimeout(800)

  const targets: Array<{ id: string; path: string }> = []
  const cards = page.locator('[data-adv-deployment]').filter({ hasText: ACCEPTANCE.name })
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i)
    const text = await card.innerText()
    const m = text.match(/\/adv\/(pinmug[a-z0-9]+)/)
    const status = await card.getAttribute('data-adv-deployment-status')
    if (m && status === 'live') targets.push({ id: (await card.getAttribute('data-adv-deployment')) ?? '', path: `/adv/${m[1]}` })
  }
  console.log(`  ${targets.length} live QA pin deployments to pause: ${targets.map((x) => x.path).join(', ') || 'none'}`)

  for (const target of targets) {
    const card = page.locator(`[data-adv-deployment="${target.id}"]`)
    const unpublish = await actOn(card, [ACCEPTANCE.name, target.path], (r) => r.getByRole('button', { name: 'Unpublish', exact: true }), `pause ${target.path}`)
    await unpublish.click()
    await page.waitForFunction(
      (id) => document.querySelector(`[data-adv-deployment="${id}"]`)?.getAttribute('data-adv-deployment-status') !== 'live',
      target.id,
      { timeout: 30_000 },
    ).catch(() => null)
    const status = await page.locator(`[data-adv-deployment="${target.id}"]`).getAttribute('data-adv-deployment-status')
    const live = await fetchText(`${ACCEPTANCE.preview}${target.path}`)
    H.t(status !== 'live', `${target.path} is no longer live in the console`, `deployment ${target.id} status=${status}`)
    H.t(live.status === 404, `${target.path} no longer serves visitors`, `HTTP ${live.status}`)
  }
} finally {
  await browser.close()
}
console.log(`\n${H.pass} passed, ${H.fail} failed`)
process.exit(H.fail === 0 ? 0 : 1)
