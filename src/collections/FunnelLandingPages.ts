import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { resolveTemplate } from '../lib/template-registry'

/**
 * A template id that names nothing must not be storable, by ANY door.
 *
 * The server actions validate, and the server actions are not the only way in:
 * `create`/`update` are `isAuthenticated`, so `POST /api/funnel-landing-pages`
 * and the raw `/cms` text field both stored whatever they were given. A field
 * validator is the only check that covers every writer, which is what makes a
 * bad row unreachable rather than merely unlikely.
 */
const validateLpTemplateId = (value: unknown): true | string => {
  if (value == null || value === '') return true
  const r = resolveTemplate('lp', value)
  return r.ok ? true : r.error
}

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
    {
      name: 'template_id',
      type: 'text',
      // The stock library's first long-form template. NOT `bold_modern`, which
      // named nothing and rendered as a node-backed identity page; see the
      // alias table in src/lib/template-registry.ts for why those are different
      // pages rather than two names for one.
      defaultValue: 'editorial_investigation_v2',
      validate: validateLpTemplateId,
    },
    { name: 'angle', type: 'text', defaultValue: 'pain' },
    { name: 'is_published', type: 'checkbox', defaultValue: false },
    // The artifact section array (type + isVisible + copy) stored verbatim.
    { name: 'sections', type: 'json' },
  ],
}
