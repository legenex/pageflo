import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'
import {
  ADVERTORIAL_TEMPLATE_IDS,
  advertorialChrome,
  advertorialStructureKey,
} from '../src/lib/advertorial-templates.ts'

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
t(new Set(chromes.map((c) => c.headerVariant)).size === 4, 'advertorial templates use distinct header structures')
t(new Set(chromes.map((c) => c.footerVariant)).size === 4, 'advertorial templates use distinct footer structures')
t(new Set(ADVERTORIAL_TEMPLATE_IDS.map(advertorialStructureKey)).size === 4, 'advertorial structure fingerprints are unique')
t(advertorialChrome('unknown').id === 'personal_story', 'unknown advertorial ids fall back without inventing a fifth template')

const publicRoute = readFileSync(new URL('../src/app/(public)/[[...slug]]/page.tsx', import.meta.url), 'utf8')
t(publicRoute.includes('resolveAdvertorialDeployment'), 'the public catch-all resolves advertorial deployments')
t(publicRoute.includes('AdvertorialRuntime'), 'the public catch-all renders advertorials through AdvertorialRuntime')
t(publicRoute.includes('RenderAdvertorialDeployment'), 'advertorial public render is a first-class route branch')

const runtime = readFileSync(new URL('../src/components/public/advertorial/AdvertorialRuntime.tsx', import.meta.url), 'utf8')
t(runtime.includes('data-adv-header='), 'advertorial runtime stamps header variant on the public root')
t(runtime.includes('data-adv-footer='), 'advertorial runtime stamps footer variant on the public root')
t(runtime.includes("headerVariant === 'masthead'"), 'news authority uses a newspaper masthead, not a shared bar')
t(runtime.includes("headerVariant === 'classified'"), 'whistleblower uses classified header chrome')
t(runtime.includes("headerVariant === 'dossier'"), 'investigative uses dossier header chrome')

const builder = readFileSync(new URL('../src/components/builder/advertorial/AdvertorialBuilderApp.tsx', import.meta.url), 'utf8')
t(builder.includes('AdvertorialRuntime'), 'builder preview mounts the same public advertorial runtime')

const claims = readFileSync(new URL('../src/lib/path-claims.ts', import.meta.url), 'utf8')
t(claims.includes("'advertorial-deployment'"), 'path claims include advertorial deployments')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
