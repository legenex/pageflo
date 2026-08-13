/**
 * The twenty standalone quiz templates.
 *
 * Transcribed from the design handoff in `quizzes/` rather than invented, and
 * deliberately DATA rather than twenty components. The handoff already
 * decomposes each template along the same four axes - how wide it runs, how it
 * shows progress, how it draws an answer, and what it does about icons - so the
 * twenty are twenty combinations over one renderer instead of twenty files that
 * would drift apart the moment one of them was touched.
 *
 * That is the same lesson the landing-page templates taught earlier: the six
 * quiz templates this replaces were six hand-written bags of colour functions,
 * which is exactly why they could only ever differ in colour.
 *
 * The one rule the handoff states outright, and the reason this file contains
 * no questions and no routing:
 *
 *   "All 20 templates share the same quiz-deployment contract: presentation
 *    only - questions, branching, consent, routing and webhooks live on the
 *    deployment."
 *
 * So a template may say that answers are lettered hairline rows. It may not say
 * what the answers are, where they lead, or what happens after the last one.
 *
 * Colour is absent here for the same reason it is absent from a landing-page
 * template: the brand owns it. The handoff draws every template in a neutral
 * fallback palette and says so, which is the same model arrived at
 * independently on the landing-page side.
 */

/** How a template reports progress. Every one of the twenty differs. */
export type ProgressForm =
  | 'rule_count' | 'rounded_encourage' | 'segmented_blocks' | 'factor_rail'
  | 'bar_percent_chip' | 'bar_percent_label' | 'deadline_rail' | 'caps_thin_bar'
  | 'dot_sequence' | 'answered_ticks' | 'route_breadcrumb' | 'mono_hairline'
  | 'header_count' | 'segment_ticks' | 'milestone_rail' | 'tab_status'
  | 'edge_bar' | 'card_diamonds' | 'path_nodes' | 'item_count'

/** How a template draws one selectable answer. */
export type AnswerForm =
  | 'lettered_hairline' | 'soft_radio' | 'squared_rows' | 'document_stamps'
  | 'bold_buttons' | 'icon_tiles' | 'dark_rows' | 'left_accent' | 'pill_chips'
  | 'reply_grid' | 'router_cards' | 'thin_radio' | 'reply_pills' | 'diagram_tiles'
  | 'node_rows' | 'field_rows' | 'oversized_letters' | 'pick_cards' | 'checkbox_docs'

/**
 * What a template does about icons.
 *
 * A policy rather than a set, because the handoff describes intent - "sparing,
 * vetting badges", "primary, every tile" - and an icon drawn against the wrong
 * intent is worse than none. `none` is a legitimate answer and two templates
 * come close to it.
 */
export type IconPolicy =
  | 'inline_muted' | 'inline_bold' | 'tinted_chips' | 'option_set' | 'guidance'
  | 'status' | 'primary_tiles' | 'urgency' | 'numbered' | 'badges' | 'semantic'
  | 'diagrams' | 'keycaps' | 'medallion' | 'documents'

export type QuizTemplate = {
  /** Stable id, stored on the deployment. */
  id: string
  /** The handoff's own reference, kept so a design question can be traced back. */
  code: string
  name: string
  /** The landing-page template it was adapted from, or 'standalone'. */
  origin: string
  blurb: string
  use: string
  /** Content width in px. A zero maximum means full bleed. */
  width: [number, number]
  progress: ProgressForm
  answers: AnswerForm
  icons: IconPolicy
  /** The question is set in the serif face rather than the display sans. */
  serifQuestion?: boolean
  /** The template grounds dark whatever the brand's page colour is. */
  dark?: boolean
}

export const QUIZ_TEMPLATES: QuizTemplate[] = [
  {
    id: 'sq_editorial_inline',
    code: 'SQ-01',
    name: 'Editorial Inline',
    origin: 'lp01',
    blurb: 'The article-set assessment: serif question, typographic rules, lettered hairline answer rows.',
    use: 'Advertorials, Article Embeds',
    width: [520, 640],
    progress: 'rule_count',
    answers: 'lettered_hairline',
    icons: 'inline_muted',
    serifQuestion: true,
  },
  {
    id: 'sq_recovery_soft',
    code: 'SQ-02',
    name: 'Recovery Soft',
    origin: 'lp02',
    blurb: 'Warm and reassuring: serif question, soft rounded rows, icon chips, encouraging microcopy.',
    use: 'Warm Brands, Story Traffic',
    width: [520, 640],
    progress: 'rounded_encourage',
    answers: 'soft_radio',
    icons: 'tinted_chips',
    serifQuestion: true,
  },
  {
    id: 'sq_authority_console',
    code: 'SQ-03',
    name: 'Authority Console',
    origin: 'lp03',
    blurb: 'Institutional assessment console: dark header strip, segmented progress, squared rows with vetting footer.',
    use: 'Authority Brands, Network Angles',
    width: [520, 640],
    progress: 'segmented_blocks',
    answers: 'squared_rows',
    icons: 'option_set',
  },
  {
    id: 'sq_case_dossier',
    code: 'SQ-04',
    name: 'Case Dossier',
    origin: 'lp04',
    blurb: 'Case-file interface: factor rail with RECORDED stamps, file header, mandatory non-valuation strip.',
    use: 'High-Intent, Desktop-Heavy',
    width: [680, 880],
    progress: 'factor_rail',
    answers: 'document_stamps',
    icons: 'status',
  },
  {
    id: 'sq_direct_panel',
    code: 'SQ-05',
    name: 'Direct Panel',
    origin: 'lp05',
    blurb: 'Direct-response framed panel: dark headline band, thick progress with % chip, bold chevron buttons.',
    use: 'Paid Social, Dr Campaigns',
    width: [520, 640],
    progress: 'bar_percent_chip',
    answers: 'bold_buttons',
    icons: 'inline_bold',
  },
  {
    id: 'sq_quiz_first',
    code: 'SQ-06',
    name: 'Quiz First',
    origin: 'lp06',
    blurb: 'The quiz IS the page: oversized centered question, large icon tiles, minimal chrome around it.',
    use: 'Hosted Quiz Urls, Hero Embeds',
    width: [720, 900],
    progress: 'bar_percent_label',
    answers: 'icon_tiles',
    icons: 'primary_tiles',
  },
  {
    id: 'sq_deadline_timeline',
    code: 'SQ-07',
    name: 'Deadline Timeline',
    origin: 'lp07',
    blurb: 'Dark, deadline-led: amber urgency strip, accident→deadline rail, white-on-dark answer rows.',
    use: 'Urgency Angles, Retargeting',
    width: [520, 640],
    progress: 'deadline_rail',
    answers: 'dark_rows',
    icons: 'urgency',
    dark: true,
  },
  {
    id: 'sq_insurer_context',
    code: 'SQ-08',
    name: 'Insurer Context',
    origin: 'lp08',
    blurb: 'Comparison-led: insurer-vs-you header, left-accent rows, and a "why we ask" guidance note per question.',
    use: 'Education-Led, Lowball-Offer Angle',
    width: [520, 640],
    progress: 'caps_thin_bar',
    answers: 'left_accent',
    icons: 'guidance',
  },
  {
    id: 'sq_sixty_second',
    code: 'SQ-09',
    name: 'Sixty Second',
    origin: 'lp09',
    blurb: 'Fast and compact: shortened 4-question pacing, pill-chip answers, timer badge, dot progress.',
    use: 'Sidebars, Compact Embeds',
    width: [360, 440],
    progress: 'dot_sequence',
    answers: 'pill_chips',
    icons: 'inline_muted',
  },
  {
    id: 'sq_answer_first',
    code: 'SQ-10',
    name: 'Answer First',
    origin: 'lp10',
    blurb: 'Q&A card stack: answered questions collapse into confirmed rows above the highlighted current card.',
    use: 'Conversational Landers',
    width: [520, 640],
    progress: 'answered_ticks',
    answers: 'reply_grid',
    icons: 'numbered',
  },
  {
    id: 'sq_case_router',
    code: 'SQ-11',
    name: 'Case Router',
    origin: 'lp11',
    blurb: 'Icon-led router: the accident-type pick pre-fills the flow and shows as a visible route breadcrumb.',
    use: 'Multi-Case-Type Campaigns',
    width: [520, 640],
    progress: 'route_breadcrumb',
    answers: 'router_cards',
    icons: 'tinted_chips',
    serifQuestion: true,
  },
  {
    id: 'sq_network_vetting',
    code: 'SQ-12',
    name: 'Network Vetting',
    origin: 'lp12',
    blurb: 'Refined and restrained: serif question, hairline rows, vetting strip, and matching-transparency note.',
    use: 'Premium / Professional Brands',
    width: [460, 580],
    progress: 'mono_hairline',
    answers: 'thin_radio',
    icons: 'badges',
    serifQuestion: true,
  },
  {
    id: 'sq_guided_conversation',
    code: 'SQ-13',
    name: 'Guided Conversation',
    origin: 'standalone',
    blurb: 'Chat-style assessment with visible history and reply pills. Clearly labeled automated — never implies a live person.',
    use: 'Hosted Urls, Mobile Chat Feel',
    width: [360, 560],
    progress: 'header_count',
    answers: 'reply_pills',
    icons: 'semantic',
  },
  {
    id: 'sq_incident_scene',
    code: 'SQ-14',
    name: 'Incident Scene',
    origin: 'standalone',
    blurb: 'Visual classification: seven simplified top-down collision diagrams (rear-end, side, head-on, multi-vehicle, parked, pedestrian, not sure). No graphic imagery.',
    use: 'Visual-First, Low-Friction Start',
    width: [520, 820],
    progress: 'segment_ticks',
    answers: 'diagram_tiles',
    icons: 'diagrams',
  },
  {
    id: 'sq_timeline_journey',
    code: 'SQ-15',
    name: 'Timeline Journey',
    origin: 'standalone',
    blurb: 'Vertical journey rail — accident, treatment, insurance contact, missed work, status — with the live question beside the active node.',
    use: 'Chronology-Led Review',
    width: [700, 860],
    progress: 'milestone_rail',
    answers: 'node_rows',
    icons: 'semantic',
  },
  {
    id: 'sq_case_file_console',
    code: 'SQ-16',
    name: 'Case File Console',
    origin: 'standalone',
    blurb: 'Tabbed case-file console — Incident / Medical / Legal / Contact — with status labels and document-style field rows. Explicitly not a valuation.',
    use: 'Case-Management Feel, Desktop',
    width: [680, 840],
    progress: 'tab_status',
    answers: 'field_rows',
    icons: 'status',
  },
  {
    id: 'sq_fullscreen_focus',
    code: 'SQ-17',
    name: 'Fullscreen Focus',
    origin: 'standalone',
    blurb: 'One question per screen: the largest type and answer targets in the set, a bare edge-to-edge progress line, transparent canvas by default.',
    use: 'Mobile Paid Traffic, Hosted Urls',
    width: [440, 0],
    progress: 'edge_bar',
    answers: 'oversized_letters',
    icons: 'keycaps',
  },
  {
    id: 'sq_card_deck',
    code: 'SQ-18',
    name: 'Card Deck',
    origin: 'standalone',
    blurb: 'Every answer is a substantial pick-a-card tile. Tap always works; explicit Previous / Next controls — no swipe required.',
    use: 'Engagement-Led Mobile Flows',
    width: [460, 820],
    progress: 'card_diamonds',
    answers: 'pick_cards',
    icons: 'medallion',
  },
  {
    id: 'sq_decision_path',
    code: 'SQ-19',
    name: 'Decision Path',
    origin: 'standalone',
    blurb: 'Branching-path header: completed nodes labeled, future nodes anonymous dots. Orientation only — no qualification logic exposed.',
    use: 'Transparency-Forward Brands',
    width: [480, 840],
    progress: 'path_nodes',
    answers: 'thin_radio',
    icons: 'option_set',
  },
  {
    id: 'sq_evidence_checklist',
    code: 'SQ-20',
    name: 'Evidence Checklist',
    origin: 'standalone',
    blurb: 'Document-led multi-select opener — police report, medical records, photos, wages — with an explicit "none yet" option. Checklist, not an uploader.',
    use: 'Evidence-Heavy Qualification',
    width: [440, 760],
    progress: 'item_count',
    answers: 'checkbox_docs',
    icons: 'documents',
  },
]

export const QUIZ_TEMPLATE_BY_ID: Record<string, QuizTemplate> =
  Object.fromEntries(QUIZ_TEMPLATES.map((t) => [t.id, t]))

/**
 * The six template ids that shipped before this set.
 *
 * They are on live deployments, so they still resolve. Each maps to the
 * template in the new set whose presentation is closest, which is a judgement
 * rather than a fact and is recorded here so it can be argued with rather than
 * discovered in a diff. Nothing rewrites a stored id: the mapping happens on
 * read, so a deployment that nobody edits keeps working and an operator who
 * opens one sees the new template it resolved to.
 */
export const LEGACY_TEMPLATE_IDS: Record<string, string> = {
  default: 'sq_quiz_first',
  minimal: 'sq_editorial_inline',
  editorial: 'sq_editorial_inline',
  gradient: 'sq_direct_panel',
  glass: 'sq_recovery_soft',
  compact: 'sq_sixty_second',
}

/**
 * `resolveQuizTemplate` used to live here and answered every id, including ones
 * that named nothing, with `sq_editorial_inline` and no word about it.
 *
 * It has been removed rather than fixed. Resolution is `src/lib/template-registry.ts`
 * and only that: `resolveTemplate` for anything that may refuse, `resolveForRender`
 * for a path that must draw something and now reports when it guessed. A second
 * resolver next to the data it resolves is how the first one survived — every
 * caller had one within reach and none of them had to think about it.
 *
 * This module is the DATA. `QUIZ_TEMPLATES`, `QUIZ_TEMPLATE_BY_ID` and
 * `LEGACY_TEMPLATE_IDS` are what the registry reads; nothing here decides.
 * `scripts/test-template-registry.mts` fails if a second resolver reappears.
 */

/** Max width in px for a template, or null when it runs full bleed. */
export const templateMaxWidth = (t: QuizTemplate): number | null => (t.width[1] === 0 ? null : t.width[1])

/**
 * The progress forms, with the words the handoff uses for them.
 *
 * A deployment may override its template's form with any of these. That is a
 * presentation choice rather than a new template: the layout, the answers and
 * the icon policy all stay the template's, and only the way progress is drawn
 * changes. Twenty templates times twenty forms is not four hundred templates,
 * it is twenty templates and one knob.
 */
export const PROGRESS_FORM_LABELS: Array<{ id: ProgressForm; label: string; from: string }> = [
  { id: 'rule_count', label: 'Thin rule + count', from: 'Editorial Inline' },
  { id: 'rounded_encourage', label: 'Rounded bar + encouragement', from: 'Recovery Soft' },
  { id: 'segmented_blocks', label: 'Segmented blocks + step NN/NN', from: 'Authority Console' },
  { id: 'factor_rail', label: 'Factor status rail', from: 'Case Dossier' },
  { id: 'bar_percent_chip', label: 'Bar + % chip', from: 'Direct Panel' },
  { id: 'bar_percent_label', label: 'Bar + % label', from: 'Quiz First' },
  { id: 'deadline_rail', label: 'Deadline rail + %', from: 'Deadline Timeline' },
  { id: 'caps_thin_bar', label: 'Caps eyebrow + thin bar', from: 'Insurer Context' },
  { id: 'dot_sequence', label: 'Dot sequence', from: 'Sixty Second' },
  { id: 'answered_ticks', label: 'Answered count + ticks', from: 'Answer First' },
  { id: 'route_breadcrumb', label: 'Bar + route breadcrumb', from: 'Case Router' },
  { id: 'mono_hairline', label: 'Mono counter + hairline', from: 'Network Vetting' },
  { id: 'header_count', label: 'Question count in header', from: 'Guided Conversation' },
  { id: 'segment_ticks', label: 'Segment ticks', from: 'Incident Scene' },
  { id: 'milestone_rail', label: 'Vertical milestone rail', from: 'Timeline Journey' },
  { id: 'tab_status', label: 'Tab states + status chip', from: 'Case File Console' },
  { id: 'edge_bar', label: 'Edge bar + step count', from: 'Fullscreen Focus' },
  { id: 'card_diamonds', label: 'Card N of N + diamonds', from: 'Card Deck' },
  { id: 'path_nodes', label: 'Path nodes + branch stubs', from: 'Decision Path' },
  { id: 'item_count', label: 'Item count + step label', from: 'Evidence Checklist' },
]

const PROGRESS_IDS = new Set(PROGRESS_FORM_LABELS.map((p) => p.id))

/** A stored override, or null when it is absent or not a form we know. */
export const cleanProgressForm = (v: unknown): ProgressForm | null =>
  typeof v === 'string' && PROGRESS_IDS.has(v as ProgressForm) ? (v as ProgressForm) : null
