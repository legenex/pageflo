import { permanentRedirect } from 'next/navigation'

/**
 * `/admin/users` is the pre-rebrand route for the roster. The working screen is
 * `/admin/settings/users`.
 *
 * It redirects rather than rendering a placeholder that points somewhere else.
 * A bookmark, an old email link or a handbook page from before the move should
 * land on the real screen, not on a page that explains where the real screen
 * went. `permanentRedirect` issues a 308, which keeps the method and tells a
 * crawler the move is not temporary.
 */
export default function LegacyUsersRoute(): never {
  permanentRedirect('/admin/settings/users')
}
