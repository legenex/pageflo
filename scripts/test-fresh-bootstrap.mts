/**
 * Does a fresh deploy of THIS COMMIT against an empty database produce a
 * working app?
 *
 *   createdb legalos_fresh
 *   DATABASE_URI=postgres://…/legalos_fresh NODE_ENV=production pnpm payload migrate
 *   DATABASE_URI=postgres://…/legalos_fresh pnpm test:bootstrap
 *
 * That is exit criterion 2 in `docs/production-readiness.md`, and it has been
 * asserted, denied and re-asserted by three documents that disagreed:
 *
 *   CLAUDE.md                     "Known schema drift - F001, still open"
 *   docs/production-readiness.md  P0.3, one of four items blocking launch
 *   docs/template-system-…        "F001 is closed, and two documents still say
 *                                  it is open"
 *
 * A claim that changes depending on which file you read is a claim nobody can
 * act on. This settles it by ASKING THE DATABASE, from the collections
 * themselves, so the answer moves when the code does and cannot go stale.
 *
 * THE ACTUAL FAILURE MODE IT GUARDS. Payload's SELECT enumerates every column a
 * collection declares. One absent column does not break one query — it throws
 * before startup completes, so a column added without its migration takes the
 * whole app down on the next deploy rather than degrading a page. `pnpm payload
 * migrate` running green proves the migrations are consistent with each other;
 * it proves nothing about whether they match the collections. Reading every
 * collection through the local API is what closes that gap, because a read is
 * exactly what a boot does.
 *
 * NODE_ENV matters here and is asserted. Outside production Payload's postgres
 * adapter AUTO-PUSHES the schema, which repairs the drift this suite exists to
 * find - so a run that "passed" in dev would have proved the opposite of what it
 * claimed.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import type { CollectionSlug } from 'payload'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const RUN = `fresh-${Date.now()}`
const created: Array<{ collection: CollectionSlug; id: number | string }> = []

const payload = await getPayload({ config })

/* ------------------------------------------------- no dev auto-push, please */

t(
  process.env.NODE_ENV === 'production' || process.env.PAYLOAD_MIGRATING === 'true',
  `NODE_ENV is "${process.env.NODE_ENV}" - outside production the adapter auto-pushes the schema, which would repair the very drift this suite looks for`,
)

/* ---------------------------------------- every collection is READABLE ---- */
//
// The load-bearing loop. A read enumerates every column the collection declares,
// which is exactly what Payload does at boot, so a collection that reads here
// cannot be the one that takes the app down.

const slugs = Object.keys(payload.collections) as CollectionSlug[]
t(slugs.length >= 20, `the config declares ${slugs.length} collections`)

const unreadable: Array<{ slug: string; error: string }> = []
for (const slug of slugs) {
  try {
    await payload.find({ collection: slug, limit: 1, depth: 0, overrideAccess: true })
    pass++
  } catch (err) {
    fail++
    const message = err instanceof Error ? err.message : String(err)
    unreadable.push({ slug, error: message.split('\n')[0] })
    console.log(`  FAIL every declared column of "${slug}" exists in the migrated schema — ${message.split('\n')[0]}`)
  }
}
if (unreadable.length === 0) console.log(`  ${slugs.length} collections read cleanly against the migrated schema`)

/* ------------------------------------------------------------- the globals */

for (const { slug } of payload.config.globals ?? []) {
  try {
    await payload.findGlobal({ slug: slug as never, depth: 0, overrideAccess: true })
    pass++
  } catch (err) {
    fail++
    console.log(`  FAIL global "${slug}" reads — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
  }
}

/* -------------------------------------- the fields F001 said were missing */
//
// Named explicitly rather than only covered by the loop above, because these are
// the specific columns three documents disagreed about. A generic "it reads"
// does not settle a specific claim.

/*
 * Field PATH on the collection, and COLUMN in the schema. They differ, and the
 * difference is the point: `brand.displayName` is a group field that the adapter
 * flattens to `brand_display_name`, so the migration and the collection name the
 * same thing two ways. Asserting on the column name alone would have "passed"
 * against a schema with none of them, because the API never returns that key.
 */
const F001_SITE_FIELDS: Array<{ path: [string, string] | [string]; column: string; value: unknown }> = [
  { path: ['brand_identity'], column: 'brand_identity', value: { version: 1, note: 'written by the bootstrap proof' } },
  { path: ['brand', 'display_name'], column: 'brand_display_name', value: 'Bootstrap Brand' },
  { path: ['brand', 'short_name'], column: 'brand_short_name', value: 'BB' },
  { path: ['brand', 'logo_url_dark'], column: 'brand_logo_url_dark', value: 'https://cdn.example.com/dark.svg' },
  { path: ['brand', 'tagline_brand'], column: 'brand_tagline_brand', value: 'a tagline' },
  { path: ['legal', 'copyright'], column: 'legal_copyright', value: '(c) 2026 Bootstrap' },
  { path: ['legal', 'tcpa_text'], column: 'legal_tcpa_text', value: 'TCPA text' },
  { path: ['legal', 'privacy_url'], column: 'legal_privacy_url', value: '/privacy' },
  { path: ['legal', 'terms_url'], column: 'legal_terms_url', value: '/terms' },
  { path: ['legal', 'default_disclaimer'], column: 'legal_default_disclaimer', value: 'Not a law firm.' },
  { path: ['typography', 'headline_font'], column: 'typography_headline_font', value: 'Inter' },
  { path: ['typography', 'body_font'], column: 'typography_body_font', value: 'Inter' },
  { path: ['typography', 'base_size'], column: 'typography_base_size', value: 'md' },
]

const nest = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const f of F001_SITE_FIELDS) {
    if (f.path.length === 1) out[f.path[0]] = f.value
    else {
      const group = (out[f.path[0]] ?? {}) as Record<string, unknown>
      group[f.path[1] as string] = f.value
      out[f.path[0]] = group
    }
  }
  return out
}

const readPath = (doc: Record<string, unknown>, path: readonly string[]): unknown =>
  path.reduce<unknown>((cur, key) => (cur == null || typeof cur !== 'object' ? undefined : (cur as Record<string, unknown>)[key]), doc)

const FUNNEL_COLLECTIONS: CollectionSlug[] = [
  'funnel-advertorials', 'funnel-advertorial-deployments', 'funnel-landing-pages',
  'funnel-lp-deployments', 'funnel-quizzes', 'funnel-quiz-deployments',
] as CollectionSlug[]

for (const slug of FUNNEL_COLLECTIONS) {
  try {
    await payload.find({ collection: slug, limit: 1, depth: 0, overrideAccess: true })
    pass++
  } catch {
    fail++
    console.log(`  FAIL the funnel table "${slug}" exists in a migration-only schema`)
  }
}

/* --------------------------------------------------------- CRUD and publish */

try {
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: `${RUN} brand`,
      slug: RUN,
      vertical: 'multi',
      // Every F001 field, written and read back. A column that exists but is the
      // wrong type accepts a read and refuses a write.
      ...nest(),
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'sites', id: site.id })
  pass++

  const readBack = (await payload.findByID({ collection: 'sites', id: site.id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
  for (const field of F001_SITE_FIELDS) {
    const got = readPath(readBack, field.path)
    t(
      got != null && got !== '',
      `Sites.${field.path.join('.')} (column "${field.column}") round-trips through a migration-only schema`,
    )
  }

  // A page, published and unpublished. The publish path is a status write plus
  // a read, which is where a missing column on the read side surfaces.
  const page = await payload.create({
    collection: 'pages',
    data: { title: `${RUN} page`, slug: `${RUN}-page`, site: site.id, status: 'draft' } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'pages', id: page.id })
  pass++

  const published = await payload.update({
    collection: 'pages',
    id: page.id,
    data: { status: 'published' } as never,
    overrideAccess: true,
  })
  t((published as { status?: string }).status === 'published', 'a page publishes')

  const found = await payload.find({
    collection: 'pages',
    where: { and: [{ site: { equals: site.id } }, { status: { equals: 'published' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  t(found.docs.length === 1, 'and is found by the query the public router runs')

  await payload.update({ collection: 'pages', id: page.id, data: { status: 'draft' } as never, overrideAccess: true })
  const gone = await payload.find({
    collection: 'pages',
    where: { and: [{ site: { equals: site.id } }, { status: { equals: 'published' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  t(gone.docs.length === 0, 'and unpublishing takes it back out of that query')

  // A brandless flow and a deployment of it: the funnel tables, exercised rather
  // than only counted, including the column the last production deploy tripped
  // over (`funnel_lp_deployments.quiz_id`).
  const quiz = await payload.create({
    collection: 'funnel-quizzes' as CollectionSlug,
    data: { name: `${RUN} flow`, slug: `${RUN}-flow`, is_published: true, steps: [], nodes: [] } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'funnel-quizzes' as CollectionSlug, id: quiz.id })

  const lp = await payload.create({
    collection: 'funnel-landing-pages' as CollectionSlug,
    data: { name: `${RUN} lp`, slug: `${RUN}-lp`, template_id: 'quiz_first', is_published: true, sections: [{ type: 'hero' }] } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'funnel-landing-pages' as CollectionSlug, id: lp.id })

  const dep = await payload.create({
    collection: 'funnel-lp-deployments' as CollectionSlug,
    data: {
      name: `${RUN} dep`,
      landing_page: lp.id,
      site: site.id,
      path: `/c/${RUN}`,
      quiz: quiz.id,
      embedded_quiz_template_id: 'sq_quiz_first',
      content_overrides: {},
      status: 'live',
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'funnel-lp-deployments' as CollectionSlug, id: dep.id })

  const depBack = (await payload.findByID({
    collection: 'funnel-lp-deployments' as CollectionSlug,
    id: dep.id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const quizRel = depBack.quiz == null ? '' : typeof depBack.quiz === 'object' ? String((depBack.quiz as { id: unknown }).id) : String(depBack.quiz)
  t(quizRel === String(quiz.id), 'funnel_lp_deployments.quiz_id exists and holds the flow binding')
  t(depBack.embedded_quiz_template_id === 'sq_quiz_first', 'and the embedded skin column exists')

  // A lead, because it is the row the product exists to write.
  const lead = await payload.create({
    collection: 'leads',
    data: {
      site: site.id,
      source_entity_type: 'quiz',
      status: 'new',
      contact: { first_name: 'Boot', last_name: 'Strap', email: 'boot@example.test', phone: '5551234567' },
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'leads', id: lead.id })
  t(Boolean(lead.id), 'a lead persists')
} catch (err) {
  fail++
  console.log(`  FAIL the CRUD and publish walk completed — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
} finally {
  // Nothing this suite created survives it. Reverse order so a child goes before
  // its parent and the Site cascade is not what removes them.
  for (const row of created.reverse()) {
    await payload.delete({ collection: row.collection, id: row.id, overrideAccess: true }).catch(() => null)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
process.exit(0)
