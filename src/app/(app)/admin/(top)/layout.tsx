import type { ReactNode } from 'react'
import { Sidebar } from '@/components/app/Sidebar'
import { getCurrentUser, type AuthedUser } from '@/lib/auth'

/**
 * The role shown on the account card.
 *
 * This is a statement of fact about the signed-in account, derived from the same
 * `super_admin` flag and `siteBindings[]` the access helpers use. It is not a
 * control: PageFlo has no role impersonation, so there is nothing to switch to.
 */
const describeRole = (user: AuthedUser | null): string => {
  if (!user) return ''
  if (user.super_admin) return 'Owner · all brands'
  const bindings = user.siteBindings ?? []
  if (bindings.length === 0) return 'No brand access'
  const roles = Array.from(new Set(bindings.map((b) => b.role)))
  const role = roles.length === 1 ? roles[0] : 'mixed roles'
  const scope = bindings.length === 1 ? '1 brand' : `${bindings.length} brands`
  return `${role.charAt(0).toUpperCase()}${role.slice(1)} · ${scope}`
}

export default async function TopAdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  return (
    <>
      <Sidebar userEmail={user?.email ?? ''} roleLabel={describeRole(user)} />
      {/*
        * `overflow-x-clip` is the shell's guarantee that the CONSOLE never
        * scrolls sideways, whatever a page does inside it.
        *
        * Measured, not assumed: a Sites list of real rows moved the window
        * 579px at 390px wide even though every ancestor of the table reported
        * `scrollWidth === clientWidth` and the table itself sat correctly
        * inside its own `overflow-x-auto` scroller. The layout was right and
        * the viewport was picking the overflow up anyway.
        *
        * `clip`, not `hidden`: `overflow-x: hidden` forces the other axis to
        * `auto` as well, which would turn `main` into a scroll container and
        * break `position: sticky` inside it. `clip` clips one axis and leaves
        * the other genuinely visible.
        *
        * It does not create a containing block, so the builders' fixed-position
        * modals and toasts are unaffected. `scripts/test-console-walk.mts`
        * still asserts separately that no UNCLIPPED element extends past the
        * viewport, so this cannot hide a real over-wide element.
        */}
      <main className="min-w-0 flex-1 overflow-x-clip bg-canvas">{children}</main>
    </>
  )
}
