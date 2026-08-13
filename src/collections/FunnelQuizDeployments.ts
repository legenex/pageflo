import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

// A quiz deployment binds a brandless FunnelQuiz to a brand (Site) + domain +
// path, plus render/template/chrome/tracking config. Mirrors the artifact.
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
    { name: 'template_id', type: 'text', defaultValue: 'sq_quiz_first' },
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
    { name: 'header_config', type: 'json' },
    { name: 'footer_config', type: 'json' },
    { name: 'body_section_overrides', type: 'json' },
    { name: 'utm', type: 'json' },
    { name: 'pixels', type: 'json' },
  ],
}
