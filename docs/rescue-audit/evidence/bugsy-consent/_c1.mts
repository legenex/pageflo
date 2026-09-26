import { launchChromium } from '../../../../scripts/lib/browser'
import { login, APP } from '../../../../scripts/lib/production.mts'
import { writeFileSync } from 'node:fs'
const E='docs/rescue-audit/evidence/bugsy-consent'
const ids = process.argv.slice(2)
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
const errs:string[]=[]
p.on('pageerror', e=>errs.push('PAGEERROR '+e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text()) })
await login(p)
await p.goto(`${APP}/admin/leads?q=bugsy&range=all&test=1`, {waitUntil:'networkidle'})
await p.screenshot({path:`${E}/c-leads-list.png`, fullPage:true})
console.log((await p.locator('main').innerText()).slice(0,3000))
let out = ''
for (const id of ids) {
  await p.goto(`${APP}/admin/leads?range=all&test=1`, {waitUntil:'networkidle'})
  const q = await p.goto(`${APP}/admin/leads?q=${id}&range=all&test=1`, {waitUntil:'networkidle'})
  let op = p.locator(`button[aria-label="Open lead ${id}"]`)
  if (!(await op.count())) { await p.goto(`${APP}/admin/leads?range=all&test=1`, {waitUntil:'networkidle'}); op = p.locator(`button[aria-label="Open lead ${id}"]`) }
  if (!(await op.count())) { out += `\n=== LEAD ${id}: opener not found\n`; continue }
  await op.first().click()
  const d = p.locator('[role=dialog]'); await d.waitFor()
  out += `\n=== LEAD ${id} SUMMARY\n` + await d.innerText()
  await p.screenshot({path:`${E}/c-lead-${id}-summary.png`})
  for (const tab of ['System Response','HLR Trace','Delivery Log']) {
    await d.getByRole('button',{name:tab}).click(); await p.waitForTimeout(300)
    out += `\n--- LEAD ${id} ${tab}\n` + await d.innerText()
    await p.screenshot({path:`${E}/c-lead-${id}-${tab.replace(/ /g,'')}.png`})
  }
  await p.keyboard.press('Escape')
}
writeFileSync(`${E}/_c1-dump.txt`, out)
console.log('ERRS', errs)
await b.close()
