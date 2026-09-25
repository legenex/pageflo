import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

import { readDelivery, type DeliveryEntry, type DeliveryReading } from './delivery-state'

export type LogInput = { step: string; ok: boolean; detail?: string; at?: string }

/**
 * Append to a Lead's `delivery_log` and persist the state it now reads as.
 *
 * ONE writer for the log. The array is replaced wholesale by Payload on every
 * update, so anything that wrote it from a stale copy would erase history: the
 * pipeline's final write used to do exactly that, dropping the queue entries a
 * retry needs. Each call reads the current log, appends, and writes back.
 *
 * `user` set: the write runs under that user's access (`overrideAccess: false`),
 * which is how an operator action is authorised. Unset: the pipeline itself,
 * which acts for no user.
 */
export const appendDeliveryLog = async (
  leadId: number | string,
  entries: LogInput[],
  opts: { user?: unknown; data?: Record<string, unknown>; payload?: Payload } = {},
): Promise<DeliveryReading> => {
  const payload = opts.payload ?? (await getPayload({ config }))
  const auth = opts.user ? { user: opts.user as never, overrideAccess: false } : { overrideAccess: true }
  const doc = (await payload.findByID({ collection: 'leads', id: leadId, depth: 0, ...auth })) as {
    delivery_log?: Array<DeliveryEntry & { id?: string }> | null
  }
  const prior = (doc.delivery_log ?? []).map(({ at, step, ok, detail }) => ({ at, step, ok, detail }))
  const now = new Date().toISOString()
  const next = [...prior, ...entries.map((e) => ({ at: e.at ?? now, step: e.step, ok: e.ok, detail: e.detail }))]
  const reading = readDelivery(next)
  await payload.update({
    collection: 'leads',
    id: leadId,
    data: { ...(opts.data ?? {}), delivery_log: next, delivery_state: reading.state } as never,
    ...auth,
  })
  return reading
}
