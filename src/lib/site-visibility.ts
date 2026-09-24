/**
 * Whether a Brand may be served on this host without an authenticated binding.
 *
 * Custom domains stay closed until the Brand is `active`. Preview hosts exist
 * so an operator can review a draft before that, and the console cookie does
 * not follow onto `{slug}.preview.pageflo.io`, so requiring a session there
 * 404s every new Brand.
 */
import { isPreviewHost } from '@/lib/pageflo/hosts'

export const brandIsArchived = (status: string | null | undefined): boolean => status === 'archived'

export const brandServesOnHost = (
  status: string | null | undefined,
  host: string | null | undefined,
): boolean => {
  if (!status || status === 'archived') return false
  if (status === 'active') return true
  return isPreviewHost(host)
}
