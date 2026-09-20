import { Queue } from 'bullmq'
import { getQueueRedis } from './redis'

export const LEAD_DELIVERY_QUEUE = 'lead-delivery'

export type LeadDeliveryJob = { leadId: number }

let queue: Queue<LeadDeliveryJob> | null | undefined

const getQueue = (): Queue<LeadDeliveryJob> | null => {
  if (queue !== undefined) return queue
  const connection = getQueueRedis()
  if (!connection) {
    queue = null
    return null
  }
  queue = new Queue<LeadDeliveryJob>(LEAD_DELIVERY_QUEUE, { connection })
  return queue
}

export const enqueueLeadDelivery = async (leadId: number): Promise<'queued' | 'unavailable'> => {
  const q = getQueue()
  if (!q) return 'unavailable'
  try {
    const added = q.add(
      'deliver',
      { leadId },
      {
        jobId: `lead:${leadId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    )
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('enqueue timeout')), 2000)
    })
    await Promise.race([added, timeout])
    return 'queued'
  } catch {
    return 'unavailable'
  }
}
