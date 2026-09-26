import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
const errs: string[] = []
p.on('pageerror', e=>errs.push('PAGEERROR @'+p.url()+' '+String(e).slice(0,160))); p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE @'+p.url()+' '+m.text().slice(0,160)) })
p.on('response', r=>{ if(r.status()>=400) errs.push('HTTP '+r.status()+' '+r.url().slice(0,120)) })
await L.login(p)
await p.goto(L.APP+'/admin/leads',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
await L.shot(p,'20-leads')
const s = p.getByPlaceholder(/search/i).first(); await s.fill(`finalqa-${L.RUN}@legenex.test`); await p.keyboard.press('Enter'); await p.waitForTimeout(2500)
await L.shot(p,'21-leads-search'); console.log('LIST', (await L.text(p)).slice(300,1500))
const finalQa = p.locator('button:visible').filter({hasText:/Open lead/i}); console.log('open buttons', await finalQa.count(), JSON.stringify(await p.locator('[aria-label^="Open lead"]').evaluateAll(a=>a.map(x=>x.getAttribute('aria-label')))))
console.log('ERRS', errs)
await b.close()
