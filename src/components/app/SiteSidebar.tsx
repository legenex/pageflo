'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  FileText,
  BookOpen,
  Phone,
  Settings as SettingsIcon,
  Globe,
  Route,
  BarChart3,
  Activity,
  Users as UsersIcon,
  AlertOctagon,
  ChevronLeft,
  ExternalLink,
} from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { SignOutButton } from './SignOutButton'

type NavItem = { href: string; label: string; icon: typeof LayoutGrid }

export function SiteSidebar({
  site,
  livePreviewUrl,
  userEmail,
}: {
  site: { slug: string; name: string; brand?: { primary?: string | null; accent?: string | null; logo_url?: string | null } | null }
  livePreviewUrl: string
  userEmail: string
}) {
  const pathname = usePathname()
  const base = `/admin/sites/${site.slug}`

  const top: NavItem[] = [
    { href: `${base}`, label: 'Overview', icon: LayoutGrid },
    { href: `${base}/pages`, label: 'Pages', icon: FileText },
    { href: `${base}/blog`, label: 'Blog', icon: BookOpen },
    { href: `${base}/numbers`, label: 'Numbers', icon: Phone },
  ]

  const settings: NavItem[] = [
    { href: `${base}/settings/general`, label: 'General', icon: SettingsIcon },
    { href: `${base}/settings/domains`, label: 'Domains', icon: Globe },
    { href: `${base}/settings/paths`, label: 'Paths', icon: Route },
    { href: `${base}/settings/seo`, label: 'SEO', icon: BarChart3 },
    { href: `${base}/settings/tracking`, label: 'Tracking', icon: Activity },
    { href: `${base}/settings/users`, label: 'Users', icon: UsersIcon },
    { href: `${base}/settings/danger-zone`, label: 'Danger Zone', icon: AlertOctagon },
  ]

  const initials = site.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <aside className="w-[250px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-col">
      <Link href="/admin/sites" className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2 text-[12px] text-[var(--color-ink-muted)] hover:text-white transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to {PRODUCT_NAME}
      </Link>

      <div className="px-5 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          {site.brand?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.brand.logo_url} alt="" className="w-9 h-9 rounded-md object-cover" />
          ) : (
            <span
              className="w-9 h-9 rounded-md flex items-center justify-center text-[12px] font-bold text-white shrink-0"
              style={{ backgroundColor: site.brand?.primary ?? '#0B1F3A' }}
            >
              {initials}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-white truncate">{site.name}</span>
            <span className="block text-[11px] text-[var(--color-ink-dim)] truncate">{site.slug}</span>
          </span>
        </div>
        <Link
          href={livePreviewUrl}
          target="_blank"
          className="brand-gradient mt-4 w-full text-white font-semibold text-[13px] px-3 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Live Site
        </Link>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="px-3 space-y-0.5">
          {top.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href, base)} />
          ))}
        </div>
        <p className="px-6 mt-5 mb-2 text-[10px] font-semibold tracking-[1.5px] text-[var(--color-ink-dim)] uppercase">
          Settings
        </p>
        <div className="px-3 space-y-0.5">
          {settings.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href, base)} />
          ))}
        </div>
      </nav>

      <SignOutButton userEmail={userEmail} />
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors relative ${
        active
          ? 'text-white bg-[var(--color-surface-2)]'
          : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full brand-gradient" aria-hidden />
      ) : null}
      <Icon className="w-[18px] h-[18px]" />
      <span className="flex-1">{item.label}</span>
    </Link>
  )
}

function isActive(pathname: string, href: string, base: string): boolean {
  // Overview matches exactly the base path; everything else nests.
  if (href === base) return pathname === base
  if (href === pathname) return true
  if (pathname.startsWith(`${href}/`)) return true
  return false
}
