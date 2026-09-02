'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, File, Copy, Sparkles, Loader2 } from 'lucide-react'
import { VERTICALS, type VerticalGroup } from '@/lib/verticals'
import { createSite, suggestSlug } from './actions'

const VERTICAL_GROUPS: VerticalGroup[] = ['General', 'Legal']

type SourceSite = { id: number; name: string; slug: string }
type Vertical = string

type Mode = 'blank' | 'duplicate' | 'ai-template'

export function NewSiteButton({ sources }: { sources: SourceSite[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90"
      >
        <Plus className="w-4 h-4" /> New Site
      </button>
      {open ? <CreateSiteWizard sources={sources} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function CreateSiteWizard({ sources, onClose }: { sources: SourceSite[]; onClose: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('blank')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [vertical, setVertical] = useState<Vertical>('mva')
  const [sourceId, setSourceId] = useState<number | ''>('')
  const [brief, setBrief] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Auto-suggest slug from the name unless the user has typed in the slug field directly.
  useEffect(() => {
    if (slugTouched || !name) return
    const handle = setTimeout(async () => {
      const res = await suggestSlug(name)
      setSlug(res.slug)
    }, 200)
    return () => clearTimeout(handle)
  }, [name, slugTouched])

  const previewHost = slug ? `${slug}.preview.legenex.com` : '—'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const base = { name, slug, vertical }
    let payload: unknown
    if (mode === 'blank') payload = { mode: 'blank', ...base }
    else if (mode === 'duplicate') {
      if (!sourceId) {
        setError('Pick a source Site to duplicate from.')
        return
      }
      payload = { mode: 'duplicate', source_site_id: Number(sourceId), ...base }
    } else {
      if (brief.trim().length < 10) {
        setError('Provide a brief of at least 10 characters describing the brand and offer.')
        return
      }
      payload = { mode: 'ai-template', brief, ...base }
    }
    start(async () => {
      const result = await createSite(payload)
      if (result.ok) {
        router.push(`/admin/sites/${result.site.slug}`)
        router.refresh()
      } else {
        setError(result.error)
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
      <div className="w-full max-w-[720px] rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-2xl shadow-black/50 max-h-[90vh] flex flex-col">
        <header className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-white">New Site</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <ModeTabs mode={mode} onChange={setMode} />

        <form onSubmit={submit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">
            <Grid2>
              <Field label="Site name">
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Claim Checker"
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Slug">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }}
                  placeholder="claim-checker"
                  required
                  className={`${inputClass} font-mono`}
                />
              </Field>
            </Grid2>
            <Field label="Vertical">
              <select value={vertical} onChange={(e) => setVertical(e.target.value as Vertical)} className={inputClass}>
                {VERTICAL_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {VERTICALS.filter((v) => v.group === group).map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            {mode === 'duplicate' ? (
              <Field label="Source Site (clone all pages from)">
                <select
                  value={sourceId === '' ? '' : String(sourceId)}
                  onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : '')}
                  className={inputClass}
                  required
                >
                  <option value="">Select a source...</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
                <Help>The new Site clones every page (including body blocks) from the source. Brand tokens are also copied.</Help>
              </Field>
            ) : null}

            {mode === 'ai-template' ? (
              <Field label="Brand brief">
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={5}
                  placeholder="A serious, trust-forward brand for motor vehicle accident claims in Texas. Target audience is everyday drivers, 25-65. Focus on clear eligibility and free case review."
                  className={`${inputClass} font-normal`}
                  required
                />
                <Help>Used by the AI to generate brand colors, tagline, and a starting disclaimer. Default pages are scaffolded with shared legal templates.</Help>
              </Field>
            ) : null}

            <PreviewCard slug={slug} mode={mode} previewHost={previewHost} />

            {error ? (
              <p className="text-[13px] text-[var(--color-neg)] bg-[var(--color-neg)]/10 border border-[var(--color-neg)]/30 rounded-md px-3 py-2">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 sticky bottom-0 bg-[var(--color-surface-1)]">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] font-medium px-4 py-2 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name || !slug}
              className="brand-gradient text-white font-semibold text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50 hover:opacity-90 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {pending ? 'Creating…' : 'Create Site'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: Array<{ key: Mode; label: string; icon: typeof Plus; sub: string }> = [
    { key: 'blank', label: 'Blank', icon: File, sub: 'Empty Site with default legal pages' },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, sub: 'Clone all pages from an existing Site' },
    { key: 'ai-template', label: 'AI Template', icon: Sparkles, sub: 'Scaffold from a vertical brief' },
  ]
  return (
    <div className="grid grid-cols-3 border-b border-[var(--color-border)]">
      {tabs.map((t) => {
        const active = mode === t.key
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-4 border-b-2 transition-colors ${
              active
                ? 'border-[var(--color-brand-strong)] bg-[var(--color-surface-2)]/40'
                : 'border-transparent hover:bg-[var(--color-surface-2)]/30'
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? 'text-[var(--color-brand-strong)]' : 'text-[var(--color-ink-muted)]'}`} />
            <span className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-[var(--color-ink-muted)]'}`}>
              {t.label}
            </span>
            <span className="text-[11px] text-[var(--color-ink-dim)] text-center leading-tight">{t.sub}</span>
          </button>
        )
      })}
    </div>
  )
}

function PreviewCard({ slug, mode, previewHost }: { slug: string; mode: Mode; previewHost: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold mb-2">
        On create
      </p>
      <ul className="space-y-1.5 text-[13px] text-[var(--color-ink)]">
        <li>
          <span className="text-[var(--color-ink-muted)]">Preview URL:</span>{' '}
          <code className="text-[var(--color-info)] font-mono">https://{previewHost}</code>
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Pages:</span>{' '}
          {mode === 'duplicate' ? 'cloned from source Site' : '9 default (Home + 8 shared legal templates)'}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Brand:</span>{' '}
          {mode === 'ai-template'
            ? 'AI-generated palette, tagline, disclaimer'
            : mode === 'duplicate'
            ? 'cloned from source'
            : 'default Legenex palette (editable)'}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Tracking:</span> empty config (configure in Settings → Tracking)
        </li>
      </ul>
      {slug ? (
        <p className="mt-3 text-[12px] text-[var(--color-ink-dim)]">
          You will land on the new Site&apos;s admin Overview after creation.
        </p>
      ) : null}
    </div>
  )
}

const inputClass =
  'w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-[var(--color-ink-dim)] mt-1.5">{children}</p>
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}
