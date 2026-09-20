export const ADVERTORIAL_TEMPLATE_IDS = [
  'personal_story',
  'news_authority',
  'whistleblower',
  'investigative',
] as const

export type AdvertorialTemplateId = (typeof ADVERTORIAL_TEMPLATE_IDS)[number]

export type AdvertorialChrome = {
  id: AdvertorialTemplateId
  articleMaxWidth: number
  articleFont: string
  headlineFont: string
  pageBackground: string
  kickerTracking: string
}

const CHROME: Record<AdvertorialTemplateId, AdvertorialChrome> = {
  personal_story: {
    id: 'personal_story',
    articleMaxWidth: 680,
    articleFont: '"Source Serif 4", Georgia, serif',
    headlineFont: '"Source Serif 4", Georgia, serif',
    pageBackground: '#fffaf5',
    kickerTracking: '0.18em',
  },
  news_authority: {
    id: 'news_authority',
    articleMaxWidth: 740,
    articleFont: 'Georgia, "Times New Roman", serif',
    headlineFont: 'Georgia, "Times New Roman", serif',
    pageBackground: '#f4f1ea',
    kickerTracking: '0.08em',
  },
  whistleblower: {
    id: 'whistleblower',
    articleMaxWidth: 700,
    articleFont: '"IBM Plex Sans", Inter, sans-serif',
    headlineFont: '"IBM Plex Sans", Inter, sans-serif',
    pageBackground: '#0b1220',
    kickerTracking: '0.22em',
  },
  investigative: {
    id: 'investigative',
    articleMaxWidth: 720,
    articleFont: 'Inter, system-ui, sans-serif',
    headlineFont: 'Inter, system-ui, sans-serif',
    pageBackground: '#f8fafc',
    kickerTracking: '0.12em',
  },
}

export const advertorialChrome = (id: string | null | undefined): AdvertorialChrome =>
  CHROME[(id as AdvertorialTemplateId) in CHROME ? (id as AdvertorialTemplateId) : 'personal_story']
