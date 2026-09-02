'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'

/**
 * Interactive PageFlo primitives.
 *
 * `primitives.tsx` is server components only. Anything that needs state, focus
 * management or an event handler lives here.
 */

/* ------------------------------------------------------------------ confirm */

export type ConfirmOptions = {
  title: string
  /** One or two sentences saying what will happen. Never just "Are you sure?". */
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` paints the confirm control red and focuses Cancel instead. */
  tone?: 'default' | 'danger'
  /**
   * When set, the operator must type this exact string before the confirm
   * control enables. Reserved for genuinely irreversible actions, where a
   * mis-aimed click and a deliberate decision must not look the same.
   */
  typeToConfirm?: string
  /** Extra detail rendered under the message: what else goes, what survives. */
  detail?: ReactNode
}

type Pending = { options: ConfirmOptions; resolve: (ok: boolean) => void }

/**
 * A confirmation dialog with the ergonomics of `window.confirm`.
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   ...
 *   if (!(await confirm({ title, message }))) return
 *   ...
 *   return <>{confirmDialog}{rest}</>
 *
 * `window.confirm` is what this replaces at five call sites. It blocks the main
 * thread, cannot be styled, cannot say which of two consequences is the
 * dangerous one, is suppressed outright in some embedded browser contexts (so
 * the guard silently returns false and the action never runs), and on iOS it
 * reads out the origin rather than the product. A dialog the application owns
 * fixes all five and can additionally require the operator to type a name.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve })
      }),
    [],
  )

  const settle = useCallback(
    (ok: boolean) => {
      setPending((current) => {
        current?.resolve(ok)
        return null
      })
    },
    [],
  )

  const dialog = pending ? (
    <ConfirmDialog options={pending.options} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
  ) : null

  return [confirm, dialog]
}

function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions
  onCancel: () => void
  onConfirm: () => void
}) {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
    typeToConfirm,
    detail,
  } = options

  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Focus goes to the least destructive control, or to the field when one has
  // to be filled in. A dialog that opens with the delete button focused turns a
  // stray Enter into the thing the dialog exists to prevent.
  useEffect(() => {
    const target = typeToConfirm ? inputRef.current : tone === 'danger' ? cancelRef.current : confirmRef.current
    target?.focus()
  }, [tone, typeToConfirm])

  // Escape cancels, and Tab is trapped inside the panel. Without the trap, focus
  // walks out into the page behind the backdrop, which for a keyboard or screen
  // reader user is the same as the dialog not being modal at all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  // The page behind must not scroll while a modal is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const ready = !typeToConfirm || typed.trim() === typeToConfirm

  const body = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-5 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-[420px] rounded-app-lg border border-border bg-linear-to-b from-surface-2 to-surface-1 p-5 shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-start gap-3">
          {tone === 'danger' ? (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-app border border-neg/30 bg-neg/10 text-neg"
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-bold tracking-[-0.01em] text-ink">
              {title}
            </h2>
            <p id={descId} className="mt-1.5 text-[12.5px] leading-[1.6] text-ink-muted">
              {message}
            </p>
            {detail ? <div className="mt-2.5 text-[12px] leading-[1.6] text-ink-dim">{detail}</div> : null}
          </div>
        </div>

        {typeToConfirm ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Type <span className="font-mono normal-case tracking-normal text-ink">{typeToConfirm}</span> to confirm
            </span>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-app border border-border bg-surface-deep px-3 py-2 font-mono text-[13px] text-ink placeholder:text-ink-dim"
            />
          </label>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-app border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={!ready}
            onClick={onConfirm}
            className={`rounded-app px-3.5 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              tone === 'danger' ? 'bg-neg hover:bg-brand-hover' : 'bg-brand hover:bg-brand-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  // Portalled to <body> so a dialog opened from inside a row with `overflow:
  // hidden` or its own stacking context is not clipped by it.
  if (!mounted) return null
  return createPortal(body, document.body)
}

/* -------------------------------------------------------------------- misc */

/** Inline busy indicator for a control that is running a server action. */
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-3.5 w-3.5 animate-spin ${className}`} aria-hidden="true" />
}
