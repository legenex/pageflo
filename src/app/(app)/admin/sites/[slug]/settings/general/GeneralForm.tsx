'use client'

import { useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import { saveGeneralSettings } from './actions'
import { VERTICALS, type VerticalGroup } from '@/lib/verticals'

type Site = {
  id: number
  name: string
  slug: string
  tagline?: string | null
  vertical?: string | null
  org_name?: string | null
  org_address?: string | null
  support_email?: string | null
  default_phone?: string | null
  default_phone_tel?: string | null
  default_disclaimer_md?: string | null
  brand?: {
    logo_url?: string | null
    favicon_url?: string | null
    primary?: string | null
    accent?: string | null
    surface?: string | null
    ink?: string | null
    muted?: string | null
    font_heading?: string | null
    font_body?: string | null
  } | null
}

export function GeneralForm({ site }: { site: Site }) {
  const b = site.brand ?? {}
  const [primary, setPrimary] = useState(b.primary ?? '#0B1F3A')
  const [accent, setAccent] = useState(b.accent ?? '#E8B14B')
  const [surface, setSurface] = useState(b.surface ?? '#F7F5F0')
  const [ink, setInk] = useState(b.ink ?? '#0E1116')
  const [muted, setMuted] = useState(b.muted ?? '#5C6470')
  const [phoneDisplay, setPhoneDisplay] = useState(site.default_phone ?? '')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const onSubmit = (formData: FormData) => {
    setError(null)
    start(async () => {
      const result = await saveGeneralSettings(formData)
      if (result.ok) setSavedAt(new Date())
      else setError(result.error ?? 'Save failed')
    })
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <input type="hidden" name="site_id" value={site.id} />

      <Card title="Basic Information">
        <Grid2>
          <Field label="Name">
            <input name="name" defaultValue={site.name} required className={inputClass} />
          </Field>
          <Field label="Slug">
            <input name="slug" defaultValue={site.slug} required className={inputClass} />
          </Field>
        </Grid2>
        <Field label="Tagline">
          <input name="tagline" defaultValue={site.tagline ?? ''} className={inputClass} />
        </Field>
        <Field label="Vertical">
          <select name="vertical" defaultValue={site.vertical ?? 'multi'} className={inputClass}>
            {(['General', 'Legal'] as VerticalGroup[]).map((group) => (
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
      </Card>

      <Card title="Brand">
        <p className="text-[12px] text-[var(--color-ink-muted)] mb-4 -mt-2 leading-relaxed">
          This Site&apos;s brand is the single source of truth across the platform. Changes here cascade to{' '}
          <span className="text-white font-medium">Site Pages</span>, the{' '}
          <span className="text-white font-medium">Quiz builder</span>, the{' '}
          <span className="text-white font-medium">Landing Page builder</span>, and the{' '}
          <span className="text-white font-medium">Advertorial builder</span> automatically. For the full set of
          brand controls (logos, all colours, typography, contact CTAs, legal copy) use the centralised{' '}
          <a
            href="/admin/brands/brand-identities"
            className="text-[var(--color-info)] hover:underline font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            Brand Identities editor →
          </a>
        </p>
        <Grid2>
          <Field label="Logo">
            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-md flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                style={{ backgroundColor: primary }}
              >
                {site.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <input name="logo_url" defaultValue={b.logo_url ?? ''} placeholder="https://… (image URL)" className={`${inputClass} flex-1`} />
              <button type="button" className="text-[13px] font-medium px-3 py-2 rounded-md border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-white inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </div>
          </Field>
          <Field label="Favicon">
            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-md flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                style={{ backgroundColor: primary }}
              >
                {site.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <input name="favicon_url" defaultValue={b.favicon_url ?? ''} placeholder="https://… (image URL)" className={`${inputClass} flex-1`} />
              <button type="button" className="text-[13px] font-medium px-3 py-2 rounded-md border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-white inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </div>
          </Field>
        </Grid2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-1">
          <ColorField label="Primary" name="primary" value={primary} onChange={setPrimary} />
          <ColorField label="Accent" name="accent" value={accent} onChange={setAccent} />
          <ColorField label="Surface" name="surface" value={surface} onChange={setSurface} />
          <ColorField label="Ink" name="ink" value={ink} onChange={setInk} />
          <ColorField label="Muted" name="muted" value={muted} onChange={setMuted} />
        </div>

        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Swatch color={ink} />
            <Swatch color={accent} />
            <Swatch color={surface} />
          </div>
          <p className="text-[14px] text-white font-semibold">{site.name} Preview</p>
          <p className="text-[12px] text-[var(--color-ink-muted)]">This shows how your brand colors and fonts look together.</p>
        </div>

        <Grid2>
          <Field label="Heading Font">
            <select name="font_heading" defaultValue={b.font_heading ?? 'Inter'} className={inputClass}>
              <option value="Inter">Inter</option>
              <option value="Source Serif Pro">Source Serif Pro</option>
              <option value="DM Sans">DM Sans</option>
              <option value="Manrope">Manrope</option>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
            </select>
          </Field>
          <Field label="Body Font">
            <select name="font_body" defaultValue={b.font_body ?? 'Inter'} className={inputClass}>
              <option value="Inter">Inter</option>
              <option value="Source Serif Pro">Source Serif Pro</option>
              <option value="DM Sans">DM Sans</option>
              <option value="Manrope">Manrope</option>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
            </select>
          </Field>
        </Grid2>
      </Card>

      <Card title="Organization">
        <Grid2>
          <Field label="Org Name">
            <input name="org_name" defaultValue={site.org_name ?? ''} className={inputClass} />
          </Field>
          <Field label="Support Email">
            <input type="email" name="support_email" defaultValue={site.support_email ?? ''} className={inputClass} />
          </Field>
        </Grid2>
        <Field label="Org Address">
          <input name="org_address" defaultValue={site.org_address ?? ''} className={inputClass} />
        </Field>
        <Field label="Default Phone">
          <input
            name="default_phone"
            value={phoneDisplay}
            onChange={(e) => setPhoneDisplay(e.target.value)}
            placeholder="(555) 555-0123"
            className={inputClass}
          />
          <p className="text-[12px] text-[var(--color-ink-muted)] mt-2">Tel: {toTel(phoneDisplay)}</p>
        </Field>
      </Card>

      <Card title="Default Disclaimer">
        <textarea
          name="default_disclaimer_md"
          defaultValue={site.default_disclaimer_md ?? ''}
          rows={5}
          className={`${inputClass} font-mono text-[13px]`}
        />
      </Card>

      <footer className="flex items-center justify-end gap-3 pt-2">
        {error ? <span className="text-[13px] text-[var(--color-neg)]">{error}</span> : null}
        {savedAt ? <span className="text-[13px] text-[var(--color-pos)]">Saved {savedAt.toLocaleTimeString()}</span> : null}
        <button
          type="submit"
          disabled={pending}
          className="brand-gradient text-white font-semibold text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50 hover:opacity-90"
        >
          {pending ? 'Saving…' : 'Save Settings'}
        </button>
      </footer>
    </form>
  )
}

const inputClass =
  'w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 card-edge space-y-5">
      <h2 className="text-[16px] font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-2">{label}</span>
      {children}
    </label>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-2">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-md border border-[var(--color-border)] bg-transparent cursor-pointer"
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} flex-1 font-mono text-[13px]`}
        />
      </div>
    </label>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className="w-8 h-8 rounded-md inline-block" style={{ background: color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
}

function toTel(display: string): string {
  const digits = display.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}
