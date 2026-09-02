import Link from 'next/link'
import { Users } from 'lucide-react'
import { ComingSoon, Page, PageHeader } from '@/components/pageflo/primitives'

export const metadata = { title: 'Site users' }

type Props = { params: Promise<{ slug: string }> }

/**
 * Per-Site role bindings do not have their own screen yet.
 *
 * The BINDINGS themselves are real and enforced: `Users.siteBindings[]` is what
 * every access helper filters on, and the workspace Users screen edits them.
 * What is missing is a version of that screen scoped to one Site, which is what
 * would let a Site admin manage their own team without workspace ownership.
 */
export default async function SiteUsersPage({ params }: Props) {
  const { slug } = await params
  return (
    <Page className="max-w-[900px]">
      <PageHeader title="Users" subtitle="Who can work on this Site, and with which role." />
      <ComingSoon
        icon={<Users className="h-[22px] w-[22px]" aria-hidden="true" />}
        title="Site-scoped user management is not built yet"
        body="Role bindings for this Site are real and enforced today: admin, editor and analyst are what every access rule filters on. They are edited on the workspace Users screen, which lists every account and every Site they are bound to."
        waitingFor="a Site-scoped version of that screen. Today only a workspace owner can change bindings, which means a Site admin cannot add an editor to their own brand without asking one."
        preview={
          <Link
            href="/admin/settings/users"
            className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            Open workspace Users
          </Link>
        }
      />
    </Page>
  )
}
