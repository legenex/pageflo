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
import {
  summarize,
  pass,
  fail,
  groupPreflight,
  preflightGroupFor,
  PREFLIGHT_GROUPS,
  type PreflightCheck,
  type PreflightResult,
} from '../src/lib/publish-preflight.ts'
import { lpDeploymentFingerprint, lpPublishState } from '../src/lib/publish-state.ts'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'
import { classifyLpQuizBinding, LOSSY_QUIZ_DEPLOYMENT_FIELDS, NEEDS_A_DECISION } from '../src/lib/lp-quiz-binding.ts'

import { canonicalTemplateId } from '../src/lib/template-registry.ts'

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
 * The template libraries, as the stub serves them.
 *
 * The preflight asks whether the selected template EXISTS and is ENABLED, which
 * the code registry cannot answer — a clone names no code renderer, and a
 * module export cannot be disabled. So the stub has to carry rows, and carrying
 * them is what lets the disabled and deleted cases below be tested at all.
 */
const QUIZ_TEMPLATE_ROWS = [
  { id: 1, name: 'Quiz First', template_id: 'sq_quiz_first', renderer_key: 'sq_quiz_first', is_enabled: true, origin: 'stock', stock_key: 'sq_quiz_first' },
  { id: 2, name: 'Editorial Inline', template_id: 'sq_editorial_inline', renderer_key: 'sq_editorial_inline', is_enabled: true, origin: 'stock', stock_key: 'sq_editorial_inline' },
  { id: 3, name: 'Recovery Soft', template_id: 'sq_recovery_soft', renderer_key: 'sq_recovery_soft', is_enabled: true, origin: 'stock', stock_key: 'sq_recovery_soft' },
  { id: 4, name: 'Case Dossier copy', template_id: 'sq_case_dossier_copy_x1', renderer_key: 'sq_case_dossier', is_enabled: true, origin: 'clone' },
  { id: 5, name: 'Retired Skin', template_id: 'sq_direct_panel', renderer_key: 'sq_direct_panel', is_enabled: false, origin: 'stock', stock_key: 'sq_direct_panel' },
]

const LP_TEMPLATE_ROWS = [
  // id 30 is the landing-page template the deployment fixtures below select.
  { id: 30, name: 'Editorial Investigation', slug: PORTED_TEMPLATES[0].slug, template_id: PORTED_TEMPLATES[0].slug, is_enabled: true, is_published: true, origin: 'stock', stock_key: PORTED_TEMPLATES[0].slug },
  { id: 31, name: 'Disabled Template', slug: PORTED_TEMPLATES[1].slug, template_id: PORTED_TEMPLATES[1].slug, is_enabled: false, is_published: true, origin: 'stock', stock_key: PORTED_TEMPLATES[1].slug },
]

/**
 * A Payload stub whose `find` answers from a declared table.
 *
 * Collections it is not given return empty, which is also what the real
 * `collectSiteClaims` does when a funnel table is absent. The two template
 * tables are supplied by default so every existing case keeps describing a
 * deployment whose template is available; a case that wants otherwise overrides
 * them explicitly.
 */
const stubPayload = (rows: Record<string, Array<Record<string, unknown>>>) => {
  const table = (c: string): Array<Record<string, unknown>> => {
    if (rows[c]) return rows[c]
    if (c === 'funnel-quiz-templates') return QUIZ_TEMPLATE_ROWS
    if (c === 'funnel-landing-pages') return LP_TEMPLATE_ROWS
    return []
  }
  const matches = (doc: Record<string, unknown>, where: unknown): boolean => {
    if (!where || typeof where !== 'object') return true
    for (const [field, cond] of Object.entries(where as Record<string, { equals?: unknown }>)) {
      if (cond && 'equals' in cond && String(doc[field] ?? '') !== String(cond.equals ?? '')) return false
    }
    return true
  }
  return {
    find: async ({ collection, where }: { collection: string; where?: unknown }) => ({
      docs: table(collection).filter((d) => matches(d, where)),
    }),
    findByID: async ({ collection, id }: { collection: string; id: unknown }) =>
      table(collection).find((d) => String(d.id) === String(id)) ?? null,
  } as never
}

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

/* ------------------------------------------------------------ grouped refusals */

/*
 * A refusal must arrive as STRUCTURE, not as one joined paragraph.
 *
 * `decideTransition` used to end with `blocking.map(c => label + ': ' + detail).join('; ')`
 * and hand that to the operator: six unrelated problems in server-run order,
 * with nothing saying which tab any of them was on. The checks already carried
 * a stable id, a label, a severity and a detail; the last step flattened all of
 * it away. These assertions are the gate on that not happening again.
 */
{
  const every = summarize([
    fail('authz', 'authorization', 'no'),
    fail('brand', 'brand', 'no phone'),
    fail('lp-template-record', 'template', 'disabled'),
    fail('flow-reachable_consent', 'consent reachable', 'dead end'),
    fail('embedded-quiz-live', 'embedded quiz live', 'it is paused'),
    fail('destinations', 'destinations', 'not an object'),
    fail('pixels', 'pixels', 'not an object'),
    fail('domain-eligibility', 'domain', 'pending'),
    fail('path', 'path', 'taken'),
    fail('domain-ssl', 'certificate', 'not issued', 'warn'),
  ])
  const groups = groupPreflight(every)
  const byId = new Map(groups.map((g) => [g.group.id, g]))

  t(byId.get('general')?.blocking[0]?.id === 'authz', 'authorization is General')
  t(byId.get('brand')?.blocking[0]?.id === 'brand', 'brand completeness is Brand')
  t(byId.get('content')?.blocking[0]?.id === 'lp-template-record', 'the template record is Template & content')
  t(byId.get('quiz')?.blocking.length === 2, 'flow-* and embedded-* both land in Quiz flow — a computed id family must not need enumerating')
  t(byId.get('destinations')?.blocking[0]?.id === 'destinations', 'destinations are their own area')
  t(byId.get('tracking')?.blocking[0]?.id === 'pixels', 'pixels are Tracking, not General — a badge that points at the wrong tab is worse than no badge')
  t(byId.get('domain')?.blocking.length === 2, 'domain eligibility and the path are one area, because they are one URL')
  t(byId.get('domain')?.warnings[0]?.id === 'domain-ssl', 'a warning is grouped too, and kept apart from the blockers')

  const grouped = groups.reduce((n, g) => n + g.blocking.length + g.warnings.length, 0)
  t(grouped === every.blocking.length + every.warnings.length, 'EVERY failed check reaches a group — a check that blocks and appears nowhere refuses with no reason to act on')

  t(preflightGroupFor('an-id-nobody-mapped').id === 'general', 'an unmapped id falls back to General rather than being dropped')
  t(
    groups.map((g) => g.group.id).join(',') === PREFLIGHT_GROUPS.filter((m) => byId.has(m.id)).map((m) => m.id).join(','),
    'groups come back in repair order, not in the order the server happened to run the checks',
  )
  t(PREFLIGHT_GROUPS.every((g) => g.tab === 'general' || g.tab === 'destinations' || g.tab === 'tracking'), 'every group names a real editor tab, so a deep link cannot point at nothing')

  const verdict = decideTransition('draft', 'live', every)
  t(!verdict.ok && verdict.groups.length === byId.size, 'the refusal carries the groups, not just the joined string')
  t(!verdict.ok && verdict.summary.includes('Brand') && !verdict.summary.includes('no phone'), 'the summary names the AREAS and stops — restating every detail would rebuild the paragraph this replaced')
  t(!verdict.ok && verdict.error.includes('no phone'), 'the flat string is still there for the engineer-facing report and the audit trail')

  const legal = decideTransition('draft', 'paused', null)
  t(!legal.ok && Array.isArray(legal.groups) && legal.groups.length === 0, 'a refusal with no preflight behind it still carries an (empty) group list, so no caller has to special-case its shape')
}

/* --------------------------------------------------- saved is not published */

/*
 * The fingerprint is what makes "saved" and "published" two states on a table
 * that only stores one. A timestamp comparison cannot: publishing is itself an
 * UPDATE, so `updatedAt` and a `published_at` land microseconds apart.
 */
{
  const row = {
    id: 7,
    name: 'internal label',
    status: 'live',
    landing_page: 30,
    site: 1,
    domain: 4,
    path: '/c/mva',
    quiz: 9,
    content_overrides: { hero_headline: 'One', hero_sub: 'Two' },
    destination_overrides: null,
    utm: {},
    pixels: {},
  }
  const base = lpDeploymentFingerprint(row)

  t(lpDeploymentFingerprint({ ...row }) === base, 'the same row fingerprints the same')
  t(lpDeploymentFingerprint({ ...row, name: 'renamed' }) === base, 'an internal rename is not a content change')
  t(lpDeploymentFingerprint({ ...row, status: 'paused' }) === base, 'status is the OTHER axis and must not move the fingerprint, or pausing would read as an edit')
  t(lpDeploymentFingerprint({ ...row, updatedAt: 'later' }) === base, 'timestamps are not content')
  t(lpDeploymentFingerprint({ ...row, path: '/c/mva-2' }) !== base, 'the path is')
  t(lpDeploymentFingerprint({ ...row, content_overrides: { hero_headline: 'Changed', hero_sub: 'Two' } }) !== base, 'so is the copy')
  t(
    lpDeploymentFingerprint({ ...row, content_overrides: { hero_sub: 'Two', hero_headline: 'One' } }) === base,
    'key ORDER in a jsonb bag is not an edit — JSON.stringify preserves insertion order and Postgres does not',
  )
  t(lpDeploymentFingerprint({ ...row, domain: { id: 4 } }) === base, 'a populated relationship and a bare id are one row, so depth must not move the fingerprint')
  t(lpDeploymentFingerprint({ ...row, quiz_deployment_id: '' }) === base, "an empty text column and an absent one both mean 'not set'")

  t(lpPublishState({ ...row }).everPublished === false, 'a row with no stamp has never been published')
  t(lpPublishState({ ...row }).unverifiedChanges === false, 'and is NOT reported as edited-since-publish, or every new draft would carry the warning')
  const published = { ...row, last_published_at: '2026-08-14T10:00:00.000Z', published_fingerprint: base }
  t(lpPublishState(published).everPublished === true, 'a stamped row has been published')
  t(lpPublishState(published).unverifiedChanges === false, 'and matches what passed')
  t(lpPublishState({ ...published, path: '/c/moved' }).unverifiedChanges === true, 'an edit after publishing is unverified — this is the LIVE row serving something no check ever saw')
  t(lpPublishState({ ...published, status: 'draft' }).lastPublishedAt === '2026-08-14T10:00:00.000Z', 'unpublishing PRESERVES the last state that genuinely passed, which is the whole point of recording it')
}

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

/* ------------------------------- brand legal copy: WHERE the check reads it */
//
// The release blocker, as fixtures.
//
// `checkBrand` reached into the jsonb itself and read
// `brand_identity.defaultDisclaimer`. The Brand Identity editor writes
// `brand_identity.legal.defaultDisclaimer` — one level deeper — and
// `brand-map.ts` has always read it there, so the preflight and the renderer
// disagreed about the same brand. Every brand in production had filled the
// field in, every one of them reported "no legal disclaimer", and all eight
// live deployments failed re-publish. Because `decideTransition` gates only the
// way UP, unpublishing any of them would have been a one-way door.
//
// Confirmed against production on 2026-08-14: sites 12, 13 and 15 each have
// `brand_identity->'legal'->>'defaultDisclaimer'` populated and
// `legal_default_disclaimer` NULL.
//
// The fix routes the preflight through `brand-map`'s exported resolvers, so
// these cases pin the CONTRACT (any place the mapper looks is accepted) rather
// than one spelling of it.

const SITE_BASE = { id: 1, name: 'Acme', default_phone: '(800) 000-0000' }

const preflightWith = async (
  site: Record<string, unknown> | null,
  quiz: Record<string, unknown> = GOOD_QUIZ,
): Promise<{ r: PreflightResult; brand: PreflightCheck; consent: PreflightCheck }> => {
  const r = await quizDeploymentPreflight(CTX(), { deployment: GOOD_DEP, quiz, site, domain: null })
  const find = (id: string): PreflightCheck =>
    r.checks.find((c) => c.id === id) ?? fail(id, id, 'the check did not run at all')
  return { r, brand: find('brand'), consent: find('consent') }
}

{
  // THE production shape.
  const { brand } = await preflightWith({ ...SITE_BASE, brand_identity: { legal: { defaultDisclaimer: 'Attorney advertising. Not a law firm.' } } })
  t(brand.ok, `a disclaimer that exists ONLY at brand_identity.legal.defaultDisclaimer passes${brand.ok ? '' : ' — ' + brand.detail}`)
}
{
  const { brand } = await preflightWith({ ...SITE_BASE, legal_default_disclaimer: 'Attorney advertising.' })
  t(brand.ok, 'the flat legal_default_disclaimer column passes — that is the raw row shape')
}
{
  const { brand } = await preflightWith({ ...SITE_BASE, legal: { default_disclaimer: 'Attorney advertising.' } })
  t(brand.ok, "the legal group passes — that is the shape payload.findByID actually returns, and nothing read it before")
}
{
  const { brand } = await preflightWith({ ...SITE_BASE, default_disclaimer_md: 'Attorney advertising.' })
  t(brand.ok, 'the older site-wide default_disclaimer_md passes, because the public renderer prints it')
}
{
  const { brand } = await preflightWith({ ...SITE_BASE, brand_identity: { legal: { defaultDisclaimer: '   \n  ' } } })
  t(!brand.ok, 'a disclaimer of nothing but whitespace is not a disclaimer')
}
{
  const { brand } = await preflightWith(SITE_BASE)
  t(!brand.ok, 'a brand with the disclaimer in NONE of those places still FAILS — the check is corrected, not weakened')
  t(brand.detail === 'the brand has no legal disclaimer', `and says exactly that: "${brand.detail}"`)
}

/* ------------------------------------------ the refusal has to read as English */

{
  const { brand } = await preflightWith(SITE_BASE)
  t(!/\bno a\b/.test(brand.detail), 'the refusal never says "no a legal disclaimer" — the items no longer carry their own article')
}
{
  const { brand } = await preflightWith({ id: 1, name: 'Acme' })
  t(brand.detail === 'the brand has no phone number or legal disclaimer', `two missing things read as a pair: "${brand.detail}"`)
}
{
  const { brand } = await preflightWith({ id: 1 })
  t(
    brand.detail === 'the brand has no display name, phone number, or legal disclaimer',
    `three read as a list: "${brand.detail}"`,
  )
}
{
  // Display name and phone are NOT relaxed. They are only read from the right
  // place — including brand_identity.contact.callNumber, which is where a brand
  // whose number was typed into the funnel editor keeps it.
  const { brand } = await preflightWith({ ...SITE_BASE, default_phone: '', legal_default_disclaimer: 'x', brand_identity: { contact: { callNumber: '(800) 111-2222' } } })
  t(brand.ok, 'a phone number that only exists at brand_identity.contact.callNumber passes — it is the number the call button dials')
  const bare = await preflightWith({ ...SITE_BASE, default_phone: '', legal_default_disclaimer: 'x' })
  t(!bare.brand.ok && bare.brand.detail === 'the brand has no phone number', 'and a brand with no number anywhere still fails')
}

/* ------------------------------------- consent: the BRAND supplies the line */
//
// `PreviewQuestionCard` — the one card component the builder preview and the
// public runtime both render through — prints `brand.legal.tcpaText` on every
// form node. `checkReachableConsent` in the flow validator says so outright.
// Scanning only `quiz.nodes` therefore refused the platform's actual
// configuration: production quiz 2 carries no consent wording at all, runs under
// three brands, and each brand supplies its own TCPA text. Verified in a live
// browser — the visitor sees the line.
//
// `tcpaText` is removed from the form node rather than blanked, because the
// scan stringifies the whole node and the KEY alone contains "tcpa".

const SILENT_QUIZ = {
  ...GOOD_QUIZ,
  nodes: [
    { id: 'n1', stepKey: 'a', type: 'question', tiers: [], answers: [{ id: 'x', label: 'Yes', nextStepKey: 'b' }] },
    { id: 'n2', stepKey: 'b', type: 'form', tiers: [], answers: [{ id: 'y', label: 'Submit', nextStepKey: 'c' }] },
    { id: 'n3', stepKey: 'c', type: 'endpoint', tiers: [], answers: [] },
  ],
}

t(
  !JSON.stringify(SILENT_QUIZ.nodes).toLowerCase().includes('tcpa') &&
    !JSON.stringify(SILENT_QUIZ.nodes).toLowerCase().includes('consent'),
  'the fixture really is silent — no node mentions consent or TCPA, key names included',
)

{
  const site = { ...SITE_BASE, legal_default_disclaimer: 'Attorney advertising.', brand_identity: { legal: { tcpaText: 'By submitting this form, you consent to be contacted.' } } }
  const { r, consent } = await preflightWith(site, SILENT_QUIZ)
  t(consent.ok, `a flow with no consent wording of its own passes when the BRAND carries the TCPA text${consent.ok ? '' : ' — ' + consent.detail}`)
  t(r.ok, `and the deployment publishes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id + ':' + c.detail).join(', ')}`)
}
{
  const site = { ...SITE_BASE, legal_default_disclaimer: 'x', legal: { tcpa_text: 'By submitting this form, you consent to be contacted.' } }
  t((await preflightWith(site, SILENT_QUIZ)).consent.ok, "the Site's own legal.tcpa_text satisfies consent too")
}
{
  const site = { ...SITE_BASE, legal_default_disclaimer: 'x', legal_tcpa_text: 'By submitting this form, you consent to be contacted.' }
  t((await preflightWith(site, SILENT_QUIZ)).consent.ok, 'and so does the flat legal_tcpa_text column')
}
{
  const site = { ...SITE_BASE, legal_default_disclaimer: 'x' }
  const { consent } = await preflightWith(site, SILENT_QUIZ)
  t(!consent.ok, 'with NEITHER node-level consent nor brand TCPA text it still FAILS — nothing would be shown to anyone')
  t(consent.detail.includes('this brand has no TCPA text'), 'and the refusal names both halves, so the operator knows where to fix it')
}
{
  const { consent } = await preflightWith(null, SILENT_QUIZ)
  t(!consent.ok, 'a deployment whose Site could not be loaded cannot borrow a brand line it has no way to read')
}
{
  // Belt and braces: the node-level path is untouched. A quiz that writes its
  // own consent copy still passes under a brand that has none.
  const { consent } = await preflightWith({ ...SITE_BASE, legal_default_disclaimer: 'x' }, GOOD_QUIZ)
  t(consent.ok, "a flow carrying its own consent line passes under a brand with no TCPA text")
}

/* ------------------------------------------------- the whole blocker, end to end */

{
  // Site 12 as production holds it: name set, brand_display_name NULL, phone
  // set, every legal_* column NULL, all legal copy in brand_identity.legal —
  // running the brandless quiz that carries no consent wording. Before the fix
  // this failed both `brand` and `consent`, so re-publishing it was impossible.
  const PROD_SITE = {
    id: 12,
    name: 'Auto Claim Eval',
    default_phone: '4927464942',
    brand_identity: {
      legal: {
        defaultDisclaimer: 'Auto Claim Eval is an attorney advertising and legal referral service.',
        tcpaText: 'By submitting this form, you consent to be contacted by Auto Claim Eval.',
      },
    },
  }
  const { r } = await preflightWith(PROD_SITE, SILENT_QUIZ)
  t(r.ok, `a production-shaped brand and its brandless quiz publish${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id + ':' + c.detail).join(', ')}`)
  t(decideTransition('live', 'draft', r).ok && decideTransition('draft', 'live', r).ok, 'so taking it down is no longer a one-way door')
}

/* ------------------------------------------- landing-page quiz binding */
//
// The production defect, as fixtures. Three of four live LP deployments pointed
// at standalone quiz deployments that had been deleted; the rows looked bound
// and the pages had no funnel. Every state below existed or can exist, and the
// classifier is what the admin list, the preflight and the reconciliation
// report all read.

{
  const LP = (over: Record<string, unknown> = {}): Record<string, unknown> => {
    return { id: 1, site: 7, quiz: null, quiz_deployment_id: '', ...over }
  }
  const QD = (over: Record<string, unknown> = {}): Record<string, unknown> => {
    return { id: 11, site: 7, quiz: 70, template_id: 'sq_quiz_first', progress_form: null, ...over }
  }

  {
    const b = classifyLpQuizBinding(LP({ quiz: 70 }), null)
    t(b.verdict === 'flow', 'a deployment naming a flow is classified as bound to a flow')
    t(b.servesAQuiz, 'and serves a quiz')
    t(b.migration === null, 'and has nothing to migrate')
  }
  {
    // The pointer sits beside the flow, unread. Clearing it is lossless.
    const b = classifyLpQuizBinding(LP({ quiz: 70, quiz_deployment_id: '11' }), QD())
    t(b.verdict === 'flow', 'a flow binding wins over a legacy pointer beside it')
    t(b.migration?.quiz === '70', 'and the clean-up keeps the flow it already runs')
    t(b.migration?.quiz_deployment_id === '', 'and clears the pointer nothing reads')
  }
  {
    const b = classifyLpQuizBinding(LP(), null)
    t(b.verdict === 'unbound', 'a deployment with neither is unbound')
    t(!b.servesAQuiz, 'and serves nothing')
    t(b.migration === null, 'and is NOT migrated automatically: nothing knows what it should run')
  }
  {
    // The production case.
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), null)
    t(b.verdict === 'legacy-dangling', 'a pointer at a deployment that no longer exists is dangling')
    t(!b.servesAQuiz, 'and the page has no funnel, whatever the row looks like')
    t(b.migration === null, 'and is never repaired by guessing')
  }
  {
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD({ quiz: null }))
    t(b.verdict === 'legacy-dangling', 'a pointer at a deployment that names no flow is dangling too')
  }
  {
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD({ site: 9 }))
    t(b.verdict === 'legacy-cross-tenant', "a pointer at another brand's deployment is cross-tenant")
    t(!b.servesAQuiz, 'and serves nothing, because the resolver refuses it')
    t(b.migration === null, "and is never migrated: picking another brand's flow is how leads reach the wrong dashboard")
  }
  {
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD())
    t(b.verdict === 'legacy-migratable', 'a resolving same-tenant pointer with no extra config is migratable')
    t(b.migration?.quiz === '70', 'and migrates to the flow that deployment ran')
    t(b.migration?.embedded_quiz_template_id === 'sq_quiz_first', "and carries the standalone deployment's own skin across")
    t(b.servesAQuiz, 'and serves a quiz meanwhile')
  }
  {
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD({ progress_form: 'segmented' }))
    t(b.migration?.embedded_progress_form === 'segmented', 'and carries its progress treatment across')
  }
  for (const field of LOSSY_QUIZ_DEPLOYMENT_FIELDS) {
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD({ [field]: { a: 1 } }))
    t(b.verdict === 'legacy-needs-decision', `a standalone deployment carrying ${field} is NOT migrated automatically`)
    t(b.migration === null, `and ${field} is never silently dropped`)
  }
  {
    // Empty jsonb is not configuration. Treating `{}` as "carries destinations"
    // would make every row need a decision and the tool useless.
    const b = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD({ destination_overrides: {}, utm: [], pixels: null }))
    t(b.verdict === 'legacy-migratable', 'empty jsonb columns are not configuration')
  }
  {
    // Determinism: the same input twice must give the same answer, or a diff
    // between two reports means nothing.
    const a = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD())
    const c = classifyLpQuizBinding(LP({ quiz_deployment_id: '11' }), QD())
    t(JSON.stringify(a) === JSON.stringify(c), 'the classification is deterministic')
  }
  {
    const needs = ['legacy-dangling', 'legacy-cross-tenant', 'legacy-needs-decision', 'unbound']
    t(needs.every((v) => NEEDS_A_DECISION.has(v as never)), 'every verdict that cannot be automated is marked as needing a person')
    t(!NEEDS_A_DECISION.has('flow') && !NEEDS_A_DECISION.has('legacy-migratable'), 'and the two that can be are not')
  }
}

/* ------------------------------------------- the template must be AVAILABLE */

/*
 * Publishing is the moment the "disabled" decision gets enforced, and the only
 * moment. The render path deliberately ignores `is_enabled`, because disabling
 * a template is a statement about what NEW deployments may choose — not a
 * request to take every live page on it down. These four cases pin both halves
 * of that asymmetry from the publish side.
 */
{
  const r = await quizDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_DEP, template_id: 'sq_direct_panel' },
    quiz: GOOD_QUIZ, site: SITE, domain: null,
  })
  t(!r.ok, 'publishing onto a DISABLED quiz template is blocked')
  t(
    r.blocking.some((c) => c.id === 'quiz-template' && /disabled/.test(c.detail ?? '')),
    'and the refusal says the template is disabled, naming it',
  )
}

{
  const r = await quizDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_DEP, template_id: 'sq_no_such_skin' },
    quiz: GOOD_QUIZ, site: SITE, domain: null,
  })
  t(!r.ok, 'publishing onto a quiz template id that matches no record is blocked')
  t(
    r.blocking.some((c) => c.id === 'quiz-template' && (c.detail ?? '').includes('sq_no_such_skin')),
    'and the refusal names the id that is wrong, which is what an operator needs',
  )
}

{
  const r = await quizDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_DEP, template_id: '' },
    quiz: GOOD_QUIZ, site: SITE, domain: null,
  })
  t(!r.ok, 'publishing with NO quiz template selected is blocked')
}

{
  // A clone is a first-class template. The code registry cannot resolve its id
  // at all, so this case only passes because the preflight asks the record.
  const r = await quizDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_DEP, template_id: 'sq_case_dossier_copy_x1' },
    quiz: GOOD_QUIZ, site: SITE, domain: null,
  })
  t(r.ok, `a deployment on a CLONED quiz template publishes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id + ':' + c.detail).join(', ')}`)
}

/* ------------------------------------------------------- landing-page preflight */

const LP_TPL = PORTED_TEMPLATES[0]
const GOOD_LP = { id: 30, is_published: true, template_id: LP_TPL.slug, sections: [{ type: 'hero' }] }
const GOOD_LP_DEP = { id: 40, site: 1, landing_page: 30, domain: null, path: '/c/lp', status: 'draft', content_overrides: {}, quiz_deployment_id: '' }

// The twelve ported templates all draw a quiz card, and the live render replaces
// that drawing with the runtime. A deployment that names no flow therefore ships
// the card's EMPTY BOX where the funnel goes - worse than the static card it
// replaced, and the exact state a stale legacy pointer leaves a row in.
const GOOD_FLOW = { ...GOOD_QUIZ, id: 70, is_published: true, is_archived: false }
const BOUND_LP_DEP = { ...GOOD_LP_DEP, quiz: 70 }

{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, landing_page: 31 },
    landingPage: { id: 31, is_published: true, template_id: PORTED_TEMPLATES[1].slug, sections: [] },
    site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok, 'publishing onto a DISABLED landing-page template is blocked')
  t(
    r.blocking.some((c) => c.id === 'lp-template-record' && /disabled/.test(c.detail ?? '')),
    'and the refusal names the template and says it is disabled',
  )
}

{
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, landing_page: 9999 },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok, 'publishing onto a landing-page template row that no longer exists is blocked')
}

{
  /*
   * The TEMPLATE's own copy is validated too, not only the deployment's.
   *
   * The renderer is handed the merge of the two, so a template-level override
   * naming a dead slot would otherwise pass preflight and land silently in
   * `unknownOverrides` at render — where the public path passes no diagnostics
   * callback and nobody ever sees it.
   */
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: GOOD_LP_DEP,
    landingPage: { ...GOOD_LP, slot_overrides: { s99_headline_404: 'copy for a slot that does not exist' } },
    site: SITE, domain: null, quizDeployment: null, quiz: null,
  })
  t(!r.ok, "a TEMPLATE-level override naming a dead slot blocks publishing")
  t(r.blocking.some((c) => c.id === 'overrides'), 'and it is reported as an override problem')
}

{
  const r = await lpDeploymentPreflight(CTX(), { deployment: GOOD_LP_DEP, landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: null })
  t(!r.ok && r.blocking.some((c) => c.id === 'quiz-bound'), 'a landing-page deployment with NO quiz at all is refused')
  t(r.checks.some((c) => c.id === 'hydration'), 'and the renderer-hydration check still ran')
}
{
  const r = await lpDeploymentPreflight(CTX(), { deployment: BOUND_LP_DEP, landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_FLOW })
  t(r.ok, `a deployment that names a flow directly passes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
  t(r.checks.some((c) => c.id === 'quiz-bound' && c.ok), 'and the quiz-bound check is the one that cleared it')
}
{
  // The legacy binding still satisfies the rule while it resolves. It is a
  // migration fallback, not a defect, and refusing it would take four live
  // pages down to make a point about the data model.
  const legacyDep = { ...GOOD_LP_DEP, quiz_deployment_id: '55' }
  // `status: 'live'` because the renderer refuses a non-live borrowed
  // deployment (resolveQuizDeploymentById), so the preflight's
  // `embedded-quiz-live` check mirrors it. The point of this case is the
  // BINDING: a resolving legacy pointer still counts as bound.
  const legacyQuizDep = { id: 55, site: 1, quiz: 70, template_id: 'sq_editorial_inline', status: 'live' }
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: legacyDep, landingPage: GOOD_LP, site: SITE, domain: null,
    quizDeployment: legacyQuizDep, quiz: GOOD_FLOW,
  })
  t(r.checks.some((c) => c.id === 'quiz-bound' && c.ok), 'a legacy standalone-deployment pointer still counts as bound')
  t(r.ok, `and such a deployment publishes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
}
{
  // ...but only while it RESOLVES. A pointer at a deployment that no longer
  // exists is the production defect: the row looked bound and the page had no
  // funnel.
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...GOOD_LP_DEP, quiz_deployment_id: '9999' }, landingPage: GOOD_LP, site: SITE, domain: null,
    quizDeployment: null, quiz: null,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz'), 'a legacy pointer at a deployment that no longer exists is refused')
}
{
  const headline = LP_TPL.slots.find((s) => s.role === 'headline')!
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...BOUND_LP_DEP, content_overrides: { [headline.id]: 'A real headline' } },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_FLOW,
  })
  t(r.ok, `a deployment with valid overrides passes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
}
{
  // Copy written into the quiz card is copy the visitor never sees, because the
  // card is replaced. It must not be storable, and the preflight is the last
  // place that can say so.
  const inside = LP_TPL.quizMount.slotIds[0]
  const r = await lpDeploymentPreflight(CTX(), {
    deployment: { ...BOUND_LP_DEP, content_overrides: { [inside]: 'copy nobody will read' } },
    landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: GOOD_FLOW,
  })
  t(!r.ok && r.blocking.some((c) => c.id === 'overrides'), 'an override inside the quiz card is refused')
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

  // The canonical redirect target is the third place a domain gets served, and
  // the one that is easy to miss: gating only the host in hand still lets an
  // eligible host 307 every visitor onto a refused one.
  t(/primaryUsable/.test(body), 'the canonical primary is checked for eligibility as well')
  t(
    /const redirectTo = primaryUsable && /.test(body),
    'and an ineligible primary is never used as a redirect target',
  )
  t(
    /const primaryHost = primaryUsable \? \(primaryDoc\?\.host \?\? null\) : host/.test(body),
    'an ineligible primary is not advertised as the canonical host either',
  )
}

/* ------------------------------------------------------------------ report */

/* ------------------------------------------- adversarial: the quiz binding */

{
  const FLOW = { ...GOOD_QUIZ, id: 70, is_published: true, is_archived: false }
  const LP_DEP = { id: 40, site: 1, landing_page: 30, domain: null, path: '/c/lp', status: 'draft', content_overrides: {}, quiz_deployment_id: '' }

  {
    // A row that names a flow AND carries a stale cross-tenant pointer beside it
    // publishes: the resolver reads the flow and never looks at the pointer, so
    // refusing here would block a page that works.
    const r = await lpDeploymentPreflight(CTX(), {
      deployment: { ...LP_DEP, quiz: 70, quiz_deployment_id: '55' },
      landingPage: GOOD_LP, site: SITE, domain: null,
      quizDeployment: { id: 55, site: 999, quiz: 70 }, quiz: FLOW,
    })
    t(r.ok, `a flow binding beside a stale cross-tenant pointer still publishes${r.ok ? '' : ' — ' + r.blocking.map((c) => c.id).join(',')}`)
  }
  {
    // With NO flow, that same pointer is the binding, and it belongs to somebody
    // else. This is one brand's page delivering leads to another brand's
    // destinations.
    const r = await lpDeploymentPreflight(CTX(), {
      deployment: { ...LP_DEP, quiz_deployment_id: '55' },
      landingPage: GOOD_LP, site: SITE, domain: null,
      quizDeployment: { id: 55, site: 999, quiz: 70, template_id: 'sq_editorial_inline' }, quiz: FLOW,
    })
    t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz-tenant'), "a cross-tenant legacy pointer is refused as the binding")
  }
  {
    const r = await lpDeploymentPreflight(CTX(), {
      deployment: { ...LP_DEP, quiz: 70 }, landingPage: GOOD_LP, site: SITE, domain: null,
      quizDeployment: null, quiz: { ...FLOW, is_archived: true },
    })
    t(!r.ok && r.blocking.some((c) => c.id === 'embedded-flow-published'), 'an ARCHIVED flow cannot be published behind a landing page')
  }
  {
    const r = await lpDeploymentPreflight(CTX(), {
      deployment: { ...LP_DEP, quiz: 70 }, landingPage: GOOD_LP, site: SITE, domain: null,
      quizDeployment: null, quiz: { ...FLOW, is_published: false },
    })
    t(!r.ok && r.blocking.some((c) => c.id === 'embedded-flow-published'), 'and neither can an unpublished one')
  }
  {
    // An embedded skin that names no template must not reach a live page: the
    // registry would fall back and the operator would never know which skin
    // they got.
    const r = await lpDeploymentPreflight(CTX(), {
      deployment: { ...LP_DEP, quiz: 70, embedded_quiz_template_id: 'sq_not_a_template' },
      landingPage: GOOD_LP, site: SITE, domain: null, quizDeployment: null, quiz: FLOW,
    })
    t(!r.ok && r.blocking.some((c) => c.id === 'embedded-quiz-template'), 'an embedded skin that names no template is refused')
  }
}

/* --- the preflight must resolve a legacy template alias the way the renderer does --- */
{
  // Production stores `default` as template_id on two live quiz deployments.
  // The renderer maps it through LEGACY_TEMPLATE_IDS; the preflight looked the
  // RAW value up and reported "matches no quiz template", so a page that served
  // fine could not be re-published — a one-way door on a healthy row.
  const c = canonicalTemplateId('quiz', 'default')
  t(c.ok === true, 'legacy quiz alias "default" canonicalises')
  t(c.ok && c.id === 'sq_quiz_first', 'legacy alias resolves to sq_quiz_first')

  const src = readFileSync(new URL('../src/lib/publish-lifecycle.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('const checkQuizTemplateRecord'), src.indexOf('const checkLpTemplateRecord'))
  t(fn.indexOf('getQuizTemplateRecordByTemplateId(payload, stored)') < fn.indexOf("canonicalTemplateId('quiz'"),
    'checkQuizTemplateRecord tries the RAW id first (clones and AI ids are records, not registry entries)')
  t(fn.includes('getQuizTemplateRecordByTemplateId(payload, canonical.id)'),
    'and falls back to the canonical alias when the raw id misses')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
if (passed === 0) { console.log('no assertions ran'); process.exit(2) }
