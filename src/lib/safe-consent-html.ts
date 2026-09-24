/**
 * Consent copy is authored as HTML in several Brands (TCPA with a /tcpa link)
 * and as plain text in others. Visitors must see a working link, never the
 * tags, and never an event handler from that field.
 */
const ALLOWED_HREF = /^(?:\/[\w\-./?#=]*|https:\/\/[^\s"'<>]+)$/i

export const safeConsentHtml = (raw: string): string => {
  if (!raw) return ''
  const stripped = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/javascript:/gi, '')
  const parts: string[] = []
  const re = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped))) {
    parts.push(escapeText(stripped.slice(last, m.index)))
    const hrefMatch = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1])
    const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim()
    const inner = m[2].replace(/<[^>]+>/g, '')
    parts.push(ALLOWED_HREF.test(href) ? `<a href="${escapeAttr(href)}">${escapeText(inner)}</a>` : escapeText(inner))
    last = m.index + m[0].length
  }
  parts.push(escapeText(stripped.slice(last)))
  return parts.join('')
}

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')
