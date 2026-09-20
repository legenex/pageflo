'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser, isBoundToSite } from '@/lib/auth'
import { requireDeploymentSiteAdmin } from '@/lib/authz'
import { checkPathAvailable, type ClaimKind } from '@/lib/path-claims'
import { normalizeDeploymentPath } from '@/lib/quiz-deployment-path'
import {
  planBulkDeploy,
  previewUrlForBrandPath,
  type BulkDeployAttempt,
  type BulkDeployKind,
} from '@/lib/bulk-deploy'
import { resolveQuizTemplateSelection } from '@/lib/template-records/select'

const PATH = '/admin/deployments'

const KIND_COLLECTION: Record<BulkDeployKind, string> = {
  quiz: 'funnel-quiz-deployments',
  lp: 'funnel-lp-deployments',
  advertorial: 'funnel-advertorial-deployments',
}

const KIND_CLAIM: Record<BulkDeployKind, ClaimKind> = {
  quiz: 'quiz-deployment',
  lp: 'lp-deployment',
  advertorial: 'advertorial-deployment',
}

const KIND_MASTER: Record<BulkDeployKind, string> = {
  quiz: 'funnel-quizzes',
  lp: 'funnel-landing-pages',
  advertorial: 'funnel-advertorials',
}

export async function bulkDeployMaster(args: {
  kind: BulkDeployKind
  masterId: string
  brandIds: string[]
  path: string
  name?: string
}): Promise<{ ok: true; attempts: BulkDeployAttempt[] } | { ok: false; error: string; attempts: BulkDeployAttempt[] }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated', attempts: [] }

  const kind = args.kind
  if (kind !== 'quiz' && kind !== 'lp' && kind !== 'advertorial') {
    return { ok: false, error: 'unknown deployment kind', attempts: [] }
  }

  const payload = await getPayload({ config })
  const masterId = Number(args.masterId)
  if (!Number.isFinite(masterId)) return { ok: false, error: 'master not found', attempts: [] }

  const master = await payload
    .findByID({ collection: KIND_MASTER[kind] as never, id: masterId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!master) return { ok: false, error: 'master not found', attempts: [] }

  const brandIds = Array.from(new Set((args.brandIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n))))
  const brandDocs = []
  for (const id of brandIds) {
    const site = await payload.findByID({ collection: 'sites', id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!site) continue
    brandDocs.push({
      id,
      slug: String((site as { slug?: string }).slug || ''),
      name: String((site as { name?: string }).name || `Brand ${id}`),
    })
  }

  const plan = planBulkDeploy(brandDocs, args.path)
  if ('error' in plan) return { ok: false, error: plan.error, attempts: [] }

  let quizTemplateId = 'sq_quiz_first'
  if (kind === 'quiz') {
    const picked = await resolveQuizTemplateSelection(payload, quizTemplateId, '')
    if (!picked.ok) return { ok: false, error: picked.error, attempts: [] }
    quizTemplateId = picked.id
  }

  const attempts: BulkDeployAttempt[] = []
  const masterName =
    String((master as { name?: string; title?: string }).name || (master as { title?: string }).title || 'master')
  const label = args.name?.trim() || masterName

  for (const item of plan) {
    const previewUrl = item.previewUrl
    try {
      if (!isBoundToSite(user, item.brandId) && !user.super_admin) {
        attempts.push({ ok: false, brandId: item.brandId, brandName: item.brandName, error: 'not bound to this Brand', previewUrl })
        continue
      }

      const gate = await requireDeploymentSiteAdmin(payload, user, {
        collection: KIND_COLLECTION[kind] as never,
        incomingSiteId: item.brandId,
      })
      if (!gate.ok) {
        attempts.push({ ok: false, brandId: item.brandId, brandName: item.brandName, error: gate.error, previewUrl })
        continue
      }

      const availability = await checkPathAvailable(payload, {
        siteId: item.brandId,
        domainId: null,
        path: item.path,
        kind: KIND_CLAIM[kind],
        live: false,
      })
      if (!availability.ok) {
        attempts.push({ ok: false, brandId: item.brandId, brandName: item.brandName, error: availability.error, previewUrl })
        continue
      }

      const data: Record<string, unknown> = {
        name: `${label} · ${item.brandName}`,
        site: item.brandId,
        path: normalizeDeploymentPath(item.path),
        status: 'draft',
      }
      if (kind === 'quiz') {
        data.quiz = masterId
        data.template_id = quizTemplateId
        data.render_mode = 'standalone'
      } else if (kind === 'lp') {
        data.landing_page = masterId
      } else {
        data.advertorial = masterId
        data.cta_mode = 'button'
      }

      const created = await payload.create({
        collection: KIND_COLLECTION[kind] as never,
        data: data as never,
        user,
        overrideAccess: false,
      })
      attempts.push({
        ok: true,
        brandId: item.brandId,
        brandName: item.brandName,
        deploymentId: String((created as { id: unknown }).id),
        previewUrl: previewUrlForBrandPath(item.brandSlug, item.path),
      })
    } catch (err) {
      attempts.push({
        ok: false,
        brandId: item.brandId,
        brandName: item.brandName,
        error: err instanceof Error ? err.message : 'create failed',
        previewUrl,
      })
    }
  }

  revalidatePath(PATH)
  const anyOk = attempts.some((a) => a.ok)
  if (!anyOk) {
    return { ok: false, error: 'no Brand received a draft', attempts }
  }
  return { ok: true, attempts }
}
