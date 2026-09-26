import { launchChromium, walk, PREVIEW, E, norm } from './_lib.mts'
const b = await launchChromium()
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage()
p.on('response', r=>{ if(r.status()>=400) console.log('HTTP', r.status(), r.url()) })
const n = await walk(p, PREVIEW+'/s/pageflo-rescue-acceptance-944138?utm_source=bugsy&utm_medium=qa&utm_campaign=b0926a')
console.log(await p.locator('[data-quiz-root]').innerText())
console.log(await p.locator('[data-consent]').evaluate(e=>e.outerHTML))
await b.close()
