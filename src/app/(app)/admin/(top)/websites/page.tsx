import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { FileText, Globe } from 'lucide-react'
import {
  Card,
  EmptyState,
  Mono,
  Page,
  PageHeader,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/pageflo/primitives'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Websites' }

const siteId = (value: unknown): number | string | null => {
  if (value == null) return null
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return (value as { id: number | string }).id
  }
  if (typeof value === 'number' || typeof value === 'string') return value
  return null
}

export default async function WebsitesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/websites')

  const payload = await getPayload({ config })
  const scoped = { user, overrideAccess: false } as const

  const [sites, pages] = await Promise.all([
    payload.find({ collection: 'sites', limit: 200, sort: 'name', depth: 0, ...scoped }),
    payload.find({ collection: 'pages', limit: 1000, depth: 0, ...scoped }),
  ])

  const counts = new Map<string, { all: number; published: number; privacy: boolean; terms: boolean }>()
  for (const raw of pages.docs) {
    const page = raw as unknown as Record<string, unknown>
    const sid = siteId(page.site)
    if (sid == null) continue
    const key = String(sid)
    const row = counts.get(key) ?? { all: 0, published: 0, privacy: false, terms: false }
    row.all += 1
    if (page.status === 'published') row.published += 1
    const slug = String(page.slug ?? '').replace(/^\//, '')
    const template = String(page.template_key ?? page.template ?? '')
    if (slug === 'privacy' || slug === 'privacy-policy' || template === 'privacy' || template === 'privacy-policy') {
      row.privacy = true
    }
    if (slug === 'terms' || slug === 'terms-of-service' || template === 'terms') row.terms = true
    counts.set(key, row)
  }

  return (
    <Page>
      <PageHeader
        title="Websites"
        subtitle="Each Brand owns a normal multi-page website, separate from reusable funnel masters."
      />
      <Card className="overflow-hidden">
        {sites.docs.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-[18px] w-[18px]" aria-hidden="true" />}
            title="No Brands yet"
            message="Create a Brand first. Its website pages are authored per Brand and published through the normal draft path."
            action={
              <Link
                href="/admin/sites"
                className="inline-flex items-center rounded-app border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface-3"
              >
                Open Brands
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <Tr>
                  <Th>Brand</Th>
                  <Th>Pages</Th>
                  <Th>Published</Th>
                  <Th>Privacy</Th>
                  <Th>Terms</Th>
                  <Th>Open</Th>
                </Tr>
              </thead>
              <tbody>
                {sites.docs.map((site) => {
                  const row = counts.get(String(site.id)) ?? {
                    all: 0,
                    published: 0,
                    privacy: false,
                    terms: false,
                  }
                  return (
                    <Tr key={String(site.id)}>
                      <Td>
                        <div className="font-semibold text-ink">{site.name}</div>
                        <Mono className="mt-0.5 block">{site.slug}</Mono>
                      </Td>
                      <Td>{row.all}</Td>
                      <Td>{row.published}</Td>
                      <Td>
                        <StatusPill label={row.privacy ? 'Hosted' : 'Missing'} tone={row.privacy ? 'pos' : 'warn'} />
                      </Td>
                      <Td>
                        <StatusPill label={row.terms ? 'Hosted' : 'Missing'} tone={row.terms ? 'pos' : 'warn'} />
                      </Td>
                      <Td>
                        <Link
                          href={`/admin/sites/${site.slug}/pages`}
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          Pages
                        </Link>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  )
}
