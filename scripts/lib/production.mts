/**
 * Shared pieces of every harness that acts on PRODUCTION.
 *
 * Two rules live here because a harness that breaks them has already hurt this
 * product once: a previous acceptance run clicked "the first Publish button" on
 * a list that mixed Brands, and an assertion of `t(true, ...)` reported a pass
 * for a step nothing had checked.
 *
 *  1. NO ASSERTION WITHOUT EVIDENCE. `t()` takes a boolean, a label AND the
 *     evidence that produced it (a value read off the page, a status code, a
 *     row id). A literal `true`, a truthy string and an empty evidence string
 *     are all refused. `scripts/test-harness-hygiene.mts` fails the suite if any
 *     production harness source contains a hard-coded acceptance.
 *
 *  2. NO SIDE EFFECT WITHOUT NAMING THE RECORD. Anything that changes production
 *     goes through `actOn()`, which requires the target to be exactly one element
 *     and its own text to contain the identifiers of the record the run intends
 *     to change (Brand name, path, id). An unresolved or ambiguous target throws
 *     before the click, not after.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from 'playwright'

export const APP = 'https://app.pageflo.io'
export const CREDENTIALS_FILE = '/home/legenex/.pageflo-admin-credentials'

/** The one Brand production acceptance is allowed to change. */
export const ACCEPTANCE = {
  slug: 'pageflo-rescue-acceptance-944138',
  name: 'PageFlo Rescue Acceptance 944138',
  preview: 'https://pageflo-rescue-acceptance-944138.preview.pageflo.io',
  legacyPreview: 'https://pageflo-rescue-acceptance-944138.preview.legenex.com',
} as const

/** Brands a run must NEVER act on. A guard, not a list of what is allowed. */
export const PROTECTED_BRAND_MARKERS = ['Dont Settle', "Don't Settle", 'dont-settle', 'Accident Compensation Helper'] as const

export const readCredentials = (): { email: string; password: string } => {
  const text = readFileSync(CREDENTIALS_FILE, 'utf8')
  const fields: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  const email = fields['admin email']
  const password = fields['temporary password']
  if (!email || !password) throw new Error('credentials file is missing the admin email or password')
  return { email, password }
}

export class TargetError extends Error {}

export class Harness {
  pass = 0
  fail = 0
  readonly failures: string[] = []
  readonly evidence: Array<{ label: string; ok: boolean; evidence: string }> = []

  constructor(readonly evidenceDir: string) {
    mkdirSync(evidenceDir, { recursive: true })
  }

  /**
   * Record one assertion. `cond` must be a real boolean, and `evidence` must say
   * what was observed. Both are enforced at run time, not by convention.
   */
  t(cond: boolean, label: string, evidence: string): boolean {
    if (typeof cond !== 'boolean') throw new Error(`assertion "${label}" was given a ${typeof cond}, not a boolean`)
    if (typeof evidence !== 'string' || !evidence.trim()) throw new Error(`assertion "${label}" has no evidence`)
    this.evidence.push({ label, ok: cond, evidence })
    if (cond) {
      this.pass++
      console.log(`  PASS ${label}  [${evidence}]`)
    } else {
      this.fail++
      this.failures.push(`${label} [${evidence}]`)
      console.log(`  FAIL ${label}  [${evidence}]`)
    }
    return cond
  }

  async shot(page: Page, name: string): Promise<void> {
    await page.screenshot({ path: path.join(this.evidenceDir, `${name}.png`), fullPage: true }).catch(() => null)
  }
}

/** Exactly one element, or a TargetError. Never "the first of several". */
export const only = async (loc: Locator, what: string): Promise<Locator> => {
  const n = await loc.count()
  if (n !== 1) throw new TargetError(`${what}: expected exactly one match, found ${n}`)
  return loc
}

/**
 * Resolve a control inside the record it belongs to, proving first that the
 * record is the intended one. Returns the control; the caller clicks it.
 *
 * `record`   the row / card / dialog that owns the control (one element)
 * `must`     substrings the record's own text must contain (Brand name, path, id)
 * `control`  the button inside it (exactly one)
 */
export const actOn = async (record: Locator, must: string[], control: (r: Locator) => Locator, what: string): Promise<Locator> => {
  await only(record, `${what}: the record`)
  const text = await record.innerText()
  const missing = must.filter((m) => !text.includes(m))
  if (missing.length) throw new TargetError(`${what}: the record does not contain ${JSON.stringify(missing)}; refusing to act. Text was: ${text.replace(/\s+/g, ' ').slice(0, 240)}`)
  const hit = PROTECTED_BRAND_MARKERS.find((p) => text.includes(p))
  if (hit) throw new TargetError(`${what}: the record mentions protected Brand "${hit}"; refusing to act`)
  return only(control(record), `${what}: the control`)
}

export const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

export const login = async (page: Page): Promise<void> => {
  const { email, password } = readCredentials()
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/admin/, { timeout: 30_000 })
}

export const fetchText = async (url: string): Promise<{ status: number; body: string }> => {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  return { status: res.status, body: await res.text() }
}

/** Authoring residue that must never reach a visitor. */
export const AUTHORING_JUNK = [
  '{{site.name}}',
  '(800) 000-0000',
  'Dynamic figure',
  'This deployment',
  'Injury Type12121212',
  '/submitted (Qualified)',
  '/thanks (DQ)',
] as const

export const junkIn = (body: string): string[] => AUTHORING_JUNK.filter((n) => body.includes(n))
