// @ts-nocheck -- ported artifact data (loose param types); checked via pnpm typecheck, not at build.
// Server-safe (no React / no 'use client'): quiz seed data + pure logic helpers,
// ported verbatim from the artifact. Imported by the builder UI, the preview,
// the server actions, and the seed script.

export const genId = (p: string): string => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function defaultLeadFormFields() {
  return [
    { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'First Name', required: true },
    { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Last Name', required: true },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'Email Address', required: true },
    { key: 'mobile', label: 'Cell Number', type: 'tel', placeholder: 'Cell Number', required: true },
    { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: '5 Digit Zip', required: true },
  ]
}

export const VISIBLE_BY_DEFAULT: Record<string, boolean> = {
  question: true, form: true, transition: true, endpoint: true, custom: true,
  webhook: false, decision: false, verification: false,
}

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([v, l]) => ({ value: v, label: l }))

export const INJURY_OPTIONS = [
  { value: 'fatality', label: 'Fatality / Wrongful Death' },
  { value: 'spinal', label: 'Spinal Cord Injury / Paralysis' },
  { value: 'brain', label: 'Brain Injury / Memory Loss' },
  { value: 'amputation', label: 'Loss of Limb / Amputations' },
  { value: 'fractures', label: 'Fractures / Broken Bones' },
  { value: 'back_neck', label: 'Back / Neck / Shoulder Injury' },
  { value: 'cuts', label: 'Cuts / Bruises / Lacerations / Burns' },
  { value: 'whiplash', label: 'Whiplash' },
  { value: 'concussion', label: 'Headaches / Concussion' },
  { value: 'other', label: 'Other' },
  { value: 'none', label: 'No Injury', isDQ: true },
]

export const SEED_CUSTOM_FIELDS = [
  { id: 'cf_accident_type', key: 'accident_type', label: 'Accident Type', type: 'text', options: [] },
  { id: 'cf_accident_state', key: 'accident_state', label: 'Accident State', type: 'dropdown', options: US_STATES },
  { id: 'cf_incident_date', key: 'incident_date', label: 'Incident Date', type: 'smart_date', options: [] },
  { id: 'cf_tier', key: 'tier', label: 'Qualification Tier', type: 'text', options: [] },
  { id: 'cf_dq_lead', key: 'dq_lead', label: 'DQ Status', type: 'text', options: [] },
  { id: 'cf_accident_details', key: 'accident_details', label: 'Accident Details', type: 'textarea', options: [] },
  { id: 'cf_fault', key: 'fault', label: 'At Fault', type: 'text', options: [] },
  { id: 'cf_fault_type', key: 'fault_type', label: 'Fault Type', type: 'text', options: [] },
  { id: 'cf_attorney', key: 'attorney', label: 'Has Attorney', type: 'text', options: [] },
  { id: 'cf_injury_type', key: 'injury_type', label: 'Injury Type', type: 'dropdown', options: INJURY_OPTIONS },
  { id: 'cf_treatment_type', key: 'treatment_type', label: 'Treatment Type', type: 'text', options: [] },
  { id: 'cf_treatment_time', key: 'treatment_time', label: 'Treatment Time', type: 'dropdown', options: [
    { value: 'still_treating', label: 'I Am Still Having Treatment' },
    { value: '7_days', label: 'Within 7 Days After The Accident' },
    { value: '14_days', label: 'Within 14 Days After The Accident' },
    { value: '30_days', label: 'Within 30 Days After The Accident' },
    { value: '60_days', label: 'Within 60 Days After The Accident' },
    { value: 'over_60', label: 'More Than 60 Days After The Accident' },
    { value: 'never', label: 'Never', isDQ: true },
  ] },
  { id: 'cf_insurance', key: 'insurance', label: 'Insurance Status', type: 'text', options: [] },
  { id: 'cf_phone_valid', key: 'phone_valid', label: 'Phone Valid (HLR)', type: 'text', options: [] },
  { id: 'cf_carrier', key: 'carrier', label: 'Mobile Carrier', type: 'text', options: [] },
  { id: 'cf_first_name', key: 'first_name', label: 'First Name', type: 'text', options: [] },
  { id: 'cf_last_name', key: 'last_name', label: 'Last Name', type: 'text', options: [] },
  { id: 'cf_email', key: 'email', label: 'Email', type: 'email', options: [] },
  { id: 'cf_mobile', key: 'mobile', label: 'Mobile', type: 'tel', options: [] },
  { id: 'cf_zip', key: 'zip', label: 'ZIP', type: 'text', options: [] },
]

export const tierIsShared = (n: any) => !n.tiers || n.tiers.length === 0
export const nodesForStep = (q: any, k: any) => q.nodes.filter((n: any) => n.stepKey === k)
export const sharedNodeForStep = (q: any, k: any) => nodesForStep(q, k).find((v: any) => tierIsShared(v))
export const nodeForTier = (q: any, k: any, tid: any) => nodesForStep(q, k).find((v: any) => v.tiers.includes(tid))
export const isNodeVisible = (n: any) => (n.isVisible !== false && VISIBLE_BY_DEFAULT[n.type] !== false) || n.isVisible === true
export const isWithin3MonthsOfToday = (year: number, month: number) => {
  const now = new Date()
  const diff = (now.getFullYear() - year) * 12 + (now.getMonth() - (month - 1))
  return Math.abs(diff) <= 3
}

export const SEED_TIERS = [
  { id: 't1', name: 'Tier 1', color: '#10b981' },
  { id: 't2', name: 'Tier 2', color: '#0ea5e9' },
  { id: 't3', name: 'Tier 3', color: '#f59e0b' },
  { id: 't4', name: 'Tier 4', color: '#f43f5e' },
]

export const SEED_STEPS = [
  { key: 'welcome', label: 'Welcome / Accident Type' },
  { key: 'branch', label: 'Accident Branch' },
  { key: 'state', label: 'Accident State' },
  { key: 'date', label: 'Accident Date' },
  { key: 'tier_lookup', label: 'Tier Lookup (webhook)' },
  { key: 'details', label: 'Accident Details' },
  { key: 'injury', label: 'Injury Type' },
  { key: 'treatment', label: 'Treatment Received' },
  { key: 'treatment_time', label: 'Treatment Time' },
  { key: 'fault', label: 'Fault' },
  { key: 'attorney', label: 'Attorney Status' },
  { key: 'insurance', label: 'Insurance Status' },
  { key: 'dq_decision', label: 'DQ Decision' },
  { key: 'qualified_form', label: 'Qualified Lead Form' },
  { key: 'dq_form', label: 'DQ Lead Form' },
  { key: 'hlr_lookup', label: 'HLR Mobile Lookup' },
  { key: 'qualified_thanks', label: '/submitted (Qualified)' },
  { key: 'dq_thanks', label: '/thanks (DQ)' },
]

export const mkA = (label: string, opts: any = {}) => ({
  id: genId('a'), label, isDQ: opts.isDQ || false,
  fieldMappings: opts.fm || [], nextStepKey: opts.next || '', setTier: opts.tier || '',
})

export const buildSeedNodes = () => [
  { id: 'n_welcome', stepKey: 'welcome', tiers: [], type: 'question', fieldName: 'accident_type', questionType: 'button_grid', isVisible: true,
    tagline: 'Take the 30 Second Quiz to Start the Process of Seeing How Much Your Claim Could Be Worth',
    headline: 'Get The Maximum Cash Payout For Your Accident Injury!!',
    question: 'How Were You Injured?', subheadline: 'Select The Type Of Accident You Were Involved In:',
    answers: [
      mkA('Auto / Motorcycle Accident', { fm: [{ key: 'accident_type', value: 'auto' }], next: 'state' }),
      mkA('Commercial / Semi Accident', { fm: [{ key: 'accident_type', value: 'commercial' }], next: 'state' }),
      mkA('Passenger / Rideshare / Pedestrian Accident', { fm: [{ key: 'accident_type', value: 'passenger' }], next: 'state' }),
      mkA("At Work / Other / I Wasn't Injured", { fm: [{ key: 'accident_type', value: 'other' }], next: 'branch' }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_branch', stepKey: 'branch', tiers: [], type: 'question', fieldName: 'accident_type', questionType: 'single_select', isVisible: true,
    headline: 'What Type Of Incident Were You Involved In?', question: 'Select the type of vehicle accident',
    subheadline: "Conditional - only shown if Q1 = At Work / Other / I Wasn't Injured",
    answers: [
      mkA('Auto Accident', { fm: [{ key: 'accident_type', value: 'auto' }] }),
      mkA('Truck or Semi Accident', { fm: [{ key: 'accident_type', value: 'commercial' }] }),
      mkA('Work Place Accident > WC Quiz', { fm: [{ key: 'accident_type', value: 'work' }] }),
      mkA('Employment Discrimination Incident', { isDQ: true, fm: [{ key: 'accident_type', value: 'discrimination' }] }),
      mkA('Pedestrian / Rideshare Accident', { fm: [{ key: 'accident_type', value: 'passenger' }] }),
      mkA("I Wasn't Injured", { isDQ: true, fm: [{ key: 'accident_type', value: 'none' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_state', stepKey: 'state', tiers: [], type: 'question', fieldName: 'accident_state', questionType: 'dropdown', isVisible: true,
    headline: 'What State Did The Accident Happen In?', question: 'Type to search for the state',
    subheadline: 'Select the state from the dropdown', dropdownField: 'accident_state',
    answers: [mkA('State selected')], enterScript: '', exitScript: '' },
  { id: 'n_date', stepKey: 'date', tiers: [], type: 'question', fieldName: 'incident_date', questionType: 'smart_date', isVisible: true,
    headline: 'When Did The Accident Happen?', question: 'Select the month and year when the accident happened.',
    subheadline: '', answers: [mkA('Date selected')], enterScript: '', exitScript: '' },
  { id: 'n_tier_lookup', stepKey: 'tier_lookup', tiers: [], type: 'webhook', fieldName: 'tier', questionType: 'webhook_post', isVisible: false,
    headline: 'MVA Qualification Tier Lookup', question: 'Webhook > BigQuery (state + date > tier_1/2/3/4)',
    subheadline: 'Sets {{tier}} custom field for branching below',
    webhookMethod: 'POST',
    webhookUrl: 'https://api.legenex.com/mva-tier-lookup',
    webhookHeaders: [{ id: genId('h'), key: 'Content-Type', value: 'application/json' }],
    webhookPayload: '{\n  "accident_state": "{{accident_state}}",\n  "incident_date": "{{incident_date}}"\n}',
    responseMappings: [{ id: genId('rm'), jsonPath: 'tier', fieldKey: 'tier' }],
    answers: [], enterScript: '', exitScript: '' },
  { id: 'n_details', stepKey: 'details', tiers: [], type: 'question', fieldName: 'accident_details', questionType: 'textarea', isVisible: true,
    headline: 'Please Briefly Describe Your Accident & Injuries', question: 'Free text describing what happened',
    subheadline: 'Used to match you with the right attorney',
    answers: [mkA('Continue')], enterScript: '', exitScript: '' },
  { id: 'n_injury_t12', stepKey: 'injury', tiers: ['t1', 't2'], type: 'question', fieldName: 'injury_type', questionType: 'dropdown', isVisible: true,
    headline: 'What Injuries Did You Suffer In The Accident?', question: 'Select the option that best describes your injuries',
    subheadline: 'Severity affects which attorneys can take your case', dropdownField: 'injury_type',
    answers: [mkA('Injury selected')], enterScript: '', exitScript: '' },
  { id: 'n_treatment_t12', stepKey: 'treatment', tiers: ['t1', 't2'], type: 'question', fieldName: 'treatment_type', questionType: 'single_select', isVisible: true,
    headline: 'What Type Of Medical Treatment Did You Receive?', question: 'Includes surgery, hospitalization, specialists, doctors',
    subheadline: 'Documented treatment is required for Tier 1 and Tier 2',
    answers: [
      mkA('I Had Surgery', { fm: [{ key: 'treatment_type', value: 'surgery' }] }),
      mkA('I Was Hospitalized', { fm: [{ key: 'treatment_type', value: 'hospital' }] }),
      mkA('I Was Treated By A Doctor', { fm: [{ key: 'treatment_type', value: 'doctor' }] }),
      mkA('I Was Not Medically Treated', { isDQ: true, fm: [{ key: 'treatment_type', value: 'none' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_treatment_t34', stepKey: 'treatment', tiers: ['t3', 't4'], type: 'question', fieldName: 'treatment', questionType: 'single_select', isVisible: true,
    headline: 'Did You Receive Medical Treatment?', question: 'Includes surgery, hospitalization, doctors, chiropractors',
    subheadline: 'Softer treatment check for Tier 3 and Tier 4',
    answers: [
      mkA('Yes, I Was Treated', { fm: [{ key: 'treatment_type', value: 'yes' }] }),
      mkA('No, I Was Not Treated', { isDQ: true, fm: [{ key: 'treatment_type', value: 'no' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_treatment_time_t12', stepKey: 'treatment_time', tiers: ['t1', 't2'], type: 'question', fieldName: 'treatment_time', questionType: 'dropdown', isVisible: true,
    headline: 'When Were You Treated For Your Injuries?', question: 'Please indicate the timeframe in which you had treatment',
    subheadline: 'How quickly you sought treatment matters', dropdownField: 'treatment_time',
    answers: [mkA('Time selected')], enterScript: '', exitScript: '' },
  { id: 'n_fault_t12', stepKey: 'fault', tiers: ['t1', 't2'], type: 'question', fieldName: 'fault', questionType: 'single_select', isVisible: true,
    headline: 'Were You At Fault For This Accident?', question: 'Select the option that best describes your involvement',
    subheadline: 'Fault status determines eligibility',
    answers: [
      mkA('No, Someone Else Caused The Accident', { fm: [{ key: 'fault', value: 'no' }, { key: 'fault_type', value: 'someone_else' }] }),
      mkA('Yes, I Caused The Accident', { isDQ: true, fm: [{ key: 'fault', value: 'yes' }] }),
      mkA('It Was A Hit & Run / Single-Person / Animal Accident', { isDQ: true, fm: [{ key: 'fault', value: 'no' }, { key: 'fault_type', value: 'single' }] }),
      mkA('We Were Both At Fault / Not Sure', { fm: [{ key: 'fault', value: 'partial' }], tier: 't3' }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_fault_t3', stepKey: 'fault', tiers: ['t3'], type: 'question', fieldName: 'fault', questionType: 'single_select', isVisible: true,
    headline: 'Was The Accident Your Fault?', question: 'Simplified fault question for Tier 3',
    subheadline: 'Select the option that best describes your involvement',
    answers: [
      mkA('No, I Was Not At Fault', { fm: [{ key: 'fault', value: 'no' }] }),
      mkA('Yes, I Caused The Accident', { isDQ: true, fm: [{ key: 'fault', value: 'yes' }] }),
      mkA('Not Sure / Both At Fault', { fm: [{ key: 'fault', value: 'partial' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_attorney_t1', stepKey: 'attorney', tiers: ['t1'], type: 'question', fieldName: 'attorney', questionType: 'single_select', isVisible: true,
    headline: 'Have You Ever Worked With An Attorney For This Accident Claim?', question: 'Tier 1 - historical attorney check',
    subheadline: 'Indicate if you have ever engaged with a law firm',
    answers: [
      mkA('No, I Have Never Worked With An Attorney', { fm: [{ key: 'attorney', value: 'never' }] }),
      mkA('Yes, I Have Worked With An Attorney', { fm: [{ key: 'attorney', value: 'had' }] }),
      mkA('My Claim Was Rejected / Settled', { fm: [{ key: 'attorney', value: 'closed' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_attorney_t2', stepKey: 'attorney', tiers: ['t2'], type: 'question', fieldName: 'attorney', questionType: 'single_select', isVisible: true,
    headline: 'Are You Currently Working With An Attorney For This Accident Claim?', question: 'Tier 2 - full 4-option current status',
    subheadline: 'Indicate if you are currently represented',
    answers: [
      mkA("No, I Don't Have An Attorney", { fm: [{ key: 'attorney', value: 'no' }] }),
      mkA('Yes, I Am Working With An Attorney', { fm: [{ key: 'attorney', value: 'yes' }] }),
      mkA('My Claim Was Rejected / Settled', { fm: [{ key: 'attorney', value: 'closed' }] }),
      mkA('Yes, But I Am Looking To Change Attorneys', { fm: [{ key: 'attorney', value: 'change' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_attorney_t3', stepKey: 'attorney', tiers: ['t3'], type: 'question', fieldName: 'attorney', questionType: 'single_select', isVisible: true,
    headline: 'Are You Currently Working With An Attorney For This Accident Claim?', question: 'Tier 3 - 3 options',
    subheadline: 'Indicate if you are currently represented',
    answers: [
      mkA("No, I Don't Have An Attorney", { fm: [{ key: 'attorney', value: 'no' }] }),
      mkA('Yes, I Am Working With An Attorney', { fm: [{ key: 'attorney', value: 'yes' }] }),
      mkA('Yes, But I Am Looking To Change Attorneys', { fm: [{ key: 'attorney', value: 'change' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_attorney_t4', stepKey: 'attorney', tiers: ['t4'], type: 'question', fieldName: 'attorney', questionType: 'single_select', isVisible: true,
    headline: 'Are You Currently Working With An Attorney For This Accident?', question: 'Tier 4 - with rejected/settled',
    subheadline: 'Indicate if you are currently represented',
    answers: [
      mkA("No, I Don't Have An Attorney", { fm: [{ key: 'attorney', value: 'no' }] }),
      mkA('Yes, I Am Working With An Attorney', { fm: [{ key: 'attorney', value: 'yes' }] }),
      mkA('My Claim Was Rejected / Settled', { fm: [{ key: 'attorney', value: 'closed' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_insurance_t1', stepKey: 'insurance', tiers: ['t1'], type: 'question', fieldName: 'insurance', questionType: 'single_select', isVisible: true,
    headline: 'Does Anyone Involved Have Vehicle Insurance?', question: 'Tier 1 only - insurance verification',
    subheadline: 'Select the option that best describes the insurance status',
    answers: [
      mkA('Yes, Both Parties Have Insurance', { fm: [{ key: 'insurance', value: 'both' }] }),
      mkA('The Driver At Fault Has Insurance', { fm: [{ key: 'insurance', value: 'at_fault' }] }),
      mkA('I Have Insurance', { fm: [{ key: 'insurance', value: 'mine' }] }),
      mkA('No One Has Insurance', { fm: [{ key: 'insurance', value: 'none' }] }),
    ], enterScript: '', exitScript: '' },
  { id: 'n_dq_decision', stepKey: 'dq_decision', tiers: [], type: 'decision', fieldName: 'dq_lead', questionType: 'decision', isVisible: false,
    headline: 'DQ Decision', question: 'Auto-route based on DQ flag',
    subheadline: 'If any answer was DQ > DQ Form; otherwise > Qualified Form',
    conditions: [{ id: genId('c'), field: 'dq_lead', operator: 'eq', value: 'yes', nextStepKey: 'dq_form' }],
    defaultNextStepKey: 'qualified_form', answers: [], enterScript: '', exitScript: '' },
  { id: 'n_qualified_form', stepKey: 'qualified_form', tiers: [], type: 'form', fieldName: 'qualified_form', questionType: 'lead_form', isVisible: true,
    headline: 'GREAT NEWS!! You Qualify For A Maximum Compensation Payout!',
    question: 'Get your FREE case evaluation',
    subheadline: 'Provide your details below to get matched with an experienced attorney in {{accident_state}}',
    formFields: defaultLeadFormFields(),
    answers: [mkA('Submitted', { next: 'hlr_lookup' })], enterScript: '', exitScript: '' },
  { id: 'n_dq_form', stepKey: 'dq_form', tiers: [], type: 'form', fieldName: 'dq_form', questionType: 'lead_form', isVisible: true,
    headline: 'Tell Us More...', question: 'Complete the form below so we can contact you',
    subheadline: "Don't wanna wait? Call now and fast-track your claim",
    formFields: defaultLeadFormFields(),
    answers: [mkA('Submitted', { next: 'dq_thanks' })], enterScript: '', exitScript: '' },
  { id: 'n_hlr_lookup', stepKey: 'hlr_lookup', tiers: [], type: 'verification', fieldName: 'phone_valid', questionType: 'phone_verify', isVisible: false,
    headline: 'HLR Mobile Lookup', question: 'Twilio HLR verification',
    subheadline: 'Validates the mobile number before posting',
    webhookMethod: 'POST',
    webhookUrl: 'https://api.twilio.com/hlr',
    webhookHeaders: [{ id: genId('h'), key: 'Content-Type', value: 'application/json' }, { id: genId('h'), key: 'Authorization', value: 'Bearer {{twilio_token}}' }],
    webhookPayload: '{\n  "mobile": "{{mobile}}",\n  "first_name": "{{first_name}}",\n  "last_name": "{{last_name}}"\n}',
    responseMappings: [
      { id: genId('rm'), jsonPath: 'valid', fieldKey: 'phone_valid' },
      { id: genId('rm'), jsonPath: 'carrier', fieldKey: 'carrier' },
    ],
    answers: [], enterScript: '', exitScript: '' },
  { id: 'n_qual_thanks', stepKey: 'qualified_thanks', tiers: [], type: 'endpoint', fieldName: 'submitted', questionType: 'qualified_result', isVisible: true,
    headline: 'Thank You! An Attorney Will Reach Out Shortly.', question: '/submitted',
    subheadline: 'We received your answers. A member of the team will be in touch.',
    answers: [], enterScript: '', exitScript: '' },
  { id: 'n_dq_thanks', stepKey: 'dq_thanks', tiers: [], type: 'endpoint', fieldName: 'thanks', questionType: 'dq_result', isVisible: true,
    headline: 'Thanks For Your Information', question: '/thanks',
    subheadline: 'We received your answers.',
    answers: [], enterScript: '', exitScript: '' },
]

export const buildSeedQuiz = () => ({
  id: 'quiz_mva_tiered', name: 'MVA Tiered Quiz', slug: 'mva',
  isPublished: true, createdAt: Date.now(), updatedAt: Date.now(),
  tiers: SEED_TIERS, steps: SEED_STEPS, nodes: buildSeedNodes(), customFields: SEED_CUSTOM_FIELDS,
})

export const applyDynamicContent = (node: any, fieldValues: any) => {
  const rules = node.dynamicContent || []
  for (const rule of rules) {
    const v = fieldValues[rule.ifField] || ''
    const ok = rule.ifOperator === 'eq' ? v === rule.ifValue :
      rule.ifOperator === 'neq' ? v !== rule.ifValue :
      rule.ifOperator === 'contains' ? v.includes(rule.ifValue) :
      rule.ifOperator === 'not_contains' ? !v.includes(rule.ifValue) :
      rule.ifOperator === 'is_empty' ? !v :
      rule.ifOperator === 'is_not_empty' ? !!v : false
    if (ok) {
      const merged = { ...node }
      Object.entries(rule.overrides || {}).forEach(([k, val]) => { if (val) merged[k] = val })
      return merged
    }
  }
  return node
}
