/**
 * The rebrand contract, pinned in the source.
 *
 *   pnpm test:rebrand           # no database, no network
 *
 * The LegalOS to PageFlo rename is not a find-and-replace. Some identifiers are
 * load-bearing production infrastructure and MUST NOT change; some are
 * user-facing and MUST. The difference is not visible from a diff, so it is
 * asserted here.
 *
 * FOUR THINGS ARE CHECKED, and each catches a failure the others cannot:
 *
 *   A. One reader for the environment. Every LEGALOS_* variable is still
 *      accepted, but ONLY through `src/lib/pageflo/env.ts`. A second call site
 *      reading `process.env.LEGALOS_*` directly is a split brain: after an
 *      operator sets the PAGEFLO_* name in production, half the code reads the
 *      new value and half reads the old one, and nothing errors.
 *
 *   B. Nothing user-facing says LegalOS. Component and page source is scanned
 *      for the literal outside comments. This is what the rename is FOR.
 *
 *   C. The reserved hosts are never tenants. `pageflo.io` and `app.pageflo.io`
 *      classify as marketing and app whatever the Domains table holds, and an
 *      ordinary customer host still classifies as a tenant. Getting this wrong
 *      in either direction takes a real site offline.
 *
 *   D. The compatibility identifiers are still present. The database name, the
 *      systemd unit, the Plesk bare repository and the preview domain are
 *      deliberately NOT renamed, and this asserts the documentation still says
 *      so, so a future sweep cannot quietly "finish the job" and break a
 *      release.
 */
import 'dotenv/config'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ACCEPTED_LEGACY_ENV_NAMES } from '../src/lib/pageflo/env.ts'
import { classifyHost, normalizeHost } from '../src/lib/pageflo/hosts.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mts|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

/** Strip block and line comments so a check tests code, not prose about code. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/* -------------------------------------------------------------------------- */
/*  A. One reader for the environment                                          */
/* -------------------------------------------------------------------------- */

const ENV_MODULE = 'src/lib/pageflo/env.ts'
const srcFiles = walk(path.join(ROOT, 'src'))

t(ACCEPTED_LEGACY_ENV_NAMES.length > 0, 'the env module still accepts legacy LEGALOS_* names')

const strayEnvReads: string[] = []
for (const file of srcFiles) {
  const rel = path.relative(ROOT, file)
  if (rel === ENV_MODULE) continue
  const code = stripComments(readFileSync(file, 'utf8'))
  const matches = code.match(/process\.env\.LEGALOS_[A-Z0-9_]+/g)
  if (matches) strayEnvReads.push(`${rel}: ${[...new Set(matches)].join(', ')}`)
}
t(
  strayEnvReads.length === 0,
  `no LEGALOS_* variable is read outside ${ENV_MODULE}` +
    (strayEnvReads.length ? `\n           ${strayEnvReads.join('\n           ')}` : ''),
)

// The same rule for the one non-prefixed legacy name.
const strayServerUrl: string[] = []
for (const file of srcFiles) {
  const rel = path.relative(ROOT, file)
  if (rel === ENV_MODULE) continue
  const code = stripComments(readFileSync(file, 'utf8'))
  if (code.includes('process.env.NEXT_PUBLIC_SERVER_URL')) strayServerUrl.push(rel)
}
t(
  strayServerUrl.length === 0,
  `NEXT_PUBLIC_SERVER_URL is read only through the env module` +
    (strayServerUrl.length ? ` (found in ${strayServerUrl.join(', ')})` : ''),
)

/* -------------------------------------------------------------------------- */
/*  B. Nothing user-facing says LegalOS                                        */
/* -------------------------------------------------------------------------- */

/**
 * Compatibility TOKENS, not exempt files.
 *
 * Exempting a whole file would let a genuine "Sign in to LegalOS" hide inside a
 * file that legitimately reads one compatibility header. Each entry below is a
 * specific wire identifier that something outside this deploy already depends
 * on, with the consumer named. Removing one is a breaking change to that
 * consumer, not a rename.
 */
const COMPAT_TOKENS: Array<{ token: string; why: string }> = [
  { token: 'x-legalos-host', why: 'stamped by middleware; read by the public page routes' },
  { token: 'x-legalos-preview', why: 'preview headers stamped by middleware' },
  { token: 'X-LegalOS-Event', why: 'outbound webhook header third-party receivers switch on' },
  { token: 'X-LegalOS-Signature', why: 'outbound webhook HMAC header receivers verify' },
  { token: 'legalos-builder-canvas', why: 'CSS class on saved page HTML written before the rename' },
  { token: 'legalos:quiz-height', why: 'postMessage protocol used by q.js copies already embedded' },
  { token: 'data-legalos-booted', why: 'guard attribute in cached copies of q.js' },
  { token: '_legalos.', why: 'the DNS TXT record name tenants have already published' },
  { token: '/api/legalos/', why: 'the compatibility route namespace and its shims' },
  { token: "app: 'legalos'", why: 'the health/self-check marker the SSL poller matches on' },
  { token: "APP_MARKER = 'legalos'", why: 'the constant that marker is compared against' },
  { token: 'LEGALOS_', why: 'legacy environment variable names, accepted by the env module' },
  { token: '# LegalOS tenant', why: 'marker comment already present in generated vhost config' },
]

/** Remove every known compatibility token, then look for what is left. */
const withoutCompatTokens = (code: string): string => {
  let out = code
  for (const { token } of COMPAT_TOKENS) out = out.split(token).join('')
  return out
}

const userFacingRoots = ['src/app', 'src/components']
const brandLeaks: string[] = []
for (const root of userFacingRoots) {
  for (const file of walk(path.join(ROOT, root))) {
    const rel = path.relative(ROOT, file)
    const code = withoutCompatTokens(stripComments(readFileSync(file, 'utf8')))
    if (/legalos/i.test(code)) brandLeaks.push(rel)
  }
}
t(
  brandLeaks.length === 0,
  'no user-facing component or route mentions LegalOS outside a compatibility identifier' +
    (brandLeaks.length ? `\n           ${brandLeaks.join('\n           ')}` : ''),
)

// Every compatibility token must still be REACHABLE, or it has been renamed by
// accident and something outside this deploy is now broken.
const allSrc = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
for (const { token, why } of COMPAT_TOKENS) {
  t(allSrc.includes(token), `compatibility identifier "${token}" is still present (${why})`)
}

// The product identity is a value the app holds, not a literal repeated around.
const product = read('src/lib/pageflo/product.ts')
t(/PRODUCT_NAME = 'PageFlo'/.test(product), 'PRODUCT_NAME is PageFlo')
t(
  !/legal/i.test(read('src/lib/pageflo/product.ts').replace(/legal-vertical|legal-specific|legal tool|Legal-specific/gi, '')),
  'the product positioning is vertical agnostic',
)

/* -------------------------------------------------------------------------- */
/*  C. Reserved hosts are never tenants                                        */
/* -------------------------------------------------------------------------- */

// Set explicitly rather than read from .env: this asserts the CLASSIFIER, and a
// test that passes only because the local .env happens to be configured proves
// nothing about the code.
process.env.PAGEFLO_MARKETING_HOST = 'pageflo.io'
process.env.PAGEFLO_APP_HOST = 'app.pageflo.io'
process.env.PAGEFLO_LEGACY_APP_HOSTS = 'os.legenex.com'

t(classifyHost('pageflo.io') === 'marketing', 'pageflo.io is the marketing host')
t(classifyHost('www.pageflo.io') === 'marketing', 'www.pageflo.io is the marketing host')
t(classifyHost('PageFlo.IO') === 'marketing', 'host classification is case insensitive')
t(classifyHost('pageflo.io:443') === 'marketing', 'a port does not change classification')
t(classifyHost('app.pageflo.io') === 'app', 'app.pageflo.io is the application host')
t(classifyHost('os.legenex.com') === 'legacy-app', 'os.legenex.com is a legacy application host')
t(classifyHost('claim.example.com') === 'tenant', 'an ordinary customer host is a tenant')
t(classifyHost('notpageflo.io') === 'tenant', 'a host that merely ENDS the same is a tenant')
t(classifyHost('pageflo.io.evil.com') === 'tenant', 'a host that merely BEGINS the same is a tenant')
t(classifyHost('') === 'tenant', 'an empty host is not reserved')
t(normalizeHost('  HTTPS://Pageflo.IO/  ') === 'pageflo.io', 'normalizeHost strips scheme, case and slash')

/* -------------------------------------------------------------------------- */
/*  D. Compatibility identifiers are still documented                          */
/* -------------------------------------------------------------------------- */

/**
 * Renaming any of these breaks production, and the break is not visible until a
 * release fails. The assertion is on the DOCUMENTATION, because that is what a
 * future agent reads before deciding to "finish" the rename.
 */
const COMPAT_IDENTIFIERS = [
  'legalos-dev', // the systemd unit
  'legalos.git', // the Plesk bare repository
  'os.legenex.com', // the Plesk domain and application directory
  'molegenexcom', // the Docker compose project the database runs under
  'preview.legenex.com', // every issued preview host and certificate
]
const infra = read('docs/INFRASTRUCTURE.md')
for (const id of COMPAT_IDENTIFIERS) {
  t(infra.includes(id), `docs/INFRASTRUCTURE.md still records the compatibility identifier ${id}`)
}
t(
  /compatibility identifier/i.test(infra),
  'docs/INFRASTRUCTURE.md has a compatibility-identifier section explaining why they stay',
)

// The database name is a compatibility identifier too, and the example env says so.
const envExample = read('.env.example')
t(
  envExample.includes('postgres://legalos:legalos@localhost:5432/legalos'),
  '.env.example still shows the legacy database name, role and password',
)
t(
  /not renamed|NOT renamed/i.test(envExample),
  '.env.example explains that the legacy database identifiers are deliberate',
)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
process.exit(0)
