/**
 * Tenant domain provisioning — direct nginx + Let's Encrypt approach.
 *
 * Why not Plesk REST API anymore: the standard Plesk path (POST /api/v2/domains)
 * counts each tenant against the Plesk subscription's lim_dom quota. With
 * Web Admin Edition that's 10 domains total — not viable for a multi-tenant
 * platform. Domain aliases were attempted as a workaround but Plesk doesn't
 * regenerate the parent's nginx server_name when the alias is added.
 *
 * Replacement: skip Plesk's domain-management layer entirely.
 *
 *   1. Issue a Let's Encrypt cert via Plesk's bundled LE CLI, using the
 *      webroot at /var/www/vhosts/default/htdocs. Doesn't count against
 *      the domain quota.
 *
 *   2. Write a per-tenant nginx config to
 *      /etc/nginx/conf.d/legalos-tenants/<host>.conf with two server blocks:
 *        - :80  → ACME challenge + 301 to HTTPS
 *        - :443 → SSL + reverse-proxy to the Next.js app
 *
 *   3. systemctl reload nginx — picks up the new config without dropping
 *      existing connections.
 *
 * The Next.js app (running locally on :3000) sees Host: <tenant> and
 * resolves it via resolveSiteByHost() to the correct Site row.
 */
import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import path from 'path'

export type ProvisionStep = { step: string; ok: boolean; detail?: string }
export type ProvisionResult = {
  ok: boolean
  /** Kept named `plesk_domain_id` for DB schema back-compat. Now holds the host. */
  plesk_domain_id: string | null
  steps: ProvisionStep[]
  error?: string
}

const TENANT_NGINX_DIR = '/etc/nginx/conf.d/legalos-tenants'
const ACME_WEBROOT = '/var/www/vhosts/default/htdocs'

/**
 * ONE certificate ownership model per hostname, and acme.sh owns it.
 *
 * This module used to write `ssl_certificate` lines pointing at Plesk's
 * Let's Encrypt store, `/opt/psa/var/modules/letsencrypt/etc/live`. That store
 * has no renewal owner for these hosts: they are not Plesk domains, so Plesk's
 * own renewal never considers them, and nothing else did either — which is how
 * crashclaim.co, the de-facto default vhost, was found five days from expiry.
 *
 * Every tenant certificate is now issued and installed by acme.sh into
 * ACME_CERT_ROOT, and acme.sh records the install paths plus a validating
 * reload hook, so an unattended renewal reinstalls into the exact file nginx
 * reads. That is the whole point: renewal ownership travels with the
 * certificate instead of being a thing somebody has to remember.
 *
 * Consequences enforced below:
 *   - provisioning NEVER emits a path under the Plesk store;
 *   - a host already managed by acme.sh is not rewritten;
 *   - a host covered by an acme.sh WILDCARD gets no per-host vhost at all,
 *     because an exact `server_name` outranks a wildcard one and would quietly
 *     move that host onto a different certificate.
 */
const ACME_CERT_ROOT = '/etc/ssl/legalos'
const ACME_SH_HOME = '/root/.acme.sh'
const ACME_SH = `${ACME_SH_HOME}/acme.sh`
const ACME_RELOAD_HOOK = '/root/legalos-reload-nginx-cert.sh'

const acmeCertDir = (name: string): string => path.join(ACME_CERT_ROOT, name)

const proxyTarget = (): string => process.env.PLESK_PROXY_TARGET ?? 'http://127.0.0.1:3000'
const ownerEmail = (): string => process.env.PLESK_OWNER_EMAIL ?? 'team@legenex.com'
const ipAddress = (): string | null => process.env.PLESK_IP_ADDRESS || null

type ShellResult = { code: number; stdout: string; stderr: string }
const shell = (cmd: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<ShellResult> =>
  new Promise((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 120_000
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr || err.message })
    })
  })

const isSafeHost = (host: string): boolean =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host)

const tenantConfigPath = (host: string): string => path.join(TENANT_NGINX_DIR, `${host}.conf`)

/* -------------------------------------------------------------------------- */
/*                    Certificate ownership — pure decision                    */
/* -------------------------------------------------------------------------- */

/**
 * What the filesystem says, gathered once and then reasoned about without
 * touching it again. Split out so the decision is testable: the bug this
 * replaces could only be found by reading, because the deciding code was
 * interleaved with the writing code and could not be run without a server.
 */
export type CertFacts = {
  /** Directory names under ACME_CERT_ROOT, e.g. ['preview.legenex.com', 'crashclaim.co']. */
  acmeInstalls: string[]
  /**
   * Of those, the ones whose certificate is actually a WILDCARD, by base name
   * (`preview.legenex.com` for `*.preview.legenex.com`).
   *
   * This is a separate fact because the install directory name does not carry
   * it: the wildcard is installed to `/etc/ssl/legalos/preview.legenex.com/`,
   * which looks exactly like a single-name install. Treating every install as a
   * wildcard base made `www.getwhatyoureowed.co` resolve to the
   * `getwhatyoureowed.co` certificate, which does not cover it — provisioning
   * would then report success having issued nothing.
   */
  wildcardBases: string[]
  /** Whether a per-host vhost file exists for the host being planned. */
  tenantVhostExists: boolean
  /** The `ssl_certificate` path that vhost currently references, if any. */
  tenantVhostCertPath: string | null
}

export type ProvisionPlan =
  /** An acme.sh wildcard already serves this host. Touch nothing. */
  | { action: 'covered-by-wildcard'; wildcardBase: string; certDir: string; reason: string; strayVhost: boolean }
  /** A per-host acme.sh cert exists and the vhost already points at it. Touch nothing. */
  | { action: 'already-managed'; certDir: string; reason: string }
  /** A per-host acme.sh cert exists but the vhost is missing or points elsewhere. */
  | { action: 'repair-vhost'; certDir: string; reason: string }
  /** No certificate yet. Issue one through acme.sh and write the vhost. */
  | { action: 'issue'; certDir: string; reason: string }

/**
 * Is `host` a single label below one of the wildcard bases we hold?
 *
 * `*.preview.legenex.com` covers `a.preview.legenex.com` and NOT
 * `a.b.preview.legenex.com` — an X.509 wildcard matches exactly one label, even
 * though nginx's `server_name *.preview.legenex.com` matches more. Being
 * stricter than nginx here is deliberate: the question is which certificate is
 * VALID for the host, not which server block would answer.
 */
const wildcardBaseFor = (host: string, wildcardBases: string[]): string | null => {
  for (const base of wildcardBases) {
    if (!host.endsWith(`.${base}`)) continue
    const label = host.slice(0, -(base.length + 1))
    if (label.length > 0 && !label.includes('.')) return base
  }
  return null
}

/**
 * Decide what provisioning may do to a host, given only facts.
 *
 * Order matters. An exact per-host certificate wins over wildcard coverage,
 * because if somebody deliberately issued one for this host it is the more
 * specific statement of intent.
 */
export const planProvisioning = (host: string, facts: CertFacts): ProvisionPlan => {
  const exactDir = acmeCertDir(host)

  if (facts.acmeInstalls.includes(host)) {
    return facts.tenantVhostCertPath === `${exactDir}/fullchain.pem`
      ? {
          action: 'already-managed',
          certDir: exactDir,
          reason: `acme.sh manages ${host} and the vhost already points at it; nothing to do`,
        }
      : {
          action: 'repair-vhost',
          certDir: exactDir,
          reason: facts.tenantVhostExists
            ? `acme.sh manages ${host} but the vhost points at ${facts.tenantVhostCertPath ?? '(nothing)'}`
            : `acme.sh manages ${host} but no vhost exists`,
        }
  }

  const base = wildcardBaseFor(host, facts.wildcardBases)
  if (base) {
    return {
      action: 'covered-by-wildcard',
      wildcardBase: base,
      certDir: acmeCertDir(base),
      // A per-host file here would win on exact server_name and move the host
      // off the wildcard, so it is reported and never written.
      strayVhost: facts.tenantVhostExists,
      reason: `*.${base} already serves ${host}; a per-host vhost would override the wildcard`,
    }
  }

  return {
    action: 'issue',
    certDir: exactDir,
    reason: `no certificate for ${host} yet; issuing through acme.sh so renewal has an owner`,
  }
}

const renderTenantNginxConfig = (host: string, certDir: string): string => {
  const ip = ipAddress()
  const listen80 = ip ? `${ip}:80` : '80'
  const listen443 = ip ? `${ip}:443` : '443'
  const target = proxyTarget()
  return `# LegalOS tenant: ${host}
# Generated by src/lib/plesk/provision-domain.ts at ${new Date().toISOString()}

server {
    listen ${listen80};
    server_name ${host};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }

    location / { return 301 https://$host$request_uri; }
}

server {
    listen ${listen443} ssl;
    http2 on;
    server_name ${host};

    ssl_certificate     ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;

    client_max_body_size 50m;

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }

    location / {
        proxy_pass ${target};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
`
}

// Minimal :80-only vhost that serves ONLY the ACME HTTP-01 challenge for this
// host and proxies everything else to the app over HTTP. Stood up BEFORE the
// cert is requested so Let's Encrypt has a per-host place to validate against,
// and contains no `ssl_certificate` directive so `nginx -t` passes even though
// no cert exists yet. Everything else proxies (not 301-redirects) so the site
// is reachable over HTTP during the brief provisioning window and the challenge
// path is never redirected away.
const renderAcmeBootstrapConfig = (host: string): string => {
  const ip = ipAddress()
  const listen80 = ip ? `${ip}:80` : '80'
  const target = proxyTarget()
  return `# LegalOS tenant (ACME bootstrap, pre-cert): ${host}
# Generated by src/lib/plesk/provision-domain.ts at ${new Date().toISOString()}

server {
    listen ${listen80};
    server_name ${host};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
        default_type text/plain;
        allow all;
    }

    location / {
        proxy_pass ${target};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`
}

/**
 * Gather the filesystem facts `planProvisioning` reasons about.
 *
 * Reads only. Everything that decides is pure and lives above.
 */
const gatherCertFacts = async (host: string): Promise<CertFacts> => {
  let acmeInstalls: string[] = []
  try {
    const entries = await fs.readdir(ACME_CERT_ROOT, { withFileTypes: true })
    // A directory only counts as an install once it actually holds a chain —
    // an empty dir left behind by a failed issue must not look like coverage.
    acmeInstalls = (
      await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (e) =>
            fs
              .access(path.join(ACME_CERT_ROOT, e.name, 'fullchain.pem'))
              .then(() => e.name)
              .catch(() => null),
          ),
      )
    ).filter((n): n is string => n !== null)
  } catch {
    acmeInstalls = []
  }

  let tenantVhostExists = false
  let tenantVhostCertPath: string | null = null
  try {
    const cfg = await fs.readFile(tenantConfigPath(host), 'utf8')
    tenantVhostExists = true
    const m = cfg.match(/^\s*ssl_certificate\s+(\S+?);/m)
    tenantVhostCertPath = m ? m[1] : null
  } catch {
    tenantVhostExists = false
  }

  // acme.sh names a certificate's store after its MAIN domain, so a wildcard
  // lands in `*.preview.legenex.com_ecc`. That leading `*.` is the only
  // reliable on-disk statement that the cert is a wildcard — the install
  // directory we chose in ACME_CERT_ROOT does not carry it.
  let wildcardBases: string[] = []
  try {
    const entries = await fs.readdir(ACME_SH_HOME, { withFileTypes: true })
    wildcardBases = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('*.'))
      .map((e) => e.name.replace(/^\*\./, '').replace(/_(ecc|rsa)$/, ''))
      .filter((base) => acmeInstalls.includes(base))
  } catch {
    wildcardBases = []
  }

  return { acmeInstalls, wildcardBases, tenantVhostExists, tenantVhostCertPath }
}

/**
 * Issue and install through acme.sh, so the certificate is born with a renewal
 * owner. `--install-cert` is what makes renewal self-installing: acme.sh
 * records these paths and the reload hook and repeats them from cron.
 *
 * Deliberately NOT Plesk's LE CLI. That put the certificate somewhere nothing
 * renews from, which is the defect this module exists to stop repeating.
 */
const issueAcmeCert = async (host: string, certDir: string): Promise<{ ok: boolean; detail: string }> => {
  const issue = await shell(
    ACME_SH,
    ['--issue', '--server', 'letsencrypt', '-d', host, '--webroot', ACME_WEBROOT, '--accountemail', ownerEmail()],
    { timeoutMs: 180_000 },
  )
  // acme.sh exits 2 when the certificate is already present and not due for
  // renewal. That is success for our purposes: the install below still runs.
  if (issue.code !== 0 && issue.code !== 2) {
    const tail = (issue.stderr || issue.stdout || 'acme.sh issue failed').trim().split('\n').slice(-5).join(' | ')
    return { ok: false, detail: tail }
  }

  await fs.mkdir(certDir, { recursive: true, mode: 0o700 }).catch(() => undefined)
  const install = await shell(
    ACME_SH,
    [
      '--install-cert', '-d', host,
      '--key-file', path.join(certDir, 'privkey.pem'),
      '--fullchain-file', path.join(certDir, 'fullchain.pem'),
      '--reloadcmd', `${ACME_RELOAD_HOOK} ${certDir}`,
    ],
    { timeoutMs: 120_000 },
  )
  if (install.code !== 0) {
    const tail = (install.stderr || install.stdout || 'acme.sh install failed').trim().split('\n').slice(-5).join(' | ')
    return { ok: false, detail: tail }
  }

  try {
    await fs.access(path.join(certDir, 'fullchain.pem'))
    await fs.access(path.join(certDir, 'privkey.pem'))
  } catch {
    return { ok: false, detail: 'acme.sh reported success but cert files are missing on disk' }
  }
  return { ok: true, detail: `cert installed at ${certDir}/fullchain.pem, renewal self-installing` }
}

// Write a tenant nginx config, validate it, and reload. On `nginx -t` failure we
// never leave a broken file in place: roll back to `rollbackTo` if given (e.g.
// the still-valid bootstrap config), otherwise remove the file entirely.
const writeNginxConfig = async (
  host: string,
  contents: string,
  opts: { rollbackTo?: string | null } = {},
): Promise<{ ok: boolean; detail: string }> => {
  const filePath = tenantConfigPath(host)
  await fs.mkdir(TENANT_NGINX_DIR, { recursive: true })
  await fs.writeFile(filePath, contents, { mode: 0o644 })
  const test = await shell('nginx', ['-t'])
  if (test.code !== 0) {
    if (opts.rollbackTo) await fs.writeFile(filePath, opts.rollbackTo, { mode: 0o644 }).catch(() => undefined)
    else await fs.unlink(filePath).catch(() => undefined)
    const tail = (test.stderr || test.stdout).trim().split('\n').slice(-3).join(' | ')
    return { ok: false, detail: `nginx -t failed: ${tail}` }
  }
  const reload = await shell('systemctl', ['reload', 'nginx'])
  if (reload.code !== 0) {
    return { ok: false, detail: `nginx reload failed: ${(reload.stderr || reload.stdout).trim()}` }
  }
  return { ok: true, detail: filePath }
}

export const provisionDomainInPlesk = async (args: { host: string }): Promise<ProvisionResult> => {
  const steps: ProvisionStep[] = []
  const host = args.host.trim().toLowerCase()

  if (!isSafeHost(host)) {
    return {
      ok: false,
      plesk_domain_id: null,
      steps: [{ step: 'guard', ok: false, detail: `unsafe hostname: ${host}` }],
      error: `unsafe hostname: ${host}`,
    }
  }

  const facts = await gatherCertFacts(host)
  const plan = planProvisioning(host, facts)
  steps.push({ step: 'cert-ownership', ok: true, detail: `${plan.action}: ${plan.reason}` })

  // A recheck of a host somebody else's certificate already serves must be a
  // READ. Writing here is how a working host gets moved onto a certificate with
  // no renewal owner, which is the failure this branch exists to prevent.
  if (plan.action === 'covered-by-wildcard') {
    if (plan.strayVhost) {
      steps.push({
        step: 'warning',
        ok: true,
        detail:
          `a per-host vhost exists at ${tenantConfigPath(host)} and overrides the *.${plan.wildcardBase} ` +
          `wildcard. Left in place rather than deleted; remove it by hand if that is not intended.`,
      })
    }
    return { ok: true, plesk_domain_id: host, steps }
  }

  if (plan.action === 'already-managed') {
    return { ok: true, plesk_domain_id: host, steps }
  }

  if (plan.action === 'repair-vhost') {
    const nginx = await writeNginxConfig(host, renderTenantNginxConfig(host, plan.certDir))
    steps.push({ step: 'nginx-tls', ok: nginx.ok, detail: nginx.detail })
    if (!nginx.ok) return { ok: false, plesk_domain_id: host, steps, error: nginx.detail }
    return { ok: true, plesk_domain_id: host, steps }
  }

  // First issue. ORDER MATTERS: stand up the :80 ACME-challenge route BEFORE
  // requesting the cert, so HTTP-01 validation can actually resolve. Requesting
  // the cert first left LE with nowhere to validate.
  const bootstrap = renderAcmeBootstrapConfig(host)
  const boot = await writeNginxConfig(host, bootstrap)
  steps.push({ step: 'nginx-acme-bootstrap', ok: boot.ok, detail: boot.detail })
  if (!boot.ok) return { ok: false, plesk_domain_id: null, steps, error: boot.detail }

  const cert = await issueAcmeCert(host, plan.certDir)
  steps.push({ step: 'acme-issue', ok: cert.ok, detail: cert.detail })
  if (!cert.ok) {
    // Leave the bootstrap :80 config live: the site still serves over HTTP and
    // the next retry can validate without re-bootstrapping.
    return { ok: false, plesk_domain_id: host, steps, error: `acme.sh: ${cert.detail}` }
  }

  const nginx = await writeNginxConfig(host, renderTenantNginxConfig(host, plan.certDir), { rollbackTo: bootstrap })
  steps.push({ step: 'nginx-tls', ok: nginx.ok, detail: nginx.detail })
  if (!nginx.ok) return { ok: false, plesk_domain_id: host, steps, error: nginx.detail }

  return { ok: true, plesk_domain_id: host, steps }
}

/**
 * Hosts whose vhost file must never be removed by unprovisioning a tenant.
 *
 * `crashclaim.co` is the FIRST `:443` server block and therefore the de-facto
 * default vhost for every unmatched SNI — nginx has no `default_server` here,
 * so the first block wins. Unlinking it silently promotes whichever file sorts
 * next to answer for every unknown host. `preview.legenex.com` is the wildcard
 * that serves every tenant preview host at once.
 *
 * Neither is a tenant domain, so no legitimate tenant teardown needs them gone.
 */
const PROTECTED_VHOSTS = new Set(['crashclaim.co', 'preview.legenex.com', 'test.checkmyclaim.co'])

export const unprovisionDomainInPlesk = async (args: { pleskDomainId: string }): Promise<{ ok: boolean; error?: string }> => {
  const host = args.pleskDomainId.trim().toLowerCase()
  if (!isSafeHost(host)) return { ok: false, error: `unsafe hostname: ${host}` }

  if (PROTECTED_VHOSTS.has(host)) {
    return { ok: false, error: `${host} is shared infrastructure (default vhost or wildcard) and is not tenant-removable` }
  }

  const facts = await gatherCertFacts(host)

  // Covered by a wildcard: there is no per-host vhost and no per-host cert to
  // remove, and the wildcard keeps serving its other hosts. Nothing to do.
  const wildcard = wildcardBaseFor(host, facts.wildcardBases)
  if (wildcard && !facts.acmeInstalls.includes(host)) {
    return { ok: true }
  }

  try {
    await fs.unlink(tenantConfigPath(host))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { ok: false, error: `failed to remove nginx config: ${(err as Error).message}` }
    }
  }

  // Stop RENEWING a certificate for a host we no longer serve. Deliberately
  // `--remove` and not `--revoke`: revocation is irreversible and pointless
  // here, and the old Plesk LE CLI call this replaces could revoke a
  // certificate this module no longer owns.
  if (facts.acmeInstalls.includes(host)) {
    await shell(ACME_SH, ['--remove', '-d', host], { timeoutMs: 60_000 }).catch(() => undefined)
  }

  const reload = await shell('systemctl', ['reload', 'nginx'])
  if (reload.code !== 0) {
    return { ok: false, error: `nginx reload failed: ${reload.stderr || reload.stdout}` }
  }

  return { ok: true }
}

/**
 * Provisioning no longer requires PLESK_API_URL / PLESK_API_KEY. The LE CLI
 * runs as the local root systemd service and nginx config is direct filesystem
 * access. Only PLESK_PROXY_TARGET and (optionally) PLESK_IP_ADDRESS are read.
 */
export const pleskIsConfigured = (): boolean => {
  if ((process.env.LEGALOS_DISABLE_PROVISIONING ?? 'false').toLowerCase() === 'true') return false
  return true
}
