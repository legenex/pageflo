/**
 * The explicit-consent contract, end to end, in a real browser.
 *
 *   pnpm build && pnpm test:consent
 *
 * Brand TCPA setting -> visitor form -> unchecked checkbox -> submitted payload
 * -> /api/leads -> pipeline -> Lead row -> Leads console, on all three public
 * surfaces that collect a lead: the standalone quiz, the quiz embedded in a
 * landing page, and the website Lead form block. Then the operator side: the
 * consent evidence in the console, queue and delivery state, and the retry.
 *
 * Nothing here reads source. Every claim is a click, a request, a database row
 * or text in the rendered console. No outside party is contacted: the only
 * webhook configured points at a name that cannot resolve.
 *
 * NOT A LEGAL CLAIM. This proves the product records what it says it records.
 */
import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { CollectionSlug } from 'payload'
import type { Browser, BrowserContext, Page } from 'playwright'

import { launchChromium, browserProvenance } from './lib/browser.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const RUN = `cns${Date.now().toString(36)}`
const PORT = Number(process.env.PAGEFLO_CONSENT_PORT ?? 3300 + (process.pid % 290))
const TENANT_HOST = '127.0.0.1'
const TENANT = `http://${TENANT_HOST}:${PORT}`
const APP_HOST = `localhost:${PORT}`
const APP = `http://${APP_HOST}`
const EMAIL = `consent-e2e-${RUN}@pageflo.test`
const PASSWORD = `ce-${randomUUID()}`

/**
 * The Brand's TCPA copy, deliberately hostile: a script, an inline handler and a
 * javascript: link around one legitimate /tcpa link. The visitor must see the
 * words and the working link, and nothing may execute.
 */
const HOSTILE_TCPA =
  'By checking this box I agree to be contacted by QA Brand at the number I gave. ' +
  '<script>window.__pwned = 1</script>' +
  '<a href="/tcpa" onclick="window.__clicked = 1">TCPA terms</a> ' +
  '<a href="javascript:window.__pwned2 = 1">bad link</a>'
const FORM_TCPA = 'By checking this box I agree that QA Brand may text and call me about my request.'

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

const answer = (label: string, nextStepKey: string): Record<string, unknown> => ({
  id: `a_${label.toLowerCase().replace(/\W+/g, '_')}`, label, isDQ: false, fieldMappings: [], nextStepKey, setTier: '',
})
const STEPS = [
  { key: 'q1', label: 'Question' },
  { key: 'form', label: 'Lead form' },
  { key: 'done', label: 'Done' },
]
const NODES = [
  {
    id: 'n_q1', stepKey: 'q1', tiers: [], type: 'question', fieldName: 'injury_type', questionType: 'button_grid', isVisible: true,
    headline: 'Were you injured?', question: 'HOW WERE YOU INJURED', subheadline: '',
    answers: [answer('Yes, I was injured', 'form')], enterScript: '', exitScript: '',
  },
  {
    id: 'n_form', stepKey: 'form', tiers: [], type: 'form', fieldName: 'lead_form', questionType: 'lead_form', isVisible: true,
    headline: 'Where should we send it?', question: 'YOUR DETAILS', subheadline: '',
    formFields: [
      { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'First Name', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Last Name', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'Email Address', required: true },
      { key: 'mobile', label: 'Cell Number', type: 'tel', placeholder: 'Cell Number', required: true },
      { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: '5 Digit Zip', required: true },
    ],
    answers: [answer('Submitted', 'done')], enterScript: '', exitScript: '',
  },
  {
    id: 'n_done', stepKey: 'done', tiers: [], type: 'endpoint', fieldName: 'submitted', questionType: 'qualified_result', isVisible: true,
    headline: 'Thank you, we will be in touch', question: '/submitted', subheadline: '', answers: [], enterScript: '', exitScript: '',
  },
]

const payload = await getPayload({ config })
const created: Array<{ collection: CollectionSlug; id: number | string }> = []
const track = <T extends { id: number | string }>(collection: string, doc: T): T => {
  created.push({ collection: collection as CollectionSlug, id: doc.id })
  return doc
}
const one = async (collection: string, id: number | string): Promise<Record<string, any>> =>
  (await payload.findByID({ collection: collection as CollectionSlug, id, depth: 0, overrideAccess: true })) as unknown as Record<string, any>

let server: ChildProcess | null = null
const serverLog: string[] = []

const waitForServer = async (): Promise<boolean> => {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/pageflo/health`)
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

const waitFor = async <T,>(fn: () => Promise<T | null | undefined | false>, ms = 45_000): Promise<T | null> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

const isAllowedConsoleError = (text: string): boolean =>
  /fonts\.(googleapis|gstatic)\.com/.test(text) || /net::ERR_/.test(text) || /Failed to load resource/.test(text)

const openVisitorPage = async (ctx: BrowserContext) => {
  const page = await ctx.newPage()
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort())
  const posts: string[] = []
  const errors: string[] = []
  page.on('request', (req) => { if (req.method() === 'POST' && req.url().includes('/api/leads')) posts.push(req.url()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !isAllowedConsoleError(m.text())) errors.push(m.text()) })
  return { page, posts, errors }
}

/** What a visitor sees and does around the consent box, on any of the three surfaces. */
const exerciseConsent = async (
  page: Page,
  posts: string[],
  label: string,
  submit: () => Promise<void>,
  afterSubmitted: () => Promise<void>,
  opts: { hostile?: boolean } = {},
): Promise<{ visibleDisclosure: string }> => {
  const box = page.locator('[data-consent-checkbox]')
  t((await box.count()) === 1, `${label}: exactly one consent checkbox is on the form`)
  t((await box.isChecked()) === false, `${label}: (1) the checkbox starts UNCHECKED`)

  const text = page.locator('[data-consent-text]')
  const visibleDisclosure = norm(await text.innerText())
  t(visibleDisclosure.length > 20, `${label}: the disclosure is displayed beside the control (${visibleDisclosure.slice(0, 50)}...)`)
  // Beside, not merely somewhere: the words sit inside the checkbox's own label.
  t(await box.evaluate((el) => Boolean((el as HTMLInputElement).labels?.[0]?.querySelector('[data-consent-text]'))), `${label}: and inside that checkbox's label, so clicking the words toggles it`)

  if (opts.hostile) {
    // Measured WHILE the form is on screen. Measured afterwards these would pass
    // against an empty page.
    t((await page.evaluate(() => (window as any).__pwned)) === undefined, `${label}: (12) a <script> in the disclosure never ran`)
    t((await page.evaluate(() => (window as any).__pwned2)) === undefined, `${label}: and a javascript: link never ran`)
    t((await page.locator('[data-consent-text] script').count()) === 0, `${label}: and no script element is in the DOM`)
    t((await page.locator('[data-consent-text] [onclick]').count()) === 0, `${label}: and no inline handler is on anything`)
    t((await page.locator('[data-consent-text] a[href^="javascript"]').count()) === 0, `${label}: and no javascript: link remains`)
    t((await page.locator('[data-consent-text] a[href="/tcpa"]').count()) === 1, `${label}: but the legitimate /tcpa link is there, working`)
    t(/bad link/.test(visibleDisclosure) && /TCPA terms/.test(visibleDisclosure), `${label}: and the visitor still reads the words around the removed markup`)
  }

  await submit()
  await page.waitForTimeout(700)
  t(posts.length === 0, `${label}: (2) submitting while unchecked sends NOTHING (posts=${posts.length})`)
  const err = page.locator('[data-consent-error]')
  t((await err.count()) === 1 && (await err.isVisible()), `${label}: (3) a visible validation message is shown`)
  t((await err.getAttribute('role')) === 'alert', `${label}: and it is announced to assistive technology`)
  t(/check the box/i.test((await err.innerText()) ?? ''), `${label}: and says what to do`)
  t((await box.getAttribute('aria-invalid')) === 'true', `${label}: and the control is marked invalid`)
  t((await box.isChecked()) === false, `${label}: the failed attempt did not tick the box`)

  await box.check()
  t((await page.locator('[data-consent-error]').count()) === 0, `${label}: checking the box clears the validation message`)
  await submit()
  await afterSubmitted()
  await page.waitForTimeout(1500)
  t(posts.length === 1, `${label}: (4) with the box checked it submits, EXACTLY ONE POST (posts=${posts.length})`)
  return { visibleDisclosure }
}

const fillQuizForm = async (page: Page, email: string) => {
  await page.fill('input[name="first_name"]', 'Ada')
  await page.fill('input[name="last_name"]', 'Lovelace')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="mobile"]', '5550100100')
  await page.fill('input[name="zip"]', '78701')
}

try {
  /* ------------------------------------------------------------------ fixtures */
  const site = track('sites', await payload.create({
    collection: 'sites',
    data: {
      name: `${RUN} QA Brand`, slug: RUN, vertical: 'multi', status: 'active', default_phone: '(555) 010-0100',
      brand: { display_name: 'QA Brand', short_name: 'QA', primary: '#0B1F3A', cta: '#0B1F3A', bg: '#ffffff', ink: '#0E1116' },
      legal: { tcpa_text: HOSTILE_TCPA, default_disclaimer: 'Not a law firm.' },
    } as never,
    overrideAccess: true,
  }))
  const stale = await payload.find({ collection: 'domains', where: { host: { equals: TENANT_HOST } }, limit: 10, depth: 0, overrideAccess: true })
  for (const row of stale.docs) await payload.delete({ collection: 'domains', id: row.id, overrideAccess: true }).catch(() => null)
  track('domains', await payload.create({
    collection: 'domains',
    data: { site: site.id, host: TENANT_HOST, primary: true, kind: 'custom', status: 'active', ssl_status: 'active' } as never,
    overrideAccess: true,
  }))
  const quiz = track('funnel-quizzes', await payload.create({
    collection: 'funnel-quizzes' as CollectionSlug,
    data: { name: `${RUN} flow`, slug: `${RUN}-flow`, is_published: true, is_archived: false, tiers: [], steps: STEPS, nodes: NODES, custom_fields: [] } as never,
    overrideAccess: true,
  }))
  const standaloneDep = track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments' as CollectionSlug,
    data: { name: `${RUN} standalone`, quiz: quiz.id, site: site.id, path: `/s/${RUN}`, render_mode: 'standalone', template_id: 'sq_quiz_first', status: 'live' } as never,
    overrideAccess: true,
  }))
  const lp = track('funnel-landing-pages', await payload.create({
    collection: 'funnel-landing-pages' as CollectionSlug,
    data: { name: `${RUN} lp`, slug: `${RUN}-lp`, template_id: 'quiz_first', angle: 'pain', is_published: true, sections: [{ type: 'hero' }] } as never,
    overrideAccess: true,
  }))
  const lpDep = track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments' as CollectionSlug,
    data: { name: `${RUN} lp dep`, landing_page: lp.id, site: site.id, path: `/c/${RUN}`, quiz: quiz.id, embedded_quiz_template_id: 'sq_quiz_first', content_overrides: {}, status: 'live' } as never,
    overrideAccess: true,
  }))
  // The website Lead form block, on the Brand's home page, with its own disclosure.
  const homeBlocks = [{
    blockType: 'lead_form', heading: 'Check your claim', submit_label: 'Send my details',
    consent_md: FORM_TCPA, funnel_type: 'contact-form', funnel_id: `${RUN}-website`, success_slug: '/submitted',
    form_fields: [
      { name: 'first_name', type: 'text', placeholder: 'First name', required: true },
      { name: 'last_name', type: 'text', placeholder: 'Last name', required: true },
      { name: 'email', type: 'email', placeholder: 'Email', required: true },
      { name: 'phone', type: 'tel', placeholder: 'Phone', required: true },
      { name: 'case_note', type: 'text', placeholder: 'Anything else?' },
    ],
  }]
  const existingHome = await payload.find({ collection: 'pages', where: { and: [{ site: { equals: site.id } }, { slug: { in: ['/', ''] } }] }, limit: 1, depth: 0, overrideAccess: true })
  const pageData = { title: `${RUN} home`, slug: '/', site: site.id, status: 'published', template_key: 'custom', uses_shared_template: false, body_blocks: homeBlocks }
  const home = existingHome.docs[0]
    ? await payload.update({ collection: 'pages', id: existingHome.docs[0].id, data: pageData as never, overrideAccess: true })
    : await payload.create({ collection: 'pages', data: pageData as never, overrideAccess: true })
  track('pages', home)

  // An "old" lead: written before consent was recorded, with no delivery history.
  const oldLead = track('leads', await payload.create({
    collection: 'leads',
    data: { site: site.id, source_entity_type: 'quiz', status: 'new', contact: { first_name: 'Old', last_name: 'Record', email: `${RUN}-old@example.test` } } as never,
    overrideAccess: true,
  }))
  // A lead waiting in the queue, and one whose delivery genuinely failed.
  const now = new Date().toISOString()
  const queuedLead = track('leads', await payload.create({
    collection: 'leads',
    data: {
      site: site.id, source_entity_type: 'quiz', status: 'new', contact: { first_name: 'Queued', last_name: 'Lead', email: `${RUN}-queued@example.test` },
      delivery_state: 'queued',
      delivery_log: [{ at: now, step: 'lead.captured', ok: true, detail: 'lead row stored' }, { at: now, step: 'delivery.queued', ok: true, detail: 'waiting for the delivery worker' }],
    } as never,
    overrideAccess: true,
  }))
  const failedLead = track('leads', await payload.create({
    collection: 'leads',
    data: {
      site: site.id, source_entity_type: 'quiz', status: 'new', contact: { first_name: 'Failed', last_name: 'Delivery', email: `${RUN}-failed@example.test` },
      delivery_state: 'failed',
      delivery_log: [
        { at: now, step: 'lead.captured', ok: true }, { at: now, step: 'delivery.queued', ok: true },
        { at: now, step: 'delivery.processing', ok: true, detail: 'queue pass 1' },
        { at: now, step: 'webhook.qa-buyer', ok: false, detail: 'status 500' },
        { at: now, step: 'downstream.completed', ok: true, detail: 'destinations: 0 delivered, 1 failed of 1' },
      ],
    } as never,
    overrideAccess: true,
  }))
  const fixtureUser = track('users', await payload.create({
    collection: 'users',
    data: { email: EMAIL, password: PASSWORD, name: 'Consent e2e', super_admin: true, status: 'active' } as never,
    overrideAccess: true,
  }))
  void fixtureUser

  /* ---------------------------------------------------------------- the server */
  console.log(`  starting the app on ${TENANT} (console ${APP})`)
  server = spawn('pnpm', ['start'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(PORT),
      PAGEFLO_APP_HOST: APP_HOST, PAGEFLO_MARKETING_HOST: 'pageflo.test', PAGEFLO_LEGACY_APP_HOSTS: 'legacy.pageflo.test',
      PAGEFLO_LEGACY_HOST_REDIRECT: 'false', PAGEFLO_SERVER_URL: APP, PAGEFLO_EXTRA_ORIGINS: `http://127.0.0.1:${PORT}`,
    },
  })
  server.stdout?.on('data', (c) => serverLog.push(String(c)))
  server.stderr?.on('data', (c) => serverLog.push(String(c)))
  const booted = await waitForServer()
  t(booted, `the production build boots${booted ? '' : '\n' + serverLog.join('').slice(-1500)}`)
  if (!booted) throw new Error('the app did not start')

  const browser: Browser = await launchChromium()
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const visible: Record<string, string> = {}

  /* ------------------------------------------- the two quiz surfaces, one behaviour */
  const runQuiz = async (path: string, label: string, email: string, query = '') => {
    const { page, posts, errors } = await openVisitorPage(visitor)
    await page.goto(`${TENANT}${path}${query}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-quiz-answer]', { timeout: 30_000 })
    await page.locator('[data-quiz-answer]').first().click()
    await page.waitForSelector('[data-quiz-form]', { timeout: 20_000 })
    await fillQuizForm(page, email)

    const r = await exerciseConsent(
      page, posts, label,
      async () => { await page.locator('[data-quiz-submit]').click() },
      async () => { await page.waitForSelector('[data-quiz-endpoint]', { timeout: 30_000 }).catch(() => null) },
      { hostile: true },
    )
    t((await page.locator('[data-quiz-endpoint]').count()) === 1, `${label}: the destination renders after consenting`)
    t(errors.length === 0, `${label}: the page threw nothing${errors.length ? ` (${errors[0].slice(0, 100)})` : ''}`)
    visible[label] = r.visibleDisclosure
    await page.close()
  }
  await runQuiz(`/s/${RUN}`, 'standalone quiz', `${RUN}-standalone@example.test`, `?utm_source=qa&utm_medium=consent&utm_campaign=${RUN}`)
  await runQuiz(`/c/${RUN}`, 'embedded quiz', `${RUN}-embedded@example.test`)
  t(visible['standalone quiz'] === visible['embedded quiz'], '(13) the standalone and the embedded quiz show the identical disclosure')

  /* ------------------------------------------------------- the website Lead form */
  {
    const { page, posts, errors } = await openVisitorPage(visitor)
    await page.goto(`${TENANT}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-consent-checkbox]', { timeout: 30_000 })
    const fillSite = async () => {
      await page.fill('input[name="first_name"]', 'Grace')
      await page.fill('input[name="last_name"]', 'Hopper')
      await page.fill('input[name="email"]', `${RUN}-website@example.test`)
      await page.fill('input[name="phone"]', '5550100111')
      await page.fill('input[name="case_note"]', 'rear-end collision')
    }
    await fillSite()
    const r = await exerciseConsent(
      page, posts, 'website form',
      async () => { await page.getByRole('button', { name: 'Send my details' }).click() },
      async () => { await page.waitForURL(/submitted/, { timeout: 20_000 }).catch(() => null) },
    )
    visible['website form'] = r.visibleDisclosure
    t(errors.length === 0, `website form: the page threw nothing${errors.length ? ` (${errors[0].slice(0, 100)})` : ''}`)
    await page.close()
  }

  /* ---------------------------------------- what was stored: the Leads, not the UI */
  const collected = await waitFor(async () => {
    const r = await payload.find({ collection: 'leads', where: { site: { equals: site.id } }, limit: 50, depth: 0, overrideAccess: true })
    const byEmail = (s: string) => r.docs.find((d) => (d as any).contact?.email === `${RUN}-${s}@example.test`) as Record<string, any> | undefined
    const set = { standalone: byEmail('standalone'), embedded: byEmail('embedded'), website: byEmail('website') }
    return set.standalone && set.embedded && set.website ? { ...set, total: r.totalDocs } : null
  })
  t(Boolean(collected), 'all three submissions became Leads')
  if (!collected) throw new Error('leads were not stored')
  for (const doc of Object.values(collected)) if (typeof doc === 'object') track('leads', doc as { id: number })

  const submittedLeadCount = (await payload.find({ collection: 'leads', where: { and: [{ site: { equals: site.id } }, { 'contact.email': { like: `${RUN}-` } }] }, limit: 50, depth: 0, overrideAccess: true }))
  t(
    submittedLeadCount.docs.filter((d) => /-(standalone|embedded|website)@/.test(String((d as any).contact?.email))).length === 3,
    '(5) exactly one Lead per submission: three surfaces, three rows',
  )

  const expectations: Array<{ key: 'standalone' | 'embedded' | 'website'; label: string; type: string; path: string; deployment: string }> = [
    { key: 'standalone', label: 'standalone quiz', type: 'quiz', path: `/s/${RUN}`, deployment: String(standaloneDep.id) },
    { key: 'embedded', label: 'embedded quiz', type: 'quiz', path: `/c/${RUN}`, deployment: `lp:${lpDep.id}` },
    { key: 'website', label: 'website form', type: 'contact-form', path: '/', deployment: `${RUN}-website` },
  ]
  for (const ex of expectations) {
    const lead = collected[ex.key] as Record<string, any>
    const c = lead.consent ?? {}
    t(c.accepted === true, `${ex.label}: (6) the Lead carries affirmative consent`)
    t(norm(String(c.disclosure_text ?? '')) === visible[ex.label], `${ex.label}: (7) the stored disclosure equals what the visitor saw`)
    t(!/<script|<a |onclick|javascript:/i.test(String(c.disclosure_text)), `${ex.label}: and stores no active markup`)
    const stamp = Date.parse(String(c.accepted_at ?? ''))
    t(Number.isFinite(stamp) && Math.abs(Date.now() - stamp) < 10 * 60_000, `${ex.label}: (8) it has an accepted timestamp, and a recent one`)
    t(c.method === 'checkbox_unchecked_default', `${ex.label}: and records the method`)
    t(c.source_site_slug === RUN && c.source_site_name === `${RUN} QA Brand`, `${ex.label}: (9) the collecting Brand is right`)
    t(c.source_funnel_type === ex.type && c.source_funnel_path === ex.path, `${ex.label}: and the funnel and path (${c.source_funnel_type} ${c.source_funnel_path})`)
    t(c.source_deployment_id === ex.deployment, `${ex.label}: and the deployment (${c.source_deployment_id})`)
    t(c.source_host === TENANT_HOST || String(c.source_host).startsWith(TENANT_HOST), `${ex.label}: and the host (${c.source_host})`)
    t(!JSON.stringify(lead.quiz_answers ?? {}).includes('__consent'), `${ex.label}: consent is not left behind in the answers`)
  }
  const sa = collected.standalone as Record<string, any>
  t(sa.attribution?.utm_source === 'qa' && sa.attribution?.utm_campaign === RUN, 'the standalone lead kept its UTMs')
  t(JSON.stringify((collected.website as any).quiz_answers ?? {}).includes('rear-end collision'), 'the website form\'s custom field is stored, not dropped by the route')

  // Queue -> pipeline -> honest state, through the real worker in the running server.
  const settled = await waitFor(async () => {
    const d = await one('leads', sa.id)
    return d.delivery_state && d.delivery_state !== 'queued' && d.delivery_state !== 'processing' ? d : null
  }, 60_000)
  t(Boolean(settled), 'the queue worker processed the lead')
  if (settled) {
    const steps = (settled.delivery_log as Array<{ step: string }>).map((e) => e.step)
    t(steps[0] === 'lead.captured' && steps.includes('delivery.queued') && steps.includes('delivery.processing'), `the lead's history shows capture, queue and processing (${steps.join(' > ')})`)
    t(settled.delivery_state === 'no-destination', `with no destination configured the state is no-destination, NOT delivered (was ${settled.delivery_state})`)
  }
  // Only NOW is a destination configured: a name that cannot resolve, so the retry
  // below is contained and fails honestly. Configured after the checks above so
  // they measure a Brand with no destination.
  track('tracking-configs', await payload.create({
    collection: 'tracking-configs',
    data: { site: site.id, custom_webhooks: [{ name: 'qa-buyer', url: 'https://qa-buyer.pageflo-qa.invalid/hook', enabled: true }] } as never,
    overrideAccess: true,
  }))
  const hlrDoc = await waitFor(async () => { const d = await one('leads', sa.id); return d.hlr_result ? d : null }, 30_000)
  t(Boolean(hlrDoc) && ['not_configured', 'provider_error', 'valid', 'invalid'].includes(hlrDoc!.hlr_result.state), `a phone lookup outcome is stored, whatever it was (${hlrDoc?.hlr_result?.state})`)
  t(hlrDoc?.hlr_result?.state !== 'valid' || Boolean(process.env.PLIVO_AUTH_ID), 'and a success is never fabricated when the provider has no credentials')

  /* --------------------------------------------- the API: consent cannot be forged */
  const post = (body: unknown) => fetch(`${TENANT}/api/leads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const contact = (n: string) => ({ first_name: 'Api', last_name: n, email: `${RUN}-api-${n}@example.test`, phone: '5550100122' })
  const denied = await post({ funnel_type: 'quiz', contact: contact('false'), consent: { accepted: false, disclosure_text: 'x' } })
  t(denied.status === 400, `a body claiming accepted:false is rejected, not stored as consent (${denied.status})`)
  const noAct = await post({ funnel_type: 'quiz', contact: contact('none'), client_submission_id: `${RUN}-none` })
  t(noAct.status === 200, 'a submission with no consent object is still captured')
  const noActLead = await waitFor(async () => (await payload.find({ collection: 'leads', where: { 'contact.email': { equals: `${RUN}-api-none@example.test` } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as Record<string, any> | undefined)
  if (noActLead) track('leads', noActLead as { id: number })
  t(noActLead && noActLead.consent?.accepted !== true, 'and carries NO consent record, rather than an assumed one')

  /* --------------------------------------------------------- the Leads console */
  const operator = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } })
  const page = await operator.newPage()
  const consoleErrors: string[] = []
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort())
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(`${APP}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([page.waitForURL(/\/admin\//, { timeout: 30_000 }).catch(() => null), page.click('button[type="submit"]')])
  await page.goto(`${APP}/admin/leads?site=${site.id}&range=all`, { waitUntil: 'domcontentloaded' })
  const signedIn = !new URL(page.url()).pathname.startsWith('/sign-in')
  t(signedIn, 'the operator is signed in to the console')
  if (!signedIn) throw new Error('console sign-in failed')

  const rowOf = (id: number | string) => page.locator('tr', { has: page.locator(`button[aria-label="Open lead ${id}"]`) })
  await page.waitForSelector(`button[aria-label="Open lead ${sa.id}"]`, { timeout: 30_000 })
  const badge = async (id: number | string, attr: string) => rowOf(id).locator(`[${attr}]`).first().getAttribute(attr)

  t((await badge(sa.id, 'data-lead-consent')) === 'accepted', '(10) the list shows the quiz lead\'s consent as accepted')
  t((await badge((collected.website as any).id, 'data-lead-consent')) === 'accepted', 'and the website lead\'s')
  t((await badge(oldLead.id, 'data-lead-consent')) === 'not-recorded', '(11) an old lead without consent reads "not recorded"')
  t(/not recorded/i.test(await rowOf(oldLead.id).innerText()), 'and the words are on the row, not just an attribute')
  t((await badge(oldLead.id, 'data-lead-delivery-state')) === 'not-attempted', 'and it does not pretend to have been delivered or queued')
  t((await badge(queuedLead.id, 'data-lead-delivery-state')) === 'queued', 'a queued lead is visibly Queued in the list')
  t(/queued/i.test(await rowOf(queuedLead.id).innerText()), 'with the word on the row')
  t((await badge(sa.id, 'data-lead-delivery-state')) === 'no-destination', 'a finished lead with no destination reads "no destination", not Delivered')
  t(!/delivered/i.test(await rowOf(sa.id).innerText()), 'and the row does not say Delivered anywhere')
  t((await badge(failedLead.id, 'data-lead-delivery-state')) === 'failed', 'a failed delivery is visibly Failed')
  const phoneKind = await badge(sa.id, 'data-lead-phone-state')
  t(phoneKind !== 'not-checked' && phoneKind !== null, `the phone result is never "not checked" once a lookup ran (${phoneKind})`)
  t(phoneKind !== 'valid' || Boolean(process.env.PLIVO_AUTH_ID), 'and is not "valid" without provider credentials')

  // The detail: full consent evidence.
  await page.locator(`button[aria-label="Open lead ${sa.id}"]`).first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.waitFor({ timeout: 15_000 })
  const evidence = norm(await dialog.locator('[data-lead-consent-text]').innerText())
  t(evidence === visible['standalone quiz'], 'the detail shows the EXACT disclosure the visitor saw')
  const dtext = await dialog.innerText()
  t(/accepted/i.test(dtext) && /unchecked box/i.test(dtext), 'states consent was an affirmative act')
  t(dtext.includes(`${RUN} QA Brand`), 'names the correct Brand')
  t(dtext.includes(`/s/${RUN}`) && dtext.includes(String(standaloneDep.id)), 'and the collecting deployment and path')
  t(dtext.includes(String(sa.consent.accepted_at).slice(0, 10)), 'and the accepted timestamp')
  t(dtext.includes('Ada Lovelace') && dtext.includes(`${RUN}-standalone@example.test`), 'contact data is there')
  t(/phone validation/i.test(dtext), 'the phone validation state is shown')
  await dialog.getByRole('button', { name: 'System Response' }).click()
  t((await dialog.innerText()).includes(RUN) && (await dialog.innerText()).includes('utm_source'), 'UTMs and attribution are shown')
  await dialog.getByRole('button', { name: 'HLR Trace' }).click()
  const hlrText = await dialog.innerText()
  t(!/^\s*Result\s*\n\s*Not checked/m.test(hlrText) || phoneKind === 'not-checked', 'the HLR tab does not say "Not checked" for a lookup that ran')
  await dialog.getByRole('button', { name: 'Delivery Log' }).click()
  const dlog = await dialog.innerText()
  t(/delivery\.queued/.test(dlog) && /delivery\.processing/.test(dlog) && /downstream\.completed/.test(dlog), 'the delivery history lists the queue and processing steps')
  t(/no destination configured/i.test(dlog) && !/retry delivery/i.test(dlog), 'and offers no retry where nothing failed')
  await page.keyboard.press('Escape')

  await page.locator(`button[aria-label="Open lead ${oldLead.id}"]`).first().click()
  const oldDialog = page.locator('[role="dialog"]')
  await oldDialog.waitFor({ timeout: 15_000 })
  t(/Consent was not recorded for this lead/.test(await oldDialog.innerText()), 'the old lead\'s detail says consent was not recorded')
  await page.keyboard.press('Escape')

  // Retry: only on a genuinely failed lead, confirmed, recorded, and contained.
  await page.locator(`button[aria-label="Open lead ${failedLead.id}"]`).first().click()
  const fd = page.locator('[role="dialog"]')
  await fd.waitFor({ timeout: 15_000 })
  await fd.getByRole('button', { name: 'Delivery Log' }).click()
  const retryBtn = fd.locator('[data-lead-retry]')
  t((await retryBtn.count()) === 1, 'a failed delivery offers Retry')
  await retryBtn.click()
  const note = fd.locator('[data-lead-retry-note]')
  await note.waitFor({ timeout: 30_000 })
  t((await note.getAttribute('data-lead-retry-note')) === 'ok' && /Retry/.test(await note.innerText()), 'and the operator gets a confirmation')
  const afterRetry = await waitFor(async () => {
    const d = await one('leads', failedLead.id)
    const log = (d.delivery_log ?? []) as Array<{ step: string }>
    return log.filter((e) => e.step === 'delivery.processing').length >= 2 && d.delivery_state === 'failed' ? d : null
  }, 60_000)
  t(Boolean(afterRetry), 'the retry ran through the queue and, against an unresolvable name, failed again honestly')
  if (afterRetry) {
    const steps = (afterRetry.delivery_log as Array<{ step: string }>).map((e) => e.step)
    t(steps.includes('delivery.retry_requested'), 'the retry request is in the delivery history')
    t(steps.filter((s) => s === 'webhook.qa-buyer').length === 2, 'and the second attempt is recorded next to the first, not over it')
    t(steps.includes('delivery.queued') && steps[0] === 'lead.captured', 'the original history is intact')
  }
  // Refused while nothing is failed: the button is gone, and so is the action.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator(`button[aria-label="Open lead ${sa.id}"]`).first().click()
  const nd = page.locator('[role="dialog"]')
  await nd.waitFor({ timeout: 15_000 })
  await nd.getByRole('button', { name: 'Delivery Log' }).click()
  t((await nd.locator('[data-lead-retry]').count()) === 0, 'a lead with nothing failed has no Retry control')
  t(consoleErrors.length === 0, `the console threw nothing${consoleErrors.length ? ` (${consoleErrors[0].slice(0, 100)})` : ''}`)

  await operator.close()
  await visitor.close()
  await browser.close()
} catch (err) {
  fail++
  console.log(`  FAIL the consent walk completed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  if (serverLog.length) console.log('  server tail:', serverLog.join('').slice(-800).replace(/\n/g, ' | '))
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await new Promise((r) => setTimeout(r, 800))
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
  }
  // Leads first: they reference the Brand.
  const extra = await payload.find({ collection: 'leads', where: { site: { equals: created.find((c) => c.collection === 'sites')?.id ?? 0 } }, limit: 200, depth: 0, overrideAccess: true }).catch(() => null)
  for (const d of extra?.docs ?? []) await payload.delete({ collection: 'leads', id: d.id, overrideAccess: true }).catch(() => null)
  for (const row of created.reverse()) await payload.delete({ collection: row.collection, id: row.id, overrideAccess: true }).catch(() => null)
}

console.log(`\n${pass} passed, ${fail} failed  [${browserProvenance()}]`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
process.exit(0)
