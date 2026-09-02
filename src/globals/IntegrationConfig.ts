import type { GlobalConfig } from 'payload'
import { isSuperAdmin } from '../access'
import { PRODUCT_NAME } from '../lib/pageflo/product'

export const IntegrationConfig: GlobalConfig = {
  slug: 'integration-config',
  admin: {
    group: PRODUCT_NAME,
    description: `${PRODUCT_NAME}-wide integrations (SMTP, Slack, GitHub, Search Console). Per-Site values live in TrackingConfig.`,
  },
  access: {
    read: isSuperAdmin,
    update: isSuperAdmin,
  },
  fields: [
    {
      // Internal one-time marker: set true after the sample funnel content
      // (landing pages / quizzes / deployments) is auto-created on first load,
      // so deleting a sample never causes it to be re-created. Not user-facing.
      name: 'funnel_samples_seeded',
      type: 'checkbox',
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      // Separate one-time marker for the sample advertorials, so installs that
      // already seeded landing pages / quizzes still get advertorials once.
      name: 'funnel_advertorial_samples_seeded',
      type: 'checkbox',
      defaultValue: false,
      admin: { hidden: true },
    },
    {
      name: 'smtp',
      type: 'group',
      fields: [
        { name: 'host', type: 'text' },
        { name: 'port', type: 'number', defaultValue: 587 },
        { name: 'user', type: 'text' },
        { name: 'pass', type: 'text' },
        { name: 'from_name', type: 'text', defaultValue: PRODUCT_NAME },
        { name: 'from_email', type: 'email', defaultValue: 'noreply@legenex.com' },
      ],
    },
    {
      name: 'slack',
      type: 'group',
      fields: [
        {
          name: 'webhooks',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'url', type: 'text', required: true },
            { name: 'events', type: 'text', admin: { description: 'Comma-separated event names.' } },
          ],
        },
      ],
    },
    {
      name: 'github',
      type: 'group',
      fields: [
        {
          name: 'repos',
          type: 'array',
          fields: [
            { name: 'site', type: 'relationship', relationTo: 'sites' },
            { name: 'repo_url', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'search_console_root',
      type: 'group',
      fields: [
        { name: 'verification_method', type: 'text' },
        { name: 'verification_token', type: 'text' },
      ],
    },
    {
      name: 'billing',
      type: 'group',
      fields: [
        { name: 'plan', type: 'text', defaultValue: 'internal' },
        { name: 'notes', type: 'textarea' },
      ],
    },
  ],
}
