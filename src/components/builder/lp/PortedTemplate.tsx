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
 * TWO UNTRUSTED STRINGS REACH THIS SINK, and both are handled at their source
 * rather than here. The markup itself is a build asset — generated from the
 * handoff by a committed script, not editable from the admin — but since the
 * slot contract landed, two tenant-controlled values are spliced into it:
 *
 *  - a DEPLOYMENT OVERRIDE, escaped by `composeTemplate`, which is why an
 *    override can put text on the page and not an element; and
 *  - a BRAND VALUE, escaped by `resolveTokensForHtml`. That one was missed at
 *    first and it was the more dangerous of the two: this component also
 *    renders in `/admin` unsandboxed, so a Site admin's display name executing
 *    as script would run in a super-admin's origin.
 *
 * Neither escape lives in this file on purpose. A sink that trusts its inputs
 * and a caller that sanitises is a pair that drifts; escaping where the value
 * enters means a new caller cannot forget.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TEMPLATE_FONTS_HREF, asSlotted } from '@/lib/lp-templates'
import { templateStyle } from '@/lib/lp-templates/tokens'
import { composeTemplate, composeTemplateWithQuizMount, QUIZ_MOUNT_ATTR } from '@/lib/lp-slots/model'
import { resolveTokensForHtml } from './tokens'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { resolveLpPalette } from '@/lib/lp-nodes/palette'
import { getLpIdentity } from '@/lib/lp-identities'
import { QuizRuntime } from '@/components/public/quiz/QuizRuntime'
import { resolveCssColor } from '@/lib/lp-templates/resolve-css-color'

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

/**
 * The markup to mount, for one template under one brand with one set of
 * deployment overrides.
 *
 * Two steps, in this order and only this order:
 *
 *  1. COMPOSE. Slot defaults, or the deployment's overrides where it has them.
 *     Overrides are escaped by the composer, so operator copy cannot introduce
 *     an element.
 *  2. RESOLVE TOKENS. `{{brand.callNumber}}` and friends, against the brand the
 *     page is deployed under. AFTER composition on purpose, so a token works in
 *     an override exactly as it works in a default — an operator writing
 *     "Call {{brand.callNumber}}" gets the same substitution the reference does.
 *
 * Step 2 did not exist. `PortedTemplateView` mounted `template.html` raw, so
 * even once the zero-width spaces were removed no ported page would have
 * resolved a single brand token. The two halves of that defect are independent
 * and both had to be fixed for one placeholder to work.
 */
/**
 * The brand's artwork, in the shape an image well needs.
 *
 * This is the Brand Identity asset contract reaching the templates. A brand
 * supplies its mark ONCE and every logo well in every template has it; a brand
 * with no mark falls back to its own name; a well asking for a photograph and
 * given nothing disappears. The one thing that can no longer happen is the
 * reference's `[LOGO SLOT]` label reaching a visitor, which is what was measured
 * on a live public landing page.
 */
const brandAssets = (brand, vars) => {
  const str = (v) => (typeof v === 'string' ? v.trim() : '')
  return {
    logoUrl: str(brand?.logoUrl),
    logoUrlDark: str(brand?.logoUrlDark),
    wordmark: str(brand?.displayName) || str(brand?.name) || str(brand?.shortName),
    vars,
  }
}

const useComposed = (template, brand, overrides, vars) =>
  useMemo(() => {
    if (!template) return { html: '', htmlWithMount: '', refused: [], unknownOverrides: [], mountedSlotIds: [] }
    const composed = composeTemplateWithQuizMount(asSlotted(template), overrides ?? {}, {
      assets: brandAssets(brand, vars),
    })
    return {
      ...composed,
      html: resolveTokensForHtml(composed.html, { brand }),
      htmlWithMount: resolveTokensForHtml(composed.htmlWithMount, { brand }),
    }
  }, [template, brand, overrides, vars])

/**
 * The live quiz, portalled into the card the reference drew.
 *
 * WHY A PORTAL. The composed page is one HTML string mounted with
 * `dangerouslySetInnerHTML`, because the quiz card is nested several elements
 * deep: splitting the string at the card and setting each half as the innerHTML
 * of a separate node would have the parser close and reopen every open element
 * at the seam, and the page would come out with a different tree from the
 * reference. Mounting the page WHOLE and moving the runtime into the marked box
 * keeps the DOM the design's by construction rather than by care.
 *
 * `useLayoutEffect` rather than `useEffect` so the box is filled in the same
 * commit the page is mounted in, before the browser paints. With `useEffect` the
 * visitor gets one painted frame of an empty card.
 *
 * The trade this makes, stated rather than hidden: the quiz's first question is
 * not in the server-rendered HTML the way it is on a standalone quiz page. It
 * costs nothing a visitor can use — a quiz with no JavaScript is a picture
 * either way, which is exactly the defect this replaces — and it costs no
 * layout, because the box is the reference's own tag with its own padding,
 * border and width.
 */
const QuizMount = ({ host, quiz, quizCtx, brand, surface, htmlKey }) => {
  const [node, setNode] = useState(null)

  useLayoutEffect(() => {
    setNode(host.current ? host.current.querySelector(`[${QUIZ_MOUNT_ATTR}]`) : null)
  }, [host, htmlKey])

  if (!node || !quiz) return null

  return createPortal(
    <QuizRuntime
      quiz={quiz}
      // The quiz belongs to its own brand — its number, its destinations, its
      // legal text — and is READ against the landing page's card. Those are two
      // different questions and conflating them is how a dark-brand quiz ends up
      // unreadable inside a light page.
      brand={quizCtx?.brand ?? brand}
      deployment={quizCtx?.deployment ?? null}
      site={quizCtx?.site ?? null}
      inline
      surfaceColor={surface}
      // Defaults to preview when no context declares otherwise, so a caller that
      // forgets to say it is live gets the safe behaviour: no lead written, no
      // redirect followed.
      previewMode={quizCtx ? quizCtx.preview !== false : true}
    />,
    node,
  )
}

export const PortedTemplateView = ({
  slug,
  brand,
  overrides = null,
  className = '',
  onDiagnostics = null,
  quiz = null,
  quizCtx = null,
}) => {
  const template = useMemo(() => portedFor(slug, 'ported template view'), [slug])

  // The identity is only a fallback source of colour for a brand that has set
  // none; the ported markup supplies its own reference values regardless.
  const palette = useMemo(() => resolveLpPalette(getLpIdentity('a'), brand), [brand])
  const style = useMemo(() => (template ? templateStyle(template, palette) : {}), [template, palette])
  const composed = useComposed(template, brand, overrides, style)
  const host = useRef(null)

  /*
   * The opaque colour the quiz card will actually paint as, under this brand.
   *
   * Resolved through the same variables the wrapper sets, so it is the colour
   * the visitor sees rather than the colour the reference was drawn in. Falling
   * back to the page surface when a template declares nothing resolvable is the
   * conservative answer: the runtime then derives against a colour it can
   * verify instead of against an empty string, which it would read as "no host"
   * and answer with its own page palette.
   */
  const surface = useMemo(() => {
    if (!template) return null
    return resolveCssColor(template.quizMount?.surface, style) ?? palette.surface ?? null
  }, [template, style, palette])

  useEffect(() => {
    // An override that named no slot, or that was refused, is the operator's
    // copy silently not appearing. The builder surfaces it; the public render
    // passes no handler and the composer's refusal is the only effect.
    if (!onDiagnostics) return
    if (composed.unknownOverrides.length === 0 && composed.refused.length === 0) return
    onDiagnostics({ unknown: composed.unknownOverrides, refused: composed.refused })
  }, [composed, onDiagnostics])

  if (!template) return null

  return (
    <div className={`lp-ported ${className}`} style={style}>
      <link rel="stylesheet" href={TEMPLATE_FONTS_HREF} />
      <div ref={host} dangerouslySetInnerHTML={{ __html: composed.htmlWithMount }} />
      <QuizMount
        host={host}
        quiz={quiz}
        quizCtx={quizCtx}
        brand={brand}
        surface={surface}
        htmlKey={composed.htmlWithMount}
      />
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
export const portedTemplateDocument = (slug, brand, overrides = null) => {
  const template = portedFor(slug, 'ported template thumbnail')
  if (!template) return ''
  const palette = resolveLpPalette(getLpIdentity('a'), brand)
  const vars = Object.entries(templateStyle(template, palette))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  // Same two steps as the mounted view, through the same functions. A thumbnail
  // that composed differently from the page would be a preview of a page that
  // does not exist, which is the whole reason there is one composition path.
  const composed = composeTemplate(asSlotted(template), overrides ?? {}, {
    assets: brandAssets(brand, templateStyle(template, palette)),
  })
  const html = resolveTokensForHtml(composed.html, { brand })
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${TEMPLATE_FONTS_HREF}">
<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0}body{${vars}}</style>
</head><body>${html}</body></html>`
}
