/**
 * The twelve landing-page templates, as ported from the design handoff.
 *
 * The metadata below is the library page's own: its grouping into long, medium
 * and short form, the channels each is meant for, and where each puts the quiz.
 * The markup and the token list come from the generated modules beside this
 * one, which are re-derived by `scripts/extract-lp-templates.mjs` rather than
 * edited.
 *
 * These replace the four identity-driven templates for RENDERING. The four are
 * kept resolvable so pages already assigned to one keep working, and they still
 * carry the node model that makes a page editable element by element; what they
 * do not carry is pixel parity with a reference design, because they were built
 * from a description of one.
 */

import * as editorial_investigation_v2 from './editorial_investigation_v2'
import * as human_recovery_story from './human_recovery_story'
import * as authority_network from './authority_network'
import * as case_value_dossier from './case_value_dossier'
import * as network_authority from './network_authority'
import * as split_screen_direct from './split_screen_direct'
import * as quiz_first from './quiz_first'
import * as deadline_signal from './deadline_signal'
import * as insurer_vs_claimant from './insurer_vs_claimant'
import * as case_type_router from './case_type_router'
import * as sixty_second_check from './sixty_second_check'
import * as answer_first from './answer_first'

import type { LpSlot, LpSlottedTemplate, LpUnsupportedRegion } from '@/lib/lp-slots/model'

export type PortedTemplate = {
  slug: string
  code: string
  name: string
  /** The library's own grouping. */
  family: 'long' | 'medium' | 'short'
  /** The library's own one-line description. */
  blurb: string
  channels: string
  /** Where this template puts the quiz, in the library's words. */
  quiz: string
  /** The ground the reference is drawn on, per the library's badge. */
  ground: string
  tokens: Record<string, string>
  /**
   * The template with nothing overridden — what the reference draws.
   *
   * Kept as the parity target and as the cheap path for a preview that has no
   * overrides. A page with overrides is built from `parts`/`slots` instead; see
   * `composeTemplate` in `@/lib/lp-slots/model`.
   */
  html: string
  /** Literal markup between slots. Always `slotIds.length + 1` entries. */
  parts: string[]
  /** The slot filling each gap between parts, in document order. */
  slotIds: string[]
  /** Every editable region, with the reference's own copy as its default. */
  slots: LpSlot[]
  /** Regions the markup alone cannot carry. Empty means complete. */
  unsupported: LpUnsupportedRegion[]
}

const meta = [
  ['editorial_investigation_v2', 'LP01', 'Editorial Investigation', 'long', 'LIGHT',
   'Consumer-report article with an inline quiz after the lead. Educational, credibility-led.',
   'FB / YT cold', 'Inline editorial, after lead', editorial_investigation_v2],
  ['human_recovery_story', 'LP02', 'Human Recovery Story', 'long', 'LIGHT',
   'Full-width visual narrative opening; the quiz card overlaps the story transition. Empathy-led, never melodramatic.',
   'FB / IG emotional', 'Overlap card under full-bleed story', human_recovery_story],
  ['authority_network', 'LP03', 'Authority Network', 'long', 'DARK HERO',
   'Centered institutional hero, then a structured assessment console: step rail and quiz panel. Verification ledger below.',
   'YT / email / retargeting', 'Assessment console beneath hero', authority_network],
  ['case_value_dossier', 'LP04', 'Case Value Dossier', 'long', 'LIGHT',
   'Case-file workspace: tabs, factor weights, evidence file, estimator quiz with completeness rail. Never promises amounts.',
   'Search-intent / YT / calc ads', 'Central estimator module', case_value_dossier],
  ['network_authority', 'LP12', 'Network Authority', 'long', 'LIGHT',
   'Transparency into vetting, network construction, state relevance and matching methodology. Not an auction, and says so.',
   'YT / email / skeptical', 'Sticky rail card, roman-numeral rows', network_authority],
  ['split_screen_direct', 'LP05', 'Split-Screen Direct', 'medium', 'SPLIT',
   '50/50 hero: copy on dark, quiz on light. Minimal sections, maximum clarity.',
   'FB / IG direct response', 'Right hero panel / stacks', split_screen_direct],
  ['quiz_first', 'LP06', 'Quiz First', 'medium', 'LIGHT',
   'The quiz is the page. One headline, one reassurance line, then Q1 above the fold.',
   'High-volume Meta / mobile', 'Oversized centered panel', quiz_first],
  ['deadline_signal', 'LP07', 'Deadline Signal', 'medium', 'URGENCY',
   'Statute-window education with a timeline rail. Ethical urgency, no timers and no fake dates.',
   'Retargeting / email', 'Inline, under timeline', deadline_signal],
  ['insurer_vs_claimant', 'LP08', 'Insurer vs Claimant', 'medium', 'LIGHT',
   'Opposing-columns comparison, tactic-vs-counter scorecard, and a horizontal quiz strip.',
   'Educational Meta / YT', 'Full-width strip after comparison', insurer_vs_claimant],
  ['case_type_router', 'LP11', 'Case Type Router', 'medium', 'ROUTER',
   'Visitor picks the incident type; the page repaints its playbook and pre-fills the first quiz answer. Presentation only, never logic.',
   'FB / IG / YT segmented', 'Pre-filled card, 2x2, changeable', case_type_router],
  ['sixty_second_check', 'LP09', '60-Second Check', 'short', 'LIGHT',
   'Five sections, maximum whitespace, the biggest buttons in the library. Nothing else.',
   'IG / FB / simple email', 'Compact, centered under H1', sixty_second_check],
  ['answer_first', 'LP10', 'Answer First', 'short', 'LIGHT',
   'Conversational quiz card plus a four-item FAQ that answers objections before asking for anything.',
   'Email / warm / objection-heavy', 'Conversational card, opening', answer_first],
] as const

type GeneratedModule = {
  tokens: Record<string, string>
  html: string
  parts: string[]
  slotIds: string[]
  slots: LpSlot[]
  unsupported: LpUnsupportedRegion[]
}

export const PORTED_TEMPLATES: PortedTemplate[] = meta.map(
  ([slug, code, name, family, ground, blurb, channels, quiz, mod]) => {
    const m = mod as unknown as GeneratedModule
    return {
      slug, code, name, family: family as PortedTemplate['family'], ground, blurb, channels, quiz,
      tokens: m.tokens,
      html: m.html,
      parts: m.parts,
      slotIds: m.slotIds,
      slots: m.slots,
      unsupported: m.unsupported,
    }
  },
)

/** A ported template in the shape the slot composer takes. */
export const asSlotted = (t: PortedTemplate): LpSlottedTemplate => ({
  slug: t.slug,
  parts: t.parts,
  slotIds: t.slotIds,
  slots: t.slots,
  unsupported: t.unsupported,
})

export const PORTED_BY_SLUG: Record<string, PortedTemplate> =
  Object.fromEntries(PORTED_TEMPLATES.map((t) => [t.slug, t]))

export const isPortedTemplate = (id: unknown): boolean =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(PORTED_BY_SLUG, id)

/**
 * Every face the twelve are set in.
 *
 * Loaded with the same axes the references use. Archivo is a VARIABLE font
 * there and is requested with its width axis pinned to 100, because that is
 * what the handoff serves: a diff against the reference showed text measuring
 * about seven pixels narrow on a two-hundred-pixel span purely from requesting
 * the default axes instead, and every box downstream inherits that error.
 */
export const TEMPLATE_FONTS_HREF =
  'https://fonts.googleapis.com/css2' +
  '?family=Archivo:wdth,wght@100,400;100,500;100,600;100,700;100,800' +
  '&family=JetBrains+Mono:wght@400;500;600;700' +
  '&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400' +
  '&display=swap'
