import type { CollectionConfig } from 'payload'
import { isSuperAdmin, isSuperAdminField } from '../access'
import { PRODUCT_NAME } from '../lib/pageflo/product'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    cookies: { sameSite: 'Lax' },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'super_admin', 'status', 'last_login_at'],
    group: PRODUCT_NAME,
  },
  access: {
    // Non-super-admins may only read their own user row. Without this any
    // authenticated user could enumerate every operator's email + site
    // bindings across all tenants via /api/users or /cms. Login is unaffected
    // (payload.login bypasses read access).
    read: ({ req }) => {
      if (!req.user) return false
      if ((req.user as { super_admin?: boolean }).super_admin) return true
      return { id: { equals: req.user.id } }
    },
    create: isSuperAdmin,
    update: ({ req, id }) => {
      if (!req.user) return false
      if ((req.user as { super_admin?: boolean }).super_admin) return true
      return req.user.id === id
    },
    delete: isSuperAdmin,
  },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'avatar_url', type: 'text' },
    {
      name: 'super_admin',
      type: 'checkbox',
      defaultValue: false,
      access: {
        read: isSuperAdminField,
        update: isSuperAdminField,
        create: isSuperAdminField,
      },
      admin: { description: `${PRODUCT_NAME}-wide super admin. Bypasses all SiteUser bindings.` },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Invited', value: 'invited' },
        { label: 'Active', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
    },
    { name: 'last_login_at', type: 'date', admin: { readOnly: true } },
    {
      name: 'siteBindings',
      type: 'array',
      label: 'Site role bindings',
      // Read stays open so getCurrentUser()/site-scoped access helpers can see a
      // user's own bindings, but only a super admin may write them — otherwise a
      // user could PATCH their own record to grant themselves admin on any Site.
      access: {
        create: isSuperAdminField,
        update: isSuperAdminField,
      },
      admin: {
        description: 'Per-Site role assignments. Super admins do not need bindings.',
      },
      fields: [
        { name: 'site', type: 'relationship', relationTo: 'sites', required: true },
        {
          name: 'role',
          type: 'select',
          required: true,
          options: [
            { label: 'Admin', value: 'admin' },
            { label: 'Editor', value: 'editor' },
            { label: 'Analyst', value: 'analyst' },
          ],
        },
        { name: 'invited_at', type: 'date', admin: { readOnly: true } },
        { name: 'accepted_at', type: 'date', admin: { readOnly: true } },
      ],
    },
  ],
}
