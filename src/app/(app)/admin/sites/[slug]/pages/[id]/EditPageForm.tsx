'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ExternalLink, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/pageflo/interactive'
import { updatePage, deletePage } from '../actions'

type Option = { label: string; value: string }

type Initial = {
  title: string
  slug: string
  status: string
  template_key: string
  uses_shared_template: boolean
  meta_title: string
  meta_description: string
  og_image_url: string
  blockCount: number
}

const normalizeSlug = (s: string): string => {
  const trimmed = s.trim()
  if (!trimmed) return ''
  if (trimmed === '/') return '/'
  return '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

const inputClass =
  'w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)] transition-colors'

export function EditPageForm({
  pageId,
  siteSlug,
  primaryHost,
  templateOptions,
  initial,
}: {
  pageId: number
  siteSlug: string
  primaryHost: string
  templateOptions: Option[]
  initial: Initial
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title)
  const [slug, setSlug] = useState(initial.slug)
  const [status, setStatus] = useState(initial.status)
  const [templateKey, setTemplateKey] = useState(initial.template_key)
  const [usesShared, setUsesShared] = useState(initial.uses_shared_template)
  const [metaTitle, setMetaTitle] = useState(initial.meta_title)
  const [metaDescription, setMetaDescription] = useState(initial.meta_description)
  const [ogImageUrl, setOgImageUrl] = useState(initial.og_image_url)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, start] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  const isHome = slug === '/' || initial.slug === '/'
  const normalized = normalizeSlug(slug)
  const previewUrl = normalized ? `https://${primaryHost}${normalized === '/' ? '' : normalized}` : null
  const showSharedToggle = templateKey !== 'custom'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    start(async () => {
      const res = await updatePage({
        pageId,
        siteSlug,
        title,
        slug: normalized,
        status,
        template_key: templateKey,
        uses_shared_template: usesShared,
        meta_title: metaTitle,
        meta_description: metaDescription,
        og_image_url: ogImageUrl,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 2500)
    })
  }

  const onDelete = async () => {
    if (isHome) return
    const ok = await confirm({
      title: 'Delete this page?',
      message: `"${initial.title}" and everything authored on it are removed. Any visitor reaching its path afterwards gets a 404 unless another page claims it.`,
      confirmLabel: 'Delete page',
      tone: 'danger',
    })
    if (!ok) return
    startDelete(async () => {
      const res = await deletePage({ pageId, siteSlug })
      if (!res.ok) {
        setError(`Delete failed: ${res.error}`)
        return
      }
      router.push(`/admin/sites/${siteSlug}/pages`)
      router.refresh()
    })
  }

  const busy = pending || deletePending

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {confirmDialog}
      {/* --- Page section --- */}
      <Card title="Page">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="About Us"
            required
            disabled={busy}
            className={inputClass}
          />
        </Field>

        <Field label="Slug">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="/about-us"
            required
            disabled={busy || isHome}
            className={`${inputClass} font-mono ${isHome ? 'opacity-60' : ''}`}
          />
          <Help>
            {isHome
              ? 'The home page slug (/) cannot be changed.'
              : 'Leading slash optional. Changing the slug will auto-redirect the old URL.'}
          </Help>
        </Field>

        <Grid2>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy} className={inputClass}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </Field>

          <Field label="Template">
            <select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value)
                if (e.target.value === 'custom') setUsesShared(false)
              }}
              disabled={busy}
              className={inputClass}
            >
              {templateOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid2>

        {showSharedToggle ? (
          <label className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3.5 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usesShared}
              onChange={(e) => setUsesShared(e.target.checked)}
              disabled={busy}
              className="mt-0.5 w-4 h-4 accent-[var(--color-brand-from)]"
            />
            <span className="block">
              <span className="block text-[13px] font-medium text-white">Render the shared legal template</span>
              <span className="block text-[12px] text-[var(--color-ink-dim)] mt-0.5">
                When on, this page renders the shared <code className="font-mono">{templateKey}</code> template with this Site’s variables. Turn off to author custom body blocks instead.
              </span>
            </span>
          </label>
        ) : null}
      </Card>

      {/* --- Content section --- */}
      <Card title="Content">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] text-white font-medium">
              {initial.blockCount === 0 ? 'No body blocks yet' : `${initial.blockCount} body block${initial.blockCount === 1 ? '' : 's'}`}
            </div>
            <div className="text-[12px] text-[var(--color-ink-dim)] mt-0.5">
              Block-by-block editing happens in the raw CMS for now.
            </div>
          </div>
          <a
            href={`/cms/collections/pages/${pageId}#field-body_blocks`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-3)] transition-colors"
          >
            Open content editor <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </Card>

      {/* --- SEO section --- */}
      <Card title="SEO">
        <Field label="Meta title">
          <input
            type="text"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            placeholder={title || 'Leave blank to use page title'}
            disabled={busy}
            className={inputClass}
          />
          <Help>Optional override for &lt;title&gt; and social cards. Falls back to the page title.</Help>
        </Field>
        <Field label="Meta description">
          <textarea
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            rows={3}
            placeholder="Short summary shown in search results and link previews."
            disabled={busy}
            className={inputClass}
          />
        </Field>
        <Field label="OG image URL">
          <input
            type="text"
            value={ogImageUrl}
            onChange={(e) => setOgImageUrl(e.target.value)}
            placeholder="https://…/preview.jpg"
            disabled={busy}
            className={`${inputClass} font-mono`}
          />
          <Help>Recommended 1200×630. Used on Facebook, LinkedIn, X, etc.</Help>
        </Field>
      </Card>

      {/* --- Preview + messages --- */}
      <PreviewCard previewUrl={previewUrl} status={status} templateKey={templateKey} blockCount={initial.blockCount} />

      {error ? (
        <p className="text-[13px] text-[var(--color-neg)] bg-[var(--color-neg)]/10 border border-[var(--color-neg)]/30 rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-[13px] text-[var(--color-pos)] bg-[var(--color-pos)]/10 border border-[var(--color-pos)]/30 rounded-md px-3 py-2">
          Saved.
        </p>
      ) : null}

      {/* --- Footer --- */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy || isHome}
          title={isHome ? 'Home page cannot be deleted' : undefined}
          className="text-[13px] font-medium px-4 py-2 rounded-md text-[var(--color-neg)] hover:bg-[var(--color-neg)]/10 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
        >
          {deletePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {deletePending ? 'Deleting…' : 'Delete page'}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/admin/sites/${siteSlug}/pages`)}
            disabled={busy}
            className="text-[13px] font-medium px-4 py-2 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim() || !slug.trim()}
            className="brand-gradient text-white font-semibold text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50 hover:opacity-90 inline-flex items-center gap-2 transition-opacity"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold">{title}</h2>
      </div>
      <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>
    </section>
  )
}

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

function PreviewCard({
  previewUrl,
  status,
  templateKey,
  blockCount,
}: {
  previewUrl: string | null
  status: string
  templateKey: string
  blockCount: number
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold mb-2">
        Live snapshot
      </p>
      <ul className="space-y-1.5 text-[13px] text-[var(--color-ink)]">
        <li>
          <span className="text-[var(--color-ink-muted)]">URL:</span>{' '}
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-info)] font-mono hover:underline inline-flex items-center gap-1"
            >
              {previewUrl} <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="text-[var(--color-ink-dim)]">—</span>
          )}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Status:</span> <span className="capitalize">{status}</span>
          {status === 'draft' ? (
            <span className="text-[var(--color-ink-dim)]"> · hidden from the live site until published</span>
          ) : null}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Template:</span>{' '}
          {templateKey === 'custom' ? 'Custom' : `Shared: ${templateKey}`}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Body blocks:</span> {blockCount}
        </li>
      </ul>
    </div>
  )
}
