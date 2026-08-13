// @ts-nocheck
'use client'

/**
 * Render one of the twelve ported landing-page templates.
 *
 * The markup is the handoff's, carried over rather than rebuilt, so what this
 * component does is small on purpose: set the brand's colours as CSS variables
 * on a wrapper, load the faces the references are set in, and mount the markup.
 *
 * Every colour in that markup is `var(--lp-nNNN, #originalhex)`. So if the
 * variables were not set at all it would render as the reference did, which is
 * what makes pixel parity checkable rather than asserted - and it also means a
 * brand that supplies nothing degrades to the design rather than to nothing.
 *
 * The markup is a fixed asset of this build, not user input: it is generated
 * from the handoff by a committed script and cannot be edited from the admin,
 * so there is no untrusted string reaching dangerouslySetInnerHTML here. That
 * stops being true the moment any part of it becomes operator-editable, which
 * is the next piece of work and will need the copy to travel as nodes rather
 * than as HTML.
 */

import { useMemo } from 'react'
import { TEMPLATE_FONTS_HREF } from '@/lib/lp-templates'
import { templateStyle } from '@/lib/lp-templates/tokens'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { resolveLpPalette } from '@/lib/lp-nodes/palette'
import { getLpIdentity } from '@/lib/lp-identities'

/**
 * The ported markup for a stored id, or null.
 *
 * Goes through the registry rather than indexing `PORTED_BY_SLUG`, so an alias
 * such as `bold_modern` reaches its markup here exactly as it does everywhere
 * else. `.template` is null for a legacy identity template, which has no ported
 * markup to mount — returning null there is correct and the caller draws
 * nothing rather than the wrong page.
 */
const portedFor = (slug, context) => {
  const res = reportTemplateFallback(context, resolveForRender('lp', slug))
  return res.template.kind === 'lp' ? res.template.template : null
}

export const PortedTemplateView = ({ slug, brand, className = '' }) => {
  const template = useMemo(() => portedFor(slug, 'ported template view'), [slug])

  // The identity is only a fallback source of colour for a brand that has set
  // none; the ported markup supplies its own reference values regardless.
  const palette = useMemo(() => resolveLpPalette(getLpIdentity('a'), brand), [brand])
  const style = useMemo(() => (template ? templateStyle(template, palette) : {}), [template, palette])

  if (!template) return null

  return (
    <div className={`lp-ported ${className}`} style={style}>
      <link rel="stylesheet" href={TEMPLATE_FONTS_HREF} />
      <div dangerouslySetInnerHTML={{ __html: template.html }} />
    </div>
  )
}

/**
 * A ported template as a complete, standalone HTML document.
 *
 * For thumbnails. Three attempts to contain a scaled render with CSS - overflow
 * on a sized box, absolute positioning, then clip-path - all measured correct
 * and all painted straight through the card anyway. An iframe cannot do that:
 * isolation is structural rather than a property the content might defeat.
 *
 * It also means a template's markup cannot reach the admin's own styles, or be
 * reached by them, which is worth having regardless of the clipping.
 */
export const portedTemplateDocument = (slug, brand) => {
  const template = portedFor(slug, 'ported template thumbnail')
  if (!template) return ''
  const palette = resolveLpPalette(getLpIdentity('a'), brand)
  const vars = Object.entries(templateStyle(template, palette))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${TEMPLATE_FONTS_HREF}">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}body{${vars}}</style>
</head><body>${template.html}</body></html>`
}
