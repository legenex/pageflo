import { ShieldCheck } from 'lucide-react'
import { ComingSoon, Page, PageHeader } from '@/components/pageflo/primitives'

export const metadata = { title: 'Campaign Integrity' }

/**
 * Campaign Integrity is a product concept with no implementation.
 *
 * The route exists because the sidebar links to it. A navigation entry that
 * 404s is a worse answer than a page that says what the area will do and what
 * it is waiting on, and a disabled nav item tells the reader nothing at all.
 *
 * Nothing here claims a capability. The consent and certification machinery it
 * describes DOES exist in the lead pipeline today (TrustedForm claim, Jornaya
 * verification, HLR lookup, consent snapshot), which is why this page names
 * those honestly and is careful to say that the missing part is the review
 * surface, not the capture.
 */
export default function CampaignIntegrityPage() {
  return (
    <Page>
      <PageHeader
        title="Campaign Integrity"
        subtitle="Consent evidence, compliance review and traffic-quality signals in one place."
      />
      <ComingSoon
        icon={<ShieldCheck className="h-[22px] w-[22px]" aria-hidden="true" />}
        title="Campaign Integrity is not built yet"
        body="The evidence this area would review is already captured on every lead: the TrustedForm certificate claimed server-side at submission, the Jornaya token verification, the HLR line-status lookup, and a snapshot of the exact consent language the visitor was shown. Those run today and are visible on a lead's detail view. What does not exist is the surface that reviews them across a campaign."
        waitingFor="a defined review model. There is no code for it, no collection behind it, and no scoring rule anyone has agreed. Naming a launch date before that exists would be a guess."
      />
    </Page>
  )
}
