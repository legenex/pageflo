/**
 * The PageFlo console and marketing site, driven in a real browser.
 *
 *   pnpm build && pnpm test:console
 *
 * Everything else in the suite either calls a function directly or scans
 * source. Neither can answer the question a redesign actually raises, which is
 * whether the SCREENS work: does the route render, does it render at 390px
 * without scrolling sideways, does the sidebar open on a phone, does a
 * confirmation dialog trap focus, does the marketing host serve the product
 * site while the app host redirects to the console.
 *
 * So this boots the production build with the PageFlo host variables set to
 * `.test` names, maps those names at Chromium's resolver, signs in as the super
 * admin, and walks every top-level route at three viewport sizes.
 *
 * WHY `.test` HOSTNAMES AND A RESOLVER RULE. Chromium refuses a `Host` header
 * override on a navigation (`net::ERR_INVALID_ARGUMENT`), so the only way to
 * exercise host classification in a browser is to use real hostnames and map
 * them. `.test` is reserved by RFC 6761 and can never resolve publicly, so this
 * cannot accidentally reach a real host.
 *
 * WHY THE ORIGIN MATTERS. `next start` runs with NODE_ENV=production, where the
 * CSRF allowlist carries only the configured origins. `PAGEFLO_SERVER_URL` is
 * therefore set to the exact origin the browser will use, port included. Get
 * this wrong and every server action fails as "unauthenticated" while the app
 * is perfectly healthy, which is the failure mode this harness most needs to be
 * able to tell apart from a real one.
 *
 * WHAT IS ASSERTED, per route and per viewport:
 *   - the response status is 200
 *   - the page has an <h1>
 *   - `document.documentElement.scrollWidth` does not exceed the viewport
 *   - no `pageerror` and no console error other than a failed EXTERNAL fetch
 *     (this sandbox has no outbound network, so Google Fonts resets)
 */
import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const PORT = Number(process.env.PAGEFLO_CONSOLE_PORT ?? 3600 + (process.pid % 300))

/*
 * THE APP HOST IS `localhost`, AND THAT IS LOAD-BEARING.
 *
 * Chromium sends the `Sec-Fetch-*` headers only to a POTENTIALLY TRUSTWORTHY
 * origin: https, or localhost. Payload's cookie strategy
 * (`payload/dist/auth/extractJWT.js`) accepts a cookie carrying no `Origin`
 * only when `Sec-Fetch-Site` says same-origin, same-site or none, and rejects
 * it outright when the header is absent and a csrf allowlist is configured.
 *
 * So an authenticated walk over `http://app.pageflo.test` cannot work, and
 * cannot be made to work by adding the header from the test: Chromium strips
 * `Sec-*` request headers set by automation. The session simply never
 * authenticates, in a way indistinguishable from a wrong password.
 *
 * On the real `https://app.pageflo.io` the browser sends the header on every
 * navigation, which is why the console works in production. Using `localhost`
 * as the app host reproduces that condition honestly rather than relaxing the
 * product to suit the harness. Host CLASSIFICATION is still exercised in full:
 * localhost is configured as the app host, `pageflo.test` as the marketing
 * host, and `legacy.pageflo.test` as a legacy host, and each is asserted to
 * behave as its role.
 */
const APP_HOST = `localhost:${PORT}`
const MARKETING_HOST = 'pageflo.test'
const LEGACY_HOST = 'legacy.pageflo.test'
const APP_ORIGIN = `http://${APP_HOST}`
const MARKETING_ORIGIN = `http://${MARKETING_HOST}:${PORT}`

/**
 * The harness signs in as an account it creates and then removes.
 *
 * It does NOT use the configured super admin. Depending on seed state would
 * make a green run mean "somebody ran pnpm seed here", and using a real
 * operator account in a browser harness means a suite failure can leave a
 * session or a password-attempt trail on an account somebody actually uses.
 * The fixture is created through the local API before the browser starts and
 * deleted in `finally`, including on failure, exactly as the isolation suite
 * treats its own tenants.
 */
const RUN_ID = randomUUID().slice(0, 8)
const EMAIL = `console-walk-${RUN_ID}@pageflo.test`
const PASSWORD = `cw-${randomUUID()}`

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

/**
 * A console error that is only a failed EXTERNAL resource load.
 *
 * This sandbox has no outbound network, so the Google Fonts stylesheet resets
 * and Chromium logs it. Everything else, including a hydration mismatch or a
 * React error, is a real failure and must not be swallowed.
 */
const isAllowedConsoleError = (text: string): boolean =>
  /fonts\.(googleapis|gstatic)\.com/.test(text) ||
  /net::ERR_(CONNECTION_|NAME_NOT_RESOLVED|BLOCKED)/.test(text) ||
  /Failed to load resource/.test(text)

/** Routes every operator reaches from the sidebar. */
const CONSOLE_ROUTES: Array<{ path: string; label: string }> = [
  { path: '/admin/overview', label: 'Overview' },
  { path: '/admin/leads', label: 'Leads' },
  { path: '/admin/sites', label: 'Sites' },
  { path: '/admin/brands/domains', label: 'Domains' },
  { path: '/admin/brands/brand-identities', label: 'Brand Kits' },
  { path: '/admin/quizzes', label: 'Quizzes' },
  { path: '/admin/landing-pages', label: 'Landing Pages' },
  { path: '/admin/advertorials', label: 'Advertorials' },
  { path: '/admin/analytics', label: 'Analytics' },
  { path: '/admin/integrity', label: 'Campaign Integrity' },
  { path: '/admin/system', label: 'System' },
  { path: '/admin/plan', label: 'Agent Plan' },
  { path: '/admin/buildlog', label: 'Build Log' },
  { path: '/admin/handbook', label: 'Handbook' },
  { path: '/admin/settings', label: 'Settings' },
  { path: '/admin/settings/integrations', label: 'Integrations' },
  { path: '/admin/settings/users', label: 'Users' },
  { path: '/admin/settings/system', label: 'System health' },
  { path: '/admin/profile', label: 'Profile' },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
]

let server: ChildProcess | undefined
let fixtureUserId: string | number | null = null

const waitForServer = async (): Promise<boolean> => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/pageflo/health`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/**
 * A raw GET with a chosen `Host` header.
 *
 * `node:http`, not `fetch`. `Host` is a forbidden header in the fetch spec and
 * undici drops it SILENTLY, so every request would go out as
 * `Host: 127.0.0.1:PORT`, be classified as a tenant, and the whole host-role
 * block would measure the wrong thing while reporting success.
 */
const rawGet = (
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; location: string; body: string }> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: PORT, path, method: 'GET', headers },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: String(res.headers.location ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })

/**
 * Every context sends `x-forwarded-proto: http`.
 *
 * The harness is standing in for the reverse proxy that sits in front of the
 * app in production, and the honest thing for a plain-HTTP harness to say is
 * `http`. Without it the session cookie is marked `Secure`, Chromium refuses to
 * store it, and every authenticated page bounces to sign-in in a way that looks
 * exactly like a wrong password.
 */
const CONTEXT_HEADERS = { 'x-forwarded-proto': 'http' }

const launch = (): Promise<Browser> =>
  chromium.launch({
    args: [
      '--no-sandbox',
      // A leading `*` is Chromium's wildcard, so this covers the apex and every
      // subdomain in one rule. Listing them individually left `www.` unmapped
      // and the navigation reached the sandbox resolver instead.
      '--host-resolver-rules=MAP *pageflo.test 127.0.0.1',
    ],
  })

/** Open a page with fonts blocked and console errors collected. */
const openPage = async (ctx: BrowserContext): Promise<{ page: Page; errors: string[] }> => {
  const page = await ctx.newPage()
  const errors: string[] = []
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort())
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort())
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !isAllowedConsoleError(m.text())) errors.push(m.text())
  })
  return { page, errors }
}

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const fixture = await payload.create({
    collection: 'users',
    data: {
      email: EMAIL,
      password: PASSWORD,
      name: 'Console walk fixture',
      super_admin: true,
      status: 'active',
    },
    overrideAccess: true,
  })
  fixtureUserId = fixture.id
  t(Boolean(fixtureUserId), 'a throwaway super-admin fixture is created for the walk')

  console.log(`  starting the app on ${APP_ORIGIN}`)
  const log: string[] = []
  server = spawn('pnpm', ['start'], {
    // `detached` puts the server in its own process GROUP so it can be killed
    // whole. `pnpm start` spawns `next start`, which spawns `next-server`;
    // killing only the pnpm wrapper leaves the real server holding the port,
    // and a suite run repeatedly leaves a pile of orphans behind that later
    // runs then collide with.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      // The classifier normalizes the port away, so `localhost:PORT` and
      // `localhost` are the same host to it.
      PAGEFLO_APP_HOST: APP_HOST,
      PAGEFLO_MARKETING_HOST: MARKETING_HOST,
      PAGEFLO_LEGACY_APP_HOSTS: LEGACY_HOST,
      PAGEFLO_LEGACY_HOST_REDIRECT: 'false',
      // Exact origin, port included: this is what the CSRF allowlist compares.
      PAGEFLO_SERVER_URL: APP_ORIGIN,
      PAGEFLO_EXTRA_ORIGINS: `${MARKETING_ORIGIN},http://www.${MARKETING_HOST}:${PORT},http://${LEGACY_HOST}:${PORT}`,
    },
  })
  server.stdout?.on('data', (c) => log.push(String(c)))
  server.stderr?.on('data', (c) => log.push(String(c)))

  const booted = await waitForServer()
  t(booted, `the production build boots and answers${booted ? '' : '\n' + log.join('').slice(-1500)}`)
  if (!booted) throw new Error('the app did not start')

  const browser = await launch()

  /* ------------------------------------------------------------ host roles */

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: CONTEXT_HEADERS })
    const { page, errors } = await openPage(ctx)

    const marketing = await page.goto(MARKETING_ORIGIN, { waitUntil: 'domcontentloaded' })
    t(marketing?.status() === 200, 'the marketing host serves 200 at /')
    t(
      (await page.locator('h1').first().innerText()).toLowerCase().includes('build every page'),
      'the marketing host renders the PageFlo hero',
    )
    t(errors.length === 0, `the marketing site logs no console errors${errors.length ? `: ${errors[0]}` : ''}`)

    /*
     * The www redirect is asserted at the HTTP level rather than by navigating.
     *
     * What matters is the STATUS and the Location host: a 308 naming the apex.
     * The redirect's scheme and port are decided by the proxy in front, and this
     * harness has none, so following it in a browser would be asserting a
     * property of the test environment rather than of the product.
     */
    const wwwRoot = await rawGet('/', { host: `www.${MARKETING_HOST}` })
    t(wwwRoot.status === 308, `www answers 308 (got ${wwwRoot.status})`)
    t(
      wwwRoot.location !== '' && new URL(wwwRoot.location).hostname === MARKETING_HOST,
      `www redirects to the apex (Location: ${wwwRoot.location || 'absent'})`,
    )

    const wwwAdmin = await rawGet('/admin/overview', { host: `www.${MARKETING_HOST}` })
    t(
      wwwAdmin.status === 308,
      'the canonical redirect runs before the admin passthrough, so www never serves the console',
    )

    // Behind a TLS-terminating proxy the scheme comes from X-Forwarded-Proto,
    // which is the only value that is true about the outside of the connection.
    // Hardcoding https was correct in production and untestable anywhere else.
    const wwwProxied = await rawGet('/', {
      host: `www.${MARKETING_HOST}`,
      'x-forwarded-proto': 'https',
    })
    t(
      wwwProxied.location.startsWith(`https://${MARKETING_HOST}`),
      `behind a TLS proxy the redirect target is https (got ${wwwProxied.location || 'absent'})`,
    )

    // The app host has no public surface; / goes to the console, which sends an
    // unauthenticated visitor to sign-in.
    await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
    t(new URL(page.url()).pathname.startsWith('/sign-in'), 'the app host sends an anonymous visitor to sign-in')
    t(
      (await page.locator('h1').first().innerText()).includes('PageFlo'),
      'the sign-in screen is branded PageFlo',
    )

    // A host PageFlo does not own is a tenant, and an unresolvable one 404s
    // rather than advertising the product.
    const unknown = await page.goto(`http://${LEGACY_HOST}:${PORT}/`, { waitUntil: 'domcontentloaded' })
    t(unknown?.status() === 200, 'a legacy app host still serves, unchanged')

    // Robots and sitemap disagree per host, on purpose.
    const robotsMarketing = (await rawGet('/robots.txt', { host: MARKETING_HOST })).body
    const robotsApp = (await rawGet('/robots.txt', { host: APP_HOST })).body
    t(!/Disallow: \/$/m.test(robotsMarketing), 'the marketing host is indexable')
    t(/Disallow: \/$/m.test(robotsApp), 'the app host answers Disallow')
    const sitemap = (await rawGet('/sitemap.xml', { host: MARKETING_HOST })).body
    t(sitemap.includes(`https://${MARKETING_HOST}/`), 'the sitemap names the marketing host')
    t(!sitemap.includes('/privacy'), 'the sitemap omits /privacy while the legal facts are unconfigured')

    await ctx.close()
  }

  /* -------------------------------------------------------------- sign in */

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: CONTEXT_HEADERS })
  {
    const { page, errors } = await openPage(ctx)
    await page.goto(`${APP_ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)

    // The show/hide control is a real control, so it is exercised rather than
    // assumed: a password field that cannot be revealed is a support ticket.
    await page.click('button[aria-label="Show password"]')
    t(
      (await page.getAttribute('input[name="password"]', 'type')) === 'text',
      'the sign-in password can be revealed',
    )
    await page.click('button[aria-label="Hide password"]')

    await Promise.all([
      page.waitForURL(/\/admin\//, { timeout: 30_000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ])
    const signedIn = page.url().includes('/admin/')
    if (!signedIn) {
      // The form's own error is the answer nine times out of ten, and a
      // "sign-in failed" with no reason sends the reader to the wrong place.
      const alert = page.locator('[role="alert"]')
      const reason = (await alert.count()) > 0 ? (await alert.first().innerText()).trim() : '(no error shown)'
      console.log(`         form said: ${reason}`)
      console.log(`         server tail: ${log.join('').slice(-600).replace(/\n/g, ' | ')}`)
    }
    // The URL alone is not proof: the redirect after a successful POST is client
    // side, so it changes even when no session cookie was stored and the layout
    // is about to bounce straight back.
    await page.goto(`${APP_ORIGIN}/admin/overview`, { waitUntil: 'domcontentloaded' })
    const sessionHeld = !new URL(page.url()).pathname.startsWith('/sign-in')
    t(sessionHeld, `the session survives a fresh navigation (landed on ${new URL(page.url()).pathname})`)
    t(signedIn, `sign-in lands in the console (at ${page.url()})`)
    t(errors.length === 0, `sign-in logs no console errors${errors.length ? `: ${errors[0]}` : ''}`)
    // Everything after this asserts on an AUTHENTICATED console. Walking the
    // routes unauthenticated would pass every check against the sign-in page,
    // which renders a heading and does not overflow, and report a green run.
    if (!signedIn || !sessionHeld) throw new Error('sign-in failed; the authenticated walk would measure the sign-in page')
    await page.close()
  }

  /* ------------------------------------------------------- the route walk */

  // Reported whether or not anything failed. A green run that measured nothing
  // and a green run that measured every page look identical otherwise.
  let widestSeen = { excess: 0, where: '(none)' }

  for (const vp of VIEWPORTS) {
    const vctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: await ctx.storageState(),
      extraHTTPHeaders: CONTEXT_HEADERS,
    })
    for (const route of CONSOLE_ROUTES) {
      const { page, errors } = await openPage(vctx)
      let status = 0
      try {
        const res = await page.goto(`${APP_ORIGIN}${route.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        })
        status = res?.status() ?? 0
        // The builder screens hydrate a large client tree; give them a beat so
        // a hydration error has actually had the chance to be thrown before the
        // console is read.
        await page.waitForTimeout(600)
      } catch (err) {
        errors.push(String(err))
      }

      t(status === 200, `${vp.name} ${route.label} responds 200 (got ${status})`)
      t(
        !new URL(page.url()).pathname.startsWith('/sign-in'),
        `${vp.name} ${route.label} renders the console rather than bouncing to sign-in`,
      )

      const hasHeading = await page.locator('h1, h2').first().count()
      t(hasHeading > 0, `${vp.name} ${route.label} renders a heading`)

      /*
       * Horizontal overflow, with the element that caused it.
       *
       * "This page scrolls sideways" is a bug report nobody can act on. The
       * widest offending element and its classes turn it into a one-line fix,
       * so the diagnosis is part of the assertion rather than a follow-up
       * investigation in a browser.
       */
      /*
       * Can the page be scrolled sideways, and if so, what is pushing it.
       *
       * THE WINDOW IS ACTUALLY SCROLLED AND THE RESULT READ BACK. Asserting on
       * `document.documentElement.scrollWidth` called a correct page broken: a
       * table inside its own horizontally scrolling container legitimately
       * reports a scrollWidth far wider than the screen while the page itself
       * does not move an inch. Whether the user can scroll sideways is the
       * question the design brief actually asks, and it is the only one a
       * measurement can answer without a table of exceptions.
       *
       * PASSED AS A STRING ON PURPOSE. `tsx` compiles this file with esbuild,
       * which rewrites inner function declarations to call a `__name` helper it
       * injects at MODULE scope. `page.evaluate` serialises only the function
       * source, so the helper is not there and the evaluate dies with
       * `ReferenceError: __name is not defined`, which the surrounding `.catch`
       * then reported as "no overflow". The check returned green on a page
       * carrying a deliberate 2000px canary, which is how it was caught. A
       * string body is never transformed.
       *
       * An element wider than the viewport is only a BUG when nothing clips it.
       * A table inside `overflow-x-auto` is wider than the screen by design and
       * scrolls inside its own container; naming that as the culprit sends the
       * reader to fix the one thing that is already right.
       */
      const overflow = (await page
        .evaluate(
          `(() => {
            var before = window.scrollX;
            window.scrollTo(99999, window.scrollY);
            var reached = window.scrollX;
            window.scrollTo(before, window.scrollY);
            var excess = Math.round(reached);
            if (excess <= 1) return { excess: excess, culprit: '', chain: '' };
            var isClipped = function (el) {
              var node = el.parentElement;
              while (node && node !== document.documentElement) {
                var ox = window.getComputedStyle(node).overflowX;
                if (ox === 'hidden' || ox === 'auto' || ox === 'scroll' || ox === 'clip') return true;
                node = node.parentElement;
              }
              return false;
            };
            var worstRight = window.innerWidth;
            var worst = null;
            var all = document.querySelectorAll('body *');
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              var rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              if (rect.right <= worstRight) continue;
              if (isClipped(el)) continue;
              worstRight = rect.right;
              worst = el;
            }
            var metrics = ' [de.sw=' + document.documentElement.scrollWidth + ' de.cw=' + document.documentElement.clientWidth + ' body.sw=' + document.body.scrollWidth + ']';
            if (!worst) {
              // Nothing UNCLIPPED is over-wide, yet the document still is. The
              // widest element regardless of clipping is then the only useful
              // thing to name: the clip is usually on the wrong axis, or the
              // container that should scroll is itself over-wide.
              var fallbackRight = window.innerWidth;
              for (var k = 0; k < all.length; k++) {
                var fel = all[k];
                var frect = fel.getBoundingClientRect();
                if (frect.width === 0 || frect.height === 0) continue;
                if (frect.right <= fallbackRight) continue;
                fallbackRight = frect.right;
                worst = fel;
              }
              if (!worst) return {
              excess: excess,
              culprit: '(no element found) de.sw=' + document.documentElement.scrollWidth +
                ' de.cw=' + document.documentElement.clientWidth +
                ' body.sw=' + document.body.scrollWidth +
                ' body.cw=' + document.body.clientWidth,
              chain: '',
            };
              worstRight = fallbackRight;
            }
            var cls = typeof worst.className === 'string' ? worst.className.slice(0, 90) : '';
            var chain = [];
            var node = worst.parentElement;
            while (node && node !== document.body && chain.length < 6) {
              var nodeCls = typeof node.className === 'string' ? node.className.slice(0, 40) : '';
              chain.push(node.tagName.toLowerCase() + '[' + nodeCls + '] cw=' + node.clientWidth + ' sw=' + node.scrollWidth + ' ox=' + window.getComputedStyle(node).overflowX);
              node = node.parentElement;
            }
            return {
              excess: excess,
              culprit: '<' + worst.tagName.toLowerCase() + ' class="' + cls + '"> right=' + Math.round(worstRight) + metrics,
              chain: chain.join(' < '),
            };
          })()`,
        )
        .catch((err: unknown) => ({
          excess: -1,
          culprit: `measurement failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
          chain: '',
        }))) as { excess: number; culprit: string; chain: string }
      if (overflow.excess > 1 && overflow.chain) console.log(`         chain: ${overflow.chain}`)
      if (overflow.excess > widestSeen.excess) widestSeen = { excess: overflow.excess, where: `${vp.name} ${route.label}` }
      t(
        overflow.excess >= 0 && overflow.excess <= 1,
        `${vp.name} ${route.label} does not scroll sideways (overflow ${overflow.excess}px${overflow.culprit ? ` from ${overflow.culprit}` : ''})`,
      )

      t(
        errors.length === 0,
        `${vp.name} ${route.label} logs no console errors${errors.length ? `: ${errors[0].slice(0, 200)}` : ''}`,
      )
      await page.close()
    }
    await vctx.close()
  }
  console.log(`  widest horizontal overflow across the walk: ${widestSeen.excess}px on ${widestSeen.where}`)

  /* ------------------------------------------------------ real interactions */

  // Mobile navigation: the drawer has to open, list destinations and close.
  {
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: await ctx.storageState(),
      extraHTTPHeaders: CONTEXT_HEADERS,
    })
    const { page } = await openPage(mctx)
    await page.goto(`${APP_ORIGIN}/admin/overview`, { waitUntil: 'domcontentloaded' })
    const opener = page.getByRole('button', { name: /open navigation|menu/i }).first()
    t((await opener.count()) > 0, 'mobile: a navigation opener is present and accessibly named')
    if ((await opener.count()) > 0) {
      await opener.click()
      await page.waitForTimeout(250)
      const sitesLink = page.getByRole('link', { name: /^Sites$/ }).first()
      t((await sitesLink.count()) > 0, 'mobile: the drawer lists Sites')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      t(await opener.isVisible(), 'mobile: Escape closes the drawer and the opener returns')
    }
    await page.close()
    await mctx.close()
  }

  // Sidebar accordions: a group with children opens and reveals them.
  {
    const { page } = await openPage(ctx)
    await page.goto(`${APP_ORIGIN}/admin/overview`, { waitUntil: 'domcontentloaded' })
    const toggle = page.locator('nav button[aria-expanded]').first()
    t((await toggle.count()) > 0, 'desktop: sidebar groups expose aria-expanded')
    if ((await toggle.count()) > 0) {
      const before = await toggle.getAttribute('aria-expanded')
      await toggle.click()
      await page.waitForTimeout(200)
      const after = await toggle.getAttribute('aria-expanded')
      t(before !== after, 'desktop: a sidebar group toggles open and closed')
    }
    await page.close()
  }

  // The confirmation dialog is real: it opens, traps focus, and cancels.
  {
    const { page } = await openPage(ctx)
    await page.goto(`${APP_ORIGIN}/admin/sites`, { waitUntil: 'domcontentloaded' })
    const firstSite = page.locator('a[href^="/admin/sites/"]').first()
    if ((await firstSite.count()) > 0) {
      const href = await firstSite.getAttribute('href')
      await page.goto(`${APP_ORIGIN}${href}/settings/danger-zone`, { waitUntil: 'domcontentloaded' })
      const pauseOrResume = page.getByRole('button', { name: /Pause Site|Resume Site/ }).first()
      const archive = page.getByRole('button', { name: 'Archive Site' }).first()
      const trigger = (await pauseOrResume.count()) > 0 && (await pauseOrResume.isEnabled()) ? pauseOrResume : archive
      t((await trigger.count()) > 0, 'danger zone: the controls are real buttons, not disabled placeholders')
      if ((await trigger.count()) > 0 && (await trigger.isEnabled())) {
        await trigger.click()
        await page.waitForTimeout(200)
        const dialog = page.locator('[role="dialog"]')
        t((await dialog.count()) === 1, 'danger zone: a confirmation dialog opens')
        t(
          (await dialog.getAttribute('aria-modal')) === 'true',
          'danger zone: the dialog is marked aria-modal',
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        t((await page.locator('[role="dialog"]').count()) === 0, 'danger zone: Escape cancels without acting')
      }
    }
    await page.close()
  }

  // Sites search actually filters, and clearing it restores the list.
  {
    const { page } = await openPage(ctx)
    await page.goto(`${APP_ORIGIN}/admin/sites`, { waitUntil: 'domcontentloaded' })
    const search = page.locator('input[type="search"]').first()
    t((await search.count()) > 0, 'sites: the search field is present and typed as a search input')
    if ((await search.count()) > 0) {
      await search.fill('zzz-no-such-site')
      await page.waitForTimeout(900)
      const body = await page.locator('body').innerText()
      t(/No Sites match these filters/i.test(body), 'sites: a search with no matches shows the empty state')
    }
    await page.close()
  }

  await ctx.close()
  await browser.close()
}

try {
  await main()
} catch (err) {
  fail++
  console.log(`  FAIL the console walk completed — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill('SIGTERM')
    }
  }
  if (fixtureUserId !== null) {
    const payload = await getPayload({ config })
    await payload
      .delete({ collection: 'users', id: fixtureUserId, overrideAccess: true })
      .catch(() => null)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
process.exit(0)
