import { getPayload } from 'payload'
import config from '@payload-config'
import { BrandIdentitiesApp } from '@/components/builder/brand/BrandModule'
import { buildBrandsFromSites } from '@/lib/brand-map'

export const dynamic = 'force-dynamic'

export default async function BrandIdentitiesPage() {
  const payload = await getPayload({ config })
  const [sitesRes, domainsRes] = await Promise.all([
    payload.find({ collection: 'sites', limit: 500, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'domains', limit: 1000, sort: ['-primary'], overrideAccess: true }),
  ])

  const brands = buildBrandsFromSites(
    sitesRes.docs as unknown as Array<Record<string, unknown>>,
    domainsRes.docs as unknown as Array<Record<string, unknown>>,
  )

  return (
    <div>
      <div className="px-5 pt-5 sm:px-7">
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[13px] text-[var(--color-ink)] leading-relaxed">
          This extractor can fill a Brand from a URL or a description. Canonical identity is Brand
          General Settings. Saves here write the same Brand document: name, colours, phone, and legal
          copy.
        </p>
      </div>
      <BrandIdentitiesApp initialBrands={brands} />
    </div>
  )
}
