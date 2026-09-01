/**
 * Legal publication facts.
 *
 * A privacy policy and a terms of service make binding statements about a real
 * legal entity: who it is, where it is registered, who to contact, which law
 * governs, how long data is kept, and who processes it. None of those facts is
 * derivable from this repository, and inventing any of them would publish a
 * false representation under the operating company's name.
 *
 * So they are configuration, and the pages that need them do not publish until
 * the configuration exists. `legalPagesPublishable()` gates:
 *
 *   - the /privacy route (404 until configured)
 *   - the /terms route (404 until configured)
 *   - the marketing footer links to both
 *   - their sitemap entries
 *
 * This is deliberately fail-closed. A missing fact yields no page rather than a
 * page with a gap in it. Supplying these values is the single legal-content
 * human gate recorded in docs/HUMAN-GATES.md.
 */

export type LegalFacts = {
  /** Registered legal name of the operating business. */
  entity: string
  /** Registered address, single line or newline separated. */
  address: string
  /** Data-protection contact address. */
  privacyContact: string
  /** Governing law and jurisdiction, e.g. 'England and Wales'. */
  jurisdiction: string
  /** Named subprocessors and their purpose, one per line as "Name — purpose". */
  subprocessors: string[]
  /** Retention statement per data category, one per line as "Category — period". */
  retention: string[]
  /** ISO date the policy last changed. */
  lastUpdated: string
}

const list = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Read the configured facts, or null when any mandatory one is missing.
 *
 * Every field below is mandatory because a policy missing any of them is not
 * publishable. Returning null rather than a partial object means no caller can
 * accidentally render half a policy.
 */
export const legalFacts = (): LegalFacts | null => {
  const entity = (process.env.PAGEFLO_LEGAL_ENTITY ?? '').trim()
  const address = (process.env.PAGEFLO_LEGAL_ADDRESS ?? '').trim()
  const privacyContact = (process.env.PAGEFLO_PRIVACY_CONTACT ?? '').trim()
  const jurisdiction = (process.env.PAGEFLO_LEGAL_JURISDICTION ?? '').trim()
  const subprocessors = list(process.env.PAGEFLO_SUBPROCESSORS)
  const retention = list(process.env.PAGEFLO_DATA_RETENTION)
  const lastUpdated = (process.env.PAGEFLO_LEGAL_LAST_UPDATED ?? '').trim()

  if (
    !entity ||
    !address ||
    !privacyContact ||
    !jurisdiction ||
    subprocessors.length === 0 ||
    retention.length === 0 ||
    !lastUpdated
  ) {
    return null
  }

  return { entity, address, privacyContact, jurisdiction, subprocessors, retention, lastUpdated }
}

/** True when every mandatory legal fact is configured. */
export const legalPagesPublishable = (): boolean => legalFacts() !== null

/**
 * The facts that are still missing, for the operator-facing readiness check on
 * /admin/system. Never rendered to a public visitor.
 */
export const missingLegalFacts = (): string[] => {
  const missing: string[] = []
  if (!(process.env.PAGEFLO_LEGAL_ENTITY ?? '').trim()) missing.push('PAGEFLO_LEGAL_ENTITY')
  if (!(process.env.PAGEFLO_LEGAL_ADDRESS ?? '').trim()) missing.push('PAGEFLO_LEGAL_ADDRESS')
  if (!(process.env.PAGEFLO_PRIVACY_CONTACT ?? '').trim()) missing.push('PAGEFLO_PRIVACY_CONTACT')
  if (!(process.env.PAGEFLO_LEGAL_JURISDICTION ?? '').trim()) missing.push('PAGEFLO_LEGAL_JURISDICTION')
  if (list(process.env.PAGEFLO_SUBPROCESSORS).length === 0) missing.push('PAGEFLO_SUBPROCESSORS')
  if (list(process.env.PAGEFLO_DATA_RETENTION).length === 0) missing.push('PAGEFLO_DATA_RETENTION')
  if (!(process.env.PAGEFLO_LEGAL_LAST_UPDATED ?? '').trim()) missing.push('PAGEFLO_LEGAL_LAST_UPDATED')
  return missing
}
