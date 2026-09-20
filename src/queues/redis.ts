import Redis from 'ioredis'

let base: Redis | null | undefined

export const redisUrl = (): string => process.env.REDIS_URL ?? ''

const getBase = (): Redis | null => {
  const url = redisUrl()
  if (!url) return null
  if (base !== undefined) return base
  try {
    base = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    return base
  } catch {
    base = null
    return null
  }
}

/**
 * BullMQ Queue and Worker must not share one ioredis instance. A Worker
 * uses blocking commands; Queue.add on the same connection then hangs, and
 * the visitor never leaves the submit spinner.
 */
export const getQueueRedis = (): Redis | null => {
  const conn = getBase()
  if (!conn) return null
  return conn.duplicate()
}
