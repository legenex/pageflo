import type { CollectionConfig } from 'payload'
import { isSuperAdmin, anyAuthenticatedRead } from '../access'
import { PRODUCT_NAME } from '../lib/pageflo/product'
import { auditAfterChange } from '../hooks/audit'

export const TEMPLATE_KEYS = [
  'home',
  'privacy',
  'privacy-policy',
  'terms',
  'partners',
  'thanks-dq',
  'submitted',
  'tcpa',
  'disclosures',
] as const

export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export const SharedLegalTemplates: CollectionConfig = {
  slug: 'shared-legal-templates',
  admin: {
    useAsTitle: 'template_key',
    defaultColumns: ['template_key', 'default_meta_title', 'last_reviewed_at'],
    group: PRODUCT_NAME,
    description: 'Shared legal templates. Editing one propagates to every Site that uses it on next render.',
  },
  access: {
    read: anyAuthenticatedRead,
    create: isSuperAdmin,
    update: isSuperAdmin,
    delete: isSuperAdmin,
  },
  hooks: {
    afterChange: [auditAfterChange],
  },
  fields: [
    {
      name: 'template_key',
      type: 'select',
      required: true,
      unique: true,
      options: TEMPLATE_KEYS.map((k) => ({ label: k, value: k })),
    },
    {
      name: 'body_markdown_with_vars',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Markdown body. Supports {{site.name}}, {{site.phone}}, {{site.phone_tel}}, {{site.org_name}}, {{site.org_address}}, {{site.support_email}}, {{site.support_phone}}, {{today}}, {{year}}.',
      },
    },
    { name: 'default_meta_title', type: 'text' },
    { name: 'default_meta_description', type: 'textarea' },
    { name: 'last_reviewed_by', type: 'relationship', relationTo: 'users' },
    { name: 'last_reviewed_at', type: 'date' },
    { name: 'notes', type: 'textarea' },
  ],
}
