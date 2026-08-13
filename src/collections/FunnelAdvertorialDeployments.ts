import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { enforceDeploymentTenancy, enforceDeploymentTenancyOnDelete } from '../hooks/deployment-tenancy'

// An advertorial deployment binds a brandless FunnelAdvertorial to a brand
// (Site) + domain + path, links it to a quiz deployment for its CTAs, and
// carries CTA-mode/UTM/pixel config. Mirrors the artifact.
export const FunnelAdvertorialDeployments: CollectionConfig = {
  slug: 'funnel-advertorial-deployments',
  labels: { singular: 'Funnel Advertorial Deployment', plural: 'Funnel Advertorial Deployments' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'advertorial', 'site', 'status', 'updatedAt'],
    group: 'Funnel Builder',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  hooks: {
    // Tenant scoping on every door — access above is `isAuthenticated`, so the
    // hook is what stops a logged-in user writing another brand's deployment
    // via raw REST or /cms. `publishRequiresPreflight: false` because
    // advertorials have no preflight door; requiring one would make them
    // unpublishable rather than safer.
    // NEGATIVE CONTROL - TEMPORARILY DISABLED
    // beforeChange: [enforceDeploymentTenancy({ publishRequiresPreflight: false })],
    afterChange: [auditAfterChange],
    // beforeDelete: [enforceDeploymentTenancyOnDelete],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'advertorial', type: 'relationship', relationTo: 'funnel-advertorials', index: true },
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    { name: 'domain', type: 'relationship', relationTo: 'domains' },
    { name: 'path', type: 'text' },
    // References a funnel-quiz-deployments id (stored as text, like the artifact).
    { name: 'quiz_deployment_id', type: 'text' },
    {
      name: 'cta_mode',
      type: 'select',
      defaultValue: 'button',
      options: [
        { label: 'Button to Quiz', value: 'button' },
        { label: 'Embedded Quiz', value: 'embed' },
      ],
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
    { name: 'utm', type: 'json' },
    { name: 'pixels', type: 'json' },
  ],
}
