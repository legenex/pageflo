'use server'

import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { requireDomainSiteAdmin, requirePoolDomain } from '@/lib/authz'
import { invalidateHostCache } from '@/lib/site-resolver'
import { verifyAndPromoteDomain, setPrimary } from '@/app/(app)/admin/sites/[slug]/settings/domains/actions'
import { unprovisionDomainInPlesk } from '@/lib/plesk/provision-domain'
import { pleskIsConfigured } from '@/lib/plesk/client'
import { buildDnsRecords } from '@/lib/dns-records'

const randomToken = (len = 24): string => crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len)

const normalizeHost = (raw: string): string =>
  raw.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')

/** Create a domain in the unassigned pool (no site yet). */
export async function createPoolDomain(args: { host: string }): Promise<
  | { ok: true; domainId: number }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const host = normalizeHost(args.host)
  if (!host || !host.includes('.')) return { ok: false, error: 'invalid host' }

  const payload = await getPayload({ config })
  const conflict = await payload.find({ collection: 'domains', where: { host: { equals: host } }, limit: 1, overrideAccess: true })
  if (conflict.docs[0]) return { ok: false, error: `host ${host} is already in use` }

  const token = randomToken(24)
  try {
    const created = (await payload.create({
      collection: 'domains',
      data: {
        host,
        kind: 'custom',
        primary: false,
        status: 'pending',
        ssl_status: 'pending',
        verification_token: token,
        dns_records: buildDnsRecords(host),
      } as never,
      user: user as never,
      overrideAccess: false,
    })) as { id: number }
    revalidatePath('/admin/brands/domains')
    return { ok: true, domainId: Number(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

/** Attach a pool domain to a site. Triggers verification + Plesk provisioning. */
export async function attachDomainToSite(args: { domainId: number; siteId: number; siteSlug: string }): Promise<
  { ok: true; verified: boolean } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  const payload = await getPayload({ config })
  // The one place a caller-supplied siteId is legitimate — the row names no Site
  // yet — so it is checked against the caller's own bindings. `overrideAccess:
  // false` alone did NOT check it: Payload evaluates access against the row's
  // current (site-less) state, so the incoming `site` value went unexamined.
  const authz = await requirePoolDomain(payload, user, args.domainId, args.siteId)
  if (!authz.ok) {
    return authz.error === 'domain is already attached to a brand'
      ? { ok: false, error: 'domain is already attached to a site' }
      : authz
  }

  await payload.update({
    collection: 'domains',
    id: args.domainId,
    data: { site: authz.siteId } as never,
    user: user as never,
    overrideAccess: false,
  })
  invalidateHostCache()
  revalidatePath('/admin/brands/domains')
  revalidatePath(`/admin/sites/${args.siteSlug}/settings/domains`)

  // Kick off verification + Plesk provisioning. If DNS isn't ready yet, the row
  // stays in 'pending' and the per-site auto-verify poller picks it up.
  const result = await verifyAndPromoteDomain({ domainId: args.domainId, siteSlug: args.siteSlug })
  if (!result.ok) return { ok: true, verified: false }
  return { ok: true, verified: 'verified' in result ? result.verified : false }
}

/** Detach a domain from a site, returning it to the pool. Custom domains only. */
export async function detachDomainFromSite(args: { domainId: number; siteSlug?: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  const payload = await getPayload({ config })
  const authz = await requireDomainSiteAdmin(payload, user, args.domainId)
  if (!authz.ok) return authz
  const domain = authz.domain
  if (domain.kind === 'preview') return { ok: false, error: 'preview domains belong to their site permanently' }

  await payload.update({
    collection: 'domains',
    id: args.domainId,
    // `plesk_domain_id` is cleared with the rest. It holds the HOST, and it is
    // what `unprovisionDomainInPlesk` deletes an nginx conf and revokes a
    // certificate for. Leaving it on a row that has just lost its owner meant a
    // pool domain carried a live teardown target for a host nobody now guards.
    data: { site: null, primary: false, status: 'pending', ssl_status: 'unknown', plesk_domain_id: null } as never,
    user: user as never,
    overrideAccess: false,
  })
  invalidateHostCache()
  revalidatePath('/admin/brands/domains')
  if (args.siteSlug) revalidatePath(`/admin/sites/${args.siteSlug}/settings/domains`)
  return { ok: true }
}

/** Re-run DNS verification on an attached domain. Resolves the site internally. */
export async function verifyAttachedDomain(args: { domainId: number }): Promise<
  { ok: true; verified: boolean } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const domain = await payload.findByID({ collection: 'domains', id: args.domainId, overrideAccess: true })
  if (!domain) return { ok: false, error: 'domain not found' }
  if (!domain.site) return { ok: false, error: 'attach the domain to a brand before verifying' }
  const siteId = typeof domain.site === 'object' ? Number(domain.site.id) : Number(domain.site)
  const siteDoc = await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })
  if (!siteDoc) return { ok: false, error: 'site not found' }
  const result = await verifyAndPromoteDomain({ domainId: args.domainId, siteSlug: siteDoc.slug })
  revalidatePath('/admin/brands/domains')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, verified: 'verified' in result ? result.verified : false }
}

/** Set a domain as the primary host for its attached brand. */
export async function makeDomainPrimary(args: { domainId: number }): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const domain = await payload.findByID({ collection: 'domains', id: args.domainId, overrideAccess: true })
  if (!domain) return { ok: false, error: 'domain not found' }
  if (!domain.site) return { ok: false, error: 'attach the domain to a brand before making it primary' }
  const siteId = typeof domain.site === 'object' ? Number(domain.site.id) : Number(domain.site)
  const siteDoc = await payload.findByID({ collection: 'sites', id: siteId, overrideAccess: true })
  if (!siteDoc) return { ok: false, error: 'site not found' }
  const result = await setPrimary({ domainId: args.domainId, siteId, siteSlug: siteDoc.slug })
  revalidatePath('/admin/brands/domains')
  return result
}

/** Delete a domain from anywhere — pool or attached. Preview domains are immutable. */
export async function deletePoolDomain(args: { domainId: number }): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const domain = await payload.findByID({ collection: 'domains', id: args.domainId, overrideAccess: true })
  if (!domain) return { ok: false, error: 'domain not found' }
  if (domain.kind === 'preview') return { ok: false, error: 'preview domain cannot be deleted' }
  // An ATTACHED domain is deleted through the Site that owns it. The delete
  // below is access-scoped, but the Plesk unprovision fired first and is not:
  // without this an unauthorized caller could tear down another tenant's vhost
  // and certificate and still be refused by the database afterwards.
  if (domain.site) {
    const authz = await requireDomainSiteAdmin(payload, user, args.domainId)
    if (!authz.ok) return authz
  } else if (!user.super_admin) {
    // An UNATTACHED row has no Site to authorize against, so there is nobody it
    // can be checked out to — which previously meant it was checked against
    // nothing at all. That mattered because a pool row can still carry a
    // `plesk_domain_id`, and the teardown below runs before the scoped delete.
    // The pool is LegalOS-wide, so deleting from it is a super-admin act.
    return { ok: false, error: 'only a super admin can delete an unassigned domain' }
  }

  const pleskId = domain.plesk_domain_id
  if (pleskId && pleskIsConfigured()) {
    void unprovisionDomainInPlesk({ pleskDomainId: String(pleskId) }).catch(() => {})
  }
  await payload.delete({ collection: 'domains', id: args.domainId, user: user as never, overrideAccess: false })
  invalidateHostCache()
  revalidatePath('/admin/brands/domains')
  return { ok: true }
}
