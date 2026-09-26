import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
p.on('request', r=>{ if(r.method()==='POST') console.log('POST', r.url()) })
await p.goto(`https://${L.SLUG}.preview.pageflo.io/s/${L.SLUG}?utm_source=finalqa&utm_medium=browser&utm_campaign=${L.RUN}`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500)
for (let i=0;i<3;i++){ await L.shot(p,`07-explore-${i}`); console.log(i,(await L.text(p)).slice(0,500)); console.log('BTN', JSON.stringify(await p.locator('button:visible,[role=radio]:visible,a:visible').evaluateAll(a=>a.map(x=>x.textContent?.trim().slice(0,50)))));
 const first = p.locator('button:visible').first(); await first.click(); await p.waitForTimeout(1200) }
await b.close()
