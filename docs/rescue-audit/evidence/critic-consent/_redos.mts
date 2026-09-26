import { disclosureMatchesBrand } from '../../../../src/lib/lead-consent.ts'
const brand = 'A {{a}} B {{b}} C {{c}} D {{d}} E {{e}} F'
const sub = ('A x B x C x D x E x ' ).repeat(200)
const t0 = Date.now(); const r = disclosureMatchesBrand(sub, brand); console.log('redos ms', Date.now() - t0, r)
