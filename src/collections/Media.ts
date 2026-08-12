import type { CollectionConfig } from 'payload'
import path from 'path'
import { siteScopedRead, siteScopedWrite, isSuperAdmin } from '../access'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { enforceSiteBinding } from '../hooks/enforce-site-binding'

// Tenant-scoped media library. Files land on disk under MEDIA_DIR (or a sane
// fallback) and are served from /api/media/file/<filename> via Payload's
// built-in static handler. Site scoping is enforced via access control so an
// admin for site A can't see site B's uploads.
//
// The site relationship is NOT required at the DB level so super_admins can
// upload globally if needed, but the access policy + the upload UI both
// require a site stamp for non-super-admin users.

const MEDIA_DIR =
  process.env.MEDIA_DIR ||
  path.resolve(process.cwd(), 'media')

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    useAsTitle: 'filename',
    group: 'Site Content',
    description: 'Uploaded images and assets. Scoped per Site.',
  },
  access: {
    read: siteScopedRead,
    create: siteScopedWrite,
    update: siteScopedWrite,
    delete: isSuperAdmin,
  },
  upload: {
    staticDir: MEDIA_DIR,
    mimeTypes: ['image/*'],
  },
  hooks: {
    beforeValidate: [enforceSiteBinding('editor')],
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    {
      name: 'alt',
      type: 'text',
      admin: { description: 'Short description of the image for screen readers and SEO.' },
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Optional caption shown beneath the image in image blocks.' },
    },
  ],
}
