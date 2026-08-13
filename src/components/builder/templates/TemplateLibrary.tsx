// @ts-nocheck -- mounted by two ported builder apps whose props are untyped.
// The registry and slot modules it reads are fully typed and checked.
'use client'

/**
 * The stock template libraries, as a product surface.
 *
 * There are two of them and there was no way to look at either. The quiz
 * templates could only be seen while editing a deployment, and the landing-page
 * gallery was a modal you reached by already having a page open — so "which
 * twenty are there" and "what does LP07 look like" were questions the product
 * could not answer, and the answer people used instead was the last template
 * somebody happened to pick.
 *
 * Three rules this component exists to hold:
 *
 *  1. IT SHOWS THE STOCK REGISTRY, NOT DATABASE ROWS. `listQuizTemplates()` and
 *     `listLpTemplates()` are the libraries. A tab that listed `funnel-quizzes`
 *     rows would be listing CONTENT — what people have built — under the name
 *     of the catalogue they built it from, and the count would drift with usage.
 *     The counts are asserted here and in the test suite for that reason.
 *
 *  2. EVERY PREVIEW IS A REAL RENDER, through the same primitives the public
 *     page uses: `TemplatePreview` runs the actual progress and answer forms,
 *     and a landing page is `composeTemplate` + `resolveTokens` inside
 *     `portedTemplateDocument` — the exact call the public renderer makes. A
 *     library backed by screenshots goes stale the first time a template changes
 *     and then lies about the templates nobody has looked at recently, which are
 *     precisely the ones somebody is browsing this page to find.
 *
 *  3. NEUTRAL AND BRANDED ARE BOTH AVAILABLE. Neutral answers "what is this
 *     template", branded answers "what will it look like for this client", and
 *     showing only one of the two makes the other unanswerable. Neutral is
 *     deliberately colourless rather than grey-by-invention; see
 *     PREVIEW_BRAND_DEFAULT.
 */

import { useMemo, useState } from 'react'

import {
  listQuizTemplates,
  listLpTemplates,
  EXPECTED_QUIZ_TEMPLATE_COUNT,
  EXPECTED_LP_TEMPLATE_COUNT,
  registryHealth,
} from '@/lib/template-registry'
import { TemplatePreview } from '@/components/builder/quiz/TemplatePreview'
import { portedTemplateDocument } from '@/components/builder/lp/PortedTemplate'
import { PREVIEW_BRAND_DEFAULT } from '@/components/builder/lp/render'
import { T, Pill, Btn, Select, Label } from '@/components/builder/ui'

/* ------------------------------------------------------------------ preview */

/**
 * A landing-page template, rendered small.
 *
 * An iframe, and then contained THREE ways rather than one. The history matters:
 * four earlier containment attempts (overflow on a sized box, absolute
 * positioning, clip-path, and an iframe with overflow alone) each measured
 * correct and each painted over the card underneath, which is why the gallery
 * shipped with no picture at all.
 *
 *  - `overflow: hidden` clips the box.
 *  - `contain: paint` makes the element a containing block AND a paint
 *    containment boundary, so a descendant cannot escape it even if something
 *    inside establishes its own stacking or positioning context. This is the
 *    one the earlier attempts were missing: `overflow` alone does not stop a
 *    fixed-position or transformed descendant.
 *  - `isolation: isolate` gives it its own stacking context, so nothing inside
 *    can paint above a sibling card.
 *
 * `sandbox` with no `allow-scripts` is belt and braces: the template markup is
 * a build asset, but a document that cannot run script cannot reach out of the
 * frame however it is later changed.
 */
const LpThumb = ({ slug, brand, height = 190 }) => {
  const doc = useMemo(() => portedTemplateDocument(slug, brand), [slug, brand])
  // The reference pages are drawn at desktop width. Rendering the frame at that
  // width and scaling down shows the template's real layout; letting the frame
  // be card-width would show its MOBILE layout and call it a preview of the
  // desktop design.
  const FRAME_W = 1280
  const FRAME_H = 1600
  const [w, setW] = useState(560)
  const scale = w / FRAME_W

  return (
    <div
      ref={(el) => { if (el && el.clientWidth && el.clientWidth !== w) setW(el.clientWidth) }}
      aria-hidden="true"
      style={{
        position: 'relative',
        overflow: 'hidden',
        contain: 'paint',
        isolation: 'isolate',
        height,
        width: '100%',
        flexShrink: 0,
        backgroundColor: T.bg,
        borderBottom: `1px solid ${T.border}`,
      }}
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
          width: FRAME_W,
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

/* -------------------------------------------------------------------- cards */

const Meta = ({ rows }) => (
  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow, lineHeight: 1.7 }}>
    {rows.filter(([, v]) => v).map(([k, v]) => (
      <div key={k}>{k} · {String(v)}</div>
    ))}
  </div>
)

const QuizCard = ({ entry, brand, isCurrent, onUse }) => {
  const spec = entry.template
  return (
    <div data-template={entry.id} data-kind="quiz" style={cardStyle(isCurrent)}>
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
        <TemplatePreview spec={spec} brand={brand} height={190} />
      </div>
      <div style={bodyStyle}>
        <div style={titleRow}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{entry.name}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{entry.code}</span>
          {isCurrent && <Pill color={T.primary}>CURRENT</Pill>}
        </div>
        <div style={blurbStyle}>{entry.blurb}</div>
        <Meta rows={[
          ['USE', spec.use],
          ['PROGRESS', spec.progress],
          ['ANSWERS', spec.answers],
          ['ICONS', spec.icons],
          ['WIDTH', spec.width?.[1] ? `${spec.width[0]}–${spec.width[1]}px` : 'full bleed'],
          ['ORIGIN', spec.origin],
        ]} />
        {onUse && (
          <Btn variant={isCurrent ? 'secondary' : 'primary'} size="sm" onClick={() => onUse(entry.id)}>
            {isCurrent ? 'Currently applied' : 'Use this template'}
          </Btn>
        )}
      </div>
    </div>
  )
}

const LpCard = ({ entry, brand, isCurrent, onUse }) => {
  const slotRoles = useMemo(() => {
    const counts = {}
    for (const s of entry.template?.slots ?? []) counts[s.role] = (counts[s.role] ?? 0) + 1
    return counts
  }, [entry])
  const slotCount = entry.template?.slots?.length ?? 0

  return (
    <div data-template={entry.id} data-kind="lp" style={cardStyle(isCurrent)}>
      <LpThumb slug={entry.id} brand={brand} />
      <div style={bodyStyle}>
        <div style={titleRow}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{entry.name}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: T.textLow }}>{entry.code}</span>
          <Pill color={T.purple}>{String(entry.family).toUpperCase()} FORM</Pill>
          <Pill color={T.textMute}>{entry.ground}</Pill>
          {isCurrent && <Pill color={T.primary}>CURRENT</Pill>}
        </div>
        <div style={blurbStyle}>{entry.blurb}</div>
        <Meta rows={[
          ['CHANNELS', entry.channels],
          ['QUIZ', entry.quizPlacement],
          ['QUIZ SKIN', entry.recommendedQuizTemplateId],
          // The number that says whether a deployment can say anything of its
          // own. Before the slot contract every one of these was zero.
          ['EDITABLE', `${slotCount} slots · ${Object.keys(slotRoles).length} kinds`],
        ]} />
        {onUse && (
          <Btn variant={isCurrent ? 'secondary' : 'primary'} size="sm" onClick={() => onUse(entry.id)}>
            {isCurrent ? 'Currently applied' : 'Use this template'}
          </Btn>
        )}
      </div>
    </div>
  )
}

const cardStyle = (isCurrent) => ({
  backgroundColor: T.bgElev,
  border: `2px solid ${isCurrent ? T.primary : T.border}`,
  borderRadius: 10,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
})
const bodyStyle = { padding: 13, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }
const titleRow = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }
const blurbStyle = { fontSize: 11, color: T.textMute, lineHeight: 1.5 }

/* ------------------------------------------------------------------ library */

/**
 * @param kind        'quiz' | 'lp'
 * @param brands      the real brands, so a preview can be a real client's
 * @param currentId   the template the thing being edited is on, if any
 * @param onUse       omitted when the library is being browsed rather than picked from
 */
export const TemplateLibrary = ({ kind, brands = [], currentId = null, onUse = null }) => {
  const [brandId, setBrandId] = useState('__neutral__')
  const [family, setFamily] = useState('all')

  const entries = useMemo(() => (kind === 'quiz' ? listQuizTemplates() : listLpTemplates()), [kind])
  const expected = kind === 'quiz' ? EXPECTED_QUIZ_TEMPLATE_COUNT : EXPECTED_LP_TEMPLATE_COUNT
  const health = useMemo(() => registryHealth(), [])

  // Neutral is the template's own design with no brand imposed on it. Deliberately
  // not a grey palette: inventing one would make the brandless preview the single
  // place in the product that renders in a colour nobody chose.
  const brand = brandId === '__neutral__' ? PREVIEW_BRAND_DEFAULT : brands.find((b) => b.id === brandId) ?? PREVIEW_BRAND_DEFAULT

  const families = useMemo(
    () => (kind === 'lp' ? ['all', ...Array.from(new Set(entries.map((e) => e.family)))] : []),
    [kind, entries],
  )
  const shown = family === 'all' ? entries : entries.filter((e) => e.family === family)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <Label>Preview as</Label>
          <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="__neutral__">Neutral (no brand)</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}
          </Select>
        </div>
        {kind === 'lp' && (
          <div style={{ minWidth: 160 }}>
            <Label>Form</Label>
            <Select value={family} onChange={(e) => setFamily(e.target.value)}>
              {families.map((f) => <option key={f} value={f}>{f === 'all' ? 'All forms' : `${f} form`}</option>)}
            </Select>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: T.textMute }} data-template-count={entries.length}>
          {entries.length} of {expected} stock {kind === 'quiz' ? 'quiz' : 'landing-page'} templates
          {shown.length !== entries.length ? ` · showing ${shown.length}` : ''}
        </div>
      </div>

      {/* A registry that has silently emptied or shrunk reads as "all the
          templates are broken" rather than "there are none", so it is stated
          here instead of being left for somebody to notice. */}
      {!health.ok && (
        <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.red}`, color: T.red, fontSize: 11.5 }}>
          The template registry is not healthy: {health.problems.join('; ')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14, alignItems: 'start' }}>
        {shown.map((entry) =>
          kind === 'quiz'
            ? <QuizCard key={entry.id} entry={entry} brand={brand} isCurrent={entry.id === currentId} onUse={onUse} />
            : <LpCard key={entry.id} entry={entry} brand={brand} isCurrent={entry.id === currentId} onUse={onUse} />,
        )}
      </div>
    </div>
  )
}
