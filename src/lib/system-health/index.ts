import {
  checkDeployInfo,
  checkRuntime,
  checkPageFloHosts,
  checkLegalPublication,
  checkPostgres,
  checkLockedDocumentRels,
  checkRedis,
  checkPlesk,
  checkAnthropic,
  checkDnsInfra,
  checkSelfSslCert,
  checkStats,
  type SystemCheck,
} from './checks'

export type { SystemCheck, CheckStatus, Category } from './checks'

export type SystemReport = {
  generated_at: string
  duration_ms: number
  checks: SystemCheck[]
  counts: { ok: number; warn: number; error: number; info: number }
}

const TTL_MS = 30 * 1000
type CachedReport = { value: SystemReport; expiresAt: number } | null
let cache: CachedReport = null

export const runSystemReport = async (force = false): Promise<SystemReport> => {
  const now = Date.now()
  if (!force && cache && cache.expiresAt > now) return cache.value

  const started = Date.now()
  const settled = await Promise.allSettled([
    checkDeployInfo(),
    checkRuntime(),
    checkPageFloHosts(),
    checkLegalPublication(),
    checkPostgres(),
    checkLockedDocumentRels(),
    checkRedis(),
    checkPlesk(),
    checkAnthropic(),
    checkDnsInfra(),
    checkSelfSslCert(),
    checkStats(),
  ])

  const checks: SystemCheck[] = []
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const value = result.value
    if (Array.isArray(value)) checks.push(...value)
    else if (value !== null) checks.push(value)
  }

  const counts = { ok: 0, warn: 0, error: 0, info: 0 }
  for (const c of checks) counts[c.status] += 1

  const value: SystemReport = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    checks,
    counts,
  }
  cache = { value, expiresAt: now + TTL_MS }
  return value
}

export const invalidateSystemReport = (): void => {
  cache = null
}
