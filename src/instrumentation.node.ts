/**
 * Node-only boot. Kept out of `instrumentation.ts` so the Edge compile of
 * that file cannot pull BullMQ, ioredis, or Payload into a bundle that has
 * no `crypto` / `fs`.
 */
export async function registerNodeInstrumentation(): Promise<void> {
  const { ensureLeadDeliveryWorker } = await import('@/workers/lead-delivery')
  ensureLeadDeliveryWorker()
}
