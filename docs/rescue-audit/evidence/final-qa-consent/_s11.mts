import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
let cur=''
p.on('pageerror', e=>console.log('PAGEERROR @'+cur, String(e).slice(0,120)))
await L.login(p)
for (const [n,path] of [['18-advertorial-deployments','/admin/advertorials']]) {
  cur=path; await p.goto(L.APP+path,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000)
  const tab=p.locator('button:visible,[role=tab]:visible,a:visible').filter({hasText:/^Deployments/}); console.log('tabs',await tab.count(), await tab.allInnerTexts()); if (path.includes('landing')) await tab.first().click(); else await tab.last().click({timeout:5000}).catch(()=>console.log('no adv tab')); await p.waitForTimeout(1500)
  await L.shot(p,n); const t = await L.text(p); L.dump(n,t); console.log(n, t.slice(0,3500)); console.log()
}
cur='/admin/deployments'; await p.goto(L.APP+cur,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000); console.log('DEPLOYMENTS', (await L.text(p)).slice(0,3000))
await b.close()
