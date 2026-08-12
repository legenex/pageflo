import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { invalidateHostCache } from '../lib/site-resolver'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const Domains: CollectionConfig = {
  slug: 'domains',
  admin: {
    useAsTitle: 'host',
    defaultColumns: ['host', 'site', 'primary', 'status', 'ssl_status', 'last_checked_at'],
    group: 'Sites',
  },
  access: {
    read: siteScopedRead,
    create: siteScopedAdmin,
    update: siteScopedAdmin,
    delete: siteScopedAdmin,
  },
  hooks: {
    // Invalidate the host→Site cache on ANY Domain mutation (custom admin, raw
    // /cms, REST/local API, seeds, migrations) so re-pointed or renamed hosts
    // don't keep serving the wrong Site for up to the 60s TTL. The custom admin
    // actions also call invalidateHostCache, which is now redundant but harmless.
    afterChange: [
      auditAfterChange,
      ({ doc, previousDoc }) => {
        if (doc?.host) invalidateHostCache(doc.host)
        if (previousDoc?.host && previousDoc.host !== doc?.host) invalidateHostCache(previousDoc.host)
      },
    ],
    afterDelete: [
      auditAfterDelete,
      ({ doc }) => {
        if (doc?.host) invalidateHostCache(doc.host)
      },
    ],
    beforeValidate: [
      enforceSiteBinding('admin'),
      async ({ data, req, operation, originalDoc }) => {
        if (!data?.host) return data
        const normalized = data.host.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
        const conflicts = await req.payload.find({
          collection: 'domains',
          where: { host: { equals: normalized } },
          limit: 1,
          overrideAccess: true,
        })
        const conflict = conflicts.docs.find((d) => operation === 'create' || d.id !== originalDoc?.id)
        if (conflict) {
          throw new Error(`Host "${normalized}" is already in use.`)
        }
        // Preview domains are auto-issued per-site and must always have a site.
        if ((data.kind ?? 'custom') === 'preview' && !data.site) {
          throw new Error('Preview domains require a site.')
        }
        return { ...data, host: normalized }
      },
    ],
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      index: true,
      admin: { description: 'Brand/site this domain serves. Leave blank to keep the domain in the unassigned pool until you attach it.' },
    },
    {
      name: 'host',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Hostname only (no protocol, no path). e.g. checkmyclaim.com' },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'custom',
      options: [
        { label: 'Preview', value: 'preview' },
        { label: 'Custom', value: 'custom' },
      ],
      admin: { description: 'Preview domains are auto-issued by LegalOS and cannot be deleted. Custom domains are user-connected.' },
    },
    { name: 'primary', type: 'checkbox', defaultValue: false, admin: { description: 'The canonical host for this Site. SEO and emitted links use this.' } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Verified', value: 'verified' },
        { label: 'Provisioning', value: 'provisioning' },
        { label: 'Active', value: 'active' },
        { label: 'Error', value: 'error' },
      ],
    },
    {
      name: 'ssl_status',
      type: 'select',
      defaultValue: 'unknown',
      options: [
        { label: 'Unknown', value: 'unknown' },
        { label: 'Pending', value: 'pending' },
        { label: 'Active', value: 'active' },
        { label: 'Error', value: 'error' },
      ],
    },
    {
      name: 'verification_token',
      type: 'text',
      admin: {
        description: 'Random token written as TXT record at _legalos.<host> for DNS-based ownership proof.',
        readOnly: true,
      },
    },
    { name: 'dns_records', type: 'json', admin: { description: 'Required DNS records for verification.' } },
    { name: 'last_checked_at', type: 'date' },
    {
      name: 'plesk_domain_id',
      type: 'text',
      admin: { description: 'Plesk REST API domain id once the tenant domain is registered in Plesk.', readOnly: true },
    },
    {
      name: 'provisioning_error',
      type: 'textarea',
      admin: { description: 'Last error from Plesk provisioning, if any. Cleared on next successful re-check.', readOnly: true },
    },
    {
      name: 'redirects_from',
      type: 'array',
      admin: { description: 'Other hosts that should 301 to this host. Useful for old-domain migration.' },
      fields: [{ name: 'host', type: 'text', required: true }],
    },
  ],
}
