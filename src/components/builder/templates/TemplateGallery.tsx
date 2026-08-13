// @ts-nocheck -- mounted by two ported builder apps whose props are untyped.
// The record and slot modules it reads are fully typed and checked.
'use client'

/**
 * The one template gallery. Both libraries, both deployment editors, one file.
 *
 * It replaces `TemplateLibrary`, which was browse-only by construction — both
 * apps mounted it with no `onUse`, so the twelve landing-page templates and
 * twenty quiz templates could be looked at and never chosen. The actual choice
 * happened somewhere else: a dropdown of landing-page ROWS on one side, a grid
 * buried in a `Render & Embed` tab on the other. Two presentations of one
 * decision, and the one an operator could act on was the wrong one.
 *
 * Four rules this component exists to hold:
 *
 *  1. IT SHOWS RECORDS, NOT THE CODE REGISTRY. `TemplateLibrary` read
 *     `listLpTemplates()` / `listQuizTemplates()` directly, which is why its
 *     count was a constant and why nothing on it could be disabled or deleted.
 *     Everything here arrives as rows from `src/lib/template-records/`. That is
 *     what makes this gallery and the Templates tab the same library rather
 *     than two views that can disagree.
 *
 *  2. EVERY PREVIEW IS A REAL RENDER, through the primitives the public page
 *     uses: `TemplatePreview` runs the actual progress and answer forms, and a
 *     landing page is `composeTemplate` + `resolveTokens` inside
 *     `portedTemplateDocument` — the exact call the public renderer makes.
 *     A gallery backed by screenshots goes stale first for the templates nobody
 *     has looked at recently, which are precisely the ones somebody is browsing
 *     to find.
 *
 *  3. EXACTLY TWO ACTIONS PER CARD: Preview and Select. Anything else on a card
 *     is a decision competing with the one the operator came here to make.
 *
 *  4. NEUTRAL BY DEFAULT, BRANDED ON REQUEST, THROUGH THE SAME TOKEN PATH.
 *     Neutral answers "what is this template" with no brand noise; branded
 *     answers "what will this look like for this client". The branded render
 *     goes through `resolveLpPalette` / `quizTheme` — the public renderer's own
 *     token resolution — rather than an admin-only approximation, so a gallery
 *     preview cannot flatter a combination the live page would not produce.
 */

import { useMemo, useState } from 'react'

import { TemplatePreview } from '@/components/builder/quiz/TemplatePreview'
import { portedTemplateDocument } from '@/components/builder/lp/PortedTemplate'
import { PREVIEW_BRAND_DEFAULT } from '@/components/builder/lp/render'
import { resolveTemplate } from '@/lib/template-registry'
import { T, Pill, Btn, Select, Label } from '@/components/builder/ui'

/* ------------------------------------------------------------------ helpers */

/**
 * Why this template cannot be picked right now, in the operator's words.
 *
 * Mirrors `selectabilityProblem` in src/lib/template-records/model.ts. A card is
 * shown either way: a gallery that silently omits a template is
 * indistinguishable from one that never had it, and the person looking for the
 * template they used last week deserves the reason.
 */
const blockedReason = (t) => {
  if (t.rendererError) return `broken: ${t.rendererError}`
  if (t.archivedAt) return 'deleted'
  if (!t.isEnabled) return 'disabled'
  return null
}

const brandFor = (brands, brandId) =>
  !brandId || brandId === '__neutral__'
    ? PREVIEW_BRAND_DEFAULT
    : brands.find((b) => b.id === brandId) ?? PREVIEW_BRAND_DEFAULT

/* ----------------------------------------------------------------- previews */

/**
 * A landing-page template, rendered small.
 *
 * An iframe, contained THREE ways rather than one. The history is why: four
 * earlier containment attempts (overflow on a sized box, absolute positioning,
 * clip-path, and an iframe with overflow alone) each measured correct and each
 * painted over the card underneath, so the gallery shipped with no picture.
 *
 *  - `overflow: hidden` clips the box.
 *  - `contain: paint` makes it a containing block AND a paint containment
 *    boundary, so a descendant cannot escape even if it establishes its own
 *    stacking or positioning context. This is the one the earlier attempts
 *    missed: `overflow` alone does not stop a fixed or transformed descendant.
 *  - `isolation: isolate` gives it its own stacking context.
 *
 * `sandbox` with no `allow-scripts`: the markup is a build asset, but a document
 * that cannot run script cannot reach out of the frame however it later changes.
 */
const LpThumb = ({ slug, brand, overrides, height = 190, frameWidth = 1280 }) => {
  const doc = useMemo(
    () => portedTemplateDocument(slug, brand, overrides ?? {}),
    [slug, brand, overrides],
  )
  // The references are drawn at desktop width. Rendering at that width and
  // scaling down shows the template's real layout; letting the frame be
  // card-width would show its MOBILE layout and call it a desktop preview.
  const FRAME_H = Math.round(frameWidth * 1.25)
  const [w, setW] = useState(560)
  const scale = w / frameWidth

  if (!doc) {
    return (
      <div style={{ ...thumbBox(height), display: 'grid', placeItems: 'center', color: T.textLow, fontSize: 11 }}>
        no preview for this renderer
      </div>
    )
  }

  return (
    <div
      ref={(el) => { if (el && el.clientWidth && el.clientWidth !== w) setW(el.clientWidth) }}
      aria-hidden="true"
      style={thumbBox(height)}
    >
      <iframe
        title=""
        tabIndex={-1}
        sandbox=""
        srcDoc={doc}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: frameWidth,
          height: FRAME_H,
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

const thumbBox = (height) => ({
  position: 'relative',
  overflow: 'hidden',
  contain: 'paint',
  isolation: 'isolate',
  height,
  width: '100%',
  flexShrink: 0,
  backgroundColor: T.bg,
  borderBottom: `1px solid ${T.border}`,
})

/**
 * The full-size preview, at a real device width.
 *
 * Desktop and mobile are both offered because the twelve are responsive designs
 * and half the traffic is phones; a gallery that only showed one would be
 * hiding the half somebody is buying media for.
 */
const PreviewModal = ({ template, kind, brand, onClose }) => {
  const [device, setDevice] = useState('desktop')
  const width = device === 'desktop' ? 1280 : 390

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${template.name}`}
      data-preview-modal={template.kind === 'quiz' ? template.templateId : template.id}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,6,12,0.86)',
        display: 'flex', flexDirection: 'column', padding: 20, gap: 12,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{template.name}</span>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: T.textLow }}>
          {template.kind === 'quiz' ? template.templateId : template.templateId}
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Btn size="sm" variant={device === 'desktop' ? 'primary' : 'secondary'} onClick={() => setDevice('desktop')}>Desktop</Btn>
          <Btn size="sm" variant={device === 'mobile' ? 'primary' : 'secondary'} onClick={() => setDevice('mobile')}>Mobile</Btn>
          <Btn size="sm" variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'start center', overflow: 'auto' }}
      >
        {kind === 'lp' ? (
          <iframe
            title={`${template.name} preview`}
            sandbox=""
            srcDoc={portedTemplateDocument(template.templateId, brand, template.slotOverrides ?? {})}
            style={{ width, height: '100%', minHeight: 640, border: `1px solid ${T.border}`, background: '#fff', borderRadius: 6 }}
          />
        ) : (
          <div style={{ width, maxWidth: '100%', border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
            <TemplatePreview spec={quizSpecFor(template)} brand={brand} height={640} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The code renderer behind a quiz template record.
 *
 * Resolved through the registry from `rendererKey`, never from `templateId`:
 * a clone's `templateId` is its own and names no code renderer, which is the
 * point of the two fields.
 */
const quizSpecFor = (t) => {
  const res = resolveTemplate('quiz', t.rendererKey)
  return res.ok && res.template.kind === 'quiz' ? res.template.template : null
}

/* -------------------------------------------------------------------- cards */

const Card = ({ template, kind, brand, isSelected, onSelect, onPreview }) => {
  const blocked = blockedReason(template)
  const spec = kind === 'quiz' ? quizSpecFor(template) : null

  return (
    <div
      data-template-card={kind === 'quiz' ? template.templateId : template.id}
      data-template-renderer={kind === 'quiz' ? template.rendererKey : template.templateId}
      data-selected={isSelected ? 'true' : 'false'}
      data-blocked={blocked ? 'true' : 'false'}
      style={{
        backgroundColor: T.bgElev,
        border: `2px solid ${isSelected ? T.primary : T.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: blocked ? 0.6 : 1,
      }}
    >
      {template.rendererError ? (
        <div style={{ ...thumbBox(190), display: 'grid', placeItems: 'center', padding: 14, textAlign: 'center', color: T.red, fontSize: 11 }}>
          {template.rendererError}
        </div>
      ) : kind === 'quiz' ? (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
          <TemplatePreview spec={spec} brand={brand} height={190} />
        </div>
      ) : (
        <LpThumb slug={template.templateId} brand={brand} overrides={template.slotOverrides} />
      )}

      <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{template.name}</span>
          {template.code && (
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{template.code}</span>
          )}
          {isSelected && <Pill color={T.primary}>SELECTED</Pill>}
          {blocked && <Pill color={T.red}>{blocked.toUpperCase()}</Pill>}
          {template.origin && template.origin !== 'stock' && <Pill color={T.purple}>{String(template.origin).toUpperCase()}</Pill>}
        </div>

        {template.blurb && (
          <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.5 }}>{template.blurb}</div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
          <Btn size="sm" variant="secondary" onClick={() => onPreview(template)}>Preview</Btn>
          <Btn
            size="sm"
            variant={isSelected ? 'secondary' : 'primary'}
            disabled={Boolean(blocked)}
            title={blocked ? `Cannot be selected: ${blocked}` : undefined}
            onClick={() => { if (!blocked) onSelect(template) }}
          >
            {isSelected ? 'Selected' : 'Select'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ gallery */

/**
 * @param kind        'quiz' | 'lp'
 * @param templates   RECORDS from src/lib/template-records — never the registry
 * @param brands      the real brands, so a preview can be a real client's
 * @param brandId     the brand to preview under; falsy or '__neutral__' = neutral
 * @param selectedId  quiz: the stored `templateId`. lp: the template ROW id.
 * @param onSelect    given the whole record, so a caller stores the right field
 * @param onBrandChange  omit to hide the brand picker (the deployment editor
 *                       drives it from its own Brand field instead)
 */
export const TemplateGallery = ({
  kind,
  templates = [],
  brands = [],
  brandId = '__neutral__',
  selectedId = null,
  onSelect = () => {},
  onBrandChange = null,
  emptyMessage = 'No templates yet.',
}) => {
  const [previewing, setPreviewing] = useState(null)
  const [family, setFamily] = useState('all')

  const brand = brandFor(brands, brandId)
  const idOf = (t) => (kind === 'quiz' ? t.templateId : t.id)

  const families = useMemo(
    () => (kind === 'lp' ? ['all', ...Array.from(new Set(templates.map((t) => t.family).filter(Boolean)))] : []),
    [kind, templates],
  )
  const shown = kind === 'lp' && family !== 'all' ? templates.filter((t) => t.family === family) : templates

  /*
   * A selected template that is not in the list is the failure this whole
   * change exists to make visible. It means the deployment stores an id nothing
   * resolves — a deleted record, a typo written through the REST API, or an
   * import from another environment. The old behaviour was to render the first
   * template and say nothing.
   */
  const selectionMissing = selectedId && !templates.some((t) => idOf(t) === selectedId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(onBrandChange || families.length > 1) && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {onBrandChange && (
            <div style={{ minWidth: 220 }}>
              <Label>Preview as</Label>
              <Select value={brandId ?? '__neutral__'} onChange={(e) => onBrandChange(e.target.value)}>
                <option value="__neutral__">Neutral (no brand)</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}
              </Select>
            </div>
          )}
          {families.length > 1 && (
            <div style={{ minWidth: 160 }}>
              <Label>Form</Label>
              <Select value={family} onChange={(e) => setFamily(e.target.value)}>
                {families.map((f) => <option key={f} value={f}>{f === 'all' ? 'All forms' : `${f} form`}</option>)}
              </Select>
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 11.5, color: T.textMute }} data-template-count={templates.length}>
            {templates.length} {kind === 'quiz' ? 'quiz' : 'landing-page'} template{templates.length === 1 ? '' : 's'}
            {shown.length !== templates.length ? ` · showing ${shown.length}` : ''}
          </div>
        </div>
      )}

      {selectionMissing && (
        <div
          data-template-selection-missing="true"
          style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 11.5 }}
        >
          This deployment stores template id <strong>{selectedId}</strong>, which is not in the library.
          Nothing will be rendered in its place — pick a template below before publishing.
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ padding: 20, border: `1px dashed ${T.border}`, borderRadius: 8, color: T.textMute, fontSize: 12 }}>
          {emptyMessage}
        </div>
      ) : (
        <div
          data-template-gallery={kind}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 14, alignItems: 'start' }}
        >
          {shown.map((t) => (
            <Card
              key={idOf(t)}
              template={t}
              kind={kind}
              brand={brand}
              isSelected={idOf(t) === selectedId}
              onSelect={onSelect}
              onPreview={setPreviewing}
            />
          ))}
        </div>
      )}

      {previewing && (
        <PreviewModal template={previewing} kind={kind} brand={brand} onClose={() => setPreviewing(null)} />
      )}
    </div>
  )
}
