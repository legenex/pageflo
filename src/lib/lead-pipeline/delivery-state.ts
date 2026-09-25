/**
 * What a Lead's delivery actually is, derived from its append-only
 * `delivery_log`.
 *
 * The log is the record; the state is a reading of it. The same function runs
 * in the pipeline (to persist `leads.delivery_state` for filtering), in the
 * retry action (to decide eligibility) and in the console (to label it), so
 * they cannot disagree.
 *
 * WHAT IS AND IS NOT A DELIVERY. A "destination" is somewhere the lead itself
 * is sent for somebody to act on: a custom webhook (`webhook.*`) or a TrueCall
 * push (`truecall.push`). Conversion events (Meta CAPI, TikTok, GA4), the
 * TrustedForm claim, Jornaya and the Slack notice are integrations, not
 * delivery. `downstream.completed` therefore means "the pipeline finished its
 * pass", never "a buyer received the lead": with no destination configured the
 * honest state is `no-destination`.
 */

export type DeliveryEntry = { at?: string | null; step?: string | null; ok?: boolean | null; detail?: string | null }

export const DELIVERY_STEPS = {
  captured: 'lead.captured',
  queued: 'delivery.queued',
  queueUnavailable: 'delivery.queue_unavailable',
  processing: 'delivery.processing',
  retryRequested: 'delivery.retry_requested',
  error: 'delivery.error',
  failed: 'delivery.failed',
  completed: 'downstream.completed',
} as const

export type DeliveryState =
  | 'not-attempted'
  | 'captured'
  | 'queued'
  | 'processing'
  | 'retry-pending'
  | 'stalled'
  | 'delivered'
  | 'partial'
  | 'failed'
  | 'no-destination'

const MARKERS = new Set<string>(Object.values(DELIVERY_STEPS))

/** A lead the lifecycle has stopped moving. Past this it is not "in progress". */
export const STALL_AFTER_MS = 30 * 60 * 1000

export const isDestinationStep = (step: string | null | undefined): boolean =>
  typeof step === 'string' && (step.startsWith('webhook.') || step === 'truecall.push')

/** Steps that record a lifecycle transition rather than an integration outcome. */
export const isLifecycleStep = (step: string | null | undefined): boolean => typeof step === 'string' && MARKERS.has(step)

/** Latest outcome per destination step: a retry that succeeds supersedes its failure. */
export const destinationOutcomes = (log: DeliveryEntry[]): Map<string, boolean> => {
  const out = new Map<string, boolean>()
  for (const e of log) if (isDestinationStep(e.step)) out.set(String(e.step), e.ok === true)
  return out
}

/** Every step whose latest outcome is success. A retry never repeats these. */
export const settledSteps = (log: DeliveryEntry[]): Set<string> => {
  const latest = new Map<string, boolean>()
  for (const e of log) if (e.step && !isLifecycleStep(e.step)) latest.set(e.step, e.ok === true)
  return new Set([...latest].filter(([, ok]) => ok).map(([step]) => step))
}

export type DeliveryReading = {
  state: DeliveryState
  /** Destinations that received the lead / were attempted. */
  destinations: { total: number; delivered: number; failed: number }
  /** True when an operator retry is a sound action. */
  retryable: boolean
  retryCount: number
  /** The last lifecycle entry that decided the state. */
  since: string | null
}

export const readDelivery = (log: DeliveryEntry[] | null | undefined, now: number = Date.now()): DeliveryReading => {
  const entries = log ?? []
  const outcomes = destinationOutcomes(entries)
  const delivered = [...outcomes.values()].filter(Boolean).length
  const destinations = { total: outcomes.size, delivered, failed: outcomes.size - delivered }
  const retryCount = entries.filter((e) => e.step === DELIVERY_STEPS.retryRequested).length

  if (entries.length === 0) return { state: 'not-attempted', destinations, retryable: false, retryCount, since: null }

  let idx = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isLifecycleStep(entries[i].step)) { idx = i; break }
  }
  // Rows written before the lifecycle was logged carry integration steps only.
  // The pipeline of that time logged them all in one final write, so the pass
  // had finished: read the destination outcomes and nothing else into it.
  const marker = idx >= 0 ? entries[idx] : null
  const step = marker?.step ?? DELIVERY_STEPS.completed
  const since = marker?.at ?? null

  const finished = (): DeliveryState => {
    if (destinations.total === 0) return 'no-destination'
    if (destinations.failed === 0) return 'delivered'
    return destinations.delivered === 0 ? 'failed' : 'partial'
  }

  let state: DeliveryState
  switch (step) {
    case DELIVERY_STEPS.captured: state = 'captured'; break
    case DELIVERY_STEPS.queued: state = 'queued'; break
    case DELIVERY_STEPS.retryRequested:
    case DELIVERY_STEPS.error: state = 'retry-pending'; break
    case DELIVERY_STEPS.queueUnavailable:
    case DELIVERY_STEPS.processing: state = 'processing'; break
    case DELIVERY_STEPS.failed: state = 'failed'; break
    default: state = finished()
  }

  if (
    (state === 'queued' || state === 'processing' || state === 'retry-pending' || state === 'captured') &&
    since &&
    now - new Date(since).getTime() > STALL_AFTER_MS
  ) {
    state = 'stalled'
  }

  const retryable = state === 'failed' || state === 'partial' || state === 'stalled'
  return { state, destinations, retryable, retryCount, since }
}

/**
 * Has the pass this job was created for already finished? A redelivered queue
 * job must not send again; a retry the operator asked for AFTER the last
 * completion must run.
 */
export const passAlreadyCompleted = (log: DeliveryEntry[] | null | undefined): boolean => {
  const entries = log ?? []
  let lastStart = -1
  let lastDone = -1
  entries.forEach((e, i) => {
    if (e.step === DELIVERY_STEPS.queued || e.step === DELIVERY_STEPS.retryRequested) lastStart = i
    if (e.step === DELIVERY_STEPS.completed) lastDone = i
  })
  return lastDone >= 0 && lastDone > lastStart
}

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
  'not-attempted': 'No delivery record',
  captured: 'Captured',
  queued: 'Queued',
  processing: 'Processing',
  'retry-pending': 'Retry pending',
  stalled: 'Stalled',
  delivered: 'Delivered',
  partial: 'Partially delivered',
  failed: 'Failed',
  'no-destination': 'No destination configured',
}

export const DELIVERY_EXPLANATION: Record<DeliveryState, string> = {
  'not-attempted': 'This lead predates delivery logging, so nothing is known about its delivery.',
  captured: 'The lead is stored. Downstream delivery has not started.',
  queued: 'The lead is stored and waiting in the delivery queue.',
  processing: 'A delivery pass is running now.',
  'retry-pending': 'A retry is scheduled. It will run without repeating steps that already succeeded.',
  stalled: 'A delivery step began but nothing has been recorded for over 30 minutes. It can be retried.',
  delivered: 'Every configured destination received the lead.',
  partial: 'Some configured destinations received the lead and others failed.',
  failed: 'Delivery to a configured destination failed. It can be retried.',
  'no-destination':
    'The pipeline finished, but no buyer or webhook destination is configured for this Brand, so nothing was sent to an outside party.',
}

export const DELIVERY_TONE: Record<DeliveryState, 'pos' | 'neg' | 'warn' | 'info' | 'neutral'> = {
  'not-attempted': 'neutral',
  captured: 'info',
  queued: 'info',
  processing: 'info',
  'retry-pending': 'warn',
  stalled: 'warn',
  delivered: 'pos',
  partial: 'warn',
  failed: 'neg',
  'no-destination': 'neutral',
}
