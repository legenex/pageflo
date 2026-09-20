export const ADVERTORIAL_TEMPLATE_IDS = [
  'personal_story',
  'news_authority',
  'whistleblower',
  'investigative',
] as const

export type AdvertorialTemplateId = (typeof ADVERTORIAL_TEMPLATE_IDS)[number]

export type AdvertorialHeaderVariant = 'story-bar' | 'masthead' | 'classified' | 'dossier'
export type AdvertorialFooterVariant = 'simple' | 'broadsheet' | 'dark-leak' | 'source-notes'

export type AdvertorialChrome = {
  id: AdvertorialTemplateId
  articleMaxWidth: number
  articleFont: string
  headlineFont: string
  pageBackground: string
  kickerTracking: string
  headerVariant: AdvertorialHeaderVariant
  footerVariant: AdvertorialFooterVariant
  articleSurface: string
  ink: string
  muted: string
  headerBg: string
  headerInk: string
  footerBg: string
  footerInk: string
  ruleColor: string
}

const CHROME: Record<AdvertorialTemplateId, AdvertorialChrome> = {
  personal_story: {
    id: 'personal_story',
    articleMaxWidth: 680,
    articleFont: '"Source Serif 4", Georgia, serif',
    headlineFont: '"Source Serif 4", Georgia, serif',
    pageBackground: '#fffaf5',
    kickerTracking: '0.18em',
    headerVariant: 'story-bar',
    footerVariant: 'simple',
    articleSurface: '#fffdf9',
    ink: '#1c1917',
    muted: '#78716c',
    headerBg: '#fffaf5',
    headerInk: '#1c1917',
    footerBg: '#1c1917',
    footerInk: 'rgba(255,255,255,0.62)',
    ruleColor: '#e7e0d6',
  },
  news_authority: {
    id: 'news_authority',
    articleMaxWidth: 740,
    articleFont: 'Georgia, "Times New Roman", serif',
    headlineFont: 'Georgia, "Times New Roman", serif',
    pageBackground: '#f4f1ea',
    kickerTracking: '0.08em',
    headerVariant: 'masthead',
    footerVariant: 'broadsheet',
    articleSurface: '#fbfaf4',
    ink: '#111827',
    muted: '#4b5563',
    headerBg: '#f4f1ea',
    headerInk: '#111827',
    footerBg: '#f4f1ea',
    footerInk: '#374151',
    ruleColor: '#111827',
  },
  whistleblower: {
    id: 'whistleblower',
    articleMaxWidth: 700,
    articleFont: '"IBM Plex Sans", Inter, sans-serif',
    headlineFont: '"IBM Plex Sans", Inter, sans-serif',
    pageBackground: '#0b1220',
    kickerTracking: '0.22em',
    headerVariant: 'classified',
    footerVariant: 'dark-leak',
    articleSurface: '#111827',
    ink: '#e5e7eb',
    muted: '#9ca3af',
    headerBg: '#020617',
    headerInk: '#f8fafc',
    footerBg: '#020617',
    footerInk: 'rgba(226,232,240,0.7)',
    ruleColor: '#334155',
  },
  investigative: {
    id: 'investigative',
    articleMaxWidth: 720,
    articleFont: 'Inter, system-ui, sans-serif',
    headlineFont: 'Inter, system-ui, sans-serif',
    pageBackground: '#f8fafc',
    kickerTracking: '0.12em',
    headerVariant: 'dossier',
    footerVariant: 'source-notes',
    articleSurface: '#ffffff',
    ink: '#0f172a',
    muted: '#64748b',
    headerBg: '#0f172a',
    headerInk: '#f8fafc',
    footerBg: '#eef2f7',
    footerInk: '#334155',
    ruleColor: '#cbd5e1',
  },
}

export const advertorialChrome = (id: string | null | undefined): AdvertorialChrome =>
  CHROME[(id as AdvertorialTemplateId) in CHROME ? (id as AdvertorialTemplateId) : 'personal_story']

/** Compact fingerprint used by the fidelity harness. One unique string per template. */
export const advertorialStructureKey = (id: AdvertorialTemplateId): string => {
  const c = CHROME[id]
  return [c.headerVariant, c.footerVariant, c.articleMaxWidth, c.pageBackground, c.articleFont].join('|')
}
