import { getPayload } from 'payload'
import config from '@payload-config'

const p = await getPayload({ config })

const site = await p.create({ collection: 'sites', data: { name: 'Probe', slug: 'probe-' + Date.now(), vertical: 'multi' } as never, overrideAccess: true })
const email = `probe-${Date.now()}@x.com`
await p.create({
  collection: 'users',
  data: { email, password: 'Passw0rd!23', name: 'Probe', super_admin: false, siteBindings: [{ site: site.id, role: 'admin' }] } as never,
  overrideAccess: true,
})

const login = await p.login({ collection: 'users', data: { email, password: 'Passw0rd!23' } })
const u = login.user as Record<string, unknown>
const bindings = u.siteBindings as Array<{ site: unknown }>
const first = bindings?.[0]?.site

console.log('--- what payload.login returns for siteBindings[0].site ---')
console.log('typeof :', typeof first)
console.log('value  :', JSON.stringify(first))
console.log('POPULATED OBJECT?', typeof first === 'object' && first !== null)

// Now the real question: does an access-scoped update by this user succeed?
try {
  await p.update({
    collection: 'sites',
    id: site.id,
    data: { status: 'active' } as never,
    user: login.user as never,
    overrideAccess: false,
  })
  console.log('RESULT: scoped update SUCCEEDED — setSiteStatus works for a site admin')
} catch (e) {
  console.log('RESULT: scoped update FAILED —', e instanceof Error ? e.message : String(e))
}
