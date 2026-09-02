'use client'

import { useState, useTransition } from 'react'
import {
  Zap,
  BarChart3,
  Activity,
  Video,
  Tag,
  Shield,
  Phone,
  Lock,
  Globe,
  Plus,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { saveTracking, type TrackingPayload } from './actions'

type Webhook = { name: string; url: string; enabled: boolean; event_filter?: string; hmac_secret?: string }

export function TrackingForm({
  siteId,
  siteSlug,
  initial,
}: {
  siteId: number
  siteSlug: string
  initial: TrackingPayload
}) {
  const [state, setState] = useState<TrackingPayload>({
    meta_pixel: { enabled: false, ...initial.meta_pixel },
    google_ads: { enabled: false, ...initial.google_ads },
    ga4: { enabled: false, ...initial.ga4 },
    tiktok: { enabled: false, ...initial.tiktok },
    gtm: { enabled: false, ...initial.gtm },
    trustedform: { enabled: false, auto_claim: true, ...initial.trustedform },
    truecall: { enabled: false, ...initial.truecall },
    jornaya: { enabled: false, ...initial.jornaya },
    custom_webhooks: initial.custom_webhooks ?? [],
  })
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const onSave = () => {
    setError(null)
    start(async () => {
      const res = await saveTracking({ siteId, siteSlug, data: state })
      if (res.ok) setSavedAt(new Date())
      else setError(res.error ?? 'Save failed')
    })
  }

  // typed helpers
  type Key = keyof TrackingPayload
  const patchGroup = <K extends Exclude<Key, 'custom_webhooks'>>(key: K, patch: Partial<NonNullable<TrackingPayload[K]>>) => {
    setState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } as TrackingPayload[K] }))
  }

  return (
    <div className="space-y-3">
      <Card
        icon={<Zap className="w-4 h-4" />}
        title="Meta Pixel + CAPI"
        enabled={Boolean(state.meta_pixel?.enabled)}
        onToggle={(v) => patchGroup('meta_pixel', { enabled: v })}
      >
        <Grid2>
          <Field label="Pixel ID">
            <Input value={state.meta_pixel?.id ?? ''} onChange={(v) => patchGroup('meta_pixel', { id: v })} placeholder="123456789012345" />
          </Field>
          <Field label="Dataset ID (optional)">
            <Input value={state.meta_pixel?.dataset_id ?? ''} onChange={(v) => patchGroup('meta_pixel', { dataset_id: v })} placeholder="" />
          </Field>
        </Grid2>
        <Field label="CAPI access token">
          <Input value={state.meta_pixel?.capi_token ?? ''} onChange={(v) => patchGroup('meta_pixel', { capi_token: v })} placeholder="EAAxxx…" password />
          <Help>Server-only. Never sent to the client.</Help>
        </Field>
        <Field label="Test event code (optional)">
          <Input value={state.meta_pixel?.test_event_code ?? ''} onChange={(v) => patchGroup('meta_pixel', { test_event_code: v })} placeholder="TEST12345" />
        </Field>
      </Card>

      <Card
        icon={<BarChart3 className="w-4 h-4" />}
        title="Google Ads"
        enabled={Boolean(state.google_ads?.enabled)}
        onToggle={(v) => patchGroup('google_ads', { enabled: v })}
      >
        <Field label="Tag ID (AW-…)">
          <Input value={state.google_ads?.tag_id ?? ''} onChange={(v) => patchGroup('google_ads', { tag_id: v })} placeholder="AW-1234567890" />
        </Field>
        <ConversionActionsEditor
          rows={state.google_ads?.conversion_actions ?? []}
          onChange={(rows) => patchGroup('google_ads', { conversion_actions: rows })}
        />
      </Card>

      <Card
        icon={<Activity className="w-4 h-4" />}
        title="GA4"
        enabled={Boolean(state.ga4?.enabled)}
        onToggle={(v) => patchGroup('ga4', { enabled: v })}
      >
        <Grid2>
          <Field label="Measurement ID">
            <Input value={state.ga4?.measurement_id ?? ''} onChange={(v) => patchGroup('ga4', { measurement_id: v })} placeholder="G-XXXXXXXXXX" />
          </Field>
          <Field label="Measurement Protocol secret">
            <Input value={state.ga4?.api_secret ?? ''} onChange={(v) => patchGroup('ga4', { api_secret: v })} placeholder="" password />
          </Field>
        </Grid2>
      </Card>

      <Card
        icon={<Video className="w-4 h-4" />}
        title="TikTok Pixel + Events API"
        enabled={Boolean(state.tiktok?.enabled)}
        onToggle={(v) => patchGroup('tiktok', { enabled: v })}
      >
        <Grid2>
          <Field label="Pixel code">
            <Input value={state.tiktok?.pixel_code ?? ''} onChange={(v) => patchGroup('tiktok', { pixel_code: v })} placeholder="C…" />
          </Field>
          <Field label="Test event code (optional)">
            <Input value={state.tiktok?.test_event_code ?? ''} onChange={(v) => patchGroup('tiktok', { test_event_code: v })} placeholder="TEST" />
          </Field>
        </Grid2>
        <Field label="Events API access token">
          <Input value={state.tiktok?.access_token ?? ''} onChange={(v) => patchGroup('tiktok', { access_token: v })} placeholder="" password />
        </Field>
      </Card>

      <Card
        icon={<Tag className="w-4 h-4" />}
        title="Google Tag Manager"
        enabled={Boolean(state.gtm?.enabled)}
        onToggle={(v) => patchGroup('gtm', { enabled: v })}
      >
        <Field label="Container ID">
          <Input value={state.gtm?.container_id ?? ''} onChange={(v) => patchGroup('gtm', { container_id: v })} placeholder="GTM-XXXXXXX" />
        </Field>
      </Card>

      <Card
        icon={<Shield className="w-4 h-4" />}
        title="TrustedForm"
        enabled={Boolean(state.trustedform?.enabled)}
        onToggle={(v) => patchGroup('trustedform', { enabled: v })}
      >
        <Grid2>
          <Field label="Account ID">
            <Input value={state.trustedform?.account_id ?? ''} onChange={(v) => patchGroup('trustedform', { account_id: v })} placeholder="" />
          </Field>
          <Field label="API key">
            <Input value={state.trustedform?.api_key ?? ''} onChange={(v) => patchGroup('trustedform', { api_key: v })} placeholder="" password />
          </Field>
        </Grid2>
        <CheckboxRow>
          <Checkbox checked={Boolean(state.trustedform?.auto_claim)} onChange={(v) => patchGroup('trustedform', { auto_claim: v })} label="Auto-claim cert on form submit" />
          <Checkbox checked={Boolean(state.trustedform?.retain_certs)} onChange={(v) => patchGroup('trustedform', { retain_certs: v })} label="Retain certs (extends storage)" />
        </CheckboxRow>
        <Help>Claim happens server-side. The TrustedForm script is auto-injected on every form-bearing page when enabled.</Help>
      </Card>

      <Card
        icon={<Phone className="w-4 h-4" />}
        title="TrueCall"
        enabled={Boolean(state.truecall?.enabled)}
        onToggle={(v) => patchGroup('truecall', { enabled: v })}
      >
        <Grid2>
          <Field label="Account ID">
            <Input value={state.truecall?.account_id ?? ''} onChange={(v) => patchGroup('truecall', { account_id: v })} placeholder="" />
          </Field>
          <Field label="API key">
            <Input value={state.truecall?.api_key ?? ''} onChange={(v) => patchGroup('truecall', { api_key: v })} placeholder="" password />
          </Field>
        </Grid2>
        <PathCampaignEditor
          rows={state.truecall?.page_path_mapping ?? []}
          onChange={(rows) => patchGroup('truecall', { page_path_mapping: rows })}
        />
      </Card>

      <Card
        icon={<Lock className="w-4 h-4" />}
        title="Jornaya"
        enabled={Boolean(state.jornaya?.enabled)}
        onToggle={(v) => patchGroup('jornaya', { enabled: v })}
      >
        <Grid2>
          <Field label="Account ID">
            <Input value={state.jornaya?.account_id ?? ''} onChange={(v) => patchGroup('jornaya', { account_id: v })} placeholder="" />
          </Field>
          <Field label="Campaign ID">
            <Input value={state.jornaya?.campaign_id ?? ''} onChange={(v) => patchGroup('jornaya', { campaign_id: v })} placeholder="" />
          </Field>
        </Grid2>
      </Card>

      <CustomWebhooksCard
        webhooks={state.custom_webhooks ?? []}
        onChange={(webhooks) => setState((prev) => ({ ...prev, custom_webhooks: webhooks }))}
      />

      <footer className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-[var(--color-canvas)]/80 backdrop-blur-md py-3 -mx-5 px-5 sm:-mx-7 sm:px-7 border-t border-[var(--color-border)]">
        {error ? <span className="text-[13px] text-[var(--color-neg)]">{error}</span> : null}
        {savedAt ? <span className="text-[13px] text-[var(--color-pos)]">Saved {savedAt.toLocaleTimeString()}</span> : null}
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="brand-gradient text-white font-semibold text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50 hover:opacity-90"
        >
          {pending ? 'Saving…' : 'Save All'}
        </button>
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Card                                     */
/* -------------------------------------------------------------------------- */

function Card({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(enabled)
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
      <header className="px-5 py-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <span className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-info)] border border-[var(--color-border)]">
            {icon}
          </span>
          <span className="text-[15px] font-semibold text-white flex-1">{title}</span>
          <ChevronDown className={`w-4 h-4 text-[var(--color-ink-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <Toggle checked={enabled} onChange={onToggle} />
      </header>
      {open ? <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[var(--color-border)]/60">{children}</div> : null}
    </section>
  )
}

function Toggle({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'brand-gradient' : 'bg-[var(--color-surface-3)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Form atoms                               */
/* -------------------------------------------------------------------------- */

const inputClass =
  'w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-2">{label}</span>
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  password,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  password?: boolean
}) {
  return (
    <input
      type={password ? 'password' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-[var(--color-ink-dim)] mt-1.5">{children}</p>
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
}

function CheckboxRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-6 gap-y-2">{children}</div>
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-[var(--color-ink)] cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-[var(--color-border-strong)] bg-[var(--color-surface-2)] accent-[var(--color-brand-strong)]"
      />
      {label}
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Conversion actions editor                         */
/* -------------------------------------------------------------------------- */

function ConversionActionsEditor({
  rows,
  onChange,
}: {
  rows: Array<{ label: string; conversion_id: string; conversion_label: string }>
  onChange: (rows: Array<{ label: string; conversion_id: string; conversion_label: string }>) => void
}) {
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const add = () => onChange([...rows, { label: '', conversion_id: '', conversion_label: '' }])
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-[var(--color-ink-muted)]">Conversion actions</span>
        <button type="button" onClick={add} className="text-[12px] text-[var(--color-info)] hover:underline inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add action
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink-dim)]">No conversion actions configured.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_36px] gap-2">
              <input
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Lead"
                className={`${inputClass} text-[13px]`}
              />
              <input
                value={row.conversion_id}
                onChange={(e) => update(i, { conversion_id: e.target.value })}
                placeholder="AW-…"
                className={`${inputClass} text-[13px] font-mono`}
              />
              <input
                value={row.conversion_label}
                onChange={(e) => update(i, { conversion_label: e.target.value })}
                placeholder="abcDEF1234"
                className={`${inputClass} text-[13px] font-mono`}
              />
              <button type="button" onClick={() => remove(i)} className="inline-flex items-center justify-center text-[var(--color-ink-muted)] hover:text-[var(--color-neg)]" aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                       Path → campaign mapping editor                       */
/* -------------------------------------------------------------------------- */

function PathCampaignEditor({
  rows,
  onChange,
}: {
  rows: Array<{ path: string; campaign_id: string }>
  onChange: (rows: Array<{ path: string; campaign_id: string }>) => void
}) {
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...rows, { path: '', campaign_id: '' }])
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-[var(--color-ink-muted)]">Path → campaign mapping</span>
        <button type="button" onClick={add} className="text-[12px] text-[var(--color-info)] hover:underline inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add mapping
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink-dim)]">All paths route to the default campaign.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2">
              <input
                value={row.path}
                onChange={(e) => update(i, { path: e.target.value })}
                placeholder="/lp/mva or /lp/* (wildcard)"
                className={`${inputClass} text-[13px] font-mono`}
              />
              <input
                value={row.campaign_id}
                onChange={(e) => update(i, { campaign_id: e.target.value })}
                placeholder="Campaign ID"
                className={`${inputClass} text-[13px]`}
              />
              <button type="button" onClick={() => remove(i)} className="inline-flex items-center justify-center text-[var(--color-ink-muted)] hover:text-[var(--color-neg)]" aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Custom webhooks                               */
/* -------------------------------------------------------------------------- */

function CustomWebhooksCard({
  webhooks,
  onChange,
}: {
  webhooks: Webhook[]
  onChange: (rows: Webhook[]) => void
}) {
  const update = (i: number, patch: Partial<Webhook>) =>
    onChange(webhooks.map((w, idx) => (idx === i ? { ...w, ...patch } : w)))
  const add = () =>
    onChange([
      ...webhooks,
      { name: '', url: '', enabled: true, event_filter: 'lead.created', hmac_secret: '' },
    ])
  const remove = (i: number) => onChange(webhooks.filter((_, idx) => idx !== i))
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
      <header className="px-5 py-4 flex items-center gap-4 border-b border-[var(--color-border)]">
        <span className="w-9 h-9 rounded-md flex items-center justify-center bg-[var(--color-surface-2)] text-[var(--color-info)] border border-[var(--color-border)]">
          <Globe className="w-4 h-4" />
        </span>
        <span className="text-[15px] font-semibold text-white flex-1">Custom Webhooks</span>
        <button
          type="button"
          onClick={add}
          className="text-[13px] font-medium text-white px-3 py-2 rounded-md border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Webhook
        </button>
      </header>
      {webhooks.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-[var(--color-ink-dim)]">
          No webhooks configured. Add one to receive lead events at your endpoint.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {webhooks.map((w, i) => (
            <li key={i} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-[1.5fr_2.5fr_140px_36px] gap-2 items-center">
                <input
                  value={w.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="LeadByte"
                  className={inputClass}
                />
                <input
                  value={w.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://example.com/leads"
                  className={`${inputClass} font-mono text-[13px]`}
                />
                <Toggle checked={w.enabled} onChange={(v) => update(i, { enabled: v })} ariaLabel="Enabled" />
                <button type="button" onClick={() => remove(i)} className="inline-flex items-center justify-center text-[var(--color-ink-muted)] hover:text-[var(--color-neg)]" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Grid2>
                <Field label="Event filter (comma-separated)">
                  <Input
                    value={w.event_filter ?? ''}
                    onChange={(v) => update(i, { event_filter: v })}
                    placeholder="lead.created, lead.sold"
                  />
                </Field>
                <Field label="HMAC signing secret">
                  <Input value={w.hmac_secret ?? ''} onChange={(v) => update(i, { hmac_secret: v })} placeholder="" password />
                </Field>
              </Grid2>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
