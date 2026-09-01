import type { LegalFacts } from '@/lib/pageflo/legal'
import { LegalPage, type LegalSection } from './LegalPage'

/**
 * The PageFlo privacy policy.
 *
 * The descriptive sections below state what the platform actually does, and
 * every one of them is verifiable against this repository: the collections that
 * store operator accounts and leads, the audit log, the write-only integration
 * secrets, the consent and validation records attached to a lead, and the
 * delivery log. Nothing describes a capability the code does not have.
 *
 * The facts that are NOT derivable from code (entity, address, contact,
 * jurisdiction, retention periods, subprocessors) arrive as `facts` and are
 * rendered verbatim. This component is unreachable until they are configured.
 */
const sections = (facts: LegalFacts): LegalSection[] => [
  {
    id: 'introduction',
    title: 'Introduction',
    paras: [
      'This policy explains what information PageFlo collects when you visit the PageFlo website, when you use the PageFlo application, and what happens to information submitted through experiences that PageFlo customers publish.',
      'PageFlo is used by businesses to build and publish acquisition sites, landing pages, advertorials and qualification flows. Where a customer publishes an experience with PageFlo, that customer decides what is collected and why, and is the controller of that information. PageFlo processes it on their instructions.',
    ],
  },
  {
    id: 'information-collected',
    title: 'Information we collect',
    paras: ['The categories below describe everything the platform is designed to collect. Not every category applies to every visitor or customer.'],
    items: [
      'Account information for operators who sign in to the application.',
      'Usage and device information generated while using the application.',
      'Content and configuration a customer submits, including pages, flows, brand settings and domains.',
      'Lead and form data submitted by end users through published experiences.',
      'Consent and validation records attached to submitted leads.',
    ],
  },
  {
    id: 'account-information',
    title: 'Account information',
    paras: [
      'When an operator account is created we store the name and email address used to sign in, the role and brand permissions assigned to that account, and a record of administrative actions taken in the application. Passwords are stored only in hashed form.',
    ],
  },
  {
    id: 'usage-information',
    title: 'Usage and device information',
    paras: [
      'When the application is used we process standard technical information such as IP address, browser and device characteristics, pages viewed inside the application, and timestamps. This supports security, abuse prevention, debugging and audit logging.',
    ],
  },
  {
    id: 'customer-data',
    title: 'Customer-submitted data',
    paras: [
      'Customers store product configuration in PageFlo: sites, pages, flows, quiz structures, brand identities, domains, phone numbers, integration settings and publication history. Secrets supplied for integrations are stored write-only and are never displayed back in the interface.',
    ],
  },
  {
    id: 'lead-data',
    title: 'Lead and form data',
    paras: [
      'When an end user completes a published form or flow, the submission is stored as a lead. Depending on how the customer configured the experience this can include name, email address, telephone number, state or postcode, answers given during the flow, the acquisition path that led to the submission, and campaign parameters attached to that visit.',
      'Leads also carry the operational record of what happened to them: consent capture, phone validation results, conversion event delivery and the outcome of each delivery attempt to the destination the customer configured.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies and similar technologies',
    paras: [
      'The application uses cookies that are necessary for authentication and session security. Published customer experiences may set additional cookies or identifiers, including analytics and advertising identifiers, according to the tracking configuration the customer has enabled for that site.',
    ],
  },
  {
    id: 'how-used',
    title: 'How information is used',
    paras: [
      'Information is used to operate and secure the platform, to authenticate operators, to provide the builders and publishing pipeline, to deliver leads and conversion events to the destinations a customer configures, to maintain audit and delivery records, and to support and improve the service.',
    ],
  },
  {
    id: 'service-providers',
    title: 'Service providers',
    paras: [
      'PageFlo relies on infrastructure and service providers to host the platform, provision domains and certificates, validate telephone numbers, capture consent certificates and deliver conversion events. These providers process information only as needed to perform those functions.',
    ],
    items: facts.subprocessors,
  },
  {
    id: 'sharing',
    title: 'Data sharing',
    paras: [
      'Lead data is delivered to the destinations a customer configures, which may include the customer’s own systems and third parties that receive that lead. PageFlo does not sell operator account information. Information may be disclosed where required by law or to protect the rights and safety of users and the platform.',
    ],
  },
  {
    id: 'retention',
    title: 'Data retention',
    paras: ['Information is retained for the periods below, or for longer where a legal obligation requires it.'],
    items: facts.retention,
  },
  {
    id: 'security',
    title: 'Security',
    paras: [
      'Access to the application requires authentication and is scoped by role and by brand. Administrative actions are written to an audit log. Integration secrets are stored write-only. No system can be guaranteed to be perfectly secure, and no representation of absolute security is made here.',
    ],
  },
  {
    id: 'international',
    title: 'International processing',
    paras: [
      `Information may be processed in a country other than the one in which it was collected, including where infrastructure or service providers operate outside that country. Processing is governed by the law of ${facts.jurisdiction}.`,
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    paras: [
      'Depending on where you live you may have the right to request access to your personal information, to have it corrected or deleted, to object to or restrict certain processing, and to withdraw consent you previously gave.',
      `If you submitted information through an experience published by a PageFlo customer, that customer is the appropriate first point of contact for such a request. PageFlo will assist its customers in responding. Requests can also be sent to ${facts.privacyContact}.`,
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paras: [
      'The platform is not directed at children and is not intended to be used to collect information from children. Where a customer configures an experience aimed at an audience that includes minors, that customer is responsible for the lawfulness of that collection.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paras: [
      'This policy may be updated as the product changes. Material changes will be reflected in the last updated date at the top of this page.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paras: [
      `Questions about this policy or about information held by PageFlo can be sent to ${facts.privacyContact}, or by post to ${facts.entity} at the address above.`,
    ],
  },
]

export function PrivacyPolicy({ facts, appUrl }: { facts: LegalFacts; appUrl: string }) {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy covers the PageFlo website, the PageFlo application, and information submitted through experiences published by PageFlo customers."
      sections={sections(facts)}
      facts={facts}
      appUrl={appUrl}
    />
  )
}
