/**
 * W43: internal Leads UI is real records, not a Placeholder.
 *
 *   pnpm test:leads-ui
 */
import { readFileSync } from 'node:fs'

import { consentState, deliveryState } from '../src/app/(app)/admin/(top)/leads/model.ts'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else {
    fail++
    console.log('  FAIL ' + label)
  }
}

const page = readFileSync(new URL('../src/app/(app)/admin/(top)/leads/page.tsx', import.meta.url), 'utf8')
t(!page.includes('Placeholder'), 'the Leads page is not a Placeholder')
t(page.includes('delivery_log'), 'the list reads delivery_log from stored leads')
t(page.includes('trustedform_cert_url'), 'the list reads TrustedForm from stored leads')
t(page.includes('overrideAccess: false'), 'Leads reads are site-scoped through Payload access')

const modal = readFileSync(new URL('../src/app/(app)/admin/(top)/leads/LeadDetailModal.tsx', import.meta.url), 'utf8')
t(modal.includes("delivery: 'Delivery Log'"), 'lead detail has a delivery log tab')
t(modal.includes('Consent'), 'lead detail surfaces consent')
t(modal.includes('trustedform_cert_url'), 'lead detail shows the TrustedForm certificate URL')
t(modal.includes('jornaya_lead_id'), 'lead detail shows the Jornaya lead id')

t(deliveryState([]) === 'not-attempted', 'an empty log is not-attempted, not a fake pending')
t(deliveryState([{ step: 'webhook.dispatch', ok: true }]) === 'delivered', 'a successful webhook is delivered')
t(deliveryState([{ step: 'webhook.dispatch', ok: false }]) === 'failed', 'a failed webhook is failed')
t(consentState({ trustedform_cert_url: 'https://cert.trustedform.com/x' }).tone === 'pos', 'a TrustedForm URL is consent evidence')
t(consentState({}).tone !== 'pos', 'missing consent is not presented as captured')

const worker = readFileSync(new URL('../src/workers/lead-delivery.ts', import.meta.url), 'utf8')
t(worker.includes('deliverStoredLead'), 'the worker delivers a stored lead, it does not recapture one')

const boot = readFileSync(new URL('../src/instrumentation.ts', import.meta.url), 'utf8')
t(boot.includes('ensureLeadDeliveryWorker'), 'the Next node process starts the lead-delivery worker')
t(boot.includes("NEXT_RUNTIME !== 'nodejs'") || boot.includes("NEXT_RUNTIME === 'nodejs'"), 'the worker only starts on the Node runtime')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
