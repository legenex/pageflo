import type { CollectionConfig, Validate } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { guardQuizTemplateDelete, guardStockQuizTemplateIdentity } from '../hooks/template-guards'
import { resolveTemplate } from '../lib/template-registry'
import { QUIZ_TEMPLATE_ID_PATTERN } from '../lib/template-records/id'

/**
 * The authoritative, manageable set of quiz visual templates.
 *
 * Before this collection existed the twenty quiz skins were module exports in
 * `src/lib/quiz-templates/model.ts`, surfaced read-only in a `Templates` tab
 * that had no way to act on them. You cannot disable, clone or delete a `const`,
 * so the product had a catalogue it could only look at and a deployment field
 * that stored a raw string — two presentations of one library, neither of them
 * the thing an operator manages.
 *
 * The renderers stay in code. They are ported design work with token tables
 * generated from a handoff, and hand-editing them in a database would be how
 * the port stops matching the design. What lives here is the *identity* of a
 * selectable template and everything mutable about it.
 *
 * Hence two id fields, which is the load-bearing idea in this file:
 *
 *   template_id   the stable id a deployment stores. Never changes for a row.
 *   renderer_key  which code renderer draws it. Must resolve in the registry.
 *
 * For the twenty stock rows the two are equal (`sq_editorial_inline` and so
 * on), which is what lets every existing `funnel_quiz_deployments.template_id`
 * keep resolving with no data rewritten. A CLONE takes a new `template_id` and
 * keeps the source's `renderer_key`: a new selectable identity, drawn by an
 * existing renderer. Collapsing the two into one field would make a clone
 * either unrenderable or indistinguishable from its source.
 */

const validateTemplateId: Validate = (value) => {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) return 'a quiz template needs a stable id'
  if (!QUIZ_TEMPLATE_ID_PATTERN.test(id)) {
    return `"${id}" is not a valid template id (lower-case letters, digits and underscores, 3-64 characters)`
  }
  return true
}

/**
 * The renderer must exist in code, by every door.
 *
 * `/cms` and `POST /api/funnel-quiz-templates` do not go through the server
 * actions, and a row naming a renderer that does not exist is a template that
 * cannot draw — discovered by a visitor rather than by whoever saved it.
 */
const validateRendererKey: Validate = (value) => {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!key) return 'a quiz template needs a renderer'
  const r = resolveTemplate('quiz', key)
  return r.ok ? true : r.error
}

export const FunnelQuizTemplates: CollectionConfig = {
  slug: 'funnel-quiz-templates',
  labels: { singular: 'Quiz Template', plural: 'Quiz Templates' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'template_id', 'renderer_key', 'is_enabled', 'updatedAt'],
    group: 'Funnel Builder',
  },
  // Brandless, like the other funnel authoring collections. A quiz template is
  // presentation with no tenant content in it; brand binding happens on the
  // deployment.
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  // See FunnelLandingPages: the server actions are not the only door.
  hooks: {
    beforeChange: [guardStockQuizTemplateIdentity],
    beforeDelete: [guardQuizTemplateDelete],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'template_id',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validateTemplateId,
    },
    { name: 'renderer_key', type: 'text', required: true, validate: validateRendererKey },
    { name: 'code', type: 'text' },
    { name: 'blurb', type: 'textarea' },
    /**
     * Selectability, not renderability.
     *
     * A disabled template is refused to NEW deployments and keeps drawing for
     * the ones already on it, with a warning in the admin. Taking a live page
     * down as a side effect of tidying a library is not something an operator
     * asked for.
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
      ],
    },
    /**
     * The registry id a stock row was materialised from.
     *
     * Reconcile matches on this rather than on `template_id`, so an operator
     * renaming a stock row's id (which they cannot today, but might) does not
     * cause reconcile to create a duplicate beside it.
     */
    { name: 'stock_key', type: 'text', index: true },
    /** Set when soft-deleted because a deployment still references the row. */
    { name: 'archived_at', type: 'date' },
    /** Presentation choices layered over the renderer, e.g. the progress form. */
    { name: 'config_overrides', type: 'json' },
  ],
}
