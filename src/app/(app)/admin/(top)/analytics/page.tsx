import { BarChart3 } from 'lucide-react'
import { ComingSoon, Page, PageHeader } from '@/components/pageflo/primitives'

export const metadata = { title: 'Analytics' }

/**
 * Analytics is designed and not built.
 *
 * This page states that plainly and says what is missing, because the data it
 * would report on IS already being collected: every Lead carries its
 * attribution, its shared Meta `event_id`, and the tracking configuration that
 * was live when it converted. What does not exist is the aggregation layer.
 * Showing a chart of invented numbers here would be worse than showing nothing,
 * so there is deliberately no preview panel of fake data.
 */
export default function AnalyticsPage() {
  return (
    <Page>
      <PageHeader title="Analytics" subtitle="Funnel, conversion and attribution reporting across every Site." />
      <ComingSoon
        icon={<BarChart3 className="h-[22px] w-[22px]" aria-hidden="true" />}
        title="Reporting is not built yet"
        body="Every lead already stores the data this screen would report on: source, campaign, adset and creative attribution, the shared conversion event id, the deployment that produced it, and the tracking configuration that was live at the time. Nothing is being lost while this screen is unbuilt."
        waitingFor="an aggregation layer. Counting across Sites and date ranges on every page load would put a full table scan on the operator console, so the numbers need a rollup that is written as leads arrive. The lead pipeline currently runs synchronously inside the request and there is no background worker to write one."
      />
    </Page>
  )
}
