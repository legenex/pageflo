/**
 * The production harnesses may not launder a pass.
 *
 *   pnpm test:harness-hygiene
 *
 * Reads the source of every harness that acts on PRODUCTION and fails on the
 * patterns that produced false positives before:
 *
 *   - a hard-coded acceptance (`t(true, ...)`, `t(1, ...)`, `pass++` outside `t`)
 *   - an assertion with no evidence argument
 *   - `.first().click()` / `.nth(0).click()` on Publish, Republish, Archive,
 *     Delete, Clone, Duplicate or Save controls: a click on the first of several
 *     controls, which on a list that mixes Brands is how Don't Settle got
 *     republished during a run that was testing another Brand
 *   - `getByText('Edit', ...).first()`
 *
 * This is source inspection ON PURPOSE and only for this narrow question: it is
 * a lint on the harness, not evidence about the product. Product behaviour is
 * proved by running the harness, and by scripts/test-consent-e2e.mts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const dir = new URL('.', import.meta.url).pathname
const harnesses = readdirSync(dir).filter((f) => /^test-production-.*\.mts$/.test(f))
t(harnesses.includes('test-production-acceptance.mts'), 'the production acceptance harness exists')

const SIDE_EFFECT = /(publish|republish|archive|delete|clone|duplicate|save|unpublish|pause)/i

for (const file of harnesses) {
  const src = readFileSync(join(dir, file), 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`
    const code = line.replace(/\/\/.*$/, '')
    if (/^\s*\*|^\s*\/\*/.test(line)) return
    t(!/\bt\(\s*(true|1|"|'|`)/.test(code), `${at} has no hard-coded acceptance`)
    t(!/\b(pass|H\.pass)\s*\+\+/.test(code) || file === 'test-production-smoke.mts', `${at} does not bump the pass counter by hand`)
    if (/\.(first\(\)|nth\(0\))\s*\.click\(/.test(code) || /\.first\(\)\s*\)?\s*\.click\(/.test(code)) {
      t(!SIDE_EFFECT.test(code), `${at} does not click the first of several side-effect controls`)
    }
    t(!/getByText\(\s*['"]Edit['"][^)]*\)\s*\.first\(\)/.test(code), `${at} does not edit "the first Edit"`)
  })

  // Every `t(` call in a harness that uses the Harness class passes evidence.
  if (src.includes("from './lib/production.mts'")) {
    const calls = src.match(/\bt\([^;]*?\)\n/g) ?? []
    void calls
    t(!/\bconst t = \(cond/.test(src), `${file} uses the shared asserter, not a private one that accepts anything`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
