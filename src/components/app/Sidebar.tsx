'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { PageFloMark } from '@/components/marketing/PageFloLogo'
import { SignOutButton } from './SignOutButton'
import {
  GROUP_KEYS_WITH_CHILDREN,
  NAV,
  isChildActive,
  isGroupActive,
  type NavChild,
  type NavGroup,
  type NavIcon,
} from './nav-config'
import { WorkspaceClock } from './WorkspaceClock'

const OPEN_GROUPS_KEY = 'pageflo.nav.openGroups'
const COLLAPSED_KEY = 'pageflo.nav.collapsed'

type Shared = {
  pathname: string
  search: string
  navigating: boolean
  collapsed: boolean
  onNavStart: () => void
}

/**
 * The PageFlo console sidebar.
 *
 * 248px expanded, 68px collapsed, with a rounded outer edge so the shell reads
 * as chrome sitting on the canvas rather than as a second panel. Groups are
 * accordions whose open state and the collapsed state both persist per browser,
 * because an operator who collapses the nav to get canvas back does not want it
 * restored on every navigation.
 *
 * Three behaviours from the previous sidebar are preserved deliberately:
 *   - the per-link `useLinkStatus` spinner, which is the only per-item "this one
 *     is loading" feedback in the application,
 *   - the navigation lock, which makes the nav inert while a route commits so a
 *     second click cannot start a competing navigation,
 *   - the mobile rail plus overlay drawer, including its accessible names, which
 *     `scripts/test-admin-ui.mts` drives at 390x844.
 */
export function Sidebar({ userEmail, roleLabel }: { userEmail: string; roleLabel: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  const [openGroups, setOpenGroups] = useState<string[]>(['leads'])
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navigating, setNavigating] = useState(false)

  // Read persisted state after mount. Reading during render would make the
  // server and client markup disagree and React would discard the client tree.
  useEffect(() => {
    try {
      const rawGroups = window.localStorage.getItem(OPEN_GROUPS_KEY)
      if (rawGroups) {
        const parsed: unknown = JSON.parse(rawGroups)
        if (Array.isArray(parsed)) setOpenGroups(parsed.filter((k): k is string => typeof k === 'string'))
      }
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {
      // A browser with storage blocked still gets a working nav, just not a
      // remembered one. Never let a preference read break navigation.
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups))
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage blocked; preference simply is not remembered */
    }
  }, [openGroups, collapsed, hydrated])

  useEffect(() => {
    setNavigating(false)
    setMobileOpen(false)
  }, [pathname, search])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const allOpen = GROUP_KEYS_WITH_CHILDREN.every((k) => openGroups.includes(k))

  // The collapsed rail has no room for group children, so a collapsed sidebar
  // always renders flat. The drawer is always expanded for the same reason.
  const body = (drawer: boolean) => {
    const isCollapsed = collapsed && !drawer
    const shared: Shared = { pathname, search, navigating, collapsed: isCollapsed, onNavStart: () => setNavigating(true) }
    return (
      <>
        <div className={`flex shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3 py-4 ${isCollapsed ? 'justify-center' : ''}`}>
          <Link href="/admin/overview" aria-label="PageFlo overview" className="flex items-center gap-2.5 rounded-app-sm">
            <PageFloMark size={26} className="shrink-0 text-ink" />
            {isCollapsed ? null : (
              <span className="text-[19px] font-bold leading-none tracking-[-0.02em] text-ink">
                Page<span className="text-brand">Flo</span>
              </span>
            )}
          </Link>
        </div>

        <nav
          aria-label="Console"
          className="flex-1 overflow-y-auto px-2.5 py-2.5 transition-opacity duration-150"
          style={navigating ? { pointerEvents: 'none', opacity: 0.75 } : undefined}
          aria-busy={navigating}
        >
          <ul className="flex flex-col gap-0.5">
            {NAV.map((group) => (
              <li key={group.key}>
                <Group
                  group={group}
                  open={openGroups.includes(group.key)}
                  onToggle={() => toggleGroup(group.key)}
                  {...shared}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2.5">
          {isCollapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-app border border-sidebar-border text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftOpen className="h-[17px] w-[17px]" />
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setOpenGroups(allOpen ? [] : GROUP_KEYS_WITH_CHILDREN)}
                className="flex h-8 w-full items-center justify-center gap-2 rounded-app border border-sidebar-border text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {allOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>

              <SignOutButton userEmail={userEmail} roleLabel={roleLabel} />

              <div className="flex items-center gap-2">
                <WorkspaceClock />
                {drawer ? null : (
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="Collapse sidebar"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-app border border-sidebar-border text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <PanelLeftClose className="h-[15px] w-[15px]" />
                  </button>
                )}
              </div>

              <Link
                href="/cms"
                className="rounded-app-sm px-1 py-0.5 text-[11px] text-ink-dim transition-colors hover:text-ink-muted"
              >
                Open raw Payload admin &rarr;
              </Link>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <aside
        data-pageflo-sidebar={collapsed ? 'collapsed' : 'expanded'}
        style={{ width: collapsed ? 68 : 248 }}
        className="relative z-20 hidden shrink-0 flex-col rounded-r-2xl border-r border-sidebar-border bg-sidebar md:flex"
      >
        {body(false)}
      </aside>

      {/* Mobile rail: keeps the shell's flex-row layout intact while giving the
          content back ~340 of 390px. The hamburger is the only control. */}
      <div className="flex w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="rounded-app-sm p-2 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <aside className="flex h-full w-[248px] max-w-[80vw] flex-col border-r border-sidebar-border bg-sidebar">
            {body(true)}
          </aside>
          {/* The scrim is a real button so closing the drawer is reachable by
              keyboard and announced, not just a click target. */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="flex-1 cursor-default bg-black/60"
          />
        </div>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ pieces */

function Group({
  group,
  open,
  onToggle,
  pathname,
  search,
  navigating,
  collapsed,
  onNavStart,
}: { group: NavGroup; open: boolean; onToggle: () => void } & Shared) {
  const active = isGroupActive(pathname, group)
  const hasChildren = Boolean(group.children?.length) && !collapsed

  return (
    <div>
      <div className="flex items-center gap-[3px]">
        <NavRow
          href={group.href}
          label={group.label}
          icon={group.icon}
          badge={group.badge}
          active={active}
          highlight={active}
          collapsed={collapsed}
          navigating={navigating}
          onNavStart={onNavStart}
        />
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-app-sm border transition-colors ${
              open
                ? 'border-brand/30 bg-brand/15 text-brand'
                : 'border-sidebar-border bg-surface-1/70 text-ink-muted hover:bg-surface-2'
            }`}
          >
            {open ? <ChevronDown className="h-[13px] w-[13px]" /> : <ChevronRight className="h-[13px] w-[13px]" />}
          </button>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul className="mb-1.5 ml-4 mt-0.5 flex flex-col gap-px border-l border-sidebar-border pl-3">
          {group.children!.map((child) => (
            <li key={child.href}>
              <ChildRow
                child={child}
                active={isChildActive(pathname, search, child)}
                navigating={navigating}
                onNavStart={onNavStart}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Swaps the icon for a spinner while this link's navigation is in flight. */
function RowIcon({ icon: Icon, className = 'h-[18px] w-[18px]' }: { icon: NavIcon; className?: string }) {
  const { pending } = useLinkStatus()
  return pending ? <Loader2 className={`${className} animate-spin text-brand`} /> : <Icon className={className} />
}

function NavRow({
  href,
  label,
  icon,
  badge,
  active,
  highlight,
  collapsed,
  navigating,
  onNavStart,
}: {
  href: string
  label: string
  icon: NavIcon
  badge?: string
  active: boolean
  highlight: boolean
  collapsed: boolean
  navigating: boolean
  onNavStart: () => void
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      onClick={() => {
        if (!active) onNavStart()
      }}
      aria-disabled={navigating || undefined}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-app text-[13px] transition-colors ${
        collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
      } ${highlight ? 'bg-brand/10 font-semibold text-ink' : 'font-medium text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {highlight ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
        />
      ) : null}
      <span className={highlight ? 'text-brand' : ''}>
        <RowIcon icon={icon} />
      </span>
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge ? (
            <span className="shrink-0 rounded-app-sm border border-border bg-surface-1 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </Link>
  )
}

function ChildRow({
  child,
  active,
  navigating,
  onNavStart,
}: {
  child: NavChild
  active: boolean
  navigating: boolean
  onNavStart: () => void
}) {
  return (
    <Link
      href={child.href}
      onClick={() => {
        if (!active) onNavStart()
      }}
      aria-disabled={navigating || undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-app-sm px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active ? 'bg-brand/10 text-brand' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <RowIcon icon={child.icon} className="h-[15px] w-[15px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{child.label}</span>
    </Link>
  )
}
