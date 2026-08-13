// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * A named section inside a builder panel.
 *
 * The deployment editor was a flat run of `Label`s: 10px, uppercase, muted grey,
 * identical whether the thing below it was one text box or the entire template
 * gallery. Nothing said where "the deployment" stopped and "how it renders"
 * began, so every tab read as one undifferentiated form and the operator had to
 * infer the structure from the fields themselves.
 *
 * So this is deliberately louder than a `Label` and deliberately different in
 * kind: full-contrast text at heading size, an accent mark, and a rule that
 * separates it from what came before. `Label` still names a FIELD; this names a
 * GROUP, and the two no longer look alike.
 */

import { T } from '../ui'

export const Section = ({ title, hint, right, divider = true, id, children }) => (
  <section
    data-quiz-section={id}
    style={{
      // The first section of a tab sits under the tab rule already; a second
      // line 20px below it reads as a mistake rather than as structure.
      borderTop: divider ? `1px solid ${T.border}` : 'none',
      paddingTop: divider ? 18 : 0,
      marginTop: divider ? 4 : 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: T.primary, flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{title}</h3>
        {hint ? (
          <div style={{ fontSize: 12, color: T.textMute, marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>{hint}</div>
        ) : null}
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>{children}</div>
  </section>
)
