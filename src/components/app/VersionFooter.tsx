import { readFile } from 'fs/promises'
import { join } from 'path'
import { env } from '@/lib/pageflo/env'

/**
 * Tiny version pill anchored to the bottom-right of the admin shell.
 *
 * Production: shows `build N` (commit count, auto-incremented by deploy.sh),
 * with the short SHA in the tooltip. Click opens the commit on GitHub.
 *
 * Local dev: reads .git/HEAD off the working tree at request time and shows
 * `dev / <short-sha>` so you can tell at a glance which local commit you're
 * testing against.
 */

const REPO_URL = 'https://github.com/legenex/pageflo'

type VersionInfo = {
  isProd: boolean
  label: string
  sha: string | null
  buildTime: string | null
}

async function resolveVersion(): Promise<VersionInfo> {
  const envSha = env('gitSha')
  const envBuild = env('buildNumber')
  const envTime = env('buildTime')

  if (envSha && envSha !== 'unknown') {
    return {
      isProd: true,
      label: envBuild && envBuild !== '0' ? `build ${envBuild}` : envSha.slice(0, 7),
      sha: envSha,
      buildTime: envTime && envTime !== 'unknown' ? envTime : null,
    }
  }

  // Dev: read .git/HEAD off the working tree. Best-effort — log on failure so
  // it's diagnosable instead of silently showing "dev".
  const localSha = await tryReadLocalGitSha()
  return {
    isProd: false,
    label: localSha ? `dev / ${localSha.slice(0, 7)}` : 'dev',
    sha: localSha,
    buildTime: null,
  }
}

async function tryReadLocalGitSha(): Promise<string | null> {
  try {
    const cwd = process.cwd()
    const head = (await readFile(join(cwd, '.git', 'HEAD'), 'utf-8')).trim()
    if (head.startsWith('ref: ')) {
      const refPath = head.slice(5).trim()
      // First try the loose ref file.
      try {
        const sha = (await readFile(join(cwd, '.git', refPath), 'utf-8')).trim()
        if (sha) return sha
      } catch {
        // fall through to packed-refs
      }
      // Fall back to packed-refs (git compacts old refs into this single file).
      try {
        const packed = await readFile(join(cwd, '.git', 'packed-refs'), 'utf-8')
        const re = new RegExp(`^([0-9a-f]{40})\\s+${refPath.replace(/\//g, '\\/')}$`, 'm')
        const m = packed.match(re)
        if (m) return m[1]
      } catch {
        // no packed-refs file
      }
      return null
    }
    return head || null
  } catch (err) {
    // Log so a missing SHA in dev is diagnosable, not silent.
    console.warn('[VersionFooter] failed to read local git SHA:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function VersionFooter() {
  const { isProd, label, sha, buildTime } = await resolveVersion()
  const builtLabel = buildTime ? formatBuildTime(buildTime) : null
  const tooltip = [
    sha ? `commit ${sha}` : null,
    buildTime ? `built ${buildTime}` : null,
  ]
    .filter(Boolean)
    .join(' • ')

  const pill = (
    <span className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)]/80 backdrop-blur-sm px-2.5 py-1 text-[10px] font-mono text-[var(--color-ink-dim)] shadow-sm hover:text-[var(--color-ink)] transition-colors">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${isProd ? 'bg-[var(--color-pos)]' : 'bg-[var(--color-warn)]'}`}
        aria-hidden
      />
      <span>{label}</span>
      {builtLabel ? <span className="opacity-70">{builtLabel}</span> : null}
    </span>
  )

  return (
    <div
      className="fixed bottom-2 right-3 z-50 pointer-events-none select-none"
      aria-label="App version"
    >
      <div className="pointer-events-auto">
        {sha ? (
          <a
            href={`${REPO_URL}/commit/${sha}`}
            target="_blank"
            rel="noreferrer"
            title={tooltip || undefined}
          >
            {pill}
          </a>
        ) : (
          <span title="Local dev build">{pill}</span>
        )}
      </div>
    </div>
  )
}

function formatBuildTime(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const diffSec = Math.max(0, (Date.now() - t.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
