import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR @'+p.url(), String(e).slice(0,100)))
await L.login(p)
await p.goto(L.APP+'/admin/advertorials',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
console.log(p.url()); console.log('BTNS', JSON.stringify(await p.locator('button:visible,[role=tab]:visible').allInnerTexts()))
const t=await L.text(p); console.log(t.slice(300,900))
await L.shot(p,'18a-advertorials')
const d = p.locator('button:visible,[role=tab]:visible').filter({hasText:/Deployments/}); if (await d.count()) { await d.first().click(); await p.waitForTimeout(1500) }
await L.shot(p,'18-advertorial-deployments'); const t2=await L.text(p); L.dump('18-advertorial-deployments',t2); console.log(t2.slice(300,5000))
await b.close()
