'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronsUpDown, LogOut, Loader2, User as UserIcon } from 'lucide-react'
import { signOut } from '@/app/(auth)/sign-in/actions'

/**
 * The sidebar account card.
 *
 * Shows the signed-in identity and the role that account actually holds. It is
 * a display, not a "view as" switcher: PageFlo has no server-side role
 * impersonation, and a control that appears to change your effective role
 * without doing so is worse than no control.
 */
export function SignOutButton({ userEmail, roleLabel }: { userEmail: string; roleLabel?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const onSignOut = () => {
    start(async () => {
      await signOut()
      router.replace('/sign-in')
      router.refresh()
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-0 z-40 mb-2 w-full min-w-[200px] rounded-app-lg border border-border-strong bg-surface-2 p-1.5 shadow-[var(--shadow-pop)]"
        >
          <Link
            role="menuitem"
            href="/admin/profile"
            onClick={() => setOpen(false)}
            className="flex h-8 items-center gap-2 rounded-app-sm px-2 text-[13px] text-ink-secondary transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <UserIcon className="h-[15px] w-[15px]" />
            Profile
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onSignOut}
            disabled={pending}
            className="flex h-8 w-full items-center gap-2 rounded-app-sm px-2 text-[13px] text-brand transition-colors hover:bg-surface-3 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <LogOut className="h-[15px] w-[15px]" />}
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 rounded-app border border-sidebar-border px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
          {userEmail.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-ink">{userEmail.split('@')[0]}</span>
          <span className="block truncate text-[11px] text-ink-muted">{roleLabel ?? userEmail}</span>
        </span>
        <ChevronsUpDown className="h-[13px] w-[13px] shrink-0 text-ink-dim" aria-hidden="true" />
      </button>
    </div>
  )
}
