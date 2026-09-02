/**
 * The verticals a Site can belong to.
 *
 * PageFlo is vertical agnostic. Until the rebrand the only options here were
 * seven legal practice areas, which made the Site form itself a statement that
 * the product was a legal tool. The legal values are KEPT, because live Sites
 * carry them and they are perfectly good values, and a set of general ones is
 * added alongside.
 *
 * This module is the single source for both the Payload select options and the
 * console's filter and label maps. Two lists of the same enum is how a filter
 * ends up offering a value the collection will reject.
 *
 * Adding a value here requires a migration: `vertical` is a Postgres enum, and
 * `ALTER TYPE ... ADD VALUE` is the only way to widen it. See
 * `src/migrations/20260901_233000_sites_vertical_general.ts`.
 */

export type VerticalGroup = 'General' | 'Legal'

export type Vertical = {
  value: string
  label: string
  group: VerticalGroup
}

/**
 * Order is the order the form and the filter show. General first, because a new
 * operator picking a vertical for a non-legal brand should not have to scroll
 * past seven practice areas to find "Financial services".
 */
export const VERTICALS: Vertical[] = [
  { value: 'multi', label: 'Multi-vertical', group: 'General' },
  { value: 'financial-services', label: 'Financial Services', group: 'General' },
  { value: 'insurance', label: 'Insurance', group: 'General' },
  { value: 'home-services', label: 'Home Services', group: 'General' },
  { value: 'health', label: 'Health & Wellness', group: 'General' },
  { value: 'education', label: 'Education', group: 'General' },
  { value: 'automotive', label: 'Automotive', group: 'General' },
  { value: 'solar-energy', label: 'Solar & Energy', group: 'General' },
  { value: 'b2b', label: 'B2B & SaaS', group: 'General' },
  { value: 'other', label: 'Other', group: 'General' },

  { value: 'mass-tort', label: 'Mass Tort', group: 'Legal' },
  { value: 'mva', label: 'Motor Vehicle Accident', group: 'Legal' },
  { value: 'workers-comp', label: 'Workers Comp', group: 'Legal' },
  { value: 'personal-injury', label: 'Personal Injury', group: 'Legal' },
  { value: 'medical-malpractice', label: 'Medical Malpractice', group: 'Legal' },
  { value: 'class-action', label: 'Class Action', group: 'Legal' },
]

/** The values that existed before the PageFlo rebrand, in their original order. */
export const LEGACY_VERTICAL_VALUES: string[] = [
  'mass-tort',
  'mva',
  'workers-comp',
  'personal-injury',
  'medical-malpractice',
  'class-action',
  'multi',
]

/** Values added by the rebrand. Used by the migration and its rollback. */
export const GENERAL_VERTICAL_VALUES: string[] = VERTICALS.map((v) => v.value).filter(
  (v) => !LEGACY_VERTICAL_VALUES.includes(v),
)

/** Payload `select` options, in display order. */
export const VERTICAL_OPTIONS = VERTICALS.map(({ value, label }) => ({ value, label }))

const LABELS: Record<string, string> = Object.fromEntries(VERTICALS.map((v) => [v.value, v.label]))

/**
 * Human label for a stored value. An unknown value returns itself rather than
 * an empty cell, so a row written by a future migration is still readable.
 */
export const verticalLabel = (value: string | null | undefined): string =>
  value ? (LABELS[value] ?? value) : '—'
