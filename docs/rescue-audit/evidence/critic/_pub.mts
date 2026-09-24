/**
 * Anonymous public capture. No login. No secrets.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const SHOTS = '/home/legenex/Documents/Projects/PageFlo/docs/rescue-audit/evidence/critic'
mkdirSync(SHOTS, { recursive: true })
const notes: string[] = []
const note = (s: string) => {
  notes.push(s)
  console.log(s)
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
page.setDefaultTimeout(30000)

const urls: Array<{ url: string; name: string }> = [
  { url: 'https://app.pageflo.io/sign-in', name: 'pub-signin' },
  { url: 'https://dont-settle.preview.pageflo.io/', name: 'pub-ds-home' },
  { url: 'https://dont-settle.preview.pageflo.io/privacy', name: 'pub-ds-privacy' },
  { url: 'https://dont-settle.preview.pageflo.io/terms', name: 'pub-ds-terms' },
  { url: 'https://dont-settle.preview.pageflo.io/s/dont-settle', name: 'pub-ds-quiz' },
  { url: 'https://dont-settle.preview.pageflo.io/c', name: 'pub-ds-lp-c' },
  { url: 'https://dont-settle.preview.pageflo.io/c/dont-settle', name: 'pub-ds-lp' },
  { url: 'https://dont-settle.preview.pageflo.io/adv/letter', name: 'pub-ds-adv' },
  { url: 'https://dont-settle.preview.legenex.com/', name: 'pub-ds-legacy-home' },
  { url: 'https://accident-compensation-helper.preview.pageflo.io/', name: 'pub-ach-home' },
  { url: 'https://accident-compensation-helper.preview.pageflo.io/s/accident-compensation-helper', name: 'pub-ach-quiz' },
  { url: 'https://check-a-case.preview.pageflo.io/', name: 'pub-cac-home' },
  { url: 'https://rescue-qa-20260923.preview.pageflo.io/', name: 'pub-newbrand-home' },
  { url: 'https://rescue-qa-20260923.preview.pageflo.io/privacy', name: 'pub-newbrand-privacy' },
  { url: 'https://rescue-qa-20260923.preview.legenex.com/', name: 'pub-newbrand-legacy' },
]

try {
  for (const u of urls) {
    const res = await page.goto(u.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => {
      note(`PUB ERR ${u.url} ${e}`)
      return null
    })
    await page.waitForTimeout(700)
    const title = await page.title().catch(() => 'NO-TITLE')
    const h1 = await page.locator('h1').first().innerText().catch(() => 'NO-H1')
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500)
    const visMust = (await page.evaluate(`(() => {
      var acc = []
      var walk = function (n) {
        if (n.nodeType === 3) {
          var m = n.textContent && n.textContent.match(/\\{\\{[^}]+\\}\\}/g)
          if (m) acc.push.apply(acc, m)
        } else if (n.nodeType === 1) {
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].indexOf(n.tagName) === -1) {
            for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i])
          }
        }
      }
      if (document.body) walk(document.body)
      return Array.from(new Set(acc))
    })()`)) as string[]
    note(
      `PUB ${res?.status()} ${u.url} title=${JSON.stringify(title)} h1=${JSON.stringify(h1)} visMust=${JSON.stringify(visMust)}`,
    )
    note(`  body: ${body}`)
    await page.screenshot({ path: `${SHOTS}/${u.name}.png`, fullPage: true })
    note(`SHOT ${u.name}`)
  }
} finally {
  writeFileSync(`${SHOTS}/pub-notes.txt`, notes.join('\n') + '\n')
  await browser.close()
}
console.log('DONE', notes.length)
