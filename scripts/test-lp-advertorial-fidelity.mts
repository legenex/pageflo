import { createHash } from 'node:crypto'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'
import { ADVERTORIAL_TEMPLATE_IDS, advertorialChrome } from '../src/lib/advertorial-templates.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

t(PORTED_TEMPLATES.length === 12, 'twelve landing-page templates are registered')
const hashes = PORTED_TEMPLATES.map((tpl) => createHash('sha256').update(tpl.html).digest('hex').slice(0, 12))
t(new Set(hashes).size === hashes.length, 'each LP template carries unique markup, not a reskin of one shell')
t(PORTED_TEMPLATES.every((tpl) => tpl.html.length > 2000), 'each LP template has substantial markup')
t(PORTED_TEMPLATES.every((tpl) => Boolean(tpl.quizMount)), 'every LP template mounts a quiz')

t(ADVERTORIAL_TEMPLATE_IDS.length === 4, 'four advertorial templates exist')
const chromes = ADVERTORIAL_TEMPLATE_IDS.map((id) => advertorialChrome(id))
t(new Set(chromes.map((c) => c.articleMaxWidth)).size === 4, 'advertorial templates use distinct article widths')
t(new Set(chromes.map((c) => c.pageBackground)).size === 4, 'advertorial templates use distinct page grounds')
t(new Set(chromes.map((c) => c.articleFont)).size === 4, 'advertorial templates use distinct body fonts')
t(advertorialChrome('unknown').id === 'personal_story', 'unknown advertorial ids fall back without inventing a fifth template')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
