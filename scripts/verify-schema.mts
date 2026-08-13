/**
 * Does the database match the code? Read-only, and safe on production.
 *
 *   pnpm verify:schema
 *
 * The step between "migrations applied" and "start serving". `scripts/release.sh`
 * runs it there and refuses to start the service if it fails, because the
 * failure mode is a process that throws at boot rather than a page that looks
 * wrong — and the previous release found that out by starting first.
 *
 * Exit 0 clean, exit 1 on any mismatch, exit 2 if it could not connect at all.
 * Nothing is written. See `src/lib/schema-verify.ts` for why a READ is the right
 * instrument.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { verifySchema, formatVerification } from '../src/lib/schema-verify.ts'

let payload
try {
  payload = await getPayload({ config })
} catch (err) {
  console.error(`could not open the database: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
}

const result = await verifySchema(payload)
console.log(formatVerification(result))
process.exit(result.ok ? 0 : 1)
