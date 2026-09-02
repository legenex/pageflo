import 'server-only'
import type { Sample, FontSample } from './extract-score'
import { applyRejections, proposeTokens, proposeFonts } from './extract-score'
import { assertSafeUrl } from '../net/ssrf'

/**
 * Brand extraction by computed-style sampling.
 *
 * The previous method parsed a page's declared stylesheet and its Tailwind
 * config. Declaration order in a utility framework has no relationship to
 * visual hierarchy, so on any Tailwind site it returned the framework's
 * defaults - which is exactly how dontsettle.co came back as orange-600 and
 * slate-800, two colours that site does not use.
 *
 * This reads what the page actually PAINTED. Chromium renders it, the sampler
 * below walks the DOM asking each element for its computed style and its
 * bounding box, and every colour arrives with the role it played, how many
 * elements used it, and how much of the viewport it covered.
 *
 * The split matters: this file only reads. Every decision about what a reading
 * MEANS lives in extract-score.ts as pure functions, so the judgement can be
 * tested without launching a browser.
 */

export type ComputedExtraction = {
  finalUrl: string
  host: string
  tokens: Record<string, { value: string; confidence: number; source: string }>
  /** Everything thrown away, with the rule that threw it. Shown on request. */
  rejected: Array<{ role: string; color: string; reason: string }>
  /** Non-fatal problems worth telling the operator about. */
  warnings: string[]
}

/**
 * Turn a normalised in-page colour into '#rrggbb', or say why it cannot be.
 *
 * The two failure modes are reported separately because they mean different
 * things to whoever is looking at the result: a translucent colour was read
 * fine but cannot be proposed, while an unreadable one means the sampler met a
 * format it could not resolve and is worth knowing about.
 */
type HexResult = { hex: string } | { hex: null; reason: string }

const toHex = (css: string): HexResult => {
  const opaque = css.match(/^#([0-9a-f]{6})$/i)
  if (opaque) return { hex: `#${opaque[1].toLowerCase()}` }

  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i)
  if (!m) return { hex: null, reason: `reported as "${css}", a colour format the sampler could not resolve` }

  const a = m[4] === undefined ? 1 : Number(m[4])
  // A translucent colour is not one we can propose: what a visitor actually
  // sees depends on whatever is painted behind it.
  if (a < 0.95) {
    return { hex: null, reason: `${Math.round(a * 100)}% opaque, so what a visitor sees depends on what is behind it` }
  }
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.round(Number(n)))
  return { hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}` }
}

type RawReading = { role: Sample['role']; color: string; count: number; share: number; source: string }
type RawSample = { colors: RawReading[]; fonts: FontSample[]; notes: string[] }

/**
 * Runs INSIDE the page, serialised across by Playwright.
 *
 * Passed as a real function rather than a string: Playwright evaluates a string
 * as an EXPRESSION, so a stringified arrow evaluates to a function object and
 * returns undefined instead of calling it. A real function also gets its body
 * type-checked against the DOM lib.
 *
 * Because it is serialised, it can close over nothing - every helper it needs
 * is declared inside. It returns raw readings only; no judgement happens here,
 * since anything decided in-page could not be tested without a browser.
 */
const samplePage = async (): Promise<RawSample> => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const area = vw * vh
  const colors: RawReading[] = []
  const fonts: FontSample[] = []
  const notes: string[] = []

  const px = (el: Element): number => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? (r.width * r.height) / area : 0
  }
  const visible = (el: Element): boolean => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const push = (role: Sample['role'], color: string, count: number, share: number, source: string) =>
    colors.push({ role, color, count, share, source })

  // Chromium does not always report rgb(). A colour that came through
  // color-mix() or a wide-gamut declaration arrives as oklab(), and parsing
  // every CSS Color 4 format by hand would be a second colour library. Instead
  // let the browser do it: assigning to a canvas fillStyle resolves ANY colour
  // the browser understands down to #rrggbb, or rgba() when it has alpha.
  //
  // An invalid value leaves fillStyle at its previous setting, which is
  // indistinguishable from a valid assignment of that same colour. Assigning
  // against two different sentinels tells the two apart: a real colour lands on
  // the same result from both, an invalid one keeps whichever sentinel it had.
  const probe = document.createElement('canvas').getContext('2d')
  const normalise = (css: string): string => {
    if (!probe) return css
    probe.fillStyle = '#000000'
    probe.fillStyle = css
    const fromBlack = probe.fillStyle
    probe.fillStyle = '#ffffff'
    probe.fillStyle = css
    return probe.fillStyle === fromBlack ? String(fromBlack) : css
  }

  // --- primary call to action --------------------------------------------
  // The largest solid-background button in the first viewport: the one colour
  // a brand is most certain to have chosen on purpose.
  const clickable = Array.from(
    document.querySelectorAll('button, a, [role=button], input[type=submit]'),
  )
    .filter(visible)
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.top < vh && r.bottom > 0
    })
    .map((el) => {
      const s = getComputedStyle(el)
      return { bg: normalise(s.backgroundColor), img: s.backgroundImage, area: px(el) }
    })
    // A gradient or image background has no single colour to take.
    .filter((c) => c.img === 'none' && c.area > 0)
    // Only fully opaque backgrounds may COMPETE. normalise() returns '#rrggbb'
    // for those and rgba() for anything with alpha, so this also drops the
    // transparent ones. The distinction matters because ranking picks a winner
    // before the rejection rules run: a large faint panel that is rejected
    // later would otherwise beat a real button and take the whole call-to-action
    // reading down with it, which is exactly what a 7%-opaque overlay did.
    .filter((c) => c.bg.startsWith('#'))

  // Ranked by TOTAL painted area per colour, not by the single biggest button.
  // A brand that uses one colour on several smaller buttons is making just as
  // deliberate a choice as one that uses it on a single large one, and ranking
  // by the biggest element alone would miss it.
  const ctaTally = new Map<string, { area: number; n: number }>()
  for (const c of clickable) {
    const cur = ctaTally.get(c.bg) || { area: 0, n: 0 }
    cur.area += c.area
    cur.n += 1
    ctaTally.set(c.bg, cur)
  }
  const ranked = Array.from(ctaTally.entries()).sort((a, b) => b[1].area - a[1].area)

  if (ranked[0]) {
    const [color, { area, n }] = ranked[0]
    push('cta', color, n, area, `computed background of the primary above-the-fold button${n > 1 ? `, shared by ${n} buttons` : ''}`)
  } else {
    notes.push('no solid-background button was found above the fold')
  }
  // The second button colour is a strong accent candidate: a brand that uses
  // two deliberate button colours has told us about both.
  if (ranked[1]) {
    const [color, { area, n }] = ranked[1]
    push('accent', color, n, area, `computed background of the secondary above-the-fold button${n > 1 ? `s, ${n} of them` : ''}`)
  }

  // --- page ground --------------------------------------------------------
  const bodyStyle = getComputedStyle(document.body)
  const htmlStyle = getComputedStyle(document.documentElement)
  const ground = normalise(bodyStyle.backgroundImage === 'none' ? bodyStyle.backgroundColor : htmlStyle.backgroundColor)
  push('page_bg', ground, 1, 1, 'computed background of the page at the top of the document')

  // --- card surfaces ------------------------------------------------------
  // The most repeated block background that is not the page ground.
  const tally = new Map<string, { n: number; share: number }>()
  for (const el of Array.from(document.querySelectorAll('div, section, article, aside, li'))) {
    if (!visible(el)) continue
    const s = getComputedStyle(el)
    if (s.backgroundImage !== 'none') continue
    const c = normalise(s.backgroundColor)
    if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === ground) continue
    const cur = tally.get(c) || { n: 0, share: 0 }
    cur.n += 1
    cur.share = Math.max(cur.share, px(el))
    tally.set(c, cur)
  }
  const surfaces = Array.from(tally.entries()).sort((a, b) => b[1].n - a[1].n)
  if (surfaces[0]) {
    push('surface', surfaces[0][0], surfaces[0][1].n, surfaces[0][1].share, `most repeated card background, on ${surfaces[0][1].n} elements`)
  }

  // --- body text ----------------------------------------------------------
  // The colour of the LONGEST run of prose, not of the first paragraph found:
  // the first is often a nav item or an eyebrow label.
  let longest: Element | null = null
  let longestLen = 0
  const inkTally = new Map<string, number>()
  for (const el of Array.from(document.querySelectorAll('p, li, span, div'))) {
    if (!visible(el)) continue
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || '')
      .join('')
      .trim()
    if (own.length < 20) continue
    const c = normalise(getComputedStyle(el).color)
    inkTally.set(c, (inkTally.get(c) || 0) + 1)
    if (own.length > longestLen) {
      longestLen = own.length
      longest = el
    }
  }
  if (longest) {
    const c = normalise(getComputedStyle(longest).color)
    push('ink', c, inkTally.get(c) || 1, px(longest), `computed colour of the longest run of text on the page, matched by ${inkTally.get(c) || 1} text element${(inkTally.get(c) || 1) === 1 ? '' : 's'}`)
  }

  // --- headings -----------------------------------------------------------
  const heads = Array.from(document.querySelectorAll('h1, h2')).filter(visible)
  if (heads[0]) {
    const s = getComputedStyle(heads[0])
    push('heading', normalise(s.color), heads.length, heads.reduce((n, el) => n + px(el), 0), `computed colour of the page headings, ${heads.length} found`)
    fonts.push({ role: 'heading', family: s.fontFamily, count: heads.length })
  }
  fonts.push({ role: 'body', family: getComputedStyle(longest || document.body).fontFamily, count: 1 })

  // --- links in prose -----------------------------------------------------
  const proseLinks = Array.from(document.querySelectorAll('p a, li a')).filter(visible)
  if (proseLinks.length) {
    const first = normalise(getComputedStyle(proseLinks[0]).color)
    const shared = proseLinks.filter((el) => normalise(getComputedStyle(el).color) === first).length
    push('link', first, shared, proseLinks.reduce((n, el) => n + px(el), 0), `computed colour of ${shared} link${shared === 1 ? '' : 's'} inside prose`)
  }

  // --- logo ---------------------------------------------------------------
  // Decoded onto a canvas so the dominant non-neutral colour can be read
  // directly. Cross-origin images taint the canvas; that is reported, not
  // thrown, because a missing logo colour is not a failed extraction.
  const logoEl = document.querySelector<HTMLImageElement>(
    'header img, [class*=logo] img, a[href="/"] img, img[alt*=logo i]',
  )
  const logoSrc = logoEl?.currentSrc || logoEl?.src
  if (logoSrc) {
    try {
      // Re-requested in CORS mode rather than read off the element. Serving the
      // response with a permissive header is not enough on its own: a canvas
      // stays tainted unless the image was REQUESTED with crossOrigin set, and
      // the page's own element was not. This second request is served from
      // cache and costs nothing.
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = logoSrc
      await img.decode()

      const canvas = document.createElement('canvas')
      const w = (canvas.width = Math.min(96, img.naturalWidth))
      const h = (canvas.height = Math.min(96, img.naturalHeight))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(img, 0, 0, w, h)

      const data = ctx.getImageData(0, 0, w, h).data
      const buckets = new Map<string, number>()
      let opaquePixels = 0
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        if (a < 200) continue
        opaquePixels += 1
        // Greys are skipped: a logo's ink, its cut-out and its drop shadow are
        // not the brand's colour.
        if (Math.max(r, g, b) - Math.min(r, g, b) <= 18) continue
        const key = [r, g, b].map((v) => Math.round(v / 24) * 24).join(',')
        buckets.set(key, (buckets.get(key) || 0) + 1)
      }
      const top = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])[0]
      if (top) {
        const [r, g, b] = top[0].split(',').map(Number)
        // Share of the logo's own opaque pixels, not of the viewport: a colour
        // on 3% of a logo is trim, one on 40% is the logo's colour.
        const shareOfLogo = top[1] / Math.max(1, opaquePixels)
        push(
          'logo',
          `rgb(${r}, ${g}, ${b})`,
          1,
          0,
          `dominant colour of the header logo, ${Math.round(shareOfLogo * 100)}% of its visible pixels`,
        )
      } else {
        notes.push('a header logo was found but it is monochrome, so it carries no brand colour')
      }
    } catch {
      notes.push('the header logo could not be decoded, so no colour was taken from it')
    }
  } else {
    notes.push('no header logo image was found')
  }

  return { colors, fonts, notes }
}

/**
 * Render a URL and extract brand tokens from what it actually painted.
 *
 * Sampled at two widths because a responsive site can present a different
 * primary action on mobile, and the desktop reading alone would miss it.
 */
export const extractBrandFromRender = async (rawUrl: string): Promise<ComputedExtraction | null> => {
  // A browser is still the server fetching a user-supplied address, and a
  // headless Chrome pointed at 169.254.169.254 reads cloud credentials just as
  // happily as curl would. Admission runs BEFORE the browser launches, so a
  // refused address never costs a process either. See lib/net/ssrf.
  const admission = await assertSafeUrl(rawUrl)
  if (!admission.ok) return null
  const url = admission.url.toString()

  // Imported lazily so that merely importing this module does not require
  // Playwright to be installed - the app must boot on a machine without it.
  const { chromium } = await import('playwright')

  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36 PageFlo-BrandExtract/1.0',
    })
    // A logo served from a CDN taints the canvas, and the dominant-colour read
    // fails on exactly the sites most likely to have a deliberate brand. This
    // browser exists only to read public pages, so images are re-served to it
    // with a permissive CORS header. Nothing is written and no credentials are
    // attached; it changes only what our own canvas is allowed to read back.
    // Admitting only the top-level URL would leave the hole open one level
    // down: the page being read chooses its own subresources, so an
    // `<img src="http://169.254.169.254/...">` would be fetched by this browser
    // on its behalf. Every http(s) request the page makes is admitted too.
    // Verdicts are memoised per host because a page pulls dozens of assets from
    // a handful of hosts and each miss costs a DNS round trip.
    const hostVerdicts = new Map<string, boolean>()
    const admitted = async (requestUrl: string): Promise<boolean> => {
      let host: string
      try {
        host = new URL(requestUrl).host
      } catch {
        return false
      }
      const cached = hostVerdicts.get(host)
      if (cached !== undefined) return cached
      const verdict = await assertSafeUrl(requestUrl)
      hostVerdicts.set(host, verdict.ok)
      return verdict.ok
    }

    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url()
      // data: and blob: never leave the browser, so they are not this guard's
      // business; anything that speaks http(s) is.
      if (/^https?:/i.test(requestUrl) && !(await admitted(requestUrl))) {
        return route.abort('blockedbyclient')
      }
      if (route.request().resourceType() !== 'image') return route.continue()
      try {
        const response = await route.fetch()
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'access-control-allow-origin': '*' },
        })
      } catch {
        // A blocked or failed image is not a failed extraction.
        await route.continue()
      }
    })

    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    // Web fonts and late-loading heroes change what is painted.
    await page.waitForTimeout(600)

    const raw = await page.evaluate(samplePage)

    const finalUrl = page.url()
    await context.close()

    const samples: Sample[] = []
    const rejected: ComputedExtraction['rejected'] = []
    for (const c of raw.colors) {
      const parsed = toHex(c.color)
      if (parsed.hex === null) {
        rejected.push({ role: c.role, color: c.color, reason: parsed.reason })
        continue
      }
      samples.push({ role: c.role, color: parsed.hex, count: c.count, pixelShare: c.share, source: c.source })
    }

    const { kept, rejected: ruleRejected } = applyRejections(samples)
    for (const r of ruleRejected) rejected.push({ role: r.sample.role, color: r.sample.color, reason: r.reason })

    const tokens = { ...proposeTokens(kept), ...proposeFonts(raw.fonts) }

    return {
      finalUrl,
      host: new URL(finalUrl).host,
      tokens,
      rejected,
      warnings: raw.notes,
    }
  } finally {
    await browser.close()
  }
}
