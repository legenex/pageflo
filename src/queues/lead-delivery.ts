import { Queue } from 'bullmq'
import { getQueueRedis, getSharedRedis } from './redis'

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
        jobId: `lead-${leadId}`,
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

/**
 * Enqueue an operator-requested retry as a NEW job.
 *
 * Job ids use dashes, never colons: BullMQ rejects a custom id containing `:`
 * unless it has exactly three colon-separated parts, so the original `lead:<id>`
 * was rejected on EVERY add. `enqueueLeadDelivery` swallowed that as "queue
 * unavailable", and every lead was delivered inline in the visitor's request;
 * the worker never received a job. The delivery log now records which path ran.
 *
 * The original job id (`lead-<id>`) is retained by the queue after completion
 * (`removeOnComplete`), and BullMQ silently ignores an `add` whose id already
 * exists, so reusing it would make a retry a no-op that reports success. The
 * sequence number keeps ids unique per request while the same number, resent,
 * stays a duplicate: a double click cannot enqueue twice.
 */
export const enqueueLeadRetry = async (leadId: number, sequence: number): Promise<'queued' | 'unavailable'> => {
  const q = getQueue()
  if (!q) return 'unavailable'
  try {
    const added = q.add(
      'deliver',
      { leadId },
      {
        jobId: `lead-${leadId}-retry-${sequence}`,
        attempts: 3,
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

export class LeadLockedError extends Error {}

const LOCK_TTL_MS = 10 * 60 * 1000
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`

/**
 * One delivery pass per Lead at a time. Two jobs for the same Lead (the
 * original and an operator retry, or a redelivered stalled job) can otherwise
 * run concurrently, and each would send to a destination the other has not yet
 * recorded as settled. The loser throws so the queue retries it after the
 * winner is done, at which point `passAlreadyCompleted` turns it into a no-op.
 * With no Redis there is no queue and no concurrent worker to guard against.
 */
export const withLeadLock = async <T>(leadId: number, fn: () => Promise<T>): Promise<T> => {
  const redis = getSharedRedis()
  if (!redis) return fn()
  const key = `lead-delivery-lock:${leadId}`
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  const got = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')
  if (got !== 'OK') throw new LeadLockedError(`lead ${leadId} delivery is already running`)
  try {
    return await fn()
  } finally {
    await redis.eval(RELEASE, 1, key, token).catch(() => null)
  }
}
