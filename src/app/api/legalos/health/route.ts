import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Liveness probe for the release gate. NOT a tenant probe.
 *
 * `self-check` already exists and answers a different question: "did this
 * request reach LegalOS for the RIGHT TENANT?" It answers `404` for a host with
 * no `Domains` row, and that 404 is load-bearing — it is what stops the
 * provisioning poller accepting a handshake that landed on the wrong vhost.
 *
 * `scripts/release.sh` used to point its final health check at `self-check`,
 * which is a category error: the release runs against `os.legenex.com`, the
 * control-plane host, which deliberately has no `Domains` row. So the probe
 * returned 404 on a release that had in fact succeeded, `curl -f` exited 22,
 * and the failure trap then advised `payload migrate:down` — urging an operator
 * to reverse a good release. Measured on production, 2026-08-14.
 *
 * This route answers the question a release actually asks: is the new build
 * serving, and can it reach the database it was just migrated against? Neither
 * depends on host→Site mapping, so no future change to `Domains` can silently
 * turn the release gate red again.
 *
 * It is public and unauthenticated — it is reachable through every tenant vhost
 * — so it says only whether the app is up. No SHA, no versions, no environment,
 * and no database error text: the reason for a failure goes to the process log,
 * where the operator running the release is already looking.
 */
export async function GET() {
  try {
    const { default: config } = await import('@payload-config')
    const payload = await getPayload({ config })

    // One real round-trip to postgres. `count` reads no user data and enumerates
    // no columns, so it proves reachability without becoming a second, weaker
    // copy of `verify:schema` — that check has already run by the time a release
    // reaches this route.
    // `overrideAccess: true` for the same reason every other count in this
    // codebase passes it: the caller is unauthenticated, and this asks whether
    // postgres answered, not whether anyone may read Users.
    await payload.count({ collection: 'users', overrideAccess: true })

    return NextResponse.json(
      { ok: true, app: 'legalos', time: new Date().toISOString() },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    console.error('[legalos] health check failed:', err)
    return NextResponse.json(
      { ok: false, app: 'legalos' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
