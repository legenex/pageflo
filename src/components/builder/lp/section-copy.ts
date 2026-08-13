// @ts-nocheck -- ported artifact data (loose param types); checked via pnpm typecheck, not at build.
// Server-safe (no React / no 'use client'): the landing-page section default
// copy + helpers. Shared by the client renderer (render.tsx) and the Node seed
// script so there is a single source of truth for sample content.

export const genId = (p: string): string => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const SEED_SECTION_COPY: Record<string, Record<string, unknown>> = {
  header: { logoText: '{{brand.logoText}}', ctaLabel: 'Call {{brand.callNumber}}' },
  hero: {
    eyebrow: 'Free case review',
    headline: 'Hurt in a car crash? You may be owed more than the insurance company is offering.',
    accent_phrase: 'more than the insurance company is offering',
    subheadline: 'Take our 60-second case check. We will tell you if your case has real value, and connect you with a vetted attorney in your state at no cost.',
    stat1_num: '$50M+', stat1_label: 'Recovered for clients',
    stat2_num: '24/7', stat2_label: 'Case review',
    stat3_num: '$0', stat3_label: 'Out of pocket',
    trust_line: 'No fees unless we recover for you. As seen in major US media.',
  },
  ticker: {
    eyebrow: 'Recent recoveries',
    items: [
      { location: 'Rear-end crash, TX', amount: '$385,000' },
      { location: 'T-bone collision, FL', amount: '$1,200,000' },
      { location: 'Truck accident, GA', amount: '$2,400,000' },
      { location: 'Rideshare crash, CA', amount: '$580,000' },
      { location: 'Hit and run, NY', amount: '$215,000' },
    ],
  },
  authority: {
    eyebrow: 'Trusted by 50,000+ accident victims',
    headline: 'A nationwide network of vetted personal injury attorneys.',
    subhead: 'We do not represent you directly. We connect you with the right attorney for your case, in your state, at no cost to you.',
    badges: ['BBB A+ Rated', 'AVVO 10.0', 'Super Lawyers', 'NAOPIA Member', '50 States'],
  },
  story: {
    eyebrow: 'Why this matters',
    headline: 'Insurance companies are not on your side.',
    paragraphs: [
      'After a serious car crash, the at-fault driver’s insurance company will reach out fast. They sound friendly. They are not.',
      'Their job is to settle your case for as little as possible, before you fully understand your injuries and before you have a lawyer in your corner.',
      'We have helped tens of thousands of accident victims push back, get fair settlements, and stop being lowballed.',
    ],
  },
  eligibility: {
    eyebrow: 'You may qualify if',
    headline: 'See if your case qualifies for review.',
    criteria: [
      'The accident happened in the last 2 years',
      'You were injured, even if injuries appeared later',
      'You sought medical care after the crash',
      'You were not 100% at fault',
      'You do not yet have a lawyer',
    ],
  },
  how_it_works: {
    eyebrow: 'How it works',
    headline: 'Three steps. About 60 seconds.',
    steps: [
      { title: '1. Tell us about your accident', desc: 'Quick questions about what happened, when, and where.' },
      { title: '2. We match you with an attorney', desc: 'Based on your state and case type. Vetted, local, experienced.' },
      { title: '3. Free case review, no obligation', desc: 'The attorney reviews. If you have a case, they take it on with no upfront cost.' },
    ],
  },
  settlements: {
    eyebrow: 'Recent results',
    headline: 'Past settlements our network has secured.',
    items: [
      { case_type: 'Commercial truck collision', amount: '$2.4M', location: 'Atlanta, GA' },
      { case_type: 'Highway rear-end pile-up', amount: '$1.2M', location: 'Miami, FL' },
      { case_type: 'Drunk driver T-bone', amount: '$875K', location: 'Phoenix, AZ' },
      { case_type: 'Rideshare passenger injury', amount: '$580K', location: 'Los Angeles, CA' },
    ],
  },
  testimonials: {
    eyebrow: 'What clients say',
    headline: 'Real stories from real people we have helped.',
    items: [
      { quote: 'I had no idea I had a real case. They walked me through everything and got me a settlement that actually covered my medical bills.', author: 'Jennifer M.', location: 'Houston, TX' },
      { quote: 'The insurance company offered me $4,500. The attorney they matched me with got me $186,000. Night and day.', author: 'Marcus T.', location: 'Tampa, FL' },
      { quote: 'I thought it would be complicated. The whole thing took 60 seconds and they called me back the same day.', author: 'Linda S.', location: 'Denver, CO' },
    ],
  },
  guarantee: {
    headline: 'No win. No fee. No risk.',
    subhead: 'Our network attorneys work on contingency. That means:',
    lines: [
      'Zero upfront cost. You pay nothing to start.',
      'No fees unless you receive a settlement.',
      'No hidden charges. Ever.',
      'Free, confidential case review with no obligation.',
    ],
  },
  faq: {
    eyebrow: 'Common questions',
    headline: 'Frequently asked questions.',
    items: [
      { q: 'How long do I have to file a claim?', a: 'Each state has its own statute of limitations, but most allow 1 to 3 years from the date of the accident. The sooner you start, the better.' },
      { q: 'What if the accident was partly my fault?', a: 'You can still qualify in most states. Comparative fault rules allow recovery even if you share some responsibility.' },
      { q: 'How much does it cost?', a: 'Nothing. Our network attorneys work on contingency. If they don’t recover anything for you, you owe nothing.' },
      { q: 'What if I already talked to the insurance company?', a: 'You can still pursue a claim. Do not sign anything until you have spoken with an attorney.' },
    ],
  },
  final_cta: {
    headline: 'Find out what your accident may be worth.',
    cta_label: 'Start free case check',
    secondary_line: 'Or call {{brand.callNumber}} · Available 24/7',
  },
  footer: {
    tagline: '{{brand.logoText}} · A nationwide injury claim referral service',
    links: ['Privacy Policy', 'Terms of Service', 'Do Not Sell My Info', 'TCPA Disclosure', 'Contact'],
    tcpa_text: 'By submitting your information you agree to be contacted by phone, email, or text by participating attorneys and partner law firms for the purpose of evaluating your case. Message and data rates may apply. {{brand.disclaimer}}',
  },
}

export const DEFAULT_SECTION_ORDER = [
  'header', 'hero', 'ticker', 'authority', 'story', 'eligibility',
  'how_it_works', 'settlements', 'testimonials', 'guarantee', 'faq',
  'final_cta', 'footer',
]

export const buildSeedSections = () =>
  DEFAULT_SECTION_ORDER.map((type) => ({
    id: genId('sec'),
    type,
    isVisible: true,
    copy: JSON.parse(JSON.stringify(SEED_SECTION_COPY[type] || {})),
  }))

// The artifact's sample landing pages (buildSeedLandingPages). Sections are
// generated fresh per page at seed time.
//
// The three template ids carried over from the artifact — `bold_modern`,
// `classic_authority`, `editorial_investigation` — named NO template in this
// codebase. The old resolver answered all three with the first template in the
// list, so every seeded sample was the same page under three names and nothing
// said so. They are now three real, distinct templates chosen to match each
// sample's angle; `scripts/test-template-registry.mts` asserts they resolve, so
// a seed cannot go back to naming a template that does not exist.
export const SAMPLE_LANDING_PAGES = [
  { name: 'MVA Pain First', slug: 'mva-pain-first', template_id: 'human_recovery_story', angle: 'pain', is_published: true },
  { name: 'Authority Build', slug: 'authority-build', template_id: 'authority_network', angle: 'authority', is_published: false },
  { name: 'Editorial Test', slug: 'editorial-test', template_id: 'editorial_investigation_v2', angle: 'community', is_published: false },
]

// The artifact's sample deployments (buildSeedLPDeployments), mapped to whichever
// brand sites exist (by index) so references are always valid.
export const SAMPLE_LP_DEPLOYMENTS = [
  { name: 'MVA Pain First · CMC', lpSlug: 'mva-pain-first', siteIndex: 0, path: '/c/pain', status: 'live' },
  { name: 'Authority Build · CAC', lpSlug: 'authority-build', siteIndex: 1, path: '/truck', status: 'draft' },
]
