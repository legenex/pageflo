// Shared fetchers for brand extraction. Builds a single "asset bundle" from a
// URL or a GitHub repo that the three extractors (colors, logos, copy) read
// from. Everything here is best-effort: any failure returns partial/empty and
// NEVER throws, so a slow or broken source degrades to AI-only gap-fill
// instead of erroring the brand-creation request.

import { load, type CheerioAPI } from 'cheerio'

import { safeFetch, type DnsResolver, type FetchLike } from '@/lib/net/ssrf'

const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * Side effects, injected.
 *
 * Every fetch in this file is of an address a user supplied - a brand URL typed
 * into the builder, a stylesheet that URL linked to, a logo that page pointed
 * at. All of them are SSRF vectors, and all of them now go through `safeFetch`.
 *
 * The deps are threaded through rather than hardcoded for the reason stated in
 * `lib/net/ssrf`: admission is only provably ON the path if the suite can run
 * the blocked-range matrix through THESE functions, and it can only do that if
 * it can supply a resolver. A guard that is never exercised where it is used is
 * how this file passed review while fetching 169.254.169.254 on request.
 */
export type RemoteFetchDeps = { resolver?: DnsResolver; fetchImpl?: FetchLike }

export async function fetchTextSafe(
  url: string,
  timeoutMs = 8000,
  headers: Record<string, string> = {},
  deps: RemoteFetchDeps = {},
): Promise<string | null> {
  const res = await safeFetch(url, {
    method: 'GET',
    // The browser UA is kept: some hosts serve a stub to an unknown agent, and
    // that behaviour predates this guard and is not what is being changed here.
    headers: { 'User-Agent': UA_BROWSER, Accept: '*/*', ...headers },
    timeoutMs,
    resolver: deps.resolver,
    fetchImpl: deps.fetchImpl,
  })
  // Best-effort by contract: a refusal reads the same as a 404 to every caller,
  // so a blocked address degrades to "no data" instead of erroring the request.
  return res.ok ? res.body : null
}

// HEAD-check that a URL resolves AND is actually an image (not an HTML page).
// Falls back to a ranged GET when the host rejects HEAD.
export async function headOk(
  url: string,
  timeoutMs = 2500,
  deps: RemoteFetchDeps = {},
): Promise<{ ok: boolean; contentType: string }> {
  const check = async (method: 'HEAD' | 'GET') => {
    const res = await safeFetch(url, {
      method,
      headers: { 'User-Agent': UA_BROWSER, ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) },
      timeoutMs,
      // Only the content type is wanted, so the body is never read - a host that
      // ignores the Range header would otherwise have a whole asset buffered to
      // answer one header, times every logo candidate, in parallel.
      headersOnly: true,
      resolver: deps.resolver,
      fetchImpl: deps.fetchImpl,
    })
    if (!res.ok) return { ok: false, contentType: '' }
    return { ok: true, contentType: res.contentType }
  }
  let r = await check('HEAD')
  if (!r.ok) r = await check('GET')
  return r
}

export function normalizeUrl(raw: string): string | null {
  const u0 = (raw || '').trim()
  if (!u0) return null
  // Refused rather than encoded. `new URL()` would turn an embedded space into
  // %20 and hand admission a URL that no longer looks suspicious - laundering
  // the input before the guard sees it. The rule lives in lib/net/ssrf and is
  // not restated with different consequences here.
  if (/[\s\x00-\x1f\x7f]/.test(u0)) return null
  const u = /^https?:\/\//i.test(u0) ? u0 : 'https://' + u0
  try {
    return new URL(u).toString()
  } catch {
    return null
  }
}

export function resolveUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  const h = href.trim()
  if (!h) return null
  if (h.startsWith('data:')) return h
  try {
    return new URL(h, base).toString()
  } catch {
    return null
  }
}

export function extractFilename(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || ''
  } catch {
    return (url.split('/').pop() || '').split('?')[0]
  }
}

export type UrlBundle = {
  finalUrl: string
  host: string
  html: string
  $: CheerioAPI
  css: string
  googleFontFamilies: string[]
  manifest: Record<string, unknown> | null
}

// Fetch a page + its stylesheets + manifest into one bundle for extraction.
export async function fetchUrlBundle(rawUrl: string, deps: RemoteFetchDeps = {}): Promise<UrlBundle | null> {
  const finalUrl = normalizeUrl(rawUrl)
  if (!finalUrl) return null
  const html = await fetchTextSafe(finalUrl, 8000, {}, deps)
  if (!html) return null

  const $ = load(html)
  const host = (() => {
    try {
      return new URL(finalUrl).host
    } catch {
      return ''
    }
  })()

  // Merge inline <style> blocks.
  let css = ''
  $('style').each((_, el) => {
    css += '\n' + ($(el).html() || '')
  })

  // Up to 3 linked stylesheets (where brand vars usually live).
  const sheetHrefs: string[] = []
  const googleFontFamilies: string[] = []
  $('link[rel="stylesheet"], link[rel="preload"][as="style"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const abs = resolveUrl(href, finalUrl)
    if (!abs) return
    if (/fonts\.googleapis\.com/i.test(abs)) {
      // Pull family names out of the Google Fonts URL.
      try {
        const u = new URL(abs)
        u.searchParams.getAll('family').forEach((f) => {
          const name = f.split(':')[0].replace(/\+/g, ' ').trim()
          if (name) googleFontFamilies.push(name)
        })
      } catch {
        /* ignore */
      }
      return
    }
    if (sheetHrefs.length < 3) sheetHrefs.push(abs)
  })
  for (const sheet of sheetHrefs) {
    const text = await fetchTextSafe(sheet, 4000, {}, deps)
    if (text) css += '\n' + text
    if (css.length > 400_000) break
  }

  // Web app manifest (icons live here too).
  let manifest: Record<string, unknown> | null = null
  const manifestHref = $('link[rel="manifest"]').attr('href')
  if (manifestHref) {
    const manifestUrl = resolveUrl(manifestHref, finalUrl)
    if (manifestUrl) {
      const text = await fetchTextSafe(manifestUrl, 4000, {}, deps)
      if (text) {
        try {
          manifest = JSON.parse(text)
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { finalUrl, host, html, $, css, googleFontFamilies, manifest }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------
export function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } | null {
  if (!repoUrl) return null
  const m = repoUrl
    .trim()
    .replace(/\.git$/, '')
    .match(/github\.com[/:]([^/]+)\/([^/#?]+)/i)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export type GithubBundle = {
  owner: string
  repo: string
  branch: string
  baseRaw: string // raw.githubusercontent.com/owner/repo/branch
  files: {
    tailwindConfig: string | null
    globalsCss: string | null
    packageJson: Record<string, unknown> | null
    readme: string | null
    manifest: Record<string, unknown> | null
  }
  // Public asset paths confirmed present via HEAD (raw URLs).
  assetUrls: { url: string; filename: string; contentType: string }[]
  accessible: boolean
}

const githubToken = (): string => process.env.GITHUB_TOKEN || ''

const ghHeaders = (): Record<string, string> => {
  const t = githubToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function detectDefaultBranch(owner: string, repo: string, deps: RemoteFetchDeps = {}): Promise<string> {
  // Try the API (respects token for higher limits), then probe main/master.
  const api = await fetchTextSafe(
    `https://api.github.com/repos/${owner}/${repo}`,
    4000,
    { Accept: 'application/vnd.github+json', ...ghHeaders() },
    deps,
  )
  if (api) {
    try {
      const j = JSON.parse(api) as { default_branch?: string }
      if (j.default_branch) return j.default_branch
    } catch {
      /* ignore */
    }
  }
  for (const b of ['main', 'master']) {
    const probe = await headOk(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`, 3000, deps)
    if (probe.ok) return b
  }
  return 'main'
}

export async function fetchGithubBundle(repoUrl: string, deps: RemoteFetchDeps = {}): Promise<GithubBundle | null> {
  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) return null
  const { owner, repo } = parsed
  const branch = await detectDefaultBranch(owner, repo, deps)
  const baseRaw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
  const raw = (path: string, ms = 3000) => fetchTextSafe(`${baseRaw}/${path}`, ms, ghHeaders(), deps)

  // First hit of each candidate group.
  const firstHit = async (paths: string[]): Promise<string | null> => {
    for (const p of paths) {
      const t = await raw(p)
      if (t) return t
    }
    return null
  }

  const [tailwindConfig, globalsCss, packageJsonText, readme, manifestText] = await Promise.all([
    firstHit(['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs']),
    firstHit(['app/globals.css', 'src/app/globals.css', 'styles/globals.css', 'src/styles/globals.css', 'src/styles/index.css', 'app/global.css']),
    raw('package.json'),
    firstHit(['README.md', 'readme.md', 'Readme.md']),
    firstHit(['public/manifest.json', 'public/site.webmanifest', 'static/manifest.json']),
  ])

  let packageJson: Record<string, unknown> | null = null
  if (packageJsonText) {
    try {
      packageJson = JSON.parse(packageJsonText)
    } catch {
      /* ignore */
    }
  }
  let manifest: Record<string, unknown> | null = null
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText)
    } catch {
      /* ignore */
    }
  }

  // Probe common public asset locations.
  const assetCandidates = [
    'public/logo.svg', 'public/logo.png', 'public/logo-dark.svg', 'public/logo-dark.png',
    'public/logo-white.svg', 'public/logo-light.svg', 'public/brand/logo.svg',
    'public/images/logo.svg', 'public/images/logo.png', 'public/assets/logo.svg',
    'public/favicon.svg', 'public/favicon.ico', 'public/favicon.png',
    'public/og-image.png', 'public/og.png', 'public/opengraph-image.png',
    'static/logo.svg', 'static/logo.png', 'logo.svg', 'logo.png',
  ]
  const assetUrls: { url: string; filename: string; contentType: string }[] = []
  await Promise.all(
    assetCandidates.map(async (p) => {
      const url = `${baseRaw}/${p}`
      const r = await headOk(url, 2500, deps)
      if (r.ok && /image|svg/i.test(r.contentType || extractFilename(p))) {
        assetUrls.push({ url, filename: extractFilename(p), contentType: r.contentType })
      }
    }),
  )

  const accessible = Boolean(tailwindConfig || globalsCss || packageJson || readme || assetUrls.length)

  return {
    owner,
    repo,
    branch,
    baseRaw,
    files: { tailwindConfig, globalsCss, packageJson, readme, manifest },
    assetUrls,
    accessible,
  }
}
