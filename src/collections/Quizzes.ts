import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedWrite, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { captureSlugRedirect } from '../hooks/slug-redirects'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const Quizzes: CollectionConfig = {
  slug: 'quizzes',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'status', 'updatedAt'],
    group: 'Site Content',
  },
  access: {
    read: siteScopedRead,
    create: siteScopedWrite,
    update: siteScopedWrite,
    delete: siteScopedAdmin,
  },
  hooks: {
    beforeValidate: [enforceSiteBinding('editor')],
    beforeChange: [captureSlugRedirect],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    {
      name: 'domain',
      type: 'relationship',
      relationTo: 'domains',
      admin: { description: 'Optional. If set, this quiz is reachable on the chosen domain. Domain must already be attached to this site.' },
    },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'steps',
      type: 'array',
      fields: [
        { name: 'step_id', type: 'text', required: true, admin: { description: 'Stable internal id. Used in branching rules.' } },
        { name: 'question', type: 'text', required: true },
        { name: 'help_text', type: 'textarea' },
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'single',
          options: [
            { label: 'Single choice', value: 'single' },
            { label: 'Multiple choice', value: 'multi' },
            { label: 'Text', value: 'text' },
            { label: 'Date', value: 'date' },
            { label: 'Contact form (terminus)', value: 'contact' },
          ],
        },
        {
          name: 'choices',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text', required: true },
            { name: 'dq', type: 'checkbox', defaultValue: false, admin: { description: 'If selected, route to the DQ thank-you page.' } },
            { name: 'next_step_id', type: 'text', admin: { description: 'Branch to a specific step id. Leave blank for next-in-order.' } },
          ],
        },
        { name: 'is_terminal', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'dq_destination_slug', type: 'text', defaultValue: '/thanks' },
    { name: 'submitted_destination_slug', type: 'text', defaultValue: '/submitted' },
    {
      name: 'slug_redirects',
      type: 'array',
      fields: [{ name: 'from', type: 'text', required: true }],
    },
  ],
}
