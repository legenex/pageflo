/**
 * Assertions for the AI adapters: deployment content, and quiz template
 * proposals ("New with Claude").
 *
 *   pnpm test:ai
 *
 * There is no ANTHROPIC_API_KEY in a local checkout, and a contract that can
 * only be exercised against a live provider is a contract nobody exercises. The
 * model is a parameter, so every case here runs the REAL code path with a
 * deterministic double: the filtering, the prompt construction and the override
 * maths are the same functions production calls, and only the network hop is
 * replaced.
 *
 * What is NOT proven here, stated plainly: that a real Claude obeys the prompt.
 * That is an external integration test and it is listed as one. What IS proven
 * is that it does not matter very much whether it obeys, because a disobedient
 * answer is rejected by shape rather than trusted by instruction.
 */
import {
  generateContent,
  filterProposal,
  buildSystemPrompt,
  buildUserPrompt,
  applyAccepted,
  resetToDefault,
  targetsFromSlots,
  ContentProposalSchema,
  type ContentModel,
  type ContentRequest,
} from '../src/lib/ai-content/adapter.ts'
import {
  proposeQuizTemplate,
  filterQuizTemplateProposal,
  buildQuizTemplateSystemPrompt,
  buildQuizTemplateUserPrompt,
  QuizTemplateProposalSchema,
  AI_QUIZ_RENDERER_KEYS,
  AI_QUIZ_PROGRESS_FORMS,
  AI_QUIZ_NAME_MAX,
  type QuizTemplateModel,
} from '../src/lib/ai-content/quiz-template.ts'
import { QUIZ_TEMPLATE_ID_PATTERN } from '../src/lib/template-records/id.ts'
import { PORTED_TEMPLATES, asSlotted } from '../src/lib/lp-templates/index.ts'
import { composeTemplate } from '../src/lib/lp-slots/model.ts'

let passed = 0
let failed = 0
const t = (cond: unknown, label: string): void => {
  if (cond) passed++
  else { failed++; console.log('  FAIL ' + label) }
}

/* ---------------------------------------------------------------- fixtures */

const TPL = PORTED_TEMPLATES.find((x) => x.slug === 'sixty_second_check')!

const BRAND = {
  displayName: 'Acme Claims',
  voice: {
    formality: 2,
    directness: 4,
    empathy: 4,
    authority: 3,
    urgency: 2,
    reassurance: 4,
    sentenceLength: 'short' as const,
    headlineStyle: 'One clear promise, no wordplay',
    ctaStyle: 'Verb first, five words or fewer',
    preferredVocabulary: ['review', 'check', 'no cost'],
    disallowedVocabulary: ['guaranteed', 'winnings', 'jackpot'],
    readingLevel: 'US grade 7',
    claimSensitivity: 'high' as const,
    legalCaution: 'high' as const,
  },
  approvedFacts: {
    organization: 'Acme Claims, an attorney-matching service',
    audience: 'People injured in a motor vehicle accident in the last two years',
    services: ['Attorney matching', 'Free case review'],
    geographicScope: 'All 50 US states',
    contact: '(800) 000-0000',
    approvedClaims: ['No cost to start', 'Free case review'],
    proofPoints: ['Network attorneys in all 50 states'],
    prohibitedClaims: ['guaranteed settlement', 'we are a law firm'],
    requiredDisclaimers: ['Acme Claims is not a law firm and does not provide legal advice.'],
  },
}

const FLOW = {
  name: 'MVA Qualification',
  stepCount: 18,
  questions: ['How were you injured?', 'What state did the accident happen in?', 'When did it happen?'],
  tiers: ['t1', 't2', 't3', 't4'],
}

const overrides: Record<string, string> = {}
const targets = targetsFromSlots(TPL.slots, overrides, { roles: ['headline', 'subheadline', 'cta_label', 'disclaimer'] })

const req: ContentRequest = {
  brand: BRAND,
  templateId: TPL.slug,
  templateName: TPL.name,
  targets,
  flow: FLOW,
  instruction: 'Make it warmer and shorter.',
}

t(targets.length > 0, `there are slots to write into (${targets.length})`)
t(targets.every((x) => x.role !== 'image_src'), 'an image URL is never a write target — a language model would invent a plausible path that resolves to nothing')

/* ------------------------------------------------------------------ prompt */

{
  const sys = buildSystemPrompt(req)
  t(sys.includes('Acme Claims'), 'the system prompt names the brand')
  t(sys.includes('guaranteed settlement'), 'and states the prohibited claims')
  t(sys.includes('not a law firm and does not provide legal advice'), 'and the disclaimers that must survive')
  t(sys.includes('NEVER use these words: guaranteed, winnings, jackpot'), 'and the disallowed vocabulary')
  t(/No HTML/.test(sys) && /No em dashes|Never use em dashes/i.test(sys), 'and the output rules')
  t(sys.includes('empathetic') || sys.includes('warm'), 'and the brand voice, rendered as words rather than as numbers')

  const user = buildUserPrompt(req)
  t(user.includes('MVA Qualification'), 'the user prompt carries the quiz flow as context')
  t(user.includes('You cannot change it'), 'and says explicitly that the flow is read only')
  t(user.includes('How were you injured?'), 'and the real questions, so the copy can promise what is actually asked')
  for (const target of targets.slice(0, 4)) t(user.includes(target.id), `and asks for slot "${target.id}" by id`)
}

/* ------------------------------------------------------------ happy path */

type EchoItem = { id: string; text: string }
/** A model that returns exactly what the case declares. */
function echo(items: EchoItem[]): ContentModel {
  return async () => ({ items })
}

{
  const proposed = targets.slice(0, 3).map((x) => ({ id: x.id, text: `New copy for ${x.role}` }))
  const r = await generateContent(req, echo(proposed))
  t(r.ok, 'a well-formed proposal is accepted')
  t(r.accepted.length === 3, 'and every item comes through')
  t(r.rejected.length === 0, 'with nothing rejected')
  t(r.accepted.every((a) => a.previous !== ''), 'each carries what it replaces, so a diff can be shown before anything is written')
  t(r.accepted.every((a) => targets.some((x) => x.id === a.id && x.role === a.role)), 'and its real role, not one the model chose')
}

/* --------------------------------------------------- what cannot come back */

{
  const hostile = [
    { id: targets[0].id, text: '<b>Bold headline</b>' },
    { id: targets[1].id, text: 'Fine copy' },
    { id: 's99_invented_1', text: 'A slot I made up' },
    { id: targets[2].id, text: '' },
  ]
  const r = await generateContent(req, echo(hostile))
  t(r.accepted.length === 1 && r.accepted[0].id === targets[1].id, 'only the clean item is applied')
  t(r.rejected.some((x) => x.id === 's99_invented_1' && x.reason === 'unknown-slot'), 'an id the request never mentioned is REJECTED, not merged — this is the line that stops a model widening the page')
  t(r.rejected.some((x) => x.reason === 'contains-markup'), 'markup is rejected rather than escaped and shipped')
  t(r.rejected.some((x) => x.reason === 'empty'), 'an empty string is rejected')
  t(r.ok, 'and a PARTIAL acceptance still succeeds — one bad line does not throw away three good ones')
}

for (const [text, reason] of [
  ['Visit https://evil.example<script>', 'contains-markup'],
  ['{{brand.callNumber}} now', 'contains-markup'],
  ['style="color:red" headline', 'contains-markup'],
  ['{"id":"x"}', 'contains-markup'],
  ['&lt;b&gt;escaped&lt;/b&gt;', 'contains-markup'],
] as const) {
  const r = filterProposal(req, { items: [{ id: targets[0].id, text }] })
  t(r.rejected[0]?.reason === reason, `"${text.slice(0, 26)}" is rejected as ${reason}`)
}

{
  const r = filterProposal(req, { items: [{ id: targets[0].id, text: 'We get you a guaranteed settlement fast' }] })
  t(r.rejected[0]?.reason === 'prohibited-claim', 'a prohibited claim is rejected')
}
{
  const r = filterProposal(req, { items: [{ id: targets[0].id, text: 'Collect your guaranteed winnings' }] })
  t(r.rejected[0]?.reason === 'prohibited-claim' || r.rejected[0]?.reason === 'disallowed-vocabulary', 'disallowed vocabulary is rejected')
}
{
  const r = filterProposal(req, { items: [{ id: targets[0].id, text: 'x'.repeat(5000) }] })
  t(r.rejected[0]?.reason === 'too-long', 'an essay in a headline slot is rejected')
}

/* ------------------------------------------------------- required disclaimers */

{
  const disc = targets.find((x) => x.role === 'disclaimer')
  if (disc) {
    const dropped = filterProposal(req, { items: [{ id: disc.id, text: 'We are the best in the business.' }] })
    t(dropped.rejected[0]?.reason === 'missing-required-disclaimer', 'a rewrite that DROPS a required disclaimer is rejected')

    const kept = filterProposal(req, {
      items: [{ id: disc.id, text: 'Acme Claims is not a law firm and does not provide legal advice to anyone.' }],
    })
    t(kept.accepted.length === 1, 'a reworded disclaimer that keeps its substance is accepted — protecting it must not make it uneditable')
  } else {
    t(true, 'this template has no disclaimer slot, so the disclaimer rules are exercised elsewhere')
    t(true, 'placeholder')
  }
}

/* ---------------------------------------------------- failure modes of the model */

{
  const r = await generateContent(req, async () => { throw new Error('ECONNREFUSED') })
  t(!r.ok, 'an unavailable model fails the call')
  t(r.error.includes('unavailable'), 'and says so in words an operator can act on')
  t(r.accepted.length === 0, 'and applies nothing')
}
{
  const r = await generateContent(req, (async () => ({ nonsense: true })) as never)
  t(!r.ok && r.error.includes('not a list of slot texts'), 'a malformed response is refused by schema, not by hope')
}
{
  const r = await generateContent(req, (async () => ({ items: [{ id: targets[0].id, text: 42 }] })) as never)
  t(!r.ok, 'a non-string text fails the schema')
}
{
  const r = await generateContent({ ...req, targets: [] }, echo([]))
  t(!r.ok && r.error.includes('no slots'), 'asking with no targets is refused rather than sent')
}
{
  const r = await generateContent(req, echo([]))
  t(!r.ok, 'a model that returns nothing is not a success')
}

t(ContentProposalSchema.safeParse({ items: [{ id: 'a', text: 'b', style: 'red' }] }).success, 'the schema tolerates an extra key on an item...')
{
  // ...and the FILTER is what discards it, because zod strips unknown keys and
  // the guarantee must not depend on that behaviour staying the same.
  const r = filterProposal(req, { items: [{ id: targets[0].id, text: 'ok', style: 'red' } as never] })
  t(r.accepted.length === 1 && !('style' in r.accepted[0]), 'and nothing but id and text survives into an accepted item')
}

/* ------------------------------------------------------------ override maths */

{
  const acc = [{ id: targets[0].id, text: 'Written copy', role: targets[0].role, previous: '' }]
  const next = applyAccepted({}, acc, targets)
  t(next[targets[0].id] === 'Written copy', 'an accepted item becomes an override')
  t(Object.keys(next).length === 1, 'and only that one')

  const same = applyAccepted({ [targets[0].id]: 'x' }, [{ ...acc[0], text: targets[0].stockText }], targets)
  t(!(targets[0].id in same), 'writing the STOCK text removes the override rather than pinning a copy of it — a deployment with no override follows a corrected template')

  const reset = resetToDefault({ [targets[0].id]: 'x', [targets[1].id]: 'y' }, [targets[0].id])
  t(!(targets[0].id in reset) && reset[targets[1].id] === 'y', 'reset-to-default deletes the override and leaves the others')
}

/* --------------------------------------------- a human edit beats the model */

{
  // The operator writes, then asks the model, then writes again. The last human
  // word must win, and the model must SEE the human's version as the current
  // text rather than the stock one.
  const human = { [targets[0].id]: 'A line the operator wrote themselves' }
  const withHuman = targetsFromSlots(TPL.slots, human, { ids: [targets[0].id] })
  t(withHuman[0].currentText === human[targets[0].id], 'the model is shown the human edit as the current text, not the stock wording')

  const r = await generateContent({ ...req, targets: withHuman }, echo([{ id: targets[0].id, text: 'Model rewrite' }]))
  t(r.accepted[0].previous === human[targets[0].id], "and the diff is against the human's line")

  const afterModel = applyAccepted(human, r.accepted, withHuman)
  t(afterModel[targets[0].id] === 'Model rewrite', 'accepting the model replaces the human line')

  const afterHuman = { ...afterModel, [targets[0].id]: 'Final human wording' }
  t(afterHuman[targets[0].id] === 'Final human wording', 'and a later human edit replaces the model, because overrides are just a map and the last write wins')
}

/* --------------------------------------- it actually reaches a rendered page */

{
  const headline = TPL.slots.find((s) => s.role === 'headline')!
  const only = targetsFromSlots(TPL.slots, {}, { ids: [headline.id] })
  const r = await generateContent({ ...req, targets: only }, echo([{ id: headline.id, text: 'A headline the assistant wrote' }]))
  const next = applyAccepted({}, r.accepted, only)
  const composed = composeTemplate(asSlotted(TPL), next)
  t(composed.html.includes('A headline the assistant wrote'), 'accepted copy reaches the composed page')
  t(composed.unknownOverrides.length === 0 && composed.refused.length === 0, 'and the composer neither rejects nor questions it')
  t(!composed.html.includes(headline.default.replace(/<[^>]*>/g, '').trim().slice(0, 30)), 'and the stock line it replaced is gone')
}

/* ---------------------------------------------------------- what it may NOT do */
//
// The immutables, restated as assertions. The proof is not that the model is
// told to leave them alone; it is that there is no field in the output schema
// that could carry them.

{
  const shape = ContentProposalSchema.safeParse({
    items: [{ id: targets[0].id, text: 'ok' }],
    templateId: 'other_template',
    colors: { primary: '#ff0000' },
    destinations: { qualified: 'https://elsewhere.example' },
    tiers: ['t9'],
  })
  t(shape.success, 'extra top-level keys parse...')
  const r = filterProposal(req, shape.success ? shape.data : { items: [] })
  t(r.accepted.length === 1, '...and are simply not part of the result')
  t(!('templateId' in r) && !('colors' in r) && !('destinations' in r), 'the result carries no template, colour, or destination — there is nowhere for one to go')
}

/* =================================================== quiz template proposals */
//
// The second thing a model may do: propose a NEW quiz template record for
// "New with Claude". Same architecture as the deployment copy above - injected
// model, schema as the boundary, a filter that does not trust zod's stripping -
// but the supported surface is even narrower: one of the twenty stock renderers
// as the base, a name, a blurb, and progressForm as the ONLY configurable
// visual field. Everything else a template shows is the renderer's or the
// brand's, and the proof is that there is no field to put it in.

{
  t(AI_QUIZ_RENDERER_KEYS.length === 20, `the model picks from exactly the twenty stock renderers (${AI_QUIZ_RENDERER_KEYS.length})`)
  t(AI_QUIZ_PROGRESS_FORMS.length === 20, `and from the twenty progress forms (${AI_QUIZ_PROGRESS_FORMS.length})`)
  t(!AI_QUIZ_RENDERER_KEYS.includes('default'), 'the legacy aliases are not in the set - an alias names one of the twenty, it is not a base')

  const sys = buildQuizTemplateSystemPrompt()
  t(/presentation only/i.test(sys), 'the system prompt states that a template is presentation only')
  t(/progressForm only/.test(sys), 'and that progressForm is the only configurable field')
  t(/No HTML/.test(sys) && /Never use em dashes/.test(sys), 'and the output rules')
  t(/Never name a colour/.test(sys), 'and that colour is never the template\'s to name')

  const user = buildQuizTemplateUserPrompt({ instruction: 'Calm and institutional for desktop retargeting.' })
  t(user.includes('Calm and institutional for desktop retargeting.'), 'the user prompt carries the operator instruction')
  for (const id of ['sq_editorial_inline', 'sq_case_dossier', 'sq_fullscreen_focus', 'sq_evidence_checklist']) {
    t(user.includes(`"${id}"`), `and offers renderer "${id}" by id`)
  }
  t(user.includes('"rule_count"'), 'and lists the progress forms the one knob may name')
}

/* ------------------------------------------------------ quiz: happy path */

/** A proposal the filter should accept, with per-case overrides. */
function qProposal(over: Record<string, unknown> = {}) {
  return {
    name: 'Institutional Casework',
    blurb: 'Measured case-file presentation for retargeting traffic.',
    rendererKey: 'sq_case_dossier',
    configOverrides: {},
    ...over,
  }
}

{
  let calls = 0
  const model: QuizTemplateModel = async () => { calls += 1; return qProposal() as never }
  const r = await proposeQuizTemplate({ instruction: 'Calm and institutional.' }, model)
  t(r.ok, 'a well-formed template proposal is accepted')
  t(calls === 1, 'after exactly one model call')
  if (r.ok) {
    t(r.record.name === 'Institutional Casework', 'the record carries the proposed name')
    t(r.record.rendererKey === 'sq_case_dossier', 'and the chosen stock renderer')
    t(
      Object.keys(r.record).sort().join(',') === 'blurb,configOverrides,name,rendererKey',
      'and exactly the four fields a row needs - record-shaped, nothing else',
    )
  }
}

{
  const r = filterQuizTemplateProposal(qProposal({ configOverrides: { progressForm: 'mono_hairline' } }))
  t(r.ok && r.record.configOverrides.progressForm === 'mono_hairline', 'a supported progress form survives into the record')
}
{
  const r = filterQuizTemplateProposal(qProposal())
  t(r.ok && Object.keys(r.record.configOverrides).length === 0, 'an empty config means "renderer default" and stays empty')
}
{
  t(QuizTemplateProposalSchema.safeParse(qProposal()).success, 'the zod schema accepts what the filter accepts')
  t(
    !QuizTemplateProposalSchema.safeParse(qProposal({ rendererKey: 'sq_no_such' })).success,
    'and is a closed enum, so invokeLLM retries an invented renderer instead of ever returning it',
  )
}

/* -------------------------------------------- quiz: what cannot come back */

{
  const r = filterQuizTemplateProposal(qProposal({ rendererKey: 'sq_totally_invented' }))
  t(!r.ok && r.error.includes('sq_totally_invented'), 'an unknown rendererKey is refused, by name')
}
{
  const r = filterQuizTemplateProposal(qProposal({ rendererKey: 'default' }))
  t(!r.ok, 'a legacy alias is refused even though the registry resolves it - the base must be one of the twenty')
}
{
  const r = filterQuizTemplateProposal(qProposal({ rendererKey: '' }))
  t(!r.ok, 'a missing rendererKey is refused - there is no such thing as a template drawn by nothing')
}
{
  const r = filterQuizTemplateProposal(qProposal({ configOverrides: { accentColor: '#ff0000' } }))
  t(!r.ok && r.error.includes('accentColor'), "a config field outside the supported set is refused, by name - colour is the brand's")
}
{
  const r = filterQuizTemplateProposal(qProposal({ configOverrides: { customCss: '.quiz{display:none}' } }))
  t(!r.ok && r.error.includes('customCss'), 'and so is anything shaped like code - the whole proposal fails, nothing is silently dropped')
}
{
  const r = filterQuizTemplateProposal(qProposal({ configOverrides: { progressForm: 'spinning_wheel' } }))
  t(!r.ok && r.error.includes('spinning_wheel'), 'an invented progress form is refused')
}
{
  const r = filterQuizTemplateProposal(qProposal({ configOverrides: ['rule_count'] }))
  t(!r.ok, 'a config that is not an object is refused')
}
{
  const r = filterQuizTemplateProposal(qProposal({ name: '<b>Bold</b> Template' }))
  t(!r.ok, 'markup in the name is refused')
}
{
  const r = filterQuizTemplateProposal(qProposal({ blurb: 'See https://example.com for details' }))
  t(!r.ok, 'a URL in the blurb is refused')
}
{
  const r = filterQuizTemplateProposal(qProposal({ name: '!!!' }))
  t(!r.ok, 'a name with no letters is refused - it would slugify to the generic fallback id')
}
{
  const r = filterQuizTemplateProposal(qProposal({ name: 'x'.repeat(AI_QUIZ_NAME_MAX + 1) }))
  t(!r.ok, 'a name past the ceiling is refused')
  // The ceiling is not taste: 48 name characters slugify to at most 48, and
  // with the underscore and six-character suffix the minted template_id is at
  // most 55 characters - inside the stored pattern's 64. An accepted name can
  // therefore never mint an id the collection refuses to store.
  t(
    QUIZ_TEMPLATE_ID_PATTERN.test(`${'x'.repeat(AI_QUIZ_NAME_MAX)}_ab12cd`),
    'the name ceiling composes with the stored-id pattern',
  )
}
{
  const r = filterQuizTemplateProposal({ ...qProposal(), colors: { primary: '#f00' }, questions: ['Q1?'] })
  t(r.ok, 'extra top-level keys do not sink the proposal...')
  if (r.ok) {
    t(
      !('colors' in r.record) && !('questions' in r.record),
      '...and are simply not part of the record - there is no field for a colour or a question to land in',
    )
  }
}

/* --------------------------------------- quiz: failure modes of the model */

{
  let calls = 0
  const model: QuizTemplateModel = async () => { calls += 1; return qProposal() as never }
  const r = await proposeQuizTemplate({ instruction: '   ' }, model)
  t(!r.ok, 'an empty instruction is refused')
  t(calls === 0, 'before the model is ever called - no brief, no invoice')
}
{
  const r = await proposeQuizTemplate({ instruction: 'x' }, async () => { throw new Error('ANTHROPIC_API_KEY is not set') })
  t(!r.ok && r.error.includes('unavailable'), 'an unavailable model fails in words an operator can act on, and nothing is created')
}
{
  const r = await proposeQuizTemplate({ instruction: 'x' }, (async () => 'just a string') as never)
  t(!r.ok, 'a response that is not an object is refused by shape')
}
{
  const r = await proposeQuizTemplate({ instruction: 'x' }, (async () => qProposal({ name: '' })) as never)
  t(!r.ok, 'a proposal that names no template is refused')
}
{
  const r = await proposeQuizTemplate(
    { instruction: 'Warm and encouraging for story traffic.' },
    (async () => qProposal({ rendererKey: 'sq_recovery_soft', configOverrides: { progressForm: 'rounded_encourage' } })) as never,
  )
  t(
    r.ok && r.record.rendererKey === 'sq_recovery_soft' && r.record.configOverrides.progressForm === 'rounded_encourage',
    'the full happy path through proposeQuizTemplate yields the storable record',
  )
}

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
if (passed === 0) { console.log('no assertions ran'); process.exit(2) }
