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
import { readFileSync } from 'node:fs'

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

  // --- funnel deployments: the raw door -------------------------------------
  //
  // The three funnel deployment collections are `isAuthenticated` on every
  // verb, so `overrideAccess: false` buys nothing there — the server actions'
  // `requireDeploymentSiteAdmin` gate was the ONLY thing between a logged-in
  // user and any tenant's deployment, and raw REST / `/cms` / a userful local
  // API call never pass through an action. `enforceDeploymentTenancy` (a
  // beforeChange + beforeDelete pair) puts the rule on every door; these are
  // the calls an attacker would actually make, against a second user so the
  // victim rows belong to somebody real.
  const emailB = `${RUN}-b@example.test`
  track('users', await payload.create({
    collection: 'users',
    data: {
      email: emailB,
      password,
      name: 'Isolation probe B',
      super_admin: false,
      siteBindings: [{ site: siteB.id, role: 'admin' }],
    } as never,
    overrideAccess: true,
  }))
  const { user: rawUserB } = await payload.login({ collection: 'users', data: { email: emailB, password } })
  const asUserB = { user: rawUserB as never, overrideAccess: false as const }

  // The victim rows: site B's deployments, written the way seeds write them —
  // no user, `overrideAccess: true`. Their creation is itself an assertion:
  // if the tenancy hook ever gated system paths, these throw and the suite
  // fails before a single attack runs.
  const lpDepB = track('funnel-lp-deployments', await payload.create({
    collection: 'funnel-lp-deployments',
    data: { name: `${RUN} lp B`, site: siteB.id, path: `/${RUN}-lp-b`, status: 'draft' } as never,
    overrideAccess: true,
  }))
  const quizDepB = track('funnel-quiz-deployments', await payload.create({
    collection: 'funnel-quiz-deployments',
    data: { name: `${RUN} quiz B`, site: siteB.id, path: `/${RUN}-quiz-b`, status: 'draft' } as never,
    overrideAccess: true,
  }))
  const advDepB = track('funnel-advertorial-deployments', await payload.create({
    collection: 'funnel-advertorial-deployments',
    data: { name: `${RUN} adv B`, site: siteB.id, path: `/${RUN}-adv-b`, status: 'draft' } as never,
    overrideAccess: true,
  }))

  // Creates: a positive control per collection (so a hook that fails closed
  // shows up), then the same call naming the other tenant.
  const lpDepA = track('funnel-lp-deployments', await (async () => {
    let doc: { id: number | string } | null = null
    await allowed('a site admin can create an LP deployment on their OWN brand', async () => {
      doc = await payload.create({
        collection: 'funnel-lp-deployments',
        data: { name: `${RUN} lp A`, site: siteA.id, path: `/${RUN}-lp-a`, status: 'draft' } as never,
        ...asUser,
      })
    })
    // Fallback keeps later assertions runnable even if the positive failed.
    return doc ?? (await payload.create({
      collection: 'funnel-lp-deployments',
      data: { name: `${RUN} lp A`, site: siteA.id, path: `/${RUN}-lp-a`, status: 'draft' } as never,
      overrideAccess: true,
    }))
  })())
  await refused('ATTACK: create an LP deployment naming another tenant\'s site', () =>
    payload.create({
      collection: 'funnel-lp-deployments',
      data: { name: `${RUN} evil lp`, site: siteB.id, path: `/${RUN}-evil-lp`, status: 'draft' } as never,
      ...asUser,
    }))
  await refused('ATTACK: create an LP deployment with NO site - an orphan is nobody\'s and must not be mintable by a tenant user', () =>
    payload.create({
      collection: 'funnel-lp-deployments',
      data: { name: `${RUN} orphan lp`, path: `/${RUN}-orphan-lp`, status: 'draft' } as never,
      ...asUser,
    }))

  const quizDepA = track('funnel-quiz-deployments', await (async () => {
    let doc: { id: number | string } | null = null
    await allowed('a site admin can create a quiz deployment on their OWN brand', async () => {
      doc = await payload.create({
        collection: 'funnel-quiz-deployments',
        data: { name: `${RUN} quiz A`, site: siteA.id, path: `/${RUN}-quiz-a`, status: 'draft' } as never,
        ...asUser,
      })
    })
    return doc ?? (await payload.create({
      collection: 'funnel-quiz-deployments',
      data: { name: `${RUN} quiz A`, site: siteA.id, path: `/${RUN}-quiz-a`, status: 'draft' } as never,
      overrideAccess: true,
    }))
  })())
  await refused('ATTACK: create a quiz deployment naming another tenant\'s site', () =>
    payload.create({
      collection: 'funnel-quiz-deployments',
      data: { name: `${RUN} evil quiz`, site: siteB.id, path: `/${RUN}-evil-quiz`, status: 'draft' } as never,
      ...asUser,
    }))

  const advDepA = track('funnel-advertorial-deployments', await (async () => {
    let doc: { id: number | string } | null = null
    await allowed('a site admin can create an advertorial deployment on their OWN brand', async () => {
      doc = await payload.create({
        collection: 'funnel-advertorial-deployments',
        data: { name: `${RUN} adv A`, site: siteA.id, path: `/${RUN}-adv-a`, status: 'draft' } as never,
        ...asUser,
      })
    })
    return doc ?? (await payload.create({
      collection: 'funnel-advertorial-deployments',
      data: { name: `${RUN} adv A`, site: siteA.id, path: `/${RUN}-adv-a`, status: 'draft' } as never,
      overrideAccess: true,
    }))
  })())
  await refused('ATTACK: create an advertorial deployment naming another tenant\'s site', () =>
    payload.create({
      collection: 'funnel-advertorial-deployments',
      data: { name: `${RUN} evil adv`, site: siteB.id, path: `/${RUN}-evil-adv`, status: 'draft' } as never,
      ...asUser,
    }))

  // Updates: the row's CURRENT site is the subject even when the write never
  // touches `site` — editing another tenant's deployment in place is the
  // attack `combineQueries` cannot stop here, because these collections'
  // access rules return plain booleans.
  await allowed('a site admin can update their OWN LP deployment', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepA.id, data: { name: `${RUN} lp A renamed` } as never, ...asUser }))
  await refused('ATTACK: update another tenant\'s LP deployment', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepB.id, data: { name: 'owned' } as never, ...asUser }))
  await allowed('a site admin can update their OWN quiz deployment', () =>
    payload.update({ collection: 'funnel-quiz-deployments', id: quizDepA.id, data: { name: `${RUN} quiz A renamed` } as never, ...asUser }))
  await refused('ATTACK: update another tenant\'s quiz deployment', () =>
    payload.update({ collection: 'funnel-quiz-deployments', id: quizDepB.id, data: { name: 'owned' } as never, ...asUser }))
  await allowed('a site admin can update their OWN advertorial deployment', () =>
    payload.update({ collection: 'funnel-advertorial-deployments', id: advDepA.id, data: { name: `${RUN} adv A renamed` } as never, ...asUser }))
  await refused('ATTACK: update another tenant\'s advertorial deployment', () =>
    payload.update({ collection: 'funnel-advertorial-deployments', id: advDepB.id, data: { name: 'owned' } as never, ...asUser }))

  await refused('ATTACK: move my own LP deployment onto another tenant\'s site - both ends of a move need the binding', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepA.id, data: { site: siteB.id } as never, ...asUser }))

  // The referenced DOMAIN must belong to the deployment's Site. The server
  // action refused a cross-brand domain; the raw door did not, so a tenant
  // could store another brand's domain_id on their OWN deployment. Inert today
  // (the resolver filters by host-resolved Site) but a real write gap.
  const domainA = track('domains', await payload.create({
    collection: 'domains',
    data: { site: siteA.id, host: `${RUN}-a.example.test`, kind: 'custom', primary: false, status: 'active' } as never,
    overrideAccess: true,
  }))
  const domainB = track('domains', await payload.create({
    collection: 'domains',
    data: { site: siteB.id, host: `${RUN}-b.example.test`, kind: 'custom', primary: false, status: 'active' } as never,
    overrideAccess: true,
  }))
  await refused('ATTACK: bind another tenant\'s DOMAIN onto my own LP deployment via the raw door', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepA.id, data: { domain: domainB.id } as never, ...asUser }))
  await refused('ATTACK: bind another tenant\'s domain onto my own QUIZ deployment via the raw door', () =>
    payload.update({ collection: 'funnel-quiz-deployments', id: quizDepA.id, data: { domain: domainB.id } as never, ...asUser }))
  await refused('ATTACK: bind another tenant\'s domain onto my own ADVERTORIAL deployment via the raw door', () =>
    payload.update({ collection: 'funnel-advertorial-deployments', id: advDepA.id, data: { domain: domainB.id } as never, ...asUser }))
  await allowed('a site admin can bind their OWN brand\'s domain to their own LP deployment', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepA.id, data: { domain: domainA.id } as never, ...asUser }))
  await allowed('a site admin can clear the domain (fall back to the preview URL)', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepA.id, data: { domain: null } as never, ...asUser }))

  // Going live. Cross-tenant flips are tenancy violations; an OWN-brand flip
  // through the raw door must still be refused, because going live is a
  // publish and a publish runs the preflight — `setLpDeploymentStatus` /
  // `setQuizDeploymentStatus` are the one door that runs it, and they mark
  // their write with `context: { pagefloPreflighted: true }`.
  await refused('ATTACK: flip another tenant\'s draft LP deployment to live', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepB.id, data: { status: 'live' } as never, ...asUser }))
  await refused('ATTACK: flip another tenant\'s draft quiz deployment to live', () =>
    payload.update({ collection: 'funnel-quiz-deployments', id: quizDepB.id, data: { status: 'live' } as never, ...asUser }))
  await refused('ATTACK: a forged pagefloPreflighted context must not bypass tenancy on another tenant\'s deployment', () =>
    payload.update({
      collection: 'funnel-quiz-deployments',
      id: quizDepB.id,
      data: { status: 'live' } as never,
      context: { pagefloPreflighted: true },
      ...asUser,
    }))
  await refused('the raw door refuses an UNPREFLIGHTED go-live of an LP deployment even for the brand\'s own admin', () =>
    payload.update({ collection: 'funnel-lp-deployments', id: lpDepB.id, data: { status: 'live' } as never, ...asUserB }))
  await refused('the raw door refuses an UNPREFLIGHTED go-live of a quiz deployment even for the brand\'s own admin', () =>
    payload.update({ collection: 'funnel-quiz-deployments', id: quizDepB.id, data: { status: 'live' } as never, ...asUserB }))
  await allowed('the preflighted door can put the brand\'s own quiz deployment live (context pagefloPreflighted)', () =>
    payload.update({
      collection: 'funnel-quiz-deployments',
      id: quizDepB.id,
      data: { status: 'live' } as never,
      context: { pagefloPreflighted: true },
      ...asUserB,
    }))
  await allowed('the preflighted door can put the brand\'s own LP deployment live (context pagefloPreflighted)', () =>
    payload.update({
      collection: 'funnel-lp-deployments',
      id: lpDepB.id,
      data: { status: 'live' } as never,
      context: { pagefloPreflighted: true },
      ...asUserB,
    }))
  await allowed('an advertorial deployment goes live without the marker - advertorials have no preflight door, by design', () =>
    payload.update({ collection: 'funnel-advertorial-deployments', id: advDepA.id, data: { status: 'live' } as never, ...asUser }))

  // Deletes: a delete carries no incoming site, so the record's own is the
  // subject. Own-brand deletes stay possible or the hook is a lockout.
  await refused('ATTACK: delete another tenant\'s LP deployment', () =>
    payload.delete({ collection: 'funnel-lp-deployments', id: lpDepB.id, ...asUser }))
  await allowed('a site admin can delete their OWN LP deployment', () =>
    payload.delete({ collection: 'funnel-lp-deployments', id: lpDepA.id, ...asUser }))
  await refused('ATTACK: delete another tenant\'s quiz deployment', () =>
    payload.delete({ collection: 'funnel-quiz-deployments', id: quizDepB.id, ...asUser }))
  await allowed('a site admin can delete their OWN quiz deployment', () =>
    payload.delete({ collection: 'funnel-quiz-deployments', id: quizDepA.id, ...asUser }))
  await refused('ATTACK: delete another tenant\'s advertorial deployment', () =>
    payload.delete({ collection: 'funnel-advertorial-deployments', id: advDepB.id, ...asUser }))
  await allowed('a site admin can delete their OWN advertorial deployment', () =>
    payload.delete({ collection: 'funnel-advertorial-deployments', id: advDepA.id, ...asUser }))

  // --- the advertorial ACTION gate, as wiring -------------------------------
  //
  // `saveAdvertorialDeployment` / `deleteAdvertorialDeployment` are server
  // actions, and a server action cannot be invoked from a script — there is no
  // request for `getCurrentUser` to read. The calls above prove the COLLECTION
  // door; the action's own gate can only be proven the way `test-publish.mts`
  // proves the resolver consults `domainEligibility`: read the source and
  // assert the gate is wired, so removing it fails here rather than in an
  // incident. Comments are stripped first — the technique
  // `test-template-records.mts` uses — so a commented-out gate does not pass.
  {
    const src = readFileSync(
      new URL('../src/app/(app)/admin/(top)/advertorials/actions.ts', import.meta.url).pathname,
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const fn = (name: string): string => {
      const i = src.indexOf(`export async function ${name}`)
      if (i === -1) return ''
      const j = src.indexOf('export async function', i + 1)
      return src.slice(i, j === -1 ? undefined : j)
    }
    const save = fn('saveAdvertorialDeployment')
    const del = fn('deleteAdvertorialDeployment')

    // Gated means: the gate is called, its refusal is returned, and all of
    // that happens BEFORE the first write the function performs.
    const gated = (body: string, write: RegExp): boolean => {
      const g = body.indexOf('requireDeploymentSiteAdmin')
      const w = body.search(write)
      return g !== -1 && w !== -1 && g < w && /if \(!gate\.ok\) return gate/.test(body)
    }
    t(gated(save, /payload\.(create|update)\(/),
      'saveAdvertorialDeployment gates on requireDeploymentSiteAdmin before any write, like its LP/quiz siblings')
    t(/site: gate\.siteId/.test(save) && !/site: numFromBrandId/.test(save),
      'saveAdvertorialDeployment stores the DERIVED site, never the client\'s brand id')
    t(/belongs to a different brand/.test(save),
      'saveAdvertorialDeployment refuses a domain owned by a different brand')
    t(gated(del, /payload\.delete\(/),
      'deleteAdvertorialDeployment gates on requireDeploymentSiteAdmin before the delete')
  }
} finally {
  // Reverse order so children go before parents; Sites cascade their own.
  for (const row of created.reverse()) {
    try {
      if (row.collection === 'users') {
        // The suite's own mutations wrote audit rows naming this user, and
        // `audit_log.user_id` is NOT NULL while its FK is ON DELETE SET NULL —
        // so deleting a user who ever wrote an audited change fails at the
        // database and this suite leaked its probe users on every run. The
        // audit rows removed here are ones this run caused. (The schema
        // contradiction is a real product bug — an operator cannot be
        // offboarded once audited — and needs AuditLog.user to go optional
        // plus a DROP NOT NULL migration; a test teardown cannot fix that.)
        await payload.delete({ collection: 'audit-log' as never, where: { user: { equals: row.id } }, overrideAccess: true })
      }
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
