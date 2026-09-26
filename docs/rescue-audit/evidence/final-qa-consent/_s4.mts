import * as L from './_lib.mts'
const b = await L.browser()
const junk = /\{\{|\(800\) 000-0000|Dynamic figure|\[Author\]|X min read/i
for (const [i,h] of ['pageflo.io','legenex.com'].entries()) {
  const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
  const r = await p.goto(`https://${L.SLUG}.preview.${h}/`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000)
  await L.shot(p,`06-home-${h}`)
  const t = await L.text(p); console.log(h, r?.status(), p.url(), 'JUNK:', t.match(junk)?.[0]??'none'); console.log(t.slice(0,700))
  await ctx.close()
}
await b.close()
