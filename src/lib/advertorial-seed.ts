/**
 * The copy a brand-new advertorial is created with, and the check that keeps it
 * from going live.
 *
 * A new advertorial starts as a skeleton whose text is instructions to the
 * author ("Your compelling headline here", "By [Author] · X min read"). Nothing
 * stopped a deployment of an unedited or half-edited one going live, so
 * production served those instructions to visitors: `[Author]`, `X min read`,
 * `Opening paragraph that sets the scene`. Same class of defect as the
 * `{{site.name}}` and `(800) 000-0000` leaks, and the same rule applies:
 * authoring residue is never a public page.
 *
 * ONE definition of the skeleton and of its markers, here, so the builder that
 * writes it and the go-live gate that refuses it cannot drift apart.
 */

export const ADVERTORIAL_SEED = {
  kicker: 'CATEGORY · TOPIC',
  headline: 'Your compelling headline here',
  bylinePrefix: 'By [Author] · X min read',
  lede: 'Opening paragraph that sets the scene and hooks the reader.',
  paragraph: 'Body paragraph. Use {{brand.displayName}} and other tokens for dynamic content.',
} as const

type SeedSection = { id: string; type: string; content: unknown }

export const advertorialSeedSections = (newId: (prefix: string) => string, dateLabel: string): SeedSection[] => [
  { id: newId('sec'), type: 'kicker', content: ADVERTORIAL_SEED.kicker },
  { id: newId('sec'), type: 'headline', content: ADVERTORIAL_SEED.headline },
  { id: newId('sec'), type: 'byline', content: `${ADVERTORIAL_SEED.bylinePrefix} · ${dateLabel}` },
  { id: newId('sec'), type: 'lede', content: ADVERTORIAL_SEED.lede },
  { id: newId('sec'), type: 'paragraph', content: ADVERTORIAL_SEED.paragraph },
  {
    id: newId('sec'),
    type: 'cta_inline',
    content: { headline: 'See what your case is really worth', subline: 'Free 60-second case review.', buttonText: 'Check My Case', linkType: 'quiz' },
  },
  { id: newId('sec'), type: 'disclaimer', content: { useDefault: true } },
]

/** Fragments that only ever appear because nobody replaced the skeleton. */
const MARKERS = [
  ADVERTORIAL_SEED.kicker,
  ADVERTORIAL_SEED.headline,
  '[Author]',
  'X min read',
  ADVERTORIAL_SEED.lede,
  'Body paragraph. Use {{brand.displayName}}',
] as const

const textOf = (v: unknown): string[] => {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(textOf)
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap(textOf)
  return []
}

/** The skeleton fragments still present in an advertorial's sections. Empty means none. */
export const findPlaceholderCopy = (sections: unknown): string[] => {
  const blob = textOf(sections).join('\n')
  return MARKERS.filter((m) => blob.includes(m))
}
