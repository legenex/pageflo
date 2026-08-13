import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

// Brandless landing-page templates for the funnel builder (ported artifact model).
// NOT site-scoped: a page is bound to a brand + domain via FunnelLpDeployments.
// Kept separate from the site-scoped `landing-pages` collection / public router.
export const FunnelLandingPages: CollectionConfig = {
  slug: 'funnel-landing-pages',
  labels: { singular: 'Funnel Landing Page', plural: 'Funnel Landing Pages' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'template_id', 'is_published', 'updatedAt'],
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
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'template_id', type: 'text', defaultValue: 'editorial_investigation_v2' },
    { name: 'angle', type: 'text', defaultValue: 'pain' },
    { name: 'is_published', type: 'checkbox', defaultValue: false },
    // The artifact section array (type + isVisible + copy) stored verbatim.
    { name: 'sections', type: 'json' },
  ],
}
