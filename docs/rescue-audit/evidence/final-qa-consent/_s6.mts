import * as L from './_lib.mts'
import { walkToForm } from './_walk.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
p.on('request', r=>{ if(r.method()==='POST') console.log('POST', r.url()) })
await p.goto(`https://${L.SLUG}.preview.pageflo.io/s/${L.SLUG}?utm_source=finalqa&utm_medium=browser&utm_campaign=${L.RUN}`,{waitUntil:'domcontentloaded'})
await walkToForm(p,'x',true)
await L.shot(p,'x-form'); console.log(await L.text(p))
await b.close()
