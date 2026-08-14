// @ts-nocheck
/* eslint-disable */
'use client'

// Image picker: opens a modal with two tabs — Upload (drop or browse a new
// file from disk) and Library (pick from previously-uploaded images on this
// Site). Wired in via the URL field anywhere body_blocks needs an image
// (hero, image block, og_image_url, etc.). Returns a public URL string to
// the caller; nothing here cares what blockType is on the receiving end.

import { useState, useEffect, useRef } from 'react'
import { Image as ImageIcon, Upload, X, Loader2, Check } from 'lucide-react'
import { T, Btn, Input, IconBtn, Pill, Label } from '../ui'
import { uploadMediaFromDataURL, listSiteMedia } from '@/app/(app)/admin/sites/[slug]/pages/[id]/media-actions'
import { settleAction, failureMessage } from '../server-action'

type MediaItem = { id: string | number; url: string; filename: string; alt: string }
type Tab = 'upload' | 'library'

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })

export function ImagePickerField({
  label,
  value,
  onChange,
  siteSlug,
  siteId,
  mono = true,
  placeholder = 'https://… or click Upload',
}: {
  label: string
  value: string
  onChange: (url: string) => void
  siteSlug: string
  siteId: number | string
  mono?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Label>{label}</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        <Input
          mono={mono}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <Btn variant="secondary" size="sm" icon={ImageIcon} onClick={() => setOpen(true)}>
          Pick
        </Btn>
      </div>
      {value ? (
        <div style={{ marginTop: 6, padding: 6, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 6 }}>
          <img
            loading="lazy"
            decoding="async"
            src={value}
            alt=""
            style={{ display: 'block', maxWidth: '100%', maxHeight: 120, borderRadius: 4 }}
          />
        </div>
      ) : null}
      {open ? (
        <ImagePickerModal
          siteSlug={siteSlug}
          siteId={siteId}
          onClose={() => setOpen(false)}
          onPick={(url) => {
            onChange(url)
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function ImagePickerModal({
  siteSlug,
  siteId,
  onPick,
  onClose,
}: {
  siteSlug: string
  siteId: number | string
  onPick: (url: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('upload')
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const res = await settleAction(listSiteMedia({ siteId }))
      if (cancelled) return
      if (!res.ok) setError(failureMessage(res))
      else setItems(res.items)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [siteId])

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file)
        const res = await settleAction(uploadMediaFromDataURL({
          siteSlug,
          siteId,
          dataUrl,
          filename: file.name,
        }))
        if (!res.ok) {
          setError(failureMessage(res))
          break
        }
        // Refresh library tab with the new item at the top.
        setItems((prev) => [
          { id: res.id, url: res.url, filename: res.filename, alt: res.alt },
          ...prev,
        ])
        // Drop straight in on single-file uploads.
        if (files.length === 1) {
          onPick(res.url)
          return
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 840,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: T.bg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 16, color: T.text, fontWeight: 600 }}>Pick an image</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4, background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 6, padding: 3 }}>
            <button
              onClick={() => setTab('upload')}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: tab === 'upload' ? T.primary : 'transparent',
                color: tab === 'upload' ? '#fff' : T.text,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Upload
            </button>
            <button
              onClick={() => setTab('library')}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: tab === 'library' ? T.primary : 'transparent',
                color: tab === 'library' ? '#fff' : T.text,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Library · {items.length}
            </button>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'upload' ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  handleFiles(e.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                style={{
                  padding: '60px 24px',
                  border: `2px dashed ${dragOver ? T.primary : T.border}`,
                  borderRadius: 10,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? `${T.primary}10` : T.bgElev,
                  color: T.text,
                }}
              >
                {busy ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <Loader2 size={28} className="animate-spin" />
                    <div style={{ fontSize: 13, color: T.textMute }}>Uploading…</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <Upload size={28} color={T.primary} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Drop image here, or click to browse</div>
                    <div style={{ fontSize: 11.5, color: T.textMute }}>JPG, PNG, GIF, WebP, SVG · 10 MB max</div>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <Label>Or paste an external URL</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input
                    mono
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    style={{ flex: 1 }}
                  />
                  <Btn
                    variant="primary"
                    size="sm"
                    icon={Check}
                    onClick={() => {
                      const u = pasteUrl.trim()
                      if (!u) return
                      onPick(u)
                    }}
                  >
                    Use URL
                  </Btn>
                </div>
                <div style={{ fontSize: 11, color: T.textLow, marginTop: 6 }}>
                  External URLs aren't saved to your library — paste only if the host is stable.
                </div>
              </div>
            </>
          ) : (
            <>
              {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: T.textMute }}>
                  <Loader2 size={20} className="animate-spin" /> Loading library…
                </div>
              ) : items.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: T.textMute }}>
                  No images uploaded for this site yet.{' '}
                  <button
                    onClick={() => setTab('upload')}
                    style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Upload one →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                  {items.map((m) => (
                    <button
                      key={String(m.id)}
                      onClick={() => onPick(m.url)}
                      style={{
                        background: T.bgElev,
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: T.text,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 4, background: '#000' }}>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={m.url}
                          alt={m.alt}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: T.textMute,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.filename}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {error ? (
            <div style={{ marginTop: 14, padding: 10, background: `${T.danger}15`, border: `1px solid ${T.danger}`, borderRadius: 6, color: T.danger, fontSize: 12.5 }}>
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
