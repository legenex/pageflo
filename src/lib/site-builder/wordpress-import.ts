export type ImportedWpPage = {
  title: string
  slug: string
  html: string
  status: 'draft' | 'published'
}

const asSlug = (value: string): string => {
  const clean = value.trim().toLowerCase().replace(/^\/+/, '')
  if (!clean || clean === 'home') return '/'
  return `/${clean.replace(/\/+$/, '')}`
}

export const wordpressRestUrl = (origin: string): string => {
  const url = new URL(origin)
  url.pathname = '/wp-json/wp/v2/pages'
  url.search = 'per_page=50&_embed=0&status=publish'
  return url.toString()
}

export const mapWordpressPages = (payload: unknown): ImportedWpPage[] => {
  if (!Array.isArray(payload)) return []
  const pages: ImportedWpPage[] = []
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const titleRaw = rec.title
    const contentRaw = rec.content
    const title =
      typeof titleRaw === 'object' && titleRaw && 'rendered' in titleRaw
        ? String((titleRaw as { rendered: unknown }).rendered ?? '')
        : typeof rec.title === 'string'
          ? rec.title
          : ''
    const html =
      typeof contentRaw === 'object' && contentRaw && 'rendered' in contentRaw
        ? String((contentRaw as { rendered: unknown }).rendered ?? '')
        : typeof rec.content === 'string'
          ? rec.content
          : ''
    const slug = typeof rec.slug === 'string' ? rec.slug : ''
    if (!title.trim() || !html.trim()) continue
    pages.push({
      title: title.replace(/<[^>]+>/g, '').trim(),
      slug: asSlug(slug || title),
      html,
      status: 'draft',
    })
  }
  return pages
}
