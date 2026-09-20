/**
 * Plan a bulk multi-brand deployment.
 *
 * One master, many Brands, one path. Each Brand is an isolated attempt: a path
 * collision or a missing binding on Brand 7 must not prevent Brand 8 from
 * receiving a draft. Preview URLs are derived from the canonical preview root
 * so the review screen shows the URL a visitor would actually open.
 */
import { previewHostForSlug } from '@/lib/pageflo/hosts'
import { normalizeDeploymentPath } from '@/lib/quiz-deployment-path'

export type BulkDeployKind = 'quiz' | 'lp' | 'advertorial'

export type BulkBrand = {
  id: number
  slug: string
  name: string
}

export type BulkDeployPlanItem = {
  brandId: number
  brandSlug: string
  brandName: string
  path: string
  previewUrl: string
}

export type BulkDeployAttempt =
  | { ok: true; brandId: number; brandName: string; deploymentId: string; previewUrl: string }
  | { ok: false; brandId: number; brandName: string; error: string; previewUrl: string }

export const previewUrlForBrandPath = (slug: string, path: string): string => {
  const normalized = normalizeDeploymentPath(path)
  const host = previewHostForSlug(slug)
  return `https://${host}${normalized === '/' ? '' : normalized}`
}

export const planBulkDeploy = (brands: BulkBrand[], path: string): BulkDeployPlanItem[] | { error: string } => {
  const normalized = normalizeDeploymentPath(path)
  if (!normalized || normalized === '/') {
    return { error: 'a deployment needs a path; "/" belongs to the Brand website' }
  }
  if (!/^\/[\w\-./]*$/.test(normalized)) {
    return { error: `"${path}" is not a valid path` }
  }
  if (brands.length === 0) return { error: 'select at least one Brand' }
  const seen = new Set<number>()
  const unique: BulkBrand[] = []
  for (const b of brands) {
    if (seen.has(b.id)) continue
    seen.add(b.id)
    unique.push(b)
  }
  return unique.map((b) => ({
    brandId: b.id,
    brandSlug: b.slug,
    brandName: b.name,
    path: normalized,
    previewUrl: previewUrlForBrandPath(b.slug, normalized),
  }))
}

/** True when the batch created at least one draft and also recorded at least one isolated failure. */
export const isPartialBulkSuccess = (attempts: BulkDeployAttempt[]): boolean =>
  attempts.some((a) => a.ok) && attempts.some((a) => !a.ok)
