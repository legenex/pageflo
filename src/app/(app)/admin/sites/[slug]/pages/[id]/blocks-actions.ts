'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'

type Block = Record<string, unknown> & { id?: string; blockType?: string }
type Result = { ok: true } | { ok: false; error: string }

// Persists body_blocks + page metadata in one shot. The builder debounces on
// the client and calls this on every edit burst, so this just trusts the
// payload's structure and writes it as-is. body_blocks IS what the public
// BlockRenderer reads, so any save here is immediately visible on the public
// URL (on next page render).
export async function savePageBodyBlocks(args: {
  pageId: number | string
  siteSlug: string
  title: string
  slug: string
  status: string
  meta_title?: string | null
  meta_description?: string | null
  og_image_url?: string | null
  body_blocks: Block[]
  hidden_blocks?: string[]
  block_meta?: Record<string, { hide_mobile?: boolean; hide_desktop?: boolean }>
  publish_at?: string | null
  schema_json?: string | null
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
    const src = (await payload.findByID({
      collection: 'pages',
      id: args.pageId,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    if (!src) return { ok: false, error: 'page not found' }
    const siteRel = src.site as { id?: number } | number | undefined
    const siteId =
      typeof siteRel === 'object' && siteRel ? Number(siteRel.id) : Number(siteRel)

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
    if (dup.docs.length > 0) {
      return { ok: false, error: `Another page on this site already uses slug "${slug}".` }
    }

    await payload.update({
      collection: 'pages',
      id: args.pageId,
      data: {
        title,
        slug,
        status: args.status || 'draft',
        // The user explicitly opened the builder; force the row off the
        // shared-template render path so body_blocks drives both backend
        // preview and public render. Pages that previously rendered via
        // SharedLegalTemplates are still readable in the builder because
        // we seeded their first-open body_blocks from the template markdown.
        uses_shared_template: false,
        meta_title: args.meta_title?.trim() || null,
        meta_description: args.meta_description?.trim() || null,
        og_image_url: args.og_image_url?.trim() || null,
        body_blocks: Array.isArray(args.body_blocks) ? args.body_blocks : [],
        ...(args.status === 'published'
          ? {
              published_blocks: Array.isArray(args.body_blocks) ? args.body_blocks : [],
              published_at: new Date().toISOString(),
            }
          : {}),
        hidden_blocks: Array.isArray(args.hidden_blocks) ? args.hidden_blocks : [],
        block_meta:
          args.block_meta && typeof args.block_meta === 'object' ? args.block_meta : {},
        publish_at: args.publish_at ? new Date(args.publish_at).toISOString() : null,
        // schema_json comes from a textarea — accept JSON OR an empty string.
        // Parse failures are surfaced as a save error so the user sees the
        // problem before the page is saved with corrupt JSON-LD.
        schema_json: (() => {
          const raw = (args.schema_json || '').trim()
          if (!raw) return null
          try {
            return JSON.parse(raw)
          } catch (err) {
            throw new Error(
              `JSON-LD is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
            )
          }
        })(),
      } as never,
      user: user as never,
      overrideAccess: false,
    })

    revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
    revalidatePath(`/admin/sites/${args.siteSlug}/pages/${args.pageId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' }
  }
}
