// @ts-nocheck -- the seam between the ported builder (untyped props) and the
// typed node renderers under nodes/. Everything it delegates to is checked.
'use client'

/**
 * The landing-page renderer.
 *
 * One component serves the builder and the public page, which is deliberate: a
 * separate public renderer is how a page ends up looking one way to the person
 * designing it and another way to a visitor. `editable` is the only difference.
 * When it is false no click handler is attached, no hover affordance is drawn,
 * and unfilled nodes are dropped rather than shown as placeholders.
 *
 * Everything about HOW a page draws now lives in `nodes/`. This file is the
 * seam: it resolves the template, normalises whatever shape the sections are
 * stored in, substitutes brand tokens, and hands each section to the node
 * renderer. It carries no section renderers of its own any more - there were
 * thirteen, one per subject, and they were the reason four templates could
 * differ only in colour.
 */

import { fillAll as fillAllTokens, resolveTokens } from './tokens'
import { LP_IDENTITIES, IDENTITY_FONTS_HREF, getLpIdentity } from '@/lib/lp-identities'
import { toNodeSections } from '@/lib/lp-nodes/from-legacy'
import { isVisible, TONES } from '@/lib/lp-nodes/model'
import { deriveSurface, groundFor, lookOf } from '@/lib/lp-nodes/surface'
import { resolveLpPalette } from '@/lib/lp-nodes/palette'
import { skeletonFor } from '@/lib/lp-skeletons'
import { PORTED_TEMPLATES, isPortedTemplate } from '@/lib/lp-templates'
import { resolveForRender, reportTemplateFallback } from '@/lib/template-registry'
import { PortedTemplateView } from './PortedTemplate'
import { SectionNode } from './nodes/SectionNode'
import { T } from '../ui'

export { resolveTokens }
export const fillPlaceholders = (str, brand) => resolveTokens(str, { brand })
export const fillAll = fillAllTokens

// Section default copy + helpers live in a server-safe module so the seed
// script can share them. They now describe LEGACY sections, which the converter
// in lp-nodes/from-legacy turns into nodes on read.
export { SEED_SECTION_COPY, DEFAULT_SECTION_ORDER, buildSeedSections } from './section-copy'

/** Kept under its old name because the section editor still imports it. */
export const SECTION_TONES = TONES

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * A template is a look and a structure. The brand is the colour.
 *
 * The look is the faces, the display weight and tracking, the radii, the border
 * weight, the eyebrow treatment and the geometry of the mark. The structure is
 * which sections exist, what is in them and which of them are dark. Neither is
 * a hue: a page deployed under a teal-and-gold brand renders teal and gold in
 * whichever of the four shapes it was built in.
 *
 * The identity's own palette is the fallback, which is what a brandless preview
 * and the gallery fall back to, and what stops a brand that has only set a
 * primary from rendering as grey.
 */
const ANGLE_FOR_POSITION = { adversary: 'pain', clarity: 'community', authority: 'authority', direct: 'urgency' }

export const TEMPLATES = [
  // The twelve ported from the handoff. These are what a page renders as, and
  // they are pixel ports rather than reconstructions.
  ...PORTED_TEMPLATES.map((t) => ({
    id: t.slug,
    name: t.name,
    code: t.code,
    family: t.family,
    ported: true,
    identity: getLpIdentity('a'),
    skeleton: null,
    structure: t.blurb,
    angleDefault: 'pain',
    blurb: t.blurb,
    channels: t.channels,
    quizPlacement: t.quiz,
    ground: t.ground,
    hookExample: t.blurb,
  })),
  // The four earlier identity templates. Kept resolvable so pages already
  // assigned to one keep rendering, and kept out of the gallery because they
  // are the thing the twelve replace.
  ...LP_IDENTITIES.map((identity) => {
    const skeleton = skeletonFor(identity.id)
    return {
      id: identity.id,
      name: identity.name,
      identity,
      ported: false,
      legacy: true,
      skeleton,
      structure: skeleton ? skeleton.summary : null,
      angleDefault: ANGLE_FOR_POSITION[identity.position] || 'pain',
      blurb: `${identity.position} - ${identity.tagline}`,
      hookExample: identity.tagline,
    }
  }),
]

/** What the gallery offers: the twelve ports. */
export const GALLERY_TEMPLATES = TEMPLATES.filter((t) => t.ported)

/**
 * Templates the AI wizard can build into.
 *
 * The wizard instantiates a SKELETON and writes copy into its nodes, so it can
 * only use a template that has one. The twelve ports do not: their copy lives
 * in the ported markup rather than in nodes, which is exactly the gap that
 * makes them un-editable today. Filtering here rather than showing twelve
 * disabled cards keeps the wizard honest about what it can actually do.
 */
export const SKELETON_TEMPLATES = TEMPLATES.filter((t) => t.skeleton)

/**
 * The builder's template record for a stored id.
 *
 * The lookup used to be `find(...) || TEMPLATES[0]`, which answered every id —
 * including `'bold_modern'`, the stored default on every row, which names no
 * template — with `editorial_investigation_v2` and no word about it. Resolution
 * is now the registry's: it canonicalises aliases, and when it does fall back it
 * says so in the server log rather than in how the page looks.
 *
 * `TEMPLATES` stays the builder's own enriched record (identity, skeleton,
 * angle default). What it is no longer allowed to do is decide which id is
 * valid, because the save path, the public renderer and this file disagreeing
 * about that is the whole failure mode.
 */
export const templateFor = (templateId) => {
  const res = reportTemplateFallback('lp builder', resolveForRender('lp', templateId))
  return TEMPLATES.find((t) => t.id === res.template.id) || TEMPLATES[0]
}

/**
 * The colours a template produces UNDER A GIVEN BRAND, for gallery swatches.
 *
 * The brand is a parameter rather than an omission. A gallery that showed each
 * template in its own palette would be advertising a colour the page will not
 * render in, which is the same lie as a preview that does not match the page.
 * What distinguishes the four on screen is their type, their shapes and their
 * structure, and that is the honest answer.
 */
export const templatePreviewSurface = (template, brand) => {
  const palette = resolveLpPalette(template.identity, brand)
  return deriveSurface(groundFor('default', palette), palette)
}

export const templatePalette = (template, brand) => resolveLpPalette(template.identity, brand)

export const templateLook = (template) => lookOf(template.identity)

export const ANGLES = [
  { id: 'pain', label: 'Pain First', desc: 'Acknowledge what happened. Lean into emotion and consequences.' },
  { id: 'authority', label: 'Authority', desc: 'Lead with credentials, network size, settlement track record.' },
  { id: 'urgency', label: 'Urgency', desc: 'Statute of limitations. Time is running out. Act now.' },
  { id: 'community', label: 'Community', desc: 'You are not alone. Many people in your situation got help.' },
]

export const PREVIEW_BRAND_DEFAULT = {
  id: 'preview',
  name: 'Preview',
  displayName: 'Your Brand',
  shortName: 'YB',
  tagline: '',
  primaryDomain: '',
  logoUrl: '',
  logoUrlDark: '',
  faviconUrl: '',
  // Deliberately colourless. "No brand" means the template identity shows
  // through; inventing a slate palette here would make the brandless preview
  // the one place in the product that renders in a colour nobody chose.
  colors: {},
  typography: { headlineFont: 'Inter', bodyFont: 'Inter', baseSize: 'md' },
  contact: { callNumber: '', callCtaText: 'CLICK HERE TO CALL', callCtaStyle: 'pill' },
  legal: { copyright: '(c) 2026 Your Brand', tcpaText: '', privacyUrl: '', termsUrl: '', defaultDisclaimer: 'Brand disclaimer goes here.' },
}

// ============================================================================
// LIVE PREVIEW
// ============================================================================

export const LivePreview = ({
  landingPage,
  brand,
  quizDepLabel,
  quiz,
  editable = true,
  quizCtx = null,
  selectedId = null,
  onSelectNode,
}: {
  landingPage: { templateId?: string; sections?: unknown }
  brand?: unknown
  quizDepLabel?: string
  quiz?: unknown
  /** False on a public page: no handlers, no affordances, no placeholders. */
  editable?: boolean
  quizCtx?: unknown
  selectedId?: string | null
  onSelectNode?: (nodeId: string) => void
}) => {
  // One resolution for the whole render. The branch below used to test the RAW
  // stored id with `isPortedTemplate`, so `'bold_modern'` — which is the stored
  // default and resolves to a ported template — took the node branch instead,
  // asked `getLpIdentity('bold_modern')` for an identity it does not have, and
  // drew the wrong page under the right name.
  const resolved = reportTemplateFallback('lp render', resolveForRender('lp', landingPage.templateId))
  const templateId = resolved.template.id
  const template = templateFor(templateId)
  const identity = template.identity || getLpIdentity(templateId)
  const previewBrand = brand || PREVIEW_BRAND_DEFAULT

  // A ported template renders the handoff's own markup. Its copy is not yet
  // node-backed, so the element tree and the click-to-edit affordances are not
  // offered for one - showing them would advertise an edit that does nothing.
  if (isPortedTemplate(templateId)) {
    return (
      <div
        className={editable ? 'lp-preview-root' : 'lp-preview-root lp-public-root'}
        style={editable
          ? { borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px -12px rgba(0,0,0,0.4)', border: `1px solid ${T.border}` }
          : { minHeight: '100vh' }}
      >
        <PortedTemplateView slug={templateId} brand={previewBrand} />
      </div>
    )
  }

  // Whatever shape the page is stored in comes out as nodes. Pages written
  // before the node model exist in the database and are converted on every
  // read rather than rewritten, so one that nobody opens keeps working.
  const sections = toNodeSections(landingPage.sections).filter(isVisible)

  // Colour from the brand, shape from the template. Resolved once per render so
  // every section derives against the same set rather than each working it out.
  const palette = resolveLpPalette(identity, previewBrand)
  const pageSurface = deriveSurface(groundFor('default', palette), palette)
  const look = lookOf(identity)

  const frame = editable
    ? { borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px -12px rgba(0,0,0,0.4)', border: `1px solid ${T.border}` }
    : { minHeight: '100vh' }

  return (
    <div
      className={editable ? 'lp-preview-root' : 'lp-preview-root lp-public-root'}
      style={{
        backgroundColor: pageSurface.bg,
        color: pageSurface.text,
        fontFamily: look.body,
        // Named so the rules below can target this container explicitly rather
        // than whichever ancestor happens to be nearest.
        containerType: 'inline-size',
        containerName: 'lp',
        ...frame,
      }}
    >
      {/* The identities specify their own faces, and substituting a fallback
          would change what separates them. React hoists this into the head. */}
      <link rel="stylesheet" href={IDENTITY_FONTS_HREF} />

      {sections.map((section) => (
        <SectionNode
          key={section.id}
          section={
            // Brand tokens are substituted here rather than inside the node
            // renderers, so `{{brand.callNumber}}` resolves wherever it was
            // typed without every leaf having to remember to resolve it.
            fillAllTokens(section, previewBrand)
          }
          palette={palette}
          identity={identity}
          brand={previewBrand}
          editable={editable}
          selectedId={selectedId}
          onSelect={editable ? onSelectNode : undefined}
          quiz={quiz}
          quizCtx={quizCtx}
          quizDepLabel={quizDepLabel}
        />
      ))}

      <style>{`
        .lp-preview-root section:hover > .lp-section-overlay { opacity: 1 !important; }
        .lp-preview-root .lp-node:hover { outline-color: ${pageSurface.line} !important; }
        /* The public render must not offer an affordance the visitor cannot use. */
        .lp-public-root .lp-section-overlay { display: none !important; }
        .lp-public-root section { cursor: default !important; }

        /* Container queries, not viewport ones. The builder shows the page in a
           pane roughly a third of the window wide, so a viewport media query is
           answering the wrong question: it reports a desktop and the page keeps
           a two-column hero and three-across stats inside 600 pixels, which
           collide. Asking the CONTAINER means the preview and the live page
           behave the same at the same content width, which is the only way a
           preview can be trusted. */
        @container lp (max-width: 900px) {
          .lp-split { grid-template-columns: 1fr !important; gap: 30px !important; }
          section { padding-left: 26px !important; padding-right: 26px !important; }
          h1 { font-size: clamp(30px, 5.2cqw, 46px) !important; line-height: 1.12 !important; }
        }
        @container lp (max-width: 660px) {
          section {
            padding-top: 44px !important; padding-bottom: 44px !important;
            padding-left: 18px !important; padding-right: 18px !important;
          }
          h1 { font-size: clamp(26px, 7cqw, 36px) !important; }
          h2 { font-size: clamp(21px, 5.6cqw, 30px) !important; line-height: 1.22 !important; }
          h3 { font-size: clamp(16px, 4.4cqw, 20px) !important; }
          [style*="grid-template-columns"] { grid-template-columns: 1fr !important; gap: 16px !important; }
          a[href^="tel:"], button, a[href="#lp-form"] { min-height: 48px; }
        }
      `}</style>
    </div>
  )
}
