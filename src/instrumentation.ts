/**
 * Node-server boot hooks.
 *
 * The lead-delivery BullMQ worker has to run in the same long-lived process as
 * `legalos-dev.service` (`pnpm start`). A second systemd unit would be a new
 * production service. Starting the worker here means persist-then-queue has a
 * consumer without a second host-side unit.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./instrumentation.node')
    await registerNodeInstrumentation()
  }
}
