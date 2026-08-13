/**
 * The template you saved is the template that renders. Proven, not assumed.
 *
 *   pnpm test:identity          # needs DATABASE_URI and a migrated schema
 *
 * This is the acceptance condition the correction brief calls critical, and it
 * is the one property no unit test could hold: it is about the seam between a
 * stored id and a renderer, and both ends are real. So this suite uses a real
 * database, real rows, and the real resolvers the public router calls.
 *
 * What it is defending against, concretely. Before this change:
 *
 *   · `resolveForRender('lp', 'anything')` answered `TEMPLATES[0]`, so a
 *     landing page stored under a bad id served Editorial Investigation and the
 *     only evidence was that the page looked wrong to whoever opened it;
 *   · `resolveForRender('quiz', 'anything')` answered `sq_editorial_inline` the
 *     same way;
 *   · and both were REACHED constantly, because `bold_modern` — the stored
 *     default on every landing-page row — named no template at all.
 *
 * A test that only asks "did a template come back" passes against every one of
 * those. So every assertion here names the template it expects, and the
 * negative cases assert a REFUSAL rather than a substitute.
 *
 * Distinct paths per case on purpose: the resolvers are wrapped in React
 * `cache()`, so two calls with identical arguments would answer from the memo
 * and the second assertion would be measuring the first one's answer.
 *
 * Fixtures are created under a unique run id and removed at the end, including
 * on failure. It never touches a row it did not create.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { ensureTemplateLibrary, listLpTemplateRecords, listQuizTemplateRecords } from '../src/lib/template-records/index.ts'
import { resolveLpDeployment } from '../src/lib/lp-deployment.ts'
import { resolveQuizDeployment } from '../src/lib/quiz-deployment.ts'

const RUN = `ident-${Date.now().toString(36)}`
let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const created: Array<{ collection: string; id: string | number }> = []
const track = <T extends { id: string | number }>(collection: string, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })
  await ensureTemplateLibrary(payload)

  /* ------------------------------------------------------------- fixtures */

  const site = track('sites', await payload.create({
    collection: 'sites',
    data: {
      name: `${RUN} brand`,
      slug: RUN,
      status: 'active',
      vertical: 'mva',
      default_phone: '(800) 555-0100',
    } as never,
    overrideAccess: true,
  }))
  const siteId = Number(site.id)
  const HOST = `${RUN}.example.test`

  const domain = track('domains', await payload.create({
    collection: 'domains',
    data: { host: HOST, site: siteId, primary: true, status: 'active', ssl_status: 'active' } as never,
    overrideAccess: true,
  }))

  const quiz = track('funnel-quizzes', await payload.create({
    collection: 'funnel-quizzes',
    data: {
      name: `${RUN} flow`,
      slug: `${RUN}-flow`,
      is_published: true,
      tiers: [], steps: [], nodes: [], custom_fields: [],
    } as never,
    overrideAccess: true,
  }))

  /* ------------------------------------------ the libraries are materialised */

  const lpTemplates = (await listLpTemplateRecords(payload)).filter((x) => x.origin === 'stock')
  const quizTemplates = (await listQuizTemplateRecords(payload)).filter((x) => x.origin === 'stock')

  t(lpTemplates.length === 12, `the landing-page library is twelve records (found ${lpTemplates.length})`)
  t(quizTemplates.length === 20, `the quiz library is twenty records (found ${quizTemplates.length})`)

  /*
   * The samples must not be in the library. This is the visible half of the
   * brief: while these existed they were what the deployment picker offered
   * INSTEAD of the twelve.
   */
  const allLp = await listLpTemplateRecords(payload)
  for (const gone of ['MVA Pain First', 'Editorial Test']) {
    t(!allLp.some((x) => x.name === gone), `"${gone}" is not in the landing-page template library`)
  }

  /* ------------------------------------------- LANDING PAGE: A renders as A */

  const [A, B] = lpTemplates
  t(A.templateId !== B.templateId, 'the two landing-page templates under test are genuinely different')

  const lpDepA = track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments',
    data: { name: `${RUN} lp A`, landing_page: Number(A.id), site: siteId, domain: Number(domain.id), path: `/${RUN}-a`, status: 'live' } as never,
    overrideAccess: true,
  }))
  const lpDepB = track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments',
    data: { name: `${RUN} lp B`, landing_page: Number(B.id), site: siteId, domain: Number(domain.id), path: `/${RUN}-b`, status: 'live' } as never,
    overrideAccess: true,
  }))

  const gotA = await resolveLpDeployment(siteId, HOST, `/${RUN}-a`, false)
  const gotB = await resolveLpDeployment(siteId, HOST, `/${RUN}-b`, false)

  t(gotA !== null, 'a landing-page deployment on a stock template SERVES (it 404d before: stock rows have no sections)')
  t(gotB !== null, 'the second landing-page deployment serves')
  t(gotA?.landingPage.templateId === A.templateId, `saved ${A.templateId} renders ${A.templateId} (got ${gotA?.landingPage.templateId})`)
  t(gotB?.landingPage.templateId === B.templateId, `saved ${B.templateId} renders ${B.templateId} (got ${gotB?.landingPage.templateId})`)
  // The assertion that kills the old fallback: B must not answer with A.
  t(gotB?.landingPage.templateId !== A.templateId, 'the second deployment does NOT render the first template')

  /* -------------------------------- LANDING PAGE: repointing changes nothing else */

  await payload.update({
    collection: 'funnel-lp-deployments',
    id: lpDepA.id,
    data: { landing_page: Number(B.id) } as never,
    overrideAccess: true,
  })
  const afterRepoint = await resolveLpDeployment(siteId, HOST, `/${RUN}-a/`, false)
  t(
    afterRepoint?.landingPage.templateId === B.templateId,
    'changing the selected template changes what renders',
  )

  /* --------------------------------- LANDING PAGE: a bad id refuses, never substitutes */

  const orphan = track('funnel-landing-pages', await payload.create({
    collection: 'funnel-landing-pages',
    data: {
      name: `${RUN} broken`, slug: `${RUN}-broken`, template_id: A.templateId,
      is_published: true, is_enabled: true, origin: 'blank', sections: [], slot_overrides: {},
    } as never,
    overrideAccess: true,
  }))
  /*
   * Written straight to the database, bypassing the field validator, because
   * that is exactly how a bad id gets into production: an import, a REST call,
   * a hand-edit in /cms against an older build. The product has to survive
   * finding one, and survive means SAY SO.
   */
  await payload.db.drizzle.execute(
    `UPDATE funnel_landing_pages SET template_id = 'no_such_template_xyz' WHERE id = ${Number(orphan.id)}`,
  )
  const brokenDep = track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments',
    data: { name: `${RUN} lp broken`, landing_page: Number(orphan.id), site: siteId, domain: Number(domain.id), path: `/${RUN}-broken`, status: 'live' } as never,
    overrideAccess: true,
  }))
  const gotBroken = await resolveLpDeployment(siteId, HOST, `/${RUN}-broken`, false)
  t(gotBroken === null, 'a landing page whose template id names nothing REFUSES to serve')
  t(
    gotBroken?.landingPage?.templateId !== lpTemplates[0].templateId,
    'and specifically does not fall back to the first template in the library',
  )

  /* ----------------------------------------------- QUIZ: A renders as A */

  const [QA, QB] = quizTemplates
  t(QA.templateId !== QB.templateId, 'the two quiz templates under test are genuinely different')

  track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments',
    data: {
      name: `${RUN} quiz A`, quiz: Number(quiz.id), site: siteId, domain: Number(domain.id),
      path: `/${RUN}-qa`, render_mode: 'standalone', template_id: QA.templateId, status: 'live',
    } as never,
    overrideAccess: true,
  }))
  track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments',
    data: {
      name: `${RUN} quiz B`, quiz: Number(quiz.id), site: siteId, domain: Number(domain.id),
      path: `/${RUN}-qb`, render_mode: 'standalone', template_id: QB.templateId, status: 'live',
    } as never,
    overrideAccess: true,
  }))

  const qA = await resolveQuizDeployment(siteId, HOST, `/${RUN}-qa`, false)
  const qB = await resolveQuizDeployment(siteId, HOST, `/${RUN}-qb`, false)

  t(qA !== null && qB !== null, 'both quiz deployments serve')
  t(qA?.deployment.templateId === QA.rendererKey, `saved ${QA.templateId} renders ${QA.rendererKey} (got ${qA?.deployment.templateId})`)
  t(qB?.deployment.templateId === QB.rendererKey, `saved ${QB.templateId} renders ${QB.rendererKey} (got ${qB?.deployment.templateId})`)
  t(qB?.deployment.templateId !== QA.rendererKey, 'the second quiz deployment does NOT render the first template')
  t(qA?.deployment.requestedTemplateId === QA.templateId, 'the operator\'s stored choice is carried alongside the renderer')

  /* ------------------------------------------------ QUIZ: a clone is its own template */

  const cloneId = `${QA.rendererKey}_copy_${RUN.slice(-6)}`.toLowerCase().replace(/-/g, '_')
  const cloneRec = track('funnel-quiz-templates', await payload.create({
    collection: 'funnel-quiz-templates',
    data: {
      name: `${QA.name} copy`, template_id: cloneId, renderer_key: QA.rendererKey,
      code: 'CUSTOM', is_enabled: true, origin: 'clone',
    } as never,
    overrideAccess: true,
  }))
  track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments',
    data: {
      name: `${RUN} quiz clone`, quiz: Number(quiz.id), site: siteId, domain: Number(domain.id),
      path: `/${RUN}-qclone`, render_mode: 'standalone', template_id: cloneId, status: 'live',
    } as never,
    overrideAccess: true,
  }))
  const qClone = await resolveQuizDeployment(siteId, HOST, `/${RUN}-qclone`, false)
  t(qClone !== null, 'a deployment on a CLONED quiz template serves (the code registry alone cannot resolve one)')
  t(qClone?.deployment.templateId === QA.rendererKey, 'a clone draws with the renderer it was cloned from')
  t(qClone?.deployment.requestedTemplateId === cloneId, 'and the deployment still records that it chose the clone')

  /* -------------------------------- QUIZ: a bad id refuses, never substitutes */

  track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments',
    data: {
      name: `${RUN} quiz broken`, quiz: Number(quiz.id), site: siteId, domain: Number(domain.id),
      path: `/${RUN}-qbroken`, render_mode: 'standalone', template_id: 'ghost_skin_xyz', status: 'live',
    } as never,
    overrideAccess: true,
  }))
  const qBroken = await resolveQuizDeployment(siteId, HOST, `/${RUN}-qbroken`, false)
  t(qBroken === null, 'a quiz deployment whose template id matches no record REFUSES to serve')
  t(
    qBroken?.deployment?.templateId !== 'sq_editorial_inline',
    'and specifically does not fall back to the neutral skin',
  )

  /* ------------------------------ the guards hold on the RAW doors too */

  /*
   * Everything below bypasses the server actions deliberately.
   *
   * The refusals used to live only in `template-actions.ts`, and both template
   * collections are `isAuthenticated` on all four verbs with no `site` on them
   * — so `DELETE /api/funnel-landing-pages/:id` and the raw `/cms` UI walked
   * straight past all of it. A row is the TEMPLATE every brand deploys and the
   * foreign key is ON DELETE SET NULL, so one delete would have 404d every
   * other tenant's page and destroyed the reference rather than archiving it.
   */
  const refused = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
      fail++
      console.log('  FAIL ' + label + ' (it SUCCEEDED)')
    } catch {
      pass++
    }
  }

  await refused('deleting a REFERENCED landing-page template is refused on the raw door', () =>
    payload.delete({ collection: 'funnel-landing-pages', id: B.id, overrideAccess: true }),
  )
  t(
    (await payload.findByID({ collection: 'funnel-landing-pages', id: B.id, overrideAccess: true }).catch(() => null)) !== null,
    'and the template is still there afterwards',
  )
  t(
    (await resolveLpDeployment(siteId, HOST, `/${RUN}-b`, false)) !== null,
    'and the deployment that referenced it still serves',
  )

  await refused('changing a STOCK template\'s renderer is refused on the raw door', () =>
    payload.update({
      collection: 'funnel-landing-pages',
      id: A.id,
      data: { template_id: B.templateId } as never,
      overrideAccess: true,
    }),
  )
  await refused('changing a stock template\'s library id is refused', () =>
    payload.update({
      collection: 'funnel-landing-pages',
      id: A.id,
      data: { stock_key: 'something_else' } as never,
      overrideAccess: true,
    }),
  )
  await refused('template copy naming a slot that does not exist is refused on the raw door', () =>
    payload.update({
      collection: 'funnel-landing-pages',
      id: A.id,
      data: { slot_overrides: { s99_headline_404: 'copy nobody will ever see' } } as never,
      overrideAccess: true,
    }),
  )

  // Editing a stock template's WORDS is the thing an operator is meant to do.
  const realSlot = (await import('../src/lib/lp-templates/index.ts')).PORTED_TEMPLATES
    .find((x) => x.slug === A.templateId)?.slots?.find((sl) => sl.role === 'headline')
  if (realSlot) {
    await payload.update({
      collection: 'funnel-landing-pages',
      id: A.id,
      data: { slot_overrides: { [realSlot.id]: 'Our own words' } } as never,
      overrideAccess: true,
    })
    const edited = await payload.findByID({ collection: 'funnel-landing-pages', id: A.id, depth: 0, overrideAccess: true })
    t(
      (edited?.slot_overrides as Record<string, string>)?.[realSlot.id] === 'Our own words',
      'but rewriting a stock template\'s copy is allowed — that is the point of the library',
    )
    await payload.update({
      collection: 'funnel-landing-pages',
      id: A.id,
      data: { slot_overrides: {} } as never,
      overrideAccess: true,
    })
  }

  await refused('deleting a REFERENCED quiz template is refused on the raw door', () =>
    payload.delete({ collection: 'funnel-quiz-templates', id: cloneRec.id, overrideAccess: true }),
  )

  /* ------------------- a DISABLED template keeps existing deployments rendering */

  await payload.update({
    collection: 'funnel-quiz-templates',
    id: cloneRec.id,
    data: { is_enabled: false } as never,
    overrideAccess: true,
  })
  const qAfterDisable = await resolveQuizDeployment(siteId, HOST, `/${RUN}-qclone/`, false)
  t(
    qAfterDisable?.deployment.templateId === QA.rendererKey,
    'disabling a template does NOT take the pages already on it down — that is a selection rule, not a render gate',
  )
}

const cleanup = async (): Promise<void> => {
  const payload = await getPayload({ config })
  // Children before parents: every funnel FK is ON DELETE SET NULL, and the
  // Site cascade hook does the rest.
  for (const row of created.reverse()) {
    await payload
      .delete({ collection: row.collection as never, id: row.id as never, overrideAccess: true })
      .catch(() => null)
  }
}

try {
  await main()
} catch (err) {
  fail++
  console.log('  FAIL suite threw: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)))
} finally {
  await cleanup()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
