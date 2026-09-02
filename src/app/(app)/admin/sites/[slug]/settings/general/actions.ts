'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { requireSiteAdmin } from '@/lib/authz'
import { invalidateHostCache } from '@/lib/site-resolver'
import { VERTICALS } from '@/lib/verticals'
import type { Site } from '@/payload-types'

/**
 * Accept only a known vertical; anything else falls back to the default.
 *
 * The narrow return type is Payload's own generated union, so adding a value to
 * `src/lib/verticals.ts` without the matching migration and `generate:types`
 * fails the typecheck here rather than at save time with a Postgres 22P02.
 */
const VERTICAL_VALUES = new Set<string>(VERTICALS.map((v) => v.value))
const coerceVertical = (raw: FormDataEntryValue | null): Site['vertical'] => {
  const value = String(raw ?? '')
  return VERTICAL_VALUES.has(value) ? (value as Site['vertical']) : 'multi'
}


const toTel = (display: string | null | undefined): string => {
  if (!display) return ''
  const digits = display.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

export async function saveGeneralSettings(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()

  const authz = requireSiteAdmin(user, formData.get('site_id'))
  if (!authz.ok) return authz.error === 'no site specified' ? { ok: false, error: 'missing site id' } : authz
  const siteId = authz.siteId

  const phoneDisplay = String(formData.get('default_phone') ?? '')

  const data = {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    tagline: String(formData.get('tagline') ?? ''),
    // Validated against the one list in src/lib/verticals.ts rather than cast.
    // A cast would have written whatever the form posted straight into a
    // Postgres enum column, where an unknown value is a 22P02 at save time.
    vertical: coerceVertical(formData.get('vertical')),
    org_name: String(formData.get('org_name') ?? ''),
    org_address: String(formData.get('org_address') ?? ''),
    support_email: String(formData.get('support_email') ?? ''),
    default_phone: phoneDisplay,
    default_phone_tel: toTel(phoneDisplay),
    default_disclaimer_md: String(formData.get('default_disclaimer_md') ?? ''),
    brand: {
      logo_url: String(formData.get('logo_url') ?? '') || null,
      favicon_url: String(formData.get('favicon_url') ?? '') || null,
      primary: String(formData.get('primary') ?? '#0B1F3A'),
      accent: String(formData.get('accent') ?? '#E8B14B'),
      surface: String(formData.get('surface') ?? '#F7F5F0'),
      ink: String(formData.get('ink') ?? '#0E1116'),
      muted: String(formData.get('muted') ?? '#5C6470'),
      font_heading: String(formData.get('font_heading') ?? 'Inter'),
      font_body: String(formData.get('font_body') ?? 'Inter'),
    },
  }

  const payload = await getPayload({ config })
  await payload.update({
    collection: 'sites',
    id: siteId,
    data,
    user: user as never,
    overrideAccess: false,
  })

  revalidatePath(`/admin/sites/${data.slug}/settings/general`)
  return { ok: true }
}

/* --------------------------------- Publication --------------------------------- */

/**
 * Site publication, as an explicit operator act.
 *
 * A Site's status used to change by side effect in two places: the SSL poller
 * promoted 'draft' to 'active' from a detached background promise, and the site
 * dashboard did the same from a GET render. Both are gone, which left no way at
 * all to publish a Site — this is that way.
 *
 * Transitions are enumerated rather than "accept whatever status was posted",
 * because the four states are not interchangeable:
 *
 *   draft   → active   publish for the first time
 *   active  ⇄ paused   temporary, reversible, keeps configuration
 *   *       → archived a decision, and NOT the same as unpublishing
 *
 * Archived is deliberately terminal here. Un-archiving is a restore, not a
 * status flip, and giving it the same door as "unpause" is how a brand comes
 * back online by accident.
 */
export type SiteStatus = 'draft' | 'active' | 'paused' | 'archived'

const ALLOWED_TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
}

export async function setSiteStatus(args: {
  siteId: number | string
  /** The status the operator believes is current. Guards against acting on a stale screen. */
  from: SiteStatus
  to: SiteStatus
}): Promise<{ ok: true; status: SiteStatus } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  const authz = requireSiteAdmin(user, args.siteId)
  if (!authz.ok) return authz

  const payload = await getPayload({ config })
  let site: { id: number | string; slug?: string | null; status?: string | null } | null = null
  try {
    site = await payload.findByID({ collection: 'sites', id: authz.siteId, overrideAccess: true })
  } catch {
    site = null
  }
  if (!site) return { ok: false, error: 'site not found' }

  const current = (site.status ?? 'draft') as SiteStatus
  // The operator acted on a screen that may be minutes old. Refusing a stale
  // transition is the difference between "publish this draft" and "republish
  // something a colleague paused thirty seconds ago".
  if (current !== args.from) {
    return { ok: false, error: `site is now ${current}, not ${args.from} — reload and try again` }
  }
  if (current === args.to) return { ok: true, status: current }
  if (!ALLOWED_TRANSITIONS[current].includes(args.to)) {
    return { ok: false, error: `cannot go from ${current} to ${args.to}` }
  }

  await payload.update({
    collection: 'sites',
    id: authz.siteId,
    data: { status: args.to } as never,
    user: user as never,
    overrideAccess: false,
  })
  // The resolver caches primaryHost/redirectTo per host for 60s and does not key
  // on Site status, so a paused Site would keep serving from cache without this.
  invalidateHostCache()
  if (site.slug) revalidatePath(`/admin/sites/${site.slug}`)
  return { ok: true, status: args.to }
}
