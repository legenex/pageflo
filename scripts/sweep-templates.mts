/**
 * Render every registered template against every brand fixture and report the
 * colour pairings that collide.
 *
 *   pnpm sweep:templates                    # everything
 *   pnpm sweep:templates -- --fixture=pureWhite
 *   pnpm sweep:templates -- --only=quiz
 *   pnpm sweep:templates -- --json
 *
 * This is the gate, and it is deliberately written before most of what it
 * gates. "Is this template done" was a question only a person looking at a
 * screen could answer, which meant it was answered once, by one person, against
 * whichever brand they had open. It is now a command with an exit code.
 *
 * Two properties are load-bearing and easy to lose:
 *
 *  1. IT NEVER PASSES VACUOUSLY. An empty registry exits non-zero and says the
 *     registry is empty. A gate that reports success when it checked nothing is
 *     worse than no gate, because it is believed.
 *
 *  2. EVERY VIOLATION IS ACTIONABLE. Template id, fixture id, both colours, the
 *     measured ratio and the ratio required. A pass/fail count tells whoever
 *     reads it that something is wrong and nothing about what to open.
 *
 * The fixtures are in `src/lib/brand-fixtures.ts` and are hostile on purpose,
 * so a fixture's OWN contrast audit failing is expected and is not counted here
 * - that is the brand being broken, which is the input. What is counted is a
 * template still rendering it unreadably, because the promise the colour system
 * makes is that a text colour is derived against the surface it lands on
 * whatever the brand says.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BRAND_FIXTURES, IDENTITY_COLOR_KEYS, type BrandFixture, type FixtureBrand } from '../src/lib/brand-fixtures.ts'
import { resolveBrandTokens, MissingBrandTokenError } from '../src/lib/brand/resolve-tokens.ts'
import { auditColorPairs, parseHex, type ColorPair, type ColorViolation } from '../src/lib/builder/color-system.ts'
import { LP_IDENTITIES } from '../src/lib/lp-identities/index.ts'
import { markColors, resolveLpPalette } from '../src/lib/lp-nodes/palette.ts'
import { deriveSurface, groundFor } from '../src/lib/lp-nodes/surface.ts'
import type { ToneId } from '../src/lib/lp-nodes/model.ts'
import { QUIZ_TEMPLATES } from '../src/lib/quiz-templates/model.ts'
import { quizTheme } from '../src/lib/quiz-templates/theme.ts'
import { PORTED_TEMPLATES } from '../src/lib/lp-templates/index.ts'
import { templateVars } from '../src/lib/lp-templates/tokens.ts'

// `import.meta.dirname` needs Node 20.11; package.json only promises 20.9, and
// a gate that fails to start on the deploy host is a gate nobody has.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// Import boundary
// ---------------------------------------------------------------------------

/**
 * The fixtures are a verification asset. A fake brand reaching a public render
 * is a real page showing colours nobody authored, so the boundary is checked on
 * every run rather than left to a convention somebody will not know about.
 */
const FORBIDDEN_ROOTS = ['src/app/(public)', 'src/collections']

const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

const importBoundaryBreaches = (): string[] =>
  FORBIDDEN_ROOTS.flatMap((root) =>
    walk(path.join(REPO, root))
      .filter((file) => /brand-fixtures/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO, file)),
  )

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

type Family = 'lp-identity' | 'quiz' | 'lp-ported'

type RegisteredTemplate = {
  id: string
  family: Family
  label: string
  /**
   * The concrete foreground/background pairings this template puts on screen
   * for one brand. Resolved through the same functions the renderers call, so a
   * pass here is a statement about what ships rather than about a model of it.
   */
  pairs: (brand: FixtureBrand) => ColorPair[]
}

/** Every ground an identity-driven section can be toned to. */
const LP_TONES: ToneId[] = ['default', 'surface', 'dark', 'brand', 'inverse']

/**
 * Hairlines are deliberately absent from every pair set below.
 *
 * A rule separating two sections has to be PERCEPTIBLE, not to clear the 3:1
 * that WCAG asks of a control boundary - `resolve-tokens.ts` separates those
 * into `border` and `border-strong` for exactly that reason. Auditing hairlines
 * at 3:1 would report a violation for every template under every brand, and a
 * report that is always red is a report nobody reads.
 */
const lpIdentityTemplates = (): RegisteredTemplate[] =>
  LP_IDENTITIES.map((identity) => ({
    id: `lp-identity:${identity.id}`,
    family: 'lp-identity' as const,
    label: `LP identity ${identity.id.toUpperCase()} (${identity.position})`,
    pairs: (brand) => {
      const palette = resolveLpPalette(identity, brand)
      return LP_TONES.flatMap((tone) => {
        const s = deriveSurface(groundFor(tone, palette), palette)
        // The logo's paths, resolved exactly as ElementNode resolves them:
        // remapped by the role each path played in the identity, and NOT
        // lifted for contrast, because a mark that has been contrast-corrected
        // is no longer the mark.
        const mark = markColors(identity, palette, s.isDark)
        const markPairs: ColorPair[] = (
          [
            [`${tone} · logo primary path on ground`, mark.fill2],
            [`${tone} · logo secondary path on ground`, mark.fill],
            [`${tone} · logo stroke on ground`, mark.stroke],
          ] as const
        )
          .filter(([, color]) => color !== 'none')
          .map(([label, color]) => ({ label, fg: color, bg: s.bg, kind: 'ui' }))

        return [
          { label: `${tone} · body text on ground`, fg: s.text, bg: s.bg, kind: 'text' },
          { label: `${tone} · muted text on ground`, fg: s.muted, bg: s.bg, kind: 'large-text' },
          { label: `${tone} · accent as text on ground`, fg: s.accent, bg: s.bg, kind: 'text' },
          { label: `${tone} · text on filled accent`, fg: s.onAccentFill, bg: s.accentFill, kind: 'text' },
          { label: `${tone} · card text on card`, fg: s.cardText, bg: s.card, kind: 'text' },
          { label: `${tone} · card muted on card`, fg: s.cardMuted, bg: s.card, kind: 'large-text' },
          ...markPairs,
        ] satisfies ColorPair[]
      })
    },
  }))

const quizTemplates = (): RegisteredTemplate[] =>
  QUIZ_TEMPLATES.map((spec) => ({
    id: `quiz:${spec.id}`,
    family: 'quiz' as const,
    label: `${spec.code} ${spec.name}${spec.dark ? ' (dark ground)' : ''}`,
    // Every pair below is a colour `forms/progress.tsx` or `forms/answers.tsx`
    // actually writes into a style attribute, on the ground it writes it onto.
    // `auditQuizTemplateColors` in the builder still audits `brand.colors.primary`
    // raw, which no renderer has drawn since the twenty templates replaced the
    // six - modelling that here would report on a pairing that never reaches a
    // screen, and a warning an operator cannot act on is worse than silence.
    pairs: (brand) => {
      const t = quizTheme(spec, brand)
      const s = t.surface
      return [
        { label: 'page · body text', fg: t.page.text, bg: t.page.bg, kind: 'text' },
        { label: 'page · muted text', fg: t.page.muted, bg: t.page.bg, kind: 'large-text' },
        { label: 'card · question text', fg: s.text, bg: s.bg, kind: 'text' },
        { label: 'card · muted text', fg: s.muted, bg: s.bg, kind: 'large-text' },
        { label: 'card · accent as text', fg: s.accent, bg: s.bg, kind: 'text' },
        { label: 'card · filled progress segment', fg: s.accentFill, bg: s.bg, kind: 'ui' },
        { label: 'card · text on filled accent', fg: s.onAccentFill, bg: s.accentFill, kind: 'text' },
        { label: 'answer row · label on row', fg: s.cardText, bg: s.card, kind: 'text' },
        { label: 'answer row · meta on row', fg: s.cardMuted, bg: s.card, kind: 'large-text' },
        { label: 'answer row · accent as text on row', fg: s.accent, bg: s.card, kind: 'text' },
      ] satisfies ColorPair[]
    },
  }))

/**
 * The ported templates name their colours by luminance and are recoloured by
 * remapping that ladder onto the brand's own range, so their contrast is the
 * reference's contrast - as long as the range has not collapsed. That collapse
 * is what is audited here, at the two ends: a brand whose ink and page are the
 * same value flattens the whole ladder to one colour and every rung pairing in
 * the template goes with it.
 *
 * The mid rungs carry no declared role, so pairing two of them would report on
 * something the markup may never place together. `--lp-accent` is absent for a
 * blunter reason: no ported template's markup reads it. That is reported by the
 * registry-integrity check below rather than as a contrast violation, because
 * a colour nothing draws cannot collide with anything.
 */
const ladderRungs = (vars: Record<string, string>): string[] =>
  Object.keys(vars)
    .filter((k) => k.startsWith('--lp-n'))
    .sort((a, b) => Number(a.slice('--lp-n'.length)) - Number(b.slice('--lp-n'.length)))

const portedTemplates = (): RegisteredTemplate[] =>
  PORTED_TEMPLATES.map((template) => ({
    id: `lp-ported:${template.slug}`,
    family: 'lp-ported' as const,
    label: `${template.code} ${template.name}`,
    pairs: (brand) => {
      const palette = resolveLpPalette(LP_IDENTITIES[0], brand)
      const vars = templateVars(template, palette)
      const rungs = ladderRungs(vars)
      if (rungs.length < 2) return []
      return [
        {
          label: 'ladder · darkest rung on lightest rung',
          fg: vars[rungs[0]],
          bg: vars[rungs[rungs.length - 1]],
          kind: 'text',
        },
      ] satisfies ColorPair[]
    },
  }))

/**
 * Variables a template's renderer produces that its markup never reads.
 *
 * Brand-independent, so it runs once rather than per fixture. It is here
 * because the alternative was quietly dropping a pairing from the sweep and
 * leaving no trace of why: a dead variable is not a contrast bug, but a brand
 * colour that reaches the stylesheet and stops there is a brand that does not
 * appear on its own page, which is the failure the colour system exists to
 * prevent wearing different clothes.
 */
const deadTemplateVars = (): string[] => {
  // A palette is needed to produce the variable names; any brand gives the same
  // key set, so the first identity's own fallback is used and no fixture is
  // implicated in the result.
  const palette = resolveLpPalette(LP_IDENTITIES[0], null)
  return PORTED_TEMPLATES.flatMap((template) =>
    Object.keys(templateVars(template, palette))
      .filter((name) => !template.html.includes(name))
      .map((name) => `lp-ported:${template.slug} sets ${name}, and its markup never reads it`),
  )
}

/**
 * Everything registered, in one list.
 *
 * Built by a function rather than a module constant so an empty registry is a
 * state this code can actually reach and be tested in, instead of a state it
 * merely claims to handle.
 */
const buildRegistry = (): RegisteredTemplate[] => [
  ...lpIdentityTemplates(),
  ...quizTemplates(),
  ...portedTemplates(),
]

/**
 * What this sweep does NOT cover, printed on every run.
 *
 * An uncovered surface that goes unmentioned reads as a covered one, and the
 * whole point of the exit code is that people stop looking at screens.
 */
const NOT_COVERED = [
  'src/components/blocks/BlockRenderer.tsx and bespoke-css.ts — site page blocks, whose pairs are not yet declared as data',
  'ported-template mid-rungs — audited only at the two ends of the luminance ladder',
  'hairlines and dividers — held to perceptibility by design, not to the 3:1 auditColorPairs would demand',
  'anything a section override sets by hand via applySectionColors — an operator choice the builder warns about live',
]

// ---------------------------------------------------------------------------
// Fixture-level assertions
// ---------------------------------------------------------------------------

type Assertion = { fixture: string; check: string; detail: string }

const isAchromatic = (hex: string): boolean => {
  const rgb = parseHex(hex)
  return rgb != null && rgb.r === rgb.g && rgb.g === rgb.b
}

/**
 * Assertions about the RESOLVER, not about appearance.
 *
 * These fail the gate even though the fixtures are hostile, because they are
 * statements about how the system must behave when handed a hostile brand
 * rather than statements about the brand.
 */
const assertFixture = (f: BrandFixture, registry: RegisteredTemplate[]): Assertion[] => {
  const out: Assertion[] = []

  // 1. Refusal. A brand missing a required token must throw rather than be
  //    quietly substituted, and one that has everything must not throw.
  let thrown: MissingBrandTokenError | null = null
  let threwSomethingElse: unknown = null
  try {
    resolveBrandTokens(f.authored)
  } catch (err) {
    if (err instanceof MissingBrandTokenError) thrown = err
    else threwSomethingElse = err
  }
  if (threwSomethingElse) {
    out.push({
      fixture: f.id,
      check: 'resolveBrandTokens',
      detail: `threw ${String(threwSomethingElse)} instead of MissingBrandTokenError or a palette`,
    })
  } else if (f.resolves === 'throws' && !thrown) {
    out.push({
      fixture: f.id,
      check: 'resolveBrandTokens must throw',
      detail: 'returned a palette for a brand that cannot publish — grey here hides an unpublishable brand behind an unfinished-looking one',
    })
  } else if (f.resolves === 'ok' && thrown) {
    out.push({
      fixture: f.id,
      check: 'resolveBrandTokens must resolve',
      detail: `threw MissingBrandTokenError for [${thrown.missing.join(', ')}] on a fully authored brand`,
    })
  } else if (thrown && f.missing) {
    const got = [...thrown.missing].sort().join(',')
    const want = [...f.missing].sort().join(',')
    if (got !== want) {
      out.push({
        fixture: f.id,
        check: 'MissingBrandTokenError names the right tokens',
        detail: `reported [${thrown.missing.join(', ')}], expected [${f.missing.join(', ')}]`,
      })
    }
  }

  // 2. Brandless. No hue anywhere it could be mistaken for a choice, and said
  //    out loud rather than inferred from a grey that looks like a decision.
  if (f.brandless) {
    if (!f.brand.incomplete) {
      out.push({ fixture: f.id, check: 'reported as brandless', detail: 'brand.incomplete is false for a brand with nothing authored' })
    }
    if (f.brand.missingTokens.length === 0) {
      out.push({ fixture: f.id, check: 'reported as brandless', detail: 'brand.missingTokens is empty for a brand with nothing authored' })
    }
    for (const key of IDENTITY_COLOR_KEYS) {
      const value = f.brand.colors[key]
      if (!isAchromatic(value)) {
        out.push({ fixture: f.id, check: 'true neutral', detail: `colors.${key} = ${value} carries hue; a brandless page must not borrow one` })
      }
    }
    // ...and the same through every template, since the identity fallbacks are
    // exactly where a hue gets borrowed without anyone choosing it.
    for (const t of registry) {
      for (const p of t.pairs(f.brand)) {
        for (const [role, value] of [['fg', p.fg], ['bg', p.bg]] as const) {
          if (!isAchromatic(value)) {
            out.push({
              fixture: f.id,
              check: 'true neutral',
              detail: `${t.id} · ${p.label} · ${role} = ${value} carries hue`,
            })
          }
        }
      }
    }
  }

  // 3. Nothing unparseable reaches the CSS. An optional the resolver could not
  //    read has to become a derivation; `NaNpx` in a stylesheet is the shape
  //    that failure takes when it does not.
  if (f.resolves === 'ok') {
    for (const [name, value] of Object.entries(resolveBrandTokens(f.authored).vars)) {
      if (/NaN|undefined|null/.test(value)) {
        out.push({ fixture: f.id, check: 'no unparseable value reaches CSS', detail: `${name}: ${value}` })
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

type Finding = ColorViolation & { template: string; templateLabel: string; family: Family; fixture: string }

const argOf = (name: string): string | null => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return null
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : ''
}

const onlyArg = argOf('only')
const fixtureArg = argOf('fixture')
const asJson = argOf('json') !== null
/** Rollups without the per-violation listing. The listing is the record; this is the headline. */
const summaryOnly = argOf('summary') !== null

const registry = buildRegistry().filter((t) => (onlyArg ? t.id.includes(onlyArg) || t.family === onlyArg : true))
const fixtures = BRAND_FIXTURES.filter((f) => (fixtureArg ? f.id === fixtureArg : true))

const breaches = importBoundaryBreaches()
// Only meaningful over the whole registry; a filtered run says nothing about
// what a template it did not build sets.
const deadVars = onlyArg ? [] : deadTemplateVars()

if (fixtureArg && fixtures.length === 0) {
  console.error(`No fixture named "${fixtureArg}". Known: ${BRAND_FIXTURES.map((f) => f.id).join(', ')}`)
  process.exit(2)
}

const findings: Finding[] = []
for (const template of registry) {
  for (const f of fixtures) {
    for (const v of auditColorPairs(template.pairs(f.brand))) {
      findings.push({ ...v, template: template.id, templateLabel: template.label, family: template.family, fixture: f.id })
    }
  }
}

const assertions = fixtures.flatMap((f) => assertFixture(f, registry))

// --- report ----------------------------------------------------------------

if (asJson) {
  console.log(
    JSON.stringify(
      {
        templates: registry.length,
        fixtures: fixtures.map((f) => f.id),
        importBoundaryBreaches: breaches,
        deadTemplateVars: deadVars,
        assertions,
        findings,
        notCovered: NOT_COVERED,
      },
      null,
      2,
    ),
  )
} else {
  const rule = '─'.repeat(78)
  console.log(rule)
  console.log(`TEMPLATE COLOUR SWEEP — ${registry.length} template(s) × ${fixtures.length} fixture(s)`)
  console.log(rule)

  if (registry.length === 0) {
    console.log('')
    console.log('  REGISTRY IS EMPTY — 0 templates were rendered.')
    console.log('  Nothing was checked, so nothing passed. This is not a success.')
    if (onlyArg) console.log(`  (--only=${onlyArg} matched no registered template.)`)
  }

  if (breaches.length > 0) {
    console.log('')
    console.log('IMPORT BOUNDARY BREACHED — brand-fixtures.ts is a verification asset:')
    for (const b of breaches) console.log(`  ${b}`)
  }

  if (deadVars.length > 0) {
    console.log('')
    console.log(`BRAND COLOURS THAT REACH THE STYLESHEET AND STOP (${deadVars.length})`)
    for (const d of deadVars) console.log(`  ${d}`)
  }

  if (assertions.length > 0) {
    console.log('')
    console.log(`FIXTURE ASSERTIONS FAILED (${assertions.length})`)
    for (const a of assertions) console.log(`  ${a.fixture} · ${a.check}\n      ${a.detail}`)
  }

  if (registry.length > 0) {
    console.log('')
    console.log(`TEMPLATE VIOLATIONS (${findings.length})`)
    if (findings.length === 0) {
      console.log('  none — every audited pairing clears its WCAG floor for all fixtures.')
    }
    let currentTemplate = ''
    let currentFixture = ''
    for (const v of summaryOnly ? [] : findings) {
      if (v.template !== currentTemplate) {
        console.log('')
        console.log(`  ${v.template}  —  ${v.templateLabel}`)
        currentTemplate = v.template
        currentFixture = ''
      }
      if (v.fixture !== currentFixture) {
        console.log(`    fixture: ${v.fixture}`)
        currentFixture = v.fixture
      }
      const sev = v.severity === 'error' ? 'ERROR  ' : 'warning'
      console.log(
        `      ${sev} ${v.label}\n              ${v.fg} on ${v.bg} = ${(v.ratio ?? 0).toFixed(2)}:1 (needs ${v.required}:1)`,
      )
    }

    // Two rollups, because "which template" and "which brand shape" are
    // different questions and the fix for each lives in a different file.
    const tally = (key: (v: Finding) => string): Array<[string, number]> => {
      const m = new Map<string, number>()
      for (const v of findings) m.set(key(v), (m.get(key(v)) ?? 0) + 1)
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    if (findings.length > 0) {
      // Four rollups, because "which brand shape", "which template" and "which
      // pairing" are different questions whose answers live in different files.
      // BY PAIR is the one that names a code path: a hundred violations sharing
      // a label are one bug seen a hundred times, not a hundred bugs.
      console.log('')
      console.log('  BY PAIR')
      for (const [k, n] of tally((v) => v.label)) console.log(`    ${String(n).padStart(4)}  ${k}`)
      console.log('  BY FIXTURE')
      for (const [k, n] of tally((v) => v.fixture)) console.log(`    ${String(n).padStart(4)}  ${k}`)
      console.log('  BY TEMPLATE FAMILY')
      for (const [k, n] of tally((v) => v.family)) console.log(`    ${String(n).padStart(4)}  ${k}`)
      console.log('  BY TEMPLATE')
      for (const [k, n] of tally((v) => v.template)) console.log(`    ${String(n).padStart(4)}  ${k}`)
    }
  }

  console.log('')
  console.log('NOT COVERED BY THIS SWEEP')
  for (const n of NOT_COVERED) console.log(`  · ${n}`)

  console.log('')
  console.log(rule)
  if (registry.length === 0) console.log('RESULT: empty registry — nothing checked (exit 2)')
  else if (breaches.length > 0 || assertions.length > 0 || findings.length > 0 || deadVars.length > 0)
    console.log(
      `RESULT: ${findings.length} template violation(s), ${assertions.length} fixture assertion failure(s), ` +
        `${deadVars.length} dead brand variable(s), ${breaches.length} import breach(es) (exit 1)`,
    )
  else console.log(`RESULT: clean across ${registry.length} template(s) × ${fixtures.length} fixture(s) (exit 0)`)
  console.log(rule)
}

// An empty registry is its own outcome and must never look like success.
if (registry.length === 0) process.exit(2)
process.exit(breaches.length > 0 || assertions.length > 0 || findings.length > 0 || deadVars.length > 0 ? 1 : 0)
