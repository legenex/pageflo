/**
 * Quiz template fidelity — the perceptual baseline.
 *
 *   pnpm tsx scripts/quiz-template-fidelity.mts
 *   pnpm tsx scripts/quiz-template-fidelity.mts --only sq_editorial_inline,sq_card_deck
 *   pnpm tsx scripts/quiz-template-fidelity.mts --no-reference   # implementation only
 *
 * WHAT THIS ANSWERS. `docs/quiz-template-source-audit.md` proved the twenty
 * supplied designs are genuinely distinct from each other — twenty distinct
 * question-step hashes, structural fingerprinting peaking at 0.702 Jaccard, one
 * byte-identical engine underneath. That is a fact about the SOURCE. It says
 * nothing about whether the implementation reproduces the distinction, and no
 * amount of reading `templates.tsx` can settle it, because the axes it declares
 * (progress form, answer form, width, faces) only matter to the extent they
 * reach pixels. So this measures pixels.
 *
 * It renders every selectable quiz template, under identical conditions, and
 * asks two questions with numbers rather than adjectives:
 *
 *   1. Is each template materially distinct from every OTHER template?
 *   2. How far is each template from its own reference design?
 *
 * WHAT "MATERIALLY DISTINCT" MEANS, AND WHY IT IS NOT A CONSTANT. A fixed
 * threshold invented here would be the harness asserting its own taste. The
 * reference set already contains the answer: twenty designs the source treats as
 * distinct, rendered under one engine, so their own pairwise distances ARE the
 * library's definition of a material difference. The bar is the 5th percentile
 * of the reference pairwise distribution, per viewport — a percentile rather
 * than the minimum so that one unusually close reference pair cannot drag the
 * bar to zero, and derived rather than declared so it moves if the source does.
 *
 * WHAT IS RENDERED, ON BOTH SIDES
 *
 *   Implementation: `QuizStill` — the sanctioned frozen renderer, which mounts
 *   the real `QuizSurface` and its composition with a scripted machine. Not an
 *   approximation of one: the component that draws a gallery thumbnail is the
 *   component that draws a live page. It is mounted in a real Chromium with
 *   real effects (the container-width measurement that decides answer columns
 *   only exists in a browser), from a bundle of the actual `src/` modules.
 *
 *   Reference: the supplied `quizzes/Standalone-Quiz-NN-*.html`, loaded
 *   directly. Those files are self-extracting, so the browser does the
 *   unpacking and what renders is the design as delivered.
 *
 * FRAMING, and it is a deliberate choice rather than a convenience. A still
 * draws no page chrome, and the reference preview has toggles for exactly the
 * chrome a still omits — brand logo, quiz introduction, phone CTA, privacy
 * line. Those are switched OFF before every reference screenshot, so both sides
 * show the same thing: a quiz container on a host background. Left on, the four
 * identical chrome elements would appear in all twenty reference shots and make
 * the references look more alike than they are, which would LOWER the bar the
 * implementation has to clear. The progress indicator is deliberately left ON:
 * it is the template's own identity, not chrome.
 *
 * KNOWN, RECORDED ASYMMETRIES (none of them silent — all land in the JSON):
 *   - The reference draws its own six-step sample flow. The fixture below
 *     mirrors it: six visible steps, the question drawn at step 1 of 6, so an
 *     implementation-vs-reference distance is not dominated by a step counter
 *     reading "1 of 5" against "1 of 6".
 *   - Answer labels differ slightly between the still fixture and the
 *     reference's sample. The question and subheadline are identical.
 *   - Reference screenshots exist for the INITIAL state only. It is the one
 *     state all twenty present on load, identically, without simulating each
 *     design's own interaction model. So the derived threshold is an
 *     initial-state threshold, and only the initial state gates the exit code;
 *     the selected and lead-form states are reported against the same bar and
 *     labelled as borrowing it.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { type Browser, type Page } from 'playwright'

import { launchChromium, browserProvenance } from './lib/browser.ts'
import { QUIZ_TEMPLATES } from '../src/lib/quiz-templates/model.ts'
import { QUIZ_FONTS_HREF } from '../src/lib/quiz-templates/theme.ts'

/* ------------------------------------------------------------------ config */

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'artifacts', 'quiz-fidelity')
const PNG_DIR = join(OUT_DIR, 'png')
const QUIZ_DIR = join(ROOT, 'quizzes')

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const
type ViewportName = (typeof VIEWPORTS)[number]['name']

/**
 * The three positions every template is drawn at.
 *
 * `selected` is here because it is the axis the twenty differ on MOST — a
 * selected answer is a border, a fill and a mark, and each of the nineteen
 * answer forms resolves those differently. Measuring only the resting state
 * would miss a library that distinguishes itself entirely on touch.
 */
const STATES = [
  { name: 'initial', stepIndex: 0, selectedAnswerIndex: -1 },
  { name: 'selected', stepIndex: 0, selectedAnswerIndex: 0 },
  { name: 'form', stepIndex: 5, selectedAnswerIndex: -1 },
] as const
type StateName = (typeof STATES)[number]['name']

/** The reference preview's own chrome switches. Off for every screenshot. */
const REFERENCE_CHROME_TOGGLES = ['Brand logo', 'Quiz introduction', 'Phone CTA', 'Privacy line']

/**
 * Perceptual grid resolution.
 *
 * 64x64 rather than the 8x8 a pHash uses: eight is enough to say "these are the
 * same image" and far too coarse to RANK 190 pairs, which is the actual job
 * here. Sixty-four keeps the layout — where the ink is, how wide the card runs,
 * whether there is a rail down the left — while the box-average downscale
 * absorbs the one and two pixel shifts that carry no meaning.
 */
const GRID = 64

const args = process.argv.slice(2)
const argValue = (name: string): string | null => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const only = (argValue('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const skipReference = args.includes('--no-reference')

const TEMPLATES = only.length ? QUIZ_TEMPLATES.filter((t) => only.includes(t.id)) : QUIZ_TEMPLATES

/* ----------------------------------------------------------------- fixture */

/**
 * The flow every template is drawn with.
 *
 * Mirrors `STILL_FIXTURE_QUIZ` (the question node is transcribed from it, and
 * the harness asserts at runtime that the two still agree) with two deliberate
 * differences: six visible steps rather than five, and a real lead form at the
 * last one. Six because the reference's sample flow reports "1 of 6" and a
 * denominator mismatch would show up as a fidelity gap that is the harness's
 * own. A lead form because the still fixture models none, and the form is one
 * of the three states this has to draw.
 *
 * Every step carries a node. A step with no variant is skipped at runtime and
 * would therefore be skipped by the progress view too, which would collapse the
 * six-milestone journey the rail-shaped progress forms exist to draw — in
 * exactly the templates where the rail IS the identity.
 */
const FIXTURE_STEPS = [
  { key: 'accident', label: 'Accident type' },
  { key: 'state', label: 'Accident state' },
  { key: 'injury', label: 'Injuries' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'insurance', label: 'Insurance contact' },
  { key: 'contact', label: 'Your details' },
]

const FIXTURE_QUIZ = {
  id: 'fidelity_fixture',
  name: 'Fidelity sample',
  slug: 'fidelity-sample',
  tiers: [],
  customFields: [],
  steps: FIXTURE_STEPS,
  nodes: FIXTURE_STEPS.map((s, i) => {
    if (i === 0) {
      return {
        id: 'fx_q',
        stepKey: s.key,
        tiers: [],
        type: 'question',
        questionType: 'button_grid',
        fieldName: 'accident_type',
        isVisible: true,
        answerColumns: 2,
        headline: 'How were you injured?',
        question: '',
        subheadline: 'Select the type of accident you were involved in.',
        answers: [
          { id: 'fx_a1', label: 'Auto / Motorcycle Accident' },
          { id: 'fx_a2', label: 'Commercial / Semi Accident' },
          { id: 'fx_a3', label: 'Passenger / Rideshare / Pedestrian' },
          { id: 'fx_a4', label: 'At Work / Other' },
        ],
      }
    }
    if (i === FIXTURE_STEPS.length - 1) {
      return {
        id: 'fx_form',
        stepKey: s.key,
        tiers: [],
        type: 'form',
        questionType: 'lead_form',
        fieldName: 'lead_form',
        isVisible: true,
        headline: 'Where should we send your review?',
        question: '',
        subheadline: 'A case specialist will call to confirm the details.',
        formFields: [
          { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'First Name', required: true },
          { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Last Name', required: true },
          { key: 'email', label: 'Email', type: 'email', placeholder: 'Email Address', required: true },
          { key: 'mobile', label: 'Cell Number', type: 'tel', placeholder: 'Cell Number', required: true },
          { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: '5 Digit Zip', required: true },
        ],
        honeypot: true,
        answers: [{ id: 'fx_submitted', label: 'Submitted' }],
      }
    }
    return {
      id: `fx_step_${i}`,
      stepKey: s.key,
      tiers: [],
      type: 'question',
      questionType: 'single_select',
      isVisible: true,
      headline: s.label,
      answers: [],
    }
  }),
}

/* --------------------------------------------------------- the impl bundle */

/**
 * esbuild, wherever this machine keeps it.
 *
 * It is a transitive dependency (tsx's), not a declared one, so a bare import
 * does not resolve under pnpm's strict layout. Resolving it properly when it IS
 * hoisted and scanning the store when it is not keeps this working on a
 * developer machine and on the server without either of them having to install
 * a bundler they do not otherwise need. A miss is fatal and says so: a harness
 * that silently fell back to server-rendered markup would be measuring a render
 * without the container-width effect that decides answer columns, which is one
 * of the axes under test.
 */
const locateEsbuild = (): string => {
  const req = createRequire(import.meta.url)
  try {
    return req.resolve('esbuild')
  } catch {
    /* fall through to the pnpm store */
  }
  const store = join(ROOT, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    const dirs = readdirSync(store)
      .filter((d) => /^esbuild@\d/.test(d))
      .sort((a, b) => {
        const pa = a.slice(8).split('.').map(Number)
        const pb = b.slice(8).split('.').map(Number)
        for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
        return 0
      })
      .reverse()
    for (const d of dirs) {
      const p = join(store, d, 'node_modules', 'esbuild', 'lib', 'main.js')
      if (existsSync(p)) return p
    }
  }
  throw new Error('esbuild not found (looked in node_modules and node_modules/.pnpm) — run `pnpm install`')
}

/**
 * The browser bundle: the real components, plus the handful of accessors this
 * harness needs to avoid re-deriving anything the product already decides.
 * `pageBg` in particular comes from the template's OWN resolver — the same call
 * `QuizStillThumb` makes for its ground — so the canvas behind a still is never
 * a colour this file invented.
 */
const BUNDLE_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QuizStill } from '@/components/builder/quiz/QuizStill'
import { getTemplateConfig } from '@/components/builder/quiz/templates'
import { STILL_FIXTURE_QUIZ } from '@/components/public/quiz/machine'
import { PREVIEW_BRAND_DEFAULT } from '@/components/builder/preview-brand'

let root = null
const container = document.createElement('div')
container.id = 'fidelity-root'
document.body.appendChild(container)

window.__fidelity = {
  stillFixture: STILL_FIXTURE_QUIZ,
  brand: PREVIEW_BRAND_DEFAULT,
  mount(props) {
    if (root) { root.unmount(); root = null }
    container.innerHTML = ''
    // The template's own page ground, so the canvas a still is photographed on
    // is the one the product paints rather than one this harness chose.
    container.style.background = getTemplateConfig(props.templateId, props.progressForm ?? null).pageBg(PREVIEW_BRAND_DEFAULT)
    container.style.minHeight = '100vh'
    root = createRoot(container)
    root.render(React.createElement(QuizStill, props))
  },
}
`

/**
 * The slice of esbuild's API this uses, declared locally.
 *
 * `typeof import('esbuild')` would be better if esbuild were on the resolution
 * path, and it is not: it is a transitive dependency loaded from an absolute
 * path, so the compiler has no module to read types from and the harness would
 * be the one file that fails `pnpm typecheck`. Narrow and explicit beats a cast
 * to `any` — a wrong option name still fails to compile here.
 */
type EsbuildModule = {
  version: string
  build: (options: {
    stdin: { contents: string; resolveDir: string; loader: string; sourcefile: string }
    bundle: boolean
    write: boolean
    format: string
    platform: string
    target: string
    jsx: string
    define: Record<string, string>
    alias: Record<string, string>
    logLevel: string
  }) => Promise<{ outputFiles: Array<{ text: string }> }>
}

const buildBundle = async (): Promise<{ code: string; version: string; bytes: number }> => {
  const esbuild = (await import(pathToFileURL(locateEsbuild()).href)) as unknown as EsbuildModule
  const out = await esbuild.build({
    stdin: { contents: BUNDLE_ENTRY, resolveDir: ROOT, loader: 'tsx', sourcefile: 'fidelity-entry.tsx' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': join(ROOT, 'src') },
    logLevel: 'warning',
  })
  const code = out.outputFiles[0].text
  return { code, version: esbuild.version, bytes: code.length }
}

/* ------------------------------------------------------------------- pages */

/**
 * Evaluated bodies are passed to the browser as SOURCE STRINGS, never as
 * closures. tsx compiles through esbuild, which rewrites arrow functions to
 * carry a `__name` helper that exists in the bundle and not in the page; a
 * compiled closure handed to playwright therefore throws `__name is not
 * defined` inside the page, and the failure reads as a browser problem rather
 * than a build one. `scripts/test-render-dom.mts` carries the same note.
 */
const evalIn = async <T,>(page: Page, source: string): Promise<T> => page.evaluate(source) as Promise<T>

/** The four faces the twenty are set in. */
const QUIZ_FONT_FAMILIES = ['Archivo', 'Inter', 'JetBrains Mono', 'Source Serif 4']

/**
 * Ask for every face up front.
 *
 * A `@font-face` is fetched lazily, when something on the page first uses it,
 * so `document.fonts.check` before anything is mounted answers "not yet" for
 * every family and reads as a failure. Requesting them explicitly makes the
 * later check mean what it says, and makes the first screenshot no different
 * from the twentieth.
 */
const PRELOAD_FONTS = `Promise.all(${JSON.stringify(QUIZ_FONT_FAMILIES)}
  .flatMap((f) => ['400', '600', '700'].map((w) => document.fonts.load(w + ' 16px "' + f + '"').catch(() => null))))
  .then(() => true)`

/** Fonts settled, paint settled. Two frames, because one is not a paint. */
const settle = async (page: Page, ms = 220): Promise<void> => {
  await evalIn(page, `document.fonts.ready.then(() => true)`)
  await page.waitForTimeout(ms)
  await evalIn(page, `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`)
}

/**
 * Transitions and animations off, on both sides.
 *
 * A screenshot taken mid-transition is a different picture every run, and a
 * regression suite whose baseline moves on its own gets switched off. This
 * changes timing, never geometry or colour.
 */
const FREEZE_CSS = '*,*::before,*::after{transition:none!important;animation:none!important}'

const IMPL_PAGE = (bundle: string): string => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${QUIZ_FONTS_HREF}">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}${FREEZE_CSS}</style>
</head><body><script>${bundle}</script></body></html>`

/** Which of the four faces actually arrived, after they have been asked for. */
const FONT_PROBE = `(() => {
  const out = {}
  for (const f of ${JSON.stringify(QUIZ_FONT_FAMILIES)}) out[f] = document.fonts.check('16px "' + f + '"')
  return out
})()`

/* -------------------------------------------------------- reference driver */

/** `SQ-07` -> the supplied `quizzes/Standalone-Quiz-07-*.html`, or null. */
const referenceFileFor = (code: string): string | null => {
  const n = /(\d+)/.exec(code)?.[1]
  if (!n) return null
  const prefix = `Standalone-Quiz-${n.padStart(2, '0')}-`
  const hit = readdirSync(QUIZ_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.html'))
  return hit ? join(QUIZ_DIR, hit) : null
}

/** Read the preview toolbar, which names the design it is showing. */
const TOOLBAR_PROBE = `(() => {
  const all = Array.from(document.querySelectorAll('*'))
  const sticky = all.find((e) => getComputedStyle(e).position === 'sticky')
  return sticky ? (sticky.innerText || '').replace(/\\s+/g, ' ').trim() : ''
})()`

/** Click the one switch whose row is labelled `label`; report whether it moved. */
const toggleScript = (label: string): string => `(() => {
  const want = ${JSON.stringify(label)}
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 28 || r.width > 52 || r.height < 12 || r.height > 30) continue
    if (parseFloat(cs.borderRadius) < 8) continue
    const row = el.parentElement
    if (!row) continue
    if ((row.innerText || '').replace(/\\s+/g, ' ').trim() !== want) continue
    const before = cs.backgroundColor
    el.click()
    return { found: true, before }
  }
  return { found: false, before: '' }
})()`

/** Is the switch labelled `label` currently OFF (not the panel's green)? */
const toggleStateScript = (label: string): string => `(() => {
  const want = ${JSON.stringify(label)}
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 28 || r.width > 52 || r.height < 12 || r.height > 30) continue
    if (parseFloat(cs.borderRadius) < 8) continue
    const row = el.parentElement
    if (!row) continue
    if ((row.innerText || '').replace(/\\s+/g, ' ').trim() !== want) continue
    return { found: true, bg: cs.backgroundColor }
  }
  return { found: false, bg: '' }
})()`

const HIDE_PANEL = `(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find((b) => /HIDE SETTINGS/i.test((b.textContent || '').trim()))
  if (!btn) return false
  btn.click()
  return true
})()`

const HIDE_TOOLBAR = `(() => {
  const sticky = Array.from(document.querySelectorAll('*'))
    .find((e) => getComputedStyle(e).position === 'sticky')
  if (!sticky) return false
  sticky.style.display = 'none'
  return true
})()`

const PANEL_GONE = `(() => !Array.from(document.querySelectorAll('*'))
  .some((e) => Math.round(e.getBoundingClientRect().width) === 300 && (e.innerText || '').includes('QUIZ SETTINGS')))()`

/**
 * Reclaim the height the hidden toolbar was holding.
 *
 * The preview sizes its host area at `calc(100vh - 49px)` to sit under a
 * toolbar this harness removes, which leaves a 49px band of the preview's own
 * dark shell along the bottom of every reference screenshot. That band is
 * identical in all twenty, so it would quietly pull every reference pair closer
 * together and LOWER the bar the implementation has to clear. Expressed in
 * `vh`, so it survives the resize to the phone viewport.
 */
const STRETCH_HOST = `(() => {
  const h = window.innerHeight
  let n = 0
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const mh = parseFloat(getComputedStyle(el).minHeight)
    if (Number.isFinite(mh) && mh > h - 90 && mh < h) { el.style.minHeight = '100vh'; n += 1 }
  }
  return n
})()`

/* --------------------------------------------------------- the metric */

/**
 * The distance between two screenshots.
 *
 * PRIMARY — root-mean-square difference over a 64x64 luminance grid, in [0,1].
 * Not a byte hash and not a raw pixel diff. A byte hash answers "identical or
 * not", which is the wrong question when the interesting failure is "different
 * in ways nobody would notice". A raw full-resolution diff answers a question
 * about antialiasing. Downscaling to a grid first is what makes the number
 * perceptual: the box-average throws away sub-pixel detail and keeps the thing
 * a person actually reads a layout by — where the dark regions are, how wide
 * the card runs, whether the page ground is light or dark.
 *
 * SECONDARY — dHash, 64 bits of horizontal-gradient sign, reported as a
 * normalised Hamming distance. It is brightness- and contrast-invariant, so it
 * corroborates the primary where the primary might be reading tone alone: two
 * templates that differ only in page ground score high on RMSE and near zero on
 * dHash, and that pair is a recolour rather than a design.
 *
 * Both are computed from the same PNG in the same downscale pass, so neither
 * can drift from what was actually photographed.
 */
type Fingerprint = { grid: Float64Array; dhash: bigint }

const fingerprint = async (png: Buffer): Promise<Fingerprint> => {
  const base = sharp(png).flatten({ background: '#ffffff' }).greyscale()
  const grid = await base
    .clone()
    .resize(GRID, GRID, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer()
  const dh = await base
    .clone()
    .resize(9, 8, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer()

  const g = new Float64Array(GRID * GRID)
  for (let i = 0; i < g.length; i += 1) g[i] = grid[i] / 255

  let bits = 0n
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = dh[y * 9 + x]
      const right = dh[y * 9 + x + 1]
      bits = (bits << 1n) | (left > right ? 1n : 0n)
    }
  }
  return { grid: g, dhash: bits }
}

const rmse = (a: Float64Array, b: Float64Array): number => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum / a.length)
}

const hamming = (a: bigint, b: bigint): number => {
  let x = a ^ b
  let n = 0
  while (x) {
    x &= x - 1n
    n += 1
  }
  return n / 64
}

const distance = (a: Fingerprint, b: Fingerprint): { rmse: number; dhash: number } => ({
  rmse: rmse(a.grid, b.grid),
  dhash: hamming(a.dhash, b.dhash),
})

/* ------------------------------------------------------------- statistics */

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return NaN
  const idx = (sortedAsc.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

const describe = (values: number[]): Record<string, number> => {
  const s = [...values].sort((a, b) => a - b)
  return {
    n: s.length,
    min: s[0] ?? NaN,
    p5: percentile(s, 0.05),
    p10: percentile(s, 0.1),
    p25: percentile(s, 0.25),
    median: percentile(s, 0.5),
    p75: percentile(s, 0.75),
    max: s[s.length - 1] ?? NaN,
    mean: s.reduce((a, b) => a + b, 0) / (s.length || 1),
  }
}

/**
 * Connected components under the threshold — single linkage, deliberately.
 *
 * Single linkage is the right join rule for this question: two templates belong
 * to the same collapse if a chain of indistinguishable pairs connects them,
 * because a picker showing the whole chain offers a run of pictures no operator
 * can tell apart. Complete linkage would split exactly that run.
 */
const clusterBelow = (
  ids: string[],
  dist: (a: string, b: string) => number,
  threshold: number,
): string[][] => {
  const parent = new Map(ids.map((id) => [id, id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    while (parent.get(x) !== r) { const nx = parent.get(x) as string; parent.set(x, r); x = nx }
    return r
  }
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (dist(ids[i], ids[j]) < threshold) {
        const a = find(ids[i])
        const b = find(ids[j])
        if (a !== b) parent.set(a, b)
      }
    }
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const r = find(id)
    groups.set(r, [...(groups.get(r) ?? []), id])
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

/* ------------------------------------------------------------------- main */

type Shot = { file: string; fp: Fingerprint }
type ShotKey = string // `${templateId}|${viewport}|${state}`

const implShots = new Map<ShotKey, Shot>()
const refShots = new Map<ShotKey, Shot>()
const notes: string[] = []
const renderFailures: Array<{ id: string; side: 'implementation' | 'reference'; reason: string }> = []
const referenceMeta: Record<string, unknown> = {}
let fontStatus: Record<string, boolean> = {}

const log = (s: string): void => console.log(s)

const capture = async (
  page: Page,
  into: Map<ShotKey, Shot>,
  id: string,
  viewport: ViewportName,
  state: string,
  filename: string,
): Promise<void> => {
  const file = join(PNG_DIR, filename)
  const png = await page.screenshot({ path: file })
  into.set(`${id}|${viewport}|${state}`, { file: filename, fp: await fingerprint(png) })
}

const renderImplementation = async (browser: Browser, bundle: string): Promise<void> => {
  const page = await browser.newPage()
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height })
  await page.setContent(IMPL_PAGE(bundle), { waitUntil: 'load' })
  await evalIn(page, PRELOAD_FONTS)
  await settle(page, 600)

  fontStatus = await evalIn<Record<string, boolean>>(page, FONT_PROBE)
  const missing = Object.entries(fontStatus).filter(([, ok]) => !ok).map(([f]) => f)
  if (missing.length) {
    notes.push(
      `FONTS: ${missing.join(', ')} did not load. The twenty differ partly by FACE ` +
      '(serif question vs display sans vs mono utility), so a run without them understates ' +
      'the distinction. Check network access to fonts.googleapis.com.',
    )
  }

  /*
   * The fixture must not have drifted from the one the gallery draws. If the
   * still fixture's question changes and this file's copy does not, every
   * number below is measured against a question no surface in the product
   * shows — and nothing would say so.
   */
  const stillHeadline = await evalIn<string>(
    page,
    `(() => { const q = (window.__fidelity.stillFixture.nodes || []).find((n) => n.type === 'question' && n.answers && n.answers.length); return q ? String(q.headline) : '' })()`,
  )
  if (stillHeadline !== FIXTURE_QUIZ.nodes[0].headline) {
    notes.push(
      `FIXTURE DRIFT: STILL_FIXTURE_QUIZ now asks "${stillHeadline}" but this harness asks ` +
      `"${FIXTURE_QUIZ.nodes[0].headline}". Re-transcribe the fixture.`,
    )
  }

  for (const tpl of TEMPLATES) {
    for (const state of STATES) {
      const props = {
        templateId: tpl.id,
        progressForm: null,
        quiz: FIXTURE_QUIZ,
        stepIndex: state.stepIndex,
        selectedAnswerIndex: state.selectedAnswerIndex,
      }
      try {
        await evalIn(page, `window.__fidelity.mount(${JSON.stringify(props)})`)
        await page.waitForSelector('[data-quiz-root]', { timeout: 10000 })
        for (const vp of VIEWPORTS) {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await settle(page)
          await capture(page, implShots, tpl.id, vp.name, state.name, `${tpl.id}.${vp.name}.${state.name}.png`)
        }
        // Back to the first viewport so the next mount starts from one place.
        await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height })
      } catch (err) {
        renderFailures.push({ id: tpl.id, side: 'implementation', reason: `${state.name}: ${(err as Error).message}` })
      }
    }
    log(`  impl  ${tpl.id.padEnd(24)} ${STATES.length * VIEWPORTS.length} shots`)
  }

  if (consoleErrors.length) {
    notes.push(`IMPLEMENTATION CONSOLE (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ').slice(0, 400)}`)
  }
  await page.close()
}

const renderReferences = async (browser: Browser): Promise<void> => {
  const page = await browser.newPage()

  for (const tpl of TEMPLATES) {
    const file = referenceFileFor(tpl.code)
    const meta: Record<string, unknown> = { code: tpl.code, file: file ? file.replace(`${ROOT}/`, '') : null }
    referenceMeta[tpl.id] = meta
    if (!file) {
      renderFailures.push({ id: tpl.id, side: 'reference', reason: `no quizzes/Standalone-Quiz-${tpl.code} file` })
      continue
    }
    try {
      await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height })
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 60000 })
      // The bundle unpacks itself and then renders; wait for real copy rather
      // than for a timer, so a slow machine does not photograph a blank page.
      await page.waitForFunction(`(document.body.innerText || '').includes('QUIZ SETTINGS')`, null, { timeout: 45000 })
      await settle(page, 500)

      /*
       * The design names itself in its own toolbar. Matching the file by its
       * number and then VERIFYING the slug is what keeps a renumbered or
       * re-exported artifact from being silently compared against the wrong
       * template — a mistake that would read as a fidelity failure.
       */
      const toolbar = await evalIn<string>(page, TOOLBAR_PROBE)
      meta.toolbar = toolbar
      meta.idVerified = toolbar.includes(tpl.id)
      if (!meta.idVerified) {
        notes.push(`REFERENCE MISMATCH: ${tpl.id} matched ${file.split('/').pop()} whose toolbar reads "${toolbar.slice(0, 80)}"`)
      }

      const toggled: Record<string, string> = {}
      for (const label of REFERENCE_CHROME_TOGGLES) {
        const hit = await evalIn<{ found: boolean }>(page, toggleScript(label))
        if (!hit.found) { toggled[label] = 'absent'; continue }
        await page.waitForTimeout(120)
        const after = await evalIn<{ found: boolean; bg: string }>(page, toggleStateScript(label))
        // The panel paints an engaged switch in its own green; anything else is off.
        toggled[label] = after.found && after.bg.replace(/\s/g, '') === 'rgb(16,185,129)' ? 'still-on' : 'off'
      }
      meta.chromeToggles = toggled

      meta.panelHidden = await evalIn<boolean>(page, HIDE_PANEL)
      await page.waitForTimeout(150)
      meta.panelGone = await evalIn<boolean>(page, PANEL_GONE)
      meta.toolbarHidden = await evalIn<boolean>(page, HIDE_TOOLBAR)
      meta.hostStretched = await evalIn<number>(page, STRETCH_HOST)
      await page.addStyleTag({ content: FREEZE_CSS })
      await settle(page, 300)

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await settle(page, 300)
        await capture(page, refShots, tpl.id, vp.name, 'reference', `${tpl.id}.${vp.name}.reference.png`)
      }
      log(`  ref   ${tpl.id.padEnd(24)} ${meta.idVerified ? 'id ok' : 'ID UNVERIFIED'}  chrome=${Object.values(toggled).join(',')}`)
    } catch (err) {
      renderFailures.push({ id: tpl.id, side: 'reference', reason: (err as Error).message })
      log(`  ref   ${tpl.id.padEnd(24)} FAILED: ${(err as Error).message.slice(0, 90)}`)
    }
  }

  await page.close()
}

/* --------------------------------------------------------------- run it */

mkdirSync(PNG_DIR, { recursive: true })

log(`quiz template fidelity — ${TEMPLATES.length} template(s)`)
log(`browser: ${browserProvenance()}`)

const { code: bundle, version: esbuildVersion, bytes } = await buildBundle()
log(`bundle: ${(bytes / 1024).toFixed(0)}kB via esbuild ${esbuildVersion}`)

const browser = await launchChromium()
try {
  await renderImplementation(browser, bundle)
  if (!skipReference) await renderReferences(browser)
} finally {
  await browser.close()
}

/* ------------------------------------------------------------- distances */

const ids = TEMPLATES.map((t) => t.id)
const nameOf = new Map(TEMPLATES.map((t) => [t.id, t.name]))

type PairRow = { a: string; b: string; rmse: number; dhash: number }
const implPairs: Record<string, PairRow[]> = {}
const refPairs: Record<string, PairRow[]> = {}

const pairsFor = (shots: Map<ShotKey, Shot>, viewport: string, state: string): PairRow[] => {
  const rows: PairRow[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const A = shots.get(`${ids[i]}|${viewport}|${state}`)
      const B = shots.get(`${ids[j]}|${viewport}|${state}`)
      if (!A || !B) continue
      rows.push({ a: ids[i], b: ids[j], ...distance(A.fp, B.fp) })
    }
  }
  return rows
}

for (const vp of VIEWPORTS) {
  for (const st of STATES) implPairs[`${vp.name}|${st.name}`] = pairsFor(implShots, vp.name, st.name)
  refPairs[vp.name] = pairsFor(refShots, vp.name, 'reference')
}

/**
 * The bar, per viewport, derived from the references and from nothing else.
 * See the header: a constant here would be this file asserting its own taste.
 */
const thresholds: Record<string, { stats: Record<string, number>; threshold: number; source: string }> = {}
for (const vp of VIEWPORTS) {
  const rows = refPairs[vp.name] ?? []
  const stats = describe(rows.map((r) => r.rmse))
  thresholds[vp.name] = {
    stats,
    threshold: stats.p5,
    source: rows.length
      ? `5th percentile of ${rows.length} reference pairwise RMSE at ${vp.name}`
      : 'NO REFERENCE PAIRS — threshold unavailable',
  }
}

/* ------------------------------------------------------------ the verdict */

type Summary = {
  id: string
  name: string
  code: string
  nearest: Record<string, { id: string; rmse: number; dhash: number } | null>
  toReference: Record<string, { rmse: number; dhash: number } | null>
  pass: boolean
  failedAt: string[]
}

const summaries: Summary[] = TEMPLATES.map((t) => {
  const nearest: Summary['nearest'] = {}
  const toReference: Summary['toReference'] = {}
  const failedAt: string[] = []

  for (const vp of VIEWPORTS) {
    for (const st of STATES) {
      const key = `${vp.name}|${st.name}`
      const rows = (implPairs[key] ?? []).filter((r) => r.a === t.id || r.b === t.id)
      let best: { id: string; rmse: number; dhash: number } | null = null
      for (const r of rows) {
        const other = r.a === t.id ? r.b : r.a
        if (!best || r.rmse < best.rmse) best = { id: other, rmse: r.rmse, dhash: r.dhash }
      }
      nearest[key] = best
      const bar = thresholds[vp.name]?.threshold
      // Only the INITIAL state gates: it is the only state the reference set
      // gives an expectation for. The others are measured against the same bar
      // and reported, but a borrowed bar must not fail a build.
      if (st.name === 'initial' && best && Number.isFinite(bar) && best.rmse < bar) failedAt.push(key)
    }
    const own = refShots.get(`${t.id}|${vp.name}|reference`)
    const impl = implShots.get(`${t.id}|${vp.name}|initial`)
    toReference[vp.name] = own && impl ? distance(impl.fp, own.fp) : null
  }

  return { id: t.id, name: t.name, code: t.code, nearest, toReference, pass: failedAt.length === 0, failedAt }
})

const clusters: Record<string, string[][]> = {}
for (const vp of VIEWPORTS) {
  const bar = thresholds[vp.name]?.threshold
  if (!Number.isFinite(bar)) continue
  for (const st of STATES) {
    const key = `${vp.name}|${st.name}`
    const map = new Map((implPairs[key] ?? []).map((r) => [`${r.a}|${r.b}`, r.rmse]))
    clusters[key] = clusterBelow(ids, (a, b) => map.get(`${a}|${b}`) ?? map.get(`${b}|${a}`) ?? Infinity, bar)
  }
  const refMap = new Map((refPairs[vp.name] ?? []).map((r) => [`${r.a}|${r.b}`, r.rmse]))
  clusters[`${vp.name}|reference`] = clusterBelow(ids, (a, b) => refMap.get(`${a}|${b}`) ?? refMap.get(`${b}|${a}`) ?? Infinity, bar)
}

/* ------------------------------------------------------------------ report */

const f = (n: number | undefined | null, d = 4): string => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '   -  ')

log('')
log('REFERENCE PAIRWISE DISTRIBUTION (what the source calls a material difference)')
for (const vp of VIEWPORTS) {
  const s = thresholds[vp.name].stats
  log(`  ${vp.name.padEnd(8)} n=${s.n}  min=${f(s.min)}  p5=${f(s.p5)}  p25=${f(s.p25)}  median=${f(s.median)}  max=${f(s.max)}`)
  log(`  ${''.padEnd(8)} threshold = ${f(thresholds[vp.name].threshold)}  (${thresholds[vp.name].source})`)
}

log('')
log('IMPLEMENTATION PAIRWISE DISTRIBUTION')
for (const vp of VIEWPORTS) {
  for (const st of STATES) {
    const s = describe((implPairs[`${vp.name}|${st.name}`] ?? []).map((r) => r.rmse))
    log(`  ${vp.name.padEnd(8)} ${st.name.padEnd(9)} n=${s.n}  min=${f(s.min)}  p5=${f(s.p5)}  median=${f(s.median)}  max=${f(s.max)}`)
  }
}

log('')
log('PER TEMPLATE — nearest other template and distance to own reference (initial state)')
log(
  `  ${'id'.padEnd(24)}${'name'.padEnd(22)}${'nearest other'.padEnd(24)}` +
  `${'dist'.padEnd(9)}${'vs ref'.padEnd(9)}${'m/nearest'.padEnd(11)}${'m/ref'.padEnd(9)}verdict`,
)
for (const s of summaries) {
  const dn = s.nearest['desktop|initial']
  const mn = s.nearest['mobile|initial']
  log(
    `  ${s.id.padEnd(24)}${s.name.padEnd(22)}${(dn?.id ?? '-').padEnd(24)}` +
    `${f(dn?.rmse).padEnd(9)}${f(s.toReference.desktop?.rmse).padEnd(9)}` +
    `${f(mn?.rmse).padEnd(11)}${f(s.toReference.mobile?.rmse).padEnd(9)}${s.pass ? 'PASS' : `FAIL (${s.failedAt.join(', ')})`}`,
  )
}

log('')
log('CLUSTERS (single linkage under the derived threshold)')
for (const key of Object.keys(clusters)) {
  const groups = clusters[key]
  const collapsed = groups.filter((g) => g.length > 1)
  log(`  ${key.padEnd(20)} ${groups.length} distinct group(s) of ${ids.length}${collapsed.length ? '' : '  — no collapse'}`)
  for (const g of collapsed) {
    const map = key.endsWith('reference')
      ? new Map((refPairs[key.split('|')[0]] ?? []).map((r) => [`${r.a}|${r.b}`, r.rmse]))
      : new Map((implPairs[key] ?? []).map((r) => [`${r.a}|${r.b}`, r.rmse]))
    const inner: string[] = []
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        const d = map.get(`${g[i]}|${g[j]}`) ?? map.get(`${g[j]}|${g[i]}`)
        if (typeof d === 'number' && d < (thresholds[key.split('|')[0]]?.threshold ?? Infinity)) {
          inner.push(`${g[i]}~${g[j]}=${f(d, 4)}`)
        }
      }
    }
    log(`      [${g.join(', ')}]`)
    log(`        ${inner.join('  ')}`)
  }
}

if (notes.length) {
  log('')
  log('NOTES')
  for (const n of notes) log(`  ! ${n}`)
}
if (renderFailures.length) {
  log('')
  log('RENDER FAILURES')
  for (const r of renderFailures) log(`  ! ${r.side} ${r.id}: ${r.reason}`)
}

/* --------------------------------------------------------------- artefacts */

const json = {
  generatedAt: new Date().toISOString(),
  browser: browserProvenance(),
  esbuild: esbuildVersion,
  metric: {
    primary: `rmse over a ${GRID}x${GRID} luminance grid, range 0..1`,
    secondary: 'dhash 64-bit horizontal-gradient sign, normalised hamming, range 0..1',
    grid: GRID,
  },
  framing: {
    implementation: 'QuizStill (QuizSurface + the resolved composition, still machine), PREVIEW_BRAND_DEFAULT, no page chrome',
    reference: `supplied bundle, chrome toggles off: ${REFERENCE_CHROME_TOGGLES.join(', ')}; progress indicator left on`,
    referenceStates: ['initial'],
    gatingState: 'initial',
    implementationFontsLoaded: fontStatus,
  },
  viewports: VIEWPORTS,
  states: STATES,
  fixture: FIXTURE_QUIZ,
  templates: TEMPLATES.map((t) => ({ id: t.id, code: t.code, name: t.name, reference: referenceMeta[t.id] ?? null })),
  thresholds,
  pairwise: { implementation: implPairs, reference: refPairs },
  clusters,
  summary: summaries,
  notes,
  renderFailures,
}
writeFileSync(join(OUT_DIR, 'fidelity.json'), `${JSON.stringify(json, null, 2)}\n`)

log('')
log(`png:  ${PNG_DIR.replace(`${ROOT}/`, '')}/  (${implShots.size + refShots.size} files)`)
log(`json: ${join(OUT_DIR, 'fidelity.json').replace(`${ROOT}/`, '')}`)

/* ------------------------------------------------------------- exit code */

const failed = summaries.filter((s) => !s.pass)
const noThreshold = VIEWPORTS.some((v) => !Number.isFinite(thresholds[v.name]?.threshold))

log('')
if (renderFailures.length) {
  log(`FAIL — ${renderFailures.length} render failure(s); the baseline is incomplete.`)
  process.exit(1)
}
if (noThreshold && !skipReference) {
  log('FAIL — no reference pairs, so no expectation could be derived. Nothing was measured against anything.')
  process.exit(1)
}
if (skipReference) {
  log('implementation-only run: no expectation derived, nothing gated.')
  process.exit(0)
}
if (failed.length) {
  log(
    `FAIL — ${failed.length} of ${TEMPLATES.length} template(s) that the SOURCE makes materially distinct ` +
    'have collapsed to near-identical screenshots:',
  )
  for (const s of failed) {
    for (const key of s.failedAt) {
      const n = s.nearest[key]
      log(`   ${s.id} ~ ${n?.id} at ${key}: ${f(n?.rmse)} < ${f(thresholds[key.split('|')[0]].threshold)}`)
    }
  }
  process.exit(1)
}
log(`PASS — all ${TEMPLATES.length} templates are materially distinct at the source-derived bar.`)
