import * as L from './_lib.mts'
import { walkToForm } from './_walk.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
p.on('request', r=>{ if(r.method()==='POST') console.log('POST', r.url()) })
const junk = /\{\{|\(800\) 000-0000|Dynamic figure|\[Author\]|X min read|lorem|placeholder|starter|TODO|insert/i
await p.goto(`https://${L.SLUG}.preview.pageflo.io/c/${L.SLUG}`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000)
await L.shot(p,'13-landing'); const lt = await L.text(p); console.log('LANDING JUNK', lt.match(junk)?.[0]??'none'); console.log(lt.slice(0,600))
// find embedded quiz
console.log('iframes', await p.locator('iframe').count())
const cbBefore = await p.locator('input[type=checkbox]:visible').count(); console.log('checkbox visible before quiz', cbBefore)
if (!cbBefore) {
  const cta = p.locator('button:visible,a:visible').filter({hasText:/start|check my|claim|begin/i}).first()
  console.log('cta', await cta.count() ? await cta.innerText() : 'none')
}
await walkToForm(p,'14-landing-quiz',false)
const cb = p.locator('input[type=checkbox]:visible').first()
console.log('LANDING CHECKED:', await cb.isChecked()); console.log('LANDING DISCLOSURE:', JSON.stringify(await cb.evaluate((e:any)=>(e.closest('label')||e.parentElement).innerText)))
await L.shot(p,'15-landing-form')
await b.close()
