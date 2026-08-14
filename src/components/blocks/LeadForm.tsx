'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CONTACT_KEYS,
  captureAttribution,
  newClientSubmissionId,
  readTrustedFormCert,
  readJornayaLeadId,
  firePixelEvents,
  submitLead,
} from '@/lib/lead-capture-client'

type FormFieldDef = {
  name: string
  label?: string
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'hidden'
  required?: boolean
  half_width?: boolean
  options?: Array<{ value?: string; label?: string }>
  value?: string
}

type LeadFormBlock = {
  eyebrow?: string
  heading?: string
  sub?: string
  submit_label?: string
  consent_md?: string
  funnel_type?: 'quiz' | 'landing-page' | 'contact-form' | 'page' | 'advertorial'
  funnel_id?: string
  success_slug?: string
  form_fields?: FormFieldDef[] | null
}

// CONTACT_KEYS, attribution capture, TrustedForm / Jornaya reads, the POST and
// the pixel fire all live in @/lib/lead-capture-client so this form and the
// public quiz runtime submit through one implementation. See that module for
// why the shared event_id makes copying it a correctness bug.

type Site = {
  slug: string
  name?: string | null
}

export function LeadForm({ block, site }: { block: LeadFormBlock; site: Site }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * The idempotency key, on the same contract QuizRuntime uses: minted ONCE per
   * mounted form and deliberately NEVER cleared, so the retry a visitor makes
   * after a failure carries the key the failed attempt carried.
   *
   * This form used to send none. `runLeadPipeline` only dedupes when a key is
   * present, and the database's unique index is PARTIAL (`WHERE
   * client_submission_id IS NOT NULL`), so a keyless submit opted out of the
   * guarantee entirely — and `lead_form` ships on every seeded Site's home page.
   * A submit whose write committed but whose response was lost came back as a
   * failure, the visitor pressed the button again, and that wrote a second lead
   * row, a second CAPI conversion and a second webhook to a buyer.
   *
   * Disabling the button is NOT the guarantee and cannot be: implicit form
   * submission still fires while the default button is disabled, a second tab is
   * a second component, and neither survives a lost response. The key is the
   * guarantee; the disabling below is only there to stop the pointless request.
   *
   * `''` rather than `null` as the "not yet minted" sentinel purely so the value
   * types as `string` at the call site; the lifetime is identical.
   */
  const submissionIdRef = useRef<string>('')
  if (!submissionIdRef.current) submissionIdRef.current = newClientSubmissionId()

  // Belt to the key's braces: a second submit while the first is still in flight
  // is a wasted round trip even though the server would dedupe it. A ref, not
  // `pending`, because two submits in the same tick both read the old state.
  const inFlightRef = useRef(false)

  // Hydrate hidden attribution inputs once the form mounts client-side.
  useEffect(() => {
    if (!formRef.current) return
    const attribution = captureAttribution()
    for (const [k, v] of Object.entries(attribution)) {
      const input = formRef.current.querySelector<HTMLInputElement>(`input[name="attr_${k}"]`)
      if (input) input.value = v
    }
  }, [])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (inFlightRef.current) return
    setError(null)
    if (!formRef.current) return
    inFlightRef.current = true
    setPending(true)

    const fd = new FormData(formRef.current)

    const attribution: Record<string, string> = {}
    for (const [k, v] of fd.entries()) {
      if (typeof k === 'string' && k.startsWith('attr_') && typeof v === 'string') {
        attribution[k.replace('attr_', '')] = v
      }
    }

    // Walk every form value once. Known contact keys land in `contact`,
    // anything else from a custom form_fields entry rides along as `extra`
    // so we keep the canonical lead-pipeline shape backward-compatible.
    const contact: Record<string, string> = {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      state: '',
      zip: '',
    }
    const extra: Record<string, unknown> = {}
    for (const [k, v] of fd.entries()) {
      if (typeof k !== 'string' || k.startsWith('attr_')) continue
      const val = typeof v === 'string' ? v : ''
      if (CONTACT_KEYS.has(k)) {
        contact[k] = val
      } else {
        // Checkboxes that weren't checked won't appear in FormData; presence
        // here means it was checked.
        if (k in extra) {
          // Multiple values for the same name (e.g. checkbox group) — collect.
          const prev = extra[k]
          extra[k] = Array.isArray(prev) ? [...prev, val] : [prev, val]
        } else {
          extra[k] = val
        }
      }
    }

    const payload = {
      site_slug: site.slug,
      funnel_type: (block.funnel_type ?? 'contact-form') as 'contact-form',
      // `?? undefined` because an unset Payload text field is null, and the
      // route's schema takes strings. Belt and braces with the `.nullish()`
      // there: neither side can break the other again.
      funnel_id: block.funnel_id ?? undefined,
      funnel_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      client_submission_id: submissionIdRef.current,
      contact,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
      attribution,
      trustedform_cert_url: readTrustedFormCert() || undefined,
      jornaya_lead_id: readJornayaLeadId() || undefined,
    }

    const result = await submitLead(payload)
    if (!result.ok) {
      setError(result.error ?? 'Submission failed. Please try again.')
      // Re-armed so the visitor can try again — with the SAME key, which is what
      // makes the retry safe. The ref is not reset on success: that path
      // navigates away.
      inFlightRef.current = false
      setPending(false)
      return
    }

    // Client pixels fire with the server-issued event_id so Meta can dedupe
    // them against the CAPI event the pipeline already sent.
    firePixelEvents(result.event_id ?? '', site.name ?? site.slug)

    // Redirect to the success page.
    window.location.assign(block.success_slug ?? '/submitted')
  }

  return (
    <section
      id="quiz"
      style={{
        background: 'var(--site-bg)',
        padding: '64px 0',
      }}
    >
      <div className="mx-auto px-6" style={{ maxWidth: 760 }}>
        <div
          style={{
            background: 'var(--site-surface)',
            borderRadius: 16,
            boxShadow: 'var(--site-shadow-lg)',
            padding: 40,
            border: '1px solid var(--site-hairline)',
          }}
        >
          {block.eyebrow ? (
            <p
              style={{
                color: 'var(--site-primary)',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                margin: 0,
              }}
            >
              {block.eyebrow}
            </p>
          ) : null}
          {block.heading ? (
            <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--site-ink)', margin: '12px 0 0', lineHeight: 1.2 }}>
              {block.heading}
            </h2>
          ) : null}
          {block.sub ? (
            <p style={{ fontSize: 15, color: 'var(--site-ink-muted)', marginTop: 10, lineHeight: 1.55 }}>{block.sub}</p>
          ) : null}

          <form ref={formRef} onSubmit={onSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <FieldsRenderer fields={block.form_fields} />

            {/* Hidden attribution inputs — hydrated client-side after mount */}
            {[
              'utm_source',
              'utm_medium',
              'utm_campaign',
              'utm_term',
              'utm_content',
              'gclid',
              'fbclid',
              'ttclid',
              'referrer',
              'landing_path',
              'session_id',
              'fbc',
              'fbp',
            ].map((k) => (
              <input key={k} type="hidden" name={`attr_${k}`} defaultValue="" />
            ))}

            {block.consent_md ? (
              <p style={{ fontSize: 12, color: 'var(--site-ink-muted)', lineHeight: 1.5, marginTop: 4 }}>{block.consent_md}</p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              style={{
                marginTop: 8,
                background: 'var(--site-cta)',
                color: 'var(--site-cta-ink)',
                fontWeight: 800,
                fontSize: 15,
                padding: '16px 22px',
                borderRadius: 8,
                border: 'none',
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.7 : 1,
                transition: 'opacity 120ms',
              }}
            >
              {pending ? 'Submitting…' : (block.submit_label ?? 'See if I qualify')}
            </button>

            {error ? (
              <p style={{ color: 'var(--sys-danger)', fontSize: 13, marginTop: 4 }} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Input({ name, placeholder, type = 'text', required }: { name: string; placeholder: string; type?: string; required?: boolean }) {
  return (
    <input
      type={type}
      name={name}
      placeholder={placeholder}
      required={required}
      style={{
        width: '100%',
        background: 'var(--site-surface)',
        border: '1px solid var(--site-border)',
        borderRadius: 8,
        padding: '14px 16px',
        fontSize: 15,
        color: 'var(--site-ink)',
        outline: 'none',
      }}
    />
  )
}

// Default field set: matches the canonical lead pipeline contact{} shape.
// Used when the block doesn't override via form_fields[].
const DEFAULT_FIELDS: FormFieldDef[] = [
  { name: 'first_name', type: 'text', placeholder: 'First name', required: true, half_width: true },
  { name: 'last_name', type: 'text', placeholder: 'Last name', required: true, half_width: true },
  { name: 'email', type: 'email', placeholder: 'Email', required: true },
  { name: 'phone', type: 'tel', placeholder: 'Phone', required: true },
  { name: 'state', type: 'text', placeholder: 'State', half_width: true },
  { name: 'zip', type: 'text', placeholder: 'ZIP', half_width: true },
]

function FieldsRenderer({ fields }: { fields?: FormFieldDef[] | null }) {
  const list = Array.isArray(fields) && fields.length > 0 ? fields : DEFAULT_FIELDS
  // Pair consecutive half_width fields into rows.
  const rows: Array<{ kind: 'full' | 'pair'; items: FormFieldDef[] }> = []
  for (let i = 0; i < list.length; i++) {
    const f = list[i]
    if (f.half_width && list[i + 1]?.half_width) {
      rows.push({ kind: 'pair', items: [f, list[i + 1]!] })
      i++
    } else {
      rows.push({ kind: 'full', items: [f] })
    }
  }
  return (
    <>
      {rows.map((row, i) =>
        row.kind === 'pair' ? (
          <Row key={i}>
            {row.items.map((f) => (
              <FieldEl key={f.name} field={f} />
            ))}
          </Row>
        ) : (
          <FieldEl key={i} field={row.items[0]} />
        ),
      )}
    </>
  )
}

function FieldEl({ field }: { field: FormFieldDef }) {
  const t = field.type ?? 'text'
  if (t === 'hidden') {
    return <input type="hidden" name={field.name} defaultValue={field.value ?? ''} />
  }
  if (t === 'textarea') {
    return (
      <FieldWrap label={field.label}>
        <textarea
          name={field.name}
          required={!!field.required}
          placeholder={field.placeholder ?? ''}
          rows={4}
          style={{
            width: '100%',
            background: 'var(--site-surface)',
            border: '1px solid var(--site-border)',
            borderRadius: 8,
            padding: '14px 16px',
            fontSize: 15,
            color: 'var(--site-ink)',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </FieldWrap>
    )
  }
  if (t === 'select') {
    return (
      <FieldWrap label={field.label}>
        <select
          name={field.name}
          required={!!field.required}
          style={{
            width: '100%',
            background: 'var(--site-surface)',
            border: '1px solid var(--site-border)',
            borderRadius: 8,
            padding: '14px 16px',
            fontSize: 15,
            color: 'var(--site-ink)',
            outline: 'none',
          }}
          defaultValue=""
        >
          <option value="" disabled>
            {field.placeholder ?? 'Select…'}
          </option>
          {(field.options ?? []).map((opt, i) => (
            <option key={i} value={opt.value ?? ''}>
              {opt.label || opt.value || ''}
            </option>
          ))}
        </select>
      </FieldWrap>
    )
  }
  if (t === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--site-ink)', lineHeight: 1.45, padding: '4px 0' }}>
        <input type="checkbox" name={field.name} required={!!field.required} value="1" style={{ marginTop: 4 }} />
        <span>{field.label ?? field.placeholder ?? field.name}</span>
      </label>
    )
  }
  return (
    <FieldWrap label={field.label}>
      <Input name={field.name} type={t} placeholder={field.placeholder ?? ''} required={!!field.required} />
    </FieldWrap>
  )
}

function FieldWrap({ label, children }: { label?: string; children: React.ReactNode }) {
  if (!label) return <>{children}</>
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--site-ink-muted)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
