import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, ChevronRight, Plug, UserCircle, Users } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { Card, Eyebrow, Page, PageHeader, StatusPill } from '@/components/pageflo/primitives'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings' }

type Entry = {
  href: string
  label: string
  blurb: string
  icon: typeof Plug
  /** True when the screen is super-admin only. Shown, not hidden. */
  superAdminOnly?: boolean
}

/**
 * Settings index.
 *
 * This used to be a placeholder that told the reader to go somewhere else. It
 * is now the index it was always meant to be: the three workspace settings
 * screens plus the personal one, each with what it actually controls.
 *
 * Super-admin-only screens are shown to everyone with a visible lock rather
 * than hidden. An editor who cannot find Users concludes the feature is
 * missing; an editor who sees "Owner only" knows exactly who to ask.
 */
const ENTRIES: Entry[] = [
  {
    href: '/admin/settings/integrations',
    label: 'Integrations',
    blurb:
      'Workspace-wide outbound connections: SMTP delivery, Slack lead notifications, repository links and Search Console verification. Per-Site pixel and tracking configuration lives on the Site, not here.',
    icon: Plug,
    superAdminOnly: true,
  },
  {
    href: '/admin/settings/users',
    label: 'Users',
    blurb:
      'The account roster and per-Site role bindings. A user is granted admin, editor or analyst on each Site individually; there is no workspace-wide role except owner.',
    icon: Users,
    superAdminOnly: true,
  },
  {
    href: '/admin/settings/system',
    label: 'System health',
    blurb:
      'Live checks against the real dependencies: deployed commit, runtime, database, cache, integration credentials, DNS and certificates. Every check reports what it observed.',
    icon: Activity,
  },
  {
    href: '/admin/profile',
    label: 'Profile',
    blurb:
      'Your own account: name, title, timezone and avatar. These apply to your login only and are never workspace settings.',
    icon: UserCircle,
  },
]

export default async function SettingsIndexPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/sign-in?next=/admin/settings')

  return (
    <Page>
      <PageHeader
        title="Settings"
        subtitle={`${PRODUCT_NAME} workspace configuration. Site-specific settings live inside each Site.`}
      />

      <div className="grid gap-2.5 sm:grid-cols-2">
        {ENTRIES.map((entry) => {
          const locked = Boolean(entry.superAdminOnly) && !me.super_admin
          const Icon = entry.icon
          return (
            <Card key={entry.href} as="div" className="group relative">
              <Link href={entry.href} className="flex h-full flex-col gap-2 rounded-app-lg p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-app border border-border bg-surface-1 text-ink-muted">
                    <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
                  </span>
                  <span className="text-[14px] font-semibold text-ink">{entry.label}</span>
                  {locked ? (
                    <span className="ml-auto">
                      <StatusPill label="Owner only" tone="warn" dot={false} />
                    </span>
                  ) : (
                    <ChevronRight
                      className="ml-auto h-4 w-4 shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="text-[12.5px] leading-[1.6] text-ink-muted">{entry.blurb}</p>
              </Link>
            </Card>
          )
        })}
      </div>

      <Card className="mt-2.5 p-3.5">
        <Eyebrow className="mb-1.5 block">Where else settings live</Eyebrow>
        <p className="text-[12.5px] leading-[1.6] text-ink-muted">
          Anything that belongs to one brand is configured inside that Site: general details, domains, path routing, SEO,
          tracking pixels, phone numbers and deletion. Open a Site from{' '}
          <Link href="/admin/sites" className="text-info hover:underline">
            Sites
          </Link>{' '}
          and use its own settings rail.
        </p>
      </Card>
    </Page>
  )
}
