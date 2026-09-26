import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:1000}}); const p = await ctx.newPage()
const errs: string[] = []
p.on('pageerror', e=>{errs.push('PAGEERROR '+String(e).slice(0,200))}); p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text().slice(0,200)) })
await L.login(p)
for (const [n,path] of [['17-landing-deployments','/admin/landing-pages'],['18-advertorial-deployments','/admin/advertorials'],['19-deployments','/admin/deployments']]) {
  await p.goto(L.APP+path,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000)
  console.log(n, 'TABS', JSON.stringify(await p.locator('a:visible,button:visible,[role=tab]:visible').evaluateAll(a=>a.map((x:any)=>x.textContent?.trim().slice(0,30)+'|'+x.getAttribute('href')).filter(s=>/deploy/i.test(s)))))
  await L.shot(p,n)
}
console.log('ERRS', errs)
await b.close()
