import type { CollectionConfig } from 'payload'
import { isSuperAdmin } from '../access'
import { relationId } from '../lib/authz'
import { auditAfterChange, auditAfterDelete } from '../hooks/audit'
import { cascadeDeleteSiteChildren } from '../hooks/site-cascade'

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'vertical', 'status', 'updatedAt'],
    group: 'LegalOS',
  },
  access: {
    // `b.site` is a POPULATED OBJECT: Users.auth sets no depth, so Payload reads
    // the user at config.defaultDepth (2). Mapping it straight through put an
    // object into the id filter, which the drizzle adapter coerces with
    // Number(...) to NaN, matching nothing. `relationId` is the shared unwrap.
    read: ({ req }) => {
      const user = req.user as { super_admin?: boolean; siteBindings?: Array<{ site: unknown }> } | null
      if (!user) return false
      if (user.super_admin) return true
      const ids = (user.siteBindings ?? []).map((b) => relationId(b.site)).filter((v): v is number => v !== null)
      if (ids.length === 0) return false
      return { id: { in: ids } }
    },
    create: isSuperAdmin,
    update: ({ req, id }) => {
      const user = req.user as { super_admin?: boolean; siteBindings?: Array<{ site: unknown; role: string }> } | null
      if (!user) return false
      if (user.super_admin) return true
      const adminSiteIds = (user.siteBindings ?? [])
        .filter((b) => b.role === 'admin')
        .map((b) => relationId(b.site))
        .filter((v): v is number => v !== null)
      if (!id) return adminSiteIds.length > 0
      // Compared as numbers. `id` arrives as a string on a REST call and as a
      // number from the local API, so `includes` alone missed half the callers
      // even once the binding side was unwrapped.
      return adminSiteIds.includes(Number(id))
    },
    delete: isSuperAdmin,
  },
  hooks: {
    afterChange: [auditAfterChange],
    afterDelete: [auditAfterDelete],
    beforeDelete: [cascadeDeleteSiteChildren],
    beforeChange: [
      async ({ data, originalDoc, operation }) => {
        if (operation !== 'update' || !originalDoc) return data
        const prev = (originalDoc as { slug?: string }).slug
        const next = (data as { slug?: string }).slug
        if (!prev || !next || prev === next) return data
        const redirects = ((data as { slug_redirects?: Array<{ from: string }> }).slug_redirects ??
          (originalDoc as { slug_redirects?: Array<{ from: string }> }).slug_redirects) ?? []
        if (redirects.some((r) => r.from === prev)) return data
        return { ...data, slug_redirects: [...redirects, { from: prev }] }
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'URL-safe slug. Used in admin paths and preview overrides.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      admin: {
        description: 'Draft = not publicly served. Active = live. Paused = public router returns 404. Archived = hidden from listings.',
      },
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'vertical',
      type: 'select',
      required: true,
      defaultValue: 'multi',
      options: [
        { label: 'Mass Tort', value: 'mass-tort' },
        { label: 'Motor Vehicle Accident', value: 'mva' },
        { label: 'Workers Comp', value: 'workers-comp' },
        { label: 'Personal Injury', value: 'personal-injury' },
        { label: 'Medical Malpractice', value: 'medical-malpractice' },
        { label: 'Class Action', value: 'class-action' },
        { label: 'Multi-vertical', value: 'multi' },
      ],
    },
    { name: 'tagline', type: 'text' },
    { name: 'default_phone', type: 'text', admin: { description: 'Display format, e.g. (555) 555-5555' } },
    { name: 'default_phone_tel', type: 'text', admin: { description: 'tel: link format, e.g. +15555555555' } },
    { name: 'org_name', type: 'text' },
    { name: 'org_address', type: 'textarea' },
    { name: 'support_email', type: 'email' },
    {
      name: 'brand',
      type: 'group',
      fields: [
        { name: 'logo_url', type: 'text' },
        { name: 'favicon_url', type: 'text' },
        // --- Brand token contract (src/lib/brand/tokens.ts) -----------------
        // These are the ONLY place a human types a colour. Everything else in
        // the system reads them through resolveBrandTokens and derives the
        // rest. Required: primary, cta, bg, ink. The optional ones are derived
        // when blank rather than defaulted, so leaving one empty is a valid
        // choice and not a hole.
        { name: 'primary', type: 'text', defaultValue: '#0B1F3A' },
        { name: 'primary_ink', type: 'text', admin: { description: 'Blank derives a legible colour for text on primary.' } },
        { name: 'accent', type: 'text', defaultValue: '#E8B14B' },
        { name: 'accent_ink', type: 'text', admin: { description: 'Blank derives a legible colour for text on accent.' } },
        { name: 'cta', type: 'text', admin: { description: 'The button colour. Required, even when it equals primary.' } },
        { name: 'cta_ink', type: 'text', admin: { description: 'Blank derives a legible colour for button text.' } },
        { name: 'bg', type: 'text', admin: { description: 'Page background. Required.' } },
        { name: 'surface', type: 'text', defaultValue: '#F7F5F0', admin: { description: 'Cards and panels. Blank derives from the background.' } },
        { name: 'surface_2', type: 'text', admin: { description: 'Nested panels and inputs. Blank derives from surface.' } },
        { name: 'ink', type: 'text', defaultValue: '#0E1116' },
        { name: 'ink_muted', type: 'text', admin: { description: 'Secondary text. Blank derives a softer contrast.' } },
        { name: 'border', type: 'text', admin: { description: 'Hairlines and dividers. Blank derives from the background.' } },
        { name: 'radius', type: 'text', admin: { description: 'Corner radius in pixels, e.g. 8.' } },
        { name: 'radius_lg', type: 'text', admin: { description: 'Larger radius for cards and modals.' } },
        { name: 'shadow', type: 'text', admin: { description: 'A CSS box-shadow value.' } },
        // Deprecated. `muted` is superseded by `ink_muted`; success / warning /
        // danger are now fixed system colours emitted as --sys-*, identical for
        // every brand, because a status colour that changes per brand teaches
        // people to read colour as decoration. Retained only so existing rows
        // keep their data until a later cleanup drops them.
        { name: 'muted', type: 'text', defaultValue: '#5C6470', admin: { description: 'Deprecated. Use Secondary text.' } },
        { name: 'success', type: 'text', defaultValue: '#1F9D55', admin: { description: 'Deprecated. Status colours are system-wide.' } },
        { name: 'warning', type: 'text', defaultValue: '#E8B14B', admin: { description: 'Deprecated. Status colours are system-wide.' } },
        { name: 'danger', type: 'text', defaultValue: '#C03A2B', admin: { description: 'Deprecated. Status colours are system-wide.' } },
        { name: 'font_heading', type: 'text', defaultValue: 'Inter' },
        { name: 'font_body', type: 'text', defaultValue: 'Inter' },
        { name: 'display_name', type: 'text', admin: { description: 'Brand display name shown across funnels. Defaults to Site name when blank.' } },
        { name: 'short_name', type: 'text', admin: { description: '2-3 letter shortcode like CMC or CAC. Used for initials/logo marks.' } },
        { name: 'logo_url_dark', type: 'text', admin: { description: 'Logo variant for dark backgrounds. Optional.' } },
        { name: 'tagline_brand', type: 'text', admin: { description: 'Brand-level tagline used in funnels. Separate from the top-level Site tagline.' } },
      ],
    },
    {
      name: 'legal',
      type: 'group',
      admin: { description: 'Legal copy surfaced across funnels and footers.' },
      fields: [
        { name: 'copyright', type: 'text', admin: { description: 'e.g. "(c) {year} {brand}". Tokens resolved at render time.' } },
        { name: 'tcpa_text', type: 'textarea' },
        { name: 'privacy_url', type: 'text' },
        { name: 'terms_url', type: 'text' },
        { name: 'default_disclaimer', type: 'textarea' },
      ],
    },
    {
      name: 'typography',
      type: 'group',
      admin: { description: 'Funnel typography used by the public render and builders.' },
      fields: [
        { name: 'headline_font', type: 'text', defaultValue: 'Inter' },
        { name: 'body_font', type: 'text', defaultValue: 'Inter' },
        {
          name: 'base_size',
          type: 'select',
          defaultValue: 'md',
          options: [
            { label: 'Small', value: 'sm' },
            { label: 'Medium', value: 'md' },
            { label: 'Large', value: 'lg' },
          ],
        },
      ],
    },
    {
      name: 'brand_identity',
      type: 'json',
      admin: {
        description:
          'Full brand-identity object consumed by the funnel builder (ported artifact shape). Source of truth for the Brand Identities editor.',
      },
    },
    {
      name: 'default_tone',
      type: 'select',
      defaultValue: 'empathetic',
      options: [
        { label: 'Direct', value: 'direct' },
        { label: 'Empathetic', value: 'empathetic' },
      ],
    },
    { name: 'default_disclaimer_md', type: 'textarea' },
    {
      name: 'slug_redirects',
      type: 'array',
      admin: { description: 'Old slugs that should 301 to current.' },
      fields: [{ name: 'from', type: 'text', required: true }],
    },
    { name: 'archived_at', type: 'date', admin: { readOnly: true } },
  ],
}
