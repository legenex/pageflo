/**
 * Tenant identity comes from the connection, not from a header.
 *
 *   pnpm test:trusted-host          # needs DATABASE_URI and a migrated schema
 *
 * WHAT WAS WRONG. `src/middleware.ts` returns early for `/api/*`, so it never
 * stamps `x-legalos-host` there — yet two public, unauthenticated routes read a
 * forwarding header to decide which tenant they were serving:
 *
 *   POST /api/leads                 ->  x-forwarded-host ?? host
 *   POST /api/legalos/quiz-webhook  ->  x-legalos-host   ?? host
 *
 * Measured through real nginx + TLS: `os.legenex.com` with
 * `X-Legalos-Host: settlementassist-co.preview.legenex.com` answered as site 15.
 * An anonymous caller chose the tenant. What accidentally covered `/api/leads`
 * was Apache merging the spoofed and real values into one unresolvable string —
 * a proxy behaviour nobody configured, asserted nowhere, and gone the moment the
 * chain changes. This suite refuses to depend on it.
 *
 * THREE LAYERS, because each catches what the others cannot:
 *
 *   A. The helper, pure. `resolveTrustedHost` is the security boundary: if it
 *      never returns a caller-supplied host, no route built on it can be aimed
 *      at another tenant. No database, no network.
 *   B. The contract, in the source. A perfect helper proves nothing if a route
 *      still reads the header itself. This pins that every public API route
 *      derives its host ONLY from the helper — and that the public PAGE routes
 *      still read `x-legalos-host`, which middleware does legitimately stamp for
 *      them and which must not be broken by this fix.
 *   C. The attack, executed. Two tenants of this suite's own making, the real
 *      route handlers, and the spoof headers a hostile client would send.
 *
 * Layer C creates its own fixtures under a unique run id and removes them at the
 * end, including on failure. It never reads or writes a row it did not create,
 * and it never probes a tenant it does not own.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import config from '@payload-config'

import { resolveTrustedHost, trustedHost } from '../src/lib/trusted-host.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

// Resolved through the filesystem rather than a file: URL, because two of the
// paths below carry Next's route-group and catch-all brackets.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf8')

/* -------------------------------------------------------------------------- */
/*  A. The helper, pure                                                        */
/* -------------------------------------------------------------------------- */

// A caller cannot name the tenant. These are the exact headers a spoofing
// client sends; the answer is always the host the connection was opened to.
t(
  trustedHost({ headers: new Headers({ host: 'tenant-a.test', 'x-forwarded-host': 'tenant-b.test' }) }) === 'tenant-a.test',
  'ATTACK: x-forwarded-host naming another tenant is ignored',
)
t(
  trustedHost({ headers: new Headers({ host: 'tenant-a.test', 'x-legalos-host': 'tenant-b.preview.legenex.com' }) }) === 'tenant-a.test',
  'ATTACK: x-legalos-host naming another tenant is ignored',
)
t(
  trustedHost({
    headers: new Headers({
      host: 'tenant-a.test',
      'x-forwarded-host': 'tenant-b.test',
      'x-legalos-host': 'tenant-b.test',
      'x-forwarded-server': 'tenant-b.test',
      forwarded: 'host=tenant-b.test',
    }),
  }) === 'tenant-a.test',
  'ATTACK: every forwarding header at once still resolves to the connected host',
)

// Normalisation, so a spelling difference is not a different tenant.
t(resolveTrustedHost('Tenant-A.TEST') === 'tenant-a.test', 'the host is lower-cased')
t(resolveTrustedHost('tenant-a.test:443') === 'tenant-a.test', 'the port is stripped')
t(resolveTrustedHost('tenant-a.test.') === 'tenant-a.test', 'a trailing root dot is stripped')
t(resolveTrustedHost('  tenant-a.test  ') === 'tenant-a.test', 'surrounding whitespace is stripped')
t(resolveTrustedHost('https://tenant-a.test/path') === 'tenant-a.test', 'a scheme and path are stripped')

// Merged headers. A proxy produces these when the same header arrived twice.
t(
  resolveTrustedHost('tenant-a.test, tenant-a.test') === 'tenant-a.test',
  'a merged header repeating ONE host resolves to it (this must not 400 a real submission)',
)
t(
  resolveTrustedHost('tenant-a.test,TENANT-A.test:443') === 'tenant-a.test',
  'and the same host spelled differently is still one host',
)
t(
  resolveTrustedHost('evil.test, tenant-a.test') === '',
  'ATTACK: a merged header with two DIFFERENT hosts is refused, not picked from',
)
t(
  resolveTrustedHost('tenant-a.test, evil.test') === '',
  'ATTACK: and the order does not matter — neither end is trusted over the other',
)

// Nothing usable is empty, never a guess.
t(resolveTrustedHost(null) === '', 'a missing Host header resolves to nothing')
t(resolveTrustedHost('') === '', 'an empty Host header resolves to nothing')
t(resolveTrustedHost('   ') === '', 'a whitespace Host header resolves to nothing')
t(resolveTrustedHost('tenant a.test') === '', 'a host containing a space is refused')
t(resolveTrustedHost('tenant-a.test\r\nX-Injected: 1') === '', 'a host carrying CRLF is refused')
t(resolveTrustedHost('-leading-dash.test') === '', 'a host that cannot be a hostname is refused')
t(trustedHost({ headers: new Headers({ 'x-forwarded-host': 'tenant-b.test' }) }) === '',
  'ATTACK: with NO Host header, a forwarding header does not stand in for one')

/* -------------------------------------------------------------------------- */
/*  B. The contract, in the source                                             */
/* -------------------------------------------------------------------------- */

// The canonical implementations. `src/app/api/legalos/*/route.ts` are re-export
// aliases with no logic of their own, so pinning the contract here pins it for
// both paths.
const PUBLIC_API_ROUTES = [
  'src/app/api/leads/route.ts',
  'src/app/api/pageflo/quiz-webhook/route.ts',
  'src/app/api/pageflo/self-check/route.ts',
  'src/app/api/pageflo/client-error/route.ts',
]

for (const route of PUBLIC_API_ROUTES) {
  const text = src(route)
  t(/trustedHost\(req\)/.test(text), `${route} derives its host from trustedHost()`)
  t(
    !/headers\.get\(\s*['"]x-forwarded-host['"]\s*\)/.test(text),
    `${route} does not read x-forwarded-host (the caller sets it on /api/*)`,
  )
  t(
    !/headers\.get\(\s*['"]x-legalos-host['"]\s*\)/.test(text),
    `${route} does not read x-legalos-host (middleware never stamps it on /api/*)`,
  )
  // The rename does not get to reintroduce the hole under a new spelling. A
  // PageFlo-branded forwarding header is the same caller-supplied string the
  // old one was, and middleware does not stamp it on /api/* either.
  t(
    !/headers\.get\(\s*['"]x-pageflo-host['"]\s*\)/.test(text),
    `${route} does not read x-pageflo-host either (the rebrand must not re-open the hole)`,
  )
}

// The other half of the contract: middleware DOES stamp `x-legalos-host` for
// public PAGE routes, and the `?preview=1` channel depends on it. Fixing the API
// routes must not have taken that away.
const PUBLIC_PAGE_READERS = [
  'src/app/(public)/[[...slug]]/page.tsx',
  'src/app/(public)/layout.tsx',
  'src/app/(public)/robots.txt/route.ts',
  'src/app/(public)/sitemap.xml/route.ts',
]
for (const page of PUBLIC_PAGE_READERS) {
  t(
    /get\(\s*['"]x-legalos-host['"]\s*\)/.test(src(page)),
    `${page} STILL reads x-legalos-host (middleware stamps it for page routes — unchanged on purpose)`,
  )
}

const middleware = src('src/middleware.ts')
t(
  /PASSTHROUGH_PREFIXES\s*=\s*\[[^\]]*'\/api'/.test(middleware),
  'middleware still passes /api/* through — which is WHY the API routes cannot trust a stamped host',
)
t(
  /res\.headers\.set\(\s*'x-legalos-host'/.test(middleware),
  'and still stamps x-legalos-host for the paths it does handle',
)

/* -------------------------------------------------------------------------- */
/*  C. The attack, executed against the real handlers                          */
/* -------------------------------------------------------------------------- */

const RUN = `th-${Date.now().toString(36)}-${process.pid.toString(36)}`
const HOST_A = `${RUN}-a.trusted-host.test`
const HOST_B = `${RUN}-b.trusted-host.test`

const created: Array<{ collection: CollectionSlug; id: string | number }> = []

/**
 * The two things a route handler touches on the request. A stub rather than a
 * `NextRequest` so the assertion is about the route's logic and not about
 * constructing a framework object outside its server.
 */
const request = (headers: Record<string, string>, body: unknown) => ({
  headers: new Headers(headers),
  json: async () => body,
})

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const mkSite = async (suffix: string) =>
    payload.create({
      collection: 'sites',
      data: { name: `${RUN} ${suffix}`, slug: `${RUN}-${suffix}`, status: 'active', vertical: 'mva' } as never,
      overrideAccess: true,
    })

  const siteA = await mkSite('a')
  created.push({ collection: 'sites', id: siteA.id })
  const siteB = await mkSite('b')
  created.push({ collection: 'sites', id: siteB.id })

  const mkDomain = async (site: { id: string | number }, host: string) =>
    payload.create({
      collection: 'domains',
      // active/active so the row is eligible under LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY,
      // which is on in production — an ineligible fixture would 404 for the right
      // reason and prove nothing about the wrong one.
      data: { site: site.id, host, kind: 'custom', status: 'active', ssl_status: 'active', primary: true } as never,
      overrideAccess: true,
    })

  created.push({ collection: 'domains', id: (await mkDomain(siteA, HOST_A)).id })
  created.push({ collection: 'domains', id: (await mkDomain(siteB, HOST_B)).id })

  /* ---- C1. A lead cannot be filed under a tenant you are not connected to --- */

  const { POST: leadsPOST } = await import('../src/app/api/leads/route.ts')

  const leadBody = {
    // Every channel a caller could try, sent at once. `site_slug` is honoured
    // only for an AUTHENTICATED caller when the host resolves to nothing; this
    // request is anonymous and its host resolves, so it must be ignored.
    site_slug: `${RUN}-b`,
    funnel_type: 'contact-form',
    funnel_path: '/',
    client_submission_id: `${RUN}-spoof`,
    contact: { first_name: 'Spoof', last_name: 'Probe', email: `${RUN}@example.test`, phone: '5555550111' },
  }

  const spoofRes = await leadsPOST(
    request(
      {
        host: HOST_A,
        'x-forwarded-host': HOST_B,
        'x-legalos-host': HOST_B,
        'content-type': 'application/json',
      },
      leadBody,
    ) as never,
  )
  const spoof = (await spoofRes.json()) as { ok: boolean; lead_id: number | null }
  if (spoof.lead_id) created.push({ collection: 'leads', id: spoof.lead_id })

  t(spoof.ok && spoof.lead_id != null, 'the spoofed submission is accepted (it is a valid lead for the host it reached)')

  const leadsOnB = await payload.find({
    collection: 'leads',
    where: { site: { equals: siteB.id } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  })
  t(
    leadsOnB.totalDocs === 0,
    `ATTACK: a lead POSTed to tenant A while naming tenant B did NOT land on tenant B (found ${leadsOnB.totalDocs})`,
  )

  const leadsOnA = await payload.find({
    collection: 'leads',
    where: { site: { equals: siteA.id } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  })
  t(leadsOnA.totalDocs === 1, 'and landed on tenant A, the host the connection was actually made to')

  /* ---- C2. A webhook node cannot be invoked from another tenant's host ------ */

  // A node with no URL and no response mappings executes to "nothing to do" and
  // makes no network call, so this asserts the TENANT BINDING and only that.
  const quiz = await payload.create({
    collection: 'funnel-quizzes' as CollectionSlug,
    data: {
      name: `${RUN} flow`,
      slug: `${RUN}-flow`,
      is_published: true,
      is_archived: false,
      tiers: [],
      steps: [{ key: 's1', label: 'Step 1' }],
      nodes: [
        {
          id: 'n_probe',
          stepKey: 's1',
          tiers: [],
          type: 'webhook',
          isVisible: false,
          headline: 'Tenant binding probe',
          answers: [],
          webhookMethod: 'POST',
          webhookUrl: '',
          webhookHeaders: [],
          webhookPayload: '',
          responseMappings: [],
          enterScript: '',
          exitScript: '',
        },
      ],
      custom_fields: [],
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'funnel-quizzes' as CollectionSlug, id: quiz.id })

  const deployment = await payload.create({
    collection: 'funnel-quiz-deployments' as CollectionSlug,
    data: {
      name: `${RUN} deployment`,
      quiz: quiz.id,
      site: siteB.id,
      path: `/s/${RUN}`,
      render_mode: 'standalone',
      template_id: 'sq_quiz_first',
      status: 'live',
    } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'funnel-quiz-deployments' as CollectionSlug, id: deployment.id })

  const { POST: webhookPOST } = await import('../src/app/api/legalos/quiz-webhook/route.ts')
  const webhookBody = { deployment_id: String(deployment.id), node_id: 'n_probe', values: {} }

  const spoofedWebhook = await webhookPOST(
    request({ host: HOST_A, 'x-legalos-host': HOST_B, 'content-type': 'application/json' }, webhookBody) as never,
  )
  t(
    spoofedWebhook.status === 404,
    `ATTACK: tenant B's live deployment refused (404) when reached through tenant A's host with x-legalos-host spoofed (got ${spoofedWebhook.status})`,
  )

  const ownWebhook = await webhookPOST(request({ host: HOST_B, 'content-type': 'application/json' }, webhookBody) as never)
  t(
    ownWebhook.status === 200,
    `and the SAME deployment answers 200 on its own host, so the refusal above is the tenant binding and not a broken fixture (got ${ownWebhook.status})`,
  )

  // The mirror image: naming your own tenant in the header does not rescue a
  // request that arrived somewhere else.
  const reverseSpoof = await webhookPOST(
    request({ host: HOST_B, 'x-legalos-host': HOST_A, 'content-type': 'application/json' }, webhookBody) as never,
  )
  t(
    reverseSpoof.status === 200,
    `ATTACK: an x-legalos-host pointing AWAY from the connected host cannot deny service either (got ${reverseSpoof.status})`,
  )
}

try {
  await main()
} catch (err) {
  fail++
  console.log(`  FAIL the trusted-host walk completed — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
} finally {
  const payload = await getPayload({ config })
  for (const row of created.reverse()) {
    await payload.delete({ collection: row.collection, id: row.id, overrideAccess: true }).catch(() => null)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) {
  console.log('no assertions ran')
  process.exit(2)
}
process.exit(0)
