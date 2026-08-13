import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { resolveTemplate } from '../lib/template-registry'

/** See FunnelLandingPages: the server actions are not the only writer. */
const validateQuizTemplateId = (value: unknown): true | string => {
  if (value == null || value === '') return true
  const r = resolveTemplate('quiz', value)
  return r.ok ? true : r.error
}

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
    /*
     * TWO WAYS TO PUT A QUIZ ON THIS PAGE, and the first is the one that should
     * be used.
     *
     * `quiz` names a QUIZ FLOW directly, and `embedded_quiz_template_id` says
     * which of the twenty skins to draw it in. That is the composition the
     * product is actually made of - LP template x brand x flow x quiz skin x
     * content x config - and it means embedding a quiz costs one decision.
     *
     * `quiz_deployment_id` is the older seam: it points at a STANDALONE quiz
     * deployment, so putting a quiz in a landing page first required creating a
     * separate public quiz page at its own path, which then existed, was
     * crawlable, and had to be kept in step. It is kept because live rows carry
     * it, and it is resolved as a fallback when `quiz` is unset. Nothing writes
     * it any more.
     */
    {
      name: 'quiz',
      type: 'relationship',
      relationTo: 'funnel-quizzes',
      index: true,
      admin: { description: 'The quiz flow this page runs. Preferred over quiz_deployment_id.' },
    },
    {
      name: 'embedded_quiz_template_id',
      type: 'text',
      validate: validateQuizTemplateId,
      admin: { description: "Which of the twenty quiz skins to draw the embedded flow in. Empty means the landing page's recommended skin." },
    },
    {
      name: 'embedded_progress_form',
      type: 'text',
      admin: { description: "Override the quiz skin's progress treatment. Empty means the skin's own." },
    },
    {
      name: 'quiz_deployment_id',
      type: 'text',
      admin: { description: 'Legacy: a standalone quiz deployment to embed. Resolved only when `quiz` is unset.' },
    },
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
