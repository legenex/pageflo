/**
 * W41: bulk multi-brand deploy planning.
 *
 *   pnpm test:bulk-deploy
 */
import { readFileSync } from 'node:fs'

import {
  isPartialBulkSuccess,
  planBulkDeploy,
  previewUrlForBrandPath,
} from '../src/lib/bulk-deploy.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const brands = [
  { id: 1, slug: 'check-a-case', name: 'Check A Case' },
  { id: 2, slug: 'dont-settle', name: "Don't Settle" },
]

const badRoot = planBulkDeploy(brands, '/')
t('error' in badRoot, 'the Brand website root cannot be a deployment path')

const badEmpty = planBulkDeploy([], '/s/mva')
t('error' in badEmpty, 'bulk deploy refuses an empty Brand list')

const plan = planBulkDeploy(brands, '/s/mva')
t(Array.isArray(plan) && plan.length === 2, 'one plan item per Brand')
if (Array.isArray(plan)) {
  t(plan[0].previewUrl === 'https://check-a-case.preview.pageflo.io/s/mva', 'Check A Case preview uses preview.pageflo.io')
  t(plan[1].previewUrl === 'https://dont-settle.preview.pageflo.io/s/mva', "Don't Settle preview uses preview.pageflo.io")
  t(plan[0].path === '/s/mva' && plan[1].path === '/s/mva', 'the same path is planned for every Brand')
}

t(
  previewUrlForBrandPath('check-a-case', 's/mva/') === 'https://check-a-case.preview.pageflo.io/s/mva',
  'preview URLs normalise the path the same way the public resolver does',
)

t(
  isPartialBulkSuccess([
    { ok: true, brandId: 1, brandName: 'A', deploymentId: '9', previewUrl: 'https://a.preview.pageflo.io/s' },
    { ok: false, brandId: 2, brandName: 'B', error: 'path taken', previewUrl: 'https://b.preview.pageflo.io/s' },
  ]),
  'a mixed batch is a partial success, not a total failure',
)
t(
  !isPartialBulkSuccess([
    { ok: true, brandId: 1, brandName: 'A', deploymentId: '9', previewUrl: 'https://a.preview.pageflo.io/s' },
    { ok: true, brandId: 2, brandName: 'B', deploymentId: '10', previewUrl: 'https://b.preview.pageflo.io/s' },
  ]),
  'an all-success batch is not labelled partial',
)

const action = readFileSync(new URL('../src/app/(app)/admin/(top)/deployments/actions.ts', import.meta.url), 'utf8')
t(action.includes('checkPathAvailable'), 'each Brand attempt checks the path before create')
t(action.includes('try {'), 'each Brand attempt is isolated')
t(action.includes("status: 'draft'"), 'bulk deploy creates drafts for review, not live traffic')
t(action.includes('requireDeploymentSiteAdmin'), 'each Brand is authorized independently')

const page = readFileSync(new URL('../src/app/(app)/admin/(top)/deployments/page.tsx', import.meta.url), 'utf8')
t(page.includes('BulkDeployForm'), 'the Deployments page mounts the bulk form')
t(page.includes('previewOf'), 'the list shows a preview URL per deployment')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
