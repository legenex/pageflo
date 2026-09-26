import * as L from './_lib.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
const r = await p.goto(`https://${L.SLUG}.preview.pageflo.io/adv/qa-acceptance`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000)
await L.shot(p,'16-advertorial'); const t = await L.text(p); console.log(r?.status(), t.length); console.log(t.slice(0,1800))
console.log('JUNK', t.match(/\{\{|\(800\) 000-0000|Dynamic figure|\[Author\]|X min read|lorem|placeholder|starter|your headline|TODO|insert/ig))
await b.close()
