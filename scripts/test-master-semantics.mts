import {
  masterHasDeploymentsMessage,
  refuseDeploymentCopyOverride,
  refuseDeploymentQuizLogic,
  deploymentCarriesQuizLogic,
} from '../src/lib/master-safety.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const refused = refuseDeploymentCopyOverride()
t(refused.ok === false, 'deployment copy override writes are refused')
t(/master asset/i.test(refused.error), 'refusal tells the operator to edit or clone the master')

const logic = refuseDeploymentQuizLogic()
t(logic.ok === false, 'deployment quiz-logic writes are refused')
t(/master quiz/i.test(logic.error), 'quiz-logic refusal names the master quiz')
t(deploymentCarriesQuizLogic({ nodes: [{ id: 'n1' }] }), 'a deployment payload with nodes is treated as logic')
t(!deploymentCarriesQuizLogic({ templateId: 'sq_quiz_first' }), 'a visual-template choice is not quiz logic')

const msg = masterHasDeploymentsMessage('quiz', 2, ['A', 'B'])
t(/cannot be deleted/.test(msg), 'live deployments block master delete')
t(/2 deployments/.test(msg), 'block message includes the count')
t(msg.includes('A') && msg.includes('B'), 'block message names the deployments')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
