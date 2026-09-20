// Pre-seeded Site definitions. Each Site has exactly ONE primary domain (matches the
// Sites list view). The seed prunes any extra domains attached to that Site on every run.

export type SeedSite = {
  slug: string
  name: string
  vertical: 'mass-tort' | 'mva' | 'workers-comp' | 'personal-injury' | 'medical-malpractice' | 'class-action' | 'multi'
  tagline: string
  default_phone: string
  default_phone_tel: string
  org_name: string
  support_email: string
  brand: {
    primary: string
    accent: string
    surface: string
    ink: string
  }
  primary_host: string
  primary_status: 'pending' | 'verified' | 'active'
  source_url: string
}

export const SEED_SITES: SeedSite[] = [
  {
    slug: 'check-a-case',
    name: 'Check A Case',
    vertical: 'mass-tort',
    tagline: 'See whether your situation may qualify.',
    default_phone: '(833) 555-0101',
    default_phone_tel: '+18335550101',
    org_name: 'Check A Case',
    support_email: 'support@checkacase.com',
    brand: { primary: '#0B1F3A', accent: '#E8B14B', surface: '#F7F5F0', ink: '#0E1116' },
    primary_host: 'checkacase.com',
    primary_status: 'pending',
    source_url: 'https://checkacase.com/',
  },
  {
    slug: 'dont-settle',
    name: "Don't Settle",
    vertical: 'mva',
    tagline: 'Do not take the first offer.',
    default_phone: '(833) 555-0404',
    default_phone_tel: '+18335550404',
    org_name: "Don't Settle",
    support_email: 'support@dontsettle.co',
    brand: { primary: '#C2703A', accent: '#1F3A5F', surface: '#FBF7F2', ink: '#1A140F' },
    primary_host: 'dontsettle.co',
    primary_status: 'pending',
    source_url: 'https://dontsettle.co/',
  },
  {
    slug: 'check-my-claim',
    name: 'Check My Claim',
    vertical: 'mva',
    tagline: 'Find out in two minutes if you may qualify.',
    default_phone: '(833) 555-0202',
    default_phone_tel: '+18335550202',
    org_name: 'Check My Claim',
    support_email: 'support@checkmyclaim.com',
    brand: { primary: '#0B1F3A', accent: '#1F9D55', surface: '#F7F5F0', ink: '#0E1116' },
    primary_host: 'checkmyclaim.com',
    primary_status: 'pending',
    source_url: 'https://checkmyclaim.com/',
  },
  {
    slug: 'claim-checker',
    name: 'Claim Checker',
    vertical: 'workers-comp',
    tagline: 'Quick claim check, real answers.',
    default_phone: '(833) 555-0303',
    default_phone_tel: '+18335550303',
    org_name: 'Claim Checker',
    support_email: 'support@claim-checker.co',
    brand: { primary: '#0B1F3A', accent: '#C03A2B', surface: '#F7F5F0', ink: '#0E1116' },
    primary_host: 'claim-checker.co',
    primary_status: 'active',
    source_url: 'https://claim-checker.co/',
  },
]

type PageTemplateKey =
  | 'home'
  | 'partners'
  | 'privacy'
  | 'privacy-policy'
  | 'terms'
  | 'submitted'
  | 'thanks-dq'
  | 'tcpa'
  | 'disclosures'

export const DEFAULT_LEGAL_PAGES: Array<{
  slug: string
  template_key: PageTemplateKey
  title: string
  uses_shared_template: boolean
}> = [
  { slug: '/', template_key: 'home', title: 'Home', uses_shared_template: false },
  { slug: '/partners', template_key: 'partners', title: 'Our Partners', uses_shared_template: true },
  { slug: '/privacy', template_key: 'privacy', title: 'Privacy Notice', uses_shared_template: true },
  { slug: '/privacy-policy', template_key: 'privacy-policy', title: 'Privacy Policy', uses_shared_template: true },
  { slug: '/terms-of-service', template_key: 'terms', title: 'Terms of Service', uses_shared_template: true },
  { slug: '/submitted', template_key: 'submitted', title: 'Thank you', uses_shared_template: true },
  { slug: '/thanks', template_key: 'thanks-dq', title: 'Thank you', uses_shared_template: true },
  { slug: '/tcpa', template_key: 'tcpa', title: 'TCPA Consent', uses_shared_template: true },
  { slug: '/disclosures', template_key: 'disclosures', title: 'Advertising Disclosures', uses_shared_template: true },
]
