'use client'

import { useEffect, useState } from 'react'
import { PageFloWordmark } from './PageFloLogo'

export type NavLink = { href: string; label: string }

/**
 * Sticky marketing navigation with a real mobile drawer.
 *
 * The drawer is a disclosure, not a modal: it does not trap focus, because it
 * contains only the same links the desktop bar shows and closing it is a single
 * Escape or tap. It does close on route-hash navigation, on Escape, and when the
 * viewport grows past the breakpoint, so a user who rotates a phone does not end
 * up with an invisible open menu holding the page.
 */
export function MarketingNav({ links, appUrl }: { links: NavLink[]; appUrl: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const mq = window.matchMedia('(min-width: 900px)')
    const onChange = () => {
      if (mq.matches) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onChange)
    return () => {
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onChange)
    }
  }, [open])

  return (
    <header className="sticky top-0 z-50 border-b border-[#1A2130] bg-canvas/[0.86] backdrop-blur-[10px]">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center gap-7 px-5 sm:px-6">
        <a href="#top" className="shrink-0" aria-label="PageFlo home">
          <PageFloWordmark />
        </a>

        <nav aria-label="Primary" className="hidden flex-1 gap-5 min-[900px]:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-app-sm text-[13px] text-ink-muted transition-colors hover:text-ink focus-visible:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 min-[900px]:ml-0">
          <a
            href={`${appUrl}/sign-in`}
            className="hidden text-[13px] text-ink-muted transition-colors hover:text-ink min-[560px]:inline"
          >
            Sign in
          </a>
          <a
            href={`${appUrl}/sign-in`}
            className="inline-flex h-8 items-center rounded-[4px] bg-brand px-[13px] text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Start building
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="pf-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-app-sm border border-border text-ink-muted transition-colors hover:text-ink min-[900px]:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <div
        id="pf-mobile-nav"
        hidden={!open}
        className="border-t border-[#1A2130] bg-surface-1 min-[900px]:hidden"
      >
        <nav aria-label="Primary, mobile" className="flex flex-col px-5 py-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-app-sm px-2 py-3 text-[14px] text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
          <a
            href={`${appUrl}/sign-in`}
            onClick={() => setOpen(false)}
            className="rounded-app-sm px-2 py-3 text-[14px] text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign in
          </a>
        </nav>
      </div>
    </header>
  )
}
