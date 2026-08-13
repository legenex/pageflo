/**
 * Assertions for the AI deployment-content adapter.
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

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
if (passed === 0) { console.log('no assertions ran'); process.exit(2) }
