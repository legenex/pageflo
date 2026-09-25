/**
 * Explicit lead consent: one contract shared by every public surface, the
 * capture route, the Lead row and the Leads console.
 *
 * PageFlo V1 default is affirmative consent: an UNCHECKED checkbox the visitor
 * must check, with the disclosure printed beside it. What is stored is the
 * evidence of that act, not a claim about its legal sufficiency: the exact
 * disclosure text the visitor saw, that they accepted it, when, and which
 * Brand / funnel / deployment collected it. The legal copy itself stays
 * Brand-configurable (`Site.legal.tcpa_text`).
 *
 * Pure and isomorphic: imported by the browser forms, the route and the console.
 */

/** The only consent method V1 records. Bumping it is a data-contract change. */
export const CONSENT_METHOD = 'checkbox_unchecked_default' as const

/** Upper bound on a stored disclosure. Long enough for a full TCPA paragraph. */
export const CONSENT_TEXT_MAX = 4000

/** What a browser sends: the act, and the exact words it was an act on. */
export type ConsentSubmission = {
  accepted: true
  /** Plain text of the disclosure as rendered beside the checkbox. */
  disclosure_text: string
  /** The visitor device's clock at the moment of the click. Informational. */
  client_accepted_at?: string
}

/** Where the consent was collected. Set by the SERVER, never trusted from a body. */
export type ConsentSource = {
  site_slug: string
  site_name: string
  host: string | null
  funnel_type: string
  funnel_id: string | null
  funnel_path: string | null
  /** The deployment for a quiz, the block's funnel id for a form. */
  deployment_id: string | null
}

/** The durable record on `leads.consent`. */
export type LeadConsentRecord = {
  accepted: true
  disclosure_text: string
  /** Server clock when the submission carrying the consent was received. */
  accepted_at: string
  client_accepted_at: string | null
  method: typeof CONSENT_METHOD
  source_site_slug: string
  source_site_name: string
  source_host: string | null
  source_funnel_type: string
  source_funnel_id: string | null
  source_funnel_path: string | null
  source_deployment_id: string | null
}

/** Strip control characters and cap the length. Never rewrites visible words. */
export const normaliseDisclosure = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CONSENT_TEXT_MAX)

/** A consent submission is valid only for a literal `true` and non-empty text. */
export const validConsentSubmission = (v: unknown): v is ConsentSubmission => {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return c.accepted === true && typeof c.disclosure_text === 'string' && normaliseDisclosure(c.disclosure_text).length > 0
}

export const buildConsentRecord = (
  submission: ConsentSubmission,
  source: ConsentSource,
  now: Date = new Date(),
): LeadConsentRecord => {
  const client = submission.client_accepted_at ? new Date(submission.client_accepted_at) : null
  return {
    accepted: true,
    disclosure_text: normaliseDisclosure(submission.disclosure_text),
    accepted_at: now.toISOString(),
    client_accepted_at: client && !Number.isNaN(client.getTime()) ? client.toISOString() : null,
    method: CONSENT_METHOD,
    source_site_slug: source.site_slug,
    source_site_name: source.site_name,
    source_host: source.host,
    source_funnel_type: source.funnel_type,
    source_funnel_id: source.funnel_id,
    source_funnel_path: source.funnel_path,
    source_deployment_id: source.deployment_id,
  }
}

/* ---- quiz transport ------------------------------------------------------- */

/**
 * The quiz state machine carries a flat string map. Consent rides through it
 * under reserved keys, which `extractQuizConsent` removes again before the
 * answers are stored, so consent is never left behind in `quiz_answers`.
 */
export const QUIZ_CONSENT_KEYS = {
  accepted: '__consent_accepted',
  text: '__consent_text',
  at: '__consent_at',
} as const

const RESERVED = new Set<string>(Object.values(QUIZ_CONSENT_KEYS))

export const extractQuizConsent = <V extends Record<string, unknown>>(
  values: V,
): { values: Record<string, unknown>; consent: ConsentSubmission | undefined } => {
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) if (!RESERVED.has(k)) rest[k] = v
  const accepted = values[QUIZ_CONSENT_KEYS.accepted] === 'yes'
  const text = values[QUIZ_CONSENT_KEYS.text]
  if (!accepted || typeof text !== 'string' || !normaliseDisclosure(text)) return { values: rest, consent: undefined }
  const at = values[QUIZ_CONSENT_KEYS.at]
  return {
    values: rest,
    consent: { accepted: true, disclosure_text: text, client_accepted_at: typeof at === 'string' ? at : undefined },
  }
}

/* ---- console read model --------------------------------------------------- */

/** A consent group as read back from the database: every column is nullable. */
export type StoredConsent = { [K in Exclude<keyof LeadConsentRecord, 'accepted' | 'method'>]?: LeadConsentRecord[K] | null } & {
  accepted?: boolean | null
  method?: string | null
}

export type ConsentView =
  | { recorded: true; label: string; record: StoredConsent }
  | { recorded: false; label: string; record: null }

/**
 * Read a lead's consent evidence. A lead without an affirmative record, every
 * row written before this existed included, is reported as not recorded. No
 * state here is ever inferred from a vendor certificate or backfilled.
 */
export const consentView = (raw: StoredConsent | null | undefined): ConsentView => {
  if (raw && raw.accepted === true && typeof raw.disclosure_text === 'string' && raw.disclosure_text.trim()) {
    return { recorded: true, label: 'Accepted', record: raw }
  }
  return { recorded: false, label: 'Not recorded', record: null }
}
