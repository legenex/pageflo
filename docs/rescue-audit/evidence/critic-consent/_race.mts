// Scratch-DB probe (local dev DB, never production). Proves or refutes three suspected defects.
import 'dotenv/config'
process.env.REDIS_URL = ''
import { getPayload } from 'payload'
import config from '../../../../src/payload.config.ts'
import { appendDeliveryLog } from '../../../../src/lib/lead-pipeline/log.ts'

const payload = await getPayload({ config })
const RUN = `crit_${Date.now().toString(36)}`
const made: Array<[string, number | string]> = []
const mk = async (collection: string, data: unknown) => { const d = await payload.create({ collection: collection as never, data: data as never, overrideAccess: true }); made.push([collection, d.id]); return d }
try {
  const site = await mk('sites', { name: `${RUN} a`, slug: RUN, status: 'active', vertical: 'mva', default_phone: '(800) 555-0100' })
  const siteB = await mk('sites', { name: `${RUN} b`, slug: `${RUN}-b`, status: 'active', vertical: 'mva', default_phone: '(800) 555-0100' })
  const lead = await mk('leads', { site: site.id, source_entity_type: 'quiz', status: 'new', contact: { email: `${RUN}@x.test` },
    consent: { accepted: true, disclosure_text: 'REAL', method: 'checkbox_unchecked_default' },
    delivery_log: [{ at: new Date().toISOString(), step: 'lead.captured', ok: true }] })

  // 1. lost update: two concurrent appends
  let lost = 0
  for (let i = 0; i < 8; i++) {
    const before = ((await payload.findByID({ collection: 'leads', id: lead.id, overrideAccess: true, depth: 0 })) as any).delivery_log.length
    await Promise.all([
      appendDeliveryLog(lead.id, [{ step: 'delivery.retry_requested', ok: true, detail: `A${i}` }]),
      appendDeliveryLog(lead.id, [{ step: 'delivery.processing', ok: true, detail: `B${i}` }]),
    ])
    const after = ((await payload.findByID({ collection: 'leads', id: lead.id, overrideAccess: true, depth: 0 })) as any).delivery_log.length
    if (after - before < 2) lost++
  }
  console.log(`LOST-UPDATE rounds with a dropped entry: ${lost} of 8`)

  // 2. an EDITOR of the lead's own Brand can rewrite consent and erase the log through the collection API
  const mkUser = async (n: string, sid: number | string, role: string) => {
    const u = await mk('users', { email: `${RUN}-${n}@example.test`, password: `pw-${RUN}-${n}`, name: n, status: 'active', siteBindings: [{ site: sid, role }] })
    return payload.findByID({ collection: 'users', id: u.id, depth: 2, overrideAccess: true })
  }
  const editor = await mkUser('editor', site.id, 'editor')
  const strangerB = await mkUser('strangerB', siteB.id, 'admin')
  try {
    await payload.update({ collection: 'leads', id: lead.id, user: editor as never, overrideAccess: false, data: { consent: { accepted: true, disclosure_text: 'FORGED BY EDITOR' }, delivery_log: [], delivery_state: 'delivered', status_history: [] } as never })
    const d = (await payload.findByID({ collection: 'leads', id: lead.id, overrideAccess: true, depth: 0 })) as any
    console.log(`EDITOR-FORGERY: consent.disclosure_text=${JSON.stringify(d.consent.disclosure_text)} log_len=${d.delivery_log.length} state=${d.delivery_state}`)
  } catch (e) { console.log('EDITOR-FORGERY refused:', (e as Error).message) }

  // 3. tenancy: a user of Brand B cannot read or write Brand A's lead
  for (const op of ['read', 'write'] as const) {
    try {
      if (op === 'read') await payload.findByID({ collection: 'leads', id: lead.id, user: strangerB as never, overrideAccess: false, depth: 0 })
      else await payload.update({ collection: 'leads', id: lead.id, user: strangerB as never, overrideAccess: false, data: { status: 'contacted' } as never })
      console.log(`TENANCY ${op}: ALLOWED (LEAK)`)
    } catch (e) { console.log(`TENANCY ${op}: refused (${(e as Error).message.slice(0, 50)})`) }
  }
} finally {
  for (const [c, id] of made.reverse()) await payload.delete({ collection: c as never, id, overrideAccess: true }).catch(() => null)
  process.exit(0)
}
