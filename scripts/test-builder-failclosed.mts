/**
 * Builder mutations must fail CLOSED, proven in a browser.
 *
 *   pnpm dev &                 # the app must be serving on :3000
 *   pnpm test:failclosed
 *
 * The defect this pins down is not a rendering bug and not something a unit
 * test can reach. Every mutating control in the builder tree writes the hopeful
 * state locally and then calls a server action, and a server action can fail in
 * two shapes:
 *
 *   - it RESOLVES with `{ ok: false, error }` — a refusal the action chose;
 *   - it REJECTS — a stale action id after a deploy ("Failed to find Server
 *     Action ..."), a dropped connection, a 5xx from the action endpoint.
 *
 * Only the first was ever handled. A rejection skipped BOTH the rollback and
 * the error message, so the row kept the operator's optimistic value while the
 * database kept the old one. On the pause control that is a live
 * legal-advertising funnel displayed as PAUSED while it goes on serving — an
 * operator gets visual confirmation of a stop that never happened.
 *
 * WHY A BROWSER: the failure lives in the gap between what the DOM asserts and
 * what the database holds, and nothing below the DOM can observe it.
 *
 * WHY ROUTE INTERCEPTION: the rejection is forced with Playwright's `page.route`
 * on the server-action POST, so nothing about the server changes and — the point
 * — the request never reaches it.
 *
 * NON-DESTRUCTIVE, unlike `scripts/test-admin-ui.mts` which disables stock
 * templates and repoints live deployments. Every mutating click in this file is
 * intercepted before it leaves the browser, so no record is written. The last
 * section proves that rather than asserting it: interception is torn down, the
 * page reloaded, and every status recorded at the start is required to be
 * exactly what it was.
 */
import { type Browser, type Page, type Route, type Request } from 'playwright'
import { existsSync } from 'node:fs'

import { launchChromium, browserProvenance } from './lib/browser.ts'

/*
 * `localhost`, not `127.0.0.1` — `next start` runs in production mode where the
 * CSRF allowlist (payload.config.ts) carries only `NEXT_PUBLIC_SERVER_URL`, so
 * a browser on `127.0.0.1:3000` sends an Origin the allowlist does not hold and
 * every action fails as a spurious "unauthenticated". Same reasoning as
 * test-admin-ui.mts; override with LEGALOS_UI_BASE.
 */
const BASE = process.env.LEGALOS_UI_BASE ?? 'http://localhost:3000'
const EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'team@legenex.com'
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'local-dev-password-9c1f'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const startedAt = Date.now()
const note = (msg: string): void => {
  console.log(`  [${Math.round((Date.now() - startedAt) / 1000)}s] ${msg}`)
}

const settle = async (page: Page): Promise<void> => {
  // Capped explicitly: with no argument this inherits the 180s navigation
  // budget, so one page holding a socket turns every settle into a stall.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(300)
}

/** Wait for the current toast to clear so the next assertion reads a fresh one. */
const clearToast = async (page: Page): Promise<void> => {
  await page.locator('[data-toast]').first().waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {})
}

/**
 * Navigate, tolerating the App Router finishing a navigation of its own.
 *
 * Signing in leaves a client-side route transition in flight, and a `goto` that
 * lands mid-transition is cancelled by Chromium as `net::ERR_ABORTED` — while
 * the server log shows the very same request answered 200. It reads as a broken
 * page and is a race. Retrying once after letting the app settle is the honest
 * fix; a longer fixed sleep would only make the race rarer.
 */
const gotoAdmin = async (page: Page, path: string): Promise<void> => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
      await settle(page)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === 3 || !/ERR_ABORTED/.test(message)) throw err
      await page.waitForTimeout(1_000)
    }
  }
}

const signIn = async (page: Page): Promise<void> => {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await settle(page)
}

/* ------------------------------------------------------------ interception */

/**
 * How a Next server action is recognised on the wire.
 *
 * It is a POST to the page's own URL carrying a `next-action` header naming the
 * action id — NOT a distinct path — so a URL-glob route would either miss it or
 * swallow the page's own navigations. Matching on the header is what makes this
 * precise enough to leave every other request alone, which is what keeps the run
 * non-destructive: only the mutation is stopped.
 */
const isServerAction = (request: Request): boolean =>
  request.method() === 'POST' && Boolean(request.headers()['next-action'])

type FailureMode = 'abort' | 'error500' | 'stale404'

/**
 * The three ways a real deployment produces a REJECTED action promise.
 *
 * `stale404` reproduces the exact string the production log is full of. All
 * three must land in the same place — rolled back, and said out loud — because
 * an operator cannot tell them apart and the funnel does not care which it was.
 */
const failureBody = (mode: FailureMode): { status: number; contentType: string; body: string } =>
  mode === 'stale404'
    ? { status: 404, contentType: 'text/plain', body: 'Failed to find Server Action "7f2c9a1b". This request might be from an older or newer deployment.' }
    : { status: 500, contentType: 'text/plain', body: 'Internal Server Error' }

/**
 * Break the NEXT server action this page fires, and only that one.
 *
 * Returns a disposer plus a counter, because "the UI rolled back" is only
 * evidence if the mutation was actually attempted — a click that silently did
 * nothing would otherwise pass every assertion below.
 */
const breakNextAction = async (page: Page, mode: FailureMode) => {
  const state = { intercepted: 0 }
  const handler = async (route: Route, request: Request): Promise<void> => {
    if (!isServerAction(request)) { await route.fallback(); return }
    state.intercepted += 1
    if (mode === 'abort') { await route.abort('connectionfailed'); return }
    await route.fulfill(failureBody(mode))
  }
  await page.route('**/*', handler)
  return {
    state,
    dispose: async (): Promise<void> => { await page.unroute('**/*', handler) },
  }
}

/**
 * One fail-closed case, end to end.
 *
 * `readState` is the row's own claim about itself, taken from a `data-*` hook
 * rather than from pill text so a wording change cannot turn this green.
 */
const expectFailClosed = async (
  page: Page,
  {
    label,
    mode,
    readState,
    click,
  }: {
    label: string
    mode: FailureMode
    readState: () => Promise<string | null>
    click: () => Promise<void>
  },
): Promise<void> => {
  await clearToast(page)
  const before = await readState()
  t(before !== null, `${label}: the control's state is readable before the click (${before})`)

  const broken = await breakNextAction(page, mode)
  try {
    await click()

    // The error is what tells the operator the control did not take, so it is
    // waited for rather than sampled — the rollback lands in the same tick, but
    // the message crosses a network round trip first.
    const toast = page.locator('[data-toast]')
    await toast.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})

    t(broken.state.intercepted > 0, `${label}: the click really did fire a server action (${broken.state.intercepted} intercepted)`)

    const shown = (await toast.count()) > 0
    const toastType = shown ? await toast.first().getAttribute('data-toast-type') : null
    const toastText = shown ? (await toast.first().innerText()).replace(/\s+/g, ' ').trim() : ''
    t(shown && toastType === 'error', `${label}: a VISIBLE error is shown to the operator (type=${toastType ?? 'none'}: "${toastText}")`)
    // An error nobody is looking at has to reach a screen reader too, and a
    // silent-by-default toast is exactly the control that gets missed.
    if (shown) {
      t(
        (await toast.first().getAttribute('role')) === 'alert',
        `${label}: and the error is announced assertively (role=${await toast.first().getAttribute('role')})`,
      )
    }

    // The assertion the blocker is about: the row must not go on claiming the
    // state the operator asked for when the write never landed.
    const after = await readState()
    t(after === before, `${label}: the optimistic state rolled back (${before} -> ${after})`)
  } finally {
    await broken.dispose()
  }

  // ...and it must still be rolled back once the reconcile has come back from
  // the server, which is the half a purely local undo would get wrong.
  await settle(page)
  const settled = await readState()
  t(settled === before, `${label}: still ${before} after the screen reconciles with the server (${settled})`)
  await clearToast(page)
}

/* -------------------------------------------------------------------- run */

const run = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } } as never)
  page.setDefaultTimeout(30_000)
  // A cold dev server compiles these routes on first hit; navigation gets its
  // own, longer budget so a slow compile reads as slow rather than as broken.
  page.setDefaultNavigationTimeout(180_000)

  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await signIn(page)
  t(!page.url().includes('sign-in'), 'signed in to the admin')

  /* =========================================== QUIZ DEPLOYMENT: pause/publish */

  note('section: quiz deployment status toggle')

  await gotoAdmin(page, '/admin/quizzes')
  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)

  const quizRow = page.locator('[data-quiz-deployment]').first()
  const haveQuizDep = (await page.locator('[data-quiz-deployment]').count()) > 0
  t(haveQuizDep, 'a quiz deployment exists to exercise the pause control on')

  /*
   * The ids and statuses the run STARTS from. Re-read at the end against a
   * server the harness has stopped lying to, they are what proves this suite
   * changed nothing — the claim `test-admin-ui.mts` cannot make.
   */
  const quizBaseline = await page.locator('[data-quiz-deployment]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.quizDeployment ?? '', (e as HTMLElement).dataset.quizDeploymentStatus ?? '']),
  )

  if (haveQuizDep) {
    const quizDepId = await quizRow.getAttribute('data-quiz-deployment')
    const readQuizStatus = () =>
      page.locator(`[data-quiz-deployment="${quizDepId}"]`).getAttribute('data-quiz-deployment-status').catch(() => null)
    const clickQuizToggle = async () => {
      await page
        .locator(`[data-quiz-deployment="${quizDepId}"]`)
        .getByRole('button', { name: /^(publish|unpublish) deployment$/i })
        .first()
        .click()
    }

    // Three rejection shapes, one required outcome. `stale404` is the one
    // production is actually producing.
    for (const mode of ['stale404', 'abort', 'error500'] as const) {
      await expectFailClosed(page, {
        label: `quiz deployment status (${mode})`,
        mode,
        readState: readQuizStatus,
        click: clickQuizToggle,
      })
    }
  }

  /* ================================================ QUIZ FLOW: publish toggle */

  note('section: quiz flow publish toggle')

  await page.locator('[data-quiz-tab="quizzes"]').first().click()
  await settle(page)

  const flowRows = await page.locator('[data-quiz-flow][data-quiz-flow-archived="false"]').count()
  t(flowRows > 0, `an active quiz flow exists to exercise the publish control on (${flowRows})`)
  const flowBaseline = await page.locator('[data-quiz-flow]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.quizFlow ?? '', (e as HTMLElement).dataset.quizFlowPublished ?? '']),
  )

  if (flowRows > 0) {
    const flowId = await page.locator('[data-quiz-flow][data-quiz-flow-archived="false"]').first().getAttribute('data-quiz-flow')
    await expectFailClosed(page, {
      label: 'quiz flow publish',
      mode: 'stale404',
      readState: () =>
        page.locator(`[data-quiz-flow="${flowId}"]`).getAttribute('data-quiz-flow-published').catch(() => null),
      click: async () => {
        await page
          .locator(`[data-quiz-flow="${flowId}"]`)
          .getByRole('button', { name: /^(publish|unpublish)$/i })
          .first()
          .click()
      },
    })
  }

  /* ================================= LANDING PAGE DEPLOYMENT: pause/publish */

  note('section: landing-page deployment status toggle')

  await gotoAdmin(page, '/admin/landing-pages')
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)

  const lpCount = await page.locator('[data-lp-deployment]').count()
  t(lpCount > 0, `a landing-page deployment exists to exercise the pause control on (${lpCount})`)
  const lpBaseline = await page.locator('[data-lp-deployment]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.lpDeployment ?? '', (e as HTMLElement).dataset.lpDeploymentStatus ?? '']),
  )

  if (lpCount > 0) {
    const lpId = await page.locator('[data-lp-deployment]').first().getAttribute('data-lp-deployment')
    await expectFailClosed(page, {
      label: 'landing-page deployment status',
      mode: 'stale404',
      readState: () =>
        page.locator(`[data-lp-deployment="${lpId}"]`).getAttribute('data-lp-deployment-status').catch(() => null),
      click: async () => {
        await page
          .locator(`[data-lp-deployment="${lpId}"]`)
          .getByRole('button', { name: /publish|pause|unpublish|go live|take down/i })
          .first()
          .click()
      },
    })
  }

  /* ============================================ the run wrote NOTHING at all */

  note('section: non-destructiveness')

  /*
   * Proven, not asserted. Interception is long gone, so this reload reads the
   * database through the same route the operator does. Every status recorded
   * before the clicks has to come back identical — if any mutation had escaped
   * the intercept, this is where a live funnel would show up paused.
   */
  await gotoAdmin(page, '/admin/quizzes')
  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  const quizAfter = await page.locator('[data-quiz-deployment]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.quizDeployment ?? '', (e as HTMLElement).dataset.quizDeploymentStatus ?? '']),
  )
  t(
    JSON.stringify(quizAfter) === JSON.stringify(quizBaseline),
    `no quiz deployment was written (${JSON.stringify(quizBaseline)} vs ${JSON.stringify(quizAfter)})`,
  )

  await page.locator('[data-quiz-tab="quizzes"]').first().click()
  await settle(page)
  const flowAfter = await page.locator('[data-quiz-flow]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.quizFlow ?? '', (e as HTMLElement).dataset.quizFlowPublished ?? '']),
  )
  t(
    JSON.stringify(flowAfter) === JSON.stringify(flowBaseline),
    `no quiz flow was published or unpublished (${JSON.stringify(flowBaseline)} vs ${JSON.stringify(flowAfter)})`,
  )

  await gotoAdmin(page, '/admin/landing-pages')
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)
  const lpAfter = await page.locator('[data-lp-deployment]').evaluateAll((els) =>
    els.map((e) => [(e as HTMLElement).dataset.lpDeployment ?? '', (e as HTMLElement).dataset.lpDeploymentStatus ?? '']),
  )
  t(
    JSON.stringify(lpAfter) === JSON.stringify(lpBaseline),
    `no landing-page deployment was written (${JSON.stringify(lpBaseline)} vs ${JSON.stringify(lpAfter)})`,
  )

  /*
   * A rejected action must be HANDLED, not merely survived. An unhandled promise
   * rejection surfaces here as a pageerror, which is precisely the shape the
   * old fire-and-forget calls produced.
   */
  t(pageErrors.length === 0, `no unhandled client exception across the run (${pageErrors.slice(0, 3).join(' | ')})`)

  await page.close()
}

/*
 * The pre-installed Chromium, when the pinned Playwright wants a different one.
 * `LEGALOS_CHROMIUM_PATH` is honoured by `launchChromium`; this adds the same
 * sandbox-image fallback `test-admin-ui.mts` carries.
 */
if (
  !process.env.LEGALOS_CHROMIUM_PATH &&
  existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
) {
  process.env.LEGALOS_CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
}

console.log(`  browser: ${browserProvenance()}`)
/*
 * `--disable-dev-shm-usage` is not optional in a container.
 *
 * Chromium puts renderer shared memory in /dev/shm, which Docker defaults to
 * 64MB. The admin bundles overrun that and the tab dies as "Page crashed" —
 * which reads as a broken page and is actually a missing flag. The switch moves
 * that allocation to /tmp.
 */
const browser = await launchChromium({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})
try {
  await run(browser)
} catch (err) {
  fail++
  console.log('  FAIL suite threw: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)))
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
