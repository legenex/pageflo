'use client'

import { useState, useTransition } from 'react'
import { Mail, MessageSquare, Github, Search, CreditCard, Plus, X, Save } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/pageflo/product'
import { saveIntegrationConfig } from './actions'

export type SiteOption = { id: number; name: string }
export type SlackWebhook = { label: string; url: string; events: string }
export type GithubRepo = { site: number | null; repo_url: string }
export type InitialConfig = {
  smtp: { host: string; port: number; user: string; pass: string; from_name: string; from_email: string }
  slack_webhooks: SlackWebhook[]
  github_repos: GithubRepo[]
  sc: { method: string; token: string }
  billing: { plan: string; notes: string }
}

export function IntegrationsForm({ initial, sites }: { initial: InitialConfig; sites: SiteOption[] }) {
  const [slack, setSlack] = useState<SlackWebhook[]>(initial.slack_webhooks)
  const [repos, setRepos] = useState<GithubRepo[]>(initial.github_repos)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const onSubmit = (formData: FormData) => {
    setErr(null)
    formData.append('slack_webhooks', JSON.stringify(slack))
    formData.append('github_repos', JSON.stringify(repos))
    start(async () => {
      const res = await saveIntegrationConfig(formData)
      if (res.ok) setSavedAt(new Date())
      else setErr(res.error)
    })
  }

  return (
    <div className="px-5 pb-16 pt-6 sm:px-7 max-w-[1100px]">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Integrations</h1>
          <p className="text-ink-muted text-[13px] mt-1.5">
            {PRODUCT_NAME}-wide integrations (SMTP, Slack, GitHub, Search Console). Per-Site values live in Site settings.
          </p>
        </div>
      </header>

      <form action={onSubmit} className="space-y-5">
        <Card title="SMTP" icon={Mail} subtitle="Outbound email for invites, reset links, and lead notifications.">
          <Grid2>
            <Field label="Host"><input name="smtp_host" defaultValue={initial.smtp.host} placeholder="smtp.example.com" className={inputClass} /></Field>
            <Field label="Port"><input name="smtp_port" type="number" defaultValue={initial.smtp.port} className={inputClass} /></Field>
          </Grid2>
          <Grid2>
            <Field label="User"><input name="smtp_user" defaultValue={initial.smtp.user} className={inputClass} /></Field>
            <Field label="Password"><input name="smtp_pass" type="password" defaultValue={initial.smtp.pass} className={inputClass} autoComplete="off" /></Field>
          </Grid2>
          <Grid2>
            <Field label="From name"><input name="smtp_from_name" defaultValue={initial.smtp.from_name} className={inputClass} /></Field>
            <Field label="From email"><input name="smtp_from_email" type="email" defaultValue={initial.smtp.from_email} className={inputClass} /></Field>
          </Grid2>
        </Card>

        <Card title="Slack Webhooks" icon={MessageSquare} subtitle="Lead notifications, alerts, and audit events.">
          <ArrayHeader
            count={slack.length}
            onAdd={() => setSlack((c) => [...c, { label: '', url: '', events: '' }])}
            addLabel="Add webhook"
          />
          {slack.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-dim)] italic">No webhooks configured.</p>
          ) : (
            <div className="space-y-2">
              {slack.map((w, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_2fr_1.2fr_36px] gap-2 items-start">
                  <input
                    value={w.label}
                    onChange={(e) => setSlack((c) => c.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
                    placeholder="Label"
                    className={inputClass}
                  />
                  <input
                    value={w.url}
                    onChange={(e) => setSlack((c) => c.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)))}
                    placeholder="https://hooks.slack.com/services/..."
                    className={inputClass}
                  />
                  <input
                    value={w.events}
                    onChange={(e) => setSlack((c) => c.map((x, i) => (i === idx ? { ...x, events: e.target.value } : x)))}
                    placeholder="lead.created, alert.fire"
                    className={inputClass}
                  />
                  <RemoveButton onClick={() => setSlack((c) => c.filter((_, i) => i !== idx))} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="GitHub Repos" icon={Github} subtitle="Per-Site repo bindings for CI/CD and content sync.">
          <ArrayHeader
            count={repos.length}
            onAdd={() => setRepos((c) => [...c, { site: sites[0]?.id ?? null, repo_url: '' }])}
            addLabel="Add repo"
            disabled={sites.length === 0}
          />
          {repos.length === 0 ? (
            <p className="text-[12px] text-[var(--color-ink-dim)] italic">No repos linked.</p>
          ) : (
            <div className="space-y-2">
              {repos.map((r, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_2fr_36px] gap-2 items-start">
                  <select
                    value={r.site ?? ''}
                    onChange={(e) =>
                      setRepos((c) => c.map((x, i) => (i === idx ? { ...x, site: e.target.value ? Number(e.target.value) : null } : x)))
                    }
                    className={inputClass}
                  >
                    <option value="">— Unassigned —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    value={r.repo_url}
                    onChange={(e) => setRepos((c) => c.map((x, i) => (i === idx ? { ...x, repo_url: e.target.value } : x)))}
                    placeholder="https://github.com/org/repo"
                    className={inputClass}
                  />
                  <RemoveButton onClick={() => setRepos((c) => c.filter((_, i) => i !== idx))} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Search Console (Root)" icon={Search} subtitle="Root domain verification for all sub-properties.">
          <Grid2>
            <Field label="Verification method">
              <select name="sc_method" defaultValue={initial.sc.method} className={inputClass}>
                <option value="">—</option>
                <option value="html-tag">HTML tag</option>
                <option value="dns">DNS TXT</option>
                <option value="file">HTML file</option>
              </select>
            </Field>
            <Field label="Verification token"><input name="sc_token" defaultValue={initial.sc.token} className={inputClass} /></Field>
          </Grid2>
        </Card>

        <Card title="Billing" icon={CreditCard} subtitle="Notes for plan / billing history. Not connected to a billing provider.">
          <Grid2>
            <Field label="Plan">
              <select name="billing_plan" defaultValue={initial.billing.plan} className={inputClass}>
                <option value="internal">Internal</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <span />
          </Grid2>
          <Field label="Notes">
            <textarea name="billing_notes" defaultValue={initial.billing.notes} rows={3} className={inputClass} />
          </Field>
        </Card>

        {err ? (
          <div className="rounded-lg border border-[rgba(192,58,43,0.30)] bg-[rgba(192,58,43,0.10)] px-3 py-2 text-[13px] text-[#F1A39B]">
            {err}
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-5 px-5 py-4 sm:-mx-7 sm:px-7 border-t border-[var(--color-border)] bg-[var(--color-canvas)]/95 backdrop-blur flex items-center justify-between">
          <div className="text-[12px] text-[var(--color-ink-dim)]">
            {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Changes are not saved until you click Save.'}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="brand-gradient text-white font-medium text-[14px] px-4 py-2.5 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string
  subtitle?: string
  icon: typeof Mail
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
      <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface-2)] text-white shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          {subtitle ? <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">{subtitle}</p> : null}
        </div>
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  )
}

function ArrayHeader({
  count,
  onAdd,
  addLabel,
  disabled,
}: {
  count: number
  onAdd: () => void
  addLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between -mt-1">
      <span className="text-[12px] text-[var(--color-ink-muted)]">{count} configured</span>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="text-[12px] text-[var(--color-info)] hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
      >
        <Plus className="w-3 h-3" /> {addLabel}
      </button>
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 rounded-md text-[var(--color-ink-muted)] hover:text-[#F1A39B] hover:bg-[rgba(192,58,43,0.08)]"
      aria-label="Remove"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-[var(--color-ink-muted)] mb-1.5">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)]'
