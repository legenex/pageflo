import * as L from './_lib.mts'
import { walkToForm } from './_walk.mts'
const b = await L.browser(); const ctx = await b.newContext({viewport:{width:1280,height:900}}); const p = await ctx.newPage()
p.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)))
const posts: string[] = []
p.on('request', r=>{ if(r.method()==='POST'){ const l=`${r.url()} ${(r.postData()||'').slice(0,1500)}`; posts.push(l); console.log('POST', l.slice(0,1600)) } })
p.on('response', async r=>{ if(r.request().method()==='POST') console.log('RESP', r.status(), r.url(), (await r.text().catch(()=>'')).slice(0,400)) })
await p.goto(`https://${L.SLUG}.preview.pageflo.io/s/${L.SLUG}?utm_source=finalqa&utm_medium=browser&utm_campaign=${L.RUN}`,{waitUntil:'domcontentloaded'})
await walkToForm(p,'s7',true)
const cb = p.locator('input[type=checkbox]:visible').first()
console.log('CHECKED initially:', await cb.isChecked())
console.log('DISCLOSURE BESIDE BOX:', JSON.stringify(await cb.evaluate((e:any)=>(e.closest('label')||e.parentElement).innerText)))
await L.shot(p,'08-form-unchecked-empty')
const ph = (re: RegExp)=>p.getByPlaceholder(re)
await ph(/First Name/i).fill('FinalQA'); await ph(/Last Name/i).fill('Consent '+L.RUN); await ph(/Email/i).fill(`finalqa-${L.RUN}@legenex.test`); await ph(/Cell/i).fill('(512) 555-0147'); await ph(/Zip/i).fill('78701')
await p.waitForTimeout(600)
const n = p.getByRole('button',{name:/Next/}).last()
console.log('NEXT disabled while unchecked:', await n.isDisabled(), 'aria-disabled', await n.getAttribute('aria-disabled'))
const before = posts.length
await L.shot(p,'09-form-filled-unchecked')
await n.click({force:true}).catch(e=>console.log('click err',String(e).slice(0,100)))
await ph(/Zip/i).press('Enter'); await p.waitForTimeout(2000)
await L.shot(p,'10-submit-unchecked-attempt')
const t = await L.text(p); console.log('AFTER UNCHECKED ATTEMPT:', t.slice(0,700)); console.log('new POSTs:', posts.length-before, 'checkbox alerts:', JSON.stringify(await p.locator('[role=alert]:visible,.error:visible,[class*=error]:visible').allInnerTexts()))
if (process.env.SUBMIT==='1') {
  await cb.check(); await p.waitForTimeout(500); await L.shot(p,'11-form-checked')
  console.log('Next disabled after check:', await n.isDisabled())
  await n.click(); await p.waitForTimeout(6000)
  await L.shot(p,'12-thankyou'); const t2=await L.text(p); console.log('THANKYOU URL', p.url()); console.log('THANKYOU TEXT', t2); L.dump('12-thankyou',t2)
  await p.waitForTimeout(6000); await L.shot(p,'12b-thankyou-later'); console.log('LATER', p.url(), (await L.text(p))===t2 ? 'STABLE' : 'CHANGED: '+(await L.text(p)).slice(0,300))
}
await b.close()
