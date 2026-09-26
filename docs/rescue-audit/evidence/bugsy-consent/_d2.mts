import { launchChromium } from '../../../../scripts/lib/browser'
import { login, APP } from '../../../../scripts/lib/production.mts'
const E='docs/rescue-audit/evidence/bugsy-consent'
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
await login(p)
const open = async()=>{ await p.goto(`${APP}/admin/leads?q=b0926a-retry&range=all&test=1`,{waitUntil:'networkidle'}); const o=p.locator('button[aria-label="Open lead 32"]'); if(await o.count()!==1) throw new Error('opener'); await o.click(); const d=p.locator('[role=dialog]'); await d.waitFor(); await d.getByRole('button',{name:'Delivery Log'}).click(); return d }
let d = await open()
const before = await d.innerText()
console.log('state before', await d.locator('[data-lead-delivery-panel]').getAttribute('data-lead-delivery-panel'), 'retry buttons', await d.locator('[data-lead-retry]').count())
await p.screenshot({path:`${E}/d-lead32-failed.png`})
console.log(before.slice(before.indexOf('Delivery Log')+12, before.indexOf('Set status')).replace(/\n+/g,' | '))
await d.locator('[data-lead-retry]').dblclick()
await d.locator('[data-lead-retry-note]').waitFor({timeout:40000})
console.log('note', await d.locator('[data-lead-retry-note]').innerText())
await p.screenshot({path:`${E}/d-lead32-retry-confirm.png`})
await p.waitForTimeout(15000)
d = await open()
const after = await d.innerText()
await p.screenshot({path:`${E}/d-lead32-after-retry.png`})
console.log('state after', await d.locator('[data-lead-delivery-panel]').getAttribute('data-lead-delivery-panel'))
console.log(after.slice(after.indexOf('Delivery Log')+12, after.indexOf('Set status')).replace(/\n+/g,' | '))
console.log('counts retry_requested', (after.match(/delivery\.retry_requested/g)||[]).length, 'processing', (after.match(/delivery\.processing/g)||[]).length, 'webhook attempts', (after.match(/webhook\.bugsy-unreachable/g)||[]).length)
await b.close()
