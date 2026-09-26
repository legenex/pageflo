import { launchChromium, walk, PREVIEW, E, norm, RUN } from './_lib.mts'
const mode = process.argv[2] // 's' standalone or 'c' embedded
const submit = process.argv[3] === 'submit'
const path = mode==='s' ? '/s/pageflo-rescue-acceptance-944138' : '/c/pageflo-rescue-acceptance-944138'
const tag = mode+(submit?'-final':'-probe')
const b = await launchChromium()
const ctx = await b.newContext({viewport:{width:390,height:844}})
const p = await ctx.newPage()
const posts:any[] = []
p.on('request', r=>{ if(r.method()==='POST' && r.url().includes('/api/leads')) posts.push({url:r.url(), body:r.postData()}) })
p.on('pageerror', e=>console.log('PAGEERROR', e.message))
p.on('response', r=>{ if(r.status()>=400) console.log('HTTP', r.status(), r.url()) })
await walk(p, PREVIEW+path+`?utm_source=bugsy&utm_medium=qa&utm_campaign=${RUN}`)
const box = p.locator('[data-consent-checkbox]')
console.log('checkbox count', await box.count(), 'checked', await box.isChecked())
console.log('submit selector', await p.locator('[data-quiz-submit]').count())
const SUF=process.env.SUF||''; const email = `bugsy-${RUN}${SUF}${submit?'':'-probe'}@legenex.test`
await p.fill('input[name=first_name]','Bugsy'); await p.fill('input[name=last_name]',`Consent ${RUN}${SUF}`)
await p.fill('input[name=email]',email); await p.fill('input[name=mobile]','5550100177'); await p.fill('input[name=zip]','78701')
const next = p.locator('[data-quiz-submit]').or(p.getByRole('button',{name:/Next/}))
await next.first().click(); await p.waitForTimeout(900)
const err = p.locator('[data-consent-error]')
console.log('error count', await err.count(), 'visible', await err.isVisible().catch(()=>false), 'role', await err.getAttribute('role').catch(()=>null), 'text', norm(await err.innerText().catch(()=>'')))
console.log('aria-invalid', await box.getAttribute('aria-invalid'), 'describedby', await box.getAttribute('aria-describedby'))
console.log('POSTs after unchecked submit', posts.length)
await p.screenshot({path:`${E}/a-${tag}-error-390.png`, fullPage:true})
// keyboard: focus last input (zip) then Tab to checkbox
await p.focus('input[name=zip]'); let tabs=0; const order:string[]=[]; for(;tabs<6;tabs++){ await p.keyboard.press('Tab'); order.push(await p.evaluate(()=>{const a=document.activeElement as any;return a.tagName+':'+(a.innerText||a.type||'').slice(0,12)})); if(await box.evaluate(e=>e===document.activeElement)) break }
console.log('tab order from zip', order.join(' > '), 'focused is checkbox', await box.evaluate(e=>e===document.activeElement))
await p.keyboard.press('Space'); console.log('after Space checked', await box.isChecked(), 'error still', await err.count())
await p.keyboard.press('Space'); console.log('after Space 2 checked', await box.isChecked())
await p.locator('[data-consent-text]').click(); console.log('click text checked', await box.isChecked())
await p.locator('[data-consent-text]').click(); console.log('click text again checked', await box.isChecked())
await p.locator('[data-consent-text]').click()
console.log('final checked before back', await box.isChecked())
// Back and re-entry
await p.getByRole('button',{name:/Back/}).first().click(); await p.waitForTimeout(700)
console.log('after Back, on form?', await p.locator('[data-quiz-form]').count())
await p.screenshot({path:`${E}/a-${tag}-afterback-390.png`, fullPage:true})
// go forward again
for (let i=0;i<5;i++){ if(await p.locator('[data-quiz-form]').count()) break; const a=p.locator('[data-quiz-answer]'); if(await a.count()) await a.first().click(); else { const nx=p.getByRole('button',{name:/Next|Continue/}); if(await nx.count()) await nx.first().click().catch(()=>null)} await p.waitForTimeout(700)}
console.log('re-entered form', await p.locator('[data-quiz-form]').count(), 'checkbox checked on re-entry', await box.isChecked().catch(()=>'n/a'), 'first_name', await p.inputValue('input[name=first_name]').catch(()=>'n/a'))
await p.screenshot({path:`${E}/a-${tag}-reentry-390.png`, fullPage:true})
if (await box.count() && await box.isChecked()) { await box.uncheck() }
console.log('POSTs so far', posts.length)
if (submit) {
  await p.fill('input[name=first_name]','Bugsy'); await p.fill('input[name=last_name]',`Consent ${RUN}${SUF}`)
  await p.fill('input[name=email]',email); await p.fill('input[name=mobile]','5550100177'); await p.fill('input[name=zip]','78701')
  await box.check()
  // hold the lead POST for 6s: the thank-you must not show before it lands
  await p.route('**/api/leads', async r=>{ await new Promise(s=>setTimeout(s,6000)); await r.continue() })
  const t0=Date.now()
  await next.first().click()
  const seen:string[]=[]
  let endpointAt=-1
  for (let i=0;i<40;i++){ await p.waitForTimeout(500)
    const ep = await p.locator('[data-quiz-endpoint]').count()
    if(ep && endpointAt<0) endpointAt=Date.now()-t0
    seen.push(`${Date.now()-t0}ms ep=${ep} posts=${posts.length}`)
    if (i===4) await p.screenshot({path:`${E}/a-${tag}-during-slow-post.png`})
    if(ep && i>16) break }
  console.log(seen.join('\n'))
  console.log('endpoint first visible at', endpointAt, 'ms')
  console.log('POST bodies', JSON.stringify(posts,null,1))
  await p.waitForTimeout(3000)
  console.log('endpoint stable after 3s', await p.locator('[data-quiz-endpoint]').count())
  console.log((await p.locator('[data-quiz-root]').innerText()).slice(0,400))
  await p.screenshot({path:`${E}/a-${tag}-thankyou-390.png`, fullPage:true})
}
await b.close()
