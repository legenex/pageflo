import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedWrite, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const Numbers: CollectionConfig = {
  slug: 'numbers',
  admin: {
    useAsTitle: 'display',
    defaultColumns: ['display', 'tel', 'site', 'truecall_campaign_id', 'updatedAt'],
    group: 'Site Content',
    description: 'Per-Site call-tracking pool. Phones display via resolvePhoneForPath(path, site).',
  },
  access: {
    read: siteScopedRead,
    create: siteScopedWrite,
    update: siteScopedWrite,
    delete: siteScopedAdmin,
  },
  hooks: {
    beforeValidate: [enforceSiteBinding('editor')],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'display', type: 'text', required: true, admin: { description: 'Display format, e.g. (555) 555-5555' } },
    { name: 'tel', type: 'text', required: true, admin: { description: 'tel: link format, e.g. +15555555555' } },
    {
      name: 'page_paths',
      type: 'array',
      admin: { description: 'Paths this number serves. Match by exact path or prefix with /*.' },
      fields: [{ name: 'path', type: 'text', required: true }],
    },
    {
      name: 'fallback',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Used when no path-specific match. At most one fallback per Site.' },
    },
    { name: 'truecall_campaign_id', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
}
