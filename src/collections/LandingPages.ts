import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedWrite, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { captureSlugRedirect } from '../hooks/slug-redirects'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const LandingPages: CollectionConfig = {
  slug: 'landing-pages',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'quiz', 'status', 'updatedAt'],
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
      admin: { description: 'Optional. If set, this landing page is reachable on the chosen domain. Domain must already be attached to this site.' },
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
    { name: 'quiz', type: 'relationship', relationTo: 'quizzes', admin: { description: 'Quiz whose Step 1 embeds in the hero.' } },
    {
      name: 'hero',
      type: 'group',
      fields: [
        { name: 'eyebrow', type: 'text' },
        { name: 'heading', type: 'text', required: true },
        { name: 'sub', type: 'textarea' },
      ],
    },
    {
      name: 'body_sections',
      type: 'array',
      fields: [
        { name: 'heading', type: 'text' },
        { name: 'body_markdown', type: 'textarea' },
      ],
    },
    {
      name: 'social_proof',
      type: 'array',
      fields: [
        { name: 'quote', type: 'textarea', required: true },
        { name: 'attribution', type: 'text' },
      ],
    },
    { name: 'meta_title', type: 'text' },
    { name: 'meta_description', type: 'textarea' },
    { name: 'og_image_url', type: 'text' },
    {
      name: 'slug_redirects',
      type: 'array',
      fields: [{ name: 'from', type: 'text', required: true }],
    },
  ],
}
