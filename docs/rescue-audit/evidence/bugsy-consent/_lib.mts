import { launchChromium } from '../../../../scripts/lib/browser'
import type { Page } from 'playwright'
export const RUN = 'b0926a'
export const PREVIEW = 'https://pageflo-rescue-acceptance-944138.preview.pageflo.io'
export const E = 'docs/rescue-audit/evidence/bugsy-consent'
export const norm = (s:string)=>s.replace(/\s+/g,' ').trim()
export { launchChromium }
export async function walk(p: Page, url: string, stopAt = '[data-quiz-form]') {
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForSelector('[data-quiz-root]', { timeout: 30000 })
  for (let i = 0; i < 40; i++) {
    if (await p.locator(stopAt).count()) return i
    const root = p.locator('[data-quiz-root]')
    const ta = root.locator('textarea').first()
    if ((await ta.count()) && !(await ta.inputValue().catch(()=>'')).trim()) await ta.fill('Bugsy QA: rear-end collision, neck pain.')
    const texts = root.locator('input[type="text"], input:not([type])')
    for (let k=0;k<await texts.count();k++) if(!(await texts.nth(k).inputValue().catch(()=>'')).trim()) await texts.nth(k).fill('QA').catch(()=>null)
    const selects = root.locator('select')
    for (let k=0;k<await selects.count();k++){ const s=selects.nth(k); if(await s.inputValue().catch(()=>''))continue
      const vals = await s.locator('option').evaluateAll(os=>os.map(o=>(o as HTMLOptionElement).value).filter(v=>v))
      const pick = vals.find(v=>/^(TX|Texas|CA|NY|2020|2019|01|1)$/i.test(v))||vals[0]; if(pick) await s.selectOption(pick).catch(()=>null)}
    const answers = p.locator('[data-quiz-answer]')
    if (await answers.count()) await answers.first().click()
    else { const nx = p.getByRole('button',{name:/Next|Continue/i}); if(await nx.count()) await nx.first().click({force:true}).catch(()=>null) }
    await p.waitForTimeout(600)
  }
  throw new Error('no form')
}
