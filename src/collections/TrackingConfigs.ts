import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const TrackingConfigs: CollectionConfig = {
  slug: 'tracking-configs',
  admin: {
    useAsTitle: 'site',
    group: 'Site Content',
    description: 'Per-Site singleton. One row per Site holding all pixel/CAPI/call-tracking credentials.',
  },
  access: {
    read: siteScopedRead,
    create: siteScopedAdmin,
    update: siteScopedAdmin,
    delete: siteScopedAdmin,
  },
  hooks: {
    beforeValidate: [enforceSiteBinding('admin')],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, unique: true, index: true },
    {
      name: 'meta_pixel',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'id', type: 'text' },
        { name: 'capi_token', type: 'text', admin: { description: 'Server access token. Stored encrypted; never sent to client.' } },
        { name: 'test_event_code', type: 'text' },
        { name: 'dataset_id', type: 'text' },
      ],
    },
    {
      name: 'google_ads',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'tag_id', type: 'text' },
        {
          name: 'conversion_actions',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'conversion_id', type: 'text', required: true },
            { name: 'conversion_label', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'ga4',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'measurement_id', type: 'text' },
        { name: 'api_secret', type: 'text' },
      ],
    },
    {
      name: 'tiktok',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'pixel_code', type: 'text' },
        { name: 'access_token', type: 'text' },
        { name: 'test_event_code', type: 'text' },
      ],
    },
    {
      name: 'gtm',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'container_id', type: 'text' },
      ],
    },
    {
      name: 'trustedform',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'account_id', type: 'text' },
        { name: 'api_key', type: 'text' },
        { name: 'retain_certs', type: 'checkbox', defaultValue: false },
        { name: 'auto_claim', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      name: 'truecall',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'api_key', type: 'text' },
        { name: 'account_id', type: 'text' },
        {
          name: 'page_path_mapping',
          type: 'array',
          fields: [
            { name: 'path', type: 'text', required: true },
            { name: 'campaign_id', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'jornaya',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'account_id', type: 'text' },
        { name: 'campaign_id', type: 'text' },
      ],
    },
    {
      name: 'custom_webhooks',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'event_filter', type: 'text', admin: { description: 'Comma-separated events: lead.created, lead.sold, page.published.' } },
        { name: 'hmac_secret', type: 'text' },
      ],
    },
  ],
}
