import { launchChromium } from '../../../../scripts/lib/browser'
const url = process.argv[2]
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage()
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE', m.text()) })
await p.goto(url+'?utm_source=bugsy&utm_medium=qa&utm_campaign=x', {waitUntil:'networkidle'})
console.log(await p.evaluate(()=>document.body.innerText.slice(0,800)))
console.log(await p.evaluate(()=>[...document.querySelectorAll('button,input,a')].map(e=>e.tagName+':'+((e as any).innerText||(e as any).type||'')+':'+(e as any).name).join(' | ')))
await p.screenshot({path:'docs/rescue-audit/evidence/bugsy-consent/_probe.png'})
await b.close()
