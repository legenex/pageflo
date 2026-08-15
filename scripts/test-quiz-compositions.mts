/**
 * The composition seam, asserted.
 *
 *   pnpm tsx scripts/test-quiz-compositions.mts
 *
 * A composition owns the whole DOM of a quiz template. That is the point, and it
 * is also the risk: the naive way to make twenty designs look different is to
 * copy the one question card twenty times, and each copy then carries its own
 * `canSubmit`, its own honeypot, its own auto-advance branch, its own submit and
 * its own idea of where the flow goes next. Twenty copies of `canSubmit` is
 * twenty places for a required-field rule to be wrong, and a lead lost on
 * template seventeen is invisible on the other nineteen. This repo has already
 * demonstrated that failure at scale=2 (see `machine.ts`).
 *
 * So four things are checked here, in order of how much they matter:
 *
 *   1. NO RUNTIME REACHES A COMPOSITION. No file under `quiz-compositions/` may
 *      import the graph, the lead client, the webhook route, destinations, the
 *      machine or payload, or call `fetch`. A composition that starts to grow a
 *      runtime fails on the import, before the logic exists.
 *   2. NO COMPOSITION RE-IMPLEMENTS INPUT. No `<input`, `<select`, `<textarea`,
 *      no `useState`, no `onAnswer`, no honeypot. Controls are `P.Field` and
 *      `P.DatePicker`; the predicate is `view.nav.canSubmit`.
 *   3. THE TEST HOOKS SURVIVE. Every composition draws `data-quiz-root` and
 *      routes its copy through the primitives that carry `data-quiz-headline`
 *      and `data-quiz-question`, because `scripts/test-e2e-lead.mts` reads them
 *      to prove a flow advanced - and a design that omitted them would make the
 *      suite pass by finding nothing.
 *   4. THE CLAIMS ARE SOUND. Every claimed id exists, no id is claimed twice,
 *      and every id the registry knows resolves to something that can draw.
 *
 * No browser, no database, no network: this reads the source and the tables.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { COMPOSITION_CLAIMS, CLAIMED_TEMPLATE_IDS } from '../src/lib/quiz-compositions/claims.ts'
import { QUIZ_TEMPLATES, QUIZ_TEMPLATE_BY_ID } from '../src/lib/quiz-templates/model.ts'
import { registryHealth, resolveForRender } from '../src/lib/template-registry.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const DIR = new URL('../src/lib/quiz-compositions/', import.meta.url).pathname
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
const SUPPORT = new Set(['types.ts', 'registry.ts', 'claims.ts', 'frame.tsx'])
const COMPOSITION_FILES = FILES.filter((f) => !SUPPORT.has(f))

/** Comments are prose about the code, not code. Strip them before scanning. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log(`quiz compositions: ${COMPOSITION_FILES.length} composition file(s), ${FILES.length} in the module`)

/* ------------------------------------------- 1. no runtime reaches a design */

const BANNED_IMPORTS = [
  'quiz-graph',
  'lead-capture-client',
  'quiz-webhook',
  'quiz-destinations',
  'quiz-lead',
  'seed-data',
  'payload',
  'public/quiz/machine',
]

for (const f of FILES) {
  const src = code(readFileSync(DIR + f, 'utf8'))
  for (const banned of BANNED_IMPORTS) {
    t(!new RegExp(`from '[^']*${banned}`).test(src), `${f} does not import ${banned}`)
  }
  t(!/\bfetch\s*\(/.test(src), `${f} makes no network call`)
  t(!/useEffect\s*\(/.test(src), `${f} runs no effects`)
}

/* --------------------------------------- 2. no composition re-implements input */

for (const f of COMPOSITION_FILES) {
  const src = code(readFileSync(DIR + f, 'utf8'))
  t(!/<input\b|<select\b|<textarea\b/.test(src), `${f} writes no input control of its own`)
  t(!/\buseState\s*\(|\buseReducer\s*\(/.test(src), `${f} holds no state of its own`)
  t(!/onAnswer|fieldMappings|setTier|isDQ|nextStepKey/.test(src), `${f} cannot construct or route an answer`)
  t(!/honeypot/i.test(src), `${f} does not re-implement the honeypot`)
  t(!/canSubmit\s*=/.test(src), `${f} does not restate the submit predicate`)
}

/* ----------------------------------------------- 3. the test hooks survive */

for (const f of COMPOSITION_FILES) {
  const src = readFileSync(DIR + f, 'utf8')
  t(/data-quiz-root=""/.test(src), `${f} draws data-quiz-root`)
  t(/<P\.Headline\b/.test(src), `${f} draws the headline through the primitive that carries its hook`)
  t(/<P\.Question\b/.test(src), `${f} draws the question through the primitive that carries its hook`)
  t(/<P\.Progress\b/.test(src), `${f} draws progress through the primitive that carries data-quiz-progress`)
  t(/<P\.Consent\b/.test(src), `${f} draws the consent line`)
  t(/<P\.Endpoint\b/.test(src), `${f} draws the endpoint`)
}

const primitives = readFileSync(new URL('../src/components/public/quiz/primitives.tsx', import.meta.url).pathname, 'utf8')
for (const hook of ['data-quiz-headline', 'data-quiz-question', 'data-quiz-progress', 'data-quiz-answer', 'data-quiz-form', 'data-quiz-back', 'data-quiz-submit', 'data-quiz-endpoint']) {
  const where = hook === 'data-quiz-answer'
    ? readFileSync(new URL('../src/components/public/quiz/forms/answers.tsx', import.meta.url).pathname, 'utf8')
    : primitives
  t(where.includes(hook), `${hook} is carried by a shared primitive`)
}

/* ----------------------------------------------------- 4. the claims are sound */

const seen = new Set<string>()
for (const id of CLAIMED_TEMPLATE_IDS) {
  t(Boolean(QUIZ_TEMPLATE_BY_ID[id]), `claimed template "${id}" exists in the registry`)
  t(!seen.has(id), `template "${id}" is claimed exactly once`)
  seen.add(id)
}

for (const key of Object.keys(COMPOSITION_CLAIMS)) {
  t(COMPOSITION_CLAIMS[key].length > 0, `composition "${key}" claims at least one template`)
  t(
    COMPOSITION_FILES.some((f) => readFileSync(DIR + f, 'utf8').includes(`COMPOSITION_CLAIMS.${key}`)),
    `composition "${key}" reads its claim from the table rather than restating it`,
  )
}

// Every id the registry knows must draw SOMETHING, claimed or not: an unclaimed
// id falls to the default composition, which is a real design rather than a
// placeholder. This is the check that keeps "nothing 404s" true.
for (const tpl of QUIZ_TEMPLATES) {
  t(resolveForRender('quiz', tpl.id).template.id === tpl.id, `${tpl.id} resolves to itself in the registry`)
}

// The legacy ids must still land on a canonical template, which is what makes
// composition resolution safe to run only on canonical ids.
for (const legacy of ['default', 'minimal', 'editorial', 'gradient', 'glass', 'compact']) {
  const r = resolveForRender('quiz', legacy)
  t(Boolean(QUIZ_TEMPLATE_BY_ID[r.template.id]), `legacy id "${legacy}" still resolves to a canonical template`)
}

const health = registryHealth()
t(health.ok, `registryHealth is clean${health.ok ? '' : ': ' + health.problems.join('; ')}`)

/* ------------------------------------------------------------------ verdict */

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
