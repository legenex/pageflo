import { Worker, type Job } from 'bullmq'
import { LEAD_DELIVERY_QUEUE, type LeadDeliveryJob } from '@/queues/lead-delivery'
import { getQueueRedis } from '@/queues/redis'
import { deliverStoredLead } from '@/lib/lead-pipeline/run'

let worker: Worker<LeadDeliveryJob> | null = null

export const processLeadDeliveryJob = async (job: { data: LeadDeliveryJob }): Promise<void> => {
  await deliverStoredLead(job.data.leadId)
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
