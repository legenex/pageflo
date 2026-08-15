'use client'

/**
 * The two pieces of scaffolding every composition shares, and nothing else.
 *
 * `QuizCanvas` is the outermost ground and the three brand chrome slots. It is
 * shared because chrome is BRAND-owned and template-blind — two deployments of
 * one quiz under one brand cannot disagree about whose logo, whose call button
 * and whose copyright line the page shows — while the composition still decides
 * where the three sit and what the ground is.
 *
 * `QuizColumn` is the content column, whose maximum is the TEMPLATE's declared
 * width and nothing else. It used to be a hard 760px in the runtime, so the
 * eight templates declaring 820-900 were silently clamped and the one design
 * that declares full bleed could not reach the edge of anything. A null maximum
 * means full bleed and is passed through as such.
 *
 * A composition is free to use neither. Fullscreen Focus uses only the canvas,
 * because its design has no column and no card.
 */

import type { CSSProperties, ReactNode } from 'react'

import type { QuizCompositionProps } from './types'

export const QuizCanvas = ({
  view,
  theme,
  placement,
  background,
  style,
  children,
}: Pick<QuizCompositionProps, 'view' | 'theme' | 'placement'> & {
  /** The composition's own ground. Defaults to the template's page colour. */
  background?: string
  style?: CSSProperties
  children: ReactNode
}) => {
  // Chromeless renders sit inside someone else's layout, so they contribute no
  // background of their own and no page-height floor.
  const chromeless = placement !== 'page'
  return (
    <div
      style={{
        position: 'relative',
        background: chromeless ? 'transparent' : (background ?? theme.page.bg),
        minHeight: chromeless ? undefined : '100vh',
        ...style,
      }}
    >
      {view.chrome.header}
      {children}
      {view.chrome.body}
      {view.chrome.footer}
    </div>
  )
}

export const QuizColumn = ({
  theme,
  placement,
  pad,
  style,
  children,
}: Pick<QuizCompositionProps, 'theme' | 'placement'> & {
  /** The composition's own gutter. */
  pad?: string
  style?: CSSProperties
  children: ReactNode
}) => {
  const chromeless = placement !== 'page'
  return (
    /*
     * The gutter is the design set's own: every one of the twenty sits in a
     * host padded `48px 28px 80px`, with no media query anywhere in the twenty
     * to change it. Expressed in clamp() so a 390px screen is not spending 56px
     * of its width on margin, which is the one thing the source's simulated
     * device frame let it get away with and a real phone does not.
     */
    <main style={{ padding: chromeless ? (placement === 'inline' ? 0 : '16px 12px') : (pad ?? 'clamp(20px, 4vw, 48px) clamp(12px, 2.2vw, 28px) clamp(40px, 6vw, 80px)') }}>
      <div style={{ maxWidth: chromeless ? '100%' : (theme.width ?? '100%'), margin: '0 auto', ...style }}>
        {children}
      </div>
    </main>
  )
}
