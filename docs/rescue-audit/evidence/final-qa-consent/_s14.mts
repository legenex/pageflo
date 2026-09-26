import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
const errs: string[] = []
p.on('pageerror', e=>errs.push('PAGEERROR @'+p.url()+' '+String(e).slice(0,100)))
await L.login(p)
const id = process.env.LEAD||'42'
await p.goto(L.APP+`/admin/leads?range=all${id==='42'?`&q=finalqa-${L.RUN}%40legenex.test`:''}`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
if (id!=='42') { for (let pg=0; pg<8; pg++){ if (await p.locator(`[aria-label="Open lead ${id}"]`).count()) break; const nx=p.getByRole('button',{name:/^Next$/}).or(p.getByRole('link',{name:/^Next$/})); console.log('page',pg,'next count',await nx.count()); if(!(await nx.count())) break; await nx.first().click(); await p.waitForTimeout(1800) } }
await p.locator(`[aria-label="Open lead ${id}"]`).first().click(); await p.waitForTimeout(2000)
const dlg = p.locator('[role=dialog]'); console.log('tabs', JSON.stringify(await dlg.locator('button:visible,[role=tab]:visible').allInnerTexts()))
const tabs = (await dlg.locator('button:visible,[role=tab]:visible').allInnerTexts()).map(s=>s.trim())
console.log('=== SUMMARY', (await dlg.innerText()).replace(/\s+/g,' '))
await L.shot(p,`lead${id}-summary`); L.dump(`lead${id}-summary`, await dlg.innerText())
for (const name of ['System Response','HLR Trace','Delivery Log','Consent','Timeline','Activity']) {
  const t = dlg.getByRole('button',{name:new RegExp('^'+name+'$','i')}); if (!(await t.count())) { console.log('-- no tab', name); continue }
  await t.first().click(); await p.waitForTimeout(1000)
  const txt = await dlg.innerText(); console.log(`=== ${name}`, txt.replace(/\s+/g,' ')); await L.shot(p,`lead${id}-${name.replace(/ /g,'')}`); L.dump(`lead${id}-${name.replace(/ /g,'')}`, txt)
  console.log('   buttons:', JSON.stringify(await dlg.locator('button:visible').allInnerTexts()))
}
console.log('ERRS', errs); await b.close()
