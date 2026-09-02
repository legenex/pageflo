import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { InfraCheck } from '@/lib/infra-check'
import { PRODUCT_NAME } from '@/lib/pageflo/product'

export function InfraReadinessBanner({ infra }: { infra: InfraCheck }) {
  if (infra.ok) return null

  const cnameOk = infra.cname_target.resolves
  const previewOk = infra.preview_wildcard.resolves

  return (
    <div className="mb-5 rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-md inline-flex items-center justify-center bg-[var(--color-warn)]/15 text-[var(--color-warn)]">
          <AlertTriangle className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-white">{PRODUCT_NAME} infrastructure not fully wired</h3>
          <p className="text-[13px] text-[var(--color-ink)] mt-1 leading-relaxed">
            Domains will verify but won&apos;t actually load until your operator-level DNS is set up at <code className="font-mono text-[var(--color-info)]">legenex.com</code>:
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {!cnameOk ? (
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-neg)] font-bold leading-5">✗</span>
                <span className="text-[var(--color-ink)]">
                  <code className="font-mono text-[var(--color-info)]">{infra.cname_target.host ?? '(unset)'}</code> does not resolve.
                  Add an A record:{' '}
                  <code className="font-mono text-white">cname A &lt;your server IP&gt;</code> at your legenex.com DNS.
                  {infra.cname_target.error ? <span className="text-[var(--color-ink-dim)]"> ({infra.cname_target.error})</span> : null}
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-pos)] font-bold leading-5">✓</span>
                <span className="text-[var(--color-ink)]">
                  <code className="font-mono text-[var(--color-info)]">{infra.cname_target.host}</code> resolves.
                </span>
              </li>
            )}
            {!previewOk ? (
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-neg)] font-bold leading-5">✗</span>
                <span className="text-[var(--color-ink)]">
                  Wildcard preview probe failed (<code className="font-mono text-[var(--color-info)]">{infra.preview_wildcard.sample_host ?? '(unset)'}</code>). Add a wildcard A record:{' '}
                  <code className="font-mono text-white">*.preview A &lt;your server IP&gt;</code> at your legenex.com DNS.
                  {infra.preview_wildcard.error ? <span className="text-[var(--color-ink-dim)]"> ({infra.preview_wildcard.error})</span> : null}
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-2">
                <span className="text-[var(--color-pos)] font-bold leading-5">✓</span>
                <span className="text-[var(--color-ink)]">Preview wildcard resolves.</span>
              </li>
            )}
          </ul>
          <p className="mt-3 text-[12px] text-[var(--color-ink-dim)]">
            This check runs from the server via Cloudflare DoH and caches for 5 minutes. Until both items are green, tenant domains will appear &ldquo;verified&rdquo; but won&apos;t serve traffic.{' '}
            <a
              href="https://github.com/legenex/pageflo#deploy"
              className="text-[var(--color-info)] hover:underline inline-flex items-center gap-0.5"
              target="_blank"
              rel="noreferrer"
            >
              Setup docs <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
