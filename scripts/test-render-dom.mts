/**
 * Rendering proofs, in a real browser, read back out of the DOM.
 *
 *   pnpm test:dom
 *
 * The reason this file exists is written in `docs/production-readiness.md` and
 * is worth repeating: **measuring layout reported success four times on a card
 * that was visibly broken.** Computed styles and bounding boxes are what the
 * engine intends; they are not what it paints. Four containment approaches for
 * the template gallery each measured correct and each painted over the card,
 * and the gallery shipped with no preview as a result.
 *
 * So every assertion here is made against a live Chromium: real layout, real
 * cascade, real stacking, and where the claim is about paint, a real screenshot
 * with the pixels inspected rather than the box measured.
 *
 * It needs NO server. Everything under test is produced by the same pure
 * composition primitives the public renderer calls — `composeTemplate`,
 * `resolveTokens`, `portedTemplateDocument` — so what the browser is shown is
 * byte-for-byte what a visitor is served. Testing a rebuilt approximation of the
 * page would prove something about the approximation.
 */
import { type Browser, type Page } from 'playwright'
import { launchChromium, browserProvenance } from './lib/browser.ts'

import { PORTED_TEMPLATES, asSlotted, TEMPLATE_FONTS_HREF } from '../src/lib/lp-templates/index.ts'
import { composeTemplate } from '../src/lib/lp-slots/model.ts'
import { resolveTokensForHtml } from '../src/components/builder/lp/tokens.ts'
import { templateVars } from '../src/lib/lp-templates/tokens.ts'
import { resolveLpPalette } from '../src/lib/lp-nodes/palette.ts'
import { getLpIdentity } from '../src/lib/lp-identities/index.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

/* ------------------------------------------------------------------ fixtures */

/**
 * Three real, unrelated brands.
 *
 * Unrelated on purpose: two brands that differ only in hue cannot show that a
 * template is genuinely brand-driven, because a page that ignored the brand
 * entirely would look nearly right under both.
 */
const BRANDS = [
  {
    id: 'brand_a',
    name: 'Counterweight',
    displayName: 'Counterweight Claims',
    shortName: 'CW',
    colors: { primary: '#BF2E1A', accent: '#7E8C99', ink: '#17191D', surface: '#F4F2EE' },
    contact: { callNumber: '(800) 111-2222' },
    legal: { defaultDisclaimer: 'Counterweight is not a law firm.', tcpaText: 'CW TCPA text.', privacyUrl: '/privacy', termsUrl: '/terms' },
    typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  },
  {
    id: 'brand_b',
    name: 'Plainpath',
    displayName: 'Plainpath Legal',
    shortName: 'PP',
    colors: { primary: '#0F766E', accent: '#F59E0B', ink: '#0B1220', surface: '#FFFFFF' },
    contact: { callNumber: '(800) 333-4444' },
    legal: { defaultDisclaimer: 'Plainpath is a referral service.', tcpaText: 'PP TCPA text.', privacyUrl: '/p', termsUrl: '/t' },
    typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  },
  {
    id: 'brand_c',
    name: 'Meridian',
    displayName: 'Meridian Legal Network',
    shortName: 'MLN',
    // A DARK brand: its surface is darker than its ink is light. The token
    // ladder has to run the other way for this one, which is exactly the case a
    // light-only fixture set never exercises.
    colors: { primary: '#C8A951', accent: '#4C5B7A', ink: '#F2F4F8', surface: '#101418' },
    contact: { callNumber: '(800) 555-6666' },
    legal: { defaultDisclaimer: 'Meridian connects you with attorneys.', tcpaText: 'MLN TCPA.', privacyUrl: '/privacy', termsUrl: '/terms' },
    typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  },
]

type TestBrand = (typeof BRANDS)[number]

/**
 * The exact document the public renderer mounts, for one template + brand.
 *
 * Must stay line-for-line what `portedTemplateDocument` does, and the token pass
 * must be `resolveTokensForHtml`. This harness originally used `resolveTokens`,
 * which is the NODE-path resolver and does not escape — so it was measuring a
 * pipeline the product does not have, and it reported a hostile brand executing
 * when the real renderer had already been fixed. A test double of a sanitiser is
 * the one thing that must never be a double.
 */
const documentFor = (slug: string, brand: TestBrand, overrides: Record<string, string> = {}): string => {
  const tpl = PORTED_TEMPLATES.find((x) => x.slug === slug)!
  const palette = resolveLpPalette(getLpIdentity('a'), brand)
  const vars = Object.entries(templateVars(tpl, palette)).map(([k, v]) => `${k}:${v}`).join(';')
  const composed = composeTemplate(asSlotted(tpl), overrides)
  const html = resolveTokensForHtml(composed.html, { brand })
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${TEMPLATE_FONTS_HREF}">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}body{${vars}}</style>
</head><body>${html}</body></html>`
}

/* ------------------------------------------------------------------- helpers */

const load = async (page: Page, html: string, width = 1280, height = 900): Promise<void> => {
  await page.setViewportSize({ width, height })
  // A data: URL rather than a file, so nothing under test can read the disk and
  // a template that tried to would fail loudly instead of quietly succeeding.
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
}

/**
 * Every visible text node's colour against the colour actually BEHIND it.
 *
 * Passed to the browser as a source STRING rather than as a function. tsx
 * compiles through esbuild, which rewrites arrow functions to carry a `__name`
 * helper that exists in the bundle and not in the page; handing playwright a
 * compiled closure therefore throws `__name is not defined` inside the page and
 * the failure looks like a browser problem rather than a build one.
 */
const CONTRAST_PROBE = `(() => {
  const srgb = function (c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lum = function (rgb) { return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]) }
  const parse = function (s) {
    const m = /rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?/.exec(s)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
  }
  const behind = function (el) {
    let cur = el
    while (cur) {
      const bg = parse(getComputedStyle(cur).backgroundColor)
      if (bg && bg[3] > 0.5) return bg
      cur = cur.parentElement
    }
    return [255, 255, 255, 1]
  }
  const out = []
  const nodes = document.querySelectorAll('h1,h2,h3,h4,p,li,a,span,button,div,summary')
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    let own = false
    for (let j = 0; j < el.childNodes.length; j++) {
      const n = el.childNodes[j]
      if (n.nodeType === 3 && (n.textContent || '').trim().length > 2) own = true
    }
    if (!own) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const fg = parse(cs.color)
    if (!fg || fg[3] < 0.5) continue
    const bg = behind(el)
    const l1 = lum(fg), l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    // 3:1 rather than 4.5:1 - these references use large display type
    // throughout, and holding a 54px headline to the small-text threshold
    // reports failures WCAG itself does not.
    if (ratio < 3) out.push({ text: (el.textContent || '').trim().slice(0, 50), fg: cs.color, ratio: Number(ratio.toFixed(2)) })
  }
  return out
})()`

const readContrastFailures = async (page: Page): Promise<Array<{ text: string; fg: string; ratio: number }>> =>
  page.evaluate(CONTRAST_PROBE) as Promise<Array<{ text: string; fg: string; ratio: number }>>

/* --------------------------------------------------------------------- main */

const run = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage()

  /* ---- every template renders, under every brand, at two widths ---------- */

  for (const tpl of PORTED_TEMPLATES) {
    for (const brand of BRANDS) {
      const html = documentFor(tpl.slug, brand)
      await load(page, html, 1280, 900)

      // A source string, for the same `__name` reason as CONTRAST_PROBE.
      const info = await page.evaluate(`({
        bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').trim(),
        elements: document.body.querySelectorAll('*').length,
        // The single most important number here: a page that scrolls sideways
        // on a phone is broken, and no unit test can see it.
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rawBraces: (document.body.innerText.match(/\\{\\{[\\w.]+\\}\\}/g) || []).length,
        scripts: document.querySelectorAll('script').length,
      })`) as { bodyText: string; elements: number; horizontalOverflow: number; rawBraces: number; scripts: number }

      t(info.elements > 40, `${tpl.slug} @ ${brand.id}: renders a real page (${info.elements} elements)`)
      t(info.bodyText.length > 400, `${tpl.slug} @ ${brand.id}: has substantial visible copy`)
      t(info.rawBraces === 0, `${tpl.slug} @ ${brand.id}: shows no unresolved {{token}} to a visitor (${info.rawBraces})`)
      t(info.scripts === 0, `${tpl.slug} @ ${brand.id}: mounts no script`)
      t(info.horizontalOverflow <= 1, `${tpl.slug} @ ${brand.id}: no horizontal overflow at 1280px (${info.horizontalOverflow}px)`)

      // The brand's own words must actually be on the page.
      t(
        info.bodyText.includes(brand.displayName) || info.bodyText.includes(brand.contact.callNumber),
        `${tpl.slug} @ ${brand.id}: the brand's name or number reaches the page`,
      )
    }
  }

  /* ---- mobile ------------------------------------------------------------ */

  for (const tpl of PORTED_TEMPLATES) {
    const html = documentFor(tpl.slug, BRANDS[0])
    await load(page, html, 390, 844) // iPhone 14 logical viewport
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // `[LOGO SLOT · DARK VARIANT]` and its siblings are the caption inside an
      // image well, drawn small on purpose and gone the moment a brand supplies
      // an asset. Counting them as body copy would report a defect that
      // disappears in every real deployment.
      tiny: Array.from(document.querySelectorAll('p,li,span'))
        .filter((el) => {
          const text = (el.textContent ?? '').trim()
          if (/^\[[A-Z0-9 ·/_-]+\]/.test(text)) return false
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return r.height > 2 && text.length > 20 && parseFloat(cs.fontSize) < 9
        }).length,
    }))
    t(m.overflow <= 1, `${tpl.slug}: no horizontal overflow at 390px (${m.overflow}px)`)
    t(m.tiny === 0, `${tpl.slug}: no body copy under 9px on a phone (${m.tiny} offenders)`)
  }

  /* ---- contrast, measured against the real backdrop ---------------------- */
  //
  // Not a re-derivation of the palette maths: the browser is asked what colour
  // the text ACTUALLY is and what is ACTUALLY behind it. That is the only way
  // to catch a rule that wins the cascade for a reason nobody modelled.
  //
  // The assertion is RELATIVE, and that is a deliberate choice rather than a
  // softened bar. Rendering the twelve in their own reference colours — no
  // brand variables supplied at all, which is the design exactly as the handoff
  // drew it — leaves 38 text runs below 3:1: greyed-out `$ ———` value
  // placeholders, small monospace labels, a copyright line. Those are the
  // designer's decisions, and holding a BRAND remap to a bar the design itself
  // does not clear would report the handoff's choices as our defects while
  // saying nothing about whether the remap is faithful.
  //
  // What must be true is that no brand makes any template WORSE than the design
  // as drawn. That is the property the remap exists to have, it is checkable,
  // and it is what caught both real defects here: a collapsed ladder (every run
  // at 1.01) and a positional sRGB mix that halved the contrast of every dark
  // section (48 runs below 3:1 that the reference has at 5.4).

  {
    const baseline = new Map<string, number>()
    for (const tpl of PORTED_TEMPLATES) {
      // No variables at all: every colour falls back to the reference's own,
      // which is the property the token format was designed to give us.
      const composed = composeTemplate(asSlotted(tpl), {})
      const html = resolveTokensForHtml(composed.html, { brand: BRANDS[0] })
      await load(page, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${TEMPLATE_FONTS_HREF}"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}</style></head><body>${html}</body></html>`, 1280, 900)
      baseline.set(tpl.slug, (await readContrastFailures(page)).length)
    }
    const totalBaseline = [...baseline.values()].reduce((a, b) => a + b, 0)
    t(totalBaseline > 0, `the reference designs themselves have ${totalBaseline} runs under 3:1 — recorded, not hidden`)

    for (const brand of BRANDS) {
      const worse: string[] = []
      for (const tpl of PORTED_TEMPLATES) {
        await load(page, documentFor(tpl.slug, brand), 1280, 900)
        const n = (await readContrastFailures(page)).length
        const ref = baseline.get(tpl.slug) ?? 0
        if (n > ref) worse.push(`${tpl.slug}: ${ref} -> ${n}`)
      }
      t(worse.length === 0, `${brand.id} makes no template less readable than the design as drawn${worse.length ? ' — ' + worse.join(', ') : ''}`)
    }

    // And the strong form: a brand must not introduce a run that is unreadable
    // at ANY size. Below 1.5:1 is not "low contrast", it is invisible.
    for (const brand of BRANDS) {
      const invisible: string[] = []
      for (const tpl of PORTED_TEMPLATES) {
        await load(page, documentFor(tpl.slug, brand), 1280, 900)
        const runs = await readContrastFailures(page)
        // The reference's own greyed-out placeholders sit around 1.7; anything
        // at or under 1.2 is text the same colour as its background.
        for (const r of runs) if (r.ratio <= 1.2) invisible.push(`${tpl.slug} "${r.text.slice(0, 20)}" ${r.ratio}`)
      }
      t(invisible.length === 0, `${brand.id} renders no invisible text${invisible.length ? ' — ' + invisible.slice(0, 4).join('; ') : ''}`)
    }
  }

  /* ---- overrides reach the rendered page --------------------------------- */

  {
    const tpl = PORTED_TEMPLATES.find((x) => x.slug === 'editorial_investigation_v2')!
    const headline = tpl.slots.find((s) => s.role === 'headline')!
    const cta = tpl.slots.find((s) => s.role === 'cta_label')!
    const overrides = {
      [headline.id]: 'Deployment specific headline for brand B',
      [cta.id]: 'Start my free check',
    }
    await load(page, documentFor(tpl.slug, BRANDS[1], overrides))
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    t(text.includes('Deployment specific headline for brand B'), "a deployment's own headline appears on the rendered page")
    t(text.includes('Start my free check'), "a deployment's own CTA label appears on the rendered page")
    t(!text.includes(tpl.slots.find((s) => s.role === 'headline')!.default.replace(/<[^>]*>/g, '').trim().slice(0, 40)), 'and the stock headline it replaced is gone')

    // The same template, same brand, NO overrides: the stock words come back.
    await load(page, documentFor(tpl.slug, BRANDS[1]))
    const stock = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    t(!stock.includes('Deployment specific headline'), 'a deployment that overrides nothing renders the stock template')
  }

  /* ---- an override cannot execute --------------------------------------- */
  //
  // The composer escapes; this proves the escaping survives an actual HTML
  // parser, which is the only opinion that counts.

  {
    const tpl = PORTED_TEMPLATES.find((x) => x.slug === 'quiz_first')!
    const headline = tpl.slots.find((s) => s.role === 'headline')!
    const img = tpl.slots.find((s) => s.role === 'image_src')

    const hostile: Record<string, string> = {
      [headline.id]: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>',
    }
    if (img) hostile[img.id] = 'javascript:window.__pwned=3'

    await load(page, documentFor(tpl.slug, BRANDS[0], hostile))
    const result = await page.evaluate(() => ({
      pwned: (window as unknown as { __pwned?: number }).__pwned ?? null,
      injectedImgs: document.querySelectorAll('img[src="x"]').length,
      injectedScripts: document.querySelectorAll('script').length,
      jsHrefs: document.querySelectorAll('[src^="javascript:"],[href^="javascript:"]').length,
      // The text the operator typed is still SHOWN, because escaping is not
      // deletion: they should see what they wrote and fix it.
      shows: document.body.innerText.includes('onerror'),
    }))
    t(result.pwned === null, 'a hostile override executes nothing in a real browser')
    t(result.injectedImgs === 0, 'and injects no element')
    t(result.injectedScripts === 0, 'and injects no script')
    t(result.jsHrefs === 0, 'and no javascript: URL survives')
    t(result.shows, 'and the operator still sees the text they typed')
  }

  /* ---- a hostile BRAND cannot execute ------------------------------------ */
  //
  // The other untrusted string reaching `dangerouslySetInnerHTML`, and the one
  // that was missed: brand values are tenant free text, and `resolveTokens`
  // splices them into the markup with no escaping. Overrides were escaped from
  // the start; brand values were not, and the same component renders in /admin
  // UNSANDBOXED — so a Site admin's display name executing as script would run
  // in a super-admin's origin. Found by an adversarial pass, not by us.

  {
    const tpl = PORTED_TEMPLATES.find((x) => x.slug === 'editorial_investigation_v2')!
    const headline = tpl.slots.find((s) => s.role === 'headline')!
    const hostileBrand = {
      id: 'evil',
      name: '<script>window.__pwned=2</script>',
      displayName: '<img src=x onerror="window.__pwned=1">',
      shortName: 'EV',
      colors: { primary: '#BF2E1A', accent: '#7E8C99', ink: '#17191D', surface: '#F4F2EE' },
      contact: { callNumber: '"><svg onload="window.__pwned=3">' },
      legal: { defaultDisclaimer: '<b>bold</b>', tcpaText: 'x', privacyUrl: 'javascript:alert(1)', termsUrl: '/t' },
      typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
    } as unknown as TestBrand

    for (const [label, overrides] of [
      ['with no override at all', {}],
      // An override is the delivery vehicle: it can put a token into a slot that
      // had none, widening the sink. So the hostile brand is tried both ways.
      ['with a token planted in an override', { [headline.id]: 'Call {{brand.callNumber}} now, {{brand.displayName}}' }],
    ] as const) {
      await load(page, documentFor(tpl.slug, hostileBrand, overrides as Record<string, string>))
      const r = await page.evaluate(`({
        pwned: window.__pwned === undefined ? null : window.__pwned,
        imgs: document.querySelectorAll('img[src="x"]').length,
        scripts: document.querySelectorAll('script').length,
        js: document.querySelectorAll('[href^="javascript:"],[src^="javascript:"]').length,
        svgOnload: document.querySelectorAll('svg[onload]').length,
      })`) as { pwned: unknown; imgs: number; scripts: number; js: number; svgOnload: number }
      t(r.pwned === null, `a hostile brand executes nothing ${label}`)
      t(r.imgs === 0 && r.scripts === 0 && r.svgOnload === 0, `and injects no element ${label}`)
      t(r.js === 0, `and no javascript: URL survives ${label}`)
    }
  }

  /* ---- gallery containment, proven with PIXELS --------------------------- */
  //
  // The claim that failed four times. Measuring the box was what reported
  // success while the card was visibly broken, so this renders the real card
  // markup and reads the SCREENSHOT: the strip of pixels just outside the
  // thumbnail must still be the page background.

  {
    const tpl = PORTED_TEMPLATES[0]
    const doc = documentFor(tpl.slug, BRANDS[0])
    const card = `<!doctype html><html><head><meta charset="utf-8">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;background:#101014}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:20px}
.card{background:#17171c;border:2px solid #2a2a33;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.thumb{position:relative;overflow:hidden;contain:paint;isolation:isolate;height:190px;width:100%;flex-shrink:0;background:#101014}
.thumb iframe{position:absolute;top:0;left:0;width:1280px;height:1600px;border:none;transform:scale(0.28);transform-origin:0 0;pointer-events:none}
.body{padding:13px;color:#e6e6ea;font:13px system-ui}
.sentinel{height:60px;background:#00ff00}
</style></head><body>
<div class="grid">
  <div class="card"><div class="thumb"><iframe sandbox srcdoc="${doc.replace(/"/g, '&quot;')}"></iframe></div><div class="body">Card one name</div></div>
  <div class="card"><div class="thumb"><iframe sandbox srcdoc="${doc.replace(/"/g, '&quot;')}"></iframe></div><div class="body">Card two name</div></div>
</div>
<div class="sentinel" id="sentinel"></div>
</body></html>`

    await load(page, card, 900, 700)
    await page.waitForTimeout(400)

    const box = await page.evaluate(() => {
      const s = document.getElementById('sentinel')!.getBoundingClientRect()
      const b = document.querySelectorAll('.body')[0].getBoundingClientRect()
      return { sentinel: { x: s.x, y: s.y, w: s.width, h: s.height }, body: { x: b.x, y: b.y, w: b.width, h: b.height } }
    })

    // The card's own text must be readable, not painted over.
    // The whole label strip, not a guessed 12px band: a clip that happens to
    // land between two lines of text is flat for reasons that have nothing to
    // do with containment, which would make this assertion pass or fail on
    // padding rather than on the thing it is about.
    const bodyShot = await page.screenshot({ clip: { x: box.body.x, y: box.body.y, width: Math.min(200, box.body.w), height: Math.min(34, box.body.h) } })
    // And the sentinel strip below the grid must still be pure green: anything
    // else means template markup escaped its frame and painted down the page.
    const sentinelShot = await page.screenshot({ clip: { x: box.sentinel.x + 10, y: box.sentinel.y + 20, width: 200, height: 10 } })

    const isAllGreen = (png: Buffer): boolean => {
      // A PNG of one flat colour compresses to almost nothing. A strip that has
      // template markup painted over it does not. Comparing sizes against a
      // known-flat control is a cheap, decisive test that needs no decoder.
      return png.length < 900
    }
    t(isAllGreen(sentinelShot), `nothing paints outside the thumbnail (sentinel strip is flat, ${sentinelShot.length}b)`)
    // Two independent readings, because either alone has a known failure mode:
    // the DOM says the text is laid out, the pixels say something was painted.
    const labelLaidOut = await page.evaluate(`(() => {
      const el = document.querySelectorAll('.body')[0]
      const r = el.getBoundingClientRect()
      return { text: el.textContent.trim(), h: Math.round(r.height), visible: getComputedStyle(el).visibility }
    })()`) as { text: string; h: number; visible: string }
    t(labelLaidOut.text === 'Card one name' && labelLaidOut.h > 10 && labelLaidOut.visible === 'visible', "the card's own label is laid out")
    t(bodyShot.length > 700, `and actually painted (${bodyShot.length}b of pixels, a flat strip would be far smaller)`)

    const iframeBoxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.thumb')).map((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { h: Math.round(r.height), w: Math.round(r.width), overflow: cs.overflow, contain: cs.contain }
      }),
    )
    t(iframeBoxes.every((b) => b.h === 190), `every thumbnail keeps its declared height (${iframeBoxes.map((b) => b.h).join(',')})`)
    t(iframeBoxes.every((b) => b.contain.includes('paint')), 'every thumbnail declares paint containment, which overflow alone does not give')
  }

  /* ---- hostile host-page CSS -------------------------------------------- */
  //
  // An embedded quiz lands on somebody else's page. Their reset is hostile by
  // accident: `* { color: red !important }` and `div { display: inline }` are
  // real things real sites ship.

  {
    const tpl = PORTED_TEMPLATES.find((x) => x.slug === 'answer_first')!
    const inner = documentFor(tpl.slug, BRANDS[0])
    const hostile = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{color:#ff0000 !important;font-family:cursive !important}
      div,section,header,footer{display:inline !important;position:static !important}
      iframe{border:20px solid magenta}
      h1,h2,h3,p{margin:0 !important;font-size:8px !important}
    </style></head><body>
      <h1>Host page heading</h1>
      <iframe id="embed" sandbox srcdoc="${inner.replace(/"/g, '&quot;')}" style="width:100%;height:700px"></iframe>
    </body></html>`

    await load(page, hostile, 1100, 800)
    await page.waitForTimeout(300)
    const frame = page.frames().find((f) => f !== page.mainFrame())
    t(Boolean(frame), 'the embedded document mounted')
    if (frame) {
      const inside = await frame.evaluate(() => {
        const h1 = document.querySelector('h1')
        const cs = h1 ? getComputedStyle(h1) : null
        return {
          color: cs?.color ?? '',
          fontSize: cs ? parseFloat(cs.fontSize) : 0,
          fontFamily: cs?.fontFamily ?? '',
          display: h1 ? getComputedStyle(h1.parentElement ?? h1).display : '',
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      t(inside.color !== 'rgb(255, 0, 0)', "the host's `* { color: red !important }` does not reach the embed")
      t(inside.fontSize > 12, `the host's 8px override does not reach the embed (${inside.fontSize}px)`)
      t(!/cursive/i.test(inside.fontFamily), "the host's font override does not reach the embed")
      t(inside.display !== 'inline', "the host's `div { display: inline }` does not reach the embed")
      t(inside.overflow <= 1, 'and the embed still does not scroll sideways')
    }
  }

  await page.close()
}

/* --------------------------------------------------------------------- boot */

const browser = await launchChromium()
try {
  await run(browser)
} finally {
  await browser.close()
}

console.log(`\n${pass} passed, ${fail} failed  [${browserProvenance()}]`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
