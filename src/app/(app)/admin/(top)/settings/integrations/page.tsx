import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { Card, DeniedState, Page, PageHeader } from '@/components/pageflo/primitives'
import { IntegrationsForm, type SiteOption } from './IntegrationsForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function IntegrationsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/sign-in?next=/admin/settings/integrations')

  if (!me.super_admin) {
    return (
      <Page>
        <PageHeader
          title="Integrations"
          subtitle={`Workspace-wide outbound connections for ${PRODUCT_NAME}: SMTP, Slack, repositories and Search Console.`}
        />
        <Card>
          <DeniedState
            what="Integrations"
            message="These credentials are workspace-wide, so changing one changes behaviour for every Site. Only a workspace owner can edit them. Ask an owner to make the change, or to grant your account owner access."
          />
        </Card>
      </Page>
    )
  }

  const payload = await getPayload({ config })
  const [cfg, sitesRes] = await Promise.all([
    payload.findGlobal({ slug: 'integration-config', overrideAccess: true }),
    payload.find({ collection: 'sites', sort: 'name', limit: 500, overrideAccess: true }),
  ])

  const sites: SiteOption[] = sitesRes.docs.map((s) => ({ id: Number(s.id), name: s.name }))

  const smtp = (cfg as { smtp?: Record<string, unknown> }).smtp ?? {}
  const slack = (cfg as { slack?: { webhooks?: Array<{ label?: string; url?: string; events?: string }> } }).slack ?? {}
  const github = (cfg as { github?: { repos?: Array<{ site?: { id?: number | string } | number | string | null; repo_url?: string }> } }).github ?? {}
  const sc = (cfg as { search_console_root?: { verification_method?: string; verification_token?: string } }).search_console_root ?? {}
  const billing = (cfg as { billing?: { plan?: string; notes?: string } }).billing ?? {}

  return (
    <IntegrationsForm
      sites={sites}
      initial={{
        smtp: {
          host: (smtp.host as string) ?? '',
          port: Number(smtp.port ?? 587),
          user: (smtp.user as string) ?? '',
          pass: (smtp.pass as string) ?? '',
          from_name: (smtp.from_name as string) ?? PRODUCT_NAME,
          from_email: (smtp.from_email as string) ?? 'noreply@legenex.com',
        },
        slack_webhooks: (slack.webhooks ?? []).map((w) => ({
          label: w.label ?? '',
          url: w.url ?? '',
          events: w.events ?? '',
        })),
        github_repos: (github.repos ?? []).map((r) => {
          const s = r.site
          const siteId =
            s && typeof s === 'object'
              ? Number((s as { id?: string | number }).id)
              : s != null
                ? Number(s)
                : null
          return { site: siteId, repo_url: r.repo_url ?? '' }
        }),
        sc: {
          method: sc.verification_method ?? '',
          token: sc.verification_token ?? '',
        },
        billing: { plan: billing.plan ?? 'internal', notes: billing.notes ?? '' },
      }}
    />
  )
}
