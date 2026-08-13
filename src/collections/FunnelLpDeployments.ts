import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

// A deployment binds a brandless FunnelLandingPage to a brand (Site) + domain +
// path, and (later) a quiz deployment. Mirrors the artifact's LPDeployment.
export const FunnelLpDeployments: CollectionConfig = {
  slug: 'funnel-lp-deployments',
  labels: { singular: 'Funnel LP Deployment', plural: 'Funnel LP Deployments' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'landing_page', 'site', 'status', 'updatedAt'],
    group: 'Funnel Builder',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'landing_page', type: 'relationship', relationTo: 'funnel-landing-pages', index: true },
    // The "brand" a deployment targets is a Site.
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      admin: { description: 'Optional. When unset, a preview URL is used.' },
    },
    { name: 'path', type: 'text' },
    // Links to a quiz deployment once the Quiz builder exists (Phase 7). Text for now.
    { name: 'quiz_deployment_id', type: 'text' },
    {
      name: 'content_overrides',
      type: 'json',
      admin: {
        description:
          'This deployment\'s own copy, keyed by the template\'s slot ids. Overrides ONLY: a slot with no entry renders the stock template\'s wording, so a corrected template reaches every deployment at once and no deployment holds a private copy of the markup.',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Live', value: 'live' },
        { label: 'Paused', value: 'paused' },
      ],
    },
  ],
}
