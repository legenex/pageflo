/**
 * Assertions for the authorization seam and the domain-eligibility contract.
 *
 * The repo has no test runner, so this follows `test-brand-extract.ts`: import
 * the pure modules, assert against synthetic records, exit non-zero on failure.
 *
 *   node --experimental-strip-types scripts/test-authz.ts
 *
 * Every case below is an attack that worked against the code as committed at
 * 2583b30, written as the attacker would run it rather than as the fix would
 * describe itself. Four are worth naming, because a passing assertion here is
 * the only thing standing between them and production:
 *
 *   · setPrimary accepted the victim's siteId and demoted their primaries.
 *   · recheckDomainDns launched the SSL poller before its access-checked write.
 *   · attachDomainToSite wrote a caller-supplied site onto a pool row, which
 *     `overrideAccess: false` does not examine because the row had no site yet.
 *   · deletePoolDomain tore down the Plesk vhost before the scoped delete.
 *
 * The Payload here is a stub. That is the point: these helpers must decide with
 * the record in front of them, so anything that needs a live database to reach a
 * verdict has already failed the design.
 */
import {
  relationId,
  requireSiteAdmin,
  requireDomainSiteAdmin,
  requirePoolDomain,
  requireDeploymentSiteAdmin,
} from '../src/lib/authz.ts'
import {
  domainEligibility,
  isDomainServable,
  isDomainSelectable,
  mayBecomePrimary,
  domainOptionLabel,
  PREVIEW_REQUIRES_SSL,
} from '../src/lib/domain-eligibility.ts'
import { siteScopedRead, siteScopedWrite, siteScopedAdmin } from '../src/access/index.ts'
import type { AuthedUser } from '../src/lib/auth.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

// --- actors -----------------------------------------------------------------

/** Bound to site 1 only. The attacker in every cross-tenant case below. */
const alice: AuthedUser = { id: 10, email: 'a@x.com', siteBindings: [{ site: 1, role: 'admin' }] }
/** Bound to site 2. The victim. */
const bob: AuthedUser = { id: 11, email: 'b@x.com', siteBindings: [{ site: 2, role: 'admin' }] }
const root: AuthedUser = { id: 1, email: 'r@x.com', super_admin: true, siteBindings: [] }
/** A populated relationship, which is how Payload returns a depth>0 read. */
const alicePopulated: AuthedUser = {
  id: 12,
  email: 'c@x.com',
  siteBindings: [{ site: { id: 1, name: 'One', slug: 'one' }, role: 'admin' }],
}

// --- a Payload stub ---------------------------------------------------------

type Row = Record<string, unknown> & { id: number }
const db: Record<string, Row[]> = {
  domains: [
    { id: 100, host: 'alice.com', kind: 'custom', status: 'active', ssl_status: 'active', site: 1, primary: false },
    { id: 200, host: 'bob.com', kind: 'custom', status: 'active', ssl_status: 'active', site: 2, primary: true },
    { id: 300, host: 'pool.com', kind: 'custom', status: 'pending', ssl_status: 'pending', site: null },
    { id: 400, host: 'bob-preview.preview.legenex.com', kind: 'preview', status: 'active', ssl_status: 'unknown', site: 2, primary: true },
  ],
  'funnel-lp-deployments': [
    { id: 900, site: 2, path: '/x' }, // bob's
    { id: 901, site: 1, path: '/y' }, // alice's
  ],
}
const payload = {
  findByID: async ({ collection, id }: { collection: string; id: number | string }) => {
    const row = (db[collection] ?? []).find((r) => Number(r.id) === Number(id))
    if (!row) throw new Error('NotFound')
    return row
  },
} as never

// --- relationId -------------------------------------------------------------

t(relationId(5) === 5, 'a raw numeric relationship resolves')
t(relationId('5') === 5, 'a stringified id resolves - Payload returns both')
t(relationId({ id: 7 }) === 7, 'a populated relationship resolves to its id')
t(relationId(null) === null, 'an unset relationship is null, not 0')
t(relationId(undefined) === null, 'an absent relationship is null')
t(relationId({}) === null, 'a populated object with no id is null, not NaN')
t(relationId('abc') === null, 'an unparseable id is null rather than NaN, which would compare false against everything and read as a denial by accident')
// The object branch used to skip the finite check the scalar branch had.
t(relationId({ id: 'abc' }) === null, 'a populated relationship with an unparseable id is null, not NaN')
t(relationId('') === null, "an empty form field is null, not 0 - Number('') is 0 and so is Number(null), so a binding with a null site would have matched it")
t(relationId('  ') === null, 'whitespace is null, not 0')
t(relationId(false) === null, 'a boolean is not an id')
t(relationId(true) === null, 'true is not id 1')
t(relationId({ id: [] }) === null, 'an array-valued id is null, not 0')
t(relationId([]) === null, 'an array is not an id')
t(relationId('1abc') === null, 'a partially-numeric string is null')

// --- requireSiteAdmin -------------------------------------------------------

t(requireSiteAdmin(null, 1).ok === false, 'an anonymous caller is refused')
t(requireSiteAdmin(alice, 1).ok === true, 'a bound admin is allowed')
t(requireSiteAdmin(alice, 2).ok === false, 'alice cannot act on bob\'s site')
t(requireSiteAdmin(alicePopulated, 1).ok === true, 'a populated siteBinding is honoured, not just a raw id')
t(requireSiteAdmin(root, 999).ok === true, 'a super admin bypasses scoping')
t(requireSiteAdmin(alice, null).ok === false, 'a missing siteId is refused rather than defaulting')
t(requireSiteAdmin(alice, '1').ok === true, 'a stringified siteId from a form post still matches')
{
  const r = requireSiteAdmin(alice, 1)
  t(r.ok === true && r.siteId === 1, 'the derived id is returned so the caller need not reuse its own')
}

// --- requireDomainSiteAdmin: the setPrimary / recheckDomainDns attacks -------

{
  const r = await requireDomainSiteAdmin(payload, alice, 200)
  t(r.ok === false, "ATTACK: alice cannot act on bob's domain 200 (setPrimary demoted every primary on a caller-supplied siteId)")
  t(r.ok === false && r.error === 'domain not found', 'a forbidden domain reports the same message as an absent one, so the error is not an oracle for which ids exist')
}
{
  const absent = await requireDomainSiteAdmin(payload, alice, 99999)
  t(absent.ok === false && absent.error === 'domain not found', 'an absent domain does not throw out of the helper')
}
{
  const r = await requireDomainSiteAdmin(payload, alice, 100)
  t(r.ok === true, 'alice may act on her own domain')
  t(r.ok === true && r.siteId === 1, 'the site id is derived FROM THE DOMAIN, which is what makes the caller-supplied one unnecessary')
}
{
  const r = await requireDomainSiteAdmin(payload, alice, 300)
  t(r.ok === false && r.error === 'domain is not attached to a brand', 'an unattached pool domain has no site to authorize against and is refused here')
}
t((await requireDomainSiteAdmin(payload, null, 100)).ok === false, 'an anonymous caller is refused before any read')
t((await requireDomainSiteAdmin(payload, root, 200)).ok === true, 'a super admin may act on any domain')

// --- requirePoolDomain: the attachDomainToSite attack ------------------------

{
  const r = await requirePoolDomain(payload, alice, 300, 2)
  t(r.ok === false, "ATTACK: alice cannot attach a pool domain to bob's site (overrideAccess:false never examined the incoming site, because the row had none)")
}
{
  const r = await requirePoolDomain(payload, alice, 300, 1)
  t(r.ok === true && r.siteId === 1, 'alice may attach a pool domain to her own site')
}
{
  const r = await requirePoolDomain(payload, alice, 100, 1)
  t(r.ok === false && r.error === 'domain is already attached to a brand', 'a domain already attached to the caller\'s OWN site says so, because there it is useful')
}
{
  // Found by the adversarial verifier: this leaked an oracle over the whole
  // domain id space. Probe any id with your own siteId and the message told you
  // whether it existed and belonged to somebody.
  const r = await requirePoolDomain(payload, alice, 200, 1)
  t(r.ok === false && r.error === 'domain not found', "ATTACK: probing bob's domain id while attaching to alice's own site must not confirm the id exists")
}

// --- requireDeploymentSiteAdmin ---------------------------------------------

{
  const r = await requireDeploymentSiteAdmin(payload, alice, { collection: 'funnel-lp-deployments', incomingSiteId: 2 })
  t(r.ok === false, "ATTACK: alice cannot create a deployment on bob's site by passing his brand id")
}
{
  const r = await requireDeploymentSiteAdmin(payload, alice, { collection: 'funnel-lp-deployments', incomingSiteId: 1 })
  t(r.ok === true, 'alice may create a deployment on her own site')
}
{
  const r = await requireDeploymentSiteAdmin(payload, alice, { collection: 'funnel-lp-deployments', existingId: 900, incomingSiteId: 1 })
  t(r.ok === false, "ATTACK: alice cannot steal bob's existing deployment by updating it onto her own site - the CURRENT owner is checked too")
}
{
  const r = await requireDeploymentSiteAdmin(payload, alice, { collection: 'funnel-lp-deployments', existingId: 901, incomingSiteId: 1 })
  t(r.ok === true, 'alice may update her own deployment')
}
{
  const r = await requireDeploymentSiteAdmin(payload, alice, { collection: 'funnel-lp-deployments', existingId: 901, incomingSiteId: 2 })
  t(r.ok === false, "ATTACK: alice cannot push her own deployment onto bob's site")
}

// --- the collection access filters ------------------------------------------
//
// Found by the adversarial pass and confirmed against a real login on a scratch
// database: `siteBindings[].site` is a POPULATED OBJECT, because Users.auth sets
// no depth and Payload reads the user at defaultDepth 2. These rules mapped it
// straight into `{ site: { in: [...] } }`, the drizzle adapter coerced each
// entry with Number(...) to NaN, and the filter matched nothing.
//
// Not a leak - the exact opposite, and total: every site-scoped read and write
// failed for every non-super-admin. Before the fix, a user bound `admin` to a
// Site could not update that Site. These assertions are the shape of the filter,
// which is the part that was wrong.
{
  const argsFor = (user: unknown) => ({ req: { user } }) as never
  const populated = { siteBindings: [{ site: { id: 3, name: 'Three' }, role: 'admin' }] }
  const raw = { siteBindings: [{ site: 4, role: 'admin' }] }

  const p = siteScopedAdmin(argsFor(populated))
  t(typeof p === 'object' && JSON.stringify(p) === '{"site":{"in":[3]}}', 'a POPULATED binding yields the id, not the object - this is the whole defect')
  const r = siteScopedAdmin(argsFor(raw))
  t(typeof r === 'object' && JSON.stringify(r) === '{"site":{"in":[4]}}', 'a raw binding still works, so the unwrap did not break the other shape')

  t(siteScopedAdmin(argsFor({ siteBindings: [{ site: { id: 3 }, role: 'editor' }] })) === false, 'an editor does not clear the admin bar')
  const w = siteScopedWrite(argsFor({ siteBindings: [{ site: { id: 3 }, role: 'editor' }] }))
  t(typeof w === 'object' && JSON.stringify(w) === '{"site":{"in":[3]}}', 'an editor does clear the write bar')
  t(siteScopedRead(argsFor({ super_admin: true, siteBindings: [] })) === true, 'a super admin reads everything')
  t(siteScopedRead(argsFor(null)) === false, 'an anonymous request reads nothing')
  t(siteScopedRead(argsFor({ siteBindings: [{ site: null, role: 'admin' }] })) === false, 'a binding with a null site contributes no id rather than id 0')
}

// --- domain eligibility -----------------------------------------------------

const custom = (o: Partial<Record<string, unknown>>) => ({ host: 'x.com', kind: 'custom', ...o })

t(isDomainServable(custom({ status: 'active', ssl_status: 'active' })), 'a fully active custom domain serves')
t(!isDomainServable(custom({ status: 'pending', ssl_status: 'pending' })), 'a pending custom domain does NOT serve - the resolver had no filter at all')
t(!isDomainServable(custom({ status: 'provisioning', ssl_status: 'pending' })), 'a provisioning domain does not serve')
t(!isDomainServable(custom({ status: 'error', ssl_status: 'error' })), 'a failed domain does not serve')
t(!isDomainServable(custom({ status: 'verified', ssl_status: 'pending' })), 'DNS-verified is not served: verified means DNS resolved, not that we answer under a valid certificate')
t(!isDomainServable(custom({ status: 'active', ssl_status: 'pending' })), 'an active domain with no certificate does not serve')
t(!isDomainServable(custom({ status: 'active', ssl_status: 'error' })), 'an active domain whose certificate failed does not serve')
t(!isDomainServable(null), 'a missing domain does not serve')
t(!isDomainServable(custom({ status: 'active', ssl_status: 'active', host: null })), 'a row with no host does not serve')

t(isDomainSelectable(custom({ status: 'active', ssl_status: 'active' })), 'selectable tracks servable, so a picker cannot offer what the router will 404')
t(!isDomainSelectable(custom({ status: 'provisioning' })), 'the LP and advertorial pickers offered exactly this state as a normal option')

// The preview split, pinned on both sides so flipping the switch is deliberate.
const preview = { host: 'p.preview.legenex.com', kind: 'preview', status: 'active', ssl_status: 'unknown' }
if (PREVIEW_REQUIRES_SSL) {
  t(!isDomainServable(preview), 'with PREVIEW_REQUIRES_SSL on, an unverified preview stops serving')
} else {
  const e = domainEligibility(preview)
  t(e.eligible === true, 'with PREVIEW_REQUIRES_SSL off, an unverified preview still serves - holding it to the custom bar would 404 every existing preview host')
  t(e.eligible === true && e.previewUnverified === true, 'and it is FLAGGED unverified, so a caller can say so rather than imply a check that did not happen')
}
t(!isDomainServable({ ...preview, status: 'pending' }), 'a preview that is not even status-active never serves, whatever the switch says')

// Primary is stricter than servable.
t(mayBecomePrimary(custom({ status: 'active', ssl_status: 'active' })).eligible, 'a fully active custom domain may be primary')
t(!mayBecomePrimary(custom({ status: 'verified', ssl_status: 'pending' })).eligible, "ATTACK: a merely DNS-verified domain may NOT be primary - the old bar accepted status 'verified'")
t(!mayBecomePrimary(custom({ status: 'active', ssl_status: 'pending' })).eligible, 'a custom domain without a certificate may not take over as the canonical host')
t(mayBecomePrimary(preview).eligible === !PREVIEW_REQUIRES_SSL, 'a preview may be primary exactly while it is servable - it is the fallback until a custom domain is real')

// The reason has to be actionable, not "not ready".
{
  const r = domainEligibility(custom({ status: 'active', ssl_status: 'pending' }))
  t(r.eligible === false && /certificate/.test(r.reason), 'the reason names the certificate, so the operator knows what to open')
  const p = domainEligibility(custom({ status: 'pending' }))
  t(p.eligible === false && /DNS/.test(p.reason), 'a pending domain says DNS rather than repeating its status word')
  t(/certificate/.test(domainOptionLabel(custom({ host: 'x.com', status: 'active', ssl_status: 'pending' }))), 'the picker label carries the reason onto the screen')
  t(/primary/.test(domainOptionLabel(custom({ host: 'x.com', status: 'active', ssl_status: 'active', primary: true }))), 'the primary marker survives')
}

// --- report -----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  // A gate that asserts nothing must not report success.
  console.log('no assertions ran')
  process.exit(2)
}
