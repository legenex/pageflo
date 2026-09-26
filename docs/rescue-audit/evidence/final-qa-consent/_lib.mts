import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChromium } from '../../../../scripts/lib/browser.ts'
import type { Page } from 'playwright'
export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const APP = 'https://app.pageflo.io'
export const SLUG = 'pageflo-rescue-acceptance-944138'
export const RUN = 'cq' + '260926a'
const t = readFileSync('/home/legenex/.pageflo-admin-credentials', 'utf8')
const f: Record<string,string> = {}
for (const l of t.split('\n')) { const i = l.indexOf(': '); if (i>0) f[l.slice(0,i).trim()] = l.slice(i+2).trim() }
export const email = f['admin email']; export const password = f['temporary password']
export const shot = async (p: Page, n: string) => { await p.screenshot({ path: path.join(HERE, n + '.png'), fullPage: true }); console.log('SHOT', n, p.url()) }
export const text = async (p: Page) => ((await p.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim()
export const dump = (n: string, s: string) => writeFileSync(path.join(HERE, n + '.txt'), s)
export const browser = () => launchChromium({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] })
export const login = async (p: Page) => {
  await p.goto(APP + '/sign-in', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800)
  await shot(p, '01-sign-in')
  await p.locator('input[type="email"]').first().fill(email)
  await p.locator('input[type="password"]').first().fill(password)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL(/\/admin\//, { timeout: 60000, waitUntil: 'commit' }); await p.waitForTimeout(1000)
  await shot(p, '02-console-landing')
}
