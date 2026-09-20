/**
 * W32: master quiz logic stays on the master, and the builder sees the same
 * flow validator publish uses.
 *
 *   pnpm test:quiz-master-runtime
 */
import { readFileSync } from 'node:fs'

import {
  deploymentCarriesQuizLogic,
  refuseDeploymentQuizLogic,
} from '../src/lib/master-safety.ts'
import { validateQuizFlow } from '../src/lib/quiz-flow/index.ts'
import { buildSeedQuiz } from '../src/components/builder/quiz/seed-data.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const refused = refuseDeploymentQuizLogic()
t(refused.ok === false, 'deployment quiz-logic writes are refused')
t(/master quiz/i.test(refused.error), 'refusal tells the operator to edit or clone the master quiz')

t(!deploymentCarriesQuizLogic({ name: 'MVA paid', templateId: 'sq_quiz_first' }), 'a normal deployment payload is not treated as logic')
t(deploymentCarriesQuizLogic({ nodes: [] }), 'a deployment that carries nodes is quiz logic')
t(deploymentCarriesQuizLogic({ steps: [] }), 'a deployment that carries steps is quiz logic')
t(deploymentCarriesQuizLogic({ tiers: [] }), 'a deployment that carries tiers is quiz logic')
t(deploymentCarriesQuizLogic({ customFields: [] }), 'a deployment that carries custom fields is quiz logic')

const seed = buildSeedQuiz()
const a = validateQuizFlow(seed)
const b = validateQuizFlow(seed)
t(a.ok === b.ok, 'the same master flow validates identically twice')
t(
  JSON.stringify(a.checks.map((c) => [c.id, c.ok])) === JSON.stringify(b.checks.map((c) => [c.id, c.ok])),
  'check outcomes are a property of the master, not of a deployment',
)

const actions = readFileSync(new URL('../src/app/(app)/admin/(top)/quizzes/actions.ts', import.meta.url), 'utf8')
t(actions.includes('deploymentCarriesQuizLogic'), 'saveQuizDeployment refuses payloads that carry quiz logic')
t(!/data = \{[\s\S]*\bnodes:/.test(actions), 'saveQuizDeployment does not write master nodes onto the deployment row')
t(!/data = \{[\s\S]*\bsteps:/.test(actions), 'saveQuizDeployment does not write master steps onto the deployment row')
t(!/data = \{[\s\S]*\btiers:/.test(actions), 'saveQuizDeployment does not write master tiers onto the deployment row')

const builder = readFileSync(new URL('../src/components/builder/quiz/QuizBuilderApp.tsx', import.meta.url), 'utf8')
t(builder.includes('validateQuizFlow'), 'the quiz builder runs the same flow validator publish uses')
t(builder.includes('lintQuizGraph'), 'the builder still surfaces graph-structure issues')

const runtime = readFileSync(new URL('../src/components/public/quiz/QuizRuntime.tsx', import.meta.url), 'utf8')
t(runtime.includes('export function QuizRuntime({'), 'QuizRuntime is the live public driver')
t(runtime.includes('quiz?.customFields') || runtime.includes('quiz.customFields'), 'the runtime reads custom fields from the master quiz')
t(!runtime.includes('deployment.nodes'), 'the public runtime does not read quiz nodes off the deployment')

const lp = readFileSync(new URL('../src/lib/lp-deployment.ts', import.meta.url), 'utf8')
t(lp.includes('resolveEmbeddedQuiz'), 'an embedded landing-page quiz uses the master flow resolver')

const adv = readFileSync(new URL('../src/app/(public)/[[...slug]]/page.tsx', import.meta.url), 'utf8')
t(adv.includes('resolved.quiz.quiz'), 'an embedded advertorial quiz mounts the master quiz, not a copy')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
