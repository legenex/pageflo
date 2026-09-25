'use client'

import { useId, type CSSProperties } from 'react'

import { safeConsentHtml } from '@/lib/safe-consent-html'

export const CONSENT_REQUIRED_MESSAGE = 'Please check the box to agree before continuing.'

/**
 * The one explicit-consent control. Used by the quiz runtime (through
 * `P.Consent`) and by the website Lead form block, so the two public surfaces
 * that collect a lead cannot drift on what "the visitor consented" means.
 *
 * WHAT IT GUARANTEES
 *  - The box is UNCHECKED until the visitor checks it. It is fully controlled
 *    and has no `defaultChecked`; nothing here can pre-tick it.
 *  - The disclosure is printed beside the box, inside its label, so clicking the
 *    words toggles it, and the words the visitor read are exactly the words the
 *    caller records (`consentPlainText` over the same string).
 *  - The disclosure goes through `safeConsentHtml`: a brand-authored `<script>`,
 *    an event handler or a `javascript:` link never reaches the DOM.
 *  - When `invalid` the box says so in words and with a ring, never by colour
 *    alone, and announces it to assistive technology.
 *  - It has no `name`, so it is never swept into a `FormData` walk as a lead
 *    field. Consent travels as its own typed object.
 *
 * Styling is entirely the caller's: the quiz passes verified surface colours and
 * the site block passes its own tokens.
 */
export function ConsentCheckbox({
  disclosure,
  checked,
  invalid,
  onChange,
  textStyle,
  boxStyle,
  errorStyle,
  ringColor,
  errorText = CONSENT_REQUIRED_MESSAGE,
}: {
  /** The disclosure as authored: plain text, or HTML with safe links. */
  disclosure: string
  checked: boolean
  invalid: boolean
  onChange: (next: boolean) => void
  textStyle?: CSSProperties
  boxStyle?: CSSProperties
  errorStyle?: CSSProperties
  ringColor?: string
  errorText?: string
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div data-consent="" style={{ marginTop: 12 }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          id={id}
          type="checkbox"
          data-consent-checkbox=""
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-required="true"
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={invalid ? errorId : undefined}
          style={{
            marginTop: 2,
            width: 18,
            height: 18,
            flex: '0 0 auto',
            cursor: 'pointer',
            outline: invalid ? `3px solid ${ringColor ?? 'currentColor'}` : undefined,
            outlineOffset: 2,
            ...boxStyle,
          }}
        />
        <span data-consent-text="" style={textStyle} dangerouslySetInnerHTML={{ __html: safeConsentHtml(disclosure) }} />
      </label>
      {invalid ? (
        <p id={errorId} role="alert" data-consent-error="" style={{ margin: '8px 0 0', fontWeight: 700, ...errorStyle }}>
          <span aria-hidden="true">{'⚠ '}</span>
          {errorText}
        </p>
      ) : null}
    </div>
  )
}
