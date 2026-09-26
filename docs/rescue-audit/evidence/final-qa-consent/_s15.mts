import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
await L.login(p)
await p.goto(L.APP+`/admin/leads?range=all&q=finalqa-${L.RUN}%40legenex.test`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
await p.locator('[aria-label="Open lead 42"]').first().click(); await p.waitForTimeout(1500)
await p.locator('text=CONSENT EVIDENCE').first().scrollIntoViewIfNeeded(); await p.evaluate(()=>{document.querySelectorAll('[role=dialog] *').forEach((e:any)=>{ if(e.scrollHeight>e.clientHeight+50 && getComputedStyle(e).overflowY!='visible') e.scrollTop=e.scrollHeight })}); await p.waitForTimeout(600)
await L.shot(p,'lead42-consent-evidence')
await b.close()
