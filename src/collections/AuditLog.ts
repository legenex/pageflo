import type { CollectionConfig } from 'payload'
import { isSuperAdmin, siteScopedRead } from '../access'

export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['createdAt', 'user', 'action', 'entity_type', 'entity_id', 'site'],
    group: 'LegalOS',
    description: 'Read-only log of admin write actions. Cannot be edited or deleted from the UI.',
  },
  access: {
    read: ({ req }) => {
      const user = req.user as { super_admin?: boolean } | null
      if (!user) return false
      if (user.super_admin) return true
      return siteScopedRead({ req } as Parameters<typeof siteScopedRead>[0])
    },
    create: () => true, // hook-driven, never via UI
    update: () => false,
    delete: isSuperAdmin,
  },
  fields: [
    /*
     * NOT required, deliberately. The FK is ON DELETE SET NULL, so attribution
     * is best-effort by design: an audit row must survive its author's
     * deletion with `user` nulled. `required: true` contradicted that - the
     * NOT NULL it declared made `DELETE FROM users` abort for any user with
     * audit history, i.e. every user who had ever done anything.
     * 20260813_230000_audit_log_user_nullable drops the constraint.
     */
    { name: 'user', type: 'relationship', relationTo: 'users', index: true },
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'entity_type', type: 'text', required: true, index: true },
    { name: 'entity_id', type: 'text', required: true, index: true },
    { name: 'site', type: 'relationship', relationTo: 'sites', index: true },
    { name: 'diff', type: 'json' },
  ],
  timestamps: true,
}
