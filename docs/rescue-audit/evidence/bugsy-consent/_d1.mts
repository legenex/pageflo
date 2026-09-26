import { launchChromium } from '../../../../scripts/lib/browser'
import { login, APP } from '../../../../scripts/lib/production.mts'
const E='docs/rescue-audit/evidence/bugsy-consent'
const SLUG='pageflo-rescue-acceptance-944138'
const action = process.argv[2]
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
await login(p)
await p.goto(`${APP}/admin/sites/${SLUG}/settings/tracking`,{waitUntil:'networkidle'})
const txt = await p.locator('body').innerText()
if(!txt.includes('PageFlo Rescue Acceptance 944138')) throw new Error('page does not name acceptance brand')
const count = ()=>p.locator('input[placeholder="LeadByte"]').count()
console.log('webhooks before', await count())
if (action==='add') {
  if (await count()!==0) throw new Error('webhook exists')
  await p.getByRole('button',{name:/Add Webhook/i}).click()
  await p.locator('input[placeholder="LeadByte"]').fill('bugsy-unreachable')
  await p.locator('input[placeholder="https://example.com/leads"]').fill('https://bugsy-buyer.pageflo-qa.invalid/hook')
  await p.getByRole('button',{name:/Save All/i}).click(); await p.waitForTimeout(2500)
  console.log('saved shown', /Saved /.test(await p.locator('body').innerText()))
  await p.screenshot({path:`${E}/d-webhook-added.png`,fullPage:true})
} else {
  const rows = p.locator('li').filter({has:p.locator('input[value="bugsy-unreachable"]')})
  console.log('bugsy rows', await rows.count())
  if (await rows.count()===1) { await rows.locator('button[aria-label="Remove"]').click(); await p.getByRole('button',{name:/Save All/i}).click(); await p.waitForTimeout(2500) }
}
await p.goto(`${APP}/admin/sites/${SLUG}/settings/tracking`,{waitUntil:'networkidle'})
console.log('webhooks after (fresh load)', await count())
await p.screenshot({path:`${E}/d-webhook-${action}-final.png`,fullPage:true})
await b.close()
