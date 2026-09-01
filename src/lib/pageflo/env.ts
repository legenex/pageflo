/**
 * PageFlo environment configuration.
 *
 * One module owns the transition from the LEGALOS_* environment namespace to
 * PAGEFLO_*. Every accessor here reads the PageFlo name first and falls back to
 * the LegalOS name, so:
 *
 *   - a host that has already been migrated works,
 *   - a host that has not been migrated keeps working unchanged,
 *   - and no call site has to know that two names exist.
 *
 * The fallback is temporary. It exists because production runs from a `.env`
 * file that this repository must never overwrite, and changing a production
 * secret or environment file is a human gate. When the production `.env` has
 * been migrated, delete `legacyKey` from each entry and the fallbacks with it.
 *
 * Reading an unset variable returns an empty string, never a placeholder.
 * Callers branch on emptiness. See AGENTS.md invariant 13.
 */

type EnvSpec = {
  /** Canonical PageFlo variable name. */
  key: string
  /** Legacy LegalOS name still accepted, or null if this key is new. */
  legacyKey: string | null
  /** Default used when neither name is set. Empty string means "no default". */
  fallback?: string
}

const read = (spec: EnvSpec): string => {
  const primary = process.env[spec.key]
  if (primary != null && primary !== '') return primary
  if (spec.legacyKey) {
    const legacy = process.env[spec.legacyKey]
    if (legacy != null && legacy !== '') return legacy
  }
  return spec.fallback ?? ''
}

/**
 * Every variable the application reads, with its legacy name. Keeping the table
 * explicit means `pnpm test` can assert that no LEGALOS_* name is read outside
 * this module.
 */
export const ENV_SPECS = {
  /** Public origin of the operator application, e.g. https://app.pageflo.io. */
  serverUrl: { key: 'PAGEFLO_SERVER_URL', legacyKey: 'NEXT_PUBLIC_SERVER_URL' },
  /** Marketing site host, e.g. pageflo.io. */
  marketingHost: { key: 'PAGEFLO_MARKETING_HOST', legacyKey: null, fallback: '' },
  /** Application host, e.g. app.pageflo.io. */
  appHost: { key: 'PAGEFLO_APP_HOST', legacyKey: null, fallback: '' },
  /**
   * Hosts that served the application before the rebrand and must keep working.
   * Comma separated. During migration this holds os.legenex.com.
   * LEGALOS_FALLBACK_HOST is the single-host predecessor.
   */
  legacyAppHosts: { key: 'PAGEFLO_LEGACY_APP_HOSTS', legacyKey: 'LEGALOS_FALLBACK_HOST' },
  /**
   * When 'true', a legacy app host permanently redirects to the app host
   * instead of serving. Flipped only after the new domain is verified.
   */
  legacyHostRedirect: { key: 'PAGEFLO_LEGACY_HOST_REDIRECT', legacyKey: null, fallback: 'false' },

  previewDomain: { key: 'PAGEFLO_PREVIEW_DOMAIN', legacyKey: 'LEGALOS_PREVIEW_DOMAIN' },
  cnameTarget: { key: 'PAGEFLO_CNAME_TARGET', legacyKey: 'LEGALOS_CNAME_TARGET' },
  aTarget: { key: 'PAGEFLO_A_TARGET', legacyKey: 'LEGALOS_A_TARGET' },
  extraOrigins: { key: 'PAGEFLO_EXTRA_ORIGINS', legacyKey: 'LEGALOS_EXTRA_ORIGINS' },
  imageHosts: { key: 'PAGEFLO_IMAGE_HOSTS', legacyKey: 'LEGALOS_IMAGE_HOSTS' },
  errorWebhookUrl: { key: 'PAGEFLO_ERROR_WEBHOOK_URL', legacyKey: 'LEGALOS_ERROR_WEBHOOK_URL' },
  chromiumPath: { key: 'PAGEFLO_CHROMIUM_PATH', legacyKey: 'LEGALOS_CHROMIUM_PATH' },
  gitSha: { key: 'PAGEFLO_GIT_SHA', legacyKey: 'LEGALOS_GIT_SHA' },
  buildNumber: { key: 'PAGEFLO_BUILD_NUMBER', legacyKey: 'LEGALOS_BUILD_NUMBER' },
  buildTime: { key: 'PAGEFLO_BUILD_TIME', legacyKey: 'LEGALOS_BUILD_TIME' },
  devSkipDns: { key: 'PAGEFLO_DEV_SKIP_DNS', legacyKey: 'LEGALOS_DEV_SKIP_DNS' },
  enforceDomainEligibility: {
    key: 'PAGEFLO_ENFORCE_DOMAIN_ELIGIBILITY',
    legacyKey: 'LEGALOS_ENFORCE_DOMAIN_ELIGIBILITY',
  },
} as const satisfies Record<string, EnvSpec>

export type EnvName = keyof typeof ENV_SPECS

/** Read one configured value. Returns '' when unset and undefaulted. */
export const env = (name: EnvName): string => read(ENV_SPECS[name])

/** Read a boolean-valued variable. Only the exact string 'true' is true. */
export const envFlag = (name: EnvName): boolean => env(name) === 'true'

/** Read a comma-separated list, trimmed, with empties dropped. */
export const envList = (name: EnvName): string[] =>
  env(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * The legacy names this module still accepts. `scripts/test-rebrand.mts`
 * asserts that none of these is read anywhere else in src/.
 */
export const ACCEPTED_LEGACY_ENV_NAMES: string[] = Object.values(ENV_SPECS)
  .map((s) => (s as EnvSpec).legacyKey)
  .filter((k): k is string => Boolean(k))
