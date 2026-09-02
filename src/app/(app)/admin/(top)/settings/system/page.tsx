import { SystemHealthReport } from '@/components/app/SystemHealthReport'
import { refreshSystemReport } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = { title: 'System health' }

export default function SettingsSystemPage() {
  return <SystemHealthReport title="System health" refreshAction={refreshSystemReport} />
}
