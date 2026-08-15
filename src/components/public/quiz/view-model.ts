// @ts-nocheck -- reads the ported quiz node/answer shapes, which are open by
// design (see `quiz-graph`). Everything this module DECIDES is typed by
// `QuizViewModel`; only the node it reads from is loose.
'use client'

/**
 * The view model: everything a composition is allowed to know, and the only
 * mutations it is allowed to make.
 *
 * This is the seam that makes seven compositions safe. It owns the input state
 * the question card used to own — the selected answer, the multi-select set,
 * the smart date, the form values, the honeypot — and it owns `canSubmit` and
 * the construction of the answer object handed to the machine. A composition
 * receives `option.select()` already bound and `nav.canSubmit` already
 * computed, so there is nothing for it to re-implement, because it is never
 * given the inputs re-implementation would need.
 *
 * The submission logic below is a MOVE, not a rewrite: the branch order in
 * `submit`, the predicate in `canSubmit`, the auto-advance rules and the
 * multi-select behaviour (the first answer's mappings apply; the set itself is
 * not written to fields) are transcribed from the card this replaces, so seven
 * designs inherit exactly the behaviour one design had rather than a new one.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { applyDynamicContent, isNodeVisible, isWithin3MonthsOfToday } from '@/components/builder/quiz/seed-data'
import { resolveRedirectUrl } from '@/lib/quiz-destinations'
import type { QuizActions, QuizViewModel } from '@/lib/quiz-compositions/types'

const INVISIBLE_TYPES = new Set(['decision', 'webhook', 'verification', 'transition'])

const asDateValue = (d) =>
  `${d.year}-${String(d.month).padStart(2, '0')}${d.day ? `-${String(d.day).padStart(2, '0')}` : ''}`

/**
 * @param columns      how many answer columns fit the space the card has. The
 *                     author's setting is the ceiling, never the floor.
 * @param chrome       brand-owned page chrome, pre-rendered. Null everywhere it
 *                     is not drawn (still, embed, inline).
 * @param selectedAnswerId  forces the drawn selection. Only a frozen still sets
 *                     it; a live card owns its own.
 */
export const useQuizView = ({
  machine,
  brand,
  customFields = [],
  columns = 1,
  destinationCtx = null,
  chrome = { header: null, body: null, footer: null },
  mode = 'live',
}: {
  machine
  brand
  customFields?
  columns?: number
  destinationCtx?
  chrome?: { header: ReactNode | null; body: ReactNode | null; footer: ReactNode | null }
  mode?: 'live' | 'preview' | 'still'
}): { view: QuizViewModel; actions: QuizActions } => {
  const rawNode = machine.currentNode
  const fieldValues = machine.fieldValues
  const nodeId = rawNode?.id ?? ''

  const [selectedSingle, setSelectedSingle] = useState(null)
  const [multi, setMulti] = useState<string[]>([])
  const [text, setText] = useState('')
  const [dropdownVal, setDropdownVal] = useState('')
  const [smartDate, setSmartDate] = useState<{ year?: number; month?: number; day?: number | null }>({})
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')

  // Every input resets when the node changes. Held here rather than in seven
  // compositions, which is the difference between one reset rule and seven.
  useEffect(() => {
    setSelectedSingle(null); setMulti([]); setText(''); setDropdownVal('')
    setSmartDate({}); setFormValues({}); setHoneypot('')
  }, [nodeId])

  const node = useMemo(() => (rawNode ? applyDynamicContent(rawNode, fieldValues) : null), [rawNode, fieldValues])

  const interp = useCallback(
    (s) => (s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => fieldValues[k] || `{{${k}}}`),
    [fieldValues],
  )

  const answers = node?.answers ?? []
  const questionType = node?.questionType
  const autoAdvance = node?.autoAdvance !== false
  const onAnswer = machine.answer

  /* ------------------------------------------------------------- submission */

  const canSubmit = Boolean(
    selectedSingle
    || (questionType === 'multi_select' && multi.length > 0)
    || (questionType === 'smart_date' && smartDate.year && smartDate.month
      && (!isWithin3MonthsOfToday(smartDate.year, smartDate.month) || smartDate.day))
    || (questionType === 'dropdown' && dropdownVal)
    || (node?.type === 'form' && (node.formFields || []).every((f) => !f.required || formValues[f.key]))
    || text,
  )

  const submit = useCallback(() => {
    if (!node) return
    const first = answers[0]
    if (selectedSingle) onAnswer(selectedSingle)
    else if (questionType === 'multi_select') onAnswer(first || { label: 'Continue' })
    else if (questionType === 'smart_date' && smartDate.year && smartDate.month) {
      onAnswer({ ...first, fieldMappings: [{ key: node.fieldName, value: asDateValue(smartDate) }] })
    } else if (questionType === 'dropdown' && dropdownVal) {
      onAnswer({ ...first, fieldMappings: [{ key: node.dropdownField || node.fieldName, value: dropdownVal }] })
    } else if (text) {
      onAnswer({ ...first, fieldMappings: [{ key: node.fieldName, value: text }] })
    } else if (Object.keys(formValues).length) {
      // A filled honeypot is a bot. Drop the submit silently rather than
      // telling it why.
      if (honeypot) return
      onAnswer({ ...first, fieldMappings: Object.entries(formValues).map(([k, v]) => ({ key: k, value: v })) })
    } else onAnswer({ nextStepKey: '' })
  }, [node, answers, selectedSingle, questionType, smartDate, dropdownVal, text, formValues, honeypot, onAnswer])

  /* --------------------------------------------------------------- redirect */

  const redirectUrl = node ? resolveRedirectUrl(node.redirect, destinationCtx || {}, fieldValues || {}) : null

  // A preview must never navigate. Without this guard, opening the last step of
  // a flow in the builder throws the admin onto the partner's site 800ms later,
  // which reads as a random crash rather than as a redirect.
  useEffect(() => {
    if (mode !== 'live') return
    if (node?.type === 'endpoint' && node.redirect?.mode === 'immediate' && redirectUrl) {
      const t = setTimeout(() => { try { window.location.href = redirectUrl } catch { /* navigation blocked */ } }, 800)
      return () => clearTimeout(t)
    }
    return undefined
  }, [nodeId, redirectUrl, mode, node?.type, node?.redirect?.mode])

  /* ------------------------------------------------------------------- view */

  const forced = machine.selectedAnswerId
  const isSelected = (a) => (forced != null ? String(a?.id) === String(forced) : selectedSingle?.id === a?.id)

  const options = useMemo(() => answers.map((a, i) => ({
    id: String(a?.id ?? i),
    index: i,
    label: a?.label ?? '',
    meta: a?.meta ?? a?.sublabel ?? null,
    selected: questionType === 'multi_select'
      ? (forced != null ? String(a?.id) === String(forced) : multi.includes(a?.id))
      : isSelected(a),
    select: () => {
      if (questionType === 'multi_select') {
        setMulti((prev) => (prev.includes(a?.id) ? prev.filter((x) => x !== a?.id) : [...prev, a?.id]))
        return
      }
      if (autoAdvance) onAnswer(a)
      else setSelectedSingle(a)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [answers, questionType, forced, multi, selectedSingle, autoAdvance, onAnswer])

  const input = useMemo(() => {
    if (!node) return { kind: 'none' as const }
    if (questionType === 'button_grid' || questionType === 'single_select' || questionType === 'multi_select') {
      return { kind: 'options' as const, multi: questionType === 'multi_select', options, columns: Math.max(1, columns) }
    }
    if (questionType === 'dropdown') {
      const key = node.dropdownField || node.fieldName || 'answer'
      return {
        kind: 'select' as const,
        field: {
          key,
          label: node.question || node.headline || 'Answer',
          type: 'select' as const,
          placeholder: '',
          required: true,
          value: dropdownVal,
          options: (customFields.find((cf) => cf.key === node.dropdownField)?.options || []).map((o) => ({ value: o.value, label: o.label })),
          set: (v: string) => {
            setDropdownVal(v)
            if (autoAdvance && v) onAnswer({ ...answers[0], fieldMappings: [{ key, value: v }] })
          },
        },
      }
    }
    if (questionType === 'smart_date') {
      return {
        kind: 'date' as const,
        value: smartDate,
        dayRequired: Boolean(smartDate.year && smartDate.month && isWithin3MonthsOfToday(smartDate.year, smartDate.month)),
        set: (v) => {
          setSmartDate(v)
          if (autoAdvance && v.year && v.month && (!isWithin3MonthsOfToday(v.year, v.month) || v.day)) {
            onAnswer({ ...answers[0], fieldMappings: [{ key: node.fieldName, value: asDateValue(v) }] })
          }
        },
      }
    }
    if (questionType === 'text_input' || questionType === 'number_input' || questionType === 'textarea') {
      return {
        kind: 'text' as const,
        field: {
          key: node.fieldName || 'answer',
          label: node.question || node.headline || 'Answer',
          type: questionType === 'textarea' ? ('textarea' as const) : questionType === 'number_input' ? ('number' as const) : ('text' as const),
          placeholder: questionType === 'textarea' ? 'Tell us...' : 'Type your answer...',
          required: false,
          value: text,
          options: [],
          set: setText,
        },
      }
    }
    if (node.type === 'form') {
      return {
        kind: 'fields' as const,
        fields: (node.formFields || []).map((f) => ({
          key: f.key,
          label: f.label ?? f.key,
          type: f.type === 'textarea' ? ('textarea' as const)
            : f.type === 'tel' ? ('tel' as const)
              : f.type === 'email' ? ('email' as const) : ('text' as const),
          placeholder: f.placeholder ?? '',
          required: Boolean(f.required),
          value: formValues[f.key] || '',
          options: [],
          set: (v: string) => setFormValues((prev) => ({ ...prev, [f.key]: v })),
        })),
        honeypot: node.honeypot
          ? { key: 'hp_email_secondary', label: '', type: 'text' as const, placeholder: '', required: false, value: honeypot, options: [], set: setHoneypot }
          : null,
      }
    }
    return { kind: 'none' as const }
  }, [node, questionType, options, columns, dropdownVal, customFields, autoAdvance, answers, onAnswer, smartDate, text, formValues, honeypot])

  const phase: QuizViewModel['phase'] = machine.showSpinner || (node && INVISIBLE_TYPES.has(node.type))
    ? 'working'
    : !node || machine.finished
      ? 'complete'
      : node.type === 'endpoint'
        ? 'endpoint'
        : node.type === 'form'
          ? 'form'
          : 'question'

  const total = machine.progress.total
  const index = machine.progress.index

  const view: QuizViewModel = {
    phase,
    step: {
      index,
      total,
      percent: total > 1 ? Math.round((index / (total - 1)) * 100) : 0,
      labels: machine.progress.labels ?? [],
    },
    node: {
      id: nodeId,
      type: node?.type ?? '',
      tagline: node?.tagline ? interp(node.tagline) : null,
      headline: node?.headline ? interp(node.headline) : null,
      // The question is drawn only when it says something the headline did not.
      question: node?.question && node.question !== node.headline ? interp(node.question) : null,
      subheadline: node?.subheadline ? interp(node.subheadline) : null,
      hiddenInLive: Boolean(node) && !isNodeVisible(node),
      dynamic: (rawNode?.dynamicContent || []).length > 0,
    },
    input,
    nav: {
      canGoBack: Boolean(machine.canGoBack) && node?.showBackButton !== false,
      canSubmit,
      autoAdvance,
      showSubmit: Boolean(node) && (node.type === 'question' || node.type === 'form') && (
        !autoAdvance
        || questionType === 'multi_select'
        || questionType === 'smart_date'
        || questionType === 'textarea'
        || questionType === 'text_input'
        || questionType === 'number_input'
        || node.type === 'form'
      ),
      submitLabel: node?.nextButtonText || 'Next →',
      backLabel: node?.backButtonText || '← Back',
    },
    endpoint: node?.type === 'endpoint'
      ? {
        mode: node.redirect?.mode === 'immediate' ? 'immediate' : node.redirect?.mode === 'button' ? 'button' : 'none',
        url: redirectUrl || null,
        buttonLabel: node.redirect?.buttonText || 'Continue',
      }
      : null,
    // The BRAND supplies the consent line, on every form node, everywhere. See
    // `P.Consent` for why exactly one component may print it.
    legal: { tcpa: node?.type === 'form' ? interp(brand?.legal?.tcpaText || '') || null : null },
    chrome,
  }

  const actions: QuizActions = useMemo(() => ({
    submit,
    back: machine.back,
    restart: machine.restart,
  }), [submit, machine.back, machine.restart])

  return { view, actions }
}
