import type { CollectionConfig } from 'payload'
import { siteScopedRead, siteScopedWrite, siteScopedAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { captureSlugRedirect } from '../hooks/slug-redirects'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'humanizer_passes', 'updatedAt'],
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
    { name: 'title', type: 'text', required: true },
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
    { name: 'excerpt', type: 'textarea' },
    { name: 'body_markdown', type: 'textarea', required: true },
    { name: 'hero_image_url', type: 'text' },
    { name: 'meta_title', type: 'text' },
    { name: 'meta_description', type: 'textarea' },
    { name: 'og_image_url', type: 'text' },
    { name: 'tags', type: 'array', fields: [{ name: 'tag', type: 'text', required: true }] },
    { name: 'humanizer_passes', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'ai_generated', type: 'checkbox', defaultValue: false, admin: { readOnly: true } },
    { name: 'published_at', type: 'date' },
    {
      name: 'slug_redirects',
      type: 'array',
      fields: [{ name: 'from', type: 'text', required: true }],
    },
  ],
}
