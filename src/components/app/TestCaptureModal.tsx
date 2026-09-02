'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2, FlaskConical, X } from 'lucide-react'

type Step = { step: string; ok: boolean; detail?: string; duration_ms?: number }
type Result = { ok: boolean; lead_id: number | null; event_id: string; steps: Step[]; error?: string }

export function TestCaptureButton({ siteSlug }: { siteSlug: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-white font-medium px-4 py-2 rounded-lg border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] inline-flex items-center gap-1.5"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        Test Capture
      </button>
      {open ? <TestCaptureModal siteSlug={siteSlug} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function TestCaptureModal({ siteSlug, onClose }: { siteSlug: string; onClose: () => void }) {
  const [funnelType, setFunnelType] = useState<'contact-form' | 'quiz' | 'landing-page'>('contact-form')
  const [utmSource, setUtmSource] = useState('test')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = () => {
    setError(null)
    setResult(null)
    start(async () => {
      try {
        const resp = await fetch('/api/pageflo/test-capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_slug: siteSlug,
            funnel_type: funnelType,
            utm_source: utmSource,
            utm_medium: 'admin',
            utm_campaign: 'test-capture',
          }),
        })
        const json = (await resp.json()) as Result
        setResult(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-[640px] rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
        <header className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-md flex items-center justify-center bg-[var(--color-info)]/10 text-[var(--color-info)]">
              <FlaskConical className="w-4 h-4" />
            </span>
            <h2 className="text-[16px] font-semibold text-white">Test Capture</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-6 py-5 overflow-y-auto">
          <p className="text-[13px] text-[var(--color-ink-muted)] mb-4">
            Fires a synthetic lead through the full pipeline (Lead row → TrustedForm claim → Meta CAPI → TikTok Events API →
            GA4 MP → TrueCall → webhooks → Slack → HLR async). Marked <code className="text-[var(--color-info)]">test_capture=true</code>.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-1.5">Funnel type</span>
              <select
                value={funnelType}
                onChange={(e) => setFunnelType(e.target.value as 'contact-form' | 'quiz' | 'landing-page')}
                className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2 text-[13px] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-border-strong)]"
              >
                <option value="contact-form">Contact form</option>
                <option value="quiz">Quiz</option>
                <option value="landing-page">Landing page</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-1.5">UTM source</span>
              <input
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="test"
                className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]"
              />
            </label>
          </div>

          {error ? <p className="text-[13px] text-[var(--color-neg)] mb-3">{error}</p> : null}

          {result ? (
            <div className="mb-4">
              <div className="flex items-center justify-between text-[13px] mb-3">
                <span className="font-semibold text-white">
                  {result.ok ? 'Pipeline completed' : 'Pipeline failed'}
                </span>
                <span className="text-[var(--color-ink-muted)] font-mono text-[12px]">
                  Lead #{result.lead_id ?? '—'} · {result.event_id.slice(0, 12)}…
                </span>
              </div>
              <ul className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] divide-y divide-[var(--color-border)] overflow-hidden">
                {result.steps.map((s, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {s.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--color-pos)]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[var(--color-neg)]" />
                      )}
                    </span>
                    <span className="text-[var(--color-ink)] font-mono text-[12px] flex-1 truncate">{s.step}</span>
                    {s.detail ? (
                      <span className="text-[var(--color-ink-muted)] text-[12px] truncate max-w-[260px]">{s.detail}</span>
                    ) : null}
                    {typeof s.duration_ms === 'number' ? (
                      <span className="text-[var(--color-ink-dim)] text-[11px] font-mono shrink-0">{s.duration_ms}ms</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {result.lead_id ? (
                <a
                  href={`/cms/collections/leads/${result.lead_id}`}
                  className="mt-3 inline-block text-[13px] text-[var(--color-info)] hover:underline"
                >
                  Open Lead in raw admin →
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium px-4 py-2 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)]"
          >
            Close
          </button>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="brand-gradient text-white font-semibold text-[13px] px-5 py-2 rounded-md disabled:opacity-50 hover:opacity-90 inline-flex items-center gap-2"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
            {pending ? 'Running…' : 'Fire test lead'}
          </button>
        </footer>
      </div>
    </div>
  )
}
