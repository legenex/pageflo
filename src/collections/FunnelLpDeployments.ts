import type { CollectionConfig } from 'payload'
import { isAuthenticated } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { enforceDeploymentTenancy, enforceDeploymentTenancyOnDelete } from '../hooks/deployment-tenancy'
import { validateStoredQuizTemplateId } from '../lib/template-records/id'

/**
 * See FunnelLandingPages: the server actions are not the only writer.
 *
 * SHAPE, not existence. Quiz templates are records now, and a clone's
 * `template_id` names no code renderer by design, so checking against the code
 * registry here would refuse every cloned skin at every door. Existence is
 * checked where a database read is safe — the server action, the publish
 * preflight, and the render path, which refuses to serve rather than drawing a
 * stand-in. `src/lib/template-records/id.ts` states the full division.
 */
const validateQuizTemplateId = validateStoredQuizTemplateId

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
    // Tenant scoping on every door — access above is `isAuthenticated`, so the
    // hook is what stops a logged-in user writing another brand's deployment
    // via raw REST or /cms. `publishRequiresPreflight`: going live outside
    // `setLpDeploymentStatus` (the door that runs the preflight) is refused.
    beforeChange: [enforceDeploymentTenancy({ publishRequiresPreflight: true })],
    afterChange: [auditAfterChange],
    beforeDelete: [enforceDeploymentTenancyOnDelete],
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
    /**
     * Where this placement sends people, overriding the brand's own URLs.
     *
     * A landing page that embeds a quiz genuinely delivers leads, so the
     * destination cascade (deployment -> brand -> site page, see
     * src/lib/quiz-destinations.ts) has to have a deployment rung on this side
     * too. Without it the `Destination URL's` tab would be a tab about nothing.
     */
    { name: 'destination_overrides', type: 'json' },
    /** UTM defaults for this placement. */
    { name: 'utm', type: 'json' },
    /** Per-provider pixel ids for this placement. */
    { name: 'pixels', type: 'json' },
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
    /*
     * SAVED IS NOT PUBLISHED, and `status` alone cannot tell them apart.
     *
     * A refused publish still saves the operator's edits, and a live row keeps
     * serving through content edits — so "draft" and "live" both describe rows
     * whose saved content has never passed a check. These two columns record
     * what did pass and when, which is what lets the admin say "not live" about
     * refused edits and "serving unverified changes" about a live row that was
     * edited afterwards.
     *
     * Written ONLY by `setLpDeploymentStatus`, the one door that runs the
     * preflight. `readOnly` keeps the raw /cms admin from asserting a publish
     * that never happened; it is an admin-UI flag, not access control, and the
     * real guarantee is that no other writer sets these fields.
     *
     * See `src/lib/publish-state.ts` for why the second column is a digest
     * rather than a timestamp comparison, and migration
     * `20260814_160000_lp_deployment_publish_state`.
     */
    {
      name: 'last_published_at',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When this deployment last passed the publish preflight. Set only by the publish action.',
      },
    },
    {
      name: 'published_fingerprint',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Digest of the publish-relevant fields at that moment. Unequal to the row today means the saved changes have not been through a preflight.',
      },
    },
  ],
}
