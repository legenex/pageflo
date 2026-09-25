/**
 * W40: one master under Check A Case and Don't Settle.
 *
 * Brand identity (name, colour, phone, legal, logo) must differ.
 * Master copy must not.
 *
 *   pnpm test:brand-reskin
 */
import { readFileSync } from 'node:fs'

import { resolveBrandLegal, siteToBrand } from '../src/lib/brand-map.ts'
import { refuseDeploymentCopyOverride } from '../src/lib/master-safety.ts'
import { SEED_SITES } from '../src/seed/sites.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const checkACase = SEED_SITES.find((s) => s.slug === 'check-a-case')
const dontSettle = SEED_SITES.find((s) => s.slug === 'dont-settle')
t(Boolean(checkACase), 'Check A Case is a seeded Brand')
t(Boolean(dontSettle), "Don't Settle is a seeded Brand")
t(checkACase!.brand.primary !== dontSettle!.brand.primary, 'the two Brands author different primary colours')
t(checkACase!.default_phone !== dontSettle!.default_phone, 'the two Brands author different phone numbers')

const asSite = (seed: (typeof SEED_SITES)[number], id: number) => ({
  id,
  slug: seed.slug,
  name: seed.name,
  status: 'active',
  default_phone: seed.default_phone,
  brand: {
    display_name: seed.name,
    logo_url: `https://cdn.example/${seed.slug}-logo.svg`,
    primary: seed.brand.primary,
    accent: seed.brand.accent,
    cta: seed.brand.accent,
    bg: seed.brand.surface,
    surface: seed.brand.surface,
    ink: seed.brand.ink,
  },
  legal: {
    default_disclaimer: `${seed.name} advertising disclaimer.`,
    copyright: `(c) ${seed.name}`,
    privacy_url: `https://${seed.primary_host}/privacy`,
    terms_url: `https://${seed.primary_host}/terms`,
  },
})

const cac = siteToBrand(asSite(checkACase!, 1), [
  { id: '1', host: 'checkacase.com', primary: true, status: 'active', sslStatus: 'active' },
])
const ds = siteToBrand(asSite(dontSettle!, 2), [
  { id: '2', host: 'dontsettle.co', primary: true, status: 'active', sslStatus: 'active' },
])

t(cac.displayName === 'Check A Case', 'Check A Case keeps its display name')
t(ds.displayName === "Don't Settle", "Don't Settle keeps its display name")
t(cac.colors.primary !== ds.colors.primary, 'resolved primary colours differ')
t(cac.contact.callNumber !== ds.contact.callNumber, 'resolved phone numbers differ')
t(cac.legal.defaultDisclaimer !== ds.legal.defaultDisclaimer, 'resolved disclaimers differ')
t(cac.logoUrl !== ds.logoUrl, 'logos differ')
t(cac.legal.privacyUrl !== ds.legal.privacyUrl, 'privacy URLs differ')

const refused = refuseDeploymentCopyOverride()
t(refused.ok === false, 'deployment copy writes are refused')

const lpResolver = readFileSync(new URL('../src/lib/lp-deployment.ts', import.meta.url), 'utf8')
t(
  /composedOverrides:\s*templateSlotOverrides/.test(lpResolver),
  'public LP render uses master slot copy only',
)
t(
  !lpResolver.includes('...normalizeOverrides(doc.content_overrides)'),
  'public LP render does not layer deployment content_overrides onto the master',
)

const lpSave = readFileSync(new URL('../src/app/(app)/admin/(top)/landing-pages/actions.ts', import.meta.url), 'utf8')
t(lpSave.includes('refuseDeploymentCopyOverride'), 'LP deployment save refuses incoming copy overrides')
t(!/content_overrides:\s*overrides/.test(lpSave), 'LP deployment save does not write a copy bag onto the row')

const preview = readFileSync(new URL('../src/components/builder/lp/LandingPagesApp.tsx', import.meta.url), 'utf8')
t(
  !preview.includes('deployment?.contentOverrides'),
  'LP builder preview does not merge deployment copy over the master',
)

const year = String(new Date().getFullYear())
const legalTokens = resolveBrandLegal({
  name: 'Acme',
  legal: { copyright: '(c) {year} {brand}', tcpa_text: 'By submitting you agree {{brand.displayName}} may contact you.' },
})
t(legalTokens.copyright === `(c) ${year} Acme`, 'single-brace {year} and {brand} resolve in copyright')
t(
  legalTokens.tcpaText.includes('Acme') && !legalTokens.tcpaText.includes('{{'),
  'double-brace {{brand.displayName}} resolves in TCPA',
)

const quizTheme = readFileSync(new URL('../src/lib/quiz-theme.ts', import.meta.url), 'utf8')
t(quizTheme.includes('Colour has one owner'), 'quiz theme documents that colour is brand-owned, not deployment-authored')

const advRuntime = readFileSync(new URL('../src/components/public/advertorial/AdvertorialRuntime.tsx', import.meta.url), 'utf8')
t(advRuntime.includes('brand.colors') || advRuntime.includes('b.colors'), 'advertorial chrome takes colour from the Brand')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
