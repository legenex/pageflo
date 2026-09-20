'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'
import { extractBlocksFromHtml } from '@/lib/builder/html-to-blocks'
import { safeFetch } from '@/lib/net/ssrf'
import { mapWordpressPages, wordpressRestUrl } from '@/lib/site-builder/wordpress-import'

type Result = { ok: true; count: number } | { ok: false; error: string }

export async function importWordpressSite(args: {
  siteId: number | string
  siteSlug: string
  origin: string
}): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!isBoundToSite(user, args.siteId)) return { ok: false, error: 'forbidden' }

  let restUrl: string
  try {
    restUrl = wordpressRestUrl(args.origin)
  } catch {
    return { ok: false, error: 'WordPress origin is not a valid URL' }
  }

  const fetched = await safeFetch(restUrl)
  if (!fetched.ok) return { ok: false, error: fetched.reason }

  let payloadJson: unknown
  try {
    payloadJson = JSON.parse(fetched.body)
  } catch {
    return { ok: false, error: 'WordPress REST did not return JSON' }
  }

  const pages = mapWordpressPages(payloadJson)
  if (pages.length === 0) return { ok: false, error: 'No published WordPress pages were returned' }

  const payload = await getPayload({ config })
  let count = 0
  for (const page of pages) {
    const dup = await payload.find({
      collection: 'pages',
      where: { and: [{ site: { equals: args.siteId } }, { slug: { equals: page.slug } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.length > 0) continue
    const extracted = extractBlocksFromHtml(page.html)
    await payload.create({
      collection: 'pages',
      data: {
        site: args.siteId,
        title: page.title,
        slug: page.slug,
        status: 'draft',
        template_key: 'custom',
        uses_shared_template: false,
        body_blocks: extracted.blocks,
      } as never,
      user: user as never,
      overrideAccess: false,
    })
    count += 1
  }

  revalidatePath(`/admin/sites/${args.siteSlug}/pages`)
  return { ok: true, count }
}
