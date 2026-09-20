import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import {
  deliverStoredLead,
  runLeadPipeline,
  setLeadAfterPersistHook,
} from '../src/lib/lead-pipeline/run.ts'
import { getQueueRedis } from '../src/queues/redis.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const RUN = `dur_${process.pid}_${Math.floor(process.uptime() * 1000)}`
const created: Array<{ collection: string; id: string | number }> = []

const logOf = (lead: { delivery_log?: Array<{ step?: string }> | null }): string[] =>
  (lead.delivery_log ?? []).map((entry) => String(entry.step ?? ''))

const main = async (): Promise<void> => {
  const redisA = getQueueRedis()
  const redisB = getQueueRedis()
  t(
    !redisA || redisA !== redisB,
    'BullMQ Queue and Worker do not share one ioredis instance',
  )
  await redisA?.quit().catch(() => null)
  await redisB?.quit().catch(() => null)

  const payload = await getPayload({ config })
  const site = await payload.create({
    collection: 'sites',
    data: { name: `${RUN} brand`, slug: RUN, status: 'active', vertical: 'mva', default_phone: '(800) 555-0100' } as never,
    overrideAccess: true,
  })
  created.push({ collection: 'sites', id: site.id })
  const siteId = Number(site.id)
  const contact = { first_name: 'Dur', last_name: 'Probe', email: `${RUN}@example.test`, phone: '5551234567' }
  const base = {
    siteId,
    siteSlug: RUN,
    siteName: `${RUN} brand`,
    primaryHost: null,
    funnel_type: 'quiz' as const,
    funnel_id: `${RUN}-flow`,
    contact,
  }

  setLeadAfterPersistHook(async () => {
    throw new Error('simulated crash after persist')
  })
  const crashed = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-crash` })
  setLeadAfterPersistHook(null)

  t(crashed.ok && crashed.lead_id != null, 'crash after persist still returns the stored lead')
  if (crashed.lead_id) created.push({ collection: 'leads', id: crashed.lead_id })
  t(
    crashed.steps.some((s) => s.step === 'lead.created' || s.step === 'delivery.queued'),
    'crash path records persist or queued delivery',
  )
  t(
    !crashed.steps.some((s) => s.step === 'downstream.completed'),
    'crash path does not run downstream in the request',
  )

  const stored = await payload.findByID({ collection: 'leads', id: crashed.lead_id!, depth: 0, overrideAccess: true })
  t(Boolean(stored), 'lead row exists after the simulated crash')
  t(!logOf(stored as { delivery_log?: Array<{ step?: string }> }).includes('downstream.completed'), 'stored lead has not completed downstream yet')

  const first = await deliverStoredLead(Number(crashed.lead_id))
  t(first.ok, 'resume delivery after crash succeeds')
  const afterFirst = await payload.findByID({ collection: 'leads', id: crashed.lead_id!, depth: 0, overrideAccess: true })
  t(
    logOf(afterFirst as { delivery_log?: Array<{ step?: string }> }).includes('downstream.completed'),
    'resume writes downstream.completed',
  )

  const second = await deliverStoredLead(Number(crashed.lead_id))
  t(second.ok, 'second resume succeeds')
  t(
    second.steps.some((s) => s.step === 'delivery.deduplicated'),
    'second resume is idempotent and does not re-run downstream',
  )
  const afterSecond = await payload.findByID({ collection: 'leads', id: crashed.lead_id!, depth: 0, overrideAccess: true })
  const completedCount = logOf(afterSecond as { delivery_log?: Array<{ step?: string }> }).filter((s) => s === 'downstream.completed').length
  t(completedCount === 1, `downstream.completed appears once, not twice (found ${completedCount})`)

  const normal = await runLeadPipeline({ ...base, client_submission_id: `${RUN}-normal` })
  t(normal.ok && normal.lead_id != null, 'ordinary capture still persists a lead')
  if (normal.lead_id) created.push({ collection: 'leads', id: normal.lead_id })
  t(normal.steps.some((s) => s.step === 'lead.created'), 'ordinary capture still creates in-request')
}

main()
  .catch((err) => {
    fail++
    console.error(err)
  })
  .finally(async () => {
    try {
      const payload = await getPayload({ config })
      for (const row of created.reverse()) {
        await payload.delete({ collection: row.collection as never, id: row.id, overrideAccess: true }).catch(() => null)
      }
    } catch {
      /* ignore cleanup */
    }
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
  })
