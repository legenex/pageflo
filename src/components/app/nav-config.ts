import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Globe,
  HelpCircle,
  Inbox,
  LayoutGrid,
  Megaphone,
  Plug,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react'

export type NavIcon = typeof LayoutGrid

export type NavChild = {
  href: string
  label: string
  icon: NavIcon
  /** Marks the child as the group's own landing route for active matching. */
  exact?: boolean
}

export type NavGroup = {
  /** Stable key. Persisted in localStorage, so changing it resets a user's open groups. */
  key: string
  label: string
  href: string
  icon: NavIcon
  /** Rendered as a small uppercase chip. Only ever a factual state, never decoration. */
  badge?: string
  children?: NavChild[]
  /** Extra path prefixes that should light this group up, e.g. a builder route. */
  alsoActiveOn?: string[]
}

/**
 * The console's navigation.
 *
 * Every href below resolves to a route that exists. The two `Soon` entries lead
 * to real pages that say what they are waiting for; they are not dead links and
 * they are not disabled controls, because a disabled nav item tells a user
 * nothing about when the thing arrives.
 *
 * Lead status children are query-string filters on the real Leads page rather
 * than invented routes, so the sub-navigation and the page cannot disagree.
 */
export const NAV: NavGroup[] = [
  { key: 'overview', label: 'Overview', href: '/admin/overview', icon: LayoutGrid },
  // Leads has no children here on purpose. Its status views carry live counts,
  // which a sidebar cannot show without a query on every page load, so they live
  // in the page's own sub-navigation rail instead. Two lists of the same six
  // links, one of them without the counts, would be worse than one.
  { key: 'leads', label: 'Leads', href: '/admin/leads', icon: Inbox },
  {
    key: 'sites',
    label: 'Sites',
    href: '/admin/sites',
    icon: Globe,
    children: [
      { href: '/admin/sites', label: 'All Sites', icon: Globe, exact: true },
      { href: '/admin/brands/domains', label: 'Domains', icon: Globe },
      { href: '/admin/brands/brand-identities', label: 'Brand Kits', icon: Building2 },
    ],
  },
  {
    key: 'quizzes',
    label: 'Quizzes',
    href: '/admin/quizzes',
    icon: HelpCircle,
    alsoActiveOn: ['/admin/quizzes'],
  },
  {
    key: 'pages',
    label: 'Landing Pages',
    href: '/admin/landing-pages',
    icon: Rocket,
    children: [
      { href: '/admin/landing-pages', label: 'All Landing Pages', icon: Rocket, exact: true },
      { href: '/admin/advertorials', label: 'Advertorials', icon: Megaphone },
    ],
  },
  { key: 'analytics', label: 'Analytics', href: '/admin/analytics', icon: BarChart3, badge: 'Soon' },
  { key: 'integrity', label: 'Campaign Integrity', href: '/admin/integrity', icon: ShieldCheck, badge: 'Soon' },
  {
    key: 'tools',
    label: 'Tools',
    href: '/admin/system',
    icon: Wrench,
    children: [
      { href: '/admin/system', label: 'System', icon: Activity, exact: true },
      { href: '/admin/plan', label: 'Agent Plan', icon: Bot },
      { href: '/admin/buildlog', label: 'Build Log', icon: ScrollText },
      { href: '/admin/handbook', label: 'Handbook', icon: BookOpen },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings/integrations',
    icon: Settings,
    children: [
      { href: '/admin/settings/integrations', label: 'Integrations', icon: Plug },
      { href: '/admin/settings/users', label: 'Users', icon: Users },
      { href: '/admin/settings/system', label: 'System health', icon: Activity },
      { href: '/admin/profile', label: 'Profile', icon: Users },
    ],
  },
]

/** Group keys that own children, for Collapse All / Expand All. */
export const GROUP_KEYS_WITH_CHILDREN = NAV.filter((g) => g.children?.length).map((g) => g.key)

/** Path-only comparison; a query string never changes which route is mounted. */
const pathOf = (href: string): string => href.split('?')[0]

export const isChildActive = (pathname: string, search: string, child: NavChild): boolean => {
  if (pathOf(child.href) !== pathname) return false
  const q = child.href.includes('?') ? child.href.split('?')[1] : ''
  if (child.exact) return search === '' || !search.includes('status=')
  return search.includes(q)
}

export const isGroupActive = (pathname: string, group: NavGroup): boolean => {
  const own = pathOf(group.href)
  if (pathname === own || pathname.startsWith(`${own}/`)) return true
  if (group.alsoActiveOn?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  return Boolean(group.children?.some((c) => {
    const p = pathOf(c.href)
    return pathname === p || pathname.startsWith(`${p}/`)
  }))
}
