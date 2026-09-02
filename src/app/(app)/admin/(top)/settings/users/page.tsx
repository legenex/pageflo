import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { Card, DeniedState, Page, PageHeader } from '@/components/pageflo/primitives'
import { UsersClient, type UserRow, type SiteOption } from './UsersClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function UsersPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/sign-in?next=/admin/settings/users')

  if (!me.super_admin) {
    return (
      <Page>
        <PageHeader
          title="Users"
          subtitle={`The ${PRODUCT_NAME} account roster and per-Site role bindings.`}
        />
        <Card>
          <DeniedState
            what="Users"
            message="Granting access to a Site grants access to that Site's leads, which carry personal data. Only a workspace owner can change the roster. Ask an owner to add the account you need."
          />
        </Card>
      </Page>
    )
  }

  const payload = await getPayload({ config })

  const [usersRes, sitesRes] = await Promise.all([
    payload.find({
      collection: 'users',
      sort: '-createdAt',
      limit: 500,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'sites',
      sort: 'name',
      limit: 500,
      overrideAccess: true,
    }),
  ])

  const sites: SiteOption[] = sitesRes.docs.map((s) => ({
    id: Number(s.id),
    name: s.name,
    slug: s.slug,
  }))

  const users: UserRow[] = usersRes.docs.map((u) => {
    const bindings = (u as { siteBindings?: Array<{ site: unknown; role: 'admin' | 'editor' | 'analyst' }> }).siteBindings ?? []
    return {
      id: String(u.id),
      email: u.email,
      name: (u as { name?: string }).name ?? '',
      super_admin: Boolean((u as { super_admin?: boolean }).super_admin),
      status: ((u as { status?: 'invited' | 'active' | 'disabled' }).status ?? 'active'),
      last_login_at: (u as { last_login_at?: string | null }).last_login_at ?? null,
      created_at: (u as { createdAt?: string }).createdAt ?? null,
      bindings: bindings.map((b) => {
        const site = b.site
        const siteId =
          site && typeof site === 'object'
            ? Number((site as { id?: string | number }).id)
            : Number(site)
        return { site: siteId, role: b.role }
      }),
    }
  })

  return <UsersClient meId={String(me.id)} users={users} sites={sites} />
}
