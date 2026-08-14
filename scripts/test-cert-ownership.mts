/**
 * Provisioning must not be able to take a working host off its certificate.
 *
 *   pnpm test:certs
 *
 * The defect this pins: `provisionDomainInPlesk` decided what to write by
 * probing Plesk's Let's Encrypt store and then wrote `ssl_certificate` lines
 * pointing back into it. Nothing renews that store for these hosts. So a
 * routine recheck of getwhatyoureowed.co would have rewritten its vhost from
 * the acme.sh certificate (valid to Nov 12, renewing) onto the orphaned Plesk
 * one (Sep 12, renewed by nobody) — and `nginx -t` passes either way, so it
 * would have failed silently.
 *
 * A preview host was worse: it has no Plesk certificate, so the probe said
 * "never provisioned", and provisioning would have written a per-host,
 * :80-ONLY vhost whose exact `server_name` outranks `*.preview.legenex.com` —
 * removing HTTPS from a host that had it.
 *
 * These run against the REAL fact-shape of production's four acme.sh-managed
 * hosts. No filesystem, no network, no server: `planProvisioning` is pure, and
 * that is the point — the old code could only be checked by running a release.
 */
import { planProvisioning, type CertFacts, type ProvisionPlan } from '../src/lib/plesk/provision-domain.ts'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Production's install set, as it actually is on disk. */
const INSTALLS = ['crashclaim.co', 'getwhatyoureowed.co', 'preview.legenex.com', 'test.checkmyclaim.co']

/** Only one of production's four certificates is a wildcard. */
const WILDCARDS = ['preview.legenex.com']

const facts = (over: Partial<CertFacts> = {}): CertFacts => ({
  acmeInstalls: INSTALLS,
  wildcardBases: WILDCARDS,
  tenantVhostExists: false,
  tenantVhostCertPath: null,
  ...over,
})

/** Every plan must name a path under the acme root and never the Plesk store. */
const assertNeverPlesk = (label: string, plan: ProvisionPlan) => {
  const dir = 'certDir' in plan ? plan.certDir : ''
  ok(`${label}: cert path is acme-owned`, dir.startsWith('/etc/ssl/legalos/'), dir)
  ok(`${label}: cert path is not the Plesk store`, !dir.includes('/opt/psa/'), dir)
}

console.log('\n— hosts already managed by a per-host acme.sh certificate —')
for (const host of ['getwhatyoureowed.co', 'crashclaim.co', 'test.checkmyclaim.co']) {
  const plan = planProvisioning(host, facts({
    tenantVhostExists: true,
    tenantVhostCertPath: `/etc/ssl/legalos/${host}/fullchain.pem`,
  }))
  ok(`${host}: recheck is a no-op`, plan.action === 'already-managed', plan.action)
  assertNeverPlesk(host, plan)
}

console.log('\n— hosts served by the *.preview.legenex.com wildcard —')
for (const host of [
  'don-t-settle.preview.legenex.com',
  'auto-claim-eval.preview.legenex.com',
  'settlementassist-co.preview.legenex.com',
]) {
  const plan = planProvisioning(host, facts())
  ok(`${host}: recognised as wildcard-covered`, plan.action === 'covered-by-wildcard', plan.action)
  if (plan.action === 'covered-by-wildcard') {
    ok(`${host}: resolves to the wildcard base`, plan.wildcardBase === 'preview.legenex.com', plan.wildcardBase)
    ok(`${host}: uses the wildcard's certificate`, plan.certDir === '/etc/ssl/legalos/preview.legenex.com', plan.certDir)
  }
  // The regression in one line: this must never become a per-host write.
  ok(`${host}: no per-host vhost is planned (would override the wildcard)`,
    plan.action !== 'issue' && plan.action !== 'repair-vhost', plan.action)
  assertNeverPlesk(host, plan)
}

console.log('\n— the exact shape that used to cause the downgrade —')
{
  // certExists() probed the PLESK store. Model a host that has an orphaned
  // Plesk cert and an acme.sh one: the plan must ignore the Plesk store
  // entirely, because it is not represented in CertFacts at all.
  const plan = planProvisioning('getwhatyoureowed.co', facts({
    tenantVhostExists: true,
    tenantVhostCertPath: '/opt/psa/var/modules/letsencrypt/etc/live/getwhatyoureowed.co/fullchain.pem',
  }))
  ok('vhost pointing at the Plesk store is REPAIRED to acme', plan.action === 'repair-vhost', plan.action)
  assertNeverPlesk('repair', plan)
}

console.log('\n— a genuinely new tenant domain —')
{
  const plan = planProvisioning('newbrand.example.com', facts())
  ok('new host is issued', plan.action === 'issue', plan.action)
  ok('new host installs under the acme root',
    plan.action === 'issue' && plan.certDir === '/etc/ssl/legalos/newbrand.example.com', 'certDir')
  assertNeverPlesk('new host', plan)
}

console.log('\n— wildcard depth: one label only, as X.509 requires —')
{
  const deep = planProvisioning('a.b.preview.legenex.com', facts())
  ok('two labels below the base are NOT treated as covered', deep.action === 'issue', deep.action)
  const base = planProvisioning('preview.legenex.com', facts({
    tenantVhostExists: true,
    tenantVhostCertPath: '/etc/ssl/legalos/preview.legenex.com/fullchain.pem',
  }))
  ok('the wildcard base itself is already-managed', base.action === 'already-managed', base.action)
}

console.log('\n— a SINGLE-NAME certificate is not a wildcard base —')
{
  // The defect an adversarial pass found: every acme install directory was
  // treated as a wildcard base, so `www.getwhatyoureowed.co` resolved to the
  // `getwhatyoureowed.co` certificate — which has one SAN and does not cover
  // it. Provisioning then reported success having issued nothing, and the
  // domain sat in `provisioning` until the poller timed it out to `error`.
  for (const host of ['www.getwhatyoureowed.co', 'mail.crashclaim.co', 'a.test.checkmyclaim.co']) {
    const plan = planProvisioning(host, facts())
    ok(`${host}: NOT treated as wildcard-covered`, plan.action === 'issue', plan.action)
    ok(`${host}: gets its own certificate`,
      plan.action === 'issue' && plan.certDir === `/etc/ssl/legalos/${host}`, 'certDir')
  }
  // And the real wildcard still works.
  const covered = planProvisioning('x.preview.legenex.com', facts())
  ok('the genuine wildcard still covers its children', covered.action === 'covered-by-wildcard', covered.action)
}

console.log('\n— an empty install dir must not look like coverage —')
{
  const plan = planProvisioning('x.preview.legenex.com', facts({ acmeInstalls: [], wildcardBases: [] }))
  ok('no installs means no wildcard coverage', plan.action === 'issue', plan.action)
}

console.log('\n— a stray per-host vhost under a wildcard is reported, not written over —')
{
  const plan = planProvisioning('don-t-settle.preview.legenex.com', facts({
    tenantVhostExists: true,
    tenantVhostCertPath: '/etc/ssl/legalos/preview.legenex.com/fullchain.pem',
  }))
  ok('still a no-op', plan.action === 'covered-by-wildcard', plan.action)
  ok('the stray file is surfaced', plan.action === 'covered-by-wildcard' && plan.strayVhost === true)
}

/* -------------------------------------------------------------------------- */
/*                             Negative control                                */
/* -------------------------------------------------------------------------- */
/**
 * A test that cannot fail proves nothing. This models the OLD decision exactly
 * as it was — probe Plesk's store, and write a per-host vhost pointing into it
 * either way — and asserts that the checks above WOULD have caught it.
 *
 * Old shape, from the replaced code:
 *   certExists(host)  -> fs.access(`${LE_CERT_DIR}/${host}/fullchain.pem`)
 *   true  -> write renderTenantNginxConfig(host)   // ssl_certificate ${LE_CERT_DIR}/...
 *   false -> write renderAcmeBootstrapConfig(host) // :80 ONLY, no ssl_certificate
 */
const LEGACY_STORE = '/opt/psa/var/modules/letsencrypt/etc/live'
/** Typed against the real action union so the assertions below are meaningful. */
type LegacyPlan = { action: ProvisionPlan['action']; certDir: string; https: boolean }
const oldPlan = (host: string, pleskCertExists: boolean): LegacyPlan =>
  pleskCertExists
    ? { action: 'issue', certDir: `${LEGACY_STORE}/${host}`, https: true }
    : { action: 'issue', certDir: '', https: false }

console.log('\n— negative control: the old logic must fail these same checks —')
{
  // getwhatyoureowed.co HAS an orphaned Plesk cert, so the old code took the
  // "keep TLS up" branch and wrote the orphaned path.
  const legacy = oldPlan('getwhatyoureowed.co', true)
  ok('NEGATIVE CONTROL: old logic emitted a Plesk-store path (caught)',
    legacy.certDir.includes('/opt/psa/'), 'the control itself is broken if this fails')
  ok('NEGATIVE CONTROL: old logic was not a no-op on a managed host (caught)',
    legacy.action !== 'already-managed')

  // A preview host has NO Plesk cert, so the old code wrote a :80-only vhost,
  // stripping HTTPS from a host the wildcard was serving over TLS.
  const legacyPreview = oldPlan('don-t-settle.preview.legenex.com', false)
  ok('NEGATIVE CONTROL: old logic dropped the HTTPS block on a wildcard host (caught)',
    legacyPreview.https === false)
  ok('NEGATIVE CONTROL: old logic did not recognise wildcard coverage (caught)',
    legacyPreview.action !== 'covered-by-wildcard')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
