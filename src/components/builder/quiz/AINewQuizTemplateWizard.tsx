// @ts-nocheck
/* eslint-disable */
'use client'

/**
 * "New with Claude" for the quiz template library.
 *
 * Deliberately smaller than the LP wizard it mirrors. An LP template is a
 * page's worth of sections the model fills one call at a time, so that wizard
 * walks name, angle, design and notes across four steps. A quiz template is a
 * selectable identity over one of twenty code renderers plus a single visual
 * knob, so the whole brief fits in one instruction and the server does the
 * rest in one call: Claude picks the closest base renderer, names the
 * template, writes its blurb, and may set the progress form.
 *
 * Everything else is out of the model's reach by construction, not by
 * request - the server action refuses markup, URLs, invented renderers and
 * config fields outside the supported set, so a disobedient answer becomes an
 * error in the box below rather than a row in the library.
 */

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import { T, Btn, Input, Textarea, Label, Modal } from '../ui'
import { createQuizTemplateWithClaude } from '@/app/(app)/admin/(top)/template-actions'
import { settleAction, failureMessage } from '../server-action'

export const AINewQuizTemplateWizard = ({ open, onClose, onToast, onCreated }) => {
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setName(''); setInstruction(''); setBusy(false); setError(null)
  }, [open])
  if (!open) return null

  const generate = async () => {
    if (!instruction.trim()) { setError('Say what the template should feel like and where it will run.'); return }
    setBusy(true); setError(null)
    const res = await settleAction(createQuizTemplateWithClaude({
      instruction: instruction.trim(),
      name: name.trim() || undefined,
    }))
    setBusy(false)
    if (!res.ok) { setError(failureMessage(res)); return }
    // A warning means the row EXISTS but its blurb/config write failed, so the
    // list refresh below still shows it and the toast says what is left to do.
    onToast({
      message: res.warning || `Claude created "${res.name}".`,
      type: res.warning ? 'warning' : 'success',
    })
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      // While the server is writing there is a request in flight that WILL
      // create a record; closing the dialog would not cancel it, only hide the
      // outcome, so the close paths wait alongside the operator.
      onClose={busy ? () => {} : onClose}
      title="New template with Claude"
      maxWidth={640}
      footer={<>
        <Btn variant="ghost" size="md" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn
          variant="primary"
          size="md"
          icon={busy ? Loader2 : Sparkles}
          onClick={generate}
          disabled={busy}
          data-quiz-ai-generate=""
          style={busy ? { opacity: 0.6 } : {}}
        >{busy ? 'Writing...' : 'Generate with Claude'}</Btn>
      </>}
    >
      <div data-quiz-ai-wizard="" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Template name (optional)</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leave blank and Claude names it"
            disabled={busy}
          />
        </div>
        <div>
          <Label>What should it feel like?</Label>
          <Textarea
            rows={5}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="eg Calm and institutional for desktop retargeting traffic. Progress should read like a case file being completed, not a percentage."
            disabled={busy}
          />
          <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 6, lineHeight: 1.55 }}>
            Claude picks the closest of the twenty stock renderers as the base, names the template, writes its
            blurb, and may set the progress form. That is the whole surface: layout, answers and icons stay the
            renderer&apos;s, colour always comes from the brand, and questions live on the deployment.
          </div>
        </div>
        {error && (
          <div style={{ padding: 10, backgroundColor: `${T.danger}11`, border: `1px solid ${T.danger}66`, borderRadius: 6, fontSize: 12, color: T.danger, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
