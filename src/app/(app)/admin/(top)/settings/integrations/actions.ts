'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

type ActionResult = { ok: true } | { ok: false; error: string }

const requireSuperAdmin = async () => {
  const user = await getCurrentUser()
  if (!user) return { ok: false as const, error: 'unauthenticated' }
  if (!user.super_admin) return { ok: false as const, error: 'forbidden — super admin required' }
  return { ok: true as const, user }
}

const parseArray = <T>(raw: FormDataEntryValue | null): T[] => {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export async function saveIntegrationConfig(formData: FormData): Promise<ActionResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const payload = await getPayload({ config })

  const slackWebhooks = parseArray<{ label: string; url: string; events?: string }>(formData.get('slack_webhooks'))
  const githubRepos = parseArray<{ site?: number | string | null; repo_url?: string }>(formData.get('github_repos'))

  const data = {
    smtp: {
      host: String(formData.get('smtp_host') ?? '') || null,
      port: Number(formData.get('smtp_port') ?? 587),
      user: String(formData.get('smtp_user') ?? '') || null,
      pass: String(formData.get('smtp_pass') ?? '') || null,
      from_name: String(formData.get('smtp_from_name') ?? PRODUCT_NAME),
      from_email: String(formData.get('smtp_from_email') ?? 'noreply@legenex.com'),
    },
    slack: {
      webhooks: slackWebhooks
        .filter((w) => w.label && w.url)
        .map((w) => ({ label: w.label, url: w.url, events: w.events ?? '' })),
    },
    github: {
      repos: githubRepos
        .filter((r) => r.repo_url)
        .map((r) => ({
          site: r.site ? Number(r.site) : null,
          repo_url: r.repo_url ?? '',
        })),
    },
    search_console_root: {
      verification_method: String(formData.get('sc_method') ?? '') || null,
      verification_token: String(formData.get('sc_token') ?? '') || null,
    },
    billing: {
      plan: String(formData.get('billing_plan') ?? 'internal'),
      notes: String(formData.get('billing_notes') ?? ''),
    },
  }

  try {
    await payload.updateGlobal({
      slug: 'integration-config',
      data: data as never,
      user: auth.user as never,
      overrideAccess: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save'
    return { ok: false, error: msg }
  }

  revalidatePath('/admin/settings/integrations')
  return { ok: true }
}
