/**
 * Templates-as-records: the properties that keep it ONE library.
 *
 *   pnpm test:records
 *
 * Database-free. Everything here is either a pure mapping, a pure rule, or a
 * scan of the source tree — which is deliberate, because the defect this whole
 * change repairs was architectural rather than behavioural. Landing Pages had a
 * `Pages` tab backed by rows and a `Templates` tab backed by a code catalogue,
 * and every individual behaviour on both tabs worked. What was wrong was that
 * there were two of them.
 *
 * So the load-bearing assertion in this file is not about output. It is
 * "one library, one direction": a surface that lists what an operator may
 * DEPLOY must read records, not the code library. If one reads code, the
 * duplication is back and every other test still passes.
 *
 * The rule is per-purpose rather than blanket, because "which renderer draws
 * this" is a genuinely different question from "which template may I deploy"
 * and only the second one has an answer a database can hold.
 *
 * The renderer-identity acceptance conditions — save template A, render, prove
 * A was used — need a database and live in `scripts/test-renderer-identity.mts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { toLpRecord, toQuizRecord } from '../src/lib/template-records/index.ts'
import { selectabilityProblem, isSelectable } from '../src/lib/template-records/model.ts'
import { validateStoredQuizTemplateId, QUIZ_TEMPLATE_ID_PATTERN } from '../src/lib/template-records/id.ts'
import { isUnmodifiedSampleSections } from '../src/lib/template-records/samples.ts'
import {
  listLpTemplates,
  listQuizTemplates,
  EXPECTED_LP_TEMPLATE_COUNT,
  EXPECTED_QUIZ_TEMPLATE_COUNT,
} from '../src/lib/template-registry.ts'
import {
  RETIRED_SAMPLE_LANDING_PAGES,
  SEED_SECTION_COPY,
  DEFAULT_SECTION_ORDER,
} from '../src/components/builder/lp/section-copy.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const SRC = new URL('../src/', import.meta.url).pathname

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mts)$/.test(entry)) out.push(full)
  }
  return out
}
const ALL_SRC = walk(SRC)
const read = (f: string): string => readFileSync(f, 'utf8')

/**
 * Source with comments removed.
 *
 * Every assertion below that scans the tree is about what the CODE does, and
 * the first version of this file failed twice on its own documentation — a
 * comment explaining that `listLpTemplates()` must not be called counted as
 * calling it, and the note recording why "MVA Pain First" was retired counted
 * as seeding it. A rule that punishes writing down the reason is a rule people
 * delete the reason to satisfy.
 *
 * Crude on purpose: it does not understand strings containing `//`, which is
 * fine because nothing here searches for a URL.
 */
const code = (f: string): string =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/* ------------------------------------------------- one library, one direction */

/**
 * The rule that makes this a correction rather than a third template system.
 *
 *      product surfaces -> template records (DB) -> template registry (code)
 *
 * A surface that lists deployable templates out of the code library builds a
 * catalogue beside the records, and the two disagree the moment anybody
 * disables or clones anything.
 */
{
  /*
   * Two different questions, and only one of them may be answered from code.
   *
   *   "which TEMPLATE may I deploy"  -> records. There is one library and an
   *                                     operator can disable, clone and delete
   *                                     what is in it.
   *   "which RENDERER draws this"    -> code. The twelve ports and the four
   *                                     identities are generated design assets;
   *                                     a database row cannot add one.
   *
   * So a code catalogue in a product surface is not automatically the
   * duplication being repaired — it is duplication when it answers the FIRST
   * question. The allow-list below is therefore per-file AND per-purpose, and
   * each entry says which question it answers.
   */
  const CATALOGUES = /\b(listLpTemplates|listQuizTemplates|listAllLpTemplates|listLegacyLpTemplates|listTemplates|GALLERY_TEMPLATES|SKELETON_TEMPLATES|PORTED_TEMPLATES|QUIZ_TEMPLATES)\b/

  const ALLOWED: Array<[string, string]> = [
    ['src/lib/template-records/', 'materialises the records FROM the code library — this is the seam'],
    ['src/lib/template-registry.ts', 'is the code library'],
    ['src/lib/quiz-templates/', 'is the code library'],
    ['src/lib/lp-templates/', 'is the code library'],
    ['src/lib/quiz-theme.ts', 'themes a renderer, never selects a template'],
    ['src/components/builder/lp/render.tsx', 'maps renderer ids to their draw functions'],
    ['src/components/builder/quiz/config.tsx', 'exposes renderer option tables'],
    ['src/components/builder/quiz/templates.tsx', 'draws a renderer'],
    ['src/components/builder/quiz/TemplatePreview.tsx', 'draws a renderer'],
    ['src/components/builder/templates/TemplateGallery.tsx', 'resolves a record to its renderer for preview'],
    ['src/components/builder/quiz/QuizTemplatesPanel.tsx', 'offers the RENDERER choice when creating or editing a template record'],
    ['src/lib/ai-content/quiz-template.ts', 'constrains the AI proposal to the closed set of code renderers — a renderer question, not "what may I deploy"'],
    ['src/components/builder/lp/LandingPagesApp.tsx', 'offers the RENDERER choice in "which design draws this template"'],
    ['src/components/public/quiz/QuizRuntime.tsx', 'draws a renderer'],
  ]

  const offenders = ALL_SRC.filter((f) => {
    const rel = f.slice(f.indexOf('/src/') + 1)
    if (ALLOWED.some(([a]) => rel.startsWith(a))) return false
    return CATALOGUES.test(code(f))
  })

  t(
    offenders.length === 0,
    `no unlisted surface builds a template catalogue from code (found: ${offenders.map((f) => f.split('/src/')[1]).join(', ') || 'none'})`,
  )

  /*
   * The allow-list must not rot into a place things get added to. Every entry
   * has to still be a real file, so deleting one fails here rather than quietly
   * widening the rule.
   */
  for (const [path, why] of ALLOWED) {
    const exists = path.endsWith('/')
      ? ALL_SRC.some((f) => f.includes(`/${path}`))
      : ALL_SRC.some((f) => f.endsWith(path.slice(path.lastIndexOf('src/') + 4)))
    t(exists, `the code-catalogue allowance for ${path} still names a real file (${why})`)
  }

  /*
   * The two DEPLOYMENT surfaces are the ones that must never reach code. They
   * are where an operator picks what goes live, so a code catalogue there is
   * exactly the defect: a list that cannot be disabled, cloned or deleted,
   * offered as if it could.
   */
  for (const f of ['src/components/builder/lp/LPDeploymentEditor.tsx', 'src/components/builder/quiz/QuizBuilderApp.tsx']) {
    const src = code(join(SRC, f.slice(4)))
    t(!CATALOGUES.test(src), `${f.split('/').pop()} picks templates from records only`)
  }

  // The specific component that used to answer the first question from code.
  t(
    !ALL_SRC.some((f) => f.endsWith('templates/TemplateLibrary.tsx')),
    'TemplateLibrary — the browse-only catalogue nothing could select — is gone',
  )
  t(
    ALL_SRC.some((f) => f.endsWith('templates/TemplateGallery.tsx')),
    'TemplateGallery — the one record-driven gallery — exists',
  )
}

/**
 * No second landing-page template collection.
 *
 * The obvious way to build this was a new `funnel-lp-templates`, which would
 * have orphaned every deployment's `landing_page_id` and been a third system
 * while the migration ran.
 */
{
  const collections = readdirSync(new URL('../src/collections/', import.meta.url).pathname)
  t(
    !collections.some((f) => /lp.?templates/i.test(f)),
    'there is no separate landing-page template collection — funnel-landing-pages IS the library',
  )
  t(
    collections.includes('FunnelQuizTemplates.ts'),
    'quiz templates have a collection of their own (they had no record at all before)',
  )
}

/* -------------------------------------------------------------- record mapping */

{
  const stock = listLpTemplates()
  t(stock.length === EXPECTED_LP_TEMPLATE_COUNT, `the landing-page library is ${EXPECTED_LP_TEMPLATE_COUNT}`)
  t(listQuizTemplates().length === EXPECTED_QUIZ_TEMPLATE_COUNT, `the quiz library is ${EXPECTED_QUIZ_TEMPLATE_COUNT}`)

  const first = stock[0]
  const rec = toLpRecord({
    id: 7,
    name: 'Editorial Investigation',
    slug: first.id,
    template_id: first.id,
    is_published: true,
    is_enabled: true,
    origin: 'stock',
    stock_key: first.id,
    sections: [],
    slot_overrides: { s1_headline_1: 'Hello' },
  })
  t(rec.kind === 'lp', 'an lp row maps to an lp record')
  t(rec.templateId === first.id, 'a resolvable row carries the canonical renderer id')
  t(rec.rendererError === null, 'a resolvable row reports no renderer error')
  t(rec.renderer === 'ported', 'the twelve are ported-renderer templates')
  t(rec.usesSlots === true, 'a ported template says its copy lives in slots')
  t(rec.slotOverrides.s1_headline_1 === 'Hello', 'template-level slot copy survives mapping')
  t(rec.recommendedQuizTemplateId.startsWith('sq_'), 'a landing page recommends a quiz skin')

  /*
   * A row naming nothing must SAY so and keep its raw id. Substituting the
   * canonical id of some other template here is the exact bug: it would make a
   * broken row indistinguishable from a working one at every surface upstream.
   */
  const broken = toLpRecord({ id: 8, name: 'Ghost', slug: 'ghost', template_id: 'no_such_template' })
  t(broken.rendererError !== null, 'an unresolvable landing-page row reports a renderer error')
  t(broken.templateId === 'no_such_template', 'a broken row keeps the RAW id so the error can name it')
  t(broken.renderer === null, 'a broken row claims no renderer')

  // `is_enabled` is NULL on rows that predate the column. NULL means "never
  // asked", and every such row was selectable before the column existed.
  t(toLpRecord({ id: 9, template_id: first.id }).isEnabled === true, 'a row with no is_enabled value is enabled')
  t(toLpRecord({ id: 9, template_id: first.id, is_enabled: false }).isEnabled === false, 'an explicitly disabled row is disabled')
}

{
  const q = listQuizTemplates()[3]
  const stockRec = toQuizRecord({
    id: 2, name: q.name, template_id: q.id, renderer_key: q.id, code: q.code, origin: 'stock', stock_key: q.id,
  })
  t(stockRec.templateId === stockRec.rendererKey, 'a stock quiz row stores one id under both names')
  t(stockRec.rendererError === null, 'a stock quiz row resolves')

  /*
   * The clone case, which is why `template_id` and `renderer_key` are separate
   * fields. A clone is a new selectable identity drawn by an existing renderer;
   * collapsing the two would make it either unrenderable or indistinguishable
   * from its source.
   */
  const clone = toQuizRecord({
    id: 3, name: 'Case Dossier copy', template_id: `${q.id}_copy_ab12cd`, renderer_key: q.id, origin: 'clone',
  })
  t(clone.templateId !== clone.rendererKey, 'a clone stores its own id')
  t(clone.rendererKey === q.id, 'a clone keeps the renderer it was cloned from')
  t(clone.rendererError === null, 'a clone resolves, because resolution follows renderer_key')

  const broken = toQuizRecord({ id: 4, name: 'Ghost', template_id: 'ghost_skin', renderer_key: 'sq_nonexistent' })
  t(broken.rendererError !== null, 'a quiz row naming an unknown renderer reports it')
}

/* ------------------------------------------------------------- selectability */

{
  const base = {
    kind: 'lp', id: '1', name: 'x', isEnabled: true, origin: 'stock',
    stockKey: null, archivedAt: null, rendererError: null,
  } as unknown as Parameters<typeof selectabilityProblem>[0]

  t(isSelectable(base), 'an enabled, unarchived, resolvable template is selectable')
  t(selectabilityProblem(base) === null, 'and reports no problem')

  t(!isSelectable({ ...base, isEnabled: false }), 'a disabled template is not selectable')
  t(selectabilityProblem({ ...base, isEnabled: false })!.includes('disabled'), 'and says it is disabled')

  t(!isSelectable({ ...base, archivedAt: '2026-01-01' }), 'a deleted template is not selectable')

  /*
   * Order matters: a broken template reports BROKEN even when it is also
   * disabled, because "disabled" invites someone to enable it and discover the
   * real problem afterwards.
   */
  const brokenAndDisabled = { ...base, isEnabled: false, rendererError: 'unknown quiz template id "x"' }
  t(selectabilityProblem(brokenAndDisabled)!.includes('unknown'), 'a broken template reports the renderer error first')
}

/* ------------------------------------------------------- stored quiz id shape */

{
  t(validateStoredQuizTemplateId('sq_quiz_first') === true, 'a stock quiz id is storable')
  t(validateStoredQuizTemplateId('default') === true, 'a legacy alias is still storable')
  t(validateStoredQuizTemplateId('sq_case_dossier_copy_a1b2c3') === true, 'a clone id is storable')
  t(validateStoredQuizTemplateId('') === true, 'blank means "not chosen yet" and is not an error here')
  t(typeof validateStoredQuizTemplateId('Not An Id') === 'string', 'arbitrary text is refused')
  t(typeof validateStoredQuizTemplateId('<script>') === 'string', 'markup is refused')
  t(typeof validateStoredQuizTemplateId('ab') === 'string', 'a too-short id is refused')
  t(QUIZ_TEMPLATE_ID_PATTERN.test('sq_a'), 'the pattern accepts a minimal real id')

  /*
   * The validators must NOT check existence. A database read inside a field
   * validator runs in the write transaction and throws outright when the table
   * is missing, which turns a skipped migration into a total write outage — and
   * the resolvers deliberately catch exactly that case to degrade to a 404.
   */
  for (const f of ['FunnelQuizDeployments.ts', 'FunnelLpDeployments.ts', 'FunnelQuizTemplates.ts', 'FunnelLandingPages.ts']) {
    const src = code(join(SRC, 'collections', f))
    const validators = src.split('\n').filter((l) => /validate\w*\s*[:=]/.test(l)).join('\n')
    t(!/async/.test(validators), `${f}: no async field validator (a DB read here fails every write when the table is missing)`)
    t(!/payload\.find|req\.payload/.test(src.slice(0, src.indexOf('export const'))), `${f}: validators do no database work`)
  }
}

/* ------------------------------------------------------- sample recognition */

{
  const unmodified = DEFAULT_SECTION_ORDER.map((type) => ({
    id: `sec_${type}`,
    type,
    isVisible: true,
    copy: JSON.parse(JSON.stringify(SEED_SECTION_COPY[type] || {})),
  }))

  t(isUnmodifiedSampleSections(unmodified), 'freshly seeded sections are recognised as sample data')

  /*
   * Each of these is somebody's work. The instruction not to blindly delete
   * production content outranks the instruction to remove the samples, so every
   * one of them must make the recogniser say no.
   */
  const edited = JSON.parse(JSON.stringify(unmodified))
  const firstKey = Object.keys(edited[0].copy)[0]
  if (firstKey) edited[0].copy[firstKey] = 'an operator wrote this'
  t(!isUnmodifiedSampleSections(edited), 'one edited word makes a row authored content, not a sample')

  const hidden = JSON.parse(JSON.stringify(unmodified))
  hidden[0].isVisible = false
  t(!isUnmodifiedSampleSections(hidden), 'a hidden section makes a row authored content')

  const reordered = [...unmodified].reverse()
  t(!isUnmodifiedSampleSections(reordered), 'reordered sections make a row authored content')

  const shortened = unmodified.slice(0, -1)
  t(!isUnmodifiedSampleSections(shortened), 'a removed section makes a row authored content')

  t(!isUnmodifiedSampleSections([]), 'empty sections are not sample data')
  t(!isUnmodifiedSampleSections(null), 'a missing sections array is not sample data')

  // Fresh ids per seed run, so ids must not participate in the comparison.
  const reIded = unmodified.map((s) => ({ ...s, id: `sec_${Math.random()}` }))
  t(isUnmodifiedSampleSections(reIded), 'section ids are regenerated each seed and are not compared')

  /*
   * The case a real database found and a hand-written fixture never would.
   *
   * Postgres normalises `jsonb` and does not preserve key insertion order, so a
   * row read back has the same content with its keys in a different sequence.
   * A `JSON.stringify` comparison called all three samples "edited" and kept
   * them, so the retirement silently never ran.
   */
  const reordered_keys = unmodified.map((s) => ({
    ...s,
    copy: Object.fromEntries(Object.entries(s.copy).reverse()),
  }))
  t(
    isUnmodifiedSampleSections(reordered_keys),
    'object key order is not an edit — Postgres jsonb does not preserve it',
  )

  // But array order IS an edit: a reordered list of settlement figures is a change.
  const arrayKey = Object.keys(unmodified.find((s) => Object.values(s.copy).some(Array.isArray))?.copy ?? {})
    .find((k) => Array.isArray((unmodified.find((s) => Array.isArray(s.copy[k])) ?? { copy: {} }).copy[k]))
  if (arrayKey) {
    const arrSection = unmodified.findIndex((s) => Array.isArray(s.copy[arrayKey]))
    const reorderedArray = JSON.parse(JSON.stringify(unmodified))
    reorderedArray[arrSection].copy[arrayKey].reverse()
    t(!isUnmodifiedSampleSections(reorderedArray), 'array order IS an edit')
  }
}

/* ----------------------------------------------------- the samples are retired */

{
  const copy = code(join(SRC, 'components/builder/lp/section-copy.ts'))
  t(/RETIRED_SAMPLE_LANDING_PAGES/.test(copy), 'the sample table survives, renamed to say what it is for')
  t(!/export const SAMPLE_LANDING_PAGES/.test(copy), 'nothing exports the sample pages as seedable content')

  for (const name of ['MVA Pain First', 'Editorial Test', 'Authority Build']) {
    const seeders = [
      code(join(SRC, 'lib/funnel-samples.ts')),
      code(join(SRC, 'seed/index.ts')),
    ]
    t(
      seeders.every((s) => !s.includes(name)),
      `neither seeder creates "${name}" any more`,
    )
  }

  // The retirement table has to keep naming templates that exist, or a sample's
  // deployments have nothing to be repointed onto and the row stays forever.
  const stockIds = new Set(listLpTemplates().map((x) => x.id))
  for (const s of RETIRED_SAMPLE_LANDING_PAGES) {
    t(stockIds.has(s.template_id), `retired sample "${s.slug}" repoints onto a stock template (${s.template_id})`)
  }
}

/* ---------------------------------------------------- deletion cannot cascade */

{
  const actions = code(join(SRC, 'app/(app)/admin/(top)/landing-pages/actions.ts'))
  t(!/export async function deleteLP\b/.test(actions), 'the cascading deleteLP is gone')
  t(!/export async function cloneLP\b/.test(actions), 'the old cloneLP is gone')

  const tmpl = read(join(SRC, 'app/(app)/admin/(top)/template-actions.ts'))
  /*
   * One template is what every brand deploys, and these collections are
   * `isAuthenticated` with no Site on them. A delete that removed referencing
   * deployments would let one operator tidying the library take down another
   * tenant's live pages.
   */
  t(/cannot be deleted/.test(tmpl), 'deleting a referenced template is refused with a reason')
  t(/stock_key/.test(tmpl), 'stock templates are archived rather than dropped, so reconcile cannot resurrect them')
  t(
    !/collection: 'funnel-lp-deployments',\s*\n\s*id: d\.id/.test(tmpl),
    'no template delete path removes a deployment',
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 1 && 0 : 1)
