import { launchChromium } from '../../../../scripts/lib/browser'
import { login, APP } from '../../../../scripts/lib/production.mts'
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
let errs:string[]=[]
p.on('pageerror', e=>errs.push(e.message.slice(0,60)))
await login(p)
errs=[]
for (const url of ['/admin/leads?range=all&test=1','/admin/leads?q=bugsy&range=all&test=1','/admin/leads?q=bugsy&range=all&test=1&delivery=not-sent']) {
  errs=[]; await p.goto(APP+url,{waitUntil:'networkidle'}); await p.waitForTimeout(800)
  console.log(url,'errs',errs.length)
}
for (const v of ['delivered','no-destination','not-sent']) {
  await p.goto(`${APP}/admin/leads?range=all&test=1&delivery=${v}`,{waitUntil:'networkidle'})
  const rows = await p.locator('tbody tr').evaluateAll(r=>r.map(x=>(x as HTMLElement).innerText.replace(/\s+/g,' ').slice(0,140)))
  console.log('== filter',v, rows.length); rows.forEach(r=>console.log('  ',r))
}
errs=[]
await p.goto(`${APP}/admin/leads?q=bugsy&range=all&test=1`,{waitUntil:'networkidle'})
await p.locator('button[aria-label="Open lead 26"]').first().click(); await p.waitForTimeout(800)
console.log('modal errs', errs.length)
await b.close()
