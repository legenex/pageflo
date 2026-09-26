import { launchChromium } from '../../../../scripts/lib/browser'
import { login, APP } from '../../../../scripts/lib/production.mts'
import { writeFileSync } from 'node:fs'
const E='docs/rescue-audit/evidence/bugsy-consent'
const b = await launchChromium()
const ctx = await b.newContext({viewport:{width:1440,height:1000}, acceptDownloads:true})
const p = await ctx.newPage()
const errs:string[]=[]
p.on('pageerror', e=>errs.push('PAGEERROR '+e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text()) })
await login(p)
await p.goto(`${APP}/admin/leads?q=bugsy&range=all&test=1`, {waitUntil:'networkidle'})
const sel = p.locator('select').filter({has:p.locator('option',{hasText:'Queued or in progress'})})
console.log('delivery options', await sel.locator('option').evaluateAll(o=>o.map(x=>(x as any).value+'='+x.textContent)))
const [dl] = await Promise.all([p.waitForEvent('download',{timeout:30000}), p.getByRole('button',{name:/Export CSV/}).click()])
const path = E+'/_export.csv'; await dl.saveAs(path)
console.log('csv saved', dl.suggestedFilename())
for (const v of ['delivered','no-destination','failed','queued','none']) {
  await p.goto(`${APP}/admin/leads?q=bugsy&range=all&test=1&delivery=${v}`, {waitUntil:'networkidle'})
  console.log('filter', v, (await p.locator('main').innerText()).match(/\d+ leads?/)?.[0])
}
console.log('ERRS', errs)
await b.close()
