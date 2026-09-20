'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, FileText, FileCode2, Upload } from 'lucide-react'
import { createPage } from '../actions'
import { createPageFromUrl } from './ai-clone-action'
import { createPageFromHtml } from './html-import-action'
import { importWordpressSite } from './wordpress-import-action'

type Option = { label: string; value: string }
type Mode = 'manual' | 'ai' | 'import' | 'wordpress'
type ImportMode = 'structured-fields' | 'structured'

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeSlug = (s: string): string => {
  const trimmed = s.trim()
  if (!trimmed) return ''
  if (trimmed === '/') return '/'
  return '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

const inputClass =
  'w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-md px-3 py-2.5 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] focus:outline-none focus:border-[var(--color-border-strong)] transition-colors'

export function CreatePageForm({
  siteId,
  siteSlug,
  primaryHost,
  templateOptions,
}: {
  siteId: number
  siteSlug: string
  primaryHost: string
  templateOptions: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('manual')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [status, setStatus] = useState('draft')
  const [templateKey, setTemplateKey] = useState('custom')
  const [sourceUrl, setSourceUrl] = useState('')
  // Import-from-files mode state.
  const [importMode, setImportMode] = useState<ImportMode>('structured-fields')
  const [htmlFile, setHtmlFile] = useState<File | null>(null)
  const [cssFile, setCssFile] = useState<File | null>(null)
  const htmlRef = useRef<HTMLInputElement>(null)
  const cssRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const onTitleChange = (v: string) => {
    setTitle(v)
    if (!slugTouched) setSlug(v ? '/' + slugify(v) : '')
  }

  const previewSlug = normalizeSlug(slug)
  const previewUrl = previewSlug ? `https://${primaryHost}${previewSlug === '/' ? '' : previewSlug}` : null

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      if (mode === 'ai') {
        if (!sourceUrl.trim()) {
          setError('Source URL is required when cloning with AI.')
          return
        }
        const res = await createPageFromUrl({
          siteId,
          siteSlug,
          slug: previewSlug,
          status,
          sourceUrl: sourceUrl.trim(),
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push(`/admin/sites/${siteSlug}/pages/${res.id}`)
        router.refresh()
        return
      }
      if (mode === 'wordpress') {
        if (!sourceUrl.trim()) {
          setError('WordPress site URL is required.')
          return
        }
        const res = await importWordpressSite({
          siteId,
          siteSlug,
          origin: sourceUrl.trim(),
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push(`/admin/sites/${siteSlug}/pages`)
        router.refresh()
        return
      }
      if (mode === 'import') {
        if (!htmlFile) {
          setError('Upload the .html file you want to import.')
          return
        }
        try {
          const htmlDataUrl = await fileToDataUrl(htmlFile)
          const cssDataUrl = cssFile ? await fileToDataUrl(cssFile) : undefined
          const res = await createPageFromHtml({
            siteId,
            siteSlug,
            slug: previewSlug,
            status,
            mode: importMode,
            htmlDataUrl,
            cssDataUrl,
            htmlFilename: htmlFile.name,
          })
          if (!res.ok) {
            setError(res.error)
            return
          }
          router.push(`/admin/sites/${siteSlug}/pages/${res.id}`)
          router.refresh()
          return
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not read uploaded files.')
          return
        }
      }
      const res = await createPage({
        siteId,
        siteSlug,
        title,
        slug: previewSlug,
        status,
        template_key: templateKey,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/admin/sites/${siteSlug}/pages`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] card-edge overflow-hidden">
        <div className="px-6 py-5 space-y-4">
          <ModeTabs mode={mode} onChange={setMode} disabled={pending} />

          {mode === 'wordpress' ? (
            <Field label="WordPress site URL">
              <input
                autoFocus
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com"
                required
                disabled={pending}
                className={inputClass}
              />
              <Help>Imports published pages from /wp-json/wp/v2/pages as drafts. Existing slugs are skipped.</Help>
            </Field>
          ) : null}

          {mode === 'ai' ? (
            <Field label="Source URL">
              <input
                autoFocus
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/landing-page"
                required
                disabled={pending}
                className={`${inputClass} font-mono`}
              />
              <Help>
                Claude fetches this URL, reads the page structure, and converts each visible section into the closest matching block type
                (hero, services, testimonials, FAQ, footer, etc.). The page is created as a Draft so you can review before publishing.
              </Help>
            </Field>
          ) : mode === 'import' ? (
            <>
              <FieldDiv label="HTML file (.html / .htm)">
                <FileDrop
                  accept=".html,.htm,text/html"
                  file={htmlFile}
                  inputRef={htmlRef}
                  onPick={(f) => setHtmlFile(f)}
                  hint="The HTML you want to import. Drop the file here or click to browse."
                  disabled={pending}
                />
              </FieldDiv>
              <FieldDiv label="Stylesheet (.css, optional)">
                <FileDrop
                  accept=".css,text/css"
                  file={cssFile}
                  inputRef={cssRef}
                  onPick={(f) => setCssFile(f)}
                  hint="If the HTML's styles are external, upload them here so the imported page looks right."
                  disabled={pending}
                />
              </FieldDiv>
              <Field label="Import strategy">
                <div className="flex flex-col gap-2">
                  <label
                    className={`flex gap-3 items-start p-3 rounded-md border cursor-pointer ${
                      importMode === 'structured-fields'
                        ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'structured-fields'}
                      onChange={() => setImportMode('structured-fields')}
                      disabled={pending}
                      className="mt-0.5"
                    />
                    <span className="flex-1">
                      <span className="block text-[13px] font-semibold text-white">Structured fields (recommended)</span>
                      <span className="block text-[12px] text-[var(--color-ink-dim)] mt-1 leading-snug">
                        DOM walks the HTML and maps each section to a structured block type (hero, faq, services grid, etc.) so the
                        right-side editor shows text fields instead of raw HTML. Sections that don't match a known pattern stay as
                        editable HTML. No AI calls, never fails.
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex gap-3 items-start p-3 rounded-md border cursor-pointer ${
                      importMode === 'structured'
                        ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'structured'}
                      onChange={() => setImportMode('structured')}
                      disabled={pending}
                      className="mt-0.5"
                    />
                    <span className="flex-1">
                      <span className="block text-[13px] font-semibold text-white">Structured copy (raw HTML per section)</span>
                      <span className="block text-[12px] text-[var(--color-ink-dim)] mt-1 leading-snug">
                        Same DOM walk, but every section ships as a raw <code className="font-mono">custom_html</code> block —
                        pixel-perfect visual, HTML editing only. Use this when you want the exact uploaded design preserved.
                      </span>
                    </span>
                  </label>
                </div>
              </Field>
            </>
          ) : (
            <Field label="Title">
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="About Us"
                required
                disabled={pending}
                className={inputClass}
              />
            </Field>
          )}

          <Field label="Slug">
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value)
              }}
              placeholder={mode === 'ai' ? '/cloned-from-url' : mode === 'import' ? '/imported-page' : '/about-us'}
              required={mode !== 'wordpress'}
              disabled={pending || mode === 'wordpress'}
              className={`${inputClass} font-mono`}
            />
            <Help>
              Leading slash optional. Use <code className="font-mono text-[var(--color-info)]">/</code> for the home page.
            </Help>
          </Field>

          <Grid2>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={pending}
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <Help>Drafts are visible in the admin but not on the live site.</Help>
            </Field>

            {mode === 'ai' ? (
              <Field label="Template">
                <div
                  className={`${inputClass} flex items-center text-[var(--color-ink-dim)] cursor-not-allowed`}
                >
                  Custom · authored by AI
                </div>
                <Help>AI-cloned pages always come in as Custom so the generated blocks are editable.</Help>
              </Field>
            ) : (
              <Field label="Template">
                <select
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  disabled={pending}
                  className={inputClass}
                >
                  {templateOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Help>
                  {templateKey === 'custom'
                    ? 'You will author body blocks yourself after creation.'
                    : 'Renders the shared legal template with this Site’s variables substituted in.'}
                </Help>
              </Field>
            )}
          </Grid2>

          <PreviewCard
            mode={mode}
            title={title}
            sourceUrl={sourceUrl}
            previewUrl={previewUrl}
            status={status}
            templateKey={templateKey}
          />

          {error ? (
            <p className="text-[13px] text-[var(--color-neg)] bg-[var(--color-neg)]/10 border border-[var(--color-neg)]/30 rounded-md px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 bg-[var(--color-surface-1)]">
          <button
            type="button"
            onClick={() => router.push(`/admin/sites/${siteSlug}/pages`)}
            disabled={pending}
            className="text-[13px] font-medium px-4 py-2 rounded-md text-[var(--color-ink-muted)] hover:text-white hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              pending ||
              (mode !== 'wordpress' && !slug.trim()) ||
              (mode === 'manual'
                ? !title.trim()
                : mode === 'ai' || mode === 'wordpress'
                  ? !sourceUrl.trim()
                  : !htmlFile)
            }
            className="brand-gradient text-white font-semibold text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50 hover:opacity-90 inline-flex items-center gap-2 transition-opacity"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {pending
              ? mode === 'ai'
                ? 'Cloning with AI…'
                : mode === 'import'
                  ? 'Importing…'
                  : mode === 'wordpress'
                    ? 'Importing WordPress…'
                    : 'Creating…'
              : mode === 'ai'
                ? 'Clone with AI'
                : mode === 'import'
                  ? 'Import HTML'
                  : mode === 'wordpress'
                    ? 'Import WordPress drafts'
                    : 'Create Page'}
          </button>
        </footer>
      </div>
    </form>
  )
}

function ModeTabs({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  const tabs: Array<{ id: Mode; label: string; icon: typeof FileText; desc: string }> = [
    { id: 'manual', label: 'Blank page', icon: FileText, desc: 'Start with a blank page and author sections yourself.' },
    { id: 'ai', label: 'Clone with AI', icon: Sparkles, desc: 'Paste a URL — Claude rebuilds it as editable blocks.' },
    { id: 'import', label: 'Import HTML / CSS', icon: FileCode2, desc: 'Upload a .html (and optional .css) you already have.' },
    { id: 'wordpress', label: 'Import WordPress', icon: Upload, desc: 'Pull published wp-json pages in as PageFlo drafts.' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = mode === t.id
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.id)}
            className={`text-left p-3 rounded-lg border transition-colors ${
              active
                ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/60'
            } disabled:opacity-50`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${active ? 'text-[var(--color-info)]' : 'text-[var(--color-ink-muted)]'}`} />
              <span className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-[var(--color-ink)]'}`}>{t.label}</span>
            </div>
            <p className="text-[12px] text-[var(--color-ink-dim)] leading-snug">{t.desc}</p>
          </button>
        )
      })}
    </div>
  )
}

function FileDrop({
  accept,
  file,
  inputRef,
  onPick,
  hint,
  disabled,
}: {
  accept: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (f: File | null) => void
  hint: string
  disabled: boolean
}) {
  const [dragOver, setDragOver] = useState(false)
  // Native label wrapping the hidden input — clicking anywhere inside the
  // label opens the file picker exactly once, no programmatic .click() and
  // no event-bubbling pitfalls.
  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onPick(f)
        }}
        className={`flex items-center gap-3 rounded-md border px-3 py-3 cursor-pointer transition-colors ${
          dragOver
            ? 'border-[var(--color-info)] bg-[var(--color-info)]/10'
            : 'border-[var(--color-border)] bg-[var(--color-surface-2)]/40 hover:bg-[var(--color-surface-2)]/60'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            onPick(f)
            // Reset the input value so picking the same file again still
            // fires onChange. Without this, re-picking a removed file is a
            // silent no-op.
            e.target.value = ''
          }}
        />
        <Upload className="w-4 h-4 text-[var(--color-ink-muted)]" />
        <div className="flex-1 min-w-0">
          {file ? (
            <span className="text-[13px] font-mono text-white truncate block">{file.name}</span>
          ) : (
            <span className="text-[13px] text-[var(--color-ink-muted)]">Drop a file here, or click to browse</span>
          )}
        </div>
        {file ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPick(null)
            }}
            className="text-[11px] text-[var(--color-ink-dim)] hover:text-white"
          >
            Remove
          </button>
        ) : null}
      </label>
      <Help>{hint}</Help>
    </div>
  )
}

// Non-label field wrapper. Identical to Field but uses a div so a child
// <input type=file> isn't auto-clicked by the label's delegation when the
// user clicks anywhere inside (which is what made the file picker open
// twice in FileDrop).
function FieldDiv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="block text-[12px] font-semibold text-[var(--color-ink-muted)] mb-1.5">{label}</span>
      {children}
    </div>
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
  mode,
  title,
  sourceUrl,
  previewUrl,
  status,
  templateKey,
}: {
  mode: Mode
  title: string
  sourceUrl: string
  previewUrl: string | null
  status: string
  templateKey: string
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-4">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)] font-semibold mb-2">On create</p>
      <ul className="space-y-1.5 text-[13px] text-[var(--color-ink)]">
        <li>
          <span className="text-[var(--color-ink-muted)]">URL:</span>{' '}
          {previewUrl ? (
            <code className="text-[var(--color-info)] font-mono">{previewUrl}</code>
          ) : (
            <span className="text-[var(--color-ink-dim)]">—</span>
          )}
        </li>
        {mode === 'ai' ? (
          <li>
            <span className="text-[var(--color-ink-muted)]">Source:</span>{' '}
            {sourceUrl.trim() ? (
              <code className="text-[var(--color-info)] font-mono break-all">{sourceUrl.trim()}</code>
            ) : (
              <span className="text-[var(--color-ink-dim)]">—</span>
            )}
            <span className="text-[var(--color-ink-dim)]"> · AI will set the page title from the source</span>
          </li>
        ) : mode === 'import' ? (
          <li>
            <span className="text-[var(--color-ink-muted)]">Source:</span>{' '}
            <span className="text-[var(--color-ink-dim)]">file upload</span>
            <span className="text-[var(--color-ink-dim)]"> · title pulled from the HTML &lt;title&gt; tag</span>
          </li>
        ) : (
          <li>
            <span className="text-[var(--color-ink-muted)]">Title:</span>{' '}
            <span className="text-white">{title.trim() || <span className="text-[var(--color-ink-dim)]">—</span>}</span>
          </li>
        )}
        <li>
          <span className="text-[var(--color-ink-muted)]">Status:</span>{' '}
          <span className="capitalize">{status}</span>
          {status === 'draft' ? (
            <span className="text-[var(--color-ink-dim)]"> · hidden from the live site until published</span>
          ) : null}
        </li>
        <li>
          <span className="text-[var(--color-ink-muted)]">Template:</span>{' '}
          {mode === 'ai' ? 'Custom · authored by AI' : templateKey === 'custom' ? 'Custom' : `Shared: ${templateKey}`}
          <span className="text-[var(--color-ink-dim)]">
            {' '}
            ·{' '}
            {mode === 'ai'
              ? 'AI returns editable body_blocks'
              : templateKey === 'custom'
                ? 'add body blocks after creation'
                : 'Site variables substitute in automatically'}
          </span>
        </li>
      </ul>
    </div>
  )
}
