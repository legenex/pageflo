// Single source of truth for the DNS records we tell a tenant to create for a
// custom domain. We surface exactly ONE record — the one that routes traffic to
// LegalOS — because that same record also proves ownership (dns-check accepts
// A / CNAME), so there is nothing else to add:
//   - apex / root domain (dont-settle.co):  an A record. Apex domains CANNOT
//     hold a CNAME (the zone apex carries the SOA/NS — RFC 1034), so we never
//     instruct one there.
//   - subdomain (lp.checkmyclaim.co):        a CNAME.
//
// We deliberately do NOT surface the `_legalos.<host>` TXT record. It's only an
// ownership fallback; verification still accepts it server-side if one happens
// to exist, but for this direct-A/CNAME model it's noise, so we don't ask for it.
//
// Records are recomputed on read (see brands/domains/page.tsx) so existing rows
// reflect the current logic without a backfill.

import { PRODUCT_NAME } from './pageflo/product'
import { env } from '@/lib/pageflo/env'

export type DnsRecord = {
  type: 'A' | 'CNAME' | 'TXT'
  name: string
  value: string
  required: boolean
  note?: string
}

// A focused set of two-level public suffixes so we can tell an apex domain
// (example.co.uk) from a subdomain (app.example.co.uk) — not the full PSL, but
// enough to be correct for realistic customer domains. A plain ccTLD like `.co`
// (dont-settle.co) is handled by the label-count default below.
const MULTI_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.za', 'org.za', 'net.za', 'web.za',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.mx', 'com.ar', 'com.co', 'net.co', 'nom.co',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'co.jp', 'or.jp', 'ne.jp', 'go.jp',
  'com.sg', 'com.my', 'com.ph', 'com.hk', 'com.tw', 'com.tr', 'com.ua', 'com.pl',
  'co.il', 'co.kr', 'co.id', 'co.th',
])

/** True when `host` is a registrable root/apex domain (cannot hold a CNAME). */
export const isApexDomain = (host: string): boolean => {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean)
  if (labels.length <= 2) return true // example.com, dont-settle.co
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo)) return labels.length === 3 // example.co.uk
  return false // app.example.com, lp.checkmyclaim.co
}

/**
 * The single DNS record to display for a custom domain, correct for apex vs
 * subdomain. That one record both routes traffic AND verifies ownership.
 */
export const buildDnsRecords = (host: string): DnsRecord[] => {
  const cnameTarget = env('cnameTarget') || 'cname.legenex.com'
  const aTarget = env('aTarget') || null

  if (isApexDomain(host)) {
    if (aTarget) {
      return [
        {
          type: 'A',
          name: host,
          value: aTarget,
          required: true,
          note: `Points your root domain at ${PRODUCT_NAME}. Serves the site AND verifies ownership. Apex domains use an A record, not a CNAME.`,
        },
      ]
    }
    // No A target configured: apex can't use a plain CNAME, so the tenant needs
    // an ALIAS/ANAME record (CNAME flattening) at their provider.
    return [
      {
        type: 'CNAME',
        name: host,
        value: cnameTarget,
        required: true,
        note: 'Apex domains cannot use a plain CNAME — use your provider\'s ALIAS/ANAME (CNAME flattening).',
      },
    ]
  }

  // Subdomain: a CNAME is correct and sufficient.
  return [
    {
      type: 'CNAME',
      name: host,
      value: cnameTarget,
      required: true,
      note: `Points this subdomain at ${PRODUCT_NAME}. Serves the site AND verifies ownership.`,
    },
  ]
}
