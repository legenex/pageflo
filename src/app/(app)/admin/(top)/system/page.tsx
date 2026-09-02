import { SystemHealthReport } from '@/components/app/SystemHealthReport'
import { refreshSystemReport } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'System' }

export default function SystemPage() {
  return <SystemHealthReport title="System" refreshAction={refreshSystemReport} />
}
