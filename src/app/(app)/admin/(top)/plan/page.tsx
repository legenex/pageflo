import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { Card, DeniedState, Page, PageHeader } from '@/components/pageflo/primitives'
import { PLAN_AGENTS, PLAN_FINDINGS } from '@/lib/agent-plan/plan'
import { readAllStatus } from '@/lib/agent-plan/store'
import { PlanBoard } from './PlanBoard'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'Agent Plan' }

export default async function PlanPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/sign-in?next=/admin/plan')

  if (!me.super_admin) {
    return (
      <Page>
        <PageHeader
          title="Agent Plan"
          subtitle={`Live board of what every ${PRODUCT_NAME} review and fix agent is working on.`}
        />
        <Card>
          <DeniedState
            what="the Agent Plan board"
            message="This board exposes internal engineering state: open findings, which subsystem each agent owns, and what is currently in flight. It is restricted to workspace owners."
          />
        </Card>
      </Page>
    )
  }

  const status = await readAllStatus()

  return (
    <Page>
      <PlanBoard agents={PLAN_AGENTS} findings={PLAN_FINDINGS} initialStatus={status} />
    </Page>
  )
}
