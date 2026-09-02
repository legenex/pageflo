'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { MoreHorizontal, Pencil, ExternalLink, Copy, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/pageflo/interactive'
import { duplicatePage, deletePage } from './actions'

// Broadcast fired when any row menu opens, carrying that menu's id. Every other
// open menu listens and closes itself, so only one is ever open at a time —
// across these independent island components, without lifting state to the
// (server-rendered) list. Covers keyboard/programmatic opens too, where a
// pointerdown-outside would not fire.
const MENU_OPEN_EVENT = 'pageflo:page-row-menu-open'

type Props = {
  pageId: number | string
  pageSlug: string
  pageTitle: string
  siteSlug: string
}

export function PageRowMenu({ pageId, pageSlug, pageTitle, siteSlug }: Props) {
  const menuId = useId()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  const openMenu = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
    // Tell any other open row menu to close — only one open at a time.
    window.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { detail: menuId }))
  }

  // While open, close on: another menu opening, an outside click/tap, Escape,
  // or scroll/resize (the menu is position:fixed off the button's rect, so it
  // would otherwise detach on scroll).
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== menuId) setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener(MENU_OPEN_EVENT, onOtherOpen)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener(MENU_OPEN_EVENT, onOtherOpen)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, menuId])

  const isHome = pageSlug === '/'
  const previewHref = `/${pageSlug.replace(/^\//, '')}?site=${encodeURIComponent(siteSlug)}`

  const onDuplicate = () => {
    setOpen(false)
    start(async () => {
      const res = await duplicatePage({ pageId, siteSlug })
      if (!res.ok) alert(`Duplicate failed: ${res.error}`)
    })
  }

  const onDelete = async () => {
    setOpen(false)
    if (isHome) return
    const ok = await confirm({
      title: 'Delete this page?',
      message: `"${pageTitle}" and everything authored on it are removed. Any visitor reaching its path afterwards gets a 404 unless another page claims it.`,
      confirmLabel: 'Delete page',
      tone: 'danger',
    })
    if (!ok) return
    start(async () => {
      const res = await deletePage({ pageId, siteSlug })
      if (!res.ok) alert(`Delete failed: ${res.error}`)
    })
  }

  return (
    <div className="justify-self-end">
      {confirmDialog}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={pending}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-3)] transition-colors disabled:opacity-50"
        aria-label="Page options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && menuPos ? (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50 }}
          className="min-w-[200px] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] shadow-2xl overflow-hidden"
        >
          <Link
            href={`/admin/sites/${siteSlug}/pages/${pageId}`}
            onClick={() => setOpen(false)}
            className="w-full px-4 py-2.5 text-left text-[13px] text-white hover:bg-[var(--color-surface-3)] inline-flex items-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="w-full px-4 py-2.5 text-left text-[13px] text-white hover:bg-[var(--color-surface-3)] inline-flex items-center gap-2 border-t border-[var(--color-border)]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview page
          </a>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={pending}
            className="w-full px-4 py-2.5 text-left text-[13px] text-white hover:bg-[var(--color-surface-3)] inline-flex items-center gap-2 border-t border-[var(--color-border)] disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending || isHome}
            title={isHome ? 'Home page cannot be deleted' : undefined}
            className="w-full px-4 py-2.5 text-left text-[13px] text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10 inline-flex items-center gap-2 border-t border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
