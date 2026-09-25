import { Worker, type Job } from 'bullmq'
import { LEAD_DELIVERY_QUEUE, LeadLockedError, withLeadLock, type LeadDeliveryJob } from '@/queues/lead-delivery'
import { getQueueRedis } from '@/queues/redis'

let worker: Worker<LeadDeliveryJob> | null = null

type JobLike = { data: LeadDeliveryJob; id?: string; attemptsMade?: number; opts?: { attempts?: number } }

export const processLeadDeliveryJob = async (job: JobLike): Promise<void> => {
  const { deliverStoredLead } = await import('@/lib/lead-pipeline/run')
  const { appendDeliveryLog } = await import('@/lib/lead-pipeline/log')
  const { DELIVERY_STEPS } = await import('@/lib/lead-pipeline/delivery-state')
  const leadId = job.data.leadId
  const trigger = typeof job.id === 'string' && job.id.includes(':retry:') ? 'retry' : 'queue'
  try {
    await withLeadLock(leadId, () => deliverStoredLead(leadId, { trigger }))
  } catch (err) {
    // Another pass owns the Lead; that pass writes the record. Retry later, log nothing.
    if (err instanceof LeadLockedError) throw err
    // Recorded on the Lead, because the queue's own failure list is invisible to
    // an operator. `delivery.error` reads as "retry pending" while the queue
    // still has attempts left, and `delivery.failed` once it has none.
    const made = (job.attemptsMade ?? 0) + 1
    const max = job.opts?.attempts ?? 1
    const message = err instanceof Error ? err.message : 'unknown error'
    const exhausted = made >= max
    await appendDeliveryLog(leadId, [
      {
        step: exhausted ? DELIVERY_STEPS.failed : DELIVERY_STEPS.error,
        ok: false,
        detail: `attempt ${made} of ${max}: ${message}`.slice(0, 500),
      },
    ]).catch(() => null)
    throw err
  }
}

export const ensureLeadDeliveryWorker = (): Worker<LeadDeliveryJob> | null => {
  if (worker) return worker
  const connection = getQueueRedis()
  if (!connection) return null
  worker = new Worker<LeadDeliveryJob>(
    LEAD_DELIVERY_QUEUE,
    async (job: Job<LeadDeliveryJob>) => {
      await processLeadDeliveryJob(job)
    },
    { connection, concurrency: 4 },
  )
  return worker
}
