// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * A heading an operator can navigate by.
 *
 * The deployment editor is a long form, and its structure used to be carried
 * entirely by `Label`: 10px, uppercase, T.textMute, which is the exact treatment
 * used on the label of a single input. Two different levels of meaning drawn
 * identically read as one flat list of fields, so nothing on the page said where
 * "the deployment" ended and "the template" began.
 *
 * This is the section level and it is deliberately louder than a field label:
 * larger, at full text contrast, with an accent eyebrow and a rule underneath.
 */

import { T } from '../ui'

export const SectionHeading = ({ eyebrow, title, hint, right = null, style }) => (
  <div
    style={{
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: `1px solid ${T.borderHover}`,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9.5,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.primary,
              marginBottom: 5,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: '-0.015em' }}>{title}</div>
      </div>
      {right}
    </div>
    {hint && <div style={{ fontSize: 12, color: T.textMute, marginTop: 6, lineHeight: 1.55 }}>{hint}</div>}
  </div>
)
