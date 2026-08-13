/**
 * Tenant isolation, executed against a real database and a real login.
 *
 *   pnpm test:isolation            # needs DATABASE_URI and a migrated schema
 *
 * `scripts/test-authz.ts` asserts the pure helpers with a stubbed Payload, which
 * is the right shape for a decision function. It cannot catch the class of bug
 * this file exists for, because that class lives in what Payload does with the
 * helpers' output:
 *
 *   · a `create` rule returning `{ site: { in: [...] } }` reads as "allowed" and
 *     the constraint is thrown away;
 *   · `siteBindings[].site` arrives populated, so an id filter built from it
 *     coerces to NaN and matches nothing.
 *
 * Both were invisible to every unit test and to review. Neither is expressible
 * without a database, so this suite pays the cost of one.
 *
 * It creates its own fixtures under a unique run id and removes them at the end,
 * including on failure. It never touches a row it did not create.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const RUN = `iso-${Date.now()}`
let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

/** Assert that a call is refused. A call that SUCCEEDS here is the vulnerability. */
const refused = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn()
    fail++
    console.log('  FAIL ' + label + '  (the call SUCCEEDED - this is the vulnerability)')
  } catch {
    pass++
  }
}

const allowed = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn()
    pass++
  } catch (e) {
    fail++
    console.log('  FAIL ' + label + '  (refused: ' + (e instanceof Error ? e.message : String(e)) + ')')
  }
}

const payload = await getPayload({ config })
const created: Array<{ collection: string; id: number | string }> = []
const track = <T extends { id: number | string }>(collection: string, doc: T): T => {
  created.push({ collection, id: doc.id })
  return doc
}

try {
  // --- fixtures: two tenants, one user bound to the first only ---------------
  const siteA = track('sites', await payload.create({
    collection: 'sites',
    data: { name: `${RUN} A`, slug: `${RUN}-a`, vertical: 'multi' } as never,
    overrideAccess: true,
  }))
  const siteB = track('sites', await payload.create({
    collection: 'sites',
    data: { name: `${RUN} B`, slug: `${RUN}-b`, vertical: 'multi' } as never,
    overrideAccess: true,
  }))

  const email = `${RUN}@example.test`
  const password = 'Passw0rd!23'
  track('users', await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      name: 'Isolation probe',
      super_admin: false,
      siteBindings: [{ site: siteA.id, role: 'admin' }],
    } as never,
    overrideAccess: true,
  }))

  const { user } = await payload.login({ collection: 'users', data: { email, password } })
  const asUser = { user: user as never, overrideAccess: false as const }

  // The premise the access rules got wrong. Asserted rather than assumed,
  // because if Payload ever changes its default depth the fix stops being
  // necessary and this line is where that shows up.
  const boundSite = (user as unknown as { siteBindings: Array<{ site: unknown }> }).siteBindings[0].site
  t(typeof boundSite === 'object' && boundSite !== null,
    'siteBindings[].site is POPULATED - an id filter built from it coerces to NaN and matches nothing')

  // --- the filter must not fail closed --------------------------------------
  await allowed('a site admin can update their OWN site (this failed before the populated-binding fix)', () =>
    payload.update({ collection: 'sites', id: siteA.id, data: { tagline: 'ok' } as never, ...asUser }))

  await allowed('a site admin can create a Page on their own site', () =>
    payload.create({
      collection: 'pages',
      data: { site: siteA.id, title: `${RUN} page`, slug: `${RUN}-page`, status: 'draft' } as never,
      ...asUser,
    }).then((d) => track('pages', d)))

  // --- the filter must not fail open ----------------------------------------
  //
  // Every one of these SUCCEEDED before the create-hook fix, because Payload's
  // create operation discards the Where a siteScoped* rule returns.
  await refused('ATTACK: create a Page on another tenant\'s site', () =>
    payload.create({
      collection: 'pages',
      data: { site: siteB.id, title: `${RUN} evil`, slug: `${RUN}-evil`, status: 'published' } as never,
      ...asUser,
    }))

  await refused('ATTACK: create a primary Domain on another tenant\'s site - the resolver takes limit:1 on primary, so this repoints their canonical host', () =>
    payload.create({
      collection: 'domains',
      data: { site: siteB.id, host: `${RUN}-evil.example.test`, kind: 'custom', primary: true, status: 'active' } as never,
      ...asUser,
    }))

  await refused('ATTACK: create a Number on another tenant\'s site', () =>
    payload.create({
      collection: 'numbers',
      data: { site: siteB.id, label: `${RUN}`, e164: '+15550000000' } as never,
      ...asUser,
    }))

  await refused('ATTACK: create a TrackingConfig on another tenant\'s site', () =>
    payload.create({ collection: 'tracking-configs', data: { site: siteB.id } as never, ...asUser }))

  await refused('ATTACK: update another tenant\'s site directly', () =>
    payload.update({ collection: 'sites', id: siteB.id, data: { tagline: 'owned' } as never, ...asUser }))

  // --- moving a document between tenants ------------------------------------
  const mine = track('pages', await payload.create({
    collection: 'pages',
    data: { site: siteA.id, title: `${RUN} movable`, slug: `${RUN}-movable`, status: 'draft' } as never,
    overrideAccess: true,
  }))
  await refused('ATTACK: push my own Page onto another tenant\'s site - combineQueries constrains WHICH row is updated, never what it is changed TO', () =>
    payload.update({ collection: 'pages', id: mine.id, data: { site: siteB.id } as never, ...asUser }))

  // --- the attach path ------------------------------------------------------
  //
  // attachDomainToSite writes with overrideAccess: true, because Payload's
  // updateByID evaluates access against the row's CURRENT state and a pool row
  // has no site — so the scoped write threw Forbidden for every non-super-admin
  // and attaching was impossible for the people it is for. These two assertions
  // are what makes that safe: the beforeValidate hook runs whatever
  // overrideAccess says, so the incoming site is still checked.
  const pool = track('domains', await payload.create({
    collection: 'domains',
    data: { host: `${RUN}-pool.example.test`, kind: 'custom', primary: false, status: 'pending' } as never,
    overrideAccess: true,
  }))

  await refused('ATTACK: attach a pool domain to another tenant, the way the action writes it - overrideAccess: true must NOT bypass the hook', () =>
    payload.update({
      collection: 'domains',
      id: pool.id,
      data: { site: siteB.id } as never,
      user: user as never,
      overrideAccess: true,
    }))

  await allowed('a site admin can attach a pool domain to their OWN site (this threw Forbidden before)', () =>
    payload.update({
      collection: 'domains',
      id: pool.id,
      data: { site: siteA.id } as never,
      user: user as never,
      overrideAccess: true,
    }))

  // --- reads ----------------------------------------------------------------
  const visible = await payload.find({ collection: 'sites', where: { slug: { like: RUN } }, ...asUser })
  t(visible.docs.length === 1 && String(visible.docs[0].id) === String(siteA.id),
    'a scoped read returns only the caller\'s own site, and returns it at all')
} finally {
  // Reverse order so children go before parents; Sites cascade their own.
  for (const row of created.reverse()) {
    try {
      await payload.delete({ collection: row.collection as never, id: row.id, overrideAccess: true })
    } catch {
      // A row already removed by a Site cascade is expected.
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
process.exit(0)
