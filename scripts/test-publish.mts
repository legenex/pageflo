/**
 * Assertions for path claims and the publish lifecycle.
 *
 *   pnpm test:publish
 *
 * Database-free. Everything here is a pure decision — is this path taken, is
 * this transition legal, does this preflight pass — and keeping it that way is
 * the point: a rule that needs a database to reach a verdict is a rule the save
 * path, the publish path and the resolver will each reach differently.
 *
 * The Payload passed to `checkPathAvailable` is a stub that returns whatever
 * rows the case declares. Same reasoning as `scripts/test-authz.ts`: these
 * functions must decide from the records in front of them, so anything that
 * needed a live query to answer has already failed its own design.
 */
import { readFileSync } from 'node:fs'

import {
  effectivePath,
  scopesOverlap,
  findConflicts,
  checkPathAvailable,
  CLAIM_PRECEDENCE,
  type PathClaim,
} from '../src/lib/path-claims.ts'
import {
  canTransition,
  decideTransition,
  quizDeploymentPreflight,
  lpDeploymentPreflight,
  DEPLOYMENT_TRANSITIONS,
  type DeploymentStatus,
} from '../src/lib/publish-lifecycle.ts'
import { summarize, pass, fail } from '../src/lib/publish-preflight.ts'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'

let passed = 0
let failed = 0
const t = (cond: unknown, label: string): void => {
  if (cond) passed++
  else { failed++; console.log('  FAIL ' + label) }
}

/* ---------------------------------------------------------------- fixtures */

const claim = (over: Partial<PathClaim> = {}): PathClaim => ({
  kind: 'quiz-deployment',
  id: 'q1',
  siteId: 1,
  domainId: null,
  rawPath: '/c/pain',
  effectivePath: '/c/pain',
  live: true,
  label: 'a quiz deployment',
  ...over,
})

/**
 * A Payload stub whose `find` answers from a declared table.
 *
 * Collections it is not given return empty, which is also what the real
 * `collectSiteClaims` does when a funnel table is absent.
 */
const stubPayload = (rows: Record<string, Array<Record<string, unknown>>>) =>
  ({
    find: async ({ collection }: { collection: string }) => ({ docs: rows[collection] ?? [] }),
  }) as never

/* ------------------------------------------------------------ normalisation */

t(effectivePath('/c/pain') === '/c/pain', 'a canonical path is itself')
t(effectivePath('c/pain') === '/c/pain', 'a missing leading slash is added')
t(effectivePath('/c/pain/') === '/c/pain', 'a trailing slash is removed')
t(effectivePath('/C/Pain') === '/c/pain', 'case is folded — the resolver already matches case-insensitively, so two spellings are one URL')
t(effectivePath('  /c/pain  ') === '/c/pain', 'surrounding whitespace is trimmed, because form posts carry it')
t(effectivePath('') === '/', 'an empty path is the root')
t(effectivePath(null) === '/', 'a null path is the root')
t(effectivePath('/c/pain//') === '/c/pain', 'repeated trailing slashes collapse')

/* ------------------------------------------------------------------ scopes */

t(scopesOverlap(claim({ domainId: null }), claim({ domainId: 5 })), 'a site-wide claim overlaps a domain-bound one — it is reachable on that host too')
t(scopesOverlap(claim({ domainId: 5 }), claim({ domainId: 5 })), 'two claims on one domain overlap')
t(!scopesOverlap(claim({ domainId: 5 }), claim({ domainId: 6 })), 'two claims on DIFFERENT domains do not overlap — they are two different URLs')
t(!scopesOverlap(claim({ siteId: 1 }), claim({ siteId: 2 })), 'claims on different sites never overlap')

/* --------------------------------------------------------------- conflicts */

t(findConflicts([claim({ id: 'a' })]).length === 0, 'one claim is never a conflict')
t(findConflicts([claim({ id: 'a' }), claim({ id: 'b' })]).length === 1, 'two live claims on one path conflict')
t(
  findConflicts([claim({ id: 'a', domainId: 5 }), claim({ id: 'b', domainId: 6 })]).length === 0,
  'the same path on two different domains is not a conflict',
)
t(
  findConflicts([claim({ id: 'a', live: false }), claim({ id: 'b' })]).length === 0,
  'a DRAFT claim conflicts with nothing — parking a path while you work is normal, and flagging it makes the check something people route around',
)
t(
  findConflicts([claim({ id: 'a', effectivePath: '/c/pain' }), claim({ id: 'b', effectivePath: '/c/other' })]).length === 0,
  'different paths do not conflict',
)

{
  // Precedence: authored content beats a deployment, and the report says which.
  const c = findConflicts([
    claim({ id: 'dep', kind: 'lp-deployment' }),
    claim({ id: 'page', kind: 'page', label: 'the page "Pain"' }),
  ])
  t(c.length === 1 && c[0].winner.kind === 'page', 'a Page beats a deployment for the same path')
  t(c[0].losers.length === 1 && c[0].losers[0].kind === 'lp-deployment', 'and the deployment is named as the loser')
}
{
  const c = findConflicts([
    claim({ id: 'wide', domainId: null }),
    claim({ id: 'bound', domainId: 7 }),
  ])
  t(c.length === 1 && c[0].winner.id === 'bound', "a domain-bound claim beats a site-wide one — that is the resolver's own tie-break")
}
t(CLAIM_PRECEDENCE.page < CLAIM_PRECEDENCE['quiz-deployment'], 'the precedence table puts authored content first')
t(CLAIM_PRECEDENCE['quiz-deployment'] < CLAIM_PRECEDENCE['lp-deployment'], 'and quiz deployments before LP deployments, as the router resolves them')

/* ------------------------------------------------------ checkPathAvailable */

const NO_ROWS = stubPayload({})

t(!(await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '/', kind: 'quiz-deployment', live: true })).ok, 'the root is refused — it belongs to the site home page')
t(!(await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '', kind: 'quiz-deployment', live: true })).ok, 'an empty path is refused')
t(!(await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '/c/a b', kind: 'quiz-deployment', live: true })).ok, 'a path with a space is refused at the point it is typed')
t(!(await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '/c/a?x=1', kind: 'quiz-deployment', live: true })).ok, 'a path with a query string is refused')
t((await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '/c/pain', kind: 'quiz-deployment', live: true })).ok, 'a free path is available')
t(!(await checkPathAvailable(NO_ROWS, { siteId: 1, domainId: null, path: '/privacy', kind: 'quiz-deployment', live: true })).ok, 'a shared legal path is refused — the router serves it before it looks at a deployment')

{
  const p = stubPayload({
    'funnel-lp-deployments': [{ id: 9, site: 1, domain: null, path: '/C/Pain/', status: 'live', name: 'Pain LP' }],
  })
  const r = await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'quiz-deployment', live: true })
  t(!r.ok, 'a path taken under a different spelling is refused')
  t(!r.ok && r.error.includes('/C/Pain/'), 'and the message shows the spelling that is already there, because otherwise the refusal looks wrong')
  t(!r.ok && r.error.includes('without case'), 'and explains why two spellings are one URL')
}
{
  const p = stubPayload({
    'funnel-quiz-deployments': [{ id: 9, site: 1, domain: null, path: '/c/pain', status: 'draft', name: 'Draft' }],
  })
  t((await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'a DRAFT record holds no claim')
}
{
  const p = stubPayload({
    'funnel-quiz-deployments': [{ id: 9, site: 1, domain: 5, path: '/c/pain', status: 'live', name: 'On domain 5' }],
  })
  t((await checkPathAvailable(p, { siteId: 1, domainId: 6, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'the same path on a different domain is available')
  t(!(await checkPathAvailable(p, { siteId: 1, domainId: 5, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'the same path on the SAME domain is not')
  t(!(await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'and a site-wide claim collides with a domain-bound one, because it is reachable on that host too')
}
{
  const p = stubPayload({
    'funnel-quiz-deployments': [{ id: 9, site: 1, domain: null, path: '/c/pain', status: 'live', name: 'Itself' }],
  })
  t(
    (await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'quiz-deployment', excludeId: '9', live: true })).ok,
    'a record does not conflict with itself when it is re-saved',
  )
}
{
  const p = stubPayload({ pages: [{ id: 3, site: 1, slug: 'c/pain', status: 'published', title: 'Pain' }] })
  const r = await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })
  t(!r.ok, 'a published Page claims the path against a deployment')
  t(!r.ok && r.error.includes('Pain'), 'and the refusal names the page')
}
{
  const p = stubPayload({ pages: [{ id: 3, site: 1, slug: 'c/pain', status: 'draft', title: 'Pain' }] })
  t((await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'a DRAFT page claims nothing — the router would not have served it either')
}
{
  const p = stubPayload({ pages: [{ id: 3, site: 1, slug: 'c/pain', status: 'scheduled', publish_at: '2000-01-01T00:00:00.000Z', title: 'Pain' }] })
  t(!(await checkPathAvailable(p, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'a scheduled page whose time has come DOES claim the path')
  const future = stubPayload({ pages: [{ id: 3, site: 1, slug: 'c/pain', status: 'scheduled', publish_at: '2999-01-01T00:00:00.000Z', title: 'Pain' }] })
  t((await checkPathAvailable(future, { siteId: 1, domainId: null, path: '/c/pain', kind: 'lp-deployment', live: true })).ok, 'one whose time has not, does not')
}
t(
  (await checkPathAvailable(stubPayload({ 'funnel-lp-deployments': [{ id: 9, site: 1, domain: null, path: '/c/pain', status: 'live' }] }), {
    siteId: 1, domainId: null, path: '/c/pain', kind: 'quiz-deployment', live: false,
  })).ok,
  'saving a DRAFT onto a taken path is allowed — publishing it is where the claim is taken',
)

/* -------------------------------------------------------------- transitions */

t(canTransition('draft', 'live'), 'draft -> live')
t(canTransition('live', 'paused'), 'live -> paused')
t(canTransition('paused', 'live'), 'paused -> live')
t(canTransition('live', 'draft'), 'live -> draft')
t(!canTransition('draft', 'paused'), 'draft -> paused is meaningless and refused')
t(Object.keys(DEPLOYMENT_TRANSITIONS).length === 3, 'there are exactly three states')
t(!('archived' in DEPLOYMENT_TRANSITIONS), 'archiving is NOT a publication state — retiring something is a different decision and must not share a control')

const okPre = summarize([pass('x', 'fine')])
const badPre = summarize([fail('x', 'a check', 'because reasons')])
const warnOnly = summarize([fail('x', 'a check', 'minor', 'warn')])

t(decideTransition('draft', 'live', okPre).ok, 'a passing preflight lets a draft go live')
t(!decideTransition('draft', 'live', badPre).ok, 'a failing one does not')
t(decideTransition('draft', 'live', warnOnly).ok, 'a WARNING does not block — a warning that blocks is a warning nobody reports')
{
  const r = decideTransition('draft', 'live', badPre)
  t(!r.ok && r.error.includes('because reasons'), 'and the refusal carries the reason, not just a no')
  t(!r.ok && r.preflight?.blocking.length === 1, 'and the full check list, so four problems are fixed in one pass rather than four')
}
t(decideTransition('live', 'paused', badPre).ok, 'GOING DOWN is never gated — something live that fails a check is exactly what needs taking offline')
t(decideTransition('live', 'draft', badPre).ok, 'unpublishing is never gated either')
t(!decideTransition('paused', 'live', badPre).ok, 'RESUME is gated, because the world moved while it was paused')
t(!decideTransition('paused', 'live', null).ok, 'and going live with no preflight at all is refused')
t(!decideTransition('live', 'live', okPre).ok, 'a no-op transition is refused rather than silently succeeding')

/* --------------------------------------------------------------- preflight */

const SITE = { id: 1, name: 'Acme', brand_display_name: 'Acme Claims', default_phone: '(800) 000-0000', legal_default_disclaimer: 'Not a law firm.' }
/**
 * A small but REALISTIC flow: question -> form -> endpoint.
 *
 * The first version had the form as the last node with no answers, which the
 * flow validator correctly refused: a form the visitor reaches with nothing to
 * answer and no route out is where the funnel stops without ending. The seed
 * quiz models it the same way this does — the form routes on to a terminal.
 */
const GOOD_QUIZ = {
  id: 10,
  tiers: [],
  custom_fields: [],
  is_published: true,
  is_archived: false,
  steps: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
  nodes: [
    { id: 'n1', stepKey: 'a', type: 'question', tiers: [], answers: [{ id: 'x', label: 'Yes', nextStepKey: 'b' }] },
    { id: 'n2', stepKey: 'b', type: 'form', tiers: [], tcpaText: 'By clicking you consent to be contacted.', answers: [{ id: 'y', label: 'Submit', nextStepKey: 'c' }] },
    { id: 'n3', stepKey: 'c', type: 'endpoint', tiers: [], answers: [] },
  ],
}
const GOOD_DEP = { id: 20, site: 1, quiz: 10, domain: null, path: '/c/pain', status: 'draft', template_id: 'sq_quiz_first', utm: {}, pixels: {} }
const USER = { id: 1, super_admin: true, siteBindings: [] } as never
const CTX = (rows: Record<string, Array<Record<string, unknown>>> = {}) => ({ payload: stubPayload(rows), user: USER, siteId: 1 })

{
  const r = await quizDeploymentPreflight(CTX(), { deployment: GOOD_DEP, quiz: GOOD_QUIZ, site: SITE, domain: null })
  t(r.ok, `a complete quiz deployment passes preflight${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id + ':' + c.detail).join(', ')}`)
  t(r.checks.length >= 10, `and reports every check, not just failures (${r.checks.length})`)
  t(r.checks.some((c) => c.id === 'authz'), 'authorization is a named check')
  t(r.checks.some((c) => c.id === 'path'), 'the path is a named check')
  t(r.checks.some((c) => c.id === 'consent'), 'consent is a named check')
  // The real flow validator, not a second opinion written into the preflight.
  t(r.checks.some((c) => c.id === 'flow-valid_entry'), 'the flow validator supplies its own named checks')
  t(r.checks.filter((c) => c.id.startsWith('flow-')).length === 10, 'all ten of them')
}

// Each failure mode, one at a time, so a fix to one cannot mask another.
const quizCase = async (label: string, over: Record<string, unknown>, expectId: string): Promise<void> => {
  const r = await quizDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_DEP, ...(over.deployment as object ?? {}) },
    quiz: over.quiz === null ? null : { ...GOOD_QUIZ, ...(over.quiz as object ?? {}) },
    site: over.site === null ? null : { ...SITE, ...(over.site as object ?? {}) },
    domain: (over.domain ?? null) as never,
  })
  t(!r.ok, label)
  t(r.blocking.some((c) => c.id === expectId), `${label} — and it is the "${expectId}" check that fails`)
}

await quizCase('an unpublished parent quiz blocks publication', { quiz: { is_published: false } }, 'parent')
await quizCase('an archived parent quiz blocks publication', { quiz: { is_archived: true } }, 'parent')
await quizCase('a template that names nothing blocks publication', { deployment: { template_id: 'sq_nope' } }, 'quiz-template')
await quizCase('a brand with no disclaimer blocks publication', { site: { legal_default_disclaimer: '' } }, 'brand')
await quizCase('a brand with no phone blocks publication', { site: { default_phone: '' } }, 'brand')
await quizCase('an empty graph blocks publication', { quiz: { steps: [], nodes: [] } }, 'graph-nonempty')
// The check ids are the flow validator's own, prefixed. Naming them here rather
// than asserting "something failed" is what stops a preflight regression looking
// like a passing test with a different reason.
await quizCase('a dangling route blocks publication', { quiz: { nodes: [{ id: 'n1', stepKey: 'a', type: 'question', answers: [{ id: 'x', nextStepKey: 'nowhere' }] }, { id: 'n2', stepKey: 'b', type: 'form', tcpaText: 'consent' }] } }, 'flow-valid_references')
await quizCase('a flow with no terminal blocks publication', { quiz: { steps: [{ key: 'a', label: 'A' }], nodes: [{ id: 'n1', stepKey: 'a', type: 'question', tiers: [], tcpaText: 'consent', answers: [] }] } }, 'flow-valid_terminals')
await quizCase('a flow with no consent language blocks publication', { quiz: { nodes: [{ id: 'n1', stepKey: 'a', type: 'question', answers: [] }, { id: 'n2', stepKey: 'b', type: 'form', answers: [] }] } }, 'consent')
await quizCase('the root path blocks publication', { deployment: { path: '/' } }, 'path')
await quizCase('malformed pixels block publication', { deployment: { pixels: 'not an object' } }, 'pixels')

{
  const r = await quizDeploymentPreflight(
    { payload: stubPayload({}), user: null, siteId: 1 },
    { deployment: GOOD_DEP, quiz: GOOD_QUIZ, site: SITE, domain: null },
  )
  t(!r.ok && r.blocking[0].id === 'authz', 'an unauthenticated caller fails at authorization and nothing else is even run')
  t(r.checks.length === 1, 'and no further check leaks information about the record')
}
{
  const bound = { id: 2, super_admin: false, siteBindings: [{ site: 99, role: 'admin' }] } as never
  const r = await quizDeploymentPreflight(
    { payload: stubPayload({}), user: bound, siteId: 1 },
    { deployment: GOOD_DEP, quiz: GOOD_QUIZ, site: SITE, domain: null },
  )
  t(!r.ok && r.blocking[0].id === 'authz', 'a caller bound to another brand cannot publish this one')
}

/* ------------------------------------------------------------ domain checks */

const ACTIVE_DOMAIN = { id: 5, site: 1, host: 'acme.example', status: 'active', ssl_status: 'active', kind: 'custom' }

{
  const r = await quizDeploymentPreflight(CTX(), { deployment: { ...GOOD_DEP, domain: 5 }, quiz: GOOD_QUIZ, site: SITE, domain: ACTIVE_DOMAIN })
  t(r.ok, 'an active custom domain with a certificate publishes')
}
{
  const r = await quizDeploymentPreflight(CTX(), { deployment: { ...GOOD_DEP, domain: 5 }, quiz: GOOD_QUIZ, site: SITE, domain: { ...ACTIVE_DOMAIN, ssl_status: 'pending' } })
  t(!r.ok && r.blocking.some((c) => c.id === 'domain-eligibility'), 'a custom domain with no certificate does not')
}
{
  const r = await quizDeploymentPreflight(CTX(), { deployment: { ...GOOD_DEP, domain: 5 }, quiz: GOOD_QUIZ, site: SITE, domain: { ...ACTIVE_DOMAIN, site: 99 } })
  t(!r.ok && r.blocking.some((c) => c.id === 'domain-ownership'), "a domain belonging to another brand does not — that would publish this brand's page on their host")
}
{
  const preview = { id: 6, site: 1, host: 'acme.preview.legenex.com', status: 'active', ssl_status: 'pending', kind: 'preview' }
  const r = await quizDeploymentPreflight(CTX(), { deployment: { ...GOOD_DEP, domain: 6 }, quiz: GOOD_QUIZ, site: SITE, domain: preview })
  t(r.ok, 'a preview host with no certificate still publishes, because PREVIEW_REQUIRES_SSL is off')
  t(r.warnings.some((c) => c.id === 'domain-ssl'), 'but the operator is TOLD, rather than discovering it')
}

/* ------------------------------------------------------- landing-page preflight */

const LP_TPL = PORTED_TEMPLATES[0]
const GOOD_LP = { id: 30, is_published: true, template_id: LP_TPL.slug, sections: [{ type: 'hero' }] }
const GOOD_LP_DEP = { id: 40, site: 1, landing_page: 30, domain: null, path: '/c/lp', status: 'draft', content_overrides: {}, quiz_deployment_id: '' }

{
  const r = await lpDeploymentPreflight(CTX(), { deployment: GOOD_LP_DEP, landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null })
  t(r.ok, `a landing-page deployment with no embedded quiz passes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
  t(r.checks.some((c) => c.id === 'hydration'), 'and the renderer-hydration check ran')
}
{
  const headline = LP_TPL.slots.find((s) => s.role === 'headline')!
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, content_overrides: { [headline.id]: 'A real headline' } },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(r.ok, 'a deployment with valid overrides passes')
}
{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, content_overrides: { s99_nope_1: 'ghost copy' } },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'overrides'), 'an override naming no slot blocks publication — it is copy that will never appear')
}
{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: GOOD_LP_DEP, landingPage: { ...GOOD_LP, is_published: false }, site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'parent'), 'an unpublished landing page blocks its deployment')
}
{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '77' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz'), 'naming an embedded quiz deployment that does not exist blocks publication')
}
{
  // The cross-tenant case. `quiz_deployment_id` is a bare text id with no
  // foreign key behind it, so nothing at the database level stops brand A
  // embedding brand B's quiz and delivering its leads to brand B.
  const foreign = { id: 77, site: 99, quiz: 10, template_id: 'sq_quiz_first', path: '/x', status: 'live' }
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '77' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: foreign, quiz: GOOD_QUIZ,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz-tenant'), "embedding ANOTHER brand's quiz deployment blocks publication")
}
{
  const own = { id: 77, site: 1, quiz: 10, template_id: 'sq_quiz_first', path: '/x', status: 'live' }
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '77' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: own, quiz: GOOD_QUIZ,
  })
  t(r.ok, `embedding this brand's own quiz deployment passes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
  t(r.checks.some((c) => c.id === 'embedded-quiz-template'), "and the embedded quiz's own visual template is checked")
  t(r.checks.some((c) => c.id === 'flow-valid_terminals'), "and the embedded quiz's graph is checked, not just its existence")
}
{
  const own = { id: 77, site: 1, quiz: 10, template_id: 'sq_ghost', path: '/x', status: 'live' }
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '77' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: own, quiz: GOOD_QUIZ,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz-template'), 'an embedded quiz on a template that names nothing blocks publication')
}

/* --------------------------------- an LP embeds a FLOW, not a deployment --- */
//
// The composition the product is made of is LP template x brand x FLOW x quiz
// skin. Until gate 10 the only way to express it was to point at a standalone
// quiz DEPLOYMENT, so embedding a quiz first required publishing a separate
// public quiz page at its own path, which then competed for a URL and had to be
// kept in step with the page that borrowed it.

{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz: 10, embedded_quiz_template_id: 'sq_quiz_first' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_QUIZ,
  })
  t(r.ok, `an LP that names a quiz FLOW directly publishes with no standalone deployment${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
  t(r.checks.some((c) => c.id === 'embedded-flow'), 'and the flow is a named check')
  t(r.checks.some((c) => c.id === 'embedded-quiz-template'), "and so is the skin it chose")
  t(r.checks.some((c) => c.id === 'flow-valid_terminals'), "and the flow's own graph is validated")
  t(!r.checks.some((c) => c.id === 'embedded-quiz'), 'and it is NOT asked for a standalone deployment it deliberately does not have')
}
{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz: 10, embedded_quiz_template_id: 'sq_ghost' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_QUIZ,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz-template'), 'a skin that names nothing blocks publication')
}
{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz: 10 },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: { ...GOOD_QUIZ, is_published: false },
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-flow-published'), 'an unpublished flow blocks the landing page that embeds it')
}
{
  // No skin chosen is legitimate: the landing page's recommended one is used.
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz: 10 },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_QUIZ,
  })
  t(r.ok, "an LP with no explicit skin publishes, and takes the template's recommendation")
}
{
  // The legacy binding still works, so no live row changes behaviour.
  const own = { id: 77, site: 1, quiz: 10, template_id: 'sq_quiz_first', path: '/x', status: 'live' }
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '77' },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: own, quiz: GOOD_QUIZ,
  })
  t(r.ok && r.checks.some((c) => c.id === 'embedded-quiz'), 'a row still on the legacy standalone binding is unaffected')
}

/* ------------------------------------- the resolver actually calls the gate */

/**
 * `domainEligibility` is a pure decision and is tested as one everywhere above.
 * None of that proves the RESOLVER consults it, and for a while it did not: the
 * module imported the helper, declared an `ENFORCE_DOMAIN_ELIGIBILITY` switch,
 * described enforcement in a header comment, and then resolved every host
 * without ever calling either. Turning the switch on changed nothing, and a
 * domain in `error` served exactly like a live one.
 *
 * The resolver needs a database, so it cannot be driven from here. Its source
 * can be read, which is enough to catch the gate being removed again - the same
 * technique `test-quiz-flow.mts` uses to keep the validator honest about the
 * runtime.
 */
{
  const resolver = readFileSync(new URL('../src/lib/site-resolver.ts', import.meta.url).pathname, 'utf8')
  const body = resolver.slice(resolver.indexOf('export const resolveSiteByHost'))

  t(/const admit = \(/.test(resolver), 'site-resolver defines the eligibility gate')
  t(/domainEligibility\(domain\)/.test(resolver), 'and the gate asks domainEligibility for the verdict')
  t(
    /ENFORCE_DOMAIN_ELIGIBILITY/.test(resolver.slice(resolver.indexOf('const admit = ('))),
    'and refuses only when enforcement is switched on',
  )

  const admitCalls = (body.match(/admit\(/g) ?? []).length
  t(admitCalls >= 2, `resolveSiteByHost calls the gate on every branch that returns a site (found ${admitCalls})`)

  // The two branches that can return a site: a direct host match and a
  // redirects_from alias. Both must be gated, or an alias becomes a way to
  // reach a domain that is not allowed to serve.
  t(/if \(!admit\(domain as DomainLike, host\)\) return null/.test(body), 'the direct host match is gated')
  t(/if \(!admit\(target as DomainLike, host\)\) return null/.test(body), 'the redirects_from alias is gated too')
}

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
if (passed === 0) { console.log('no assertions ran'); process.exit(2) }
