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
import {
  listQuizTemplates,
  listLpTemplates,
  listTemplates,
  resolveTemplate,
  resolveForRender,
  recommendedQuizTemplateFor,
  registryHealth,
  TEMPLATE_ALIASES,
  EXPECTED_QUIZ_TEMPLATE_COUNT,
  EXPECTED_LP_TEMPLATE_COUNT,
} from '../src/lib/template-registry.ts'

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

// --- report -----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
