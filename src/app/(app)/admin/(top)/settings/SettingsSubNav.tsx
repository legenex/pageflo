'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plug, Users, Activity } from 'lucide-react'

const TABS = [
  { href: '/admin/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/settings/users', label: 'Users', icon: Users },
  { href: '/admin/settings/system', label: 'System', icon: Activity },
] as const

export function SettingsSubNav() {
  const pathname = usePathname()
  return (
    // Padding matches the page frame, and the tab row scrolls inside itself.
    // At 390px three tabs plus a 40px gutter each side are wider than the
    // content column, and a nav that widens the page makes every screen under
    // it scroll sideways.
    <nav className="border-b border-border bg-surface-1 px-5 sm:px-7">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const Icon = tab.icon
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-medium transition-colors ${
                  active
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
