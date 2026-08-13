// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * The Templates tab: the quiz visual library, as records you can act on.
 *
 * It replaces a browse-only catalogue that read the code registry directly. You
 * cannot disable, rename, clone or delete a `const`, so that tab could answer
 * "which templates exist" and nothing else - and because the deployment editor
 * stored a raw string, the library and the picker were two facts that could
 * disagree. Everything here is a row from `src/lib/template-records/`, which is
 * the same source the deployment gallery reads, so the two cannot drift.
 *
 * A LIST rather than a grid of cards, on purpose. `TemplateGallery` is the grid,
 * and its cards carry exactly two actions because a gallery exists to make one
 * choice. This surface exists to MANAGE, which is five actions per row plus
 * state that has to be legible at a glance - origin, enabled, which renderer
 * draws it, and whether that renderer still exists. Those are different jobs, so
 * this is a different presentation, but the picture is the same `TemplatePreview`
 * the gallery uses rather than a second preview implementation.
 */

import { useMemo, useState } from 'react'
import {
  Eye, Edit3, Copy, Trash2, Power, PowerOff, AlertTriangle, LayoutTemplate, X,
} from 'lucide-react'

import { T, Btn, IconBtn, Input, Textarea, Select, Label, Pill, Modal, ConfirmDialog } from '../ui'
import { TemplatePreview } from './TemplatePreview'
import { Section } from './section'
import { resolveTemplate } from '@/lib/template-registry'
import { PROGRESS_FORM_LABELS } from '@/lib/quiz-templates/model'
import {
  createQuizTemplate, cloneQuizTemplate, saveQuizTemplate, setQuizTemplateEnabled, deleteQuizTemplate,
} from '@/app/(app)/admin/(top)/template-actions'

/* ------------------------------------------------------------------ helpers */

/**
 * The code renderer behind a record.
 *
 * Always through `rendererKey`, never `templateId`: a clone's own id names no
 * renderer, which is precisely why the collection carries two id fields.
 */
export const quizSpecForRecord = (t) => {
  if (!t) return null
  const res = resolveTemplate('quiz', t.rendererKey)
  return res.ok && res.template.kind === 'quiz' ? res.template.template : null
}

/** The progress form a record draws by default, and where that answer came from. */
export const defaultProgressFor = (t) => {
  const override = t?.configOverrides?.progressForm
  if (typeof override === 'string' && override) return { id: override, from: 'template' }
  const spec = quizSpecForRecord(t)
  return spec ? { id: spec.progress, from: 'renderer' } : { id: null, from: 'none' }
}

const progressLabel = (id) => PROGRESS_FORM_LABELS.find((p) => p.id === id)?.label ?? id ?? 'renderer default'

const ORIGIN_COLOR = { stock: T.info, clone: T.purple, blank: T.cyan, ai: T.pink, legacy: T.textLow }

/* ------------------------------------------------------------------ pieces */

const Thumb = ({ template, brand, width = 210, height = 116, progress = null }) => {
  if (template.rendererError) {
    return (
      <div
        style={{
          width, height, flexShrink: 0, borderRadius: 8, border: `1px solid ${T.danger}`,
          backgroundColor: T.bg, display: 'grid', placeItems: 'center', padding: 10,
          textAlign: 'center', color: T.danger, fontSize: 10.5, lineHeight: 1.4,
        }}
      >
        {template.rendererError}
      </div>
    )
  }
  return (
    <div style={{ width, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <TemplatePreview spec={quizSpecForRecord(template)} brand={brand} progress={progress} height={height} />
    </div>
  )
}

/**
 * A dismissible result banner.
 *
 * Refusals from the delete action name every deployment standing in the way and
 * a disable warning names every page that will keep rendering. Neither fits in a
 * toast that removes itself after three seconds, and both are the reason the
 * operator pressed the button, so they stay on screen until dismissed and are
 * shown verbatim rather than summarised.
 */
const Notice = ({ notice, onDismiss }) => {
  if (!notice) return null
  const color = notice.tone === 'error' ? T.danger : notice.tone === 'warning' ? T.warning : T.success
  return (
    <div
      data-template-notice={notice.tone}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 8,
        border: `1px solid ${color}`, backgroundColor: `${color}14`, color: T.text, fontSize: 12.5, lineHeight: 1.55,
      }}
    >
      <AlertTriangle size={14} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}>{notice.text}</div>
      <IconBtn icon={X} onClick={onDismiss} title="Dismiss" />
    </div>
  )
}

const PreviewModal = ({ template, brand, onClose }) => (
  <Modal
    open
    onClose={onClose}
    title={`Preview: ${template.name}`}
    maxWidth={760}
    footer={<Btn variant="secondary" size="md" onClick={onClose}>Close</Btn>}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: T.textLow }}>
          {template.templateId} {'·'} draws with {template.rendererKey}
        </span>
        <Pill color={ORIGIN_COLOR[template.origin] || T.textMute}>{String(template.origin).toUpperCase()}</Pill>
      </div>
      {template.rendererError
        ? <div style={{ padding: 14, borderRadius: 8, border: `1px solid ${T.danger}`, color: T.danger, fontSize: 12.5 }}>{template.rendererError}</div>
        : <Thumb template={template} brand={brand} width="100%" height={460} progress={defaultProgressFor(template).id} />}
      <div style={{ fontSize: 11.5, color: T.textMute, lineHeight: 1.55 }}>
        A real render, not a picture of one: the progress and answer forms below are the components the deployed
        quiz mounts. The questions are samples and belong to no quiz.
      </div>
    </div>
  </Modal>
)

/**
 * The template record's OWN editor.
 *
 * Not the quiz flow editor and not the deployment editor: nothing here is a
 * question, a route or a URL. It edits what makes this row a selectable
 * template - what it is called, what draws it, and the presentation choices
 * layered over that renderer.
 */
const EditorModal = ({ template, brands, brandId, rendererOptions, onBrandChange, onSaved, onError, onClose }) => {
  const [draft, setDraft] = useState({
    name: template.name || '',
    code: template.code || '',
    blurb: template.blurb || '',
    rendererKey: template.rendererKey || '',
    progressForm: typeof template.configOverrides?.progressForm === 'string' ? template.configOverrides.progressForm : '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (p) => setDraft((d) => ({ ...d, ...p }))

  // Previewed against the DRAFT, so switching renderer or progress form repaints
  // before the save rather than after a reload.
  const previewRecord = { ...template, rendererKey: draft.rendererKey, rendererError: null }
  const previewSpec = quizSpecForRecord(previewRecord)
  const brand = brands.find((b) => b.id === brandId) || null

  const save = async () => {
    if (!draft.name.trim()) { onError('A template needs a name.'); return }
    setSaving(true)
    // Unknown keys are preserved: `config_overrides` is a json column other
    // presentation choices will land in, and a save here must not drop them.
    const configOverrides = { ...(template.configOverrides || {}) }
    if (draft.progressForm) configOverrides.progressForm = draft.progressForm
    else delete configOverrides.progressForm

    const res = await saveQuizTemplate({
      id: template.id,
      patch: {
        name: draft.name.trim(),
        code: draft.code.trim(),
        blurb: draft.blurb,
        rendererKey: draft.rendererKey,
        configOverrides,
      },
    })
    setSaving(false)
    if (!res?.ok) { onError(res?.error || 'save failed'); return }
    onSaved(`Saved "${draft.name.trim()}".`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit template: ${template.name}`}
      maxWidth={900}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" size="md" onClick={save} disabled={saving} style={saving ? { opacity: 0.6 } : {}}>
          {saving ? 'Saving...' : 'Save template'}
        </Btn>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Editorial Inline" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <Label>Code</Label>
              <Input mono value={draft.code} onChange={(e) => upd({ code: e.target.value })} placeholder="SQ-01" />
            </div>
            <div>
              <Label>Stored id</Label>
              <Input mono value={template.templateId} readOnly title="Deployments store this id; it never changes" style={{ opacity: 0.7 }} />
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: -6, lineHeight: 1.5 }}>
            The stored id is what every deployment on this template holds. It is deliberately not editable: changing
            it would unbind them all, silently. Clone the template instead.
          </div>
          <div>
            <Label>Blurb</Label>
            <Textarea rows={3} value={draft.blurb} onChange={(e) => upd({ blurb: e.target.value })} placeholder="What this template is for, in one line." />
          </div>
          <div>
            <Label>Renderer</Label>
            <Select value={draft.rendererKey} onChange={(e) => upd({ rendererKey: e.target.value })}>
              {rendererOptions.length === 0 && <option value={draft.rendererKey}>{draft.rendererKey}</option>}
              {rendererOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 5, lineHeight: 1.5 }}>
              Which code renderer draws this template: its width, answer form and icon policy. Colour is never here,
              it comes from the brand.
            </div>
            {template.origin === 'stock' && draft.rendererKey !== template.rendererKey && (
              <div style={{ fontSize: 11, color: T.warning, marginTop: 6, lineHeight: 1.5 }}>
                This is a stock row. The library is re-derived from the code registry on every boot, so a renderer
                change here is reverted the next time the app restarts. Clone the template to keep a different one.
              </div>
            )}
          </div>
          <div>
            <Label>Progress form</Label>
            <Select value={draft.progressForm} onChange={(e) => upd({ progressForm: e.target.value })}>
              <option value="">
                Match the renderer ({progressLabel(previewSpec?.progress)})
              </option>
              {PROGRESS_FORM_LABELS.map((p) => <option key={p.id} value={p.id}>{p.label} {'·'} from {p.from}</option>)}
            </Select>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 5, lineHeight: 1.5 }}>
              The default every deployment of this template starts from. A deployment may still choose its own.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 0 }}>
          <div>
            <Label>Preview as</Label>
            <Select value={brandId} onChange={(e) => onBrandChange(e.target.value)}>
              <option value="__neutral__">Neutral (no brand)</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}
            </Select>
          </div>
          {previewSpec
            ? <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              <TemplatePreview spec={previewSpec} brand={brand} progress={draft.progressForm || null} height={300} />
            </div>
            : <div style={{ padding: 14, borderRadius: 8, border: `1px solid ${T.danger}`, color: T.danger, fontSize: 11.5 }}>
              No renderer named &quot;{draft.rendererKey}&quot; exists, so there is nothing to draw.
            </div>}
          <div style={{ fontSize: 10.5, color: T.textLow, lineHeight: 1.5 }}>
            Live: the picture follows the renderer and progress form selected on the left, before you save.
          </div>
        </div>
      </div>
    </Modal>
  )
}

const CreateModal = ({ rendererOptions, onCreated, onError, onClose }) => {
  const [name, setName] = useState('')
  const [rendererKey, setRendererKey] = useState(rendererOptions[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const spec = quizSpecForRecord({ rendererKey })

  const create = async () => {
    setBusy(true)
    const res = await createQuizTemplate({ name: name.trim(), rendererKey: rendererKey || undefined })
    setBusy(false)
    if (!res?.ok) { onError(res?.error || 'create failed'); return }
    onCreated(`Created "${name.trim() || 'Untitled quiz template'}".`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New quiz template"
      maxWidth={640}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" size="md" onClick={create} disabled={busy} style={busy ? { opacity: 0.6 } : {}}>
          {busy ? 'Creating...' : 'Create template'}
        </Btn>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Name</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled quiz template" />
        </div>
        <div>
          <Label>Starts from renderer</Label>
          <Select value={rendererKey} onChange={(e) => setRendererKey(e.target.value)}>
            {rendererOptions.length === 0 && <option value="">Library default</option>}
            {rendererOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 5, lineHeight: 1.5 }}>
            A template is a selectable identity drawn by a code renderer. Pick the one whose layout you want; the
            name, blurb and progress form are yours to change afterwards.
          </div>
        </div>
        {spec && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <TemplatePreview spec={spec} brand={null} height={190} />
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------- panel */

export const QuizTemplatesPanel = ({
  templates = [], brands = [], createOpen = false, onCreateClose = () => {}, onToast = () => {}, onChanged = () => {},
}) => {
  const [brandId, setBrandId] = useState('__neutral__')
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const brand = brands.find((b) => b.id === brandId) || null

  /*
   * The renderers on offer, derived from the rows rather than from the code
   * registry. Reading `listQuizTemplates()` here would rebuild the catalogue
   * beside the records - the exact duplication this whole change removes - and
   * the twenty stock rows already name all twenty renderers.
   */
  const rendererOptions = useMemo(() => {
    const byKey = new Map()
    for (const t of templates) {
      if (!t.rendererKey || t.rendererError) continue
      // A stock row's name IS the renderer's name, so it always wins the label.
      if (!byKey.has(t.rendererKey) || t.origin === 'stock') {
        byKey.set(t.rendererKey, t.origin === 'stock' ? t.name : `${t.rendererKey}`)
      }
    }
    return [...byKey.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [templates])

  const enabledCount = templates.filter((t) => t.isEnabled && !t.rendererError).length
  const brokenCount = templates.filter((t) => t.rendererError).length

  const after = (res, okText) => {
    if (!res?.ok) { setNotice({ tone: 'error', text: res?.error || 'that did not work' }); return false }
    if (okText) onToast({ message: okText, type: 'success' })
    onChanged()
    return true
  }

  const toggleEnabled = async (t) => {
    setBusyId(t.id)
    const res = await setQuizTemplateEnabled({ id: t.id, enabled: !t.isEnabled })
    setBusyId(null)
    if (!after(res, `${t.name} ${t.isEnabled ? 'disabled' : 'enabled'}.`)) return
    // The warning is the whole point of disabling being survivable: it names the
    // deployments that keep rendering this template regardless.
    if (res.warning) setNotice({ tone: 'warning', text: res.warning })
  }

  const clone = async (t) => {
    setBusyId(t.id)
    const res = await cloneQuizTemplate({ id: t.id })
    setBusyId(null)
    after(res, `Cloned "${t.name}".`)
  }

  const confirmDelete = async () => {
    const t = pendingDelete
    setPendingDelete(null)
    if (!t) return
    setBusyId(t.id)
    const res = await deleteQuizTemplate({ id: t.id })
    setBusyId(null)
    if (!res?.ok) {
      // Verbatim: the refusal names every deployment in the way, which is what
      // makes it actionable rather than something to escalate.
      setNotice({ tone: 'error', text: res?.error || 'delete failed' })
      return
    }
    setNotice({
      tone: 'success',
      text: res.archived
        ? `"${t.name}" is a stock template, so it was archived rather than deleted: it is gone from the library and disabled, and the code library will not resurrect it.`
        : `"${t.name}" was deleted.`,
    })
    onChanged()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <Section
        id="library"
        divider={false}
        title="Quiz template library"
        hint="Every visual template a quiz deployment can be rendered in. A template owns layout, progress, answer form and icons; colour always comes from the brand. Disabling one keeps existing pages rendering and only removes it from new choices."
        right={
          <div style={{ minWidth: 220 }}>
            <Label>Preview as</Label>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="__neutral__">Neutral (no brand)</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.displayName || b.name}</option>)}
            </Select>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: T.textMute, fontFamily: '"JetBrains Mono", monospace' }}>
          <span data-template-count={templates.length}>{templates.length} template{templates.length === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{enabledCount} selectable</span>
          {brokenCount > 0 && <><span>·</span><span style={{ color: T.danger }}>{brokenCount} broken</span></>}
        </div>

        {templates.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', backgroundColor: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textMute, fontSize: 12.5 }}>
            <LayoutTemplate size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
            <div>No quiz templates yet. The stock library is materialised on first load; if it stays empty, the
              template migration has not been applied on this database.</div>
          </div>
        ) : templates.map((t) => {
          const busy = busyId === t.id
          const progress = defaultProgressFor(t)
          return (
            <div
              key={t.id}
              data-quiz-template={t.templateId}
              data-quiz-template-enabled={t.isEnabled ? 'true' : 'false'}
              style={{
                display: 'flex', gap: 16, alignItems: 'center', padding: 14,
                backgroundColor: T.bgElev, border: `1px solid ${t.rendererError ? T.danger : T.border}`,
                borderRadius: 10, opacity: busy ? 0.6 : t.isEnabled ? 1 : 0.78,
              }}
            >
              <Thumb template={t} brand={brand} progress={progress.id} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span data-quiz-template-name={t.templateId} style={{ fontSize: 14.5, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{t.name}</span>
                  {t.code && <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, color: T.textLow }}>{t.code}</span>}
                  <Pill color={ORIGIN_COLOR[t.origin] || T.textMute}>{String(t.origin).toUpperCase()}</Pill>
                  {t.rendererError
                    ? <Pill color={T.danger}>BROKEN RENDERER</Pill>
                    : <Pill color={t.isEnabled ? T.success : T.textMute}>{t.isEnabled ? 'ENABLED' : 'DISABLED'}</Pill>}
                </div>
                {t.blurb && <div style={{ fontSize: 11.5, color: T.textMute, marginTop: 5, lineHeight: 1.5 }}>{t.blurb}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10.5, color: T.textLow, fontFamily: '"JetBrains Mono", monospace', flexWrap: 'wrap' }}>
                  <span>id {t.templateId}</span><span>·</span>
                  <span>renderer {t.rendererKey || '-'}</span><span>·</span>
                  <span>progress {progress.id ? progressLabel(progress.id) : '-'}{progress.from === 'template' ? ' (set here)' : ''}</span>
                </div>
                {t.rendererError && (
                  <div style={{ fontSize: 11, color: T.danger, marginTop: 6, lineHeight: 1.5 }}>
                    {t.rendererError}. Deployments on this template refuse to serve until the renderer is corrected.
                  </div>
                )}
              </div>

              {/* Labelled, not icon-only. Five actions of which three are
                  destructive-ish; an icon row here is a memory test, and Clone
                  next to Delete is not the place for one. */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 260 }}>
                <Btn variant="secondary" size="sm" icon={Eye} disabled={busy} onClick={() => setPreviewing(t)}>Preview</Btn>
                <Btn variant="primary" size="sm" icon={Edit3} disabled={busy} onClick={() => setEditing(t)}>Edit</Btn>
                <Btn variant="secondary" size="sm" icon={Copy} disabled={busy} onClick={() => clone(t)}>Clone</Btn>
                <Btn
                  variant="secondary"
                  size="sm"
                  icon={t.isEnabled ? PowerOff : Power}
                  disabled={busy}
                  title={t.isEnabled ? 'Stop offering this template to new deployments' : 'Offer this template again'}
                  onClick={() => toggleEnabled(t)}
                >{t.isEnabled ? 'Disable' : 'Enable'}</Btn>
                <Btn variant="danger" size="sm" icon={Trash2} disabled={busy} onClick={() => setPendingDelete(t)}>Delete</Btn>
              </div>
            </div>
          )
        })}
      </Section>

      {previewing && <PreviewModal template={previewing} brand={brand} onClose={() => setPreviewing(null)} />}

      {editing && (
        <EditorModal
          template={editing}
          brands={brands}
          brandId={brandId}
          onBrandChange={setBrandId}
          rendererOptions={rendererOptions}
          onError={(text) => setNotice({ tone: 'error', text })}
          onSaved={(text) => { setEditing(null); onToast({ message: text, type: 'success' }); onChanged() }}
          onClose={() => setEditing(null)}
        />
      )}

      {createOpen && (
        <CreateModal
          rendererOptions={rendererOptions}
          onError={(text) => { onCreateClose(); setNotice({ tone: 'error', text }) }}
          onCreated={(text) => { onCreateClose(); onToast({ message: text, type: 'success' }); onChanged() }}
          onClose={onCreateClose}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.name || 'this template'}"?`}
        message={pendingDelete?.stockKey
          ? 'This is a stock template, so it is archived rather than dropped: the code library re-creates any stock row it cannot find, and a delete that came back would look like the button did nothing. It disappears from the library either way, and a deployment still using it blocks the removal.'
          : 'A deployment still using this template blocks the removal, and will be named if so. Otherwise the row is gone for good.'}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
