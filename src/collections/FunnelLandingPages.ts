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

/**
 * The authoritative library of landing-page TEMPLATES.
 *
 * This collection used to be described as "pages", and the product had a second
 * `Templates` tab listing a code catalogue that nothing could select. A
 * deployment picked a page; the twelve ported templates could only be looked
 * at. Two names for one idea, and the one an operator could act on was the
 * wrong one.
 *
 * A row here IS a template: a reusable, brand-neutral authored object that many
 * deployments bind to a brand. `template_id` names the code renderer that draws
 * it (see src/lib/template-registry.ts); `sections` carries node-template copy;
 * `slot_overrides` carries ported-template copy. Nothing brand-specific is
 * stored on it, which is what lets a template be previewed under a brand
 * without becoming that brand's.
 *
 * Brandless and NOT site-scoped: brand binding happens on FunnelLpDeployments.
 * Kept separate from the site-scoped `landing-pages` collection / public router.
 */
export const FunnelLandingPages: CollectionConfig = {
  slug: 'funnel-landing-pages',
  labels: { singular: 'Landing Page Template', plural: 'Landing Page Templates' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'template_id', 'is_enabled', 'origin', 'updatedAt'],
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
    /**
     * The render gate. A deployment of an unpublished template does not serve.
     *
     * Deliberately NOT the same switch as `is_enabled`. See that field.
     */
    { name: 'is_published', type: 'checkbox', defaultValue: false },
    /**
     * Selectability for NEW deployments.
     *
     * Disabling a template must not take a live page down — the requirement is
     * that existing deployments keep rendering with an administrative warning —
     * so Disable writes this field and leaves `is_published` alone. Enable
     * writes both, because a template nobody can deploy is not enabled in any
     * sense an operator would recognise.
     */
    { name: 'is_enabled', type: 'checkbox', defaultValue: true, index: true },
    {
      name: 'origin',
      type: 'select',
      defaultValue: 'blank',
      options: [
        { label: 'Stock library', value: 'stock' },
        { label: 'Clone', value: 'clone' },
        { label: 'Created blank', value: 'blank' },
        { label: 'Built with Claude', value: 'ai' },
        { label: 'Pre-existing content', value: 'legacy' },
      ],
    },
    /**
     * For a stock row, the registry slug it was materialised from.
     *
     * Reconcile matches on this, so it can tell "the library has twelve
     * templates and eleven rows exist" from "somebody renamed one".
     */
    { name: 'stock_key', type: 'text', index: true },
    /** Set when soft-deleted because a deployment still references the row. */
    { name: 'archived_at', type: 'date' },
    // The artifact section array (type + isVisible + copy) stored verbatim.
    // Drawn by the node renderer; only the four legacy identity templates use it.
    { name: 'sections', type: 'json' },
    /**
     * Template-level copy for the twelve PORTED templates, keyed by slot id.
     *
     * The ported templates are the handoff's own markup and have no node tree,
     * so `sections` cannot carry their copy. `src/lib/lp-slots/` names every
     * editable run in them; this is where a template's own wording lives, and
     * a deployment's `content_overrides` layer on top of it per brand.
     */
    { name: 'slot_overrides', type: 'json' },
  ],
}
