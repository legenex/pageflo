import Redis from 'ioredis'

let shared: Redis | null | undefined

export const redisUrl = (): string => process.env.REDIS_URL ?? ''

export const getQueueRedis = (): Redis | null => {
  const url = redisUrl()
  if (!url) return null
  if (shared !== undefined) return shared
  try {
    shared = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    return shared
  } catch {
    shared = null
    return null
  }
}
