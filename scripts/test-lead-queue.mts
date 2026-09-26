/**
 * The delivery queue really accepts jobs.
 *
 *   pnpm test:queue
 *
 * BullMQ rejects a custom job id containing ':' (unless it has three parts).
 * The original ids were `lead:<id>`, every enqueue threw, and it was swallowed as
 * "queue unavailable" for the life of the feature. This adds a real job through
 * the real Redis and requires 'queued'. Needs REDIS_URL; skips loudly without it.
 */
import 'dotenv/config'
import { Queue } from 'bullmq'
import { enqueueLeadDelivery, enqueueLeadRetry, LEAD_DELIVERY_QUEUE, LeadLockedError, withLeadLock } from '../src/queues/lead-delivery.ts'
import { getQueueRedis } from '../src/queues/redis.ts'

let pass = 0, fail = 0
const t = (c: unknown, l: string) => { if (c) pass++; else { fail++; console.log('  FAIL ' + l) } }
if (!process.env.REDIS_URL) { console.log('REDIS_URL not set: cannot exercise the queue'); process.exit(2) }

const id = 900_000_000 + (process.pid % 1000)
t((await enqueueLeadDelivery(id)) === 'queued', 'a lead delivery job is accepted by the queue')
t((await enqueueLeadRetry(id, 1)) === 'queued', 'and so is an operator retry job')
t((await enqueueLeadRetry(id, 1)) === 'queued', 'a repeated retry request is the same job, not an error')
const conn = getQueueRedis()!
const q = new Queue(LEAD_DELIVERY_QUEUE, { connection: conn })
const jobs = await q.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'])
const mine = jobs.filter((j) => j.data.leadId === id)
t(mine.length === 2, `exactly two jobs exist for it, the retry deduplicated (${mine.length})`)
for (const j of mine) await j.remove().catch(() => null)
// One delivery pass per Lead: a second pass (an inline fallback racing a job that
// did land, or two workers) is refused while the first holds the lock.
let second = 'ran'
await withLeadLock(id, async () => {
  await withLeadLock(id, async () => { second = 'ran-concurrently' }).catch((e) => { second = e instanceof LeadLockedError ? 'refused' : 'error' })
})
t(second === 'refused', 'a second delivery pass for the same lead is refused while the first holds the lock')
let after = 'no'
await withLeadLock(id, async () => { after = 'yes' })
t(after === 'yes', 'and the lock is released when the first pass ends')
await q.close(); conn.disconnect()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
