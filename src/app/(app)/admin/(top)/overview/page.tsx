import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  Activity,
  AlertTriangle,
  FileText,
  Globe,
  Inbox,
  Layers,
  Link2,
  Rocket,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react'
import {
  Card,
  EmptyState,
  Eyebrow,
  MetricCard,
  MetricGrid,
  Mono,
  Page,
  PageHeader,
  SectionHeader,
  StatusPill,
  type Tone,
} from '@/components/pageflo/primitives'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

export const dynamic = 'force-dynamic'

const fmt = (d: string | Date | null | undefined): string => {
  if (!d) return 'Not set'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-GB', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

type DeploymentRow = {
  key: string
  asset: string
  kind: string
  site: string
  brandColor: string | null
  path: string
  state: string
  tone: Tone
}

export default async function OverviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/overview')

  const payload = await getPayload({ config })

  /*
   * Read as the signed-in user, not with overrideAccess.
   *
   * This page counts across every tenant, so it is exactly the place a scoping
   * mistake shows up as one brand's operator seeing another brand's numbers.
   * Passing the real user makes the per-collection access rules the single
   * arbiter. Where a collection has no site scoping yet (the Funnel* family,
   * tracked as phase 7 work), that is a known gap recorded in
   * docs/REQUIREMENTS.md, not something this page papers over.
   */
  const scoped = { user, overrideAccess: false } as const

  const [
    sitesActive,
    sitesAll,
    sitesPaused,
    sitesDraft,
    pagesPublished,
    pagesAll,
    lpAll,
    quizAll,
    leadsTotal,
    leadsRecent,
    leadsFailed,
    domainsAll,
    domainsActive,
    domainsAttention,
    quizDeployments,
    lpDeployments,
    audit,
  ] = await Promise.all([
    payload.count({ collection: 'sites', where: { status: { equals: 'active' } }, ...scoped }),
    payload.count({ collection: 'sites', ...scoped }),
    payload.count({ collection: 'sites', where: { status: { equals: 'paused' } }, ...scoped }),
    payload.count({ collection: 'sites', where: { status: { equals: 'draft' } }, ...scoped }),
    payload.count({ collection: 'pages', where: { status: { equals: 'published' } }, ...scoped }),
    payload.count({ collection: 'pages', ...scoped }),
    payload.count({ collection: 'funnel-landing-pages', ...scoped }),
    payload.count({ collection: 'funnel-quizzes', ...scoped }),
    payload.count({ collection: 'leads', where: { test_capture: { not_equals: true } }, ...scoped }),
    payload.count({
      collection: 'leads',
      where: {
        and: [
          { test_capture: { not_equals: true } },
          { createdAt: { greater_than_equal: new Date(Date.now() - 7 * 864e5).toISOString() } },
        ],
      },
      ...scoped,
    }),
    payload.count({ collection: 'leads', where: { 'delivery_log.ok': { equals: false } }, ...scoped }),
    payload.count({ collection: 'domains', ...scoped }),
    payload.count({ collection: 'domains', where: { ssl_status: { equals: 'active' } }, ...scoped }),
    payload.find({
      collection: 'domains',
      where: { ssl_status: { in: ['pending', 'error', 'unknown'] } },
      limit: 6,
      depth: 1,
      ...scoped,
    }),
    payload.find({ collection: 'funnel-quiz-deployments', limit: 4, depth: 2, sort: '-updatedAt', ...scoped }),
    payload.find({ collection: 'funnel-lp-deployments', limit: 4, depth: 2, sort: '-updatedAt', ...scoped }),
    payload.find({ collection: 'audit-log', sort: '-createdAt', limit: 8, depth: 1, ...scoped }),
  ])

  const siteOf = (d: Record<string, any>): { name: string; color: string | null } => {
    const s = d?.site && typeof d.site === 'object' ? d.site : null
    return { name: s?.name ?? 'Unassigned', color: s?.brand?.primary ?? null }
  }
  const hostOf = (d: Record<string, any>): string => {
    const dom = d?.domain && typeof d.domain === 'object' ? d.domain : null
    const host = dom?.host ?? null
    const path = d?.path ?? '/'
    return host ? `${host}${path === '/' ? '' : path}` : 'no domain bound'
  }
  const stateOf = (status: unknown): { state: string; tone: Tone } => {
    const s = String(status ?? 'draft')
    if (s === 'published' || s === 'active') return { state: 'Live', tone: 'pos' }
    if (s === 'paused') return { state: 'Paused', tone: 'warn' }
    return { state: 'Draft', tone: 'neutral' }
  }

  const deployments: DeploymentRow[] = [
    ...quizDeployments.docs.map((raw) => {
      const d = raw as Record<string, any>
      const site = siteOf(d)
      const st = stateOf(d.status)
      const quiz = d.quiz && typeof d.quiz === 'object' ? d.quiz.name : null
      return {
        key: `q-${d.id}`,
        asset: quiz ?? d.name ?? 'Quiz deployment',
        kind: 'Quiz',
        site: site.name,
        brandColor: site.color,
        path: hostOf(d),
        state: st.state,
        tone: st.tone,
      }
    }),
    ...lpDeployments.docs.map((raw) => {
      const d = raw as Record<string, any>
      const site = siteOf(d)
      const st = stateOf(d.status)
      const lp = d.landing_page && typeof d.landing_page === 'object' ? d.landing_page.name : null
      return {
        key: `l-${d.id}`,
        asset: lp ?? d.name ?? 'Landing page deployment',
        kind: 'Landing Page',
        site: site.name,
        brandColor: site.color,
        path: hostOf(d),
        state: st.state,
        tone: st.tone,
      }
    }),
  ]

  const attention: Array<{ title: string; detail: string; tone: Tone; href: string; action: string }> = []
  for (const raw of domainsAttention.docs) {
    const d = raw as Record<string, any>
    const site = siteOf(d)
    attention.push({
      title:
        d.ssl_status === 'error'
          ? 'Certificate failed'
          : d.ssl_status === 'pending'
            ? 'Certificate not verified yet'
            : 'Certificate state unknown',
      detail: `${d.host} on ${site.name}. ${d.provisioning_error ? String(d.provisioning_error).slice(0, 140) : 'A domain does not go live until a real HTTPS handshake succeeds.'}`,
      tone: d.ssl_status === 'error' ? 'neg' : 'warn',
      href: '/admin/brands/domains',
      action: 'View domain',
    })
  }
  if (leadsFailed.totalDocs > 0) {
    attention.push({
      title: `${leadsFailed.totalDocs} lead${leadsFailed.totalDocs === 1 ? '' : 's'} with a failed delivery step`,
      detail: 'A destination rejected or did not answer. Open the lead to read the delivery log.',
      tone: 'neg',
      href: '/admin/leads?delivery=failed',
      action: 'Open leads',
    })
  }

  return (
    <Page>
      <PageHeader
        title="Overview"
        subtitle="What is live, what changed, and what needs attention."
        badge={{ label: 'Live', tone: 'pos' }}
      />

      <MetricGrid>
        <MetricCard
          accent
          label="Active sites"
          value={sitesActive.totalDocs}
          sub={`${sitesAll.totalDocs} total, ${sitesPaused.totalDocs} paused, ${sitesDraft.totalDocs} draft`}
          icon={<Globe className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Published pages"
          value={pagesPublished.totalDocs}
          sub={`${pagesAll.totalDocs} authored across every site`}
          icon={<FileText className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Source assets"
          value={lpAll.totalDocs + quizAll.totalDocs}
          sub={`${quizAll.totalDocs} quizzes, ${lpAll.totalDocs} landing pages, brand free`}
          icon={<Layers className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Deployments"
          value={quizDeployments.totalDocs + lpDeployments.totalDocs}
          sub="asset bound to a brand, domain and path"
          icon={<Rocket className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Leads"
          value={leadsTotal.totalDocs}
          delta={`${leadsRecent.totalDocs} in 7 days`}
          deltaTone={leadsRecent.totalDocs > 0 ? 'pos' : 'neutral'}
          sub={leadsFailed.totalDocs > 0 ? `${leadsFailed.totalDocs} with a delivery failure` : 'no delivery failures recorded'}
          icon={<Inbox className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label="Domains"
          value={domainsAll.totalDocs}
          delta={domainsAttention.totalDocs > 0 ? `${domainsAttention.totalDocs} unverified` : undefined}
          deltaTone="warn"
          sub={`${domainsActive.totalDocs} with a verified certificate`}
          icon={<Link2 className="h-3.5 w-3.5" />}
        />
      </MetricGrid>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <SectionHeader
            title="Deployment map"
            sub="source asset, brand, domain and path"
            actions={
              <Link
                href="/admin/quizzes"
                className="inline-flex h-6 items-center rounded-app-sm border border-border px-2 text-[11px] text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                All deployments
              </Link>
            }
          />
          {deployments.length === 0 ? (
            <EmptyState
              icon={<Rocket className="h-5 w-5" />}
              title="Nothing deployed yet"
              message="A deployment binds a brand-free asset to a brand, a domain and a path. Build a quiz or a landing page, then deploy it."
              action={
                <Link
                  href="/admin/quizzes"
                  className="inline-flex h-8 items-center rounded-app-sm bg-brand px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  Go to Quizzes
                </Link>
              }
            />
          ) : (
            <div>
              <div className="flex gap-2.5 bg-surface-1/60 px-3.5 py-2">
                <Eyebrow className="flex-[1.3]">Source asset</Eyebrow>
                <Eyebrow className="flex-1">Brand</Eyebrow>
                <Eyebrow className="hidden flex-[1.6] sm:block">Domain / path</Eyebrow>
                <Eyebrow className="w-[92px] shrink-0">State</Eyebrow>
              </div>
              {deployments.map((d) => (
                <div key={d.key} className="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5">
                  <div className="min-w-0 flex-[1.3]">
                    <span className="block truncate text-[13px] font-medium text-ink">{d.asset}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-[0.07em] text-ink-dim">{d.kind}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {d.brandColor ? (
                      <span
                        aria-hidden="true"
                        className="h-[9px] w-[9px] shrink-0 rounded-[2px] border border-white/15"
                        style={{ background: d.brandColor }}
                      />
                    ) : null}
                    <span className="truncate text-[12px] text-ink-secondary">{d.site}</span>
                  </div>
                  <Mono className="hidden min-w-0 flex-[1.6] truncate text-[11px] text-ink-muted sm:block">{d.path}</Mono>
                  <div className="w-[92px] shrink-0">
                    <StatusPill label={d.state} tone={d.tone} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <Card className={attention.length > 0 ? 'overflow-hidden border-warn/25' : 'overflow-hidden'}>
            <SectionHeader
              title="Needs attention"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-warn" />}
              actions={<Mono className="text-[11px] text-warn">{attention.length}</Mono>}
            />
            {attention.length === 0 ? (
              <EmptyState message="Nothing is waiting on you. Certificates are verified and no delivery has failed." />
            ) : (
              attention.slice(0, 5).map((a) => (
                <div key={a.title + a.detail} className="flex gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full ${a.tone === 'neg' ? 'bg-neg' : 'bg-warn'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-ink">{a.title}</div>
                    <div className="mt-0.5 text-[11px] leading-[1.45] text-ink-muted">{a.detail}</div>
                  </div>
                  <Link
                    href={a.href}
                    className="h-6 shrink-0 self-center rounded-app-sm border border-border bg-surface-3 px-2 text-[11px] leading-[22px] text-ink-secondary transition-colors hover:border-brand hover:text-ink"
                  >
                    {a.action}
                  </Link>
                </div>
              ))
            )}
          </Card>

          <Card className="min-h-0 flex-1 overflow-hidden">
            <SectionHeader title="Recent activity" sub="audit log" />
            {audit.docs.length === 0 ? (
              <EmptyState message="No activity recorded yet. Changes made in the console appear here." />
            ) : (
              audit.docs.map((raw) => {
                const entry = raw as Record<string, any>
                const u = entry.user
                const email = u && typeof u === 'object' && u.email ? u.email : 'system'
                return (
                  <div key={String(entry.id)} className="flex items-start gap-2.5 border-b border-border px-3.5 py-2 last:border-b-0">
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-app-sm border border-border bg-surface-1 text-info">
                      <Activity className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] leading-[1.45] text-ink-secondary">
                        <span className="font-medium text-ink">{email}</span> {entry.action}{' '}
                        <span className="text-ink-muted">{entry.entity_type}</span>
                      </div>
                      <Mono className="mt-0.5 block text-[10px] text-ink-dim">{fmt(entry.createdAt)}</Mono>
                    </div>
                  </div>
                )
              })
            )}
          </Card>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: 'Build a quiz', sub: 'Brand-free authoring, tiers and branching from the first step.', href: '/admin/quizzes', icon: Sparkles },
          { title: 'Import a page', sub: 'Point at a URL or paste HTML and get editable blocks back.', href: '/admin/landing-pages', icon: Upload },
          { title: 'Attach a domain', sub: 'Provision the host, issue the certificate, verify before live.', href: '/admin/brands/domains', icon: Link2 },
          { title: 'Review leads', sub: 'Answers, consent evidence and the delivery trace per lead.', href: '/admin/leads', icon: Send },
        ].map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-start gap-2.5 rounded-app border border-border bg-surface-1 p-3.5 transition-colors hover:border-brand/45 hover:bg-surface-2"
          >
            <q.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">{q.title}</span>
              <span className="mt-0.5 block text-[11px] leading-[1.45] text-ink-muted">{q.sub}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-ink-dim">
        Every number on this page is a live count from the {PRODUCT_NAME} database, scoped to the brands your account can
        read. Analytics and Campaign Integrity are not live and are not counted here.
      </p>
    </Page>
  )
}
