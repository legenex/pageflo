import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Rocket, Send } from 'lucide-react'
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
  type Tone,
} from '@/components/pageflo/primitives'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Deployments' }

type Row = {
  key: string
  asset: string
  kind: string
  brand: string
  path: string
  state: string
  tone: Tone
}

const nameOf = (value: unknown, fallback: string): string => {
  if (value && typeof value === 'object' && 'name' in value && typeof (value as { name: unknown }).name === 'string') {
    return (value as { name: string }).name
  }
  return fallback
}

const hostOf = (raw: Record<string, unknown>): string => {
  const domain = raw.domain && typeof raw.domain === 'object' ? (raw.domain as { host?: string }) : null
  const path = typeof raw.path === 'string' && raw.path ? raw.path : '/'
  return domain?.host ? `${domain.host}${path === '/' ? '' : path}` : 'no domain bound'
}

const stateOf = (status: unknown): { state: string; tone: Tone } => {
  const s = String(status ?? 'draft')
  if (s === 'live' || s === 'published' || s === 'active') return { state: 'Live', tone: 'pos' }
  if (s === 'paused') return { state: 'Paused', tone: 'warn' }
  return { state: 'Draft', tone: 'neutral' }
}

export default async function DeploymentsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in?redirect=/admin/deployments')

  const payload = await getPayload({ config })
  const scoped = { user, overrideAccess: false } as const

  const [quizDeployments, lpDeployments, advertorialDeployments] = await Promise.all([
    payload.find({ collection: 'funnel-quiz-deployments', limit: 200, depth: 1, sort: '-updatedAt', ...scoped }),
    payload.find({ collection: 'funnel-lp-deployments', limit: 200, depth: 1, sort: '-updatedAt', ...scoped }),
    payload.find({ collection: 'funnel-advertorial-deployments', limit: 200, depth: 1, sort: '-updatedAt', ...scoped }),
  ])

  const rows: Row[] = [
    ...quizDeployments.docs.map((raw) => {
      const d = raw as unknown as Record<string, unknown>
      const st = stateOf(d.status)
      return {
        key: `q-${d.id}`,
        asset: nameOf(d.quiz, nameOf(d, 'Quiz deployment')),
        kind: 'Quiz',
        brand: nameOf(d.site, 'Unassigned'),
        path: hostOf(d),
        state: st.state,
        tone: st.tone,
      }
    }),
    ...lpDeployments.docs.map((raw) => {
      const d = raw as unknown as Record<string, unknown>
      const st = stateOf(d.status)
      return {
        key: `l-${d.id}`,
        asset: nameOf(d.landing_page, nameOf(d, 'Landing page deployment')),
        kind: 'Landing Page',
        brand: nameOf(d.site, 'Unassigned'),
        path: hostOf(d),
        state: st.state,
        tone: st.tone,
      }
    }),
    ...advertorialDeployments.docs.map((raw) => {
      const d = raw as unknown as Record<string, unknown>
      const st = stateOf(d.status)
      return {
        key: `a-${d.id}`,
        asset: nameOf(d.advertorial, nameOf(d, 'Advertorial deployment')),
        kind: 'Advertorial',
        brand: nameOf(d.site, 'Unassigned'),
        path: hostOf(d),
        state: st.state,
        tone: st.tone,
      }
    }),
  ]

  return (
    <Page>
      <PageHeader
        title="Deployments"
        subtitle="A deployment binds a master asset to a Brand, domain and path. Public copy stays on the master."
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Send className="h-[18px] w-[18px]" aria-hidden="true" />}
            title="Nothing deployed yet"
            message="Create a master Quiz, Landing Page or Advertorial, then bind it to a Brand. This list shows real deployment rows only."
            action={
              <Link
                href="/admin/quizzes"
                className="inline-flex items-center gap-1.5 rounded-app border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface-3"
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                Open Quizzes
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[800px] text-left text-[13px]">
              <thead>
                <Tr>
                  <Th>Asset</Th>
                  <Th>Kind</Th>
                  <Th>Brand</Th>
                  <Th>Path</Th>
                  <Th>State</Th>
                </Tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.key}>
                    <Td className="font-semibold text-ink">{row.asset}</Td>
                    <Td>{row.kind}</Td>
                    <Td>{row.brand}</Td>
                    <Td>
                      <Mono>{row.path}</Mono>
                    </Td>
                    <Td>
                      <StatusPill label={row.state} tone={row.tone} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  )
}
