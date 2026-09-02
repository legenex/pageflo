import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Globe, Inbox, Layers, Pencil } from 'lucide-react'
import { TestCaptureButton } from '@/components/app/TestCaptureModal'
import { SitePublishControl } from '@/components/app/SitePublishControl'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function SiteOverviewPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const siteRes = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  const site = siteRes.docs[0]; if (!site) notFound()

  const since30d = new Date()
  since30d.setDate(since30d.getDate() - 30)

  /**
   * Every number on this page is a live count of a real row.
   *
   * "Active Funnels" was a hardcoded `0` and the funnels panel said "No funnels
   * bound to this site yet" without ever running a query, so a Site with six
   * live deployments reported none. A dashboard that invents an operational
   * count is worse than one that omits it: the operator believes it.
   */
  const liveOnThisSite: Where = {
    and: [{ site: { equals: site.id } }, { status: { equals: 'live' } }],
  }

  const [pagesPub, domainsCount, leads30d, primaryDomain, lpDeployments, quizDeployments, advertorialDeployments] =
    await Promise.all([
      payload.count({
        collection: 'pages',
        where: { and: [{ site: { equals: site.id } }, { status: { equals: 'published' } }] },
        overrideAccess: true,
      }),
      payload.count({ collection: 'domains', where: { site: { equals: site.id } }, overrideAccess: true }),
      payload.count({
        collection: 'leads',
        where: {
          and: [
            { site: { equals: site.id } },
            { createdAt: { greater_than: since30d.toISOString() } },
            // The label says "excluding test captures", so the query has to.
            // It did not, which made every test submission look like a lead.
            { test_capture: { not_equals: true } },
          ],
        },
        overrideAccess: true,
      }),
      payload.find({
        collection: 'domains',
        where: { and: [{ site: { equals: site.id } }, { primary: { equals: true } }] },
        limit: 1,
        overrideAccess: true,
      }),
      // Tolerated rather than awaited blindly: on a database where the funnel
      // migrations have not run the table is missing, and a Site dashboard that
      // 500s is worse than one whose funnels panel is empty and says so.
      payload
        .find({
          collection: 'funnel-lp-deployments' as never,
          where: liveOnThisSite,
          limit: 50,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null),
      payload
        .find({
          collection: 'funnel-quiz-deployments' as never,
          where: liveOnThisSite,
          limit: 50,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null),
      payload
        .find({
          collection: 'funnel-advertorial-deployments' as never,
          where: liveOnThisSite,
          limit: 50,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null),
    ])

  type DeploymentRow = { id: string | number; name?: string | null; path?: string | null }
  const asRows = (res: { docs: unknown[] } | null): DeploymentRow[] =>
    ((res?.docs ?? []) as DeploymentRow[])

  // `null` means the query failed, which is different from "there are none".
  const funnelsUnavailable = !lpDeployments || !quizDeployments || !advertorialDeployments
  const funnels: Array<{ kind: string; href: string; row: DeploymentRow }> = [
    ...asRows(lpDeployments).map((row) => ({ kind: 'Landing page', href: '/admin/landing-pages', row })),
    ...asRows(quizDeployments).map((row) => ({ kind: 'Quiz', href: '/admin/quizzes', row })),
    ...asRows(advertorialDeployments).map((row) => ({ kind: 'Advertorial', href: '/admin/advertorials', row })),
  ]

  const primary = primaryDomain.docs[0]

  // A draft Site whose primary domain reads 'active' used to be published right
  // here — from a GET, on render, with overrideAccess: true.
  //
  // Two things made that worse than a stray write. Every new Site is given a
  // preview Domain row written `status: 'active'` with nothing verified, so the
  // condition below was true for every brand the moment it was created: merely
  // OPENING this dashboard published the brand to the internet, defeating the
  // 'draft' the create action had just set on purpose. And because a render is
  // not an action, there was no operator intent to record and nothing to audit.
  //
  // Publication is now explicit. The badge below already reports the true state
  // (a draft Site reads 'partial', not 'ready'), which is the honest way to show
  // the same fact.

  const livePreviewUrl = primary ? `https://${primary.host}` : `/?site=${site.slug}`
  // "Ready" must mean actually publicly served: a live primary domain AND a
  // published (active) Site. Previously this only checked the domain, so a draft
  // site read "Ready" while the public router 404'd it.
  const status = primary?.status === 'active' && site.status === 'active' ? 'ready' : 'partial'

  const recentLeads = await payload.find({
    collection: 'leads',
    where: { site: { equals: site.id } },
    sort: '-createdAt',
    limit: 5,
    overrideAccess: true,
  })

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1400px]">
      <header className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge p-6 mb-6 flex items-center gap-5 flex-wrap">
        <span
          className="w-14 h-14 rounded-xl flex items-center justify-center text-[18px] font-bold text-white shrink-0"
          style={{ backgroundColor: site.brand?.primary ?? '#0B1F3A' }}
        >
          {site.name.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">{site.name}</h1>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            {primary ? (
              <a href={livePreviewUrl} target="_blank" rel="noreferrer" className="text-[var(--color-info)] hover:underline inline-flex items-center gap-1">
                {primary.host}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="italic">No primary domain connected.</span>
            )}
          </p>
        </div>
        <StatusChip status={status} />
        <SitePublishControl
          siteId={site.id}
          status={(site.status ?? 'draft') as 'draft' | 'active' | 'paused' | 'archived'}
          primaryHost={primary?.host ?? null}
        />
        <TestCaptureButton siteSlug={slug} />
        <Link
          href={`/admin/sites/${slug}/settings/general`}
          className="text-[13px] text-white font-medium px-4 py-2 rounded-lg border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] inline-flex items-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit Site
        </Link>
        <Link
          href={livePreviewUrl}
          target="_blank"
          className="brand-gradient text-white font-semibold text-[13px] px-4 py-2 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View Live Site
        </Link>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI icon={<FileText className="w-4 h-4" />} value={pagesPub.totalDocs} label="Active Pages" />
        <KPI icon={<Globe className="w-4 h-4" />} value={domainsCount.totalDocs} label="Domains" />
        <KPI icon={<Inbox className="w-4 h-4" />} value={leads30d.totalDocs} label="Leads (30d)" sub="excluding test captures" />
        <KPI
          icon={<Layers className="w-4 h-4" />}
          value={funnels.length}
          label="Live funnels"
          sub={funnelsUnavailable ? 'partial: a deployment table is unreadable' : 'serving this Site now'}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            right={
              <Link href="/admin/landing-pages" className="text-[12px] text-info hover:underline">
                Manage deployments
              </Link>
            }
          >
            Live funnels on this Site
          </CardHeader>
          {funnelsUnavailable ? (
            <CardEmpty>
              A deployment table could not be read, so this list is incomplete. It is not a statement that there are
              none.
            </CardEmpty>
          ) : funnels.length === 0 ? (
            <CardEmpty>
              No landing page, quiz or advertorial deployment is live on this Site. Draft and paused deployments are not
              counted here.
            </CardEmpty>
          ) : (
            <ul className="divide-y divide-border/70">
              {funnels.slice(0, 8).map((f) => (
                <li key={`${f.kind}-${f.row.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <Link href={f.href} className="min-w-0 flex-1 truncate text-[13px] text-ink hover:text-info">
                    {f.row.name || `${f.kind} ${f.row.id}`}
                  </Link>
                  <span className="shrink-0 font-mono text-[11.5px] text-ink-dim">{f.row.path || '/'}</span>
                  <span className="shrink-0 text-[11px] text-ink-muted">{f.kind}</span>
                </li>
              ))}
            </ul>
          )}
          {funnels.length > 8 ? (
            <p className="border-t border-border px-3.5 py-2 text-[11.5px] text-ink-dim">
              and {funnels.length - 8} more
            </p>
          ) : null}
        </Card>
        <Card>
          <CardHeader right={<Link href="/admin/leads" className="text-[12px] text-[var(--color-info)] hover:underline">View all in {PRODUCT_NAME}</Link>}>
            Recent Leads
          </CardHeader>
          {recentLeads.docs.length === 0 ? (
            <CardEmpty>No leads captured yet.</CardEmpty>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentLeads.docs.map((l) => (
                <li key={l.id} className="px-5 py-3 text-[13px] flex items-center justify-between gap-3">
                  <span className="truncate text-white">{l.contact?.email ?? l.contact?.phone ?? `Lead #${l.id}`}</span>
                  <span className="text-[var(--color-ink-muted)] text-[12px]">{fmtDate(l.createdAt ?? null)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}

function KPI({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 card-edge flex items-center gap-4">
      <span
        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: 'rgba(255,92,117,0.10)',
          color: 'var(--color-brand-strong)',
          boxShadow: 'inset 0 0 0 1px rgba(255,92,117,0.18)',
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[28px] font-bold text-white leading-none">{value}</p>
        <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">{label}</p>
        {sub ? <p className="text-[11px] text-[var(--color-ink-dim)]">{sub}</p> : null}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
      {children}
    </div>
  )
}

function CardHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-white">{children}</h2>
      {right}
    </header>
  )
}

function CardEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[var(--color-ink-dim)]">{children}</div>
}

function StatusChip({ status }: { status: 'ready' | 'partial' }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pos)] bg-[var(--color-pos)]/10 px-2.5 py-1 rounded-md border border-[var(--color-pos)]/30">
        <CheckCircle2 className="w-3.5 h-3.5" /> Ready
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-warn)] bg-[var(--color-warn)]/10 px-2.5 py-1 rounded-md border border-[var(--color-warn)]/30">
      <AlertCircle className="w-3.5 h-3.5" /> Partial
    </span>
  )
}
