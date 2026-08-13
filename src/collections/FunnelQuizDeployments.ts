import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { validateStoredQuizTemplateId } from '../lib/template-records/id'

/**
 * See FunnelLandingPages: the server actions are not the only writer.
 *
 * SHAPE, not existence. Quiz templates are records now, and a clone's
 * `template_id` names no code renderer by design, so checking against the code
 * registry here refused every cloned skin at every door — which is exactly what
 * the renderer-identity suite caught. Existence is checked where a database
 * read is safe: the server action, the publish preflight, and the render path,
 * which refuses to serve rather than drawing a stand-in.
 * `src/lib/template-records/id.ts` states the full division and why a validator
 * must not query.
 */
const validateQuizTemplateId = validateStoredQuizTemplateId

// A quiz deployment binds a brandless FunnelQuiz to a brand (Site) + domain +
// path, plus render/template/tracking config. Mirrors the artifact, minus the
// page chrome, which is now the brand's (see the deprecated columns below).
export const FunnelQuizDeployments: CollectionConfig = {
  slug: 'funnel-quiz-deployments',
  labels: { singular: 'Funnel Quiz Deployment', plural: 'Funnel Quiz Deployments' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'quiz', 'site', 'status', 'updatedAt'],
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
    { name: 'quiz', type: 'relationship', relationTo: 'funnel-quizzes', index: true },
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    { name: 'domain', type: 'relationship', relationTo: 'domains' },
    { name: 'path', type: 'text' },
    { name: 'render_mode', type: 'text', defaultValue: 'standalone' },
    { name: 'template_id', type: 'text', defaultValue: 'sq_quiz_first', validate: validateQuizTemplateId },
    // Null means "use whatever the template chose". A deployment only stores a
    // value here once someone has deliberately picked a different one.
    { name: 'progress_form', type: 'text' },
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
    { name: 'embed_preview_bg', type: 'text' },
    // Per-deployment destination URLs (thank you, did-not-qualify, legal
    // links). Overrides the brand's own URLs for this placement only. Quiz
    // nodes reference a destination by name; see src/lib/quiz-destinations.ts
    // for the deployment -> brand -> site-page cascade.
    { name: 'destination_overrides', type: 'json' },
    // DEPRECATED chrome columns. Page chrome moved to the brand
    // (Sites.brand_identity.defaultHeader / defaultFooter, resolved by
    // siteToBrand): a header and footer belong to the brand wearing the page, and
    // authoring them per deployment let two deployments of one quiz under one
    // brand show different logos and different copyright lines. Nothing reads
    // these any more. They are kept, and only hidden, because dropping the
    // columns would destroy what authors already wrote into them.
    {
      name: 'header_config',
      type: 'json',
      admin: { hidden: true, description: 'Deprecated. Page chrome is authored on Brand Identity (defaultHeader). Retained so existing data is not destroyed.' },
    },
    {
      name: 'footer_config',
      type: 'json',
      admin: { hidden: true, description: 'Deprecated. Page chrome is authored on Brand Identity (defaultFooter). Retained so existing data is not destroyed.' },
    },
    {
      name: 'body_section_overrides',
      type: 'json',
      admin: { hidden: true, description: 'Deprecated. Body sections are authored on Brand Identity (defaultBodySections). Retained so existing data is not destroyed.' },
    },
    { name: 'utm', type: 'json' },
    { name: 'pixels', type: 'json' },
  ],
}
