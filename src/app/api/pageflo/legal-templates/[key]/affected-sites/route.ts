// Returns the list of Sites that have at least one Page using the given shared legal template.
// The admin uses this to populate the confirm modal before saving a SharedLegalTemplate edit.

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  // A real session check — the previous "any cookie present" gate let any
  // request carrying any cookie read the cross-tenant list of affected sites.
  const user = await getCurrentUser()
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const payload = await getPayload({ config })
  const pages = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { template_key: { equals: key } },
        { uses_shared_template: { equals: true } },
      ],
    },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })

  const siteMap = new Map<string | number, { id: string | number; name: string; slug: string }>()
  for (const p of pages.docs) {
    const s = p.site as { id: string | number; name: string; slug: string } | string | number
    if (typeof s === 'object') siteMap.set(s.id, { id: s.id, name: s.name, slug: s.slug })
  }
  return NextResponse.json({
    template_key: key,
    affected_sites: Array.from(siteMap.values()),
    affected_pages: pages.totalDocs,
  })
}
