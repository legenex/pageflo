// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * A heading an operator can navigate by.
 *
 * The deployment editor was a flat run of `Label`s: 10px, uppercase, muted grey,
 * identical whether the thing below it was one text box or the entire template
 * gallery. Nothing said where "the deployment" stopped and "how it renders"
 * began, so every tab read as one undifferentiated form and the structure had to
 * be inferred from the fields themselves.
 *
 * So this is deliberately louder than a `Label` and deliberately different in
 * kind: full-contrast text at heading size, an accent mark, and a rule that
 * separates it from what came before. `Label` still names a FIELD; this names a
 * GROUP, and the two no longer look alike.
 *
 * It matches `../quiz/section.tsx` on purpose, down to the `data-section-heading`
 * hook. The two builders are the same job under two kinds of content, and an
 * operator should not have to learn the surface twice.
 */

import { T } from '../ui'

/**
 * A slug for the heading, derived when the caller does not supply one.
 *
 * `data-section-heading={id}` with no `id` renders NO ATTRIBUTE at all, so a
 * heading that looked correct on screen was invisible to anything selecting on
 * it — which is how two whole tabs reported having no structure while showing
 * it. Deriving from the title means the marker exists for every heading rather
 * than only the ones somebody remembered to name.
 */
const headingSlug = (id, title) =>
  id ||
  String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  'section'

export const SectionHeading = ({ id, title, hint, right = null, divider = true, style }) => (
  <div
    data-lp-section={headingSlug(id, title)}
    style={{
      // The first section of a tab sits under the tab rule already; a second
      // line 20px below it reads as a mistake rather than as structure.
      borderTop: divider ? `1px solid ${T.border}` : 'none',
      paddingTop: divider ? 18 : 0,
      marginTop: divider ? 4 : 0,
      marginBottom: 14,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: T.primary, flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 data-section-heading={headingSlug(id, title)} style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>
          {title}
        </h3>
        {hint ? (
          <div style={{ fontSize: 12, color: T.textMute, marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>{hint}</div>
        ) : null}
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </div>
  </div>
)
