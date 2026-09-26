import * as L from './_lib.mts'
export const walkToForm = async (p: any, tag: string, branch: boolean) => {
  await p.waitForTimeout(4000)
  let step = 0
  for (let i=0;i<14;i++){
    const t = await L.text(p)
    if (await p.locator('input[type=checkbox]:visible').count()) { console.log('FORM reached at step', i); return }
    await L.shot(p, `${tag}-step${String(step).padStart(2,'0')}`); step++
    console.log(`STEP ${i}:`, t.slice(0,260))
    const sels = p.locator('select:visible'); const sc = await sels.count()
    if (sc) { for (let k=0;k<sc;k++){ const o = await sels.nth(k).locator('option').allInnerTexts(); const pick = o.find((x:string)=>/^(Texas|2026|August)$/.test(x.trim()))||o[1]; await sels.nth(k).selectOption({label: pick}); await p.waitForTimeout(300) }
      await p.waitForTimeout(1200); const nxt = p.locator('button:visible:not([disabled])').filter({hasText:/next|continue/i}).first(); if (await nxt.count()) await nxt.click({timeout:3000}).catch(()=>{}); await p.waitForTimeout(1200); continue }
    const ta = p.locator('textarea:visible').first()
    if (await ta.count()) { await ta.fill('Rear-ended at a red light, neck and back pain, treated at an urgent care. Final QA test run.'); await p.waitForTimeout(600); await p.locator('button:visible:not([disabled])').filter({hasText:/next/i}).first().click({timeout:5000}); await p.waitForTimeout(2000); continue }
    const opts = p.locator('button:visible').filter({hasNotText:/CLICK HERE TO CALL|Back|Submit|^\s*$/i})
    const n = await opts.count(); console.log('  options:', JSON.stringify(await opts.allInnerTexts()))
    if (n===0) { console.log('no options; stop'); return }
    if (branch && i===0) {
      await opts.nth(1).click(); await p.waitForTimeout(2500); if (!/What State/.test(await L.text(p))) { console.log('  click did not advance, retry'); await p.locator('button:visible').filter({hasText:/Commercial/}).first().click(); await p.waitForTimeout(2500) }; await L.shot(p, `${tag}-branchB-next`); console.log('  branch B clicked; now:', (await L.text(p)).slice(0,160))
      await p.getByRole('button',{name:/Back/}).first().click(); await p.waitForTimeout(1200); await L.shot(p, `${tag}-back`); console.log('  after Back:', (await L.text(p)).slice(0,160))
    }
    await opts.first().click(); await p.waitForTimeout(2000)
  }
}
