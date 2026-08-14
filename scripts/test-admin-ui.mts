/**
 * The correction, proven in a browser against the running admin.
 *
 *   pnpm dev &                 # the app must be serving on :3000
 *   pnpm test:ui
 *
 * Everything else in the suite is a unit test, a source scan or a resolver
 * called directly. None of those can answer the question the correction brief
 * actually asks, which is about what an operator SEES: whether Landing Pages
 * still has two tabs, whether the template cards offer Preview and Select,
 * whether a selection survives a save and a reload.
 *
 * So this drives the real admin with a real login, clicks the real controls,
 * and reads the DOM back. It also writes the screenshots the brief asks for
 * into `docs/screenshots/`.
 *
 * It asserts on `data-*` hooks rather than on visible text wherever a hook
 * exists, because a test that matches on copy fails when somebody improves the
 * wording and passes when somebody breaks the behaviour. The exceptions are the
 * tab labels themselves — those ARE the requirement, so they are matched as
 * text on purpose.
 *
 * Beyond the desktop feature flow, the suite also covers what "verified in a
 * browser" has to mean for requirement H:
 *
 *  - CONSOLE errors are collected per page alongside `pageerror`. A server
 *    exception surfaces as a pageerror; a hydration mismatch, a failed
 *    same-origin asset or a React error surfaces only on the console, and a
 *    suite that ignores the console calls all of those a pass. The one
 *    tolerated shape is a failed EXTERNAL resource load (this sandbox has no
 *    outbound network, so Google Fonts stylesheets reset) — see
 *    `isAllowedConsoleError` for exactly why that and nothing else.
 *
 *  - KEYBOARD: the Landing Pages tabs must be reachable by Tab alone, paint a
 *    focus ring that is actually visible on the surface it sits on (contrast
 *    measured, not presence-checked — Chromium's UA ring computes to a
 *    near-black color here and was invisible on the dark admin), and activate
 *    on Enter and on Space. Row and gallery actions must be real, accessibly
 *    named <button>s.
 *
 *  - MOBILE (390x844): the two template lists, both deployment editors and a
 *    live PUBLIC landing page must not overflow the viewport sideways, and
 *    their controls must stay usable. The public page is reached through the
 *    authenticated `?site=` preview channel because Chromium refuses a Host
 *    header override on navigation (net::ERR_INVALID_ARGUMENT) — same
 *    resolver, same renderer, same template as the Host-routed page the
 *    node-level block above already proves.
 */
import { chromium, type Browser, type Page } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
/*
 * `node:http`, not `fetch`.
 *
 * `Host` is a forbidden header in the fetch spec and undici drops it SILENTLY —
 * so every request went out as `Host: 127.0.0.1:3000`, resolved to the fallback
 * site, and this whole block measured the wrong pages while reporting success.
 * curl honours the header, which is how the discrepancy surfaced. A raw request
 * is the only way to ask the public router the question it actually answers.
 */
import { request as httpRequest } from 'node:http'

import { resolveTemplate } from '../src/lib/template-registry.ts'
import { asSlotted } from '../src/lib/lp-templates/index.ts'
// The suite's own WCAG math is the app's WCAG math. CLAUDE.md: never
// reimplement luminance/ratio — page-lint owns it and is pure.
import { contrastRatio } from '../src/lib/builder/page-lint.ts'

/*
 * Default to `localhost`, not `127.0.0.1`.
 *
 * `next start` runs in production mode, where the CSRF allowlist
 * (payload.config.ts) is only `NEXT_PUBLIC_SERVER_URL` — the localhost/127
 * dev origins are added ONLY outside production. `NEXT_PUBLIC_SERVER_URL`
 * defaults to `http://localhost:3000`, so a browser navigating to
 * `http://127.0.0.1:3000` sends an Origin the allowlist does not carry, and
 * Payload's cookie auth returns `user = null` — every admin action then fails
 * as a spurious "unauthenticated" while the app is perfectly fine. Defaulting
 * to `localhost` makes `pnpm test:ui` pass out of the box against a stock
 * server; override with LEGALOS_UI_BASE to point elsewhere. `fetchAs` below
 * connects to this host/port but sets its own `Host` header, so the public-page
 * probes are unaffected by the choice.
 */
const BASE = process.env.LEGALOS_UI_BASE ?? 'http://localhost:3000'
const EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'team@legenex.com'
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'local-dev-password-9c1f'
const SHOTS = new URL('../docs/screenshots/', import.meta.url).pathname

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

/** Elapsed-stamped progress line, so a stalled run names its stalled section. */
const startedAt = Date.now()
const note = (msg: string): void => {
  console.log(`  [${Math.round((Date.now() - startedAt) / 1000)}s] ${msg}`)
}

/** Visible text of everything matching a selector, trimmed. */
const texts = async (page: Page, selector: string): Promise<string[]> =>
  (await page.locator(selector).allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)

const bodyText = async (page: Page): Promise<string> =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ')

const settle = async (page: Page): Promise<void> => {
  /*
   * Capped at 8s, explicitly. With no timeout argument this call inherits the
   * 180-SECOND navigation budget, so any page holding a socket open turns
   * every settle into a three-minute stall — the suite once spent six minutes
   * between two screenshots exactly this way. A healthy admin page reaches
   * networkidle in ~0.5s; anything still busy after 8s is not going to get
   * quieter, and the 400ms grace below plus the explicit waits at each
   * assertion site are what correctness actually rests on.
   */
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(400)
  /*
   * A confirm dialog left open swallows every later click, so one missed step
   * reads as five unrelated timeouts somewhere else entirely. Anything still up
   * here is a step that did not finish, and it is reported rather than
   * dismissed silently.
   */
  const stray = page.locator('[data-confirm-dialog]')
  if (await stray.count()) {
    const label = await stray.first().getAttribute('aria-label')
    process.stdout.write(`  note: dismissing a confirm dialog left open — ${label}\n`)
    await stray.first().getByRole('button', { name: /cancel/i }).first().click().catch(() => {})
    await stray.first().waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  }
  /*
   * Toasts are absolutely positioned and sit over the row that produced them,
   * so the next click lands on the toast instead of the button. Waiting for it
   * to clear is the honest fix: forcing the click would dispatch an event the
   * user could not have produced, and would pass on a UI where a toast
   * permanently covers a control.
   */
  await page
    .locator('[data-toast], [role="status"], [role="alert"]')
    .first()
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => {})
}

/**
 * Wait for a list to reach a size rather than sleeping and hoping.
 *
 * A server action plus `router.refresh()` is two round trips, and a fixed delay
 * that is long enough on a warm dev server is not long enough on a cold one.
 * The first version of this file read the count too early and reported that
 * Clone had done nothing, while the row it created sat in the database.
 */
const waitForCount = async (page: Page, selector: string, expected: number): Promise<number> => {
  const deadline = Date.now() + 20_000
  let seen = await page.locator(selector).count()
  while (seen !== expected && Date.now() < deadline) {
    await page.waitForTimeout(500)
    seen = await page.locator(selector).count()
  }
  return seen
}

/**
 * Accept the app's own confirm dialog.
 *
 * Destructive actions here go through `ConfirmDialog`, not `window.confirm`, so
 * `page.on('dialog')` never fires and the modal simply stays up — swallowing
 * every later click, which is how a missing confirm step reads as five
 * unrelated timeouts.
 */
const confirmDialog = async (page: Page, button: RegExp): Promise<void> => {
  const dialog = page.locator('[data-confirm-dialog]')
  await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  if (!(await dialog.count())) return
  await dialog.getByRole('button', { name: button }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
}

/**
 * Open the first deployment in a list.
 *
 * The row itself is not the control — the name is a rename affordance and the
 * row carries several buttons — so this clicks whichever of Open/Edit/Configure
 * the list offers, falling back to the row.
 */
const openFirstDeployment = async (page: Page, rowSelector: string): Promise<void> => {
  const row = page.locator(rowSelector).first()
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  const open = row.getByRole('button', { name: /open|edit|configure|settings/i }).first()
  if (await open.count()) await open.click()
  else await row.click()
  await settle(page)
}

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true })
  console.log(`  shot docs/screenshots/${name}.png`)
}

/** Viewport-sized shot: what a phone user actually sees, not an unrolled page. */
const shotViewport = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: false })
  console.log(`  shot docs/screenshots/${name}.png`)
}

/**
 * The ONLY console errors the suite tolerates, and why.
 *
 * This sandbox has no outbound network, so the Google Fonts stylesheets the
 * builder shell and the ported templates request come back
 * `net::ERR_CONNECTION_RESET` (observed on fonts.googleapis.com/css2?family=…
 * for the admin's Inter/Fredoka set and each template's own font set). In
 * production those exact URLs load; the failure is the environment's, not the
 * product's. The rule is deliberately narrow on BOTH axes: the message must be
 * a resource-load report, AND the resource must live on a different origin
 * than the app — so a 404'd same-origin chunk, image or API call still fails
 * the run, and every scripting error (hydration mismatches included, which
 * React reports via console.error) always fails regardless of origin.
 */
const isAllowedConsoleError = (text: string, url: string): boolean => {
  if (!/Failed to load resource/i.test(text)) return false
  try {
    return new URL(url).origin !== new URL(BASE).origin
  } catch {
    return false
  }
}

/**
 * Attach a console-error collector to a page and hand back the live array.
 * `msg.location().url` names the failing resource for load failures — the
 * message text alone says only "Failed to load resource", which is not enough
 * to tell a blocked font from a broken chunk.
 */
const trackConsoleErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const url = msg.location().url ?? ''
    if (isAllowedConsoleError(msg.text(), url)) return
    errors.push(`${msg.text().slice(0, 200)}${url ? ` <${url}>` : ''} @ ${page.url()}`)
  })
  return errors
}

/** `rgb(a)()` from getComputedStyle → #rrggbb, or null for none/transparent. */
const cssColorToHex = (css: string): string | null => {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (!m) return null
  if (m[4] !== undefined && Number(m[4]) === 0) return null
  const h = (n: string) => Number(n).toString(16).padStart(2, '0')
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`
}

/**
 * A tab set must be real, focusable, accessibly named <button>s.
 *
 * Evaluated as a STRING, not a closure: tsx's esbuild pass decorates inner
 * declarations with a `__name` helper that does not exist inside the page, so
 * a multi-statement closure throws `__name is not defined` at runtime.
 */
const auditTabSet = async (page: Page, selector: string, expected: number, label: string): Promise<void> => {
  const audit = (await page.evaluate(`(() => {
    const els = Array.from(document.querySelectorAll('${selector}'))
    return {
      count: els.length,
      buttons: els.filter((e) => e.tagName === 'BUTTON').length,
      focusable: els.filter((e) => e.tabIndex >= 0 && !e.disabled).length,
      named: els.filter((e) => ((e.getAttribute('aria-label') || e.textContent || '').trim().length > 0)).length,
    }
  })()`)) as { count: number; buttons: number; focusable: number; named: number }
  t(
    audit.count === expected && audit.buttons === expected,
    `${label}: all ${expected} tabs are real <button>s (${audit.buttons} buttons of ${audit.count} found)`,
  )
  t(
    audit.focusable === expected && audit.named === expected,
    `${label}: every tab is keyboard-focusable with an accessible name (${audit.focusable} focusable, ${audit.named} named)`,
  )
}

/**
 * Every action control inside the matched containers must be a real <button>
 * carrying an accessible name (aria-label or visible text), and nothing may
 * fake buttonhood with role="button" on a div. `expectedControls` keeps the
 * audit honest: an empty container would otherwise pass every `every()`.
 */
const auditActionControls = async (
  page: Page,
  containerSelector: string,
  minContainers: number,
  minButtonsPer: number,
  label: string,
): Promise<void> => {
  const audit = (await page.evaluate(`(() => {
    const boxes = Array.from(document.querySelectorAll('${containerSelector}'))
    const buttons = boxes.flatMap((b) => Array.from(b.querySelectorAll('button')))
    return {
      boxes: boxes.length,
      buttons: buttons.length,
      unnamed: buttons.filter((b) => !((b.getAttribute('aria-label') || b.textContent || '').trim())).length,
      fakes: boxes.flatMap((b) => Array.from(b.querySelectorAll('[role="button"]'))).filter((e) => e.tagName !== 'BUTTON').length,
    }
  })()`)) as { boxes: number; buttons: number; unnamed: number; fakes: number }
  t(
    audit.boxes >= minContainers && audit.buttons >= audit.boxes * minButtonsPer,
    `${label}: present and carrying controls (${audit.boxes} rows/cards, ${audit.buttons} buttons)`,
  )
  t(
    audit.unnamed === 0 && audit.fakes === 0,
    `${label}: every control is a real <button> with an accessible name (${audit.unnamed} unnamed, ${audit.fakes} role="button" fakes)`,
  )
}

/**
 * The document itself must not scroll sideways at the current viewport.
 * +1 forgives a rounding pixel and nothing more; a real overflow is tens of
 * pixels, and a tolerance that hid one would hide them all.
 */
const assertNoHorizontalOverflow = async (page: Page, label: string): Promise<void> => {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }))
  t(m.scrollW <= m.innerW + 1, `${label}: no horizontal overflow (scrollWidth ${m.scrollW} vs viewport ${m.innerW})`)
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

const run = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } } as never)
  page.setDefaultTimeout(30_000)
  // A cold dev server compiles these routes on first hit and the admin bundles
  // are large. Navigation gets its own, longer budget so a slow compile reads
  // as slow rather than as a broken page.
  page.setDefaultNavigationTimeout(180_000)

  // A server exception renders as a Next error overlay rather than a failed
  // request, so a suite that only checked status codes would pass on a broken
  // page. Collected and asserted per screen.
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  // The console is the other half of "no client errors": hydration mismatches,
  // React errors and broken same-origin assets report there, not as pageerror.
  const consoleErrors = trackConsoleErrors(page)

  await signIn(page)
  t(!page.url().includes('sign-in'), 'signed in to the admin')

  /* ============================================ LANDING PAGES: the tabs */

  note('section: Landing Pages templates')

  await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  const lpTabs = await texts(page, '[data-lp-tab]')
  const lpTabNames = lpTabs.map((s) => s.replace(/\s*\d+\s*$/, '').trim())

  t(lpTabs.length === 2, `Landing Pages has exactly two top-level tabs (found ${lpTabs.length}: ${lpTabs.join(' | ')})`)
  t(lpTabNames.some((s) => /^Templates$/i.test(s)), 'Landing Pages has a Templates tab')
  t(lpTabNames.some((s) => /^Deployments$/i.test(s)), 'Landing Pages has a Deployments tab')
  t(!lpTabNames.some((s) => /^Pages$/i.test(s)), 'the old Pages tab is GONE')

  await auditTabSet(page, '[data-lp-tab]', 2, 'Landing Pages top-level tabs')

  /* ------------------------------------ keyboard: reach, see, activate */

  /*
   * Blur programmatically rather than clicking a "safe" corner: the top-left
   * corner of the viewport is the sidebar's logo link, and clicking it
   * navigates away — which is how an earlier draft of this block measured a
   * page with no tabs on it and reported the tabs unreachable.
   */
  await page.evaluate('document.activeElement && document.activeElement.blur()')
  let tabPresses = 0
  let reachedTab = false
  // ~24 presses reach the tab bar today (sidebar links first). 40 is the
  // bound: enough head-room for a new nav item, small enough that a focus
  // trap or a skipped-over tab bar still fails rather than spinning.
  for (let i = 1; i <= 40 && !reachedTab; i++) {
    await page.keyboard.press('Tab')
    tabPresses = i
    reachedTab = Boolean(
      await page.evaluate('document.activeElement !== null && document.activeElement.hasAttribute("data-lp-tab")'),
    )
  }
  t(reachedTab, `the Templates/Deployments tabs are reachable by Tab alone (gave up after ${tabPresses} presses)`)

  /*
   * The focus indicator is measured for CONTRAST, not for presence. Chromium's
   * UA ring (`outline: auto`) computes to near-black here and painted an
   * invisible ring on the dark admin — outlineStyle was truthy the whole time.
   * So the ring's color has to clear WCAG 2.2's 3:1 non-text minimum against
   * the surface the tab actually sits on (the builder theme's T.bg, #252E39).
   */
  const focusIndicator = (await page.evaluate(`(() => {
    const el = document.activeElement
    if (!el) return null
    const cs = getComputedStyle(el)
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow }
  })()`)) as { outlineStyle: string; outlineWidth: string; outlineColor: string; boxShadow: string } | null
  const ringDrawn = Boolean(
    focusIndicator &&
      ((focusIndicator.outlineStyle !== 'none' && parseFloat(focusIndicator.outlineWidth) > 0) ||
        (focusIndicator.boxShadow && focusIndicator.boxShadow !== 'none')),
  )
  t(ringDrawn, `the keyboard-focused tab draws a focus indicator (${JSON.stringify(focusIndicator)})`)
  const ringHex =
    focusIndicator && focusIndicator.outlineStyle !== 'none'
      ? cssColorToHex(focusIndicator.outlineColor)
      : focusIndicator
        ? cssColorToHex(focusIndicator.boxShadow)
        : null
  const ringContrast = ringHex ? contrastRatio(ringHex, '#252E39') : null
  t(
    ringDrawn && ringHex !== null && ringContrast !== null && ringContrast >= 3,
    `and the indicator is visible on the dark surface (${ringHex ?? 'no color'} vs #252E39 = ${ringContrast?.toFixed(2) ?? '?'}:1, needs 3:1)`,
  )

  // Enter and Space must both activate the focused tab. DOM order puts
  // Templates first, so one more Tab lands on Deployments — the inactive one,
  // which is the honest activation target.
  const firstFocused = (await page.evaluate('document.activeElement && document.activeElement.getAttribute("data-lp-tab")')) as string | null
  if (firstFocused === 'templates') await page.keyboard.press('Tab')
  t(
    (await page.evaluate('document.activeElement && document.activeElement.getAttribute("data-lp-tab")')) === 'deployments',
    'Tab moves on to the Deployments tab',
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  t(
    (await page.evaluate('document.activeElement && document.activeElement.getAttribute("aria-current")')) === 'true',
    'Enter activates the focused tab (aria-current flips to the Deployments tab)',
  )
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press(' ')
  await page.waitForTimeout(500)
  const afterSpace = (await page.evaluate(`(() => {
    const tpl = document.querySelector('[data-lp-tab="templates"]')
    const dep = document.querySelector('[data-lp-tab="deployments"]')
    return { tpl: tpl ? tpl.getAttribute('aria-current') : 'missing', dep: dep ? dep.getAttribute('aria-current') : 'missing' }
  })()`)) as { tpl: string | null; dep: string | null }
  t(afterSpace.tpl === 'true', 'Space activates the focused tab (back on Templates)')
  t(afterSpace.dep === null, 'and exactly one tab is current at a time')
  await settle(page)

  /* -------------------------------------- the library is the real templates */

  const lpRows = await page.locator('[data-lp-template]').count()
  t(lpRows >= 12, `the Templates tab lists at least the twelve stock templates (found ${lpRows})`)

  const lpBody = await bodyText(page)
  t(!/MVA Pain First/i.test(lpBody), '"MVA Pain First" is not in the template library')
  t(!/Editorial Test/i.test(lpBody), '"Editorial Test" is not in the template library')
  t(/Editorial Investigation/i.test(lpBody), 'the real template "Editorial Investigation" is listed')
  t(/Human Recovery Story/i.test(lpBody), 'the real template "Human Recovery Story" is listed')
  t(/Case Value Dossier/i.test(lpBody), 'the real template "Case Value Dossier" is listed')

  await shot(page, 'landing-page-templates')

  /* ------------------------------------------------ per-template actions */

  /*
   * Asked by ACCESSIBLE NAME, not visible text.
   *
   * Clone and Delete are icon buttons carrying an `aria-label`, which is what
   * "offers Clone" means for a control with no glyph text — and a test that
   * demanded a visible word would be enforcing a design decision rather than
   * the requirement. `getByRole('button', {name})` matches the accessible name,
   * so it covers both treatments and would fail on an icon button with no label
   * at all, which is the case that actually matters.
   */
  const firstRow = page.locator('[data-lp-template]').first()
  const rowAction = (row: ReturnType<Page['locator']>, name: RegExp) =>
    row.getByRole('button', { name }).first()

  for (const [action, re] of [
    ['Preview', /preview/i],
    ['Edit', /edit/i],
    ['Clone', /clone/i],
    ['Delete', /delete/i],
  ] as const) {
    t((await rowAction(firstRow, re).count()) > 0, `a template row offers ${action}`)
  }
  t(
    (await rowAction(firstRow, /disable|enable/i).count()) > 0,
    'a template row offers Enable/Disable',
  )

  // Not just the first row: EVERY control on EVERY row must be a real,
  // accessibly named <button>. Five verbs per row (Preview / Edit /
  // Enable-Disable / Clone / Delete) is the floor.
  await auditActionControls(page, '[data-lp-template]', 12, 5, 'LP template rows')

  /*
   * Clone, then delete the clone, identified by ROW ID rather than by text.
   *
   * Filtering rows on /copy/i looked obvious and was wrong: several template
   * blurbs contain the word "copy", so the filter matched a STOCK row and the
   * suite spent three runs trying to delete the library and reporting the
   * failure three assertions downstream as an unrelated timeout. Diffing the id
   * set is exact and cannot be fooled by wording.
   */
  const rowIds = async (): Promise<string[]> =>
    (
      await page
        .locator('[data-lp-template]')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.lpTemplate ?? ''))
    ).filter(Boolean)

  note('clone/delete flow')
  const idsBefore = await rowIds()
  const beforeClone = idsBefore.length

  await rowAction(firstRow, /clone/i).click()
  const afterClone = await waitForCount(page, '[data-lp-template]', beforeClone + 1)
  t(afterClone === beforeClone + 1, `Clone adds one template (${beforeClone} -> ${afterClone})`)

  const newIds = (await rowIds()).filter((id) => !idsBefore.includes(id))
  t(newIds.length === 1, `the clone is a new row in the library (${newIds.join(',') || 'none'})`)

  const clonedRow = page.locator(`[data-lp-template="${newIds[0]}"]`)
  const cloneName = (await clonedRow.getAttribute('data-lp-template-name')) ?? ''
  t(/copy$/i.test(cloneName), `the clone is named after its source (${cloneName})`)
  t(
    (await clonedRow.getAttribute('data-lp-template-origin')) === 'clone',
    'and is recorded as a clone rather than as library stock',
  )

  /*
   * No `settle()` between the click and the confirmation. `settle()` dismisses a
   * stray dialog, which is right everywhere else and exactly wrong here: the
   * dialog this click opens is not stray, and cancelling it made the delete
   * never happen.
   */
  const dialog = page.locator('[data-confirm-dialog]')
  await rowAction(clonedRow, /delete/i).click()
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  const confirmLabel = (await dialog.first().getAttribute('aria-label')) ?? ''
  t(
    confirmLabel.includes(cloneName),
    `the delete confirmation is about the clone, not a stock template (${confirmLabel})`,
  )
  await dialog.first().getByRole('button', { name: /^delete$/i }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})

  const afterDelete = await waitForCount(page, '[data-lp-template]', beforeClone)
  t(afterDelete === beforeClone, `Delete removes an unreferenced clone (${afterDelete})`)
  t(!(await rowIds()).includes(newIds[0]), 'and the deleted row is gone from the library')

  /*
   * A STOCK template deletes differently, and the difference is the point:
   * reconcile rebuilds the library from code on every boot, so dropping the row
   * would resurrect it and the delete would look like it had silently failed.
   */
  const stockRow = page.locator('[data-lp-template][data-lp-template-origin="stock"]').first()
  const stockName = (await stockRow.getAttribute('data-lp-template-name')) ?? ''
  await rowAction(stockRow, /delete/i).click()
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  t(
    /archiv/i.test((await dialog.first().innerText()).replace(/\s+/g, ' ')),
    'deleting a STOCK template warns that it is archived rather than dropped',
  )
  await dialog.first().getByRole('button', { name: /cancel/i }).first().click()
  await dialog.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  t(
    (await page.locator(`[data-lp-template-name="${stockName}"]`).count()) === 1,
    'and cancelling leaves it in the library',
  )

  // Disable: state must be visible and must survive a reload.
  const target = page.locator('[data-lp-template]').first()
  const targetName = (await target.getAttribute('data-lp-template-name')) ?? ''
  await rowAction(target, /^disable/i).click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const disabledRow = targetName
    ? page.locator(`[data-lp-template-name="${targetName}"]`).first()
    : page.locator('[data-lp-template]').first()
  t(
    (await rowAction(disabledRow, /^enable/i).count()) > 0,
    'Disable persists across a reload (the row now offers Enable)',
  )
  await rowAction(disabledRow, /^enable/i).click()
  await settle(page)

  // Preview: opens something showing the template, and closes again.
  await rowAction(page.locator('[data-lp-template]').first(), /preview/i).click()
  await settle(page)
  t(
    (await page.locator('[data-preview-modal], [data-modal], [role="dialog"]').count()) > 0,
    'Preview opens a real rendered preview',
  )
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await settle(page)

  /*
   * "New template with Claude" must not persist a template when the model wrote
   * NOTHING. This environment has no ANTHROPIC key, so every section write
   * fails — exactly the AI-unavailable case — and the wizard used to create a
   * published, enabled record from its skeleton defaults while reporting
   * success (Reviewer C's D1). The library count must not move, and the wizard
   * must say why. Against the broken build both halves fail: a 13th row appears
   * and no error is shown.
   */
  note('New-with-Claude fails without persisting (D1)')
  const aiBefore = (await rowIds()).length
  await page.getByRole('button', { name: /New template with Claude/i }).first().click()
  await settle(page)
  await page.getByPlaceholder(/MVA Truck Urgency/i).fill('D1 Regression Probe')
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Next/i }).first().click()
    await settle(page)
  }
  await page.getByRole('button', { name: /Generate with Claude/i }).first().click()
  const aiError = page.getByText(/could not write|nothing was created|failed|unavailable|try again/i).first()
  await aiError.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  t(
    (await aiError.count()) > 0,
    'New-with-Claude surfaces an error when the model wrote nothing (D1) rather than silently creating a template',
  )
  // Close the wizard (it stays open on error) and confirm nothing was persisted.
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  const aiAfter = (await rowIds()).length
  t(aiAfter === aiBefore, `New-with-Claude created no template on model failure (${aiBefore} -> ${aiAfter})`)

  t(pageErrors.length === 0, `the Templates screen raised no client exception (${pageErrors.join(' | ')})`)
  t(
    consoleErrors.length === 0,
    `the Templates screen logged no unexpected console error (${consoleErrors.slice(0, 3).join(' | ')})`,
  )

  /* ============================== LANDING PAGE DEPLOYMENT: General + gallery */

  note('section: LP deployment editor')

  await page.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)

  // Open an existing deployment if there is one, else create.
  if (await page.locator('[data-lp-deployment]').count()) {
    await openFirstDeployment(page, '[data-lp-deployment]')
  } else {
    await page.getByRole('button', { name: /New Deployment/i }).first().click()
    await settle(page)
  }

  const depTabs = await texts(page, '[data-deployment-tab]')
  t(depTabs.length === 3, `the LP deployment editor has three tabs (found ${depTabs.length}: ${depTabs.join(' | ')})`)
  t(depTabs.some((s) => /^General$/i.test(s)), 'LP deployment tab 1 is General (was Basics)')
  t(depTabs.some((s) => /Destination URL/i.test(s)), "LP deployment tab 2 is Destination URL's")
  t(depTabs.some((s) => /Tracking/i.test(s)), 'LP deployment tab 3 is Tracking & Pixels')
  t(!depTabs.some((s) => /Render/i.test(s)), 'Render & Embed is GONE from the LP deployment editor')
  t(!depTabs.some((s) => /Header|Footer/i.test(s)), 'Header / Footer is GONE from the LP deployment editor')
  t(!depTabs.some((s) => /Body Section/i.test(s)), 'Body Sections is GONE from the LP deployment editor')

  await auditTabSet(page, '[data-deployment-tab]', 3, 'LP deployment editor tabs')

  const genText = await bodyText(page)
  t(/Quiz Flow/i.test(genText), 'LP deployment General offers a Quiz Flow selector')
  /*
   * The brief forbids REQUIRING a standalone quiz deployment, not mentioning
   * one. A row migrated from the old binding still carries the pointer, and the
   * editor says so and offers to move it over — which is the migration fallback
   * the brief asks to preserve. What must not exist is a CONTROL that makes
   * picking one part of setting a landing page up.
   */
  const quizDepPicker = await page
    .locator('select')
    .evaluateAll((els) =>
      els.filter((e) => /quiz deployment/i.test((e as HTMLSelectElement).getAttribute('aria-label') ?? '')).length,
    )
  t(quizDepPicker === 0, 'and it offers no standalone Quiz Deployment picker')
  t(/Brand/i.test(genText), 'LP deployment General offers a Brand selector')
  t(/Domain/i.test(genText), 'LP deployment General offers a Domain')
  t(/Path/i.test(genText), 'LP deployment General offers a Path')
  t(/Status/i.test(genText), 'LP deployment General offers a Status')

  const lpGallery = page.locator('[data-template-gallery="lp"]')
  t(await lpGallery.count() > 0, 'LP deployment General shows a VISUAL landing-page template gallery')
  const lpCards = page.locator('[data-template-gallery="lp"] [data-template-card]')
  const lpCardCount = await lpCards.count()
  t(lpCardCount >= 12, `the LP gallery shows the real template library (${lpCardCount} cards)`)

  const lpCardText = await bodyText(page)
  t(!/MVA Pain First/i.test(lpCardText), 'the LP gallery does NOT offer old Page records')
  t((await lpCards.first().getByRole('button', { name: /preview/i }).count()) > 0, 'each LP template card offers Preview')
  t((await lpCards.first().getByRole('button', { name: /select/i }).count()) > 0, 'each LP template card offers Select')

  // Every card, not just the first: two real named <button>s (Preview, Select)
  // per card, and no div pretending to be one.
  await auditActionControls(page, '[data-template-gallery="lp"] [data-template-card]', 12, 2, 'LP gallery cards')


  /*
   * The preview is checked by PIXELS, not by presence.
   *
   * The first version of this card mounted the template in an `<iframe srcdoc>`.
   * The iframe existed, had the right box, and its `contentDocument` reported
   * 1172px of content — so every structural assertion passed while the card
   * painted solid black. `docs/production-readiness.md` records this gallery
   * falling into the same trap once already. Counting distinct colours in a
   * screenshot of the thumbnail is the only check that would have caught it.
   */
  const thumbColours = async (card: ReturnType<Page['locator']>): Promise<number> => {
    const buf = await card.screenshot()
    const seen = new Set<number>()
    for (let i = 0; i < buf.length - 3; i += 997) seen.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2])
    return seen.size
  }
  const lpColours = await thumbColours(lpCards.first())
  t(lpColours > 8, `an LP template card actually PAINTS its preview (${lpColours} distinct samples)`)

  await shot(page, 'landing-page-deployment-general')

  // Select the SECOND card, save, reload, and prove it stuck.
  const chosen = lpCards.nth(1)
  const chosenId = await chosen.getAttribute('data-template-card')
  await chosen.getByRole('button', { name: /select/i }).first().click()
  await settle(page)
  t(
    (await chosen.getAttribute('data-selected')) === 'true',
    'selecting an LP template shows a clear selected state',
  )
  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)

  /*
   * Reload, then RE-OPEN the deployment.
   *
   * The deployment editor is client state rather than a route, so a reload
   * lands back on the list. Asserting straight after the reload measured an
   * empty page and called it a lost selection.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-lp-tab="deployments"]').first().click()
  await settle(page)
  await openFirstDeployment(page, '[data-lp-deployment]')
  const stillSelected = await page
    .locator(`[data-template-gallery="lp"] [data-template-card="${chosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(stillSelected === 'true', `the selected LP template persists after Save and reload (${chosenId})`)

  /* --------------------------------- headings on the other two LP tabs */

  for (const [id, label] of [['destinations', "Destination URL's"], ['tracking', 'Tracking & Pixels']] as const) {
    await page.locator(`[data-deployment-tab="${id}"]`).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `LP ${label} has prominent section headings (${headings.length})`)
  }

  /* ======================================= QUIZZES: templates are manageable */

  note('section: Quizzes')

  await page.goto(`${BASE}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await settle(page)

  const quizTabs = await texts(page, '[data-quiz-tab]')
  t(quizTabs.length === 3, `Quizzes has three top-level tabs (found ${quizTabs.length}: ${quizTabs.join(' | ')})`)
  t(quizTabs.some((s) => /Flow/i.test(s)), 'Quizzes keeps a Quiz Flows tab — flows and templates are NOT merged')
  t(quizTabs.some((s) => /^Templates$/i.test(s)), 'Quizzes has a Templates tab')
  t(quizTabs.some((s) => /^Deployments$/i.test(s)), 'Quizzes has a Deployments tab')

  await auditTabSet(page, '[data-quiz-tab]', 3, 'Quizzes top-level tabs')

  await page.locator('[data-quiz-tab="templates"]').first().click()
  await settle(page)

  const quizRows = await page.locator('[data-quiz-template]').count()
  t(quizRows >= 20, `the quiz Templates tab lists the twenty visual templates (found ${quizRows})`)

  const qRow = page.locator('[data-quiz-template]').first()
  for (const [action, re] of [
    ['Preview', /preview/i],
    ['Edit', /edit/i],
    ['Clone', /clone/i],
    ['Delete', /delete/i],
  ] as const) {
    t((await qRow.getByRole('button', { name: re }).count()) > 0, `a quiz template row offers ${action}`)
  }
  t(
    (await qRow.getByRole('button', { name: /disable|enable/i }).count()) > 0,
    'a quiz template row offers Enable/Disable',
  )

  await auditActionControls(page, '[data-quiz-template]', 20, 4, 'quiz template rows')

  await shot(page, 'quiz-templates')

  /* =============================== QUIZ DEPLOYMENT: General + gallery */

  note('section: quiz deployment editor')

  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  if (await page.locator('[data-quiz-deployment]').count()) {
    await openFirstDeployment(page, '[data-quiz-deployment]')
  } else {
    await page.getByRole('button', { name: /New Deployment/i }).first().click()
    await settle(page)
  }

  const qDepTabs = await texts(page, '[data-deployment-tab]')
  t(qDepTabs.length === 3, `the quiz deployment editor has three tabs (found ${qDepTabs.length}: ${qDepTabs.join(' | ')})`)
  t(qDepTabs.some((s) => /^General$/i.test(s)), 'quiz deployment tab 1 is General (was Basics)')
  t(qDepTabs.some((s) => /Destination URL/i.test(s)), "quiz deployment tab 2 is Destination URL's (was Destinations)")
  t(qDepTabs.some((s) => /Tracking/i.test(s)), 'quiz deployment tab 3 is Tracking & Pixels')
  t(!qDepTabs.some((s) => /Render/i.test(s)), 'Render & Embed is GONE from the quiz deployment editor')
  t(!qDepTabs.some((s) => /Header|Footer/i.test(s)), 'Header / Footer is GONE from the quiz deployment editor')
  t(!qDepTabs.some((s) => /Body Section/i.test(s)), 'Body Sections is GONE from the quiz deployment editor')

  await auditTabSet(page, '[data-deployment-tab]', 3, 'quiz deployment editor tabs')

  const qGenText = await bodyText(page)
  t(/Quiz Flow/i.test(qGenText), 'quiz deployment General offers a Quiz Flow selector')
  t(/Brand/i.test(qGenText), 'quiz deployment General offers a Brand selector')
  t(/Embed|Standalone/i.test(qGenText), 'the Embed / Standalone choice is on General, not a tab of its own')

  const qGallery = page.locator('[data-template-gallery="quiz"]')
  t(await qGallery.count() > 0, 'quiz deployment General shows a VISUAL quiz template gallery')
  const qCards = page.locator('[data-template-gallery="quiz"] [data-template-card]')
  const qCardCount = await qCards.count()
  t(qCardCount >= 20, `the quiz gallery shows the real template library (${qCardCount} cards)`)
  t((await qCards.first().getByRole('button', { name: /preview/i }).count()) > 0, 'each quiz template card offers Preview')
  t((await qCards.first().getByRole('button', { name: /select/i }).count()) > 0, 'each quiz template card offers Select')

  await auditActionControls(page, '[data-template-gallery="quiz"] [data-template-card]', 20, 2, 'quiz gallery cards')

  await shot(page, 'quiz-deployment-general')

  const qChosen = qCards.nth(2)
  const qChosenId = await qChosen.getAttribute('data-template-card')
  await qChosen.getByRole('button', { name: /select/i }).first().click()
  await settle(page)
  t((await qChosen.getAttribute('data-selected')) === 'true', 'selecting a quiz template shows a clear selected state')

  await page.getByRole('button', { name: /^Save/i }).first().click()
  await settle(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  await openFirstDeployment(page, '[data-quiz-deployment]')
  const qStill = await page
    .locator(`[data-template-gallery="quiz"] [data-template-card="${qChosenId}"]`)
    .getAttribute('data-selected')
    .catch(() => null)
  t(qStill === 'true', `the selected quiz template persists after Save and reload (${qChosenId})`)

  for (const [id, label] of [['destinations', "Destination URL's"], ['tracking', 'Tracking & Pixels']] as const) {
    await page.locator(`[data-deployment-tab="${id}"]`).first().click()
    await settle(page)
    const headings = await texts(page, '[data-section-heading]')
    t(headings.length > 0, `quiz ${label} has prominent section headings (${headings.length})`)
  }

  /*
   * The negative case, in the UI.
   *
   * The resolvers refuse an unknown id and the suite proves that; nothing
   * proved the OPERATOR is told. A deployment whose stored template matches no
   * record must say so on the screen where it is selected, or the only person
   * who learns is the visitor who gets a 404.
   */
  await page.goto(`${BASE}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(page)
  if (await page.locator('[data-quiz-deployment]').count()) {
    await openFirstDeployment(page, '[data-quiz-deployment]')
    const banner = page.locator('[data-template-selection-missing]')
    t(
      (await banner.count()) === 0,
      'a deployment on a real template shows no missing-template banner',
    )
  }

  t(pageErrors.length === 0, `no client exception across the whole run (${pageErrors.slice(0, 3).join(' | ')})`)
  t(
    consoleErrors.length === 0,
    `no unexpected console error across the whole desktop run (${consoleErrors.slice(0, 3).join(' | ')})`,
  )

  /* ================================ the PUBLIC page renders the chosen template */

  note('section: public render comparison')

  /*
   * The admin can be entirely right and the visitor still get the wrong page,
   * because the admin and the public renderer are different code. So this asks
   * the public route directly, for two live deployments of the SAME brand on
   * DIFFERENT templates, and requires that they differ.
   *
   * Two templates rather than one: a single page proves only that something
   * rendered. The old fallback answered every id with the same template, and a
   * one-page check passes against it.
   */
  const publicTargets = await page.evaluate(async () => {
    const res = await fetch('/api/funnel-lp-deployments?limit=100&depth=1', { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    return (json.docs ?? []).map((d: Record<string, unknown>) => ({
      path: String(d.path ?? ''),
      status: String(d.status ?? ''),
      template: String((d.landing_page as { template_id?: string })?.template_id ?? ''),
      site: Number((d.site as { id?: number })?.id ?? 0),
      host: String((d.domain as { host?: string })?.host ?? ''),
    }))
  })

  /*
   * Fetched in NODE with a Host header, not in the page.
   *
   * The public router maps Host -> Domain -> Site, so a request to
   * 127.0.0.1 resolves to no tenant and falls through to the marketing site.
   * An earlier version of this check fetched from inside the browser, could not
   * set Host, and compared two copies of the marketing page — which differed by
   * 30 bytes and passed the "genuinely different" assertion while proving
   * nothing at all about the templates.
   */
  const fetchAs = (host: string, path: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const url = new URL(`${BASE}${path}`)
      const req = httpRequest(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET', headers: { Host: host } },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => { body += c })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        },
      )
      req.on('error', reject)
      req.end()
    })

  const live = (publicTargets as Array<{ path: string; status: string; template: string; site: number; host: string }>)
    .filter((d) => d.status === 'live' && d.path && d.template && d.host)

  const byHost = new Map<string, typeof live>()
  for (const d of live) byHost.set(d.host, [...(byHost.get(d.host) ?? []), d])

  /*
   * A template's own words, straight from the registry. Shared by the
   * desktop comparison below and the mobile public check further down, so the
   * two cannot pin "renders the chosen template" to different evidence.
   *
   * Headline-only was too narrow to be honest: `answer_first`'s headline is 24
   * characters (“Do I even have a case?”), which silently disabled the whole
   * marker comparison on the one host that actually has two live templates —
   * the guard skipped and the summary still said pass. Prose slots are ranked
   * by role instead, and slots carrying raw HTML (the svg CTAs, the logo div)
   * or ASCII quote characters are excluded: those match the ESCAPER, not the
   * template, because React rewrites ' and " on the way out. Typographic
   * quotes pass through verbatim and are safe.
   */
  const markerFor = (slug: string): string => {
    const res = resolveTemplate('lp', slug)
    if (!res.ok || res.template.kind !== 'lp' || !res.template.template) return ''
    const slots = asSlotted(res.template.template).slots
    const prose = slots.filter((s) => {
      const d = s.default.trim()
      return d.length > 25 && !/[<>&"']/.test(d)
    })
    const byRole = (role: string) => prose.find((s) => s.role === role)
    const chosen = byRole('headline') ?? byRole('subheadline') ?? byRole('trust_line') ?? prose[0]
    return (chosen?.default ?? '').trim().slice(0, 60)
  }

  let compared = false
  for (const [host, list] of byHost) {
    const distinct = [...new Map(list.map((d) => [d.template, d])).values()]
    if (distinct.length < 2) continue
    const [one, two] = distinct

    const a = await fetchAs(host, one.path)
    const b = await fetchAs(host, two.path)

    t(a.status === 200 && b.status === 200, `both public pages serve on ${host} (${one.path} ${a.status}, ${two.path} ${b.status})`)
    t(a.body.length !== b.body.length, 'two deployments on DIFFERENT templates render genuinely different pages')

    /*
     * The assertion that actually pins renderer identity: each page must carry
     * ITS OWN template's wording and not the other's. The old fallback answered
     * every id with the same template, so a length comparison alone would not
     * have caught it — both pages would simply have been identical.
     */
    const markerA = markerFor(one.template)
    const markerB = markerFor(two.template)

    if (markerA && markerB && markerA !== markerB) {
      const has = (body: string, marker: string) => body.includes(marker.replace(/&/g, '&amp;'))
      t(has(a.body, markerA), `${one.path} renders ${one.template}'s own copy`)
      t(has(b.body, markerB), `${two.path} renders ${two.template}'s own copy`)
      t(!has(a.body, markerB), `${one.path} does NOT render ${two.template}'s copy`)
      t(!has(b.body, markerA), `${two.path} does NOT render ${one.template}'s copy`)
    }

    /*
     * A path belonging to another SITE must not be reachable here.
     *
     * Deliberately keyed on site rather than on host: the resolver matches
     * (site, path) on purpose, so a deployment IS reachable on every domain its
     * own Site owns — the preview host as well as the custom one. An earlier
     * version of this assertion keyed on host and failed against that documented
     * behaviour, which would have been a test asking for a regression.
     */
    const foreign = live.find((d) => d.site !== one.site)
    if (foreign) {
      const cross = await fetchAs(host, foreign.path)
      t(cross.status === 404, `another BRAND's path 404s on this host (${foreign.path} -> ${cross.status})`)
    } else {
      console.log('  note: only one brand has live deployments — cross-tenant check skipped')
    }

    compared = true
    break
  }
  /*
   * A skip is a FAILURE here, not a note.
   *
   * This is the strongest assertion in the suite — the one that proves the
   * public renderer draws the template that was chosen — and it was written to
   * self-skip when no brand happened to have two live deployments on different
   * templates. An assertion that quietly does not run is worse than one that is
   * absent, because the summary still says everything passed.
   */
  t(compared, 'the public render comparison actually ran (it needs one brand with two live deployments on different templates)')

  /* ============================== MOBILE: the same claims at 390x844 */

  note('section: mobile pass')

  /*
   * A fresh CONTEXT, not a resized page: a context carries its own cookies and
   * its own device geometry, so this is a second, independent login the way a
   * phone is — nothing leaks over from the desktop session's state.
   */
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mpage = await mobileCtx.newPage()
  mpage.setDefaultTimeout(30_000)
  mpage.setDefaultNavigationTimeout(180_000)
  const mobilePageErrors: string[] = []
  mpage.on('pageerror', (e) => mobilePageErrors.push(e.message))
  const mobileConsoleErrors = trackConsoleErrors(mpage)

  await signIn(mpage)
  t(!mpage.url().includes('sign-in'), 'signed in to the admin at phone size')

  /* ------------------------------------------- LP Templates list, 390px */

  await mpage.goto(`${BASE}/admin/landing-pages`, { waitUntil: 'domcontentloaded' })
  await settle(mpage)

  // The 250px sidebar collapses to a rail below md; the drawer it opens is the
  // phone's whole navigation, so it has to open, show real links, and close.
  // Queries are SCOPED to the drawer dialog: the desktop aside holds the same
  // links display:none'd, and an unscoped .first() finds those instead.
  const hamburger = mpage.getByRole('button', { name: /open navigation/i })
  t(await hamburger.isVisible(), 'the phone shell offers an Open-navigation control')
  await hamburger.click()
  const drawer = mpage.getByRole('dialog', { name: /navigation/i })
  t(
    await drawer.getByRole('link', { name: /landing pages/i }).first().isVisible().catch(() => false),
    'the phone nav drawer opens and lists the real destinations',
  )
  await drawer.getByRole('button', { name: /close navigation/i }).click().catch(() => {})
  await drawer.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  t((await drawer.count()) === 0, 'and the drawer closes again')

  await assertNoHorizontalOverflow(mpage, 'LP Templates list at 390px')
  t(await mpage.locator('[data-lp-tab="templates"]').isVisible(), 'the Templates tab is visible at 390px')
  t(await mpage.locator('[data-lp-tab="deployments"]').isVisible(), 'the Deployments tab is visible at 390px')

  // Clickable is proven by clicking: the tab must actually switch.
  await mpage.locator('[data-lp-tab="deployments"]').click()
  await settle(mpage)
  t(
    (await mpage.locator('[data-lp-tab="deployments"]').getAttribute('aria-current')) === 'true',
    'the tab bar still works at 390px (Deployments activates)',
  )
  await mpage.locator('[data-lp-tab="templates"]').click()
  await settle(mpage)

  const mRows = await mpage.locator('[data-lp-template]').count()
  t(mRows >= 12, `the template library renders at 390px (${mRows} rows)`)
  const mFirstRow = mpage.locator('[data-lp-template]').first()
  t(await mFirstRow.getByRole('button', { name: /preview/i }).first().isVisible(), 'a row still shows Preview at 390px')
  t(await mFirstRow.getByRole('button', { name: /edit/i }).first().isVisible(), 'a row still shows Edit at 390px')

  await shotViewport(mpage, 'landing-page-templates-mobile')

  /* --------------------------------------- LP Deployment General, 390px */

  await mpage.locator('[data-lp-tab="deployments"]').first().click()
  await settle(mpage)
  t((await mpage.locator('[data-lp-deployment]').count()) > 0, 'a saved LP deployment exists to open at 390px')
  await openFirstDeployment(mpage, '[data-lp-deployment]')

  const mDepTabs = mpage.locator('[data-deployment-tab]')
  t((await mDepTabs.count()) === 3, 'the LP deployment editor keeps its three tabs at 390px')
  t(await mDepTabs.first().isVisible(), 'and the editor tab bar is visible at 390px')
  await assertNoHorizontalOverflow(mpage, 'LP Deployment General at 390px')

  const mLpCards = mpage.locator('[data-template-gallery="lp"] [data-template-card]')
  t((await mLpCards.count()) >= 12, `the LP template gallery renders at 390px (${await mLpCards.count()} cards)`)
  t(await mLpCards.first().getByRole('button', { name: /preview/i }).isVisible(), 'a gallery card shows Preview at 390px')
  t(await mLpCards.first().getByRole('button', { name: /select/i }).isVisible(), 'a gallery card shows Select at 390px')

  // Clickable, proven: Preview opens the real modal and Close dismisses it.
  await mLpCards.first().getByRole('button', { name: /preview/i }).click()
  const mPreview = mpage.locator('[data-preview-modal]')
  await mPreview.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  t((await mPreview.count()) > 0, 'a card Preview opens at 390px')
  await mPreview.getByRole('button', { name: /close/i }).first().click().catch(() => {})
  await mPreview.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  await settle(mpage)

  /* ------------------------------------------ quiz Templates list, 390px */

  await mpage.goto(`${BASE}/admin/quizzes`, { waitUntil: 'domcontentloaded' })
  await settle(mpage)
  await mpage.locator('[data-quiz-tab="templates"]').first().click()
  await settle(mpage)
  const mQuizRows = await mpage.locator('[data-quiz-template]').count()
  t(mQuizRows >= 20, `the quiz template library renders at 390px (${mQuizRows} rows)`)
  await assertNoHorizontalOverflow(mpage, 'Quiz Templates list at 390px')

  /* --------------------------------------- quiz Deployment General, 390px */

  await mpage.locator('[data-quiz-tab="deployments"]').first().click()
  await settle(mpage)
  t((await mpage.locator('[data-quiz-deployment]').count()) > 0, 'a saved quiz deployment exists to open at 390px')
  await openFirstDeployment(mpage, '[data-quiz-deployment]')

  const mQDepTabs = mpage.locator('[data-deployment-tab]')
  t((await mQDepTabs.count()) === 3, 'the quiz deployment editor keeps its three tabs at 390px')
  t(await mQDepTabs.first().isVisible(), 'and its tab bar is visible at 390px')
  await assertNoHorizontalOverflow(mpage, 'Quiz Deployment General at 390px')

  const mQCards = mpage.locator('[data-template-gallery="quiz"] [data-template-card]')
  t((await mQCards.count()) >= 20, `the quiz gallery renders at 390px (${await mQCards.count()} cards)`)
  t(await mQCards.first().getByRole('button', { name: /preview/i }).isVisible(), 'a quiz card shows Preview at 390px')
  t(await mQCards.first().getByRole('button', { name: /select/i }).isVisible(), 'a quiz card shows Select at 390px')

  note('mobile: public LP')

  /* ------------------------------------------------ PUBLIC LP, 390px */

  /*
   * The real public page in a real phone-sized browser. The Host header cannot
   * be overridden on a Chromium navigation (net::ERR_INVALID_ARGUMENT), so
   * this uses the authenticated `?site=<slug>` preview channel the middleware
   * provides — which resolves the SAME deployment through the SAME resolver
   * and renderer as the Host-routed request the node-level block above already
   * proved. The template marker pins that it drew the chosen template, not a
   * fallback and not the marketing page.
   */
  t(live.length > 0, 'a live LP deployment exists for the mobile public check')
  const mTarget = live.find((d) => d.host.includes('check-a-case')) ?? live[0]
  const siteSlugById = (await mpage.evaluate(async () => {
    const res = await fetch('/api/sites?limit=100&depth=0', { credentials: 'include' })
    if (!res.ok) return {}
    const json = await res.json()
    return Object.fromEntries((json.docs ?? []).map((d: Record<string, unknown>) => [String(d.id), String(d.slug ?? '')]))
  })) as Record<string, string>
  const mSiteSlug = mTarget ? (siteSlugById[String(mTarget.site)] ?? '') : ''
  t(Boolean(mSiteSlug), `the live deployment's Site resolves to a slug (site ${mTarget?.site})`)

  const mResp = mTarget
    ? await mpage.goto(`${BASE}${mTarget.path}?site=${encodeURIComponent(mSiteSlug)}`, { waitUntil: 'domcontentloaded' })
    : null
  await settle(mpage)
  t(mResp !== null && mResp.status() === 200, `the public LP serves at phone size (${mTarget?.path} -> ${mResp?.status() ?? 'no fetch'})`)

  const mMarker = mTarget ? markerFor(mTarget.template).replace(/\s+/g, ' ') : ''
  t(mMarker.length > 0, `the deployed template exposes a headline to pin the render on (${mTarget?.template})`)
  const mBody = await bodyText(mpage)
  t(mMarker.length > 0 && mBody.includes(mMarker), `the phone-sized public page renders ${mTarget?.template}'s own copy`)
  await assertNoHorizontalOverflow(mpage, `public LP ${mTarget?.path ?? ''} at 390px`)
  t(
    await mpage.locator('a[href^="tel:"], button').first().isVisible().catch(() => false),
    'the public LP keeps an interactive control (CTA/phone) visible at 390px',
  )

  await shotViewport(mpage, 'lp-public-mobile')

  t(mobilePageErrors.length === 0, `no client exception across the mobile pass (${mobilePageErrors.slice(0, 3).join(' | ')})`)
  t(
    mobileConsoleErrors.length === 0,
    `no unexpected console error across the mobile pass (${mobileConsoleErrors.slice(0, 3).join(' | ')})`,
  )

  await mobileCtx.close()
  await page.close()
}

mkdirSync(SHOTS, { recursive: true })

/**
 * The pre-installed Chromium, when the pinned Playwright wants a different one.
 *
 * This environment ships a browser under `PLAYWRIGHT_BROWSERS_PATH` and blocks
 * the download, so a version bump in `package.json` makes Playwright look for a
 * revision that is not there. Pointing at the one that IS there beats skipping
 * the browser suite, which is the only place several of these claims can be
 * checked at all. `LEGALOS_CHROMIUM_PATH` (or the older `LEGALOS_CHROMIUM`)
 * overrides it.
 */
const CHROMIUM =
  process.env.LEGALOS_CHROMIUM_PATH ??
  process.env.LEGALOS_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    : undefined)

const browser = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] },
)
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
