'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { SignOutButton } from './SignOutButton'
import {
  LayoutGrid,
  Globe,
  Layers,
  Palette,
  Building2,
  HelpCircle,
  Rocket,
  Megaphone,
  Inbox,
  BarChart3,
  Users,
  Settings,
  Plug,
  Activity,
  Bot,
  ScrollText,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Menu,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutGrid
  badge?: string
  disabled?: boolean
}

const TOP_NAV: NavItem[] = [
  { href: '/admin/overview', label: 'Overview', icon: LayoutGrid },
  { href: '/admin/leads', label: 'Leads', icon: Inbox },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, badge: 'soon' },
  { href: '/admin/sites', label: 'Sites', icon: Globe },
]

const BRANDS_NAV: NavItem[] = [
  { href: '/admin/brands/domains', label: 'Domains', icon: Globe },
  { href: '/admin/brands/brand-identities', label: 'Brand Identities', icon: Building2 },
]

const FUNNELS_NAV: NavItem[] = [
  { href: '/admin/quizzes', label: 'Quizzes', icon: HelpCircle },
  { href: '/admin/landing-pages', label: 'Landing Pages', icon: Rocket },
  { href: '/admin/advertorials', label: 'Advertorials', icon: Megaphone },
]

const SETTINGS_NAV: NavItem[] = [
  { href: '/admin/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/settings/users', label: 'Users', icon: Users },
  { href: '/admin/settings/system', label: 'System', icon: Activity },
  { href: '/admin/plan', label: 'Agent Plan', icon: Bot },
  { href: '/admin/buildlog', label: 'Build Log', icon: ScrollText },
  { href: '/admin/handbook', label: 'Handbook', icon: BookOpen },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const [brandsOpen, setBrandsOpen] = useState(true)
  const [funnelsOpen, setFunnelsOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)

  // Below md the 250px sidebar would leave a 390px phone with ~140px of
  // content, so it collapses to a 48px rail whose only control opens the full
  // nav as an overlay drawer. Closed on navigation (the pathname effect below),
  // on the scrim, and on Escape.
  const [mobileOpen, setMobileOpen] = useState(false)

  // Navigation lock: set when a nav link is clicked, cleared once the route
  // commits (pathname changes). While locked the nav is made inert so a second
  // click can't fire a competing navigation. The per-link spinner
  // (useLinkStatus) gives the actual "this one is loading" feedback.
  const [navigating, setNavigating] = useState(false)
  useEffect(() => {
    setNavigating(false)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const shared: SharedNav = { pathname, navigating, onNavStart: () => setNavigating(true) }

  // One nav body, rendered by the desktop aside and the mobile drawer alike so
  // the two can never drift. No ids inside, so the duplicate mount is safe.
  const content = (
    <>
      <Link href="/admin/overview" className="px-6 py-6 border-b border-[var(--color-border)] block hover:opacity-80 transition-opacity">
        <div className="flex items-baseline gap-1.5">
          <span className="brand-text-gradient text-[18px] font-bold tracking-tight">Legenex</span>
          <span className="text-[18px] font-bold tracking-tight text-white">LegalOS</span>
        </div>
        <p className="text-[12px] text-[var(--color-ink-dim)] mt-1">The smart legal brand website builder.</p>
      </Link>

      {/* While navigating, the nav is made inert (pointer-events none) so a
          second click can't fire a competing navigation. */}
      <nav
        className="flex-1 py-3 overflow-y-auto transition-opacity duration-150"
        style={navigating ? { pointerEvents: 'none', opacity: 0.75 } : undefined}
        aria-busy={navigating}
      >
        <NavSection items={TOP_NAV} {...shared} />

        <DisclosureSection
          label="Brands"
          icon={Palette}
          open={brandsOpen}
          onToggle={() => setBrandsOpen((v) => !v)}
          items={BRANDS_NAV}
          {...shared}
        />

        <DisclosureSection
          label="Funnels"
          icon={Layers}
          open={funnelsOpen}
          onToggle={() => setFunnelsOpen((v) => !v)}
          items={FUNNELS_NAV}
          {...shared}
        />

        <DisclosureSection
          label="Settings"
          icon={Settings}
          open={settingsOpen}
          onToggle={() => setSettingsOpen((v) => !v)}
          items={SETTINGS_NAV}
          {...shared}
        />
      </nav>

      <div className="border-t border-[var(--color-border)] px-4 py-2">
        <Link href="/cms" className="block text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink-muted)] py-1">
          Open raw Payload admin →
        </Link>
      </div>

      <SignOutButton userEmail={userEmail} />
    </>
  )

  return (
    <>
      <aside className="hidden md:flex w-[250px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] flex-col">
        {content}
      </aside>

      {/* Mobile rail: keeps the shell's flex-row layout intact while giving the
          content back ~340 of 390px. The hamburger is the only control. */}
      <div className="md:hidden w-12 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-col items-center py-3">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <aside className="w-[250px] max-w-[80vw] h-full border-r border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-col">
            {content}
          </aside>
          {/* The scrim is a real button so closing the drawer is reachable by
              keyboard and announced, not just a click target. */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/60 cursor-default"
          />
        </div>
      ) : null}
    </>
  )
}

type SharedNav = { pathname: string; navigating: boolean; onNavStart: () => void }

function NavSection({ items, pathname, navigating, onNavStart }: { items: NavItem[] } & SharedNav) {
  return (
    <div className="px-3 space-y-0.5">
      {items.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} navigating={navigating} onNavStart={onNavStart} />
      ))}
    </div>
  )
}

function DisclosureSection({
  label,
  icon: Icon,
  open,
  onToggle,
  items,
  pathname,
  navigating,
  onNavStart,
}: {
  label: string
  icon: typeof LayoutGrid
  open: boolean
  onToggle: () => void
  items: NavItem[]
} & SharedNav) {
  return (
    <div className="px-3 mt-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <Icon className="w-[18px] h-[18px]" />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open ? (
        <div className="mt-0.5 ml-3 pl-3 border-l border-[var(--color-border)] space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} navigating={navigating} onNavStart={onNavStart} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Swaps the item's icon for a spinner the moment its navigation is in flight.
// useLinkStatus must run inside the <Link>, so this renders as its child.
function NavIcon({ icon: Icon }: { icon: typeof LayoutGrid }) {
  const { pending } = useLinkStatus()
  return pending ? (
    <Loader2 className="w-[18px] h-[18px] animate-spin text-[var(--color-brand-from)]" />
  ) : (
    <Icon className="w-[18px] h-[18px]" />
  )
}

function NavLink({ item, active, navigating, onNavStart }: { item: NavItem; active: boolean; navigating: boolean; onNavStart: () => void }) {
  const Icon = item.icon
  if (item.disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-md text-[14px] text-[var(--color-ink-dim)] cursor-not-allowed select-none">
        <Icon className="w-[18px] h-[18px]" />
        <span className="flex-1">{item.label}</span>
        {item.badge ? <Badge>{item.badge}</Badge> : null}
      </div>
    )
  }
  return (
    <Link
      href={item.href}
      onClick={() => {
        // Only lock for a real navigation; clicking the current route is a no-op.
        if (!active) onNavStart()
      }}
      aria-disabled={navigating || undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors ${
        active
          ? 'text-[var(--color-brand-from)] bg-[rgba(255,92,117,0.08)] border border-[rgba(255,92,117,0.30)]'
          : 'text-[var(--color-ink-muted)] border border-transparent hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <NavIcon icon={Icon} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <Badge>{item.badge}</Badge> : null}
    </Link>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--color-border-strong)] text-[var(--color-ink-dim)]">
      {children}
    </span>
  )
}

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true
  if (pathname.startsWith(`${href}/`)) return true
  return false
}
