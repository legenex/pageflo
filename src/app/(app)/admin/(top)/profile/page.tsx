import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/pageflo/primitives'
import { ProfileForm } from './ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile' }

type UserExtra = {
  avatar_url?: string | null
  bio?: string | null
  title?: string | null
  timezone?: string | null
}

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/profile')
  const extra = user as unknown as UserExtra

  return (
    <Page>
      <PageHeader
        title="Profile"
        subtitle="Your own account. These settings apply to your login only and are never workspace settings."
      />
      <ProfileForm
        initial={{
          name: user.name ?? '',
          email: user.email ?? '',
          avatar_url: extra.avatar_url ?? '',
          bio: extra.bio ?? '',
          title: extra.title ?? '',
          timezone: extra.timezone ?? '',
        }}
      />
    </Page>
  )
}
