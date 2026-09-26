import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1440,height:900}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE-ERR', m.text().slice(0,200)) })
await L.login(p)
console.log('URL', p.url()); console.log((await L.text(p)).slice(0,800))
console.log('LINKS', JSON.stringify(await p.locator('a').evaluateAll(as=>as.map(a=>a.textContent?.trim()+' -> '+a.getAttribute('href')).slice(0,60))))
await b.close()
