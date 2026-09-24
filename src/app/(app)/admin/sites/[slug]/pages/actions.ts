'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'
import { homeBlocksForVertical } from '@/lib/starter-content'

type Result = { ok: true } | { ok: false; error: string }

const nextCopySlug = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number | string,
  baseSlug: string,
): Promise<string> => {
  const root = baseSlug === '/' ? '/copy' : `${baseSlug.replace(/-copy(-\d+)?$/, '')}-copy`
  let candidate = root
  let n = 2
  while (true) {
    const existing = await payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: candidate } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs.length === 0) return candidate
    candidate = `${root}-${n++}`
  }
}

export async function duplicatePage(args: { pageId: number | string; siteSlug: string }): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({ collection: 'pages', id: args.pageId, overrideAccess: true })
    if (!src) return { ok: false, error: 'page not found' }
    const siteId = typeof src.site === 'object' ? src.site.id : src.site
    const newSlug = await nextCopySlug(payload, siteId, src.slug)
    await payload.create({
      collection: 'pages',
      data: {
        site: siteId,
        title: `${src.title} (Copy)`,
        slug: newSlug,
        status: 'draft',
        template_key: src.template_key ?? 'custom',
        uses_shared_template: src.uses_shared_template ?? false,
        shared_template_overrides: src.shared_template_overrides ?? undefined,
        body_blocks: src.body_blocks ?? undefined,
        meta_title: src.meta_title ?? undefined,
        meta_description: src.meta_description ?? undefined,
        og_image_url: src.og_image_url ?? undefined,
        schema_json: src.schema_json ?? undefined,
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'duplicate failed' }
  }
}

// Create a new page from the branded /admin/ Create Page form. Keeps users out
// of the unstyled /cms admin for the most common authoring task.
export async function createPage(args: {
  siteId: number | string
  siteSlug: string
  title: string
  slug: string
  status: string
  template_key: string
}): Promise<{ ok: true; id: string | number } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const title = (args.title || '').trim()
  let slug = (args.slug || '').trim()
  if (!title) return { ok: false, error: 'Title is required' }
  if (!slug) return { ok: false, error: 'Slug is required' }
  if (slug !== '/' && !slug.startsWith('/')) slug = '/' + slug

  const payload = await getPayload({ config })
  try {
    const dup = await payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: args.siteId } }, { slug: { equals: slug } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.length > 0) return { ok: false, error: `A page with slug "${slug}" already exists on this site.` }

    const created = await payload.create({
      collection: 'pages',
      data: {
        site: args.siteId,
        title,
        slug,
        status: args.status || 'draft',
        template_key: args.template_key || 'custom',
        uses_shared_template: (args.template_key || 'custom') !== 'custom',
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true, id: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'create failed' }
  }
}

/**
 * Create a published Home `/` from the Brand's vertical starter if none exists.
 * Used to repair Brands that reached Ready without a Home, and by operators
 * who hit the publish-brand preflight.
 */
export async function ensurePublishedHomePage(args: {
  siteId: number | string
  siteSlug: string
}): Promise<{ ok: true; created: boolean; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  const site = await payload.findByID({ collection: 'sites', id: args.siteId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!site) return { ok: false, error: 'brand not found' }
  if (!isBoundToSite(user, site.id)) return { ok: false, error: 'not authorized for this brand' }

  const existing = await payload.find({
    collection: 'pages',
    where: { and: [{ site: { equals: site.id } }, { slug: { equals: '/' } }] },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    const row = existing.docs[0]
    if (row.status !== 'published') {
      await payload.update({
        collection: 'pages',
        id: row.id,
        data: { status: 'published', published_at: new Date().toISOString() } as never,
        user: user as never,
        overrideAccess: false,
      })
    }
    revalidatePath(`/admin/sites/${args.siteSlug}`)
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true, created: false, id: String(row.id) }
  }

  const vertical = typeof site.vertical === 'string' ? site.vertical : 'other'
  const body_blocks = homeBlocksForVertical(vertical)
  try {
    const created = await payload.create({
      collection: 'pages',
      data: {
        site: site.id,
        title: 'Home',
        slug: '/',
        status: 'published',
        template_key: 'home',
        uses_shared_template: false,
        body_blocks,
        published_blocks: body_blocks,
        published_at: new Date().toISOString(),
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}`)
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true, created: true, id: String(created.id) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not create Home' }
  }
}

// Update an existing page from the branded /admin/ Edit Page form (metadata
// only — body_blocks editing still happens in /cms for now).
export async function updatePage(args: {
  pageId: number | string
  siteSlug: string
  title: string
  slug: string
  status: string
  template_key: string
  uses_shared_template: boolean
  meta_title?: string
  meta_description?: string
  og_image_url?: string
}): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const title = (args.title || '').trim()
  let slug = (args.slug || '').trim()
  if (!title) return { ok: false, error: 'Title is required' }
  if (!slug) return { ok: false, error: 'Slug is required' }
  if (slug !== '/' && !slug.startsWith('/')) slug = '/' + slug

  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({ collection: 'pages', id: args.pageId, overrideAccess: true })
    if (!src) return { ok: false, error: 'page not found' }
    const siteId = typeof src.site === 'object' ? src.site.id : src.site

    // Slug uniqueness inside the site (excluding the current page itself).
    const dup = await payload.find({
      collection: 'pages',
      where: {
        and: [
          { site: { equals: siteId } },
          { slug: { equals: slug } },
          { id: { not_equals: args.pageId } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.length > 0) return { ok: false, error: `Another page on this site already uses slug "${slug}".` }

    await payload.update({
      collection: 'pages',
      id: args.pageId,
      data: {
        title,
        slug,
        status: args.status || 'draft',
        template_key: args.template_key || 'custom',
        uses_shared_template: args.template_key === 'custom' ? false : Boolean(args.uses_shared_template),
        meta_title: args.meta_title?.trim() || null,
        meta_description: args.meta_description?.trim() || null,
        og_image_url: args.og_image_url?.trim() || null,
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    revalidatePath(`/admin/sites/${args.siteSlug}/pages/${args.pageId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'update failed' }
  }
}

export async function deletePage(args: { pageId: number | string; siteSlug: string }): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const payload = await getPayload({ config })
  try {
    const src = await payload.findByID({ collection: 'pages', id: args.pageId, overrideAccess: true })
    if (!src) return { ok: false, error: 'page not found' }
    if (src.slug === '/') return { ok: false, error: 'cannot delete the home page' }
    await payload.delete({
      collection: 'pages',
      id: args.pageId,
      user: user as never,
      overrideAccess: false,
    })
    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' }
  }
}
