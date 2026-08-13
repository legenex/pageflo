/**
 * Assertions for the central template registry.
 *
 *   pnpm test:registry
 *
 * The gate this file exists for is stated in the prompt that asked for the
 * registry and is easy to lose: **it must fail if the registry is empty**, and
 * it must fail if the counts move. A resolver that answers every question with
 * the first template in the list passes any test that only asks "did I get a
 * template back", which is exactly how the silent fallbacks survived.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  listQuizTemplates,
  listLpTemplates,
  listLegacyLpTemplates,
  listAllLpTemplates,
  listTemplates,
  resolveTemplate,
  resolveForRender,
  canonicalTemplateId,
  recommendedQuizTemplateFor,
  registryHealth,
  reportTemplateFallback,
  TEMPLATE_ALIASES,
  EXPECTED_QUIZ_TEMPLATE_COUNT,
  EXPECTED_LP_TEMPLATE_COUNT,
} from '../src/lib/template-registry.ts'
import { QUIZ_TEMPLATES } from '../src/lib/quiz-templates/model.ts'
import * as quizModel from '../src/lib/quiz-templates/model.ts'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'
import { LP_IDENTITIES } from '../src/lib/lp-identities/index.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

// --- the registry is populated ----------------------------------------------

const quiz = listQuizTemplates()
const lp = listLpTemplates()

t(quiz.length === EXPECTED_QUIZ_TEMPLATE_COUNT, `exactly ${EXPECTED_QUIZ_TEMPLATE_COUNT} quiz templates (found ${quiz.length})`)
t(lp.length === EXPECTED_LP_TEMPLATE_COUNT, `exactly ${EXPECTED_LP_TEMPLATE_COUNT} landing-page templates (found ${lp.length})`)
t(quiz.length > 0, 'the quiz registry is not empty - an empty registry must never report success')
t(lp.length > 0, 'the landing-page registry is not empty')

{
  const h = registryHealth()
  t(h.ok, 'registryHealth reports no problems' + (h.ok ? '' : ': ' + h.problems.join('; ')))
}

// Every entry carries what a library card has to show.
t(quiz.every((x) => x.id && x.code && x.name && x.blurb), 'every quiz template has id, code, name and blurb')
t(
  lp.every((x) => x.id && x.code && x.name && x.family && x.channels && x.quizPlacement && x.ground),
  'every LP template has id, code, name, family, channels, quiz placement and ground',
)
t(lp.every((x) => x.recommendedQuizTemplateId), 'every LP template names a recommended embedded quiz template')

// A recommendation that does not resolve is worse than none.
t(
  lp.every((x) => resolveTemplate('quiz', x.recommendedQuizTemplateId).ok),
  'every recommended quiz template id actually resolves',
)

// --- strict resolution ------------------------------------------------------

t(resolveTemplate('quiz', 'sq_deadline_timeline').ok, 'a real quiz id resolves')
t(resolveTemplate('lp', 'authority_network').ok, 'a real LP id resolves')

{
  const r = resolveTemplate('quiz', 'sq_typo')
  t(!r.ok, 'an unknown quiz id FAILS rather than silently returning sq_editorial_inline')
  t(!r.ok && /sq_typo/.test(r.error), 'the failure names the id that was asked for, so the report is actionable')
}
{
  const r = resolveTemplate('lp', 'no_such_template')
  t(!r.ok, 'an unknown LP id FAILS rather than silently returning TEMPLATES[0]')
  t(!r.ok && /no_such_template/.test(r.error), 'the LP failure names the id too')
}

t(!resolveTemplate('quiz', '').ok, 'an empty id fails')
t(!resolveTemplate('quiz', '   ').ok, 'a whitespace id fails')
t(!resolveTemplate('quiz', null).ok, 'a null id fails')
t(!resolveTemplate('quiz', undefined).ok, 'an undefined id fails')
t(!resolveTemplate('quiz', 42).ok, 'a non-string id fails')
t(resolveTemplate('quiz', '  sq_quiz_first  ').ok, 'a padded id is trimmed rather than rejected - it arrives that way from form posts')

// Cross-kind lookups must not resolve.
t(!resolveTemplate('lp', 'sq_deadline_timeline').ok, 'a quiz id does not resolve as an LP template')
t(!resolveTemplate('quiz', 'authority_network').ok, 'an LP id does not resolve as a quiz template')

// --- aliases ----------------------------------------------------------------
//
// Every alias is asserted, because three live quiz deployments are still on
// 'default'. A fallback that happens to land somewhere reasonable is not the
// same as a mapping somebody chose.

for (const [from, to] of Object.entries(TEMPLATE_ALIASES.quiz)) {
  const r = resolveTemplate('quiz', from)
  t(r.ok && r.template.id === to, `quiz alias "${from}" resolves to "${to}"`)
  t(r.ok && r.usedAlias === from, `quiz alias "${from}" reports that an alias was used`)
}
for (const [from, to] of Object.entries(TEMPLATE_ALIASES.lp)) {
  const r = resolveTemplate('lp', from)
  t(r.ok && r.template.id === to, `LP alias "${from}" resolves to "${to}"`)
}

// The specific one that matters: the stored default on every LP row.
{
  const r = resolveTemplate('lp', 'bold_modern')
  t(r.ok, "'bold_modern' - the collection default on every funnel-landing-pages row - now resolves instead of falling through")
}

// A real id is not reported as an alias.
t(resolveTemplate('quiz', 'sq_card_deck').ok && resolveTemplate('quiz', 'sq_card_deck').ok === true, 'a canonical id resolves')
{
  const r = resolveTemplate('quiz', 'sq_card_deck')
  t(r.ok && r.usedAlias === null, 'a canonical id reports no alias')
}

// --- render resolution ------------------------------------------------------
//
// The render path still produces a template. What changed is that it says when
// it guessed.

{
  const r = resolveForRender('quiz', 'sq_deadline_timeline')
  t(!r.usedFallback && r.template.id === 'sq_deadline_timeline', 'a good id renders itself and reports no fallback')
  t(r.error === null, 'a good id carries no error')
}
{
  const r = resolveForRender('quiz', 'sq_typo')
  t(r.usedFallback === true, 'a bad id DOES fall back, because a visitor must not get a 500 over a database row')
  t(r.requestedId === 'sq_typo', 'and it reports which id failed - a fallback nobody can observe is a template choice nobody made')
  t(typeof r.error === 'string' && r.error.length > 0, 'and why')
  t(Boolean(r.template), 'and still yields a template to draw')
}
{
  const r = resolveForRender('lp', 'nope')
  t(r.usedFallback === true && Boolean(r.template), 'the LP render path behaves the same way')
}

// --- recommendations --------------------------------------------------------

t(recommendedQuizTemplateFor('deadline_signal') === 'sq_deadline_timeline', 'the deadline LP recommends the deadline quiz skin')
t(recommendedQuizTemplateFor('quiz_first') === 'sq_quiz_first', 'the quiz-first LP recommends the quiz-first skin')
t(resolveTemplate('quiz', recommendedQuizTemplateFor('nonexistent_lp')).ok, 'an unknown LP still yields a resolvable neutral recommendation rather than an empty string')

// --- listTemplates ----------------------------------------------------------

t(listTemplates('quiz').length === quiz.length, 'listTemplates(quiz) matches listQuizTemplates')
t(listTemplates('lp').length === lp.length, 'listTemplates(lp) matches listLpTemplates')
t(listTemplates('quiz').every((x) => x.kind === 'quiz'), 'every quiz entry is tagged as one, so the union discriminates')
t(listTemplates('lp').every((x) => x.kind === 'lp'), 'every LP entry is tagged as one')

// --- the legacy identity templates ------------------------------------------
//
// Four landing-page templates predate the twelve. They render through a
// different code path (nodes + an identity, not ported markup), they are what
// the AI wizard builds into, and they are stored on real rows. They are
// REGISTERED rather than aliased, because an alias would silently move those
// pages onto markup that has no copy for them.

{
  const legacy = listLegacyLpTemplates()
  t(legacy.length === LP_IDENTITIES.length, `every identity is registered (${legacy.length} of ${LP_IDENTITIES.length})`)
  t(legacy.every((x) => x.renderer === 'identity'), 'a legacy template names the identity renderer')
  t(legacy.every((x) => x.stock === false), 'a legacy template is never offered as stock')
  t(legacy.every((x) => x.identityId), 'a legacy template names its identity')
  t(legacy.every((x) => x.template === null), 'a legacy template carries no ported markup')
  t(listLpTemplates().every((x) => x.stock === true), 'every one of the twelve is stock')
  t(listLpTemplates().every((x) => x.renderer === 'ported'), 'every one of the twelve renders as ported markup')
  t(listLpTemplates().every((x) => x.template !== null), 'every one of the twelve carries its markup')
}

for (const identity of LP_IDENTITIES) {
  const r = resolveTemplate('lp', identity.id)
  t(r.ok, `the legacy identity template "${identity.id}" still resolves - pages are stored on it`)
  t(r.ok && r.template.kind === 'lp' && r.template.stock === false, `"${identity.id}" resolves as non-stock`)
}

// The count the library advertises must not include them.
t(listLpTemplates().length === EXPECTED_LP_TEMPLATE_COUNT, 'the stock library is exactly the twelve, legacy excluded')
t(
  listAllLpTemplates().length === EXPECTED_LP_TEMPLATE_COUNT + LP_IDENTITIES.length,
  'the resolvable id space is the twelve plus the four',
)

// --- canonicalisation -------------------------------------------------------

t(canonicalTemplateId('lp', 'bold_modern').ok, "the stored default 'bold_modern' canonicalises")
{
  // NOT `editorial_investigation_v2`, which is what `templateFor` returned and
  // therefore what the builder LABELLED it. The RENDER branched separately on
  // the raw id: `isPortedTemplate('bold_modern')` was false, so the page took
  // the node path and drew the operator's own authored sections under identity
  // `a`. Aliasing to a ported template would have replaced every such page's
  // real copy with stock reference copy - including a seeded page that is
  // published and deployed live. An adversarial pass caught this.
  const c = canonicalTemplateId('lp', 'bold_modern')
  t(c.ok && c.id === 'a', "'bold_modern' canonicalises to the LEGACY IDENTITY template, which is what it actually rendered as")
  const r = resolveTemplate('lp', 'bold_modern')
  t(r.ok && r.template.kind === 'lp' && r.template.renderer === 'identity', 'and so it keeps the node render path, not the ported one')
  t(r.ok && r.template.kind === 'lp' && r.template.stock === false, 'and is not offered as a stock template')
}
{
  const c = canonicalTemplateId('quiz', 'default')
  t(c.ok && c.id === 'sq_quiz_first', "the legacy quiz id 'default' canonicalises forward")
}
{
  const c = canonicalTemplateId('quiz', 'sq_card_deck')
  t(c.ok && c.id === 'sq_card_deck', 'a canonical id canonicalises to itself')
}
t(!canonicalTemplateId('quiz', 'sq_nope').ok, 'an unknown id does not canonicalise - the save must refuse')
t(!canonicalTemplateId('lp', '').ok, 'an empty id does not canonicalise')

// --- no hidden second registry ----------------------------------------------
//
// This is the gate the prompt asked for and the hardest one to keep. Every
// silent fallback that shipped was a SECOND resolver sitting next to the data
// it resolved, within reach of every caller. Deleting them is not enough; the
// test has to fail when one comes back.

/** The registry's id space must be exactly the union of the source libraries. */
{
  const registryQuiz = new Set(listQuizTemplates().map((x) => x.id))
  const libraryQuiz = new Set(QUIZ_TEMPLATES.map((x) => x.id))
  t(
    registryQuiz.size === libraryQuiz.size && [...libraryQuiz].every((id) => registryQuiz.has(id)),
    'the quiz registry holds exactly the library, no more and no fewer',
  )

  const registryLp = new Set(listAllLpTemplates().map((x) => x.id))
  const libraryLp = new Set([...PORTED_TEMPLATES.map((x) => x.slug), ...LP_IDENTITIES.map((x) => x.id)])
  t(
    registryLp.size === libraryLp.size && [...libraryLp].every((id) => registryLp.has(id)),
    'the LP registry holds exactly the ported twelve plus the four identities',
  )
}

/** Every id a real row can hold must resolve through the ONE resolver. */
{
  const everyStoredIdResolves = [
    ...QUIZ_TEMPLATES.map((x) => ['quiz', x.id] as const),
    ...Object.keys(TEMPLATE_ALIASES.quiz).map((x) => ['quiz', x] as const),
    ...PORTED_TEMPLATES.map((x) => ['lp', x.slug] as const),
    ...LP_IDENTITIES.map((x) => ['lp', x.id] as const),
    ...Object.keys(TEMPLATE_ALIASES.lp).map((x) => ['lp', x] as const),
  ].every(([kind, id]) => resolveTemplate(kind, id).ok)
  t(everyStoredIdResolves, 'every id any row can legitimately hold resolves strictly')
}

/**
 * Every template id this repo SHIPS must resolve.
 *
 * The seeds carried three ids that named nothing (`bold_modern`,
 * `classic_authority`, `editorial_investigation`), so every sample landing page
 * was created pointing at a template that did not exist and rendered as
 * TEMPLATES[0]. A registry that only guards operator input would not have caught
 * that: the bad ids were in the repository.
 *
 * The sample landing PAGES no longer exist — a page and a template are one
 * object now — so what is checked here is the starter deployments, which name a
 * stock template directly.
 */
{
  const copy = await import('../src/components/builder/lp/section-copy.ts')
  t(
    !('SAMPLE_LANDING_PAGES' in copy),
    'nothing exports SAMPLE_LANDING_PAGES any more — sample pages are not seeded',
  )

  const { SAMPLE_LP_DEPLOYMENTS, RETIRED_SAMPLE_LANDING_PAGES } = copy
  t(SAMPLE_LP_DEPLOYMENTS.length > 0, 'there are starter deployments to check')
  for (const d of SAMPLE_LP_DEPLOYMENTS) {
    const res = resolveTemplate('lp', d.templateKey)
    t(res.ok, `starter deployment "${d.name}" names a template that resolves (${d.templateKey})`)
    // Must be one of the TWELVE, not a legacy identity id: a starter binds to
    // the stock library, and `ensureTemplateRecords` only materialises those.
    t(
      res.ok && res.template.kind === 'lp' && res.template.stock,
      `starter deployment "${d.name}" names a STOCK template (${d.templateKey})`,
    )
  }

  // The retirement table has to keep naming real templates: `retireSampleLandingPages`
  // repoints a sample's deployments onto the stock row for the SAME renderer,
  // and an id that resolves to nothing would leave the sample in place forever.
  for (const s of RETIRED_SAMPLE_LANDING_PAGES) {
    t(
      resolveTemplate('lp', s.template_id).ok,
      `retired sample "${s.slug}" names a template that still resolves (${s.template_id})`,
    )
  }

  const collections = readFileSync(new URL('../src/collections/FunnelLandingPages.ts', import.meta.url).pathname, 'utf8')
  const lpDefault = collections.match(/name: 'template_id'[^}]*defaultValue: '([^']+)'/)?.[1]
  t(Boolean(lpDefault) && resolveTemplate('lp', lpDefault!).ok, `the landing-page collection default resolves (${lpDefault})`)
  const quizCollections = readFileSync(new URL('../src/collections/FunnelQuizDeployments.ts', import.meta.url).pathname, 'utf8')
  const quizDefault = quizCollections.match(/name: 'template_id'[^}]*defaultValue: '([^']+)'/)?.[1]
  t(Boolean(quizDefault) && resolveTemplate('quiz', quizDefault!).ok, `the quiz deployment collection default resolves (${quizDefault})`)
}

/** The removed resolver must stay removed. */
t(
  !('resolveQuizTemplate' in quizModel),
  'quiz-templates/model.ts exports no resolver - it is data, and resolution is the registry',
)

/** No module outside the registry may index the raw lookup tables. */
{
  const SRC = new URL('../src/', import.meta.url).pathname
  const ALLOWED = ['lib/template-registry.ts']
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx|mts)$/.test(e)) out.push(p)
    }
    return out
  }
  const files = walk(SRC)
  t(files.length > 100, `the scan actually walked the tree (${files.length} files) - an empty scan passes everything`)

  // Indexing a lookup table is how a second resolver starts: one `?? DEFAULT`
  // beside it and there are two answers to "what does this id mean".
  const RAW_TABLE = /\b(QUIZ_TEMPLATE_BY_ID|PORTED_BY_SLUG|LEGACY_TEMPLATE_IDS)\s*[[.]/
  const offenders: string[] = []
  for (const f of files) {
    const rel = f.slice(SRC.length)
    if (ALLOWED.includes(rel)) continue
    const src = readFileSync(f, 'utf8')
    for (const [i, line] of src.split('\n').entries()) {
      // Comments are allowed to name them; the point is that nothing CALLS them.
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
      if (RAW_TABLE.test(code)) offenders.push(`${rel}:${i + 1}`)
    }
  }
  t(offenders.length === 0, `no module outside the registry indexes a raw template table (found: ${offenders.join(', ')})`)

  // The two render seams must resolve through the registry, not around it.
  const lpRender = readFileSync(join(SRC, 'components/builder/lp/render.tsx'), 'utf8')
  t(/resolveForRender\(\s*'lp'/.test(lpRender), "the LP builder's templateFor resolves through the registry")
  const quizTheme = readFileSync(join(SRC, 'lib/quiz-theme.ts'), 'utf8')
  t(/resolveForRender\(\s*'quiz'/.test(quizTheme), 'quiz-theme resolves through the registry')
  const quizDep = readFileSync(join(SRC, 'lib/quiz-deployment.ts'), 'utf8')
  t(/resolveForRender\(\s*'quiz'/.test(quizDep), 'the public quiz deployment resolver goes through the registry')
  const lpDep = readFileSync(join(SRC, 'lib/lp-deployment.ts'), 'utf8')
  t(/resolveForRender\(\s*'lp'/.test(lpDep), 'the public LP deployment resolver goes through the registry')

  // The save paths must refuse, not canonicalise-or-shrug.
  const quizActions = readFileSync(join(SRC, 'app/(app)/admin/(top)/quizzes/actions.ts'), 'utf8')
  t(/canonicalTemplateId\(\s*'quiz'/.test(quizActions), 'saving a quiz deployment validates its template id')
  t(/if\s*\(!template\.ok\)\s*return/.test(quizActions), 'and refuses the save when it does not resolve')
  const lpActions = readFileSync(join(SRC, 'app/(app)/admin/(top)/landing-pages/actions.ts'), 'utf8')
  t(/canonicalTemplateId\(\s*'lp'/.test(lpActions), 'saving a landing page validates its template id')
  t(/if\s*\(!template\.ok\)\s*return/.test(lpActions), 'and refuses the save when it does not resolve')
}

// --- the fallback is observable ---------------------------------------------

{
  const seen: string[] = []
  const original = console.warn
  console.warn = (...a: unknown[]) => { seen.push(a.join(' ')) }
  try {
    reportTemplateFallback('unit test', resolveForRender('quiz', 'sq_definitely_not_real'))
    reportTemplateFallback('unit test', resolveForRender('quiz', 'sq_card_deck'))
  } finally {
    console.warn = original
  }
  t(seen.length === 1, 'a fallback is reported exactly once and a clean resolution is silent')
  t(seen[0]?.includes('sq_definitely_not_real'), 'the report names the id that failed')
  t(seen[0]?.includes('unit test'), 'and the context it failed in, so it can be traced to a record')
}

// --- preflight --------------------------------------------------------------

{
  const { checkTemplateResolves, checkNoTemplateFallback, summarize } = await import('../src/lib/publish-preflight.ts')

  t(checkTemplateResolves('quiz', 'sq_card_deck').ok, 'preflight passes a real quiz template')
  t(!checkTemplateResolves('quiz', 'sq_nope').ok, 'preflight FAILS an unknown quiz template - publishing must not fall back')
  t(checkTemplateResolves('lp', 'bold_modern').ok, 'preflight accepts an explicit alias')
  t(!checkTemplateResolves('lp', 'nope').ok, 'preflight fails an unknown LP template')
  t(checkTemplateResolves('quiz', 'sq_nope').severity === 'block', 'an unresolvable template BLOCKS rather than warns')

  t(checkNoTemplateFallback({ templateFellBack: false }).ok, 'preflight passes a record that did not fall back')
  t(!checkNoTemplateFallback({ templateFellBack: true, requestedTemplateId: 'ghost' }).ok, 'preflight fails a record that did')
  t(
    checkNoTemplateFallback({ templateFellBack: true, requestedTemplateId: 'ghost' }).detail.includes('ghost'),
    'and names the id that was stored',
  )

  const s = summarize([
    checkTemplateResolves('quiz', 'sq_card_deck'),
    checkTemplateResolves('lp', 'nope'),
  ])
  t(!s.ok, 'a summary with a failed blocking check is not ok')
  t(s.blocking.length === 1 && s.warnings.length === 0, 'and separates blocking from warning')
  t(summarize([]).ok, 'an empty check list is vacuously ok - callers must supply checks, and the suite asserts they do')
  t(summarize([checkTemplateResolves('quiz', 'sq_card_deck')]).ok, 'a summary of passing checks is ok')
}

// --- report -----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
